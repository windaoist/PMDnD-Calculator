<script setup lang="ts">
import {
  appSettings,
  appSettingsError,
  renderScaleOptions,
  resetUiScale,
  setRenderScale,
  setThemeMode,
  setUiScale,
  uiScaleOptions
} from '@renderer/appSettings'

function updateUiScale(event: Event): void {
  setUiScale((event.target as HTMLSelectElement).value)
}

function updateRenderScale(event: Event): void {
  setRenderScale((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="settings-panel">
    <section class="settings-section">
      <header>
        <h3>界面</h3>
      </header>

      <div class="setting-row">
        <label for="ui-scale">全局缩放</label>
        <div class="setting-control">
          <select
            id="ui-scale"
            class="w3-select w3-border"
            :value="appSettings.uiScale"
            @change="updateUiScale"
          >
            <option v-for="option in uiScaleOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button
            type="button"
            class="w3-button w3-border"
            :disabled="appSettings.uiScale == 1"
            @click="resetUiScale"
          >
            恢复 100%
          </button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">界面主题</span>
        <div class="mode-segment" role="group" aria-label="界面主题">
          <button
            type="button"
            :class="{ active: appSettings.themeMode == 'light' }"
            :aria-pressed="appSettings.themeMode == 'light'"
            @click="setThemeMode('light')"
          >
            日间
          </button>
          <button
            type="button"
            :class="{ active: appSettings.themeMode == 'dark' }"
            :aria-pressed="appSettings.themeMode == 'dark'"
            @click="setThemeMode('dark')"
          >
            夜间
          </button>
        </div>
      </div>

      <div class="setting-row">
        <label for="render-scale">画布渲染倍率</label>
        <div class="setting-control setting-control--single">
          <select
            id="render-scale"
            class="w3-select w3-border"
            :value="appSettings.renderScale"
            @change="updateRenderScale"
          >
            <option v-for="scale in renderScaleOptions" :key="scale" :value="scale">
              {{ scale }}x
            </option>
          </select>
        </div>
      </div>

      <div v-if="appSettingsError" class="settings-error">{{ appSettingsError }}</div>
    </section>
  </div>
</template>

<style scoped>
.settings-panel {
  height: 100%;
  overflow: auto;
  padding: 14px;
  background: #fff;
  color: #262626;
  font-size: 14px;
  container-type: inline-size;
}

.settings-section {
  display: grid;
  gap: 14px;
}

.settings-section header {
  padding-bottom: 8px;
  border-bottom: 1px solid #dedede;
}

.settings-section h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(92px, 0.65fr) minmax(190px, 1.35fr);
  gap: 16px;
  align-items: center;
}

.setting-row > label,
.setting-label {
  font-weight: 600;
}

.setting-control {
  display: grid;
  grid-template-columns: minmax(96px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.setting-control--single {
  grid-template-columns: minmax(96px, 1fr);
}

.setting-control select,
.setting-control button {
  min-height: 34px;
  font-size: inherit;
}

.setting-control button {
  white-space: nowrap;
}

.mode-segment {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid #bdbdbd;
  border-radius: 4px;
}

.mode-segment button {
  min-width: 0;
  min-height: 34px;
  padding: 5px 10px;
  border: 0;
  border-right: 1px solid #d1d1d1;
  background: #fff;
  color: #444;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.mode-segment button:last-child {
  border-right: 0;
}

.mode-segment button:hover {
  background: #f2f5f9;
}

.mode-segment button.active {
  background: #2f5f9f;
  color: #fff;
}

.settings-error {
  padding: 8px 10px;
  border-left: 3px solid #c43d32;
  background: #fff2f0;
  color: #8d241c;
}

@container (max-width: 420px) {
  .setting-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
