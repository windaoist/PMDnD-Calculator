<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import Creatures from '@renderer/model/Creature'
import { showHP } from '@renderer/model/Damage'
import {
  battleMemory,
  battleMemoryStatus,
  damageCalc,
  statusCalc,
  toggleBattleStatusMemory,
  toolsMemory,
  ToolsMemory
} from '@renderer/model/GlobalMemory'

type OpenPanelFn = (
  component: string,
  id: string,
  title: string,
  params: Record<string, unknown>
) => void

const memory = ref<ToolsMemory>(toolsMemory.value)
const openPanel = inject<OpenPanelFn>('openPanel')
const settlementMessage = ref('')
const settlementText = ref<HTMLTextAreaElement | null>(null)
const copyStatus = ref('')

const attacker = computed(() =>
  Creatures.value.find((creature) => creature.code() == memory.value.improvisedAttackerCode)
)
const weaponCreature = computed(() =>
  Creatures.value.find((creature) => creature.code() == memory.value.improvisedWeaponCode)
)
const target = computed(() =>
  Creatures.value.find((creature) => creature.code() == memory.value.improvisedTargetCode)
)

const weightPower = computed(() =>
  Math.max(0, Math.floor(memory.value.gravity * Math.sqrt(Math.max(0, memory.value.dropWeight))))
)
const improvisedPower = computed(() =>
  Math.max(weightPower.value, Math.max(0, Math.floor(memory.value.dropPower)))
)
const fallPower = computed(() =>
  Math.max(0, Math.floor(dropCoef(memory.value.dropMeters) * weightPower.value))
)
// const landingAcrobaticsDC = computed(() => 10 + Math.floor(dropCoef(memory.value.dropMeters)))
const canKnockTargetBack = computed(() => {
  if (!target.value || memory.value.dropWeight < 20) return false
  return target.value.sizeAbility.weight <= memory.value.dropWeight * 2
})
const canKnockTargetProne = computed(() => {
  if (!target.value || memory.value.dropWeight < 20) return false
  return target.value.sizeAbility.weight <= memory.value.dropWeight
})

function dropCoef(height: number): number {
  return Math.max(Math.min(10, (height - 3) / 2), 0)
}

function importCreatureWeight(): void {
  if (weaponCreature.value) {
    // This is intentionally a one-time copy so the user can adjust the effective weight afterwards.
    memory.value.dropWeight = Math.max(0, weaponCreature.value.sizeAbility.weight)
  }
}

function prepareDamage(power: number, name: string): boolean {
  const defender = target.value
  if (!defender || power <= 0) {
    settlementMessage.value = defender ? '当前威力为 0，无法结算。' : '请先选择受攻击目标。'
    return false
  }
  defender.shallowRefresh()

  if (attacker.value) {
    const mem = battleMemory.value
    attacker.value.shallowRefresh()
    mem.attacker = attacker.value
    mem.defender = defender
    mem.attackType = 1
    mem.spellName = name
    mem.effect = power
    mem.spellType = '无属性'
    mem.spellAttack = '物攻'
    mem.spellMod = '力量'
    mem.damageType = '无属性'
    mem.damageDef = '物理'
    mem.damageAspect = '钝击'
    mem.damageDefense = '物防'
    mem.customPowerEnabled = 1
    mem.customPower = power
    mem.customPowerDamageType = '无属性'
    mem.customPowerDamageDef = '物理'
    mem.customPowerDamageAspect = '钝击'
    mem.customDamage = 0
    mem.damageMdfD = 0
    mem.diceroll = 10
    mem.dicerollD = 0
  } else {
    toggleBattleStatusMemory(
      defender.code(),
      0,
      name,
      power,
      '无属性',
      '物攻',
      '无加成',
      '无属性',
      '钝击',
      '物理',
      '物防'
    )
    battleMemoryStatus.value.customDamage = 0
  }
  settlementMessage.value = ''
  return true
}

function openDamageDetails(power: number, name: string): void {
  if (!prepareDamage(power, name)) return
  openPanel?.('BattlePanel', 'panel-battle', '伤害详细编辑', {})
}

async function copySettlementMessage(): Promise<void> {
  if (!settlementMessage.value) return
  try {
    await navigator.clipboard.writeText(settlementMessage.value)
    copyStatus.value = '已复制到剪贴板'
    return
  } catch {
    // Electron/older Chromium may reject the async clipboard API when focus changes.
  }

  const textArea = settlementText.value
  if (!textArea) {
    copyStatus.value = '复制失败，请手动选择文字复制'
    return
  }
  textArea.focus()
  textArea.select()
  textArea.setSelectionRange(0, textArea.value.length)
  copyStatus.value = document.execCommand('copy') ? '已复制到剪贴板' : '请按 Ctrl+C 复制'
}

async function settle(power: number, name: string): Promise<void> {
  if (!prepareDamage(power, name) || !target.value) return
  const defender = target.value
  const before = [defender.currentHP, defender.tempHP]
  const damage = attacker.value ? damageCalc() : statusCalc(false)
  defender.takeHP([-damage, 0])
  defender.shallowRefresh()
  settlementMessage.value = `${defender.name()}受到 ${damage} 点${name}伤害（HP ${showHP(before)} → ${showHP(
    [defender.currentHP, defender.tempHP]
  )}）。`
  await nextTick()
  await copySettlementMessage()
}
</script>

<template>
  <div class="panel-page fall-panel">
    <aside
      v-if="weaponCreature || canKnockTargetBack || canKnockTargetProne"
      class="check-notice shared-rule-notice"
    >
      <strong>规则提示</strong>
      <ul>
        <li v-if="weaponCreature">
          若该生物不自愿成为临时武器，攻击前需进行一次运动对抗检定；对方可选择运动、体操、力量豁免或敏捷豁免。攻击者失败则本次攻击失败。
        </li>
        <li v-if="weaponCreature">
          若被投掷者是攻击者的友方且自愿被投掷，可进行一次体操检定（DC
          15）。成功时只改变位置，不受到此次伤害，也不触发“高空抛物”效果。
        </li>
        <li v-if="weaponCreature">
          被投掷生物落地后需再进行一次体操检定（DC 10），失败则陷入倒地状态。
        </li>
        <li v-if="canKnockTargetBack">
          临时武器重量不少于 20kg，且目标体重不超过被投掷物的 2 倍；命中后目标会被击退最多 1.5m。
        </li>
        <li v-if="canKnockTargetProne">
          临时武器重量不少于 20kg，且目标体重不超过被投掷物；命中后目标会直接陷入倒地状态。
        </li>
      </ul>
    </aside>

    <section class="fall-section">
      <h3>临时武器攻击</h3>
      <div class="panel-field-grid">
        <label class="panel-field">
          <span class="panel-field-label">攻击者</span>
          <select v-model="memory.improvisedAttackerCode" class="w3-select w3-border">
            <option value="">无</option>
            <option v-for="creature in Creatures" :key="creature.code()" :value="creature.code()">
              {{ creature.name() }} {{ creature.code() }}
            </option>
          </select>
        </label>

        <label class="panel-field">
          <span class="panel-field-label">作为临时武器的物体</span>
          <select
            v-model="memory.improvisedWeaponCode"
            class="w3-select w3-border"
            @change="importCreatureWeight"
          >
            <option value="">无 / 自定义重量</option>
            <option v-for="creature in Creatures" :key="creature.code()" :value="creature.code()">
              {{ creature.name() }} {{ creature.code() }}
            </option>
          </select>
        </label>

        <label class="panel-field">
          <span class="panel-field-label">受攻击目标</span>
          <select v-model="memory.improvisedTargetCode" class="w3-select w3-border">
            <option value="">请选择</option>
            <option v-for="creature in Creatures" :key="creature.code()" :value="creature.code()">
              {{ creature.name() }} {{ creature.code() }}
            </option>
          </select>
        </label>

        <label class="panel-field">
          <span class="panel-field-label">临时武器重量</span>
          <span class="number-with-unit">
            <vue-number-input
              v-model="memory.dropWeight"
              size="medium"
              inline
              center
              controls
              :step="0.1"
              :min="0"
            />
            千克
          </span>
        </label>

        <label class="panel-field">
          <span class="panel-field-label">投掷武器原威力（没有则填 0）</span>
          <vue-number-input
            v-model="memory.dropPower"
            size="medium"
            inline
            center
            controls
            :step="1"
            :min="0"
          />
        </label>

        <div class="panel-field result-card">
          <span class="panel-field-label">临时武器攻击威力</span>
          <div class="panel-result">{{ improvisedPower }}</div>
          <small>重量威力 {{ weightPower }}；与投掷武器原威力取高并向下取整</small>
        </div>
      </div>
      <div class="fall-actions">
        <button class="w3-button w3-black" @click="settle(improvisedPower, '临时武器攻击')">
          直接结算
        </button>
        <button
          class="w3-button w3-light-gray"
          @click="openDamageDetails(improvisedPower, '临时武器攻击')"
        >
          转到详细伤害
        </button>
      </div>
    </section>

    <section class="fall-section">
      <h3>高空抛物</h3>
      <p class="fall-hint">重量、坠落者和受攻击目标沿用上方临时武器设置。</p>
      <div class="panel-field-grid fall-grid">
        <label class="panel-field">
          <span class="panel-field-label">坠落米数</span>
          <vue-number-input
            v-model="memory.dropMeters"
            size="medium"
            inline
            center
            controls
            :step="0.1"
            :min="0"
          />
        </label>
        <label class="panel-field">
          <span class="panel-field-label">重力加速度</span>
          <span class="number-with-unit">
            <vue-number-input
              v-model="memory.gravity"
              size="medium"
              inline
              center
              controls
              :step="0.1"
              :min="0"
            />
            m·s⁻²
          </span>
        </label>
        <div class="panel-field result-card">
          <span class="panel-field-label">坠落伤害威力</span>
          <div class="panel-result">{{ fallPower }}</div>
          <small
            >重量威力 {{ weightPower }} × 高空抛物系数
            {{ dropCoef(memory.dropMeters).toFixed(1) }}；忽略投掷武器原威力</small
          >
        </div>
      </div>
      <div class="fall-actions">
        <button class="w3-button w3-black" @click="settle(fallPower, '高空抛物')">直接结算</button>
        <button class="w3-button w3-light-gray" @click="openDamageDetails(fallPower, '高空抛物')">
          转到详细伤害
        </button>
      </div>
    </section>

    <div v-if="settlementMessage" class="settlement-message">
      <textarea ref="settlementText" :value="settlementMessage" readonly />
      <div class="copy-row">
        <button class="w3-button w3-small w3-border" type="button" @click="copySettlementMessage">
          复制结算文字
        </button>
        <span>{{ copyStatus }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fall-panel {
  overflow: auto;
  container-type: inline-size;
}

.fall-section {
  padding: 0.85em;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
}

.fall-section + .fall-section {
  margin-top: 1em;
}

.fall-section h3 {
  margin: 0 0 0.75em;
}

.fall-panel .panel-field-grid {
  grid-template-columns: repeat(3, minmax(180px, 1fr));
}

.fall-grid {
  align-items: stretch;
}

.panel-field select {
  width: 100%;
  min-height: 36px;
}

.number-with-unit {
  display: flex;
  align-items: center;
  gap: 0.45em;
}

.result-card small,
.fall-hint {
  color: #666;
  line-height: 1.45;
}

.check-notice {
  margin-top: 0.8em;
  padding: 0.65em 0.8em;
  border-left: 4px solid #d39b24;
  background: #fff8e7;
  color: #493a1d;
  font-size: 13px;
  line-height: 1.55;
}

.shared-rule-notice {
  margin: 0 0 1em;
}

.check-notice p,
.check-notice ul {
  margin: 0.35em 0 0;
}

.check-notice ul {
  padding-left: 1.4em;
}

.fall-hint {
  margin: -0.35em 0 0.75em;
}

.fall-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-top: 0.9em;
}

.settlement-message {
  margin: 1em 0 0;
  padding: 0.75em;
  border-left: 4px solid #2e7d32;
  background: #eef7ef;
}

.settlement-message textarea {
  display: block;
  width: 100%;
  min-height: 72px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid #b7cfba;
  background: #fff;
  padding: 0.55em;
  font: inherit;
  line-height: 1.5;
}

.copy-row {
  display: flex;
  align-items: center;
  gap: 0.65em;
  margin-top: 0.5em;
  color: #37633b;
  font-size: 13px;
}

@container (max-width: 760px) {
  .fall-panel .panel-field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
