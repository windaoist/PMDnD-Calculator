<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import { mapMemory, type MapAsset } from '@renderer/model/GlobalMemory'
import {
  applyAssetAsBackground,
  makeUniqueAssetKey,
  normalizeMapAssets,
  saveCurrentBackgroundSettingsToAsset,
  upsertMapAsset
} from '@renderer/model/MapAssets'

const mm = mapMemory.value
const gridSetupMode = inject<Ref<boolean>>('gridSetupMode', ref(false))
const toggleGridSetup = inject<() => void>('toggleGridSetup', () => {})
const fileInput = ref<HTMLInputElement | null>(null)
const uploadError = ref('')

normalizeMapAssets(mm)

const selectedKey = ref(mm.currentBackgroundKey || mm.assets[0]?.key || '')

const selectedAsset = computed<MapAsset | null>(() => {
  return mm.assets.find((asset) => asset.key == selectedKey.value) ?? null
})

const currentAsset = computed<MapAsset | null>(() => {
  return mm.assets.find((asset) => asset.key == mm.currentBackgroundKey) ?? null
})

function applySelectedBackground(): void {
  if (!selectedAsset.value) return
  applyAssetAsBackground(mm, selectedAsset.value)
}

function saveCurrentSettings(): void {
  const asset = selectedAsset.value ?? currentAsset.value
  if (!asset) return
  saveCurrentBackgroundSettingsToAsset(mm, asset)
}

function setGridColor(value: string): void {
  mm.gridColor = value
  saveCurrentSettings()
}

function importBackground(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  uploadError.value = ''
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    const img = new Image()
    img.onload = () => {
      const key = makeUniqueAssetKey(mm, file.name)
      const asset = upsertMapAsset(
        mm,
        key,
        dataUrl,
        'background',
        img.naturalWidth,
        img.naturalHeight
      )
      applyAssetAsBackground(mm, asset)
      selectedKey.value = asset.key
    }
    img.onerror = () => {
      uploadError.value = '图片读取失败。'
    }
    img.src = dataUrl
  }
  reader.onerror = () => {
    uploadError.value = '文件读取失败。'
  }
  reader.readAsDataURL(file)
  input.value = ''
}
</script>

<template>
  <div class="background-panel">
    <div class="section-line">
      <label>
        背景
        <select v-model="selectedKey" class="w3-select w3-border">
          <option value="">（无）</option>
          <option v-for="asset in mm.assets" :key="asset.key" :value="asset.key">
            {{ asset.key }}
          </option>
        </select>
      </label>
      <button
        class="w3-button w3-green"
        :disabled="!selectedAsset"
        @click="applySelectedBackground"
      >
        切换背景
      </button>
      <button class="w3-button w3-blue" @click="fileInput?.click()">上传并设为背景</button>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,.png"
        style="display: none"
        @change="importBackground"
      />
      <button
        class="w3-button"
        :disabled="!currentAsset && !selectedAsset"
        @click="saveCurrentSettings"
      >
        保存当前参数
      </button>
    </div>

    <div class="current-line">
      当前背景：<strong>{{ mm.currentBackgroundKey || '无' }}</strong>
      <span v-if="uploadError" class="upload-error">{{ uploadError }}</span>
    </div>

    <div v-if="selectedAsset" class="preview-line">
      <img :src="selectedAsset.dataUrl" alt="" />
      <div>
        <div class="muted">该资产记录的背景参数</div>
        <div>边长：{{ selectedAsset.background.cellSize }} px</div>
        <div>
          原点：{{ selectedAsset.background.offsetX }} px, {{ selectedAsset.background.offsetY }} px
        </div>
        <div>
          尺寸：{{ selectedAsset.background.bgWorldW }} x {{ selectedAsset.background.bgWorldH }} px
        </div>
        <div>线宽：{{ selectedAsset.background.gridLineWidth || 0.5 }} px</div>
        <div>虚线段：{{ selectedAsset.background.gridDashLength || 0 }} px</div>
      </div>
    </div>

    <div class="grid-heading">
      <h4>当前地图格子</h4>
      <button class="w3-button" :class="{ 'w3-black': gridSetupMode }" @click="toggleGridSetup">
        {{ gridSetupMode ? '结束格子设置' : '在地图上设置格子' }}
      </button>
    </div>
    <div class="settings-grid">
      <label>
        格子边长 px
        <vue-number-input
          v-model="mm.cellSize"
          size="small"
          inline
          center
          controls
          :min="1"
          :step="1"
          @update:model-value="saveCurrentSettings"
        />
      </label>
      <label>
        格子原点 X px
        <vue-number-input
          v-model="mm.offsetX"
          size="small"
          inline
          center
          controls
          :step="1"
          @update:model-value="saveCurrentSettings"
        />
      </label>
      <label>
        格子原点 Y px
        <vue-number-input
          v-model="mm.offsetY"
          size="small"
          inline
          center
          controls
          :step="1"
          @update:model-value="saveCurrentSettings"
        />
      </label>
      <label>
        背景宽 px
        <vue-number-input
          v-model="mm.bgWorldW"
          size="small"
          inline
          center
          controls
          :min="1"
          :step="1"
          @update:model-value="saveCurrentSettings"
        />
      </label>
      <label>
        背景高 px
        <vue-number-input
          v-model="mm.bgWorldH"
          size="small"
          inline
          center
          controls
          :min="1"
          :step="1"
          @update:model-value="saveCurrentSettings"
        />
      </label>
      <label>
        网格颜色
        <input
          :value="mm.gridColor"
          type="color"
          @input="setGridColor(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        网格透明度
        <vue-number-input
          v-model="mm.gridAlpha"
          size="small"
          inline
          center
          controls
          :min="0"
          :max="1"
          :step="0.05"
          @update:model-value="saveCurrentSettings"
        />
      </label>
      <label>
        虚线段长 px
        <vue-number-input
          v-model="mm.gridDashLength"
          size="small"
          inline
          center
          controls
          :min="0"
          :step="1"
          @update:model-value="saveCurrentSettings"
        />
      </label>
      <label>
        线宽 px
        <vue-number-input
          v-model="mm.gridLineWidth"
          size="small"
          inline
          center
          controls
          :min="0.1"
          :step="0.1"
          @update:model-value="saveCurrentSettings"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.background-panel {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 0.75em;
  container-type: inline-size;
}

.background-panel h3 {
  margin-top: 0;
}

.section-line {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.6em;
  margin-bottom: 0.6em;
}

.section-line label,
.settings-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  font-size: 13px;
  color: #555;
}

.section-line select {
  min-width: 220px;
}

.current-line {
  margin-bottom: 0.75em;
}

.upload-error {
  margin-left: 0.75em;
  color: #c62828;
}

.preview-line {
  display: grid;
  grid-template-columns: minmax(120px, 220px) 1fr;
  gap: 1em;
  align-items: start;
  margin-bottom: 1em;
}

.preview-line img {
  max-width: 100%;
  max-height: 160px;
  object-fit: contain;
  background: #f5f5f5;
  border: 1px solid #ddd;
}

.muted {
  color: #777;
  margin-bottom: 0.35em;
}

.grid-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  margin-bottom: 0.5em;
}

.grid-heading h4 {
  margin: 0;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 0.75em 1em;
}

.settings-grid :deep(.vue-number-input--small.vue-number-input--inline.vue-number-input--controls) {
  width: 11rem !important;
  max-width: 100%;
}

.settings-grid
  :deep(.vue-number-input--small.vue-number-input--inline.vue-number-input--controls > input) {
  box-sizing: border-box;
  width: 100% !important;
}

@container (max-width: 460px) {
  .section-line {
    align-items: stretch;
    flex-direction: column;
  }

  .section-line select {
    width: 100%;
    min-width: 0;
  }

  .preview-line,
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
