<script setup lang="ts">
import { skillCheckList, skillCheckListDisplay, skillToModIndex } from '@renderer/model/DataType'
import { computed, nextTick, ref } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import { SurviveMemory, surviveMemory } from '@renderer/model/GlobalMemory'
import { d10, d20, dvalue, toMod } from '@renderer/utils'
import Creatures, { Creature } from '@renderer/model/Creature'
import BattleCharacterSidebar from '@renderer/components/BattleCharacterSidebar.vue'

type RollMode = SurviveMemory['rollMode']

interface DiceRollResult {
  total: number
  text: string
}

const DM_CODE = 'DM'
const abilityNames = ['力量', '敏捷', '体质', '智力', '感知', '魅力'] as const
const rollModeOptions: { value: RollMode; label: string }[] = [
  { value: 'dice', label: '单纯掷骰' },
  { value: 'check', label: '检定' },
  { value: 'save', label: '豁免' }
]

const thisCreatures = ref<Creature[]>(Creatures.value)
const memory = ref<SurviveMemory>(surviveMemory.value)
const initiativeCodes = ref<string[]>([])
const initiativeCopyState = ref<'idle' | 'copied' | 'failed'>('idle')

if (!memory.value.rollMode) {
  memory.value.rollMode = memory.value.isSave ? 'save' : 'check'
}
if (memory.value.abilityOverride == null) {
  memory.value.abilityOverride = ''
}

const selectedCodes = computed<string[]>(() => Array.from(memory.value.chosen))
const creatureByCodeMap = computed<Map<string, Creature>>(() => {
  const rows = new Map<string, Creature>()
  for (const creature of thisCreatures.value) {
    rows.set(creature.code(), creature)
  }
  return rows
})
const selectedSummary = computed<string>(() => {
  if (selectedCodes.value.length == 0) {
    return '无'
  }
  return selectedCodes.value.map((code) => actorLabel(code)).join('、')
})
const defaultAbilityLabel = computed<string>(() => defaultAbilityName(memory.value.checkSkill))
const checkActionLabel = computed<string>(() => (memory.value.rollMode == 'save' ? '豁免' : '检定'))
const selectedCreatureCodes = computed<string[]>(() =>
  selectedCodes.value.filter((code) => code != DM_CODE && creatureByCode(code) != null)
)
const initiativeActors = computed<Creature[]>(() =>
  initiativeCodes.value
    .map((code) => creatureByCode(code))
    .filter((creature): creature is Creature => creature != null)
)
const initiativeText = computed<string>(() =>
  initiativeActors.value
    .map((creature) => {
      const base = creature.initiative()
      const roll = creature.tempInitiative
      return `${creature.name()} (${creature.code()}) 的先攻：${base} + d10(${roll}) = ${base + roll}`
    })
    .join('\n')
)

function creatureByCode(code: string): Creature | undefined {
  return creatureByCodeMap.value.get(code)
}

function actorLabel(code: string): string {
  if (code == DM_CODE) {
    return 'DM（暗骰）'
  }
  const creature = creatureByCode(code)
  return creature ? `${creature.name()} (${creature.code()})` : code
}

function setRollMode(mode: RollMode): void {
  memory.value.rollMode = mode
  if (mode == 'check') {
    memory.value.isSave = 0
  } else if (mode == 'save') {
    memory.value.isSave = 1
  }
}

function toggleSelectedCode(code: string): void {
  const creature = code == DM_CODE ? undefined : creatureByCode(code)
  if (creature) {
    creature.shallowRefresh()
  } else if (code != DM_CODE) {
    return
  }

  if (memory.value.chooseMode) {
    memory.value.chosen.clear()
    memory.value.chosen.add(code)
  } else if (memory.value.chosen.has(code)) {
    memory.value.chosen.delete(code)
  } else {
    memory.value.chosen.add(code)
  }
}

function toggleSelectedCreatureByCode(code: string): void {
  toggleSelectedCode(code)
}

function toggleChooseMode(): void {
  memory.value.chooseMode = 1 - memory.value.chooseMode
  if (memory.value.chooseMode == 1 && memory.value.chosen.size > 1) {
    const firstCode = memory.value.chosen.values().next().value
    memory.value.chosen.clear()
    if (firstCode) {
      memory.value.chosen.add(firstCode)
    }
  }
}

function clearChosen(): void {
  memory.value.chosen.clear()
}

function selectFactions(factions: string[]): void {
  memory.value.chosen.clear()
  memory.value.chooseMode = 0
  for (const creature of thisCreatures.value) {
    if (factions.includes(creature.faction)) {
      memory.value.chosen.add(creature.code())
    }
  }
}

function toggleUseCustomAdvance(): void {
  memory.value.useCustomAdvance = 1 - memory.value.useCustomAdvance
}

function toggleUseCustomMin(): void {
  memory.value.useCustomMin = 1 - memory.value.useCustomMin
}

function eraseLogs(): void {
  memory.value.logs = ''
}

function copyLogToClipboard(): void {
  navigator.clipboard.writeText(memory.value.logs)
}

function appendLog(text: string): void {
  memory.value.logs += text.endsWith('\n') ? text : `${text}\n`
}

async function copyInitiativeResults(): Promise<void> {
  if (!initiativeText.value) return
  try {
    await navigator.clipboard.writeText(initiativeText.value)
    initiativeCopyState.value = 'copied'
  } catch {
    initiativeCopyState.value = 'failed'
  }
}

async function makeInitiative(): Promise<void> {
  initiativeCodes.value = [...selectedCreatureCodes.value]
  initiativeCopyState.value = 'idle'
  if (initiativeCodes.value.length == 0) {
    appendLog(memory.value.chosen.has(DM_CODE) ? 'DM 不参与先攻。' : '没有选定角色。')
    await scrollLogToBottom()
    return
  }

  for (const creature of initiativeActors.value) {
    creature.tempInitiative = d10()
  }
  appendLog(initiativeText.value)
  await copyInitiativeResults()
  await scrollLogToBottom()
}

async function scrollLogToBottom(): Promise<void> {
  const textarea = document.getElementById('survive-logs')
  if (textarea instanceof HTMLTextAreaElement) {
    await nextTick()
    textarea.scrollTop = textarea.scrollHeight
    textarea.focus()
  }
}

function rollDiceSequence(sequence: string): DiceRollResult | null {
  const tokens = sequence
    .replace(/[^\ddDpPnNmMyYlL+\- ]/g, '')
    .replace(/-/g, ' - ')
    .split(/[ +]/g)
    .map((s) => s.trim())
    .filter(Boolean)

  let sum = 0
  let sign = 1
  const parts: string[] = []

  for (let token of tokens) {
    if (token == '-') {
      sign = -1
      continue
    }

    const signText = sign < 0 ? '- ' : ''
    if (/^\d+[dD]\d+$/.test(token)) {
      const value = token.split(/[dD]/).map((v) => Number(v) || 1)
      let part = 0
      for (let i = 0; i < value[0]; i++) {
        part += dvalue(value[1])
      }
      sum += sign * part
      parts.push(`${signText}${value[0]}d${value[1]} (${part})`)
      sign = 1
    } else if (/^\d+[pPyY]\d+$/.test(token)) {
      const value = token.split(/[pPyY]/).map((v) => Number(v) || 1)
      let part = 0
      const resList: number[] = []
      for (let i = 0; i < value[0]; i++) {
        const res = dvalue(value[1])
        resList.push(res)
        part = Math.max(part, res)
      }
      sum += sign * part
      parts.push(`${signText}优势 ${value[0]}d${value[1]} (${part} = ${resList.join(', ')})`)
      sign = 1
    } else if (/^\d+[nNmMlL]\d+$/.test(token)) {
      const value = token.split(/[nNmMlL]/).map((v) => Number(v) || 1)
      let part = value[0] > 0 ? value[1] : 0
      const resList: number[] = []
      for (let i = 0; i < value[0]; i++) {
        const res = dvalue(value[1])
        resList.push(res)
        part = Math.min(part, res)
      }
      sum += sign * part
      parts.push(`${signText}劣势 ${value[0]}d${value[1]} (${part} = ${resList.join(', ')})`)
      sign = 1
    } else if (/^\d+$/.test(token)) {
      const value = Number(token)
      sum += sign * value
      parts.push(`${signText}${value}`)
      sign = 1
    }
  }

  if (parts.length == 0) {
    return null
  }
  return {
    total: sum,
    text: parts.join(' + ').replace(/\+ -/g, '-') + ` = ${sum}`
  }
}

async function makeCustomDiceroll(): Promise<void> {
  const codes = Array.from(memory.value.chosen)
  if (codes.length == 0) {
    appendLog('没有选定掷骰对象。')
    await scrollLogToBottom()
    return
  }

  for (const code of codes) {
    const roll = rollDiceSequence(memory.value.diceSequence)
    if (!roll) {
      appendLog('骰子指令为空或无法识别。')
      break
    }
    appendLog(`${actorLabel(code)}：${roll.text}`)
  }
  await scrollLogToBottom()
}

function isAbilityName(skill: string): boolean {
  return (abilityNames as readonly string[]).includes(skill)
}

function defaultAbilityName(skill: string): string {
  const index = skillToModIndex(skill)
  return index >= 0 ? abilityNames[index] : '默认'
}

function saveModifierByAbility(cur: Creature, ability: string): number {
  if (ability == '力量') return cur.strsave()
  if (ability == '敏捷') return cur.dexsave()
  if (ability == '体质') return cur.consave()
  if (ability == '智力') return cur.intsave()
  if (ability == '感知') return cur.wissave()
  if (ability == '魅力') return cur.chasave()
  return 0
}

function extraSkillBonus(cur: Creature, skill: string): number {
  return isAbilityName(skill) ? 0 : cur.skillModRaw(skill)
}

function currentRollTitle(mode: 'check' | 'save'): string {
  const actionName = mode == 'save' ? '豁免' : '检定'
  if (!memory.value.abilityOverride) {
    return `${memory.value.checkSkill}${actionName}`
  }
  const overrideName = mode == 'save' ? '豁免' : '调整值'
  return `${memory.value.checkSkill}${actionName}（使用${memory.value.abilityOverride}${overrideName}）`
}

function rollBonus(cur: Creature, mode: 'check' | 'save'): number {
  const skill = memory.value.checkSkill
  const abilityOverride = memory.value.abilityOverride
  if (!abilityOverride) {
    return mode == 'save' ? cur.skillSave(skill) : cur.skillMod(skill)
  }

  const abilityPart =
    mode == 'save'
      ? saveModifierByAbility(cur, abilityOverride)
      : cur.getModifierByName(abilityOverride)
  return abilityPart + extraSkillBonus(cur, skill)
}

function rollAdvance(cur: Creature, mode: 'check' | 'save'): number {
  if (!memory.value.useCustomAdvance) {
    return 0
  }
  const statusSkill = memory.value.abilityOverride || memory.value.checkSkill
  const statusAdvance =
    mode == 'save'
      ? cur.skillSaveAdvanceStatus(statusSkill)
      : cur.skillCheckAdvanceStatus(statusSkill)
  return cur.skillAdvance.get(memory.value.checkSkill) + statusAdvance
}

function advantageLabel(advance: number): string {
  if (advance > 0) {
    return `${advance > 1 ? `+${advance} ` : ''}优势`
  }
  return `${advance < -1 ? `${advance} ` : ''}劣势`
}

async function startCheck(): Promise<void> {
  const mode: 'check' | 'save' = memory.value.rollMode == 'save' ? 'save' : 'check'
  memory.value.isSave = mode == 'save' ? 1 : 0
  let rolled = false

  for (let code of Array.from(memory.value.chosen)) {
    if (code == DM_CODE) {
      continue
    }

    const cur = creatureByCode(code)
    if (!cur) {
      memory.value.chosen.delete(code)
      continue
    }

    rolled = true
    const title = currentRollTitle(mode)
    const advance = rollAdvance(cur, mode)

    if (advance != 0) {
      appendLog(
        `${cur.name()}要进行一次${title}，${cur.profile.pronoun}具有${advance > 1 || advance < -1 ? ' ' : ''}${advantageLabel(advance)}。`
      )
    }

    if (advance >= 99) {
      appendLog(`${cur.name()}自动通过了本次${title}。`)
      continue
    }
    if (advance <= -99) {
      appendLog(`${cur.name()}本次${title}自动失败。`)
      continue
    }

    let minRoll = cur.skillMin.get(memory.value.checkSkill)
    if (!memory.value.useCustomMin) {
      minRoll = 0
    }
    if (minRoll > 1) {
      appendLog(`${cur.name()}在${title}中至少掷出 ${minRoll}。`)
    }

    const diceCount = Math.abs(advance) + 1
    let successCount = 0
    let finalRoll = advance > 0 ? -1e9 : 1e9
    const prof = rollBonus(cur, mode) + memory.value.tempModifier

    for (let i = 0; i < diceCount; i++) {
      const rollNature = Math.min(20, Math.max(d20(), minRoll))
      const roll = rollNature + prof
      const success = (rollNature != 1 && roll >= memory.value.difficulty) || rollNature == 20
      if (success) {
        successCount += 1
      }
      finalRoll = advance > 0 ? Math.max(finalRoll, roll) : Math.min(finalRoll, roll)

      if (memory.value.difficulty > 0) {
        if (rollNature > 1 && rollNature < 20) {
          appendLog(
            `${cur.name()}${success ? '通过了' : '未能通过'}一次${title}：(${cur.name()}：${title})[${success ? '成功' : '失败'}]D20${toMod(prof)}=${roll}/${memory.value.difficulty}`
          )
        } else {
          appendLog(
            `${cur.name()}在一次${title}中获得大${rollNature > 1 ? '成功' : '失败'}：(${cur.name()}：${title})[${rollNature > 1 ? '大成功' : '大失败'}]D20${toMod(prof)}=${roll}/${memory.value.difficulty}`
          )
        }
      } else {
        appendLog(`(${cur.name()}：${title})D20${toMod(prof)}=${roll}`)
      }
    }

    if (advance != 0) {
      if (memory.value.difficulty > 0) {
        const successWithAdvantage =
          (successCount > 0 && advance > 0) || (successCount >= diceCount && advance < 0)
        appendLog(`${cur.name()}${successWithAdvantage ? '通过了' : '未能通过'}本次${title}。`)
      } else {
        appendLog(`最终结果：(${cur.name()}：${title})D20${toMod(prof)}=${finalRoll}`)
      }
    }
  }

  if (!rolled) {
    appendLog(memory.value.chosen.has(DM_CODE) ? 'DM 不参与检定或豁免。' : '没有选定角色。')
  }

  await scrollLogToBottom()
}

function skillCheckWheel(event: { preventDefault(): unknown; deltaY: number }): void {
  const index = skillCheckList.indexOf(memory.value.checkSkill)
  if (event.deltaY < 0) {
    memory.value.checkSkill = skillCheckList[Math.max(index - 1, 0)]
  } else if (event.deltaY > 0) {
    memory.value.checkSkill = skillCheckList[Math.min(index + 1, skillCheckList.length - 1)]
  }
  event.preventDefault()
}

for (const code of Array.from(memory.value.chosen)) {
  if (code != DM_CODE && !creatureByCode(code)) {
    memory.value.chosen.delete(code)
  }
}

for (const c of thisCreatures.value) {
  c.shallowRefresh()
}
</script>

<template>
  <div class="survive-panel">
    <BattleCharacterSidebar
      :on-change="toggleSelectedCreatureByCode"
      :selected-codes="selectedCodes"
      :show-vitals="false"
      collapsible
      include-dm
    />

    <div class="survive-content">
      <div class="survive-layout">
        <section class="survive-card control-card">
          <div class="mode-bar">
            <div class="mode-tabs">
              <button
                v-for="option in rollModeOptions"
                :key="option.value"
                type="button"
                class="mode-button"
                :class="{ active: memory.rollMode == option.value }"
                @click="setRollMode(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <button
              class="w3-button initiative-mode-action"
              type="button"
              :disabled="selectedCreatureCodes.length == 0"
              title="为当前选中的角色生成先攻并加入先攻排序"
              @click="makeInitiative"
            >
              生成先攻
            </button>
            <span class="selected-count">已选 {{ selectedCodes.length }}</span>
          </div>
          <div class="selected-summary">
            {{ selectedSummary }}
          </div>

          <div v-if="initiativeActors.length > 0" class="initiative-editor">
            <div class="initiative-editor-header">
              <strong>先攻调整</strong>
              <span>修改骰值后可重新复制</span>
              <button
                class="w3-button"
                type="button"
                :class="{ 'w3-green': initiativeCopyState == 'copied' }"
                @click="copyInitiativeResults"
              >
                {{ initiativeCopyState == 'copied' ? '结果已复制' : '复制先攻' }}
              </button>
            </div>
            <div class="initiative-editor-list">
              <div
                v-for="creature in initiativeActors"
                :key="creature.code()"
                class="initiative-editor-row"
              >
                <span class="initiative-actor-name">
                  {{ creature.name() }} <small>{{ creature.code() }}</small>
                </span>
                <span>基础 {{ creature.initiative() }}</span>
                <span>+</span>
                <vue-number-input
                  v-model="creature.tempInitiative"
                  size="small"
                  inline
                  center
                  controls
                  :min="1"
                  :max="10"
                  :step="1"
                  @change="initiativeCopyState = 'idle'"
                />
                <strong>= {{ creature.initiative() + creature.tempInitiative }}</strong>
              </div>
            </div>
            <div v-if="initiativeCopyState == 'failed'" class="initiative-copy-warning">
              自动复制失败，请调整后点击“复制先攻”重试。
            </div>
          </div>

          <div v-if="memory.rollMode == 'dice'" class="dice-controls">
            <label class="dice-input">
              <span>骰子指令</span>
              <input
                v-model="memory.diceSequence"
                class="w3-input w3-border"
                placeholder="4d6 + 1d20 - 5 + 2p20 - 3n20"
              />
            </label>
            <button
              class="w3-button w3-black primary-action"
              type="button"
              @click="makeCustomDiceroll"
            >
              掷骰
            </button>
          </div>

          <div v-else class="check-controls">
            <label class="panel-field">
              <span>难度 DC</span>
              <vue-number-input
                v-model="memory.difficulty"
                size="small"
                inline
                center
                controls
                :min="0"
                :step="1"
              />
            </label>

            <label class="panel-field skill-field">
              <span>项目</span>
              <select
                v-model="memory.checkSkill"
                class="w3-select w3-border"
                @wheel="skillCheckWheel"
              >
                <option
                  v-for="name in skillCheckListDisplay"
                  :key="name"
                  :value="name"
                  :disabled="name == '────'"
                >
                  {{ name }}
                </option>
              </select>
            </label>

            <label class="panel-field">
              <span>{{ memory.rollMode == 'save' ? '覆盖豁免' : '覆盖调整' }}</span>
              <select v-model="memory.abilityOverride" class="w3-select w3-border">
                <option value="">默认（{{ defaultAbilityLabel }}）</option>
                <option v-for="ability in abilityNames" :key="ability" :value="ability">
                  {{ ability }}
                </option>
              </select>
            </label>

            <label class="panel-field">
              <span>临时修正</span>
              <vue-number-input
                v-model="memory.tempModifier"
                size="small"
                inline
                center
                controls
                :step="1"
              />
            </label>

            <div class="check-options">
              <button
                class="w3-button"
                type="button"
                :class="{ 'w3-black': !memory.useCustomAdvance }"
                @click="toggleUseCustomAdvance"
              >
                {{ memory.useCustomAdvance ? '启用优劣势' : '禁用优劣势' }}
              </button>
              <button
                class="w3-button"
                type="button"
                :class="{ 'w3-black': !memory.useCustomMin }"
                @click="toggleUseCustomMin"
              >
                {{ memory.useCustomMin ? '启用保底值' : '禁用保底值' }}
              </button>
              <span
                v-if="memory.checkSkill == '专注' && memory.rollMode == 'check'"
                class="inline-note"
              >
                真的不是“专注豁免”吗？
              </span>
              <button class="w3-button w3-black primary-action" type="button" @click="startCheck">
                开始{{ checkActionLabel }}
              </button>
            </div>
          </div>
        </section>

        <section class="survive-card action-card">
          <button
            class="w3-button"
            type="button"
            :class="{ 'w3-black': memory.chooseMode }"
            @click="toggleChooseMode"
          >
            {{ memory.chooseMode ? '单选模式' : '多选模式' }}
          </button>
          <button class="w3-button" type="button" @click="selectFactions(['玩家'])">
            全选玩家
          </button>
          <button class="w3-button" type="button" @click="selectFactions(['玩家', '友方'])">
            玩家+友方
          </button>
          <button class="w3-button" type="button" @click="selectFactions(['敌方'])">
            全选敌方
          </button>
          <button class="w3-button" type="button" @click="clearChosen">清空选中</button>
        </section>

        <section class="survive-card log-card">
          <div class="log-header">
            <span>日志</span>
            <div class="log-actions">
              <button class="w3-button" type="button" @click="copyLogToClipboard">复制</button>
              <button class="w3-button w3-hover-red" type="button" @click="eraseLogs">清空</button>
            </div>
          </div>
          <textarea
            id="survive-logs"
            v-model="memory.logs"
            spellcheck="false"
            class="log-editor"
          ></textarea>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.survive-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  background: #f7f7f5;
  container-type: inline-size;
}

.survive-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 10px;
  box-sizing: border-box;
}

.survive-layout {
  min-width: 0;
  max-width: 980px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.survive-card {
  background: #fff;
  border: 1px solid #dcdcdc;
  border-radius: 6px;
  padding: 10px;
  box-sizing: border-box;
}

.mode-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mode-tabs {
  display: inline-flex;
  border: 1px solid #d4d4d4;
  border-radius: 5px;
  overflow: hidden;
  background: #f3f3f3;
}

.mode-button {
  border: 0;
  border-right: 1px solid #d4d4d4;
  background: transparent;
  color: #333;
  min-height: 30px;
  padding: 0 12px;
  cursor: pointer;
  white-space: nowrap;
}

.mode-button:last-child {
  border-right: 0;
}

.mode-button.active {
  background: #222;
  color: #fff;
}

.initiative-mode-action {
  min-height: 32px;
  padding: 5px 14px;
  border: 1px solid #b8c6d8;
  border-radius: 5px;
  background: #e8f0fe;
  color: #1f4f8a;
  font-weight: 650;
  white-space: nowrap;
}

.initiative-mode-action:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.selected-count {
  flex-shrink: 0;
  margin-left: auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eee;
  color: #333;
  font-size: 12px;
}

.selected-summary {
  margin-top: 8px;
  color: #555;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.initiative-editor {
  margin-top: 8px;
  overflow: hidden;
  border: 1px solid #d7dee8;
  border-radius: 5px;
  background: #f8fbff;
}

.initiative-editor-header {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid #d7dee8;
}

.initiative-editor-header > span {
  color: #667085;
  font-size: 11px;
}

.initiative-editor-header .w3-button {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 11px;
}

.initiative-editor-list {
  display: grid;
}

.initiative-editor-row {
  display: grid;
  grid-template-columns: minmax(9em, 1fr) auto auto minmax(8em, auto) minmax(4em, auto);
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  font-size: 12px;
}

.initiative-editor-row + .initiative-editor-row {
  border-top: 1px solid #e5eaf0;
}

.initiative-actor-name {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.initiative-actor-name small {
  color: #777;
  font-weight: 400;
}

.initiative-copy-warning {
  padding: 4px 8px;
  border-top: 1px solid #efdca4;
  background: #fff3cd;
  color: #8a5a00;
  font-size: 11px;
  text-align: center;
}

.dice-controls,
.check-controls {
  margin-top: 10px;
}

.dice-controls {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  gap: 8px;
  align-items: end;
}

.dice-input {
  min-width: 0;
  display: grid;
  gap: 4px;
  color: #333;
  font-size: 12px;
}

.dice-input .w3-input {
  width: 100%;
  min-width: 0;
}

.check-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  align-items: end;
}

.skill-field {
  min-width: min(220px, 100%);
}

.panel-field {
  min-width: 0;
}

.panel-field .w3-select,
.panel-field :deep(.vue-number-input) {
  width: 100%;
  min-width: 0;
}

.check-options {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.inline-note {
  color: #666;
  font-size: 12px;
}

.primary-action {
  margin-left: auto;
}

.action-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.log-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-header > span {
  font-weight: 600;
}

.log-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.log-editor {
  width: 100%;
  min-height: 220px;
  height: min(42vh, 32em);
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid #d4d4d4;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.45;
}

@container (max-width: 620px) {
  .mode-bar,
  .dice-controls {
    display: flex;
    flex-wrap: wrap;
  }

  .mode-tabs,
  .dice-input {
    width: 100%;
  }

  .primary-action {
    margin-left: 0;
  }
}
</style>
