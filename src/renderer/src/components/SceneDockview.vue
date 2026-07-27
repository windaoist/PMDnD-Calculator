<script setup lang="ts">
import { computed } from 'vue'
import { DockviewVue, type DockviewReadyEvent } from 'dockview-vue'
import { themeDark, themeLight } from 'dockview-core'
import { appSettings } from '../appSettings'
import CharacterSheetPanel from '../panels/CharacterSheetPanel.vue'
import CharacterListPanel from '../panels/CharacterListPanel.vue'
import CharacterFullPanel from '../panels/CharacterFullPanel.vue'
import BattlePanel from '../panels/BattlePanel.vue'
import MovePanel from '../panels/MovePanel.vue'
import MultiTargetPanel from '../panels/MultiTargetPanel.vue'
import WeatherFieldPanel from '../panels/WeatherFieldPanel.vue'
import SurvivePanel from '../panels/SurvivePanel.vue'
import StatusPanel from '../panels/StatusPanel.vue'
import CalendarPanel from '../panels/CalendarPanel.vue'
import FallDamagePanel from '../panels/FallDamagePanel.vue'
import GrapplePanel from '../panels/GrapplePanel.vue'
import CraftingPanel from '../panels/CraftingPanel.vue'
import RestPanel from '../panels/RestPanel.vue'
import RaceStatsPanel from '../panels/RaceStatsPanel.vue'
import InitiativePanel from '../panels/InitiativePanel.vue'
import AssetManagerPanel from '../panels/AssetManagerPanel.vue'
import BackgroundSettingsPanel from '../panels/BackgroundSettingsPanel.vue'
import AboutPanel from '../panels/AboutPanel.vue'
import FieldEditPanel from '../panels/FieldEditPanel.vue'
import SettingsPanel from '../panels/SettingsPanel.vue'
import TacticalMapPanel from '../panels/TacticalMapPanel.vue'
import DockviewPanelTab from './DockviewPanelTab.vue'

const emit = defineEmits<{ ready: [event: DockviewReadyEvent] }>()
defineProps<{
  calculatorMode: boolean
  homeVisible: boolean
}>()
const dockviewPanelTab = DockviewPanelTab as any
const dockviewTheme = computed(() => (appSettings.themeMode == 'dark' ? themeDark : themeLight))

const dockviewComponents = {
  CharacterSheetPanel,
  CharacterListPanel,
  CharacterFullPanel,
  BattlePanel,
  MovePanel,
  MultiTargetPanel,
  WeatherFieldPanel,
  SurvivePanel,
  StatusPanel,
  CalendarPanel,
  FallDamagePanel,
  GrapplePanel,
  CraftingPanel,
  RestPanel,
  RaceStatsPanel,
  InitiativePanel,
  AssetManagerPanel,
  BackgroundSettingsPanel,
  AboutPanel,
  FieldEditPanel,
  SettingsPanel,
  TacticalMapPanel
}
</script>

<template>
  <div
    class="dockview-overlay"
    :class="{
      'dockview-overlay--calculator': calculatorMode,
      'dockview-overlay--home': homeVisible
    }"
    :aria-hidden="homeVisible"
  >
    <DockviewVue
      class="dockview-instance"
      :components="dockviewComponents as any"
      :theme="dockviewTheme"
      :default-tab-component="dockviewPanelTab"
      dndStrategy="pointer"
      floatingGroupBounds="boundedWithinViewport"
      @ready="emit('ready', $event)"
    />
  </div>
</template>

<style scoped>
.dockview-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  pointer-events: none;
}

.dockview-instance {
  width: 100%;
  height: 100%;
  font-size: 14px;
}

.dockview-overlay :deep(.dv-shell),
.dockview-overlay :deep(.dv-grid-view),
.dockview-overlay :deep(.dv-branch-node),
.dockview-overlay :deep(.dv-split-view-container),
.dockview-overlay :deep(.dv-view-container),
.dockview-overlay :deep(.dv-tab-group-indicator-none),
.dockview-overlay :deep(.dv-watermark-container),
.dockview-overlay :deep(.dv-watermark),
.dockview-overlay :deep(.dv-floating-overlay-host) {
  background: transparent !important;
}

.dockview-overlay :deep(.dv-watermark-container),
.dockview-overlay :deep(.dv-watermark) {
  display: none;
}

.dockview-overlay :deep(.dv-resize-container),
.dockview-overlay :deep(.dv-groupview-floating) {
  pointer-events: auto;
}

.dockview-overlay :deep(.dv-groupview),
.dockview-overlay :deep(.dv-content-container) {
  background: #fff;
}

.dockview-overlay :deep(.dv-groupview-floating) {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  font-size: 14px;
}

.dockview-overlay :deep(.dv-groupview:has(.initiative-panel--transparent)),
.dockview-overlay :deep(.dv-groupview-floating:has(.initiative-panel--transparent)),
.dockview-overlay :deep(.dv-content-container:has(.initiative-panel--transparent)),
.dockview-overlay :deep(.dv-view:has(.initiative-panel--transparent)) {
  background: transparent !important;
}

.dockview-overlay :deep(.dv-groupview-floating:has(.initiative-panel--transparent)) {
  box-shadow: none;
  border-color: rgba(0, 0, 0, 0.18);
}

.dockview-overlay :deep(.dv-tabs-and-actions-container) {
  background: #f5f5f5;
  border-bottom: 1px solid #e8e8e8;
  border-radius: 8px 8px 0 0;
}

.dockview-overlay
  :deep(.dv-groupview:has(.initiative-panel--transparent) .dv-tabs-and-actions-container),
.dockview-overlay
  :deep(.dv-groupview-floating:has(.initiative-panel--transparent) .dv-tabs-and-actions-container) {
  background: rgba(245, 245, 245, 0.65);
  backdrop-filter: blur(2px);
}

.dockview-overlay :deep(.dv-tab) {
  color: #555;
  background: transparent;
}

.dockview-overlay :deep(.dv-tab.dv-active-tab) {
  color: #222;
  background: #fff;
}

.dockview-overlay :deep(.dv-content-container),
.dockview-overlay :deep(.dv-view) {
  font-size: 14px;
}

.dockview-overlay :deep(.dv-close-button) {
  color: #888;
}

.dockview-overlay--calculator {
  top: 0;
  background: transparent;
}

.dockview-overlay--home {
  visibility: hidden;
}

.dockview-overlay--calculator :deep(.dv-shell),
.dockview-overlay--calculator :deep(.dv-grid-view),
.dockview-overlay--calculator :deep(.dv-branch-node),
.dockview-overlay--calculator :deep(.dv-split-view-container),
.dockview-overlay--calculator :deep(.dv-view-container),
.dockview-overlay--calculator :deep(.dv-tab-group-indicator-none) {
  background: transparent !important;
}

.dockview-overlay--calculator :deep(.dv-tabs-and-actions-container) {
  border-radius: 0;
}

.dockview-overlay--calculator :deep(.dv-groupview) {
  pointer-events: auto;
  background: #fff !important;
  border: 1px solid #dedede;
}

@media (pointer: coarse) and (orientation: landscape) {
  .dockview-overlay {
    bottom: 0;
  }

  .dockview-overlay :deep(.dv-resize-container),
  .dockview-overlay :deep(.dv-tabs-and-actions-container),
  .dockview-overlay :deep(.dv-tab) {
    touch-action: none;
  }

  .dockview-overlay :deep(.dv-tabs-and-actions-container) {
    min-height: 36px;
  }

  .dockview-overlay :deep(.dv-tab) {
    min-height: 34px;
    align-items: center;
  }

  .dockview-overlay :deep(.dv-close-button) {
    min-width: 32px;
    min-height: 32px;
  }
}
</style>
