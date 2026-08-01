<script setup lang="ts">
import { toolsMemory, ToolsMemory } from '@renderer/model/GlobalMemory'
import { ref, computed, watch } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'

const memory = ref<ToolsMemory>(toolsMemory.value)

const STAT_NAMES = ['HP', '物攻', '物防', '特攻', '特防', '速度']
const REDIST_ORDER = [0, 1, 3, 2, 4, 5]

interface RaceResult {
  bValues: number[]
  base: number
  cValues: number[]
  sumC: number
  dRaw: number[]
  dClipped: number[]
  dFinal: number[]
  total: number
  stdDev: number
}

function normalizeRaceStats(stats: number[]): RaceResult {
  const sumA = stats.reduce((s, v) => s + v, 0)
  const bValues = sumA === 0 ? stats.map(() => 0) : stats.map((v) => (v * 600) / sumA)
  const meanB = bValues.reduce((s, v) => s + v, 0) / 6
  const variance = bValues.reduce((s, v) => s + (v - meanB) ** 2, 0) / 6
  const stdDev = Math.sqrt(variance)
  const base = Math.floor(90 - Math.min(15, Math.pow(stdDev, 0.7)))
  const minB = Math.min(...bValues)
  const cValues = bValues.map((v) => v - minB)
  const realSumC = cValues.reduce((s, v) => s + v, 0)
  const sumC = Math.max(1e-10, realSumC)
  if (realSumC === 0) {
    const dFinal = bValues.map(() => 100)
    return {
      bValues,
      base,
      cValues,
      sumC: 0,
      dRaw: dFinal,
      dClipped: dFinal,
      dFinal,
      total: 600,
      stdDev: 0
    }
  }
  const remaining = 600 - base * 6
  const dRaw: number[] = new Array(6)
  for (let i = 1; i < 6; i++) {
    dRaw[i] = Math.floor(base + (remaining * cValues[i]) / sumC)
  }
  dRaw[0] = 600 - dRaw.slice(1).reduce((s, v) => s + v, 0)
  const dClipped = dRaw.map((v) => Math.min(v, 150))
  let truncRemoved = dRaw.reduce((s, v) => s + Math.max(0, v - 150), 0)
  const dFinal = [...dClipped]
  let total = dFinal.reduce((s, v) => s + v, 0)
  while (total < 600 && truncRemoved > 0) {
    let added = false
    for (const idx of REDIST_ORDER) {
      if (total >= 600) break
      if (dFinal[idx] < 150) {
        dFinal[idx]++
        total++
        truncRemoved--
        added = true
      }
    }
    if (!added) break
  }
  return { bValues, base, cValues, sumC, dRaw, dClipped, dFinal, total, stdDev }
}

const normalized = computed(() => normalizeRaceStats(memory.value.raceStats))
const pasteInput = ref('')

function normalizeExceptionIndex(value: unknown): number {
  const index = Math.floor(Number(value))
  return index >= 1 && index < STAT_NAMES.length ? index : -1
}

function ensureSelfAdjustmentState(): void {
  const stored = Array.isArray(memory.value.raceStatAdjustments)
    ? memory.value.raceStatAdjustments
    : []
  memory.value.raceStatAdjustments = Array.from({ length: 6 }, (_, index) => {
    const value = Math.round(Number(stored[index]))
    return Number.isFinite(value) ? value : 0
  })
  memory.value.raceStatAttackSwap = Boolean(memory.value.raceStatAttackSwap)
  memory.value.raceStatDefenseSwap = Boolean(memory.value.raceStatDefenseSwap)
  memory.value.raceStatUpperException = normalizeExceptionIndex(memory.value.raceStatUpperException)
  memory.value.raceStatLowerException = normalizeExceptionIndex(memory.value.raceStatLowerException)
  if (memory.value.raceStatUpperException == memory.value.raceStatLowerException) {
    memory.value.raceStatLowerException = -1
  }
}

ensureSelfAdjustmentState()

const selfAdjustmentBase = computed<number[]>(() => {
  const values = [...normalized.value.dFinal]
  if (memory.value.raceStatAttackSwap) {
    const physicalAttack = values[1]
    values[1] = values[3]
    values[3] = physicalAttack
  }
  if (memory.value.raceStatDefenseSwap) {
    const physicalDefense = values[2]
    values[2] = values[4]
    values[4] = physicalDefense
  }
  return values
})

function adjustmentLimits(index: number): { min: number; max: number } {
  const base = selfAdjustmentBase.value[index] ?? 100
  const min = memory.value.raceStatLowerException == index ? 75 - base : Math.max(-25, 75 - base)
  const max = memory.value.raceStatUpperException == index ? 150 - base : Math.min(25, 150 - base)
  return { min, max }
}

function clampSelfAdjustments(): void {
  for (let index = 0; index < STAT_NAMES.length; index++) {
    const limits = adjustmentLimits(index)
    const raw = Math.round(Number(memory.value.raceStatAdjustments[index]))
    const value = Number.isFinite(raw) ? raw : 0
    const clamped = Math.min(limits.max, Math.max(limits.min, value))
    if (memory.value.raceStatAdjustments[index] != clamped) {
      memory.value.raceStatAdjustments[index] = clamped
    }
  }
}

watch(
  () => [
    selfAdjustmentBase.value.join(','),
    memory.value.raceStatUpperException,
    memory.value.raceStatLowerException,
    ...memory.value.raceStatAdjustments
  ],
  clampSelfAdjustments,
  { immediate: true }
)

const selfAdjustmentFinal = computed(() =>
  selfAdjustmentBase.value.map(
    (value, index) => value + (memory.value.raceStatAdjustments[index] ?? 0)
  )
)
const selfAdjustmentTotal = computed(() =>
  selfAdjustmentFinal.value.reduce((sum, value) => sum + value, 0)
)
const selfAdjustmentDelta = computed(() =>
  memory.value.raceStatAdjustments.reduce((sum, value) => sum + value, 0)
)
const selfAdjustmentIssues = computed<string[]>(() => {
  const issues: string[] = []
  const totalDifference = 600 - selfAdjustmentTotal.value
  if (totalDifference > 0) issues.push(`还需分配 ${totalDifference} 点`)
  if (totalDifference < 0) issues.push(`还需收回 ${Math.abs(totalDifference)} 点`)
  selfAdjustmentFinal.value.forEach((value, index) => {
    if (value < 75 || value > 150) {
      issues.push(`${STAT_NAMES[index]}必须在 75 到 150 之间`)
    }
    const limits = adjustmentLimits(index)
    const adjustment = memory.value.raceStatAdjustments[index] ?? 0
    if (adjustment < limits.min || adjustment > limits.max) {
      issues.push(`${STAT_NAMES[index]}的调整超出允许范围`)
    }
  })
  if (
    memory.value.raceStatUpperException >= 0 &&
    memory.value.raceStatUpperException == memory.value.raceStatLowerException
  ) {
    issues.push('突破提升和突破降低必须选择不同项目')
  }
  return issues
})
const selfAdjustmentValid = computed(() => selfAdjustmentIssues.value.length == 0)

function setException(kind: 'upper' | 'lower', event: Event): void {
  const index = normalizeExceptionIndex((event.target as HTMLSelectElement).value)
  if (kind == 'upper') {
    memory.value.raceStatUpperException = index
    if (index == memory.value.raceStatLowerException) {
      memory.value.raceStatLowerException = -1
    }
  } else {
    memory.value.raceStatLowerException = index
    if (index == memory.value.raceStatUpperException) {
      memory.value.raceStatUpperException = -1
    }
  }
  clampSelfAdjustments()
}

function resetSelfAdjustment(): void {
  memory.value.raceStatAdjustments = [0, 0, 0, 0, 0, 0]
  memory.value.raceStatAttackSwap = false
  memory.value.raceStatDefenseSwap = false
  memory.value.raceStatUpperException = -1
  memory.value.raceStatLowerException = -1
}

function signedValue(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

function adjustmentRangeText(index: number): string {
  const limits = adjustmentLimits(index)
  return `${signedValue(limits.min)}…${signedValue(limits.max)}`
}

function applyPaste(): void {
  const nums = pasteInput.value.match(/\d+/g)
  if (!nums || nums.length < 6) return
  for (let i = 0; i < 6; i++) {
    memory.value.raceStats[i] = parseInt(nums[i]) || 0
  }
  pasteInput.value = ''
}
</script>

<template>
  <div class="panel-page">
    <p class="panel-note">输入六项种族值（≥0），自动缩放至总和 600，每项限制在 75 ~ 150。</p>
    <div class="panel-toolbar">
      <span>快速粘贴</span>
      <input
        v-model="pasteInput"
        placeholder="例：108 130 95 80 85 102"
        class="w3-input w3-border paste-input"
        @keyup.enter="applyPaste"
      />
      <button class="w3-button w3-light-gray" @click="applyPaste">填入</button>
    </div>
    <div class="table-wrap">
      <table class="w3-table-all w3-centered dense-table">
        <thead>
          <tr>
            <th></th>
            <th v-for="(name, idx) in STAT_NAMES" :key="idx">{{ name }}</th>
            <th>总和</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>原始种族值</td>
            <td v-for="(_, idx) in STAT_NAMES" :key="idx">
              <vue-number-input
                v-model="memory.raceStats[idx]"
                size="small"
                inline
                center
                :min="0"
                :step="1"
              />
            </td>
            <td>{{ memory.raceStats.reduce((s, v) => s + v, 0) }}</td>
          </tr>
          <tr>
            <td>缩放</td>
            <td v-for="(_, idx) in STAT_NAMES" :key="idx">
              {{ normalized.bValues[idx].toFixed(2) }}
            </td>
            <td>{{ normalized.bValues.reduce((s, v) => s + v, 0).toFixed(1) }}</td>
          </tr>
          <tr>
            <td>底差</td>
            <td v-for="(_, idx) in STAT_NAMES" :key="idx">
              {{ normalized.cValues[idx].toFixed(2) }}
            </td>
            <td>{{ normalized.sumC.toFixed(2) }}</td>
          </tr>
          <tr>
            <td>预分配</td>
            <td
              v-for="(_, idx) in STAT_NAMES"
              :key="idx"
              :style="{ color: normalized.dRaw[idx] > 150 ? 'crimson' : 'inherit' }"
            >
              {{ normalized.dRaw[idx] }}
            </td>
            <td>{{ normalized.dRaw.reduce((s, v) => s + v, 0) }}</td>
          </tr>
          <tr style="font-weight: bold">
            <td>最终结果</td>
            <td
              v-for="(_, idx) in STAT_NAMES"
              :key="idx"
              :style="{
                color:
                  normalized.dFinal[idx] === 150
                    ? 'dodgerblue'
                    : normalized.dFinal[idx] <= 75
                      ? 'crimson'
                      : 'inherit'
              }"
            >
              {{ normalized.dFinal[idx] }}
            </td>
            <td>{{ normalized.total }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      标准差 = {{ normalized.stdDev.toFixed(2) }}，基准值 = {{ normalized.base }}，剩余点数 =
      {{ 600 - normalized.base * 6 }}
    </p>

    <section class="self-adjustment-section">
      <div class="self-adjustment-header">
        <div>
          <h3>自助调整</h3>
          <p class="panel-note">PP 种族值固定为 4，不计入下方六项总和。</p>
        </div>
        <div class="self-adjustment-header-actions">
          <span class="pp-value">PP 4</span>
          <button class="w3-button w3-border" type="button" @click="resetSelfAdjustment">
            重置
          </button>
        </div>
      </div>

      <div class="self-adjustment-controls">
        <div class="swap-controls">
          <span class="control-label">交换</span>
          <button
            type="button"
            class="w3-button w3-border swap-button"
            :class="{ active: memory.raceStatAttackSwap }"
            @click="memory.raceStatAttackSwap = !memory.raceStatAttackSwap"
          >
            物攻 / 特攻
          </button>
          <button
            type="button"
            class="w3-button w3-border swap-button"
            :class="{ active: memory.raceStatDefenseSwap }"
            @click="memory.raceStatDefenseSwap = !memory.raceStatDefenseSwap"
          >
            物防 / 特防
          </button>
        </div>

        <label class="exception-control">
          <span>突破提升</span>
          <select
            class="w3-select w3-border"
            :value="memory.raceStatUpperException"
            @change="setException('upper', $event)"
          >
            <option :value="-1">不使用</option>
            <option
              v-for="(_, index) in STAT_NAMES.slice(1)"
              :key="index + 1"
              :value="index + 1"
              :disabled="memory.raceStatLowerException == index + 1"
            >
              {{ STAT_NAMES[index + 1] }}
            </option>
          </select>
        </label>

        <label class="exception-control">
          <span>突破降低</span>
          <select
            class="w3-select w3-border"
            :value="memory.raceStatLowerException"
            @change="setException('lower', $event)"
          >
            <option :value="-1">不使用</option>
            <option
              v-for="(_, index) in STAT_NAMES.slice(1)"
              :key="index + 1"
              :value="index + 1"
              :disabled="memory.raceStatUpperException == index + 1"
            >
              {{ STAT_NAMES[index + 1] }}
            </option>
          </select>
        </label>
      </div>

      <div class="table-wrap">
        <table class="w3-table-all w3-centered dense-table self-adjustment-table">
          <thead>
            <tr>
              <th></th>
              <th v-for="(name, index) in STAT_NAMES" :key="name">
                <span>{{ name }}</span>
                <small v-if="memory.raceStatUpperException == index">突破提升</small>
                <small v-if="memory.raceStatLowerException == index">突破降低</small>
              </th>
              <th>总和</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>交换后基准</td>
              <td v-for="(value, index) in selfAdjustmentBase" :key="index">{{ value }}</td>
              <td>{{ selfAdjustmentBase.reduce((sum, value) => sum + value, 0) }}</td>
            </tr>
            <tr>
              <td>调整</td>
              <td v-for="(_, index) in STAT_NAMES" :key="index">
                <div class="adjustment-input">
                  <vue-number-input
                    v-model="memory.raceStatAdjustments[index]"
                    size="small"
                    inline
                    center
                    controls
                    :min="adjustmentLimits(index).min"
                    :max="adjustmentLimits(index).max"
                    :step="1"
                    :title="`${STAT_NAMES[index]}允许范围 ${adjustmentRangeText(index)}`"
                  />
                  <small>{{ adjustmentRangeText(index) }}</small>
                </div>
              </td>
              <td :class="{ 'invalid-value': selfAdjustmentDelta != 0 }">
                {{ signedValue(selfAdjustmentDelta) }}
              </td>
            </tr>
            <tr class="self-adjustment-result-row">
              <td>最终种族值</td>
              <td
                v-for="(value, index) in selfAdjustmentFinal"
                :key="index"
                :class="{
                  'boundary-high': value == 150,
                  'boundary-low': value == 75
                }"
              >
                {{ value }}
              </td>
              <td :class="{ 'invalid-value': selfAdjustmentTotal != 600 }">
                {{ selfAdjustmentTotal }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        class="self-adjustment-validation"
        :class="{ valid: selfAdjustmentValid, invalid: !selfAdjustmentValid }"
      >
        <strong>{{ selfAdjustmentValid ? '调整有效' : '调整尚未完成' }}</strong>
        <span v-if="selfAdjustmentIssues.length > 0">
          {{ selfAdjustmentIssues.join('；') }}
        </span>
        <span v-else>六项总和为 600，且所有项目均符合范围。</span>
      </div>
    </section>

    <div class="race-explainer">
      <p><b>流程说明：</b></p>
      <ol>
        <li><b>输入 A：</b>输入六项原始种族值（≥0 的整数）。</li>
        <li>
          <b>等比缩放 B：</b>将 A 按比例缩放，使六项总和恰好为 600（全为 0 则跳过）。同时计算 B
          的总体标准差 σ。
        </li>
        <li>
          <b>基准值：</b>根据 σ 动态计算基准值 = ⌊90 − min(15,
          σ<sup>0.7</sup>)⌋。差异越大，基准值越低（最低 75）。
        </li>
        <li>
          <b>底差值 C：</b>计算 C<sub>x</sub> = B<sub>x</sub> − min(B)。C
          表示各项相对于最低项的超出幅度。
        </li>
        <li>
          <b>预分配 D：</b>将剩余点数（600 − 基准值 × 6）按 C<sub>x</sub> / ΣC 的比例分配。除 HP
          外的五项取 FLOOR，HP 直接由 600 减去其余五项得出。
        </li>
        <li>
          <b>截断与补偿：</b>将 D 中超过 150 的项截断为 150，截断减少的点数按 HP → 物攻 → 特攻 →
          物防 → 特防 → 速度的顺序，轮询分配给不足 150 的项，直至总和达到 600。
        </li>
      </ol>
      <p>
        <b
          >种族值只需要在从主系列迁移到 PMDnD
          时标准化一次。已经标准化的种族值再次标准化会出现不同的结果。</b
        >
      </p>
    </div>
  </div>
</template>

<style scoped>
.panel-page {
  container-type: inline-size;
}

.paste-input {
  flex: 1 1 220px;
  width: auto;
  min-width: 0;
}

.self-adjustment-section {
  margin-top: 1.1em;
  padding-top: 1em;
  border-top: 1px solid #d7d7d7;
}

.self-adjustment-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1em;
  margin-bottom: 0.75em;
}

.self-adjustment-header h3,
.self-adjustment-header p {
  margin: 0;
}

.self-adjustment-header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.5em;
}

.pp-value {
  padding: 0.4em 0.7em;
  border: 1px solid #8fa8c8;
  border-radius: 4px;
  background: #edf4fc;
  color: #214f82;
  font-weight: 700;
  white-space: nowrap;
}

.self-adjustment-controls {
  display: grid;
  grid-template-columns: minmax(250px, 1fr) repeat(2, minmax(150px, 0.55fr));
  gap: 0.65em;
  align-items: end;
  margin-bottom: 0.75em;
}

.swap-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45em;
}

.control-label,
.exception-control > span {
  color: #555;
  font-size: 12px;
  font-weight: 600;
}

.swap-button {
  min-height: 34px;
}

.swap-button.active {
  border-color: #2f5f9f !important;
  background: #2f5f9f !important;
  color: #fff !important;
}

.exception-control {
  display: grid;
  gap: 0.25em;
  min-width: 0;
}

.exception-control select {
  min-height: 34px;
}

.self-adjustment-table {
  min-width: 940px;
}

.self-adjustment-table th small {
  display: block;
  color: #8a4b00;
  font-size: 10px;
  font-weight: 600;
}

.adjustment-input {
  display: grid;
  justify-items: center;
  gap: 2px;
}

.adjustment-input
  :deep(.vue-number-input--small.vue-number-input--inline.vue-number-input--controls) {
  width: 8rem;
  min-width: 8rem;
}

.adjustment-input
  :deep(.vue-number-input--small.vue-number-input--inline.vue-number-input--controls > input) {
  min-width: 4rem;
}

.adjustment-input small {
  color: #777;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.self-adjustment-result-row {
  font-weight: 700;
}

.boundary-high {
  color: #1565c0;
}

.boundary-low {
  color: #c62828;
}

.invalid-value {
  color: #c62828;
  font-weight: 700;
}

.self-adjustment-validation {
  display: flex;
  align-items: baseline;
  gap: 0.65em;
  margin-top: 0.65em;
  padding: 0.55em 0.7em;
  border-left: 4px solid;
  line-height: 1.45;
}

.self-adjustment-validation.valid {
  border-color: #2e7d32;
  background: #edf7ee;
  color: #1f5d23;
}

.self-adjustment-validation.invalid {
  border-color: #c62828;
  background: #fff1f0;
  color: #8e1d1d;
}

.race-explainer {
  max-width: 55em;
  margin-top: 1em;
  color: #555;
  font-size: small;
  line-height: 1.8;
}

@container (max-width: 720px) {
  .self-adjustment-controls {
    grid-template-columns: 1fr 1fr;
  }

  .swap-controls {
    grid-column: 1 / -1;
  }
}

@container (max-width: 480px) {
  .self-adjustment-header {
    align-items: stretch;
    flex-direction: column;
  }

  .self-adjustment-controls {
    grid-template-columns: 1fr;
  }

  .swap-controls {
    grid-column: auto;
  }
}
</style>
