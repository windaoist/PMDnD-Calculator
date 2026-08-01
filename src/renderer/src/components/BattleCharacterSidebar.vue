<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type PropType } from 'vue'
import { showHP } from '@renderer/model/Damage'
import Creatures, { Creature } from '@renderer/model/Creature'

const DM_CODE = 'DM'
const thisCreatures = ref<Creature[]>(Creatures.value)
const isCollapsed = ref(false)
const sidebarRef = ref<HTMLElement | null>(null)
const narrowParent = ref(false)
let parentResizeObserver: ResizeObserver | null = null

const props = defineProps({
  onChange: {
    type: Function,
    required: true
  },
  selectedCodes: {
    type: Array as PropType<string[]>,
    default: () => []
  },
  showVitals: {
    type: Boolean,
    default: true
  },
  collapsible: {
    type: Boolean,
    default: false
  },
  includeDm: {
    type: Boolean,
    default: false
  }
})

const compact = computed(() => props.collapsible && (isCollapsed.value || narrowParent.value))
const selectedCodeSet = computed(() => new Set(props.selectedCodes))

function isSelected(code: string): boolean {
  return selectedCodeSet.value.has(code)
}

function toggleCollapse(): void {
  isCollapsed.value = !isCollapsed.value
}

function creatureInitial(creature: Creature): string {
  return (creature.name() || creature.code() || '?').slice(0, 1)
}

function creatureTitle(creature: Creature): string {
  return `${creature.name()} (${creature.code()})`
}

onMounted(() => {
  const parent = sidebarRef.value?.parentElement
  if (!parent) return
  const updateNarrowState = (): void => {
    narrowParent.value = parent.clientWidth < 480
  }
  parentResizeObserver = new ResizeObserver(updateNarrowState)
  parentResizeObserver.observe(parent)
  updateNarrowState()
})

onBeforeUnmount(() => parentResizeObserver?.disconnect())
</script>

<template>
  <div
    v-if="!props.collapsible && !props.includeDm"
    class="battle-character-sidebar"
    style="
      width: 14em;
      flex-shrink: 0;
      overflow-y: auto;
      min-height: 0;
      border-right: 1px solid #e0e0e0;
      font-size: 13px;
      background: #fafafa;
    "
  >
    <div
      v-for="creature in thisCreatures"
      :key="creature.name()"
      class="sidebar-row"
      :class="{ selected: isSelected(creature.code()) }"
      style="cursor: pointer; position: relative; overflow: hidden"
      @click="props.onChange(creature.code())"
    >
      <div
        v-if="props.showVitals"
        style="position: absolute; left: 0; top: 0; bottom: 0; opacity: 0.5"
        :style="{
          backgroundColor: '#9e9e9e',
          width: Math.max(Math.min(100, 100 * creature.hpRatio()), 0) + '%'
        }"
      />
      <div
        style="
          position: relative;
          padding: 4px 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        "
      >
        <span
          style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500"
          >{{ creature.name() }}</span
        >
        <span v-if="props.showVitals" style="flex-shrink: 0; font-size: 11px">
          <span
            :style="{
              color: `hsl(${Math.max(0, Math.min(120, 120 * creature.hpRatio()))}, ${creature.currentHP > 0 ? '70%' : '100%'}, ${creature.currentHP > 0 ? '40%' : '50%'})`
            }"
          >
            {{ showHP([creature.currentHP, creature.tempHP]) }}/{{ creature.maxHP() }}
          </span>
          <span style="margin-left: 0.3em; color: steelblue">{{ creature.currentPP }}</span>
        </span>
        <span v-else class="sidebar-code">{{ creature.code() }}</span>
      </div>
    </div>
  </div>

  <aside v-else ref="sidebarRef" class="battle-character-sidebar" :class="{ compact }">
    <div v-if="props.collapsible" class="sidebar-header">
      <button
        class="sidebar-toggle"
        type="button"
        :title="compact ? '展开角色栏' : '收缩角色栏'"
        @click="toggleCollapse"
      >
        {{ compact ? '>' : '<' }}
      </button>
    </div>

    <div class="sidebar-list">
      <div
        v-if="props.includeDm"
        class="sidebar-row dm-row"
        :class="{ selected: isSelected(DM_CODE) }"
        title="DM（暗骰）"
        @click="props.onChange(DM_CODE)"
      >
        <div class="sidebar-row-inner">
          <span class="sidebar-avatar">DM</span>
          <template v-if="!compact">
            <span class="sidebar-name">DM</span>
            <span class="sidebar-code">暗骰</span>
          </template>
        </div>
      </div>

      <div
        v-for="creature in thisCreatures"
        :key="creature.code() || creature.name()"
        class="sidebar-row"
        :class="{ selected: isSelected(creature.code()) }"
        :title="creatureTitle(creature)"
        @click="props.onChange(creature.code())"
      >
        <div
          v-if="props.showVitals && !compact"
          class="sidebar-hp-fill"
          :style="{
            width: Math.max(Math.min(100, 100 * creature.hpRatio()), 0) + '%'
          }"
        />
        <div class="sidebar-row-inner">
          <span v-if="compact" class="sidebar-avatar">
            {{ creatureInitial(creature) }}
          </span>
          <template v-else>
            <span class="sidebar-name">{{ creature.name() }}</span>
            <span v-if="props.showVitals" class="sidebar-vitals">
              <span
                :style="{
                  color: `hsl(${Math.max(0, Math.min(120, 120 * creature.hpRatio()))}, ${creature.currentHP > 0 ? '70%' : '100%'}, ${creature.currentHP > 0 ? '40%' : '50%'})`
                }"
              >
                {{ showHP([creature.currentHP, creature.tempHP]) }}/{{ creature.maxHP() }}
              </span>
              <span class="sidebar-pp">{{ creature.currentPP }}</span>
            </span>
            <span v-else class="sidebar-code">
              {{ creature.code() }}
            </span>
          </template>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.battle-character-sidebar {
  width: 14em;
  flex-shrink: 0;
  min-height: 0;
  border-right: 1px solid #e0e0e0;
  background: #fafafa;
  color: #222;
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.battle-character-sidebar.compact {
  width: 3.25em;
}

.sidebar-header {
  border-bottom: 1px solid #e5e5e5;
  padding: 4px;
}

.sidebar-toggle {
  width: 100%;
  min-height: 28px;
  border: 1px solid #d6d6d6;
  border-radius: 4px;
  background: #fff;
  color: #333;
  cursor: pointer;
}

.sidebar-toggle:hover {
  background: #f1f1f1;
}

.sidebar-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sidebar-row {
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.sidebar-row:hover {
  background: rgba(0, 0, 0, 0.04);
}

.sidebar-row.selected {
  background: #222;
  color: #fff;
}

.sidebar-row.selected:hover {
  background: #111;
}

.sidebar-row.selected .sidebar-code,
.sidebar-row.selected .sidebar-pp {
  color: #fff;
}

.sidebar-hp-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: #9e9e9e;
  opacity: 0.5;
}

.sidebar-row-inner {
  position: relative;
  min-height: 30px;
  padding: 4px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5em;
}

.compact .sidebar-row-inner {
  justify-content: center;
  padding: 5px 4px;
}

.sidebar-avatar {
  width: 2.25em;
  min-width: 2.25em;
  height: 2.25em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  color: #333;
  font-weight: 700;
  font-size: 11px;
  line-height: 1;
}

.selected .sidebar-avatar {
  border-color: #fff;
}

.dm-row .sidebar-avatar {
  background: #333;
  color: #fff;
  border-color: #333;
}

.sidebar-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.sidebar-code {
  flex-shrink: 0;
  max-width: 6em;
  overflow: hidden;
  color: #666;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-vitals {
  flex-shrink: 0;
  font-size: 11px;
  white-space: nowrap;
}

.sidebar-pp {
  margin-left: 0.3em;
  color: steelblue;
}
</style>
