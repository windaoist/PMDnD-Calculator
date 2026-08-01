<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import Creatures, { type Creature } from '@renderer/model/Creature'
import { mapMemory } from '@renderer/model/GlobalMemory'
import { sizeString } from '@renderer/model/DataType'
import { d20, toMod, valueToColor } from '@renderer/utils'
import { creatureTokenDistance } from '@renderer/model/CreatureDistance'

const targetDefenseOptions = [
  { key: 'athletics', label: '运动检定', skill: '运动', mode: 'check' },
  { key: 'acrobatics', label: '体操检定', skill: '体操', mode: 'check' },
  { key: 'str-save', label: '力量豁免', skill: '力量', mode: 'save' },
  { key: 'dex-save', label: '敏捷豁免', skill: '敏捷', mode: 'save' }
] as const

type TargetDefenseKey = (typeof targetDefenseOptions)[number]['key']
type ContestMode = 'start' | 'maintain'

interface RollResult {
  rolls: number[]
  natural: number
  bonus: number
  total: number
}

const creatures = ref<Creature[]>(Creatures.value)
const initialGrapplerCode = Creatures.value[0]?.code() ?? ''
const initialTargetCode =
  Creatures.value.find((creature) => creature.code() != initialGrapplerCode)?.code() ?? ''

const grapplerCode = ref(initialGrapplerCode)
const targetCode = ref(initialTargetCode)
const targetDefense = ref<TargetDefenseKey>('athletics')
const grapplerAdvantage = ref(0)
const targetAdvantage = ref(0)
const dragDistance = ref(6)
const lastMode = ref<ContestMode>('start')
const grapplerRoll = ref<RollResult | null>(null)
const targetRoll = ref<RollResult | null>(null)
const resultText = ref('')

const grappler = computed(() => creatureByCode(grapplerCode.value))
const target = computed(() => creatureByCode(targetCode.value))
const selectedDefenseOption = computed(
  () =>
    targetDefenseOptions.find((option) => option.key == targetDefense.value) ??
    targetDefenseOptions[0]
)

const grapplerAthletics = computed(() => (grappler.value ? grappler.value.skillMod('运动') : 0))
const targetDefenseBonus = computed(() => {
  const defender = target.value
  if (!defender) return 0
  const option = selectedDefenseOption.value
  return option.mode == 'save' ? defender.skillSave(option.skill) : defender.skillMod(option.skill)
})
const targetIncapacitated = computed(() => target.value?.grandStatus().incapacitated ?? false)

const sizeAllowed = computed(() => {
  if (!grappler.value || !target.value) return false
  return sizeRank(target.value.sizeAbility.size) <= sizeRank(grappler.value.sizeAbility.size) + 1
})
const weightAllowed = computed(() => {
  if (!grappler.value || !target.value) return false
  return target.value.sizeAbility.weight <= grappler.value.maxPickup()
})
const reachCheck = computed(() => {
  const attacker = grappler.value
  const defender = target.value
  if (!attacker || !defender) return null
  const attackerToken = mapMemory.value.tokens.find((token) => token.code == attacker.code())
  const defenderToken = mapMemory.value.tokens.find((token) => token.code == defender.code())
  if (!attackerToken || !defenderToken) return null
  const distance = creatureTokenDistance(attackerToken, attacker, defenderToken, defender)
  return {
    distance,
    ok: distance <= attacker.sizeAbility.reach
  }
})
const reachAllowed = computed(() => reachCheck.value?.ok ?? true)
const canAttemptGrapple = computed(
  () =>
    Boolean(grappler.value && target.value) &&
    sizeAllowed.value &&
    weightAllowed.value &&
    reachAllowed.value
)

const dragHasNoExtraCost = computed(() => {
  if (!grappler.value || !target.value) return false
  return (
    target.value.sizeAbility.size < 1 ||
    sizeRank(target.value.sizeAbility.size) <= sizeRank(grappler.value.sizeAbility.size) - 2
  )
})
const movementMultiplier = computed(() => (dragHasNoExtraCost.value ? 1 : 2))
const movementCost = computed(() => Math.max(0, dragDistance.value) * movementMultiplier.value)
const maxDraggedDistance = computed(() => {
  const mover = grappler.value
  if (!mover) return 0
  return mover.currentMov / movementMultiplier.value
})

watch(
  grappler,
  (creature) => {
    grapplerAdvantage.value = creature?.skillCheckAdvanceWithStatus('运动') ?? 0
  },
  { immediate: true }
)

watch(
  [target, targetDefense],
  ([creature]) => {
    if (!creature) {
      targetAdvantage.value = 0
      return
    }
    const option = selectedDefenseOption.value
    targetAdvantage.value =
      option.mode == 'save'
        ? creature.skillSaveAdvanceWithStatus(option.skill)
        : creature.skillCheckAdvanceWithStatus(option.skill)
  },
  { immediate: true }
)

function creatureByCode(code: string): Creature | undefined {
  return creatures.value.find((creature) => creature.code() == code)
}

function sizeRank(footprint: number): number {
  if (footprint < 1) return 0
  if (footprint < 2) return 1
  return Math.max(2, Math.floor(footprint))
}

function rollWithAdvantage(advantage: number, bonus: number): RollResult {
  const count = 1 + Math.abs(Math.trunc(advantage))
  const rolls = Array.from({ length: count }, () => d20())
  const natural = advantage > 0 ? Math.max(...rolls) : advantage < 0 ? Math.min(...rolls) : rolls[0]
  return {
    rolls,
    natural,
    bonus,
    total: natural + bonus
  }
}

function rollSummary(result: RollResult | null): string {
  if (!result) return '-'
  return `D20${toMod(result.bonus)} = ${result.total}（骰 ${result.rolls.join(' / ')}，取 ${result.natural}）`
}

function rollContest(mode: ContestMode): void {
  lastMode.value = mode
  grapplerRoll.value = null
  targetRoll.value = null
  resultText.value = ''
  const attacker = grappler.value
  const defender = target.value
  if (!attacker || !defender) {
    resultText.value = '请选择擒抱者和目标。'
    return
  }
  if (!canAttemptGrapple.value) {
    resultText.value = '目标不满足体型、重量或触及范围限制，不能发动这次擒抱。'
    return
  }
  if (targetIncapacitated.value) {
    resultText.value =
      mode == 'start'
        ? `${defender.name()}处于失能状态，${attacker.name()}的擒抱检定直接成功。`
        : `${defender.name()}处于失能状态，不会挣脱擒抱。`
    return
  }

  const attackerRoll = rollWithAdvantage(grapplerAdvantage.value, grapplerAthletics.value)
  const defenderRoll = rollWithAdvantage(targetAdvantage.value, targetDefenseBonus.value)
  grapplerRoll.value = attackerRoll
  targetRoll.value = defenderRoll

  if (mode == 'start') {
    const success = attackerRoll.total > defenderRoll.total
    resultText.value = success
      ? `${attacker.name()}擒抱成功，${defender.name()}陷入擒抱状态。`
      : `${attacker.name()}擒抱失败，这次攻击失败。`
  } else {
    const maintained = attackerRoll.total >= defenderRoll.total
    resultText.value = maintained
      ? `${attacker.name()}维持了对${defender.name()}的擒抱。`
      : `${attacker.name()}在对抗检定中失败，${defender.name()}的擒抱状态结束。`
  }
}

function outcomeColor(): string {
  if (!resultText.value) return '#555'
  if (
    resultText.value.includes('成功') ||
    resultText.value.includes('维持') ||
    resultText.value.includes('不会挣脱')
  ) {
    return '#2e7d32'
  }
  if (resultText.value.includes('失败') || resultText.value.includes('不能')) return '#c62828'
  return '#555'
}
</script>

<template>
  <div class="grapple-panel">
    <section class="tool-section">
      <h3>擒抱</h3>
      <div class="control-grid">
        <label>
          <span>擒抱者</span>
          <select v-model="grapplerCode" class="w3-select w3-border">
            <option value="">未选择</option>
            <option v-for="creature in creatures" :key="creature.code()" :value="creature.code()">
              {{ creature.name() }}（{{ creature.code() }}）
            </option>
          </select>
        </label>
        <label>
          <span>目标</span>
          <select v-model="targetCode" class="w3-select w3-border">
            <option value="">未选择</option>
            <option v-for="creature in creatures" :key="creature.code()" :value="creature.code()">
              {{ creature.name() }}（{{ creature.code() }}）
            </option>
          </select>
        </label>
        <label>
          <span>目标反抗方式</span>
          <select v-model="targetDefense" class="w3-select w3-border">
            <option v-for="option in targetDefenseOptions" :key="option.key" :value="option.key">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <section class="tool-section">
      <h4>限制</h4>
      <div class="rule-grid">
        <div :class="{ bad: !sizeAllowed, good: sizeAllowed }">
          <strong>体型</strong>
          <span v-if="grappler && target">
            {{ sizeString(grappler.sizeAbility.size) }} vs {{ sizeString(target.sizeAbility.size) }}
          </span>
          <span>{{ sizeAllowed ? '允许' : '目标体型过大' }}</span>
        </div>
        <div :class="{ bad: !weightAllowed, good: weightAllowed }">
          <strong>重量</strong>
          <span v-if="grappler && target">
            {{ target.sizeAbility.weight.toFixed(1) }} / {{ grappler.maxPickup().toFixed(1) }} kg
          </span>
          <span>{{ weightAllowed ? '允许' : '超过最大拾起重量' }}</span>
        </div>
        <div :class="{ bad: !reachAllowed, good: reachAllowed }">
          <strong>触及</strong>
          <span v-if="grappler">触及 {{ grappler.sizeAbility.reach }} m</span>
          <span v-if="reachCheck">
            角色距离 {{ reachCheck.distance.toFixed(2) }} m，{{
              reachCheck.ok ? '在范围内' : '超出范围'
            }}
          </span>
          <span v-else>未找到双方 token，请手动确认</span>
        </div>
      </div>
    </section>

    <section class="tool-section">
      <h4>对抗检定</h4>
      <div class="contest-grid">
        <div>
          <span>擒抱者运动</span>
          <strong :style="{ color: valueToColor(-grapplerAthletics) }">
            {{ toMod(grapplerAthletics) }}
          </strong>
          <span>优劣势</span>
          <vue-number-input
            v-model="grapplerAdvantage"
            size="small"
            inline
            center
            controls
            :step="1"
          />
        </div>
        <div>
          <span>目标 {{ selectedDefenseOption.label }}</span>
          <strong :style="{ color: valueToColor(-targetDefenseBonus) }">
            {{ toMod(targetDefenseBonus) }}
          </strong>
          <span>优劣势</span>
          <vue-number-input
            v-model="targetAdvantage"
            size="small"
            inline
            center
            controls
            :step="1"
          />
        </div>
      </div>
      <div class="action-row">
        <button class="w3-button w3-red" @click="rollContest('start')">尝试擒抱</button>
        <button class="w3-button w3-light-gray" @click="rollContest('maintain')">
          维持/挣脱检定
        </button>
      </div>
      <div class="result-box">
        <div>
          <strong>{{ lastMode == 'start' ? '擒抱者' : '擒抱者维持' }}</strong>
          <span>{{ rollSummary(grapplerRoll) }}</span>
        </div>
        <div>
          <strong>目标</strong>
          <span>{{ targetIncapacitated ? '失能，直接成功' : rollSummary(targetRoll) }}</span>
        </div>
        <p :style="{ color: outcomeColor() }">{{ resultText || '尚未掷骰。' }}</p>
      </div>
    </section>

    <section class="tool-section">
      <h4>擒抱期间移动</h4>
      <div class="movement-grid">
        <div>
          <span>移动距离</span>
          <vue-number-input
            v-model="dragDistance"
            size="small"
            inline
            center
            controls
            :step="0.5"
            :min="0"
          />
          <span>m</span>
        </div>
        <div>
          <span>移动力消耗</span>
          <strong>{{ movementCost.toFixed(1) }} m</strong>
        </div>
        <div>
          <span>当前移动力最多拖拽</span>
          <strong>{{ maxDraggedDistance.toFixed(1) }} m</strong>
        </div>
      </div>
      <p class="hint">
        {{
          dragHasNoExtraCost
            ? '目标为微型，或比擒抱者小至少两级：拖拽或承载不增加移动力消耗。'
            : '拖拽或承载目标时移动力消耗增加 1 倍。'
        }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.grapple-panel {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 0.75em;
  font-size: 14px;
}

.tool-section {
  margin-bottom: 0.85em;
  padding-bottom: 0.75em;
  border-bottom: 1px solid #e5e5e5;
}

.tool-section h3,
.tool-section h4 {
  margin: 0 0 0.55em;
}

.control-grid,
.rule-grid,
.contest-grid,
.movement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.55em;
}

.control-grid label,
.rule-grid > div,
.contest-grid > div,
.movement-grid > div {
  display: grid;
  gap: 0.25em;
  min-width: 0;
}

.rule-grid > div,
.contest-grid > div,
.movement-grid > div,
.result-box {
  border: 1px solid #ddd;
  padding: 0.55em;
  background: #fafafa;
}

.rule-grid .good {
  border-color: rgba(46, 125, 50, 0.35);
}

.rule-grid .bad {
  border-color: rgba(198, 40, 40, 0.45);
  background: #fff7f7;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em;
  margin-top: 0.65em;
}

.result-box {
  display: grid;
  gap: 0.35em;
  margin-top: 0.65em;
}

.result-box > div,
.movement-grid > div {
  align-items: baseline;
}

.result-box p,
.hint {
  margin: 0;
}

.hint {
  margin-top: 0.55em;
  color: #555;
}
</style>
