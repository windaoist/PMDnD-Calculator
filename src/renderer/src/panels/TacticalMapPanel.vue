<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SceneToolbar from '../components/SceneToolbar.vue'

const map = inject<any>('tacticalMapContext')
if (!map) throw new Error('Tactical map context is unavailable')

const {
  mm,
  backgroundDataUrl,
  backgroundImageStyle,
  canvasWidth,
  canvasHeight,
  drawMode,
  drawColor,
  snapEnabled,
  touchMoveCostMode,
  enterDrawMode,
  toggleFogVisible,
  setHPDisplayLevel,
  canvasPointerDown,
  canvasPointerMove,
  canvasPointerUp,
  canvasPointerCancel,
  canvasPointerLeave,
  canvasWheel,
  canvasContextMenu,
  attachTacticalMap,
  detachTacticalMap
} = map

const panelRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
  nextTick(() => {
    if (panelRef.value && canvasRef.value) attachTacticalMap(panelRef.value, canvasRef.value)
  })
})

onBeforeUnmount(() => {
  if (canvasRef.value) detachTacticalMap(canvasRef.value)
})
</script>

<template>
  <div ref="panelRef" class="tactical-map-panel">
    <SceneToolbar
      :mm="mm"
      :draw-mode="drawMode"
      :draw-color="drawColor"
      :snap-enabled="snapEnabled"
      :move-cost-mode="touchMoveCostMode"
      @draw-color-change="drawColor = $event"
      @snap-enabled-change="snapEnabled = $event"
      @move-cost-mode-change="touchMoveCostMode = $event"
      @enter-draw-mode="enterDrawMode"
      @toggle-fog-visible="toggleFogVisible"
      @set-hp-display-level="setHPDisplayLevel"
    />
    <div class="scene-background-layer" aria-hidden="true">
      <img
        v-if="backgroundDataUrl"
        class="scene-background-image"
        :src="backgroundDataUrl"
        :style="backgroundImageStyle"
      />
    </div>
    <canvas
      ref="canvasRef"
      class="scene-canvas"
      :width="canvasWidth"
      :height="canvasHeight"
      @pointerdown="canvasPointerDown"
      @pointermove="canvasPointerMove"
      @pointerup="canvasPointerUp"
      @pointercancel="canvasPointerCancel"
      @pointerleave="canvasPointerLeave"
      @wheel.prevent="canvasWheel"
      @contextmenu.prevent="canvasContextMenu"
    />
  </div>
</template>

<style scoped>
.tactical-map-panel {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
}

.scene-background-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.scene-background-image {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  transform-origin: 0 0;
  will-change: transform;
  user-select: none;
  -webkit-user-drag: none;
}

.scene-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  touch-action: none;
}
</style>
