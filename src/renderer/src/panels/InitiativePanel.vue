<script setup lang="ts">
import { ref, computed, inject, onBeforeUnmount, onMounted, watch } from 'vue'
import Creatures, { Creature } from '@renderer/model/Creature'
import { mapMemory, statusMemory, StatusMemory } from '@renderer/model/GlobalMemory'
import { advanceFieldRounds } from '@renderer/model/MapFields'
import { assetUsesToken } from '@renderer/model/MapAssets'

const thisCreatures = computed<Creature[]>(() => Creatures.value)
const memory = ref<StatusMemory>(statusMemory.value)
const mm = mapMemory.value
const requestSceneDraw = inject<() => void>('requestSceneDraw', () => {})
const activeCodes = ref<Set<string>>(new Set())
const controlsExpanded = computed({
  get: () => memory.value.initiativeControlsExpanded,
  set: (value: boolean) => {
    memory.value.initiativeControlsExpanded = value
  }
})
const panelRef = ref<HTMLElement | null>(null)
const cardsRef = ref<HTMLElement | null>(null)
const panelHeight = ref(0)
const cardAreaHeight = ref(0)
const initiativeRefreshTick = ref(0)
let initiativeSignature = ''
let panelResizeObserver: ResizeObserver | null = null
let cardsResizeObserver: ResizeObserver | null = null
let initiativeRefreshTimer: number | null = null

const factionOrder: Record<string, number> = { 玩家: 0, 友方: 1, 中立: 2, 敌方: 3 }
const factionColor: Record<string, string> = {
  玩家: '#2196f3',
  友方: '#4caf50',
  中立: '#f9a825',
  敌方: '#e53935'
}
const factionBg: Record<string, string> = {
  玩家: 'rgba(179,217,255,0.9)',
  友方: 'rgba(179,255,179,0.9)',
  中立: 'rgba(255,233,179,0.9)',
  敌方: 'rgba(255,179,179,0.9)'
}

const initiativeList = computed<Creature[]>(() => {
  initiativeRefreshTick.value
  return [...thisCreatures.value].sort((a, b) => {
    const diff = b.initiative() + b.tempInitiative - (a.initiative() + a.tempInitiative)
    if (diff != 0) return diff
    return (factionOrder[a.faction] ?? 4) - (factionOrder[b.faction] ?? 4)
  })
})

function buildInitiativeSignature(): string {
  return thisCreatures.value
    .map((c) => `${c.code()}:${c.faction}:${c.initiative()}:${c.tempInitiative}:${c.inRound}`)
    .join('|')
}

function restoreActiveTurn(): void {
  const active = initiativeList.value.filter((c) => c.inRound)
  activeCodes.value = new Set(active.map((c) => c.code()))
  if (active.length > 0) {
    const idx = initiativeList.value.indexOf(active[0])
    if (idx >= 0) memory.value.currentInitiativeIdx = idx
  } else if (memory.value.currentInitiativeIdx >= initiativeList.value.length) {
    memory.value.currentInitiativeIdx = Math.max(0, initiativeList.value.length - 1)
  }
}

function refreshInitiativeSignature(): void {
  const nextSignature = buildInitiativeSignature()
  if (nextSignature == initiativeSignature) return
  initiativeSignature = nextSignature
  initiativeRefreshTick.value++
  restoreActiveTurn()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function updatePanelHeight(): void {
  panelHeight.value = panelRef.value?.clientHeight ?? 0
}

function updateCardAreaHeight(): void {
  cardAreaHeight.value = cardsRef.value?.clientHeight ?? 0
}

function observePanel(el: HTMLElement | null): void {
  panelResizeObserver?.disconnect()
  panelResizeObserver = null
  if (!el) return
  panelResizeObserver = new ResizeObserver(updatePanelHeight)
  panelResizeObserver.observe(el)
  updatePanelHeight()
}

function observeCards(el: HTMLElement | null): void {
  cardsResizeObserver?.disconnect()
  cardsResizeObserver = null
  if (!el) {
    cardAreaHeight.value = 0
    return
  }
  cardsResizeObserver = new ResizeObserver(updateCardAreaHeight)
  cardsResizeObserver.observe(el)
  updateCardAreaHeight()
}

const measuredCardAreaHeight = computed(() => {
  if (cardAreaHeight.value > 0) return cardAreaHeight.value
  return Math.max(40, panelHeight.value)
})

const densityClass = computed(() => {
  const h = measuredCardAreaHeight.value
  return {
    'initiative-panel--tiny': h < 54,
    'initiative-panel--compact': h >= 54 && h < 92,
    'initiative-panel--roomy': h >= 150
  }
})

const layoutVars = computed<Record<string, string>>(() => {
  const h = measuredCardAreaHeight.value
  const activeHeight = Math.round(clamp(h - 2, 34, 220))
  const inactiveHeight = Math.round(activeHeight * (activeHeight < 72 ? 0.9 : 0.76))
  const activeWidth = Math.round(clamp(activeHeight * 0.72, 38, 150))
  const inactiveWidth = Math.round(clamp(activeWidth * (activeHeight < 72 ? 0.88 : 0.75), 34, 112))
  const headerHeight = Math.round(clamp(activeHeight * 0.18, 12, 24))
  const nameSize = Math.round(clamp(activeHeight * 0.12, 10, 17))
  const headerFontSize = Math.round(clamp(activeHeight * 0.095, 9, 13))
  return {
    '--init-card-height': `${inactiveHeight}px`,
    '--init-active-card-height': `${activeHeight}px`,
    '--init-card-width': `${inactiveWidth}px`,
    '--init-active-card-width': `${activeWidth}px`,
    '--init-card-header-height': `${headerHeight}px`,
    '--init-card-name-size': `${nameSize}px`,
    '--init-card-header-font-size': `${headerFontSize}px`
  }
})

onMounted(() => {
  observePanel(panelRef.value)
  observeCards(cardsRef.value)
  refreshInitiativeSignature()
  initiativeRefreshTimer = window.setInterval(refreshInitiativeSignature, 250)
})

watch(cardsRef, (el) => observeCards(el), { flush: 'post' })

watch(
  initiativeList,
  (list) => {
    const active = list.find((c) => activeCodes.value.has(c.code()))
    if (active) {
      memory.value.currentInitiativeIdx = list.indexOf(active)
      return
    }
    if (memory.value.currentInitiativeIdx >= list.length) {
      memory.value.currentInitiativeIdx = Math.max(0, list.length - 1)
    }
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  panelResizeObserver?.disconnect()
  cardsResizeObserver?.disconnect()
  if (initiativeRefreshTimer != null) {
    window.clearInterval(initiativeRefreshTimer)
    initiativeRefreshTimer = null
  }
})

// 找出当前角色所在的先攻组（连续同阵营角色）
function getGroup(c: Creature): Creature[] {
  if (memory.value.initMode != 'grouped') return [c]
  const list = initiativeList.value
  const idx = list.indexOf(c)
  if (idx < 0) return [c]
  // 向左扩展
  let start = idx
  while (start > 0 && list[start - 1].faction == c.faction) start--
  // 向右扩展
  let end = idx
  while (end < list.length - 1 && list[end + 1].faction == c.faction) end++
  return list.slice(start, end + 1)
}

function selectCreature(code: string): void {
  const c = thisCreatures.value.find((x) => x.code() == code)
  if (!c) return
  const group = getGroup(c)
  const idx = initiativeList.value.indexOf(c)
  memory.value.currentInitiativeIdx = idx >= 0 ? idx : memory.value.currentInitiativeIdx
  const next = new Set<string>()
  for (const g of group) next.add(g.code())
  activeCodes.value = next
  for (const x of thisCreatures.value) {
    x.inRound = next.has(x.code())
  }
}

function nextTurn(): void {
  const current = initiativeList.value[memory.value.currentInitiativeIdx]
  if (!current) return
  const currentGroup = getGroup(current)
  const lastInGroup = currentGroup[currentGroup.length - 1]
  const lastIdx = initiativeList.value.indexOf(lastInGroup)
  let next = lastIdx + 1
  if (next >= initiativeList.value.length) next = 0
  const nextC = initiativeList.value[next]
  if (nextC) selectCreature(nextC.code())
}

function prevTurn(): void {
  const current = initiativeList.value[memory.value.currentInitiativeIdx]
  if (!current) return
  const currentGroup = getGroup(current)
  const firstIdx = initiativeList.value.indexOf(currentGroup[0])
  let prev = firstIdx - 1
  if (prev < 0) prev = initiativeList.value.length - 1
  // 跳到前一组的最后一个
  const prevC = initiativeList.value[prev]
  if (!prevC) return
  const prevGroup = getGroup(prevC)
  const firstOfPrev = prevGroup[0]
  const firstOfPrevIdx = initiativeList.value.indexOf(firstOfPrev)
  if (firstOfPrevIdx >= 0) selectCreature(firstOfPrev.code())
}

function newRound(): void {
  for (const c of thisCreatures.value) c.resetRoundResources()
  advanceFieldRounds(mm)
  requestSceneDraw()
  if (initiativeList.value.length > 0) selectCreature(initiativeList.value[0].code())
}

function hpPct(c: Creature): number {
  return c.hpRatio()
}

// 从 mapMemory 获取 token 图片
function getTokenImg(code: string, name: string): string | null {
  const lower = code.toLowerCase()
  const entry = mm.assets.find(
    (asset) =>
      assetUsesToken(asset) &&
      (asset.key == code || asset.key.toLowerCase() == lower || asset.key == name)
  )
  return entry?.dataUrl ?? null
}
</script>

<template>
  <div
    ref="panelRef"
    class="initiative-panel"
    :class="[densityClass, { 'initiative-panel--transparent': memory.initiativeTransparent }]"
    :style="layoutVars"
  >
    <div v-if="initiativeList.length > 0" ref="cardsRef" class="init-cards">
      <div class="init-card-track">
        <div
          v-for="c in initiativeList"
          :key="c.code()"
          class="init-card"
          :class="{ 'init-card-active': activeCodes.has(c.code()) }"
          :style="{ '--init-faction-color': factionColor[c.faction] ?? '#888' }"
          @click="selectCreature(c.code())"
        >
          <div
            class="init-card-header"
            :style="{ backgroundColor: factionColor[c.faction] ?? '#888' }"
          >
            <span class="init-card-init">{{ c.name() }}</span>
          </div>
          <div class="init-card-art" :style="{ backgroundColor: factionBg[c.faction] ?? '#eee' }">
            <img
              v-if="getTokenImg(c.code(), c.name())"
              :src="getTokenImg(c.code(), c.name())!"
              class="init-token-img"
            />
            <span v-else class="init-card-name">{{ c.name().substring(0, 3) }}</span>
            <div class="init-hp-overlay" :style="{ height: (1 - hpPct(c)) * 100 + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="init-empty">暂无角色</div>

    <div class="init-control-shell">
      <button
        class="init-toggle"
        :title="controlsExpanded ? '收起控制菜单' : '展开控制菜单'"
        @click="controlsExpanded = !controlsExpanded"
      >
        {{ controlsExpanded ? '收起' : '菜单' }}
      </button>
      <span class="init-turn-info"
        ><span class="init-turn-current">{{ memory.currentInitiativeIdx + 1 }}</span
        ><span class="init-turn-total">/ {{ initiativeList.length }}</span></span
      >
      <div class="init-rail-nav">
        <button class="init-rail-button" title="上一位" @click="prevTurn"><</button>
        <button class="init-rail-button" title="下一位" @click="nextTurn">></button>
      </div>
    </div>

    <div v-if="controlsExpanded" class="init-controls">
      <div class="init-control-group">
        <button
          class="w3-button w3-tiny"
          :class="{ 'w3-black': memory.initMode === 'individual' }"
          @click="memory.initMode = 'individual'"
        >
          分别
        </button>
        <button
          class="w3-button w3-tiny"
          :class="{ 'w3-black': memory.initMode === 'grouped' }"
          @click="memory.initMode = 'grouped'"
        >
          合并
        </button>
      </div>
      <div class="init-control-group">
        <button
          class="w3-button w3-tiny"
          :class="{ 'w3-black': memory.initiativeTransparent }"
          @click="memory.initiativeTransparent = !memory.initiativeTransparent"
        >
          透明
        </button>
        <button class="w3-button w3-tiny" @click="newRound">新一轮</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.initiative-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  font-size: 12px;
  background: #fff;
  color: #222;
  --init-card-height: 88px;
  --init-active-card-height: 116px;
  --init-card-width: 56px;
  --init-active-card-width: 76px;
  --init-card-header-height: 18px;
  --init-card-name-size: 13px;
  --init-card-header-font-size: 10px;
}

.initiative-panel--transparent {
  background: transparent;
}
.init-control-shell {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  display: flex;
  width: 52px;
  flex-direction: column;
  align-items: stretch;
  border-left: 1px solid #e0e0e0;
  background: #f5f5f5;
}
.initiative-panel--transparent .init-control-shell {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(2px);
}
.init-toggle {
  width: 100%;
  height: 28px;
  flex: 0 0 28px;
  border: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: transparent;
  color: #666;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  line-height: 1;
}
.initiative-panel--transparent .init-toggle {
  background: rgba(255, 255, 255, 0.45);
}
.init-toggle:hover {
  background: #e8f0fe;
  color: #222;
}
.init-rail-nav {
  display: grid;
  flex: 0 0 30px;
  height: 30px;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.init-rail-button {
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #333;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
.init-rail-button + .init-rail-button {
  border-left: 1px solid rgba(0, 0, 0, 0.08);
}
.init-rail-button:hover {
  background: #e8f0fe;
}
.init-controls {
  position: absolute;
  top: 4px;
  right: 58px;
  z-index: 7;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: calc(100% - 48px);
  padding: 4px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
}
.initiative-panel--transparent .init-controls {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(3px);
}
.init-control-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.init-controls .w3-button {
  padding: 3px 8px;
  line-height: 1.2;
  white-space: nowrap;
}
.init-turn-info {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 3px 0;
  color: #666;
  text-align: center;
  white-space: nowrap;
}
.init-turn-current {
  color: #222;
  font-size: 16px;
  font-weight: 750;
  line-height: 1;
}
.init-turn-total {
  font-size: 10px;
  line-height: 1;
}
.init-cards {
  flex: 1;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  display: flex;
  align-items: center;
  padding: 4px 60px 4px 8px;
  min-height: 0;
}
.init-empty {
  display: grid;
  height: 100%;
  padding-right: 52px;
  place-items: center;
  color: #999;
}
.init-card-track {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-width: max-content;
  height: 100%;
  margin: 0 auto;
}
.init-card {
  flex-shrink: 0;
  box-sizing: border-box;
  width: var(--init-card-width);
  height: var(--init-card-height);
  max-height: 100%;
  border: 2px solid #ccc;
  border-color: var(--init-faction-color, #ccc);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition:
    width 0.15s,
    height 0.15s,
    border-width 0.15s,
    box-shadow 0.15s;
}
.init-card-active {
  width: var(--init-active-card-width);
  height: var(--init-active-card-height);
  border-width: 3px;
  border-color: #ffd700;
  box-shadow: 0 0 6px rgba(255, 215, 0, 0.6);
}
.init-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.init-card-header {
  flex: 0 0 var(--init-card-header-height);
  min-height: 0;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.init-card-init {
  color: #fff;
  font-weight: bold;
  font-size: var(--init-card-header-font-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.init-card-art {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 0;
}
.init-token-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}
.init-card-name {
  font-weight: 600;
  font-size: var(--init-card-name-size);
  color: #555;
  z-index: 1;
}
.init-hp-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(200, 40, 40, 0.7);
  z-index: 2;
  transition: height 0.3s;
  pointer-events: none;
}

.initiative-panel--tiny .init-toggle {
  height: 100%;
  flex: 0 0 38px;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  border-bottom: 0;
  font-size: 11px;
}

.initiative-panel--tiny .init-control-shell {
  top: 2px;
  right: 2px;
  bottom: auto;
  width: 136px;
  height: 26px;
  flex-direction: row;
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
}

.initiative-panel--tiny .init-controls {
  gap: 2px;
  top: 30px;
  right: 2px;
  max-width: calc(100% - 4px);
  padding: 2px;
}

.initiative-panel--tiny .init-control-group {
  gap: 2px;
}

.initiative-panel--tiny .init-controls .w3-button {
  padding: 1px 6px;
  font-size: 10px;
}

.initiative-panel--tiny .init-turn-info {
  flex: 1 1 auto;
  flex-direction: row;
  gap: 1px;
  min-width: 0;
  padding: 0 4px;
  font-size: 10px;
}

.initiative-panel--tiny .init-turn-current {
  font-size: 12px;
}

.initiative-panel--tiny .init-turn-total {
  font-size: 10px;
}

.initiative-panel--tiny .init-rail-nav {
  flex: 0 0 44px;
  height: 100%;
  border-top: 0;
  border-left: 1px solid rgba(0, 0, 0, 0.08);
}

.initiative-panel--tiny .init-rail-button {
  font-size: 12px;
}

.initiative-panel--tiny .init-cards {
  padding: 2px 6px;
}

.initiative-panel--tiny .init-card-header {
  display: none;
}

.initiative-panel--compact .init-controls .w3-button {
  padding: 2px 7px;
}

.initiative-panel--roomy .init-card-track {
  gap: 6px;
}
</style>
