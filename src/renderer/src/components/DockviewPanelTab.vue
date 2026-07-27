<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { IDockviewPanelHeaderProps } from 'dockview-core'

const props = defineProps<{ params: IDockviewPanelHeaderProps }>()

const title = ref(props.params.api.title ?? props.params.api.id)
const titleListener = props.params.api.onDidTitleChange((event) => {
  title.value = event.title
})

function closePanel(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  props.params.api.close()
}

onBeforeUnmount(() => titleListener.dispose())
</script>

<template>
  <div class="dock-panel-tab" :title="title">
    <span class="dock-panel-tab-title">{{ title }}</span>
    <span class="dock-panel-tab-actions">
      <button
        type="button"
        class="dock-panel-tab-action dock-panel-tab-close"
        :title="`关闭 ${title}`"
        :aria-label="`关闭 ${title}`"
        @pointerdown.stop
        @click="closePanel"
      >
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path d="m5 5 8 8m0-8-8 8" />
        </svg>
      </button>
    </span>
  </div>
</template>

<style scoped>
.dock-panel-tab {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  align-items: center;
  gap: 4px;
  padding-left: 9px;
  overflow: hidden;
  box-sizing: border-box;
  color: inherit;
}

.dock-panel-tab-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dock-panel-tab-actions {
  display: inline-flex;
  flex: 0 0 auto;
  height: 100%;
  align-items: stretch;
  border-left: 1px solid rgba(0, 0, 0, 0.08);
}

.dock-panel-tab-action {
  display: grid;
  width: 30px;
  min-width: 30px;
  height: 100%;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #667085;
  font: inherit;
  line-height: 1;
  cursor: pointer;
  transition: color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
}

.dock-panel-tab-action svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.dock-panel-tab-close:hover {
  background: #d94343;
  color: #fff;
}

.dock-panel-tab-close:active {
  background: #b52c2c;
}

.dock-panel-tab-action:focus-visible {
  outline: 2px solid #3b82c4;
  outline-offset: -2px;
}

@media (pointer: coarse) and (orientation: landscape) {
  .dock-panel-tab-action {
    width: 34px;
    min-width: 34px;
  }
}
</style>
