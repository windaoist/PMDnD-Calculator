<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import Creatures from '@renderer/model/Creature'
import { fieldEditMemory, mapMemory } from '@renderer/model/GlobalMemory'
import {
  applyFieldDataToDrawing,
  convertAreaDrawingsToFields,
  creatureIsInFieldDrawing,
  DrawableFieldStates,
  drawingIsField,
  fieldColorForState,
  fieldRemainingText,
  isAreaDrawing,
  removeFieldDataFromDrawing
} from '@renderer/model/MapFields'
import type { EnvCategory, EnvState } from '@renderer/model/WeatherField'

const memory = ref(fieldEditMemory.value)
const mm = mapMemory.value
const requestSceneDraw = inject<() => void>('requestSceneDraw', () => {})
const dcAbilityOptions = ['力量', '敏捷', '体质', '智力', '感知', '魅力']
const DRAWING_ONLY_OPTION = '__drawing_only__'
const CUSTOM_FIELD_OPTION = '__custom__'
const stateCategories: EnvCategory[] = ['天气', '基本气候', '背景场地', '普通场地']

function fieldStatesForCategory(category: EnvCategory): EnvState[] {
  return DrawableFieldStates.filter((state) => state.category == category)
}

const areaDrawings = computed(() =>
  mm.drawings
    .map((drawing, idx) => ({ drawing, idx }))
    .filter((entry) => isAreaDrawing(entry.drawing))
)

const selectedDrawing = computed(() => mm.drawings[memory.value.selectedDrawingIdx])
const selectedIsField = computed(() => drawingIsField(selectedDrawing.value))
const affectedCreatures = computed(() => {
  const drawing = selectedDrawing.value
  if (!drawingIsField(drawing)) return []
  return Creatures.value.filter((creature) => creatureIsInFieldDrawing(creature, drawing, mm))
})
const stateSelectValue = computed<string>({
  get() {
    if (memory.value.selectedDrawingIdx >= 0 && !selectedIsField.value) {
      return DRAWING_ONLY_OPTION
    }
    if (memory.value.selectedDrawingIdx < 0 && !memory.value.bindNewDrawings) {
      return DRAWING_ONLY_OPTION
    }
    return DrawableFieldStates.some((state) => state.name == memory.value.stateName)
      ? memory.value.stateName
      : CUSTOM_FIELD_OPTION
  },
  set(value) {
    if (value == DRAWING_ONLY_OPTION) {
      memory.value.bindNewDrawings = false
      if (memory.value.selectedDrawingIdx >= 0) {
        removeFieldDataFromDrawing(selectedDrawing.value)
        requestSceneDraw()
      }
      return
    }

    memory.value.bindNewDrawings = true
    if (value == CUSTOM_FIELD_OPTION) {
      if (DrawableFieldStates.some((state) => state.name == memory.value.stateName)) {
        memory.value.stateName = '自定义场地'
      }
      if (memory.value.selectedDrawingIdx >= 0) applyToSelected()
      return
    }
    memory.value.stateName = value
    memory.value.color = fieldColorForState(value)
    if (memory.value.selectedDrawingIdx >= 0) applyToSelected()
  }
})
const selectedLabel = computed(() => {
  const idx = memory.value.selectedDrawingIdx
  if (idx < 0) return '当前模板'
  const drawing = mm.drawings[idx]
  if (!drawing) return '当前模板'
  return `${idx + 1}. ${drawing.type}${drawing.field ? ` / ${drawing.field.stateName}` : ''}`
})

function drawingLabel(idx: number): string {
  const drawing = mm.drawings[idx]
  if (!drawing) return `${idx + 1}. 已删除`
  const field = drawing.field
  return `${idx + 1}. ${drawing.type}${
    field
      ? ` / ${field.stateName} ${field.layers}层 / ${fieldRemainingText(field.remainingRounds ?? -1)}`
      : ' / 未设为场地'
  }`
}

function selectDrawing(value: string): void {
  const idx = Number(value)
  memory.value.selectedDrawingIdx = Number.isFinite(idx) ? idx : -1
  const drawing = mm.drawings[memory.value.selectedDrawingIdx]
  if (drawing?.field) {
    memory.value.loadFieldData(drawing.field)
  }
}

function recalculateDc(): void {
  const code = memory.value.casterCode.trim()
  if (!code) {
    memory.value.dc = 10
    return
  }
  const creature = Creatures.value.find((c) => c.code() == code)
  if (!creature) return
  memory.value.dc = Math.max(
    0,
    Math.floor(creature.effectPower() + creature.getModifierByName(memory.value.dcAbility))
  )
}

function applyToSelected(): void {
  applyFieldDataToDrawing(selectedDrawing.value, memory.value.toFieldData())
  requestSceneDraw()
}

function applyToAll(): void {
  convertAreaDrawingsToFields(mm, memory.value.toFieldData())
  requestSceneDraw()
}

function clearSelected(): void {
  removeFieldDataFromDrawing(selectedDrawing.value)
  requestSceneDraw()
}

watch(
  () => [
    memory.value.stateName,
    memory.value.layers,
    memory.value.casterCode,
    memory.value.dcAbility,
    memory.value.dc,
    memory.value.color,
    memory.value.remainingRounds
  ],
  () => {
    if (selectedIsField.value) applyToSelected()
  }
)
</script>

<template>
  <div class="field-panel">
    <div class="field-row">
      <label>
        编辑对象
        <select
          :value="memory.selectedDrawingIdx"
          class="w3-select w3-border"
          @change="selectDrawing(($event.target as HTMLSelectElement).value)"
        >
          <option :value="-1">当前模板</option>
          <option v-for="entry in areaDrawings" :key="entry.idx" :value="entry.idx">
            {{ drawingLabel(entry.idx) }}
          </option>
        </select>
      </label>
    </div>

    <div class="field-grid">
      <label>
        类别
        <select v-model="stateSelectValue" class="w3-select w3-border">
          <option :value="DRAWING_ONLY_OPTION">仅绘制地图图形</option>
          <optgroup v-for="category in stateCategories" :key="category" :label="category">
            <option
              v-for="state in fieldStatesForCategory(category)"
              :key="state.name"
              :value="state.name"
            >
              {{ state.name }}
            </option>
          </optgroup>
          <optgroup label="自定义">
            <option :value="CUSTOM_FIELD_OPTION">自定义场地</option>
          </optgroup>
        </select>
      </label>

      <template v-if="stateSelectValue != DRAWING_ONLY_OPTION">
        <label v-if="stateSelectValue == CUSTOM_FIELD_OPTION">
          自定义名称
          <input v-model="memory.stateName" class="w3-input w3-border" />
        </label>

        <label>
          颜色
          <input v-model="memory.color" class="field-color-input" type="color" />
        </label>

        <div>
          层数
          <vue-number-input v-model="memory.layers" size="small" inline center controls :min="1" />
        </div>

        <div>
          剩余回合（-1 无限）
          <vue-number-input
            v-model="memory.remainingRounds"
            size="small"
            inline
            center
            controls
            :min="-1"
          />
        </div>

        <label>
          施法者
          <select v-model="memory.casterCode" class="w3-select w3-border" @change="recalculateDc">
            <option value="">大自然</option>
            <option v-for="creature in Creatures" :key="creature.code()" :value="creature.code()">
              {{ creature.name() }} {{ creature.code() }}
            </option>
          </select>
        </label>

        <label>
          DC 属性
          <select v-model="memory.dcAbility" class="w3-select w3-border" @change="recalculateDc">
            <option value="">不指定</option>
            <option v-for="ability in dcAbilityOptions" :key="ability" :value="ability">
              {{ ability }}
            </option>
          </select>
        </label>

        <div>
          固定 DC
          <vue-number-input v-model="memory.dc" size="small" inline center controls :min="0" />
        </div>
      </template>
    </div>

    <div v-if="stateSelectValue != DRAWING_ONLY_OPTION" class="field-preview">
      <span class="field-swatch" :style="{ background: memory.color }" />
      <span>{{ selectedLabel }}：{{ memory.stateName }} {{ memory.layers }}层</span>
      <span>剩余 {{ fieldRemainingText(memory.remainingRounds) }}</span>
      <span>施法者 {{ memory.casterCode || '大自然' }}</span>
      <span v-if="memory.casterCode"> DC 属性 {{ memory.dcAbility || '不指定' }} </span>
      <span>DC {{ memory.dc }}</span>
      <span v-if="memory.selectedDrawingIdx >= 0">
        范围内角色：
        {{
          affectedCreatures.length > 0
            ? affectedCreatures.map((creature) => creature.name()).join('、')
            : '无'
        }}
      </span>
    </div>
    <div v-else class="field-preview field-preview--drawing-only">
      {{ selectedLabel }}：仅绘制地图图形，不附加环境场地数据
    </div>

    <div v-if="stateSelectValue != DRAWING_ONLY_OPTION" class="field-actions">
      <button
        class="w3-button w3-black"
        :disabled="memory.selectedDrawingIdx < 0 || !selectedDrawing"
        @click="applyToSelected"
      >
        应用到当前对象
      </button>
      <button class="w3-button w3-light-gray" @click="applyToAll">应用到全部面积图形</button>
      <button class="w3-button w3-light-gray" :disabled="!selectedIsField" @click="clearSelected">
        当前对象取消场地
      </button>
    </div>

    <div class="field-note">
      “仅绘制地图图形”不会为新图形附加环境数据；选择天气、基本气候或场地后，新绘制的面积图形会自动绑定当前模板。场地 DC 会写入绘图对象，之后不会随施法者能力变化自动改变。角色是否处于场地内按 token 当前位置实时计算。
    </div>
  </div>
</template>

<style scoped>
.field-panel {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 0.75em;
}

.field-row {
  margin-bottom: 0.75em;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75em;
  align-items: end;
}

.field-panel label {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  font-size: 13px;
  color: #555;
}

.field-grid > div {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  color: #555;
  font-size: 13px;
}

.field-preview--drawing-only {
  color: #666;
}

.field-panel :deep(.vue-number-input) {
  width: 100%;
  max-width: 180px;
}

.field-color-input {
  width: 100%;
  max-width: 180px;
  min-height: 32px;
  border: 1px solid #ccc;
  background: #fff;
  padding: 2px;
}

.field-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75em;
  margin-top: 1em;
  padding: 0.5em 0;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
}

.field-swatch {
  width: 18px;
  height: 18px;
  border: 1px solid rgba(0, 0, 0, 0.25);
}

.field-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-top: 1em;
}

.field-note {
  margin-top: 1em;
  color: #666;
  font-size: 13px;
  line-height: 1.5;
}
</style>
