<script setup lang="ts">
import { computed, ref } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import { mapMemory, type MapAsset, type MapAssetUsage } from '@renderer/model/GlobalMemory'
import {
  applyAssetAsBackground,
  makeUniqueAssetKey,
  normalizeMapAssets,
  saveCurrentBackgroundSettingsToAsset,
  upsertMapAsset
} from '@renderer/model/MapAssets'

const mm = mapMemory.value
const fileInput = ref<HTMLInputElement | null>(null)
const selectedKey = ref('')

const usageLabels: Record<MapAssetUsage, string> = {
  unused: '仅入库',
  token: 'Token',
  background: '背景',
  both: '背景 + Token',
  portrait: '角色立绘'
}

normalizeMapAssets(mm)
selectedKey.value = mm.currentBackgroundKey || mm.assets[0]?.key || ''

const selectedAsset = computed<MapAsset | null>(() => {
  return mm.assets.find((asset) => asset.key == selectedKey.value) ?? mm.assets[0] ?? null
})

function importPngs(event: Event): void {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  for (const file of input.files) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        const key = makeUniqueAssetKey(mm, file.name)
        upsertMapAsset(mm, key, dataUrl, 'unused', img.naturalWidth, img.naturalHeight)
        selectedKey.value = key
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  input.value = ''
}

function deleteAsset(asset: MapAsset): void {
  mm.assets = mm.assets.filter((item) => item.key != asset.key)
  if (mm.currentBackgroundKey == asset.key) {
    mm.currentBackgroundKey = ''
  }
  selectedKey.value = mm.assets[0]?.key ?? ''
}

function setUsage(asset: MapAsset, usage: MapAssetUsage): void {
  asset.usage = usage
}

function renameAsset(asset: MapAsset, rawKey: string): void {
  const oldKey = asset.key
  const base = rawKey.replace(/\.(png)$/i, '').trim()
  if (!base || base == oldKey) {
    selectedKey.value = oldKey
    return
  }
  let nextKey = base
  let idx = 2
  while (mm.assets.some((item) => item != asset && item.key == nextKey)) {
    nextKey = `${base}-${idx}`
    idx++
  }
  asset.key = nextKey
  if (mm.currentBackgroundKey == oldKey) mm.currentBackgroundKey = nextKey
  selectedKey.value = nextKey
}

function applyBackground(asset: MapAsset): void {
  applyAssetAsBackground(mm, asset)
  selectedKey.value = asset.key
}

function saveCurrentSettings(asset: MapAsset): void {
  saveCurrentBackgroundSettingsToAsset(mm, asset)
}
</script>

<template>
  <div class="asset-panel">
    <div class="asset-header">
      <button class="w3-button w3-blue" @click="fileInput?.click()">导入 PNG</button>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,.png"
        multiple
        style="display: none"
        @change="importPngs"
      />
    </div>

    <div v-if="mm.assets.length == 0" class="empty-state">暂无资产</div>

    <div v-else class="asset-layout">
      <div class="asset-list">
        <button
          v-for="asset in mm.assets"
          :key="asset.key"
          class="asset-row"
          :class="{ active: selectedAsset?.key == asset.key }"
          @click="selectedKey = asset.key"
        >
          <img :src="asset.dataUrl" alt="" />
          <span>{{ asset.key }}</span>
          <small>{{ usageLabels[asset.usage] }}</small>
        </button>
      </div>

      <div v-if="selectedAsset" class="asset-detail">
        <div class="preview-line">
          <img :src="selectedAsset.dataUrl" alt="" />
          <div>
            <label>
              文件名
              <input
                :value="selectedAsset.key"
                class="w3-input w3-border"
                @change="renameAsset(selectedAsset, ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label>
              用途
              <select
                :value="selectedAsset.usage"
                class="w3-select w3-border"
                @change="
                  setUsage(
                    selectedAsset,
                    ($event.target as HTMLSelectElement).value as MapAssetUsage
                  )
                "
              >
                <option value="unused">仅入库</option>
                <option value="token">Token</option>
                <option value="background">背景</option>
                <option value="both">背景 + Token</option>
                <option value="portrait">角色立绘</option>
              </select>
            </label>
          </div>
        </div>

        <div class="button-row">
          <button class="w3-button w3-green" @click="applyBackground(selectedAsset)">
            设为当前背景
          </button>
          <button class="w3-button" @click="saveCurrentSettings(selectedAsset)">
            记录当前背景参数
          </button>
          <button class="w3-button w3-red" @click="deleteAsset(selectedAsset)">删除</button>
        </div>

        <h4>背景参数</h4>
        <div class="settings-grid">
          <label>
            格子边长 px
            <vue-number-input
              v-model="selectedAsset.background.cellSize"
              size="small"
              inline
              center
              controls
              :min="1"
              :step="1"
            />
          </label>
          <label>
            原点 X px
            <vue-number-input
              v-model="selectedAsset.background.offsetX"
              size="small"
              inline
              center
              controls
              :step="1"
            />
          </label>
          <label>
            原点 Y px
            <vue-number-input
              v-model="selectedAsset.background.offsetY"
              size="small"
              inline
              center
              controls
              :step="1"
            />
          </label>
          <label>
            背景宽 px
            <vue-number-input
              v-model="selectedAsset.background.bgWorldW"
              size="small"
              inline
              center
              controls
              :min="1"
              :step="1"
            />
          </label>
          <label>
            背景高 px
            <vue-number-input
              v-model="selectedAsset.background.bgWorldH"
              size="small"
              inline
              center
              controls
              :min="1"
              :step="1"
            />
          </label>
          <label>
            网格颜色
            <input v-model="selectedAsset.background.gridColor" type="color" />
          </label>
          <label>
            网格透明度
            <vue-number-input
              v-model="selectedAsset.background.gridAlpha"
              size="small"
              inline
              center
              controls
              :min="0"
              :max="1"
              :step="0.05"
            />
          </label>
          <label>
            虚线段长 px
            <vue-number-input
              v-model="selectedAsset.background.gridDashLength"
              size="small"
              inline
              center
              controls
              :min="0"
              :step="1"
            />
          </label>
          <label>
            线宽 px
            <vue-number-input
              v-model="selectedAsset.background.gridLineWidth"
              size="small"
              inline
              center
              controls
              :min="0.1"
              :step="0.1"
            />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.asset-panel {
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0.75em;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.asset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  margin-bottom: 0.75em;
}

.asset-header h3 {
  margin: 0;
}

.empty-state {
  color: #777;
  padding: 2em 0;
  text-align: center;
}

.asset-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1em;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.asset-list {
  border-right: 1px solid #e0e0e0;
  padding-right: 0.75em;
  overflow: auto;
  min-height: 0;
}

.asset-row {
  width: 100%;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 0.5em;
  border: 0;
  background: transparent;
  padding: 0.4em;
  text-align: left;
  cursor: pointer;
}

.asset-row:hover {
  background: rgba(0, 0, 0, 0.04);
}

.asset-row.active {
  background: #e8f0fe;
}

.asset-row img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  background: #f5f5f5;
  border: 1px solid #ddd;
}

.asset-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-row small {
  color: #666;
  white-space: nowrap;
}

.asset-detail {
  min-width: 0;
  overflow: auto;
  min-height: 0;
  padding-right: 0.25em;
}

.preview-line {
  display: grid;
  grid-template-columns: minmax(120px, 220px) minmax(220px, 1fr);
  gap: 1em;
  align-items: start;
}

.preview-line > img {
  max-width: 100%;
  max-height: 180px;
  object-fit: contain;
  background: #f5f5f5;
  border: 1px solid #ddd;
}

.preview-line label,
.settings-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  margin-bottom: 0.6em;
  font-size: 13px;
  color: #555;
}

.button-row {
  display: flex;
  gap: 0.5em;
  flex-wrap: wrap;
  margin: 0.75em 0;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.5em 1em;
}

.settings-grid :deep(.vue-number-input--small.vue-number-input--inline.vue-number-input--controls) {
  width: 10rem !important;
  max-width: 100%;
}

.settings-grid
  :deep(.vue-number-input--small.vue-number-input--inline.vue-number-input--controls > input) {
  box-sizing: border-box;
  width: 100% !important;
}
</style>
