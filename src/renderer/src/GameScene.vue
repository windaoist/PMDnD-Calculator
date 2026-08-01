<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, provide, watch } from 'vue'
import Creatures, { Creature } from './model/Creature'
import { showHP } from './model/Damage'
import {
  BattleMemory,
  CharacterMemory,
  FieldEditMemory,
  MainMemory,
  MapMemory,
  MoveMemory,
  StatusMemory,
  SurviveMemory,
  ToolsMemory,
  battleMemory,
  battleMemoryHeal,
  battleMemoryStatus,
  characterMemory,
  currentMove,
  envMemory,
  fieldEditMemory,
  mainMemory,
  mapMemory,
  moveMemory,
  onChangeSelectedCreature,
  statusMemory,
  surviveMemory,
  toolsMemory
} from './model/GlobalMemory'
import ContextMenu from './components/ContextMenu.vue'
import type { ContextMenuAction } from './components/ContextMenu.vue'
import { drawCanvasLabel } from './utils'
import SceneSidebar from './components/SceneSidebar.vue'
import SceneDockview from './components/SceneDockview.vue'
import CalculatorWorkbench from './components/CalculatorWorkbench.vue'
import type { DockviewReadyEvent } from 'dockview-vue'
import { readCardFromXlsx } from './model/CardReader'
import { extractCharacterSheetPngs, type XlsxSheetImage } from './model/XlsxImages'
import * as xlsx from 'xlsx'
import ESSerializer from 'esserializer'
import {
  Ability,
  Attribute,
  BattleAbility,
  ElemType,
  Equipment,
  ExtraResist,
  Feature,
  Item,
  Move,
  MovePower,
  Profile,
  Race,
  Relative,
  SizeAbility,
  Skill,
  Status
} from './model/DataType'
import { ResistManager, StatusManager } from './model/StatusManager'
import {
  assetUsesToken,
  normalizeMapAssets,
  saveCurrentBackgroundSettingsToAsset,
  upsertMapAsset
} from './model/MapAssets'
import type { QuickSaveSlotInfo } from './platform/types'
import {
  defaultPanelSizePreset,
  drawModes,
  factionColor,
  factionHpColor,
  panelSizePresets,
  type DrawMode
} from './gameScene/constants'
import {
  clampNumber,
  drawShapeHighlight,
  hitDrawing,
  pointInPolygon,
  snapPosition
} from './gameScene/canvasGeometry'
import { coneTrianglePoints } from './model/DrawingGeometry'
import { drawFallbackToken, isUsableTokenImage } from './gameScene/tokenRendering'
import { useSceneDockview } from './gameScene/useSceneDockview'
import { HistoryManager } from './gameScene/history'
import { appSettings, normalizeRenderScale, setWorkspaceMode } from './appSettings'
import { roundedCreatureTokenDistance } from './model/CreatureDistance'
import {
  drawingIsField,
  fieldColorForField,
  fieldLabelPoint,
  fieldRemainingText,
  isAreaDrawing,
  normalizeFieldData,
  pointInAreaDrawingGrid
} from './model/MapFields'

const thisCreatures = ref<Creature[]>(Creatures.value)
const mm = mapMemory.value
const creatureByCode = computed(
  () => new Map(thisCreatures.value.map((creature) => [creature.code(), creature]))
)
const tokenByCode = computed(() => new Map(mm.tokens.map((token) => [token.code, token])))
const minTokenImageScale = 0.25
const maxTokenImageScale = 3
const tokenImageScaleStep = 0.25

function normalizedTokenImageScale(value: unknown): number {
  if (value === undefined || value === null || value === '') return 1
  const scale = Number(value)
  return Number.isFinite(scale) ? clampNumber(scale, minTokenImageScale, maxTokenImageScale) : 1
}
const activeBackgroundAsset = computed(
  () => mm.assets.find((asset) => asset.key == mm.currentBackgroundKey) ?? null
)
const backgroundDataUrl = computed(() => activeBackgroundAsset.value?.dataUrl ?? '')
const containerRef = ref<HTMLDivElement | null>(null)
const calculatorMode = computed(() => appSettings.workspaceMode == 'calculator')
const calculatorHomeVisible = ref(true)
const openPanelCount = ref(0)
const openPanelIds = ref<ReadonlySet<string>>(new Set())
const activePanelId = ref('')
const calculatorHomeButtonLabel = computed(() =>
  calculatorHomeVisible.value && openPanelCount.value > 0
    ? `返回标签页（${openPanelCount.value}）`
    : '工作台首页'
)

// ── Dockview ──
const { dockviewApi, onDockviewReady, scheduleKeepFloatingPanelsReachable, cleanupDockview } =
  useSceneDockview(containerRef)

interface FloatingPanelBounds {
  x: number
  y: number
  width: number
  height: number
}

interface RegisteredPanel {
  component: string
  title: string
  params: Record<string, unknown>
}

const panelRegistry = new Map<string, RegisteredPanel>()
const rememberedFloatingBounds = new Map<string, FloatingPanelBounds>()
const rememberedFloatingPanelIds = new Set(['panel-initiative'])
let dockviewPanelMemoryDisposables: { dispose: () => void }[] = []

// ── 右键上下文菜单 ──
const ctxMenuVisible = ref(false)
const ctxMenuX = ref(0)
const ctxMenuY = ref(0)
const ctxMenuCode = ref('')
const ctxMenuTarget = ref<'token' | 'drawing' | 'fog'>('token')
const ctxMenuDrawingIdx = ref(-1)
const ctxMenuHighlight = ref<{
  type: 'drawing' | 'fog' | 'token'
  idx: number
  code?: string
} | null>(null)

const ctxMenuActions = computed<ContextMenuAction[]>(() => {
  if (ctxMenuTarget.value == 'fog') {
    return [
      { label: '移动', action: 'move-fog' },
      { label: '删除', action: 'delete-fog' }
    ]
  }
  if (ctxMenuTarget.value == 'drawing') {
    const actions: ContextMenuAction[] = [
      { label: '移动', action: 'move-drawing' },
      { label: '重涂颜色', action: 'recolor-drawing' },
      { label: '重涂为红色', action: 'recolor-drawing-red' },
      { label: '重涂为黄色', action: 'recolor-drawing-yellow' },
      { label: '重涂为绿色', action: 'recolor-drawing-green' },
      { label: '删除', action: 'delete-drawing' }
    ]
    if (isAreaDrawing(mm.drawings[ctxMenuDrawingIdx.value])) {
      actions.splice(5, 0, { label: '详细设置', action: 'field-details' })
    }
    return actions
  }
  if (!ctxMenuCode.value) return []
  const c = creatureByCode.value.get(ctxMenuCode.value)
  const token = tokenByCode.value.get(ctxMenuCode.value)
  const imageScale = normalizedTokenImageScale(token?.imageScale)
  const hpStr = c ? showHP([c.currentHP, c.tempHP]) : '?'
  return [
    { label: c ? c.name() : '???', action: '', disabled: true },
    { label: `HP: ${hpStr} / ${c ? c.maxHP() : '?'}`, action: '', disabled: true },
    { label: `PP: ${c ? c.currentPP : '?'} / ${c ? c.maxPP() : '?'}`, action: '', disabled: true },
    {
      label: c
        ? `${c.currentAction}/${c.currentBonusAction}/${c.currentReaction}/${c.currentMov.toFixed(2)}m`
        : '?',
      action: '',
      disabled: true
    },
    { label: '详细信息', action: 'open-sheet' },
    { label: '', action: '', separator: true },
    { label: '攻击/施法', action: 'battle' },
    { label: '状态管理', action: 'status' },
    { label: '', action: '', separator: true },
    { label: `立绘大小：${Math.round(imageScale * 100)}%`, action: '', disabled: true },
    {
      label: '缩小立绘',
      action: 'shrink-token-image',
      disabled: imageScale <= minTokenImageScale
    },
    {
      label: '放大立绘',
      action: 'enlarge-token-image',
      disabled: imageScale >= maxTokenImageScale
    },
    {
      label: '重置立绘大小',
      action: 'reset-token-image',
      disabled: imageScale == 1
    },
    { label: '', action: '', separator: true },
    { label: '刷新移动力', action: 'refresh-mov' }
  ]
})

function handleContextMenu(action: string): void {
  const adjustsTokenImage = [
    'shrink-token-image',
    'enlarge-token-image',
    'reset-token-image'
  ].includes(action)
  if (!adjustsTokenImage) {
    ctxMenuVisible.value = false
    ctxMenuHighlight.value = null
    draw()
  }

  if (ctxMenuTarget.value == 'fog') {
    if (action == 'delete-fog') {
      mm.fogPolygons.splice(ctxMenuDrawingIdx.value, 1)
      captureHistory('删除迷雾')
      draw()
      return
    }
    if (action == 'move-fog') {
      const poly = mm.fogPolygons[ctxMenuDrawingIdx.value]
      if (poly && poly.length >= 3) {
        drawingMoveBackup = poly.map((p) => ({ ...p }))
        drawingMoveOffset = { x: 0, y: 0 }
        dragMode = 'fogPolygon'
        dragCode = String(ctxMenuDrawingIdx.value)
        history.beginTransaction('移动迷雾')
        const point = canvasEventPoint({
          clientX: ctxMenuX.value,
          clientY: ctxMenuY.value
        } as MouseEvent)
        if (point) {
          dragStartX = point.wx
          dragStartY = point.wy
          dragOriginX = point.wx
          dragOriginY = point.wy
        }
      }
    }
    return
  }
  if (ctxMenuTarget.value == 'drawing') {
    const d = mm.drawings[ctxMenuDrawingIdx.value]
    if (!d) return
    if (action == 'field-details') {
      openFieldEditorForDrawing(ctxMenuDrawingIdx.value)
      return
    }
    if (action == 'delete-drawing') {
      mm.drawings.splice(ctxMenuDrawingIdx.value, 1)
      captureHistory('删除图形')
      draw()
      return
    }
    if (action == 'recolor-drawing') {
      d.color = drawColor.value
      d.alpha = drawAlpha.value
      if (d.field) d.field.color = drawColor.value
      captureHistory('重涂图形')
      draw()
      return
    }
    const quickColors: Record<string, string> = {
      'recolor-drawing-red': '#e53935',
      'recolor-drawing-yellow': '#f9a825',
      'recolor-drawing-green': '#43a047'
    }
    if (quickColors[action]) {
      d.color = quickColors[action]
      if (d.field) d.field.color = quickColors[action]
      captureHistory('重涂图形')
      draw()
      return
    }
    if (action == 'move-drawing') {
      const idx = ctxMenuDrawingIdx.value
      const d = mm.drawings[idx]
      if (d && d.points.length >= 2) {
        drawingMoveBackup = d.points.map((p) => ({ ...p }))
        drawingMoveOffset = { x: 0, y: 0 }
        dragMode = 'drawing'
        dragCode = String(idx)
        history.beginTransaction('移动图形')
        const point = canvasEventPoint({
          clientX: ctxMenuX.value,
          clientY: ctxMenuY.value
        } as MouseEvent)
        if (point) {
          dragStartX = point.wx
          dragStartY = point.wy
          dragOriginX = point.wx
          dragOriginY = point.wy
        }
      }
      return
    }
    return
  }

  const c = creatureByCode.value.get(ctxMenuCode.value)
  if (!c) return

  const token = tokenByCode.value.get(c.code())
  if (token) {
    const currentScale = normalizedTokenImageScale(token.imageScale)
    if (action == 'shrink-token-image') {
      token.imageScale = normalizedTokenImageScale(currentScale - tokenImageScaleStep)
      captureHistory('缩小立绘')
      draw()
      return
    }
    if (action == 'enlarge-token-image') {
      token.imageScale = normalizedTokenImageScale(currentScale + tokenImageScaleStep)
      captureHistory('放大立绘')
      draw()
      return
    }
    if (action == 'reset-token-image') {
      token.imageScale = 1
      captureHistory('重置立绘大小')
      draw()
      return
    }
  }

  switch (action) {
    case 'open-sheet':
      openPanel('CharacterFullPanel', `char-${c.code()}`, c.name(), { code: c.code() })
      break
    case 'battle':
      battleMemory.value.attacker = null
      battleMemory.value.defender = null
      onChangeSelectedCreature(c.code())
      openPanel('MultiTargetPanel', 'panel-multi', '施法', {})
      break
    case 'status':
      openStatusPanelForCode(c.code())
      break
    case 'refresh-mov':
      c.currentMov = c.sizeAbility.mov
      captureHistory('刷新移动力')
      draw()
      break
  }
}

function closeContextMenu(): void {
  ctxMenuVisible.value = false
  ctxMenuHighlight.value = null
  draw()
}

function shouldRememberFloatingBounds(panelId: string): boolean {
  return rememberedFloatingPanelIds.has(panelId)
}

function rememberFloatingBounds(panelId: string): void {
  const panel = dockviewApi.value?.getPanel(panelId)
  if (!shouldRememberFloatingBounds(panelId) || !panel || panel.api.location.type != 'floating') {
    return
  }
  const bounds = currentFloatingBounds(panelId)
  if (bounds) rememberedFloatingBounds.set(panelId, bounds)
}

function rememberTrackedFloatingBounds(): void {
  rememberedFloatingPanelIds.forEach((id) => rememberFloatingBounds(id))
}

function disposeDockviewPanelMemoryListeners(): void {
  dockviewPanelMemoryDisposables.forEach((disposable) => disposable.dispose())
  dockviewPanelMemoryDisposables = []
}

function handleDockviewReady(event: DockviewReadyEvent): void {
  onDockviewReady(event)
  disposeDockviewPanelMemoryListeners()
  const syncOpenPanelState = (): void => {
    openPanelCount.value = event.api.panels.length
    const nextOpenPanelIds = new Set<string>()
    event.api.panels.forEach((panel) => nextOpenPanelIds.add(panel.id))
    openPanelIds.value = nextOpenPanelIds
    activePanelId.value = event.api.activePanel?.id ?? ''
    if (calculatorMode.value && openPanelCount.value == 0) {
      calculatorHomeVisible.value = true
    }
  }
  dockviewPanelMemoryDisposables = [
    event.api.onDidLayoutChange(() => {
      rememberTrackedFloatingBounds()
      syncOpenPanelState()
    }),
    event.api.onDidActivePanelChange(() => syncOpenPanelState()),
    event.api.onDidAddPanel((panel) => {
      syncOpenPanelState()
      if (shouldRememberFloatingBounds(panel.id)) {
        nextTick(() => rememberFloatingBounds(panel.id))
      }
    }),
    event.api.onDidRemovePanel(() => nextTick(syncOpenPanelState))
  ]
  syncOpenPanelState()
  nextTick(rememberTrackedFloatingBounds)
}

function handleGlobalPointerFinished(): void {
  scheduleKeepFloatingPanelsReachable()
  requestAnimationFrame(rememberTrackedFloatingBounds)
}

function registerPanel(
  component: string,
  id: string,
  title: string,
  params?: Record<string, unknown>
): RegisteredPanel {
  const entry = {
    component,
    title,
    params: params ?? {}
  }
  panelRegistry.set(id, entry)
  return entry
}

function dockviewFloatingHostRect():
  DOMRect | { width: number; height: number; left: number; top: number } {
  const host = containerRef.value?.querySelector<HTMLElement>('.dv-floating-overlay-host')
  const rect = host?.getBoundingClientRect() ?? containerRef.value?.getBoundingClientRect()
  return rect ?? { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 }
}

function floatingBoundsFromAnchoredPosition(position: unknown): FloatingPanelBounds | null {
  if (!position || typeof position != 'object') return null
  const box = position as Record<string, unknown>
  const width = Number(box.width)
  const height = Number(box.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const hostRect = dockviewFloatingHostRect()
  const left = Number(box.left)
  const right = Number(box.right)
  const top = Number(box.top)
  const bottom = Number(box.bottom)
  const x = Number.isFinite(left) ? left : hostRect.width - right - width
  const y = Number.isFinite(top) ? top : hostRect.height - bottom - height
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y, width, height }
}

function floatingBoundsFromDockviewLayout(panelId: string): FloatingPanelBounds | null {
  const layout = dockviewApi.value?.toJSON()
  const floatingGroups = layout?.floatingGroups ?? []
  for (const group of floatingGroups) {
    if (group.data.views.includes(panelId)) {
      return floatingBoundsFromAnchoredPosition(group.position)
    }
  }
  return null
}

function floatingBoundsFromPanelElement(panelId: string): FloatingPanelBounds | null {
  const api = dockviewApi.value
  if (!api) return null
  const panel = api.getPanel(panelId)
  const groupElement = (panel?.group as unknown as { element?: HTMLElement } | undefined)?.element
  const resizeElement = groupElement?.closest<HTMLElement>('.dv-resize-container') ?? groupElement
  if (!resizeElement) return null
  const hostRect = dockviewFloatingHostRect()
  const rect = resizeElement.getBoundingClientRect()
  return {
    x: rect.left - hostRect.left,
    y: rect.top - hostRect.top,
    width: rect.width,
    height: rect.height
  }
}

function currentFloatingBounds(panelId: string): FloatingPanelBounds | null {
  const panel = dockviewApi.value?.getPanel(panelId)
  if (!panel || panel.api.location.type != 'floating') return null
  return floatingBoundsFromDockviewLayout(panelId) ?? floatingBoundsFromPanelElement(panelId)
}

function addDockedPanel(
  component: string,
  id: string,
  title: string,
  params?: Record<string, unknown>
): void {
  const api = dockviewApi.value
  if (!api) return
  const preset = panelSizePresets[component] ?? defaultPanelSizePreset
  const panelOptions = {
    id,
    component,
    title,
    params: params ?? {},
    minimumWidth: preset.minWidth,
    minimumHeight: preset.minHeight
  }
  registerPanel(component, id, title, params)
  const referencePanel = api.activePanel
  if (referencePanel) {
    api.addPanel({
      ...panelOptions,
      position: {
        referencePanel,
        direction: 'within'
      }
    })
  } else {
    api.addPanel(panelOptions)
  }
  api.getPanel(id)?.focus()
}

function addWorkspacePanel(
  component: string,
  id: string,
  title: string,
  params?: Record<string, unknown>
): void {
  addDockedPanel(component, id, title, params)
}

interface OpenPanelEntry extends RegisteredPanel {
  id: string
}

function currentOpenPanelEntries(): { panels: OpenPanelEntry[]; activeId?: string } {
  const api = dockviewApi.value
  if (!api) return { panels: [] }
  const panels: OpenPanelEntry[] = []
  api.panels.forEach((panel) => {
    const state = panel.toJSON()
    const registered = panelRegistry.get(panel.id)
    const component = registered?.component ?? state.contentComponent
    if (!component) return
    panels.push({
      id: panel.id,
      component,
      title: panel.title ?? registered?.title ?? state.title ?? panel.id,
      params: (state.params as Record<string, unknown> | undefined) ?? registered?.params ?? {}
    })
  })
  return {
    panels,
    activeId: api.activePanel?.id
  }
}

function migrateOpenPanelsForWorkspaceMode(): void {
  const api = dockviewApi.value
  if (!api) return
  // 地图和计算器是两个稳定视图。进入地图只隐藏计算标签页，不改变其布局。
  if (!calculatorMode.value) {
    nextTick(fitCanvas)
    return
  }
  const { panels, activeId } = currentOpenPanelEntries()
  if (panels.length == 0) {
    nextTick(fitCanvas)
    return
  }

  api.clear()
  panels.forEach((panel) => {
    addDockedPanel(panel.component, panel.id, panel.title, panel.params)
  })
  api.getPanel(activeId ?? panels.at(-1)?.id ?? '')?.focus()
  nextTick(fitCanvas)
}

// 打开工作区面板
function openPanel(
  component: string,
  id: string,
  title: string,
  params?: Record<string, unknown>
): void {
  if (!calculatorMode.value) setWorkspaceMode('calculator')
  calculatorHomeVisible.value = false
  const api = dockviewApi.value
  if (!api) return
  registerPanel(component, id, title, params)
  const existing = api.getPanel(id)
  if (existing) {
    existing.focus()
    return
  }
  addWorkspacePanel(component, id, title, params)
}

function openStatusPanelForCode(code: string): void {
  const creature = Creatures.value.find((item) => item.code() == code)
  if (!creature) return
  statusMemory.value.cur = creature
  creature.shallowRefresh()
  openPanel('StatusPanel', `status-${code}`, `${creature.name()} [${code}] · 状态`, { code })
}

function togglePanel(
  component: string,
  id: string,
  title: string,
  params?: Record<string, unknown>
): void {
  if (!calculatorMode.value) setWorkspaceMode('calculator')
  calculatorHomeVisible.value = false
  const existing = dockviewApi.value?.getPanel(id)
  if (existing) {
    existing.focus()
    return
  }
  openPanel(component, id, title, params)
}

function openFieldEditorForDrawing(idx: number): void {
  const drawing = mm.drawings[idx]
  if (!drawing) return
  fieldEditMemory.value.selectedDrawingIdx = idx
  fieldEditMemory.value.loadFieldData(drawing.field)
  openPanel('FieldEditPanel', 'panel-field-editor', '地图场地编辑', {})
}

function openFieldEditorForTemplate(): void {
  fieldEditMemory.value.selectedDrawingIdx = -1
  fieldEditMemory.value.bindNewDrawings = false
  openPanel('FieldEditPanel', 'panel-field-editor', '地图场地编辑', {})
}

function maybeAttachFieldToNewDrawing<T extends { type: string; field?: unknown }>(drawing: T): T {
  if (drawing.type != 'arrow' && drawing.type != 'ruler' && fieldEditMemory.value.bindNewDrawings) {
    drawing.field = fieldEditMemory.value.toFieldData()
  }
  return drawing
}

provide('openPanel', openPanel)
provide('openStatusPanel', openStatusPanelForCode)

function centerOnToken(code: string): void {
  const t = tokenByCode.value.get(code)
  const c = creatureByCode.value.get(code)
  if (!t || !c) return
  const wx = mm.offsetX + t.x * mm.cellSize
  const wy = mm.offsetY + t.y * mm.cellSize
  const canvas = canvasRef.value
  if (!canvas) return
  mm.viewX = canvas.width / 2 - wx * mm.viewScale
  mm.viewY = canvas.height / 2 - wy * mm.viewScale
  draw()
}
provide('centerOnToken', centerOnToken)
provide('requestSceneDraw', draw)

function prepareBattlePanelFromCastingTargets(): void {
  const attackerCode = battleMemory.value.attacker?.code()
  if (!attackerCode) return
  const attacker = Creatures.value.find((creature) => creature.code() == attackerCode)
  if (!attacker) return
  battleMemory.value.attacker = attacker
  attacker.shallowRefresh()

  const chosen = surviveMemory.value.chosen
  const defender = Creatures.value.find(
    (creature) => creature.code() != 'DM' && chosen.has(creature.code())
  )
  if (!defender) return
  battleMemory.value.defender = defender
  defender.shallowRefresh()
}

// ── 菜单栏 ──
const xlsxFileInput = ref<HTMLInputElement | null>(null)
const quickSaveSlots = ref<QuickSaveSlotInfo[]>([])
const history = new HistoryManager()

function currentQuickSlots(): QuickSaveSlotInfo[] {
  if (quickSaveSlots.value.length > 0) return quickSaveSlots.value
  return Array.from({ length: 10 }, (_, idx) => ({ slot: idx + 1, exists: false }))
}

const menuGroups = computed(() => {
  const slots = currentQuickSlots()
  const statusPanelItems = Creatures.value.map((creature) => ({
    label: `${creature.name()} · ${creature.code()}`,
    action: `panel-status-code-${encodeURIComponent(creature.code())}`
  }))
  return [
    {
      label: '角色',
      items: [
        { label: '角色列表', shortcut: 'Tab+1', action: 'panel-characters' },
        { label: '导入角色...', action: 'import-xlsx' }
      ]
    },
    {
      label: '战斗',
      items: [
        { label: '先攻指示器', shortcut: 'Tab+2', action: 'panel-initiative' },
        { label: '施法', action: 'panel-multi' },
        { label: '伤害详细编辑', action: 'panel-battle' },
        {
          label: '状态管理',
          disabled: statusPanelItems.length == 0,
          children: statusPanelItems
        }
      ]
    },
    {
      label: '检定',
      shortcut: 'Tab+3',
      action: 'panel-survive'
    },
    {
      label: '场景',
      items: [
        { label: '战术地图', action: 'workspace-map' },
        { label: '天气背景场地', shortcut: 'Tab+4', action: 'panel-weather' },
        { label: '地图场地编辑', shortcut: 'Tab+5', action: 'panel-field-editor' },
        { label: '背景设置', action: 'panel-background' },
        { label: '资产管理', action: 'panel-assets' }
      ]
    },
    {
      label: '工具',
      items: [
        { label: '日历', action: 'panel-calendar' },
        { label: '短休与长休', action: 'panel-rest' },
        { label: '擒抱', action: 'panel-grapple' },
        { label: '临时武器攻击及高空抛物', action: 'panel-fall-damage' },
        { label: '工匠装备打造', action: 'panel-crafting' },
        { label: '种族值标准化', action: 'panel-race-stats' }
      ]
    },
    {
      label: '存档',
      items: [
        { label: '存档到文件', action: 'save-dialog' },
        { label: '从文件读取', action: 'load-dialog' },
        { separator: true, label: '' },
        {
          label: '快速存档',
          shortcut: 'F5',
          children: slots.map((slot) => ({
            label: quickSlotText(slot),
            action: `quick-save-slot-${slot.slot}`
          }))
        },
        {
          label: '快速读取',
          shortcut: 'F9',
          children: slots.map((slot) => ({
            label: quickSlotText(slot),
            action: `quick-load-slot-${slot.slot}`,
            disabled: !slot.exists
          }))
        },
        {
          label: '删除快速存档',
          children: slots.map((slot) => ({
            label: quickSlotText(slot),
            action: `quick-delete-slot-${slot.slot}`,
            disabled: !slot.exists
          }))
        }
      ]
    },
    {
      label: '编辑',
      items: [
        {
          label: '撤销',
          shortcut: 'Ctrl/⌘+Z',
          action: 'history-undo',
          disabled: !history.canUndo.value
        },
        {
          label: '重做',
          shortcut: 'Ctrl/⌘+Shift+Z',
          action: 'history-redo',
          disabled: !history.canRedo.value
        },
        { separator: true, label: '' },
        { label: '设置', action: 'panel-settings' }
      ]
    },
    {
      label: '关于',
      items: [{ label: '关于PMDnD计算器', action: 'panel-about' }]
    }
  ]
})

function sidebarActionForPanelId(panelId: string): string {
  if (panelId == 'panel-map') return 'workspace-map'
  if (panelId == 'panel-chars') return 'panel-characters'
  if (panelId.startsWith('status-')) {
    return `panel-status-code-${encodeURIComponent(panelId.slice('status-'.length))}`
  }
  return panelId
}

const openedSidebarActions = computed<ReadonlySet<string>>(() => {
  const actions = new Set<string>()
  openPanelIds.value.forEach((panelId) => actions.add(sidebarActionForPanelId(panelId)))
  return actions
})

const activeSidebarAction = computed(() => sidebarActionForPanelId(activePanelId.value))

function importXlsx(): void {
  xlsxFileInput.value?.click()
}

function quickSlotText(slot: QuickSaveSlotInfo | undefined): string {
  if (!slot) return ''
  if (!slot.exists || !slot.updatedAt) return `${slot.slot}: 空`
  const date = new Date(slot.updatedAt)
  const text = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const characterCount = slot.characterCount ?? 0
  return `${slot.slot}: ${text} · ${characterCount}角色 · ${formatFileSize(slot.fileSizeBytes ?? 0)}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)} KB`
  }
  const mb = bytes / (1024 * 1024)
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(2)} MB`
}

async function refreshQuickSaveSlots(): Promise<void> {
  if (!window.api?.quickSaveSlots) return
  quickSaveSlots.value = await window.api.quickSaveSlots()
}

async function saveQuickSlot(slot: number): Promise<void> {
  if (!window.api || !hasContent()) return
  await window.api.quickSave(ESSerializerSerialize(), slot)
  await refreshQuickSaveSlots()
}

async function loadQuickSlot(slot: number): Promise<void> {
  if (!window.api) return
  const result = await window.api.quickLoad(slot)
  if (result.success && result.data) {
    loadFromJson(result.data)
  } else if (result.message) {
    alert(result.message)
  }
}

async function deleteQuickSlot(slot: number): Promise<void> {
  if (!window.api?.deleteQuickSave) return
  await window.api.deleteQuickSave(slot)
  await refreshQuickSaveSlots()
}

function characterPortraitAssetKey(code: string): string {
  return `portrait:${code}`
}

async function importCharacterSheetImages(
  creature: Creature,
  buffer: ArrayBuffer
): Promise<boolean> {
  const images = extractCharacterSheetPngs(buffer)
  if (images.length == 0) return false

  const sorted = [...images].sort((a, b) => b.area - a.area)
  const portraitSource = sorted[0]
  const tokenSource = sorted.length == 1 ? sorted[0] : sorted[1]
  const code = creature.code()

  const tokenAsset = upsertMapAsset(
    mm,
    code,
    tokenSource.dataUrl,
    'token',
    tokenSource.width,
    tokenSource.height
  )
  tokenAsset.tokenForCode = code

  const portrait = await normalizePortraitToThreeFour(portraitSource)
  const portraitAsset = upsertMapAsset(
    mm,
    characterPortraitAssetKey(code),
    portrait.dataUrl,
    'portrait',
    portrait.width,
    portrait.height
  )
  portraitAsset.portraitForCode = code

  return true
}

async function normalizePortraitToThreeFour(
  source: XlsxSheetImage
): Promise<{ dataUrl: string; width: number; height: number }> {
  try {
    const img = await loadDataUrlImage(source.dataUrl)
    const sourceWidth = img.naturalWidth || source.width
    const sourceHeight = img.naturalHeight || source.height
    const unit = Math.max(Math.ceil(sourceWidth / 3), Math.ceil(sourceHeight / 4), 1)
    const width = unit * 3
    const height = unit * 4
    if (width == sourceWidth && height == sourceHeight) {
      return { dataUrl: source.dataUrl, width, height }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { dataUrl: source.dataUrl, width: sourceWidth, height: sourceHeight }

    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(
      img,
      (width - sourceWidth) / 2,
      (height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight
    )
    return { dataUrl: canvas.toDataURL('image/png'), width, height }
  } catch {
    return { dataUrl: source.dataUrl, width: source.width, height: source.height }
  }
}

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = dataUrl
  })
}

function onXlsxChange(event: Event): void {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  for (let i = 0; i < input.files.length; i++) {
    const file = input.files[i]
    if (!file) continue
    const reader = new FileReader()
    reader.onload = async (e) => {
      if (!e.target?.result) return
      if (!(e.target.result instanceof ArrayBuffer)) return
      const buffer = e.target.result
      const wb = xlsx.read(buffer, { type: 'array' })
      try {
        const creature = readCardFromXlsx(wb)
        const importedImages = await importCharacterSheetImages(creature, buffer)
        const idx = Creatures.value.findIndex((c) => c.code() == creature.code())
        if (idx >= 0) Creatures.value[idx] = creature
        else Creatures.value.push(creature)
        ensureToken(creature.code())
        if (importedImages) loadTokenImages()
        captureHistory('导入角色')
        nextTick(() => draw())
      } catch (err) {
        alert(err instanceof Error ? err.message : '导入失败')
      }
    }
    reader.readAsArrayBuffer(file)
  }
  input.value = ''
}

function handleMenuSelect(action: string): void {
  if (action == 'workspace-home') {
    if (!calculatorMode.value) {
      setWorkspaceMode('calculator')
      calculatorHomeVisible.value = true
      return
    }
    calculatorHomeVisible.value =
      calculatorHomeVisible.value && openPanelCount.value > 0 ? false : true
    return
  }
  if (action == 'workspace-map') {
    openPanel('TacticalMapPanel', 'panel-map', '战术地图', {})
    return
  }
  if (action == 'workspace-calculator') {
    setWorkspaceMode('calculator')
    calculatorHomeVisible.value = true
    return
  }
  // 侧栏中的功能属于计算工作区：从地图进入时使用占满工作区的标签页。
  if (action.startsWith('panel-') && !calculatorMode.value) {
    setWorkspaceMode('calculator')
    calculatorHomeVisible.value = false
  }
  if (action == 'history-undo') {
    undoHistory()
    return
  }
  if (action == 'history-redo') {
    redoHistory()
    return
  }
  const statusPanelMatch = action.match(/^panel-status-code-(.+)$/)
  if (statusPanelMatch) {
    openStatusPanelForCode(decodeURIComponent(statusPanelMatch[1]))
    return
  }
  const quickSaveMatch = action.match(/^quick-save-slot-(\d+)$/)
  if (quickSaveMatch) {
    saveQuickSlot(Number(quickSaveMatch[1]))
    return
  }
  const quickLoadMatch = action.match(/^quick-load-slot-(\d+)$/)
  if (quickLoadMatch) {
    loadQuickSlot(Number(quickLoadMatch[1]))
    return
  }
  const quickDeleteMatch = action.match(/^quick-delete-slot-(\d+)$/)
  if (quickDeleteMatch) {
    deleteQuickSlot(Number(quickDeleteMatch[1]))
    return
  }
  if (action == 'import-xlsx') {
    importXlsx()
    return
  }
  if (action == 'panel-settings') {
    openPanel('SettingsPanel', 'panel-settings', '设置', {})
    return
  }
  if (action == 'save-dialog') {
    saveToFile()
    return
  }
  if (action == 'load-dialog') {
    loadFromFile()
    return
  }
  if (action == 'panel-characters') {
    openPanel('CharacterListPanel', 'panel-chars', '角色列表', {})
  } else if (action == 'panel-weather') {
    openPanel('WeatherFieldPanel', 'panel-weather', '天气背景场地', {})
  } else if (action == 'panel-field-editor') {
    openFieldEditorForTemplate()
  } else if (action == 'panel-assets') {
    openPanel('AssetManagerPanel', 'panel-assets', '资产管理', {})
  } else if (action == 'panel-background') {
    openPanel('BackgroundSettingsPanel', 'panel-background', '背景设置', {})
  } else if (action == 'panel-calendar') {
    openPanel('CalendarPanel', 'panel-calendar', '日历', {})
  } else if (action == 'panel-fall-damage') {
    openPanel('FallDamagePanel', 'panel-fall-damage', '临时武器攻击及高空抛物', {})
  } else if (action == 'panel-grapple') {
    openPanel('GrapplePanel', 'panel-grapple', '擒抱', {})
  } else if (action == 'panel-crafting') {
    openPanel('CraftingPanel', 'panel-crafting', '工匠装备打造', {})
  } else if (action == 'panel-rest') {
    openPanel('RestPanel', 'panel-rest', '短休与长休', {})
  } else if (action == 'panel-race-stats') {
    openPanel('RaceStatsPanel', 'panel-race-stats', '种族值标准化', {})
  } else if (action == 'panel-about') {
    openPanel('AboutPanel', 'panel-about', '关于PMDnD计算器', {})
  } else if (action == 'panel-battle') {
    prepareBattlePanelFromCastingTargets()
    openPanel('BattlePanel', 'panel-battle', '伤害详细编辑', {})
  } else if (action == 'panel-initiative') {
    openPanel('InitiativePanel', 'panel-initiative', '先攻', {})
  } else if (action == 'panel-multi') {
    openPanel('MultiTargetPanel', 'panel-multi', '施法', {})
  } else if (action == 'panel-status') {
    const creature =
      Creatures.value.find((item) => item.code() == statusMemory.value.cur?.code()) ??
      Creatures.value[0]
    if (creature) openStatusPanelForCode(creature.code())
  } else if (action == 'panel-survive') {
    togglePanel('SurvivePanel', 'panel-survive', '检定与豁免', {})
  }
}

// ── 工具栏状态 ──
const currentPolygon = ref<{ x: number; y: number }[]>([])

const drawMode = ref<DrawMode>('none')
const drawOrigin = ref<{ x: number; y: number } | null>(null)
const drawColor = ref('#e53935')
const drawAlpha = ref(0.3)
const drawWidth = ref(1)
const drawAngle = ref(53)
const gridSetupMode = ref(false)
const snapEnabled = ref(true)
const touchMoveCostMode = ref(false)
const drawPreviewPoint = ref<{ x: number; y: number } | null>(null)
const drawPending = ref<'none' | 'lineWidth' | 'sectorAngle'>('none')
let pendingOrigin = { x: 0, y: 0 }
let pendingEnd = { x: 0, y: 0 }

function enterDrawMode(mode: DrawMode): void {
  drawMode.value = drawMode.value == mode ? 'none' : mode
  if (mode == 'fog' && drawMode.value == 'fog') mm.fogVisible = true
  currentPolygon.value = []
  drawOrigin.value = null
  drawPreviewPoint.value = null
  drawPending.value = 'none'
  pendingOrigin = { x: 0, y: 0 }
  pendingEnd = { x: 0, y: 0 }
  draw()
}

function toggleFogVisible(): void {
  mm.fogVisible = !mm.fogVisible
  draw()
}

function setHPDisplayLevel(faction: string, level: number): void {
  mm.hpDisplayLevels[faction] = level
  draw()
}

function toggleGridSetup(): void {
  gridSetupMode.value = !gridSetupMode.value
  if (gridSetupMode.value) {
    const w = canvasWidth.value
    const h = canvasHeight.value
    mm.viewX = w / 2 - mm.offsetX * mm.viewScale
    mm.viewY = h / 2 - mm.offsetY * mm.viewScale
  }
  draw()
}

provide('gridSetupMode', gridSetupMode)
provide('toggleGridSetup', toggleGridSetup)

// ── Canvas ──
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWidth = ref<number>(1200)
const canvasHeight = ref<number>(800)
const defaultRenderScale = 4
const baseMinViewScale = 0.1 / defaultRenderScale
const baseMaxViewScale = 10 / defaultRenderScale
mm.viewScale = currentRenderScale()

let resizeObserver: ResizeObserver | null = null

function currentRenderScale(): number {
  return normalizeRenderScale(appSettings.renderScale)
}

function minViewScale(): number {
  return baseMinViewScale * currentRenderScale()
}

function maxViewScale(): number {
  return baseMaxViewScale * currentRenderScale()
}

const backgroundImageStyle = computed<Record<string, string>>(() => {
  const rs = currentRenderScale()
  const visualScale = mm.viewScale / rs
  return {
    width: `${mm.bgWorldW}px`,
    height: `${mm.bgWorldH}px`,
    transform: `translate3d(${mm.viewX / rs}px, ${mm.viewY / rs}px, 0) scale(${visualScale})`
  }
})

// 以下函数将在后续阶段集成（Token 操作、图片、背景）
function creatureFootprint(code: string): number {
  const c = creatureByCode.value.get(code)
  if (!c) return 1
  const s = c.sizeAbility.size
  return s < 1 ? 0.5 : Math.floor(s)
}

// ── Token 图片池 ──
const tokenImgCache = new Map<string, HTMLImageElement>()

function loadTokenImages(): void {
  normalizeMapAssets(mm)
  tokenImgCache.clear()
  for (const entry of mm.assets.filter(assetUsesToken)) {
    const img = new Image()
    img.onload = () => draw()
    img.src = entry.dataUrl
    tokenImgCache.set(entry.key, img)
    tokenImgCache.set(entry.key.toLowerCase(), img)
  }
}

function findTokenImage(code: string, name: string): HTMLImageElement | undefined {
  return (
    tokenImgCache.get(code) ??
    tokenImgCache.get(code.toLowerCase()) ??
    tokenImgCache.get(name) ??
    tokenImgCache.get(name.toLowerCase())
  )
}

function loadBgFromDataUrl(): void {
  normalizeMapAssets(mm)
  draw()
}

// ── 绘制 ──
let drawFrameId: number | null = null

function draw(): void {
  if (drawFrameId != null) return
  drawFrameId = window.requestAnimationFrame(() => {
    drawFrameId = null
    renderCanvas()
  })
}

function renderCanvas(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const s = mm.viewScale
  const vx = mm.viewX
  const vy = mm.viewY
  ctx.setTransform(s, 0, 0, s, vx, vy)
  const rs = currentRenderScale()

  // 网格
  const cs = mm.cellSize
  const ox = mm.offsetX
  const oy = mm.offsetY
  const worldLeft = -vx / s
  const worldTop = -vy / s
  const worldRight = (w - vx) / s
  const worldBottom = (h - vy) / s
  const a = Math.round(mm.gridAlpha * 255)
  ctx.strokeStyle = mm.gridColor + a.toString(16).padStart(2, '0')
  ctx.lineWidth = Math.max(0.1, Number(mm.gridLineWidth) || 0.5) * rs
  const gridDashLength = Math.max(0, Number(mm.gridDashLength) || 0)
  ctx.setLineDash(gridDashLength > 0 ? [gridDashLength, gridDashLength] : [])
  const startX = Math.floor((worldLeft - ox) / cs) * cs + ox
  const startY = Math.floor((worldTop - oy) / cs) * cs + oy
  for (let x = startX; x <= worldRight; x += cs) {
    ctx.beginPath()
    ctx.moveTo(x, worldTop)
    ctx.lineTo(x, worldBottom)
    ctx.stroke()
  }
  for (let y = startY; y <= worldBottom; y += cs) {
    ctx.beginPath()
    ctx.moveTo(worldLeft, y)
    ctx.lineTo(worldRight, y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Token 绘制
  const tokenData: {
    cx: number
    cy: number
    half: number
    size: number
    code: string
    tokImg: HTMLImageElement | undefined
    faction: string
    creature: Creature
  }[] = []

  for (const t of mm.tokens) {
    const c = creatureByCode.value.get(t.code)
    if (!c) continue
    const tokenColor = factionColor[c.faction] ?? t.color ?? '#e53935'
    const fp = c.sizeAbility.size < 1 ? 0.5 : Math.floor(c.sizeAbility.size)
    const size = fp * cs
    const position =
      dragMode == 'token' && dragCode == t.code && dragTokenPreview ? dragTokenPreview : t
    const cx = ox + position.x * cs
    const cy = oy + position.y * cs
    const half = size / 2
    const tokImg = findTokenImage(c.code(), c.name())

    ctx.shadowColor = tokenColor
    ctx.shadowBlur = Math.max(2, size * 0.15) * 2 * (rs / defaultRenderScale)
    if (isUsableTokenImage(tokImg)) {
      const iw = tokImg.naturalWidth
      const ih = tokImg.naturalHeight
      const scale = Math.min(size / iw, size / ih) * normalizedTokenImageScale(t.imageScale)
      const drawW = iw * scale
      const drawH = ih * scale
      const previousSmoothing = ctx.imageSmoothingEnabled
      const canvasScale = rs * (mm.viewScale || 1)
      ctx.imageSmoothingEnabled = drawW * canvasScale <= iw && drawH * canvasScale <= ih
      ctx.drawImage(tokImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH)
      ctx.imageSmoothingEnabled = previousSmoothing
    } else {
      drawFallbackToken(ctx, c, cx, cy, size, tokenColor, mm.viewScale)
    }
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    if (ctxMenuHighlight.value?.type == 'token' && ctxMenuHighlight.value?.code == t.code) {
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = (3 * rs) / s
      ctx.setLineDash([(6 * rs) / s, (3 * rs) / s])
      ctx.strokeRect(cx - half, cy - half, size, size)
      ctx.setLineDash([])
    }

    tokenData.push({
      cx,
      cy,
      half,
      size,
      code: t.code,
      tokImg,
      faction: c.faction,
      creature: c
    })
  }

  // 法术范围绘制
  for (let drawingIdx = 0; drawingIdx < mm.drawings.length; drawingIdx++) {
    const storedDrawing = mm.drawings[drawingIdx]
    const d =
      dragMode == 'drawing' &&
      Number(dragCode) == drawingIdx &&
      (drawingMoveOffset.x != 0 || drawingMoveOffset.y != 0)
        ? {
            ...storedDrawing,
            points: storedDrawing.points.map((point) => ({
              x: point.x + drawingMoveOffset.x,
              y: point.y + drawingMoveOffset.y
            }))
          }
        : storedDrawing
    ctx.globalAlpha = 1
    const fieldData = drawingIsField(d) ? normalizeFieldData(d.field) : null
    const renderColor = fieldData ? fieldColorForField(fieldData) : d.color
    const renderAlpha = fieldData ? Math.max(0.18, Math.min(0.45, d.alpha || 0.28)) : d.alpha
    const alphaHex = Math.round(renderAlpha * 255)
      .toString(16)
      .padStart(2, '0')
    ctx.fillStyle = renderColor + alphaHex
    ctx.strokeStyle = renderColor
    ctx.lineWidth = ((fieldData ? 3 : 2) * rs) / (mm.viewScale || 1)
    ctx.setLineDash(
      fieldData ? [(9 * rs) / (mm.viewScale || 1), (5 * rs) / (mm.viewScale || 1)] : []
    )
    if (d.type == 'rectangle') {
      const [p1, p2] = d.points
      const x = Math.min(p1.x, p2.x)
      const y = Math.min(p1.y, p2.y)
      const w = Math.abs(p2.x - p1.x)
      const h = Math.abs(p2.y - p1.y)
      ctx.fillRect(ox + x * cs, oy + y * cs, w * cs, h * cs)
      ctx.lineWidth = ((fieldData ? 3 : 2) * rs) / (mm.viewScale || 1)
      ctx.strokeStyle = renderColor
      ctx.strokeRect(ox + x * cs, oy + y * cs, w * cs, h * cs)
    } else if (d.type == 'ruler') {
      dashedLine(
        ctx,
        ox + d.points[0].x * cs,
        oy + d.points[0].y * cs,
        ox + d.points[1].x * cs,
        oy + d.points[1].y * cs,
        d.color,
        (4 * rs) / (mm.viewScale || 1),
        [(16 * rs) / (mm.viewScale || 1), (8 * rs) / (mm.viewScale || 1)]
      )
    } else if (d.type == 'arrow') {
      const x1 = ox + d.points[0].x * cs
      const y1 = oy + d.points[0].y * cs
      const x2 = ox + d.points[1].x * cs
      const y2 = oy + d.points[1].y * cs
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const headLen = cs * 0.22
      const headAngle = Math.PI / 7
      const shaftEndX = x2 - headLen * Math.cos(angle) * 0.8
      const shaftEndY = y2 - headLen * Math.sin(angle) * 0.7
      ctx.strokeStyle = renderColor
      ctx.fillStyle = renderColor
      ctx.globalAlpha = 1
      ctx.lineWidth = (4 * rs) / (mm.viewScale || 1)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(shaftEndX, shaftEndY)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - headAngle),
        y2 - headLen * Math.sin(angle - headAngle)
      )
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + headAngle),
        y2 - headLen * Math.sin(angle + headAngle)
      )
      ctx.closePath()
      ctx.fill()
    } else if (d.type == 'cone') {
      const triangle = coneTrianglePoints(d)
      if (triangle) {
        ctx.beginPath()
        ctx.moveTo(ox + triangle[0].x * cs, oy + triangle[0].y * cs)
        ctx.lineTo(ox + triangle[1].x * cs, oy + triangle[1].y * cs)
        ctx.lineTo(ox + triangle[2].x * cs, oy + triangle[2].y * cs)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    } else if (d.type == 'circle') {
      const [p1, p2] = d.points
      const cx = ox + p1.x * cs
      const cy = oy + p1.y * cs
      const cr = Math.hypot(p2.x - p1.x, p2.y - p1.y) * cs
      ctx.beginPath()
      ctx.arc(cx, cy, cr, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else if (d.type == 'sector') {
      const [p1, p2] = d.points
      const x1 = ox + p1.x * cs
      const y1 = oy + p1.y * cs
      const x2 = ox + p2.x * cs
      const y2 = oy + p2.y * cs
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const r = Math.hypot(x2 - x1, y2 - y1)
      const half = ((d.angle || 45) * Math.PI) / 360
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1 + r * Math.cos(angle - half), y1 + r * Math.sin(angle - half))
      ctx.arc(x1, y1, r, angle - half, angle + half)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    } else if (d.type == 'polygon' && d.points.length >= 3) {
      ctx.beginPath()
      ctx.moveTo(ox + d.points[0].x * cs, oy + d.points[0].y * cs)
      for (let i = 1; i < d.points.length; i++) {
        ctx.lineTo(ox + d.points[i].x * cs, oy + d.points[i].y * cs)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.setLineDash([])
    if (fieldData) {
      const labelPoint = fieldLabelPoint(d)
      if (labelPoint) {
        drawCanvasLabel(
          ctx,
          `${fieldData.stateName} ${fieldData.layers}层 / ${fieldRemainingText(fieldData.remainingRounds)}`,
          ox + labelPoint.x * cs,
          oy + labelPoint.y * cs,
          s,
          rs,
          vx,
          vy,
          { fontSize: 10, bold: true }
        )
      }
    }
  }
  ctx.globalAlpha = 1

  // Token 叠加层
  for (const td of tokenData) {
    const c = td.creature
    const hpLevel = mm.hpDisplayLevels[c.faction] ?? 0
    const hpPct = Math.max(0, Math.min(1, c.hpRatio()))
    const barH = Math.max(2 / (mm.viewScale || 1), td.size * 0.08)
    const barY = td.cy + td.half - barH - 2 / (mm.viewScale || 1)

    if (hpLevel >= 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(td.cx - td.half, barY, td.size, barH)
      ctx.fillStyle = factionHpColor[c.faction] ?? '#4caf50'
      ctx.fillRect(td.cx - td.half, barY, td.size * hpPct, barH)

      const fs = Math.max(6, cs * 0.08) * 2
      const rx = td.cx + td.half - 2 / (mm.viewScale || 1)
      ctx.font = `bold ${fs}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`
      ctx.textAlign = 'right'
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = fs * 0.15

      if (hpLevel >= 2) {
        ctx.textBaseline = 'middle'
        ctx.strokeText(`${c.currentHP}`, rx, barY + barH / 2)
        ctx.fillStyle = '#fff'
        ctx.fillText(`${c.currentHP}`, rx, barY + barH / 2)
        if (c.tempHP > 0) {
          ctx.textBaseline = 'alphabetic'
          ctx.strokeText(`+${c.tempHP}`, rx, barY + barH / 2 - fs * 0.6)
          ctx.fillStyle = '#ffd54f'
          ctx.fillText(`+${c.tempHP}`, rx, barY + barH / 2 - fs * 0.6)
        }
      } else {
        let displayPct = Math.floor(hpPct * 100)
        if (c.currentHP > 0 && displayPct == 0) displayPct = 1
        ctx.textBaseline = 'middle'
        ctx.strokeText(`${displayPct}%`, rx, barY + barH / 2)
        ctx.fillStyle = '#fff'
        ctx.fillText(`${displayPct}%`, rx, barY + barH / 2)
      }
      if (hpLevel >= 3) {
        const ppFs = Math.max(6, cs * 0.07) * 2
        ctx.font = `bold ${ppFs}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'
        ctx.lineWidth = ppFs * 0.15
        const ppx = td.cx - td.half + 2 / (mm.viewScale || 1)
        const ppy = td.cy - td.half + ppFs + 2 / (mm.viewScale || 1)
        ctx.strokeText(`${c.currentPP}`, ppx, ppy)
        ctx.fillStyle = '#4dc9f6'
        ctx.fillText(`${c.currentPP}`, ppx, ppy)
      }
    }
  }

  // 当前正在编辑的多边形预览（draw 模式）
  if ((drawMode.value == 'polygon' || drawMode.value == 'fog') && currentPolygon.value.length > 0) {
    const isFog = drawMode.value == 'fog'
    const halfAlpha = Math.round(drawAlpha.value * 0.5 * 255)
      .toString(16)
      .padStart(2, '0')
    ctx.fillStyle = isFog ? 'transparent' : drawColor.value + halfAlpha
    ctx.strokeStyle = drawColor.value
    ctx.lineWidth = (2 * rs) / s
    ctx.setLineDash([(8 * rs) / s, (4 * rs) / s])
    ctx.beginPath()
    ctx.moveTo(ox + currentPolygon.value[0].x * cs, oy + currentPolygon.value[0].y * cs)
    for (const pt of currentPolygon.value) ctx.lineTo(ox + pt.x * cs, oy + pt.y * cs)
    if (drawPreviewPoint.value) {
      ctx.lineTo(ox + drawPreviewPoint.value.x * cs, oy + drawPreviewPoint.value.y * cs)
      if (currentPolygon.value.length >= 2)
        ctx.lineTo(ox + currentPolygon.value[0].x * cs, oy + currentPolygon.value[0].y * cs)
    } else if (currentPolygon.value.length >= 3) {
      ctx.closePath()
    }
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    for (const pt of currentPolygon.value) {
      ctx.fillStyle = drawColor.value
      ctx.beginPath()
      ctx.arc(ox + pt.x * cs, oy + pt.y * cs, (3 * rs) / s, 0, Math.PI * 2)
      ctx.fill()
    }
    if (currentPolygon.value.length >= 2 && !drawPreviewPoint.value) {
      const first = currentPolygon.value[0]
      const last = currentPolygon.value[currentPolygon.value.length - 1]
      ctx.strokeStyle = drawColor.value
      ctx.lineWidth = (1 * rs) / s
      ctx.setLineDash([(4 * rs) / s, (4 * rs) / s])
      ctx.beginPath()
      ctx.moveTo(ox + last.x * cs, oy + last.y * cs)
      ctx.lineTo(ox + first.x * cs, oy + first.y * cs)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // 二阶段预览（线形宽度 / 扇形角度）
  if (drawPending.value == 'lineWidth' && drawMode.value == 'line') {
    const p1 = pendingOrigin
    const p2 = pendingEnd
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const len = Math.hypot(dx, dy)
    if (len > 0) {
      const nx = -dy / len
      const ny = dx / len
      const hwGrid = drawPreviewPoint.value ? drawPreviewPoint.value.x / 2 : 0
      const alphaHex = Math.round(drawAlpha.value * 255)
        .toString(16)
        .padStart(2, '0')
      ctx.fillStyle = drawColor.value + alphaHex
      ctx.strokeStyle = drawColor.value
      ctx.lineWidth = (2 * rs) / s
      ctx.beginPath()
      ctx.moveTo(ox + (p1.x + nx * hwGrid) * cs, oy + (p1.y + ny * hwGrid) * cs)
      ctx.lineTo(ox + (p1.x - nx * hwGrid) * cs, oy + (p1.y - ny * hwGrid) * cs)
      ctx.lineTo(ox + (p2.x - nx * hwGrid) * cs, oy + (p2.y - ny * hwGrid) * cs)
      ctx.lineTo(ox + (p2.x + nx * hwGrid) * cs, oy + (p2.y + ny * hwGrid) * cs)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = drawColor.value
      ctx.lineWidth = (1 * rs) / s
      ctx.setLineDash([(4 * rs) / s, (4 * rs) / s])
      ctx.beginPath()
      ctx.moveTo(ox + p1.x * cs, oy + p1.y * cs)
      ctx.lineTo(ox + p2.x * cs, oy + p2.y * cs)
      ctx.stroke()
      ctx.setLineDash([])
      const width = drawPreviewPoint.value ? drawPreviewPoint.value.x : 0
      const dist = Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 100) / 100
      drawCanvasLabel(
        ctx,
        `长度: ${dist.toFixed(2)}m  宽度: ${width.toFixed(2)}m`,
        ox + ((p1.x + p2.x) / 2) * cs,
        oy + ((p1.y + p2.y) / 2) * cs - (12 * rs) / s,
        s,
        rs,
        vx,
        vy,
        { bold: true }
      )
    }
  }
  if (drawPending.value == 'sectorAngle' && drawMode.value == 'sector') {
    const p1 = pendingOrigin
    const p2 = pendingEnd
    const wx1 = ox + p1.x * cs
    const wy1 = oy + p1.y * cs
    const wx2 = ox + p2.x * cs
    const wy2 = oy + p2.y * cs
    const angle = Math.atan2(wy2 - wy1, wx2 - wx1)
    const r = Math.hypot(wx2 - wx1, wy2 - wy1)
    const angleDeg = drawPreviewPoint.value ? drawPreviewPoint.value.x : 45
    const half = (angleDeg * Math.PI) / 360
    const alphaHex = Math.round(drawAlpha.value * 255)
      .toString(16)
      .padStart(2, '0')
    ctx.fillStyle = drawColor.value + alphaHex
    ctx.strokeStyle = drawColor.value
    ctx.lineWidth = (2 * rs) / s
    ctx.beginPath()
    ctx.moveTo(wx1, wy1)
    ctx.lineTo(wx1 + r * Math.cos(angle - half), wy1 + r * Math.sin(angle - half))
    ctx.arc(wx1, wy1, r, angle - half, angle + half)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    const dist = Math.ceil((r * 100) / cs) / 100
    drawCanvasLabel(
      ctx,
      `距离: ${dist.toFixed(2)}m  角度: ${angleDeg}°`,
      ox + ((p1.x + p2.x) / 2) * cs,
      oy + ((p1.y + p2.y) / 2) * cs - (12 * rs) / s,
      s,
      rs,
      vx,
      vy,
      { bold: true }
    )
  }

  // 绘制中：预览（线形宽度确认阶段不参与）
  if (
    drawOrigin.value &&
    drawMode.value != 'none' &&
    drawMode.value != 'polygon' &&
    drawMode.value != 'fog' &&
    drawPending.value == 'none'
  ) {
    const p = drawOrigin.value
    ctx.fillStyle = drawColor.value
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = (2 * rs) / s
    ctx.beginPath()
    ctx.arc(ox + p.x * cs, oy + p.y * cs, 4 / s, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    if (drawPreviewPoint.value) {
      const p2 = drawPreviewPoint.value
      ctx.fillStyle = drawColor.value
      ctx.beginPath()
      ctx.arc(ox + p2.x * cs, oy + p2.y * cs, 4 / s, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (drawMode.value == 'rectangle') {
        const [rx, ry] = [Math.min(p.x, p2.x), Math.min(p.y, p2.y)]
        const [rw, rh] = [Math.abs(p2.x - p.x), Math.abs(p2.y - p.y)]
        const alphaHex = Math.round(drawAlpha.value * 255)
          .toString(16)
          .padStart(2, '0')
        ctx.fillStyle = drawColor.value + alphaHex
        ctx.fillRect(ox + rx * cs, oy + ry * cs, rw * cs, rh * cs)
        ctx.strokeStyle = drawColor.value
        ctx.lineWidth = (2 * rs) / s
        ctx.strokeRect(ox + rx * cs, oy + ry * cs, rw * cs, rh * cs)
      } else if (drawMode.value == 'arrow') {
        const ax1 = ox + p.x * cs
        const ay1 = oy + p.y * cs
        const ax2 = ox + p2.x * cs
        const ay2 = oy + p2.y * cs
        const angle = Math.atan2(ay2 - ay1, ax2 - ax1)
        const headLen = cs * 0.22
        const headAngle = Math.PI / 7
        const shaftEndX = ax2 - headLen * Math.cos(angle) * 0.8
        const shaftEndY = ay2 - headLen * Math.sin(angle) * 0.7
        ctx.strokeStyle = drawColor.value
        ctx.lineWidth = (3 * rs) / s
        ctx.beginPath()
        ctx.moveTo(ax1, ay1)
        ctx.lineTo(shaftEndX, shaftEndY)
        ctx.stroke()
        ctx.fillStyle = drawColor.value
        ctx.beginPath()
        ctx.moveTo(ax2, ay2)
        ctx.lineTo(
          ax2 - headLen * Math.cos(angle - headAngle),
          ay2 - headLen * Math.sin(angle - headAngle)
        )
        ctx.lineTo(
          ax2 - headLen * Math.cos(angle + headAngle),
          ay2 - headLen * Math.sin(angle + headAngle)
        )
        ctx.closePath()
        ctx.fill()
      } else if (drawMode.value == 'cone') {
        const alphaHex = Math.round(drawAlpha.value * 255)
          .toString(16)
          .padStart(2, '0')
        ctx.fillStyle = drawColor.value + alphaHex
        ctx.strokeStyle = drawColor.value
        ctx.lineWidth = (2 * rs) / s
        const triangle = coneTrianglePoints({
          points: [p, p2],
          angle: drawAngle.value
        })
        if (triangle) {
          ctx.beginPath()
          ctx.moveTo(ox + triangle[0].x * cs, oy + triangle[0].y * cs)
          ctx.lineTo(ox + triangle[1].x * cs, oy + triangle[1].y * cs)
          ctx.lineTo(ox + triangle[2].x * cs, oy + triangle[2].y * cs)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      } else if (drawMode.value == 'circle') {
        const cx = ox + p.x * cs
        const cy = oy + p.y * cs
        const cr = Math.hypot(p2.x - p.x, p2.y - p.y) * cs
        const alphaHex = Math.round(drawAlpha.value * 255)
          .toString(16)
          .padStart(2, '0')
        ctx.fillStyle = drawColor.value + alphaHex
        ctx.strokeStyle = drawColor.value
        ctx.lineWidth = (2 * rs) / s
        ctx.beginPath()
        ctx.arc(cx, cy, cr, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.strokeStyle = drawColor.value
        ctx.lineWidth = (2 * rs) / s
        ctx.setLineDash([(16 * rs) / s, (8 * rs) / s])
        ctx.beginPath()
        ctx.moveTo(ox + p.x * cs, oy + p.y * cs)
        ctx.lineTo(ox + p2.x * cs, oy + p2.y * cs)
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (
        drawMode.value == 'ruler' ||
        drawMode.value == 'arrow' ||
        drawMode.value == 'rectangle' ||
        drawMode.value == 'line' ||
        drawMode.value == 'cone' ||
        drawMode.value == 'sector' ||
        drawMode.value == 'circle'
      ) {
        const dist = Math.ceil(Math.hypot(p2.x - p.x, p2.y - p.y) * 100) / 100
        drawCanvasLabel(
          ctx,
          `距离: ${dist.toFixed(2)}m`,
          ox + p2.x * cs,
          oy + p2.y * cs - (8 * rs) / s,
          s,
          rs,
          vx,
          vy,
          { bold: true }
        )
      }
    }
  }

  // 迷雾（多边形取并后统一填充）
  if (mm.fogPolygons.length > 0 && mm.fogVisible) {
    ctx.fillStyle = `rgba(0,0,0,${mm.fogAlpha})`
    ctx.beginPath()
    for (let fogIdx = 0; fogIdx < mm.fogPolygons.length; fogIdx++) {
      const storedPoly = mm.fogPolygons[fogIdx]
      const poly =
        dragMode == 'fogPolygon' &&
        Number(dragCode) == fogIdx &&
        (drawingMoveOffset.x != 0 || drawingMoveOffset.y != 0)
          ? storedPoly.map((point) => ({
              x: point.x + drawingMoveOffset.x,
              y: point.y + drawingMoveOffset.y
            }))
          : storedPoly
      if (poly.length < 3) continue
      ctx.moveTo(ox + poly[0].x * cs, oy + poly[0].y * cs)
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(ox + poly[i].x * cs, oy + poly[i].y * cs)
      }
      ctx.closePath()
    }
    ctx.fill()
  }

  // ── 右键菜单高亮 ──
  if (ctxMenuHighlight.value) {
    const hl = ctxMenuHighlight.value
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = (4 * rs) / (mm.viewScale || 1)
    ctx.setLineDash([(6 * rs) / (mm.viewScale || 1), (4 * rs) / (mm.viewScale || 1)])
    if (hl.type == 'drawing') {
      const d = mm.drawings[hl.idx]
      if (d) drawShapeHighlight(ctx, d, ox, oy, cs)
    } else {
      const poly = mm.fogPolygons[hl.idx]
      if (poly && poly.length >= 3) {
        ctx.beginPath()
        ctx.moveTo(ox + poly[0].x * cs, oy + poly[0].y * cs)
        for (let i = 1; i < poly.length; i++) ctx.lineTo(ox + poly[i].x * cs, oy + poly[i].y * cs)
        ctx.closePath()
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }

  // 拖拽位移提示（轨迹虚线 + 距离文本）
  if (dragMode && (dragMode == 'token' || dragMode == 'fogPolygon' || dragMode == 'drawing')) {
    const mxWorld = (canvasMousePos.x - vx) / s
    const myWorld = (canvasMousePos.y - vy) / s
    let dx: number, dy: number
    let autoAttackTarget: (typeof mm.tokens)[number] | undefined
    if (dragMode == 'token') {
      dx = dragTokenPreview ? dragTokenPreview.x - dragTokenStartX : 0
      dy = dragTokenPreview ? dragTokenPreview.y - dragTokenStartY : 0
      if (dragTokenPreview && !dragMoveCost) {
        autoAttackTarget = findAutoAttackTarget(dragCode, {
          x: dragTokenDropX,
          y: dragTokenDropY
        })
      }
    } else {
      dx = snapPrecision((mxWorld - dragOriginX) / cs)
      dy = snapPrecision((myWorld - dragOriginY) / cs)
    }
    if (dx != 0 || dy != 0) {
      if (dragMode == 'token') {
        const [lineStart, lineEnd] = autoAttackTarget
          ? autoAttackPoints(autoAttackTarget)
          : [
              { x: dragTokenStartX, y: dragTokenStartY },
              { x: dragTokenStartX + dx, y: dragTokenStartY + dy }
            ]
        dashedLine(
          ctx,
          ox + lineStart.x * cs,
          oy + lineStart.y * cs,
          ox + lineEnd.x * cs,
          oy + lineEnd.y * cs,
          '#fff',
          2 / s,
          [6 / s, 4 / s]
        )
      }
      const dist = dragMode == 'token' ? Math.ceil(Math.hypot(dx, dy) * 100) / 100 : 0
      let text: string
      let textBold = false
      let textWarn = false
      if (dragMode == 'token' && dragMoveCost) {
        text = `移动距离: ${dist.toFixed(2)}m/${dragMoveStartPoints.toFixed(2)}m`
        if (dist > dragMoveStartPoints) {
          textBold = true
          textWarn = true
        }
      } else if (dragMode == 'token') {
        if (autoAttackTarget) {
          const attackDistance = autoAttackDistance(autoAttackTarget)
          text = `攻击：距离 ${attackDistance.toFixed(2)}m`
          textBold = true
        } else {
          text = `移动距离: ${dist.toFixed(2)}m`
        }
      } else {
        text = `Δx: ${dx.toFixed(2)}m  Δy: ${dy.toFixed(2)}m`
      }
      const fontSize = 14 * rs
      const sx = (mxWorld + (8 * rs) / s) * s + vx
      const sy = (myWorld - (8 * rs) / s) * s + vy
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.font = `${textBold ? 'bold ' : ''}${fontSize}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`
      const tw = ctx.measureText(text).width
      const pad = 4 * rs
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(sx - pad, sy - fontSize - pad, tw + pad * 2, fontSize + pad * 2)
      ctx.fillStyle = textWarn ? '#ff9999' : '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(text, sx, sy)
      ctx.restore()
    }
  }

  // 格子设置模式高亮
  if (gridSetupMode.value) {
    ctx.fillStyle = '#ff0'
    ctx.beginPath()
    ctx.arc(ox, oy, Math.max(4, cs * 0.15), 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = (2 * rs) / s
    ctx.stroke()
    ctx.fillStyle = '#0ff'
    ctx.beginPath()
    ctx.arc(ox + cs, oy, Math.max(4, cs * 0.15), 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.stroke()
    dashedLine(ctx, ox, oy, ox + cs, oy, '#0ff', (4 * rs) / s, [(16 * rs) / s, (8 * rs) / s])
  }
}

function finalizeSector(): void {
  const p1 = pendingOrigin
  const p2 = pendingEnd
  if (Math.hypot(p2.x - p1.x, p2.y - p1.y) == 0) {
    cancelPendingDrawing()
    return
  }
  const angleDeg = drawPreviewPoint.value ? drawPreviewPoint.value.x : 45
  mm.drawings.push(
    maybeAttachFieldToNewDrawing({
      type: 'sector',
      color: drawColor.value,
      alpha: drawAlpha.value,
      points: [{ ...p1 }, { ...p2 }],
      width: 0,
      angle: angleDeg
    } as any)
  )
  captureHistory('绘制扇形')
  drawPending.value = 'none'
  drawOrigin.value = null
  drawPreviewPoint.value = null
  draw()
}

function finalizeLine(): void {
  if (!drawOrigin.value || !drawPreviewPoint.value) {
    cancelPendingDrawing()
    return
  }
  const p1 = pendingOrigin
  const p2 = pendingEnd
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.hypot(dx, dy)
  if (len == 0) {
    cancelPendingDrawing()
    return
  }
  const nx = -dy / len
  const ny = dx / len
  const hwGrid = drawPreviewPoint.value.x / 2
  if (hwGrid == 0) {
    cancelPendingDrawing()
    return
  }
  const pts = [
    { x: p1.x + nx * hwGrid, y: p1.y + ny * hwGrid },
    { x: p1.x - nx * hwGrid, y: p1.y - ny * hwGrid },
    { x: p2.x - nx * hwGrid, y: p2.y - ny * hwGrid },
    { x: p2.x + nx * hwGrid, y: p2.y + ny * hwGrid }
  ]
  mm.drawings.push(
    maybeAttachFieldToNewDrawing({
      type: 'polygon',
      color: drawColor.value,
      alpha: drawAlpha.value,
      points: pts,
      width: 0,
      angle: 0
    } as any)
  )
  captureHistory('绘制线形')
  drawPending.value = 'none'
  drawOrigin.value = null
  drawPreviewPoint.value = null
  draw()
}

function cancelPendingDrawing(): void {
  dragMode = null
  drawPending.value = 'none'
  drawOrigin.value = null
  drawPreviewPoint.value = null
  pendingOrigin = { x: 0, y: 0 }
  pendingEnd = { x: 0, y: 0 }
  draw()
}

function dashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  w: number,
  dash: number[]
): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = w + 2 * currentRenderScale()
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
}

// ── 鼠标交互 ──
let dragMode:
  | 'token'
  | 'pan'
  | 'fogPolygon'
  | 'drawing'
  | 'origin'
  | 'oneMeter'
  | 'drawShape'
  | 'pinch'
  | null = null
let dragCode: string = ''
let dragStartX = 0
let dragStartY = 0
let panStartVX = 0
let panStartVY = 0
let panStartOffX = 0
let panStartOffY = 0
let dragTokenStartX = 0
let dragTokenStartY = 0
let dragTokenDropX = 0
let dragTokenDropY = 0
let dragTokenDropCellX = 0
let dragTokenDropCellY = 0
let dragTokenPreview: { x: number; y: number } | null = null
let dragMoveCost = false
let dragMoveStartPoints = 0
let dragOriginX = 0
let dragOriginY = 0
let canvasMousePos = { x: 0, y: 0 }
let drawingMoveBackup: { x: number; y: number }[] | null = null
let drawingMoveOffset = { x: 0, y: 0 }
let ctrlPressed = false
let tabPressed = false
const activeCanvasPointers = new Map<number, { clientX: number; clientY: number }>()
let canvasLongPressTimer: number | null = null
let canvasLongPressPointerId: number | null = null
let canvasLongPressStart = { x: 0, y: 0 }
let canvasLongPressHandled = false
let pinchStartDistance = 1
let pinchStartScale = 1
let pinchStartWorld = { x: 0, y: 0 }

const canvasLongPressDelayMs = 560
const canvasLongPressMoveTolerance = 12

function snapPrecision(val: number): number {
  return ctrlPressed ? Math.round(val * 100) / 100 : Math.round(val * 2) / 2
}

function isNonMousePointer(e: MouseEvent): boolean {
  return 'pointerType' in e && (e as PointerEvent).pointerType != 'mouse'
}

function clearCanvasLongPress(): void {
  if (canvasLongPressTimer) {
    window.clearTimeout(canvasLongPressTimer)
    canvasLongPressTimer = null
  }
  canvasLongPressPointerId = null
}

function canvasPointerDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function firstTwoCanvasPointers():
  [{ clientX: number; clientY: number }, { clientX: number; clientY: number }] | null {
  const pointers = Array.from(activeCanvasPointers.values())
  if (pointers.length < 2) return null
  return [pointers[0], pointers[1]]
}

function midpointClient(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
): { clientX: number; clientY: number } {
  return {
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2
  }
}

function gridSnap(
  wx: number,
  wy: number,
  ox: number,
  oy: number,
  cs: number
): { x: number; y: number } {
  if (!snapEnabled.value) return { x: (wx - ox) / cs, y: (wy - oy) / cs }
  return { x: snapPrecision((wx - ox) / cs), y: snapPrecision((wy - oy) / cs) }
}

function ensureToken(code: string): (typeof mm.tokens)[number] | undefined {
  let t = mm.tokens.find((token) => token.code == code)
  const c = creatureByCode.value.get(code)
  if (!c) return undefined
  if (!t) {
    const fp = creatureFootprint(code)
    const position = nextAvailableTokenPosition(fp)
    t = {
      code,
      x: position.x,
      y: position.y,
      color: factionColor[c.faction] ?? '#e53935',
      imageScale: 1
    }
    mm.tokens.push(t)
  } else {
    t.color = factionColor[c.faction] ?? '#e53935'
  }
  return t
}

function tokenFootprintsOverlap(
  a: { x: number; y: number; footprint: number },
  b: { x: number; y: number; footprint: number }
): boolean {
  const aHalf = a.footprint / 2
  const bHalf = b.footprint / 2
  return (
    Math.abs(a.x - b.x) < aHalf + bHalf && Math.abs(a.y - b.y) < aHalf + bHalf
  )
}

function nextAvailableTokenPosition(footprint: number): { x: number; y: number } {
  const columns = 5
  const canvasW = Math.max(1, canvasRef.value?.width ?? canvasWidth.value)
  const canvasH = Math.max(1, canvasRef.value?.height ?? canvasHeight.value)
  const viewScale = Number.isFinite(mm.viewScale) && mm.viewScale > 0 ? mm.viewScale : 1
  const cellSize = Number.isFinite(mm.cellSize) && mm.cellSize > 0 ? mm.cellSize : 50
  const centerCellX = ((canvasW / 2 - mm.viewX) / viewScale - mm.offsetX) / cellSize
  const centerCellY = ((canvasH / 2 - mm.viewY) / viewScale - mm.offsetY) / cellSize
  const startCellX = Math.floor(centerCellX - columns / 2)
  const startCellY = Math.floor(centerCellY - 1)
  for (let idx = 0; idx < 1200; idx++) {
    const cellX = startCellX + (idx % columns)
    const cellY = startCellY + Math.floor(idx / columns)
    const candidate = {
      x: snapPosition(footprint, cellX + footprint / 2),
      y: snapPosition(footprint, cellY + footprint / 2),
      footprint
    }
    const occupied = mm.tokens.some((token) =>
      tokenFootprintsOverlap(candidate, {
        x: token.x,
        y: token.y,
        footprint: creatureFootprint(token.code)
      })
    )
    if (!occupied) return { x: candidate.x, y: candidate.y }
  }
  return {
    x: snapPosition(footprint, centerCellX + mm.tokens.length + footprint / 2),
    y: snapPosition(footprint, centerCellY + footprint / 2)
  }
}

function ensureCreatureTokens(): void {
  for (const creature of Creatures.value) ensureToken(creature.code())
}

function snappedTokenPosition(code: string, x: number, y: number): { x: number; y: number } {
  const fp = creatureFootprint(code)
  return {
    x: snapPosition(fp, x),
    y: snapPosition(fp, y)
  }
}

function gridCellCenter(value: number): number {
  return Math.floor(value) + 0.5
}

function findAutoAttackTarget(
  attackerCode: string,
  dropPoint: { x: number; y: number }
): (typeof mm.tokens)[number] | undefined {
  for (let i = mm.tokens.length - 1; i >= 0; i--) {
    const target = mm.tokens[i]
    if (target.code == attackerCode) continue
    const half = creatureFootprint(target.code) / 2
    if (
      dropPoint.x >= target.x - half &&
      dropPoint.x < target.x + half &&
      dropPoint.y >= target.y - half &&
      dropPoint.y < target.y + half
    ) {
      return target
    }
  }
  return undefined
}

function autoAttackPoints(defenderToken: {
  code: string
  x: number
  y: number
}): [{ x: number; y: number }, { x: number; y: number }] {
  const start = { x: dragTokenStartX, y: dragTokenStartY }
  const end =
    creatureFootprint(defenderToken.code) < 2
      ? { x: defenderToken.x, y: defenderToken.y }
      : { x: dragTokenDropCellX, y: dragTokenDropCellY }
  return [start, end]
}

function autoAttackDistance(defenderToken: { code: string; x: number; y: number }): number {
  const attacker = creatureByCode.value.get(dragCode)
  const defender = creatureByCode.value.get(defenderToken.code)
  if (!attacker || !defender) {
    const [attackStart, attackEnd] = autoAttackPoints(defenderToken)
    return (
      Math.ceil(Math.hypot(attackEnd.x - attackStart.x, attackEnd.y - attackStart.y) * 100) / 100
    )
  }
  return roundedCreatureTokenDistance(
    { x: dragTokenStartX, y: dragTokenStartY },
    attacker,
    defenderToken,
    defender
  )
}

function autoAttackArrowColor(): string {
  const power = currentMove().powerList[moveMemory.value.selectedPowerIdx]
  if (!power || power.power == 0) return '#f9a825'
  if (power.elemType == '治疗' || power.elemType == '护盾') return '#43a047'
  return '#e53935'
}

function triggerAutoAttack(
  attackerCode: string,
  defenderCode: string,
  points: [{ x: number; y: number }, { x: number; y: number }]
): void {
  const attacker = creatureByCode.value.get(attackerCode)
  const defender = creatureByCode.value.get(defenderCode)
  if (!attacker || !defender) return

  const sameAttacker = battleMemory.value.attacker?.code() == attackerCode
  battleMemory.value.attacker = attacker
  attacker.shallowRefresh()

  const chosen = surviveMemory.value.chosen
  chosen.delete('DM')
  if (!sameAttacker) chosen.clear()
  chosen.add(defenderCode)
  surviveMemory.value.chooseMode = 0

  mm.drawings.push({
    type: 'arrow',
    color: autoAttackArrowColor(),
    alpha: 1,
    points,
    width: 0,
    angle: 0
  })

  openPanel('MultiTargetPanel', 'panel-multi', '施法', {})
  captureHistory('自动攻击')
}

function canvasPointFromClient(
  clientX: number,
  clientY: number
): {
  mx: number
  my: number
  wx: number
  wy: number
  cs: number
  ox: number
  oy: number
} | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mx = (clientX - rect.left) * scaleX
  const my = (clientY - rect.top) * scaleY
  return {
    mx,
    my,
    wx: (mx - mm.viewX) / mm.viewScale,
    wy: (my - mm.viewY) / mm.viewScale,
    cs: mm.cellSize,
    ox: mm.offsetX,
    oy: mm.offsetY
  }
}

function canvasEventPoint(e: MouseEvent): ReturnType<typeof canvasPointFromClient> {
  return canvasPointFromClient(e.clientX, e.clientY)
}

function openCanvasContextMenuAt(clientX: number, clientY: number): void {
  // 右键取消绘图/迷雾移动
  if (drawingMoveBackup) {
    drawingMoveBackup = null
    drawingMoveOffset = { x: 0, y: 0 }
    dragMode = null
    draw()
    history.endTransaction(historySnapshot())
    return
  }
  if (dragMode) return

  const point = canvasPointFromClient(clientX, clientY)
  if (!point) return
  const { wx, wy, ox, oy, cs } = point

  // token 优先级最高
  for (let i = mm.tokens.length - 1; i >= 0; i--) {
    const t = mm.tokens[i]
    const fp = creatureFootprint(t.code)
    const size = fp * cs
    const cx = ox + t.x * cs
    const cy = oy + t.y * cs
    const half = size / 2
    if (wx >= cx - half && wx <= cx + half && wy >= cy - half && wy <= cy + half) {
      ctxMenuCode.value = t.code
      ctxMenuTarget.value = 'token'
      ctxMenuDrawingIdx.value = i
      ctxMenuHighlight.value = { type: 'token', idx: i, code: t.code }
      ctxMenuX.value = clientX
      ctxMenuY.value = clientY
      ctxMenuVisible.value = true
      return
    }
  }

  for (let i = mm.drawings.length - 1; i >= 0; i--) {
    const drawing = mm.drawings[i]
    if (drawingIsField(drawing)) {
      if (pointInAreaDrawingGrid({ x: (wx - ox) / cs, y: (wy - oy) / cs }, drawing)) {
        ctxMenuTarget.value = 'drawing'
        ctxMenuDrawingIdx.value = i
        ctxMenuHighlight.value = { type: 'drawing', idx: i }
        ctxMenuX.value = clientX
        ctxMenuY.value = clientY
        ctxMenuVisible.value = true
        return
      }
      continue
    }
    if (hitDrawing(wx, wy, drawing, ox, oy, cs)) {
      ctxMenuTarget.value = 'drawing'
      ctxMenuDrawingIdx.value = i
      ctxMenuHighlight.value = { type: 'drawing', idx: i }
      ctxMenuX.value = clientX
      ctxMenuY.value = clientY
      ctxMenuVisible.value = true
      return
    }
  }
  for (let i = mm.fogPolygons.length - 1; i >= 0; i--) {
    if (pointInPolygon(wx, wy, mm.fogPolygons[i], ox, oy, cs)) {
      ctxMenuTarget.value = 'fog'
      ctxMenuDrawingIdx.value = i
      ctxMenuHighlight.value = { type: 'fog', idx: i }
      ctxMenuX.value = clientX
      ctxMenuY.value = clientY
      ctxMenuVisible.value = true
      return
    }
  }

  closeContextMenu()
}

function canvasContextMenu(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  openCanvasContextMenuAt(e.clientX, e.clientY)
}

function cancelCanvasDragForLongPress(): void {
  const interruptedDragMode = dragMode
  const hadDrawingDraft = dragMode == 'drawShape' || drawPending.value != 'none'
  if (hadDrawingDraft) cancelPendingDrawing()
  dragMode = null
  dragMoveCost = false
  dragTokenPreview = null
  drawingMoveBackup = null
  drawingMoveOffset = { x: 0, y: 0 }
  if (!hadDrawingDraft) draw()
  if (
    interruptedDragMode == 'token' ||
    interruptedDragMode == 'drawing' ||
    interruptedDragMode == 'fogPolygon' ||
    interruptedDragMode == 'origin' ||
    interruptedDragMode == 'oneMeter'
  ) {
    history.endTransaction(historySnapshot())
  }
}

function scheduleCanvasLongPress(e: PointerEvent): void {
  if (e.pointerType == 'mouse') return
  clearCanvasLongPress()
  canvasLongPressHandled = false
  canvasLongPressPointerId = e.pointerId
  canvasLongPressStart = { x: e.clientX, y: e.clientY }
  canvasLongPressTimer = window.setTimeout(() => {
    if (canvasLongPressPointerId != e.pointerId) return
    canvasLongPressHandled = true
    cancelCanvasDragForLongPress()
    openCanvasContextMenuAt(e.clientX, e.clientY)
    draw()
  }, canvasLongPressDelayMs)
}

function updateCanvasLongPress(e: PointerEvent): void {
  if (canvasLongPressPointerId != e.pointerId) return
  const dist = Math.hypot(e.clientX - canvasLongPressStart.x, e.clientY - canvasLongPressStart.y)
  if (dist > canvasLongPressMoveTolerance) clearCanvasLongPress()
}

function beginCanvasPinch(): void {
  const pair = firstTwoCanvasPointers()
  if (!pair) return
  const [a, b] = pair
  const mid = midpointClient(a, b)
  const point = canvasPointFromClient(mid.clientX, mid.clientY)
  if (!point) return
  if (
    dragMode == 'token' ||
    dragMode == 'drawing' ||
    dragMode == 'fogPolygon' ||
    dragMode == 'origin' ||
    dragMode == 'oneMeter'
  ) {
    dragTokenPreview = null
    drawingMoveBackup = null
    drawingMoveOffset = { x: 0, y: 0 }
    dragMoveCost = false
    history.endTransaction(historySnapshot())
  }
  pinchStartDistance = Math.max(1, canvasPointerDistance(a, b))
  pinchStartScale = mm.viewScale
  pinchStartWorld = {
    x: (point.mx - mm.viewX) / mm.viewScale,
    y: (point.my - mm.viewY) / mm.viewScale
  }
  dragMode = 'pinch'
}

function updateCanvasPinch(): void {
  const pair = firstTwoCanvasPointers()
  if (!pair) return
  const [a, b] = pair
  const mid = midpointClient(a, b)
  const point = canvasPointFromClient(mid.clientX, mid.clientY)
  if (!point) return
  const distance = Math.max(1, canvasPointerDistance(a, b))
  mm.viewScale = clampNumber(pinchStartScale * (distance / pinchStartDistance), 0.1, 10)
  mm.viewX = point.mx - pinchStartWorld.x * mm.viewScale
  mm.viewY = point.my - pinchStartWorld.y * mm.viewScale
  draw()
}

function canvasPointerDown(e: PointerEvent): void {
  e.preventDefault()
  canvasRef.value?.setPointerCapture(e.pointerId)
  activeCanvasPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })

  if (e.pointerType != 'mouse' && activeCanvasPointers.size >= 2) {
    clearCanvasLongPress()
    beginCanvasPinch()
    return
  }

  scheduleCanvasLongPress(e)
  canvasMouseDown(e)
}

function canvasPointerMove(e: PointerEvent): void {
  if (activeCanvasPointers.has(e.pointerId)) {
    activeCanvasPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })
  }
  updateCanvasLongPress(e)

  if (dragMode == 'pinch') {
    updateCanvasPinch()
    return
  }
  if (canvasLongPressHandled) return
  canvasMouseMove(e)
}

function canvasPointerUp(e: PointerEvent): void {
  if (canvasLongPressPointerId == e.pointerId) clearCanvasLongPress()
  activeCanvasPointers.delete(e.pointerId)
  if (canvasRef.value?.hasPointerCapture(e.pointerId)) {
    canvasRef.value.releasePointerCapture(e.pointerId)
  }

  if (dragMode == 'pinch') {
    dragMode = activeCanvasPointers.size >= 2 ? 'pinch' : null
    if (dragMode == 'pinch') beginCanvasPinch()
    return
  }
  if (canvasLongPressHandled) {
    canvasLongPressHandled = false
    return
  }
  canvasMouseUp()
}

function canvasPointerCancel(e: PointerEvent): void {
  if (canvasLongPressPointerId == e.pointerId) clearCanvasLongPress()
  activeCanvasPointers.delete(e.pointerId)
  if (dragMode == 'drawShape' || drawPending.value != 'none') {
    cancelPendingDrawing()
  } else if (dragMode == 'pinch' && activeCanvasPointers.size < 2) {
    dragMode = null
    draw()
  } else if (
    dragMode == 'token' ||
    dragMode == 'drawing' ||
    dragMode == 'fogPolygon' ||
    dragMode == 'origin' ||
    dragMode == 'oneMeter'
  ) {
    dragMode = null
    dragMoveCost = false
    dragTokenPreview = null
    drawingMoveBackup = null
    drawingMoveOffset = { x: 0, y: 0 }
    draw()
    history.endTransaction(historySnapshot())
  }
  if (canvasRef.value?.hasPointerCapture(e.pointerId)) {
    canvasRef.value.releasePointerCapture(e.pointerId)
  }
}

function canvasPointerLeave(e: PointerEvent): void {
  if (e.pointerType == 'mouse') canvasPointerUp(e)
}

function canvasMouseDown(e: MouseEvent): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const s = mm.viewScale
  const vx = mm.viewX
  const vy = mm.viewY
  const mx = (e.clientX - rect.left) * scaleX
  const my = (e.clientY - rect.top) * scaleY
  const wx = (mx - vx) / s
  const wy = (my - vy) / s
  const cs = mm.cellSize
  const ox = mm.offsetX
  const oy = mm.offsetY

  // 图形移动中：左键/右键仅用于确认/取消，不触发其他行为
  if (drawingMoveBackup && (dragMode == 'drawing' || dragMode == 'fogPolygon')) {
    return // 由 mouseUp（左键确认）或 contextMenu（右键取消）处理
  }

  // 右键取消绘制拖动
  if (e.button == 2 && dragMode == 'drawShape') {
    cancelPendingDrawing()
    return
  }
  // 中键始终平移地图
  if (e.button == 1) {
    dragMode = 'pan'
    panStartVX = vx
    panStartVY = vy
    dragStartX = mx
    dragStartY = my
    return
  }

  // ── 法术范围绘制（点击-拖动，非多边形/线形/扇形）──
  if (
    drawMode.value != 'none' &&
    drawMode.value != 'polygon' &&
    drawMode.value != 'fog' &&
    drawMode.value != 'line' &&
    drawMode.value != 'sector'
  ) {
    if (e.button == 2) {
      cancelPendingDrawing()
      return
    }
    const pt = gridSnap(wx, wy, ox, oy, cs)
    drawOrigin.value = pt
    drawPreviewPoint.value = pt
    dragMode = 'drawShape'
    draw()
    return
  }
  if (drawMode.value == 'polygon' || drawMode.value == 'fog') {
    if (e.button == 2) {
      if (currentPolygon.value.length > 0) {
        currentPolygon.value.pop()
        draw()
        return
      }
      // 无点时放行给 contextMenu 处理
    } else {
      const pt2 = gridSnap(wx, wy, ox, oy, cs)
      if (
        currentPolygon.value.length > 0 &&
        Math.abs(pt2.x - currentPolygon.value[0].x) < 0.01 &&
        Math.abs(pt2.y - currentPolygon.value[0].y) < 0.01
      ) {
        if (currentPolygon.value.length >= 3) {
          if (drawMode.value == 'fog') {
            mm.fogPolygons.push([...currentPolygon.value])
            captureHistory('绘制迷雾')
          } else {
            mm.drawings.push(
              maybeAttachFieldToNewDrawing({
                type: 'polygon',
                color: drawColor.value,
                alpha: drawAlpha.value,
                points: [...currentPolygon.value],
                width: 0,
                angle: 0
              } as any)
            )
            captureHistory('绘制多边形')
          }
        }
        currentPolygon.value = []
        drawPreviewPoint.value = null
        draw()
        return
      }
      currentPolygon.value.push(pt2)
      drawPreviewPoint.value = null
      draw()
      return
    }
  }

  // ── 两步绘制（拖拽定方向，松开定参数）──
  if (drawMode.value == 'line' || drawMode.value == 'sector') {
    if (drawPending.value != 'none') {
      if (e.button == 2) {
        cancelPendingDrawing()
        return
      }
      if (drawMode.value == 'line') finalizeLine()
      else finalizeSector()
      return
    }
    if (e.button == 2) {
      cancelPendingDrawing()
      return
    }
    const pt = gridSnap(wx, wy, ox, oy, cs)
    drawOrigin.value = pt
    drawPreviewPoint.value = pt
    dragMode = 'drawShape'
    draw()
    return
  }

  // ── 格子设置 ──
  if (gridSetupMode.value) {
    const r = Math.max(6, cs * 0.2)
    const oneMX = ox + cs
    if (Math.hypot(wx - oneMX, wy - oy) < r) {
      dragMode = 'oneMeter'
      history.beginTransaction('调整格子')
      dragStartX = wx
      dragStartY = wy
      panStartOffX = ox
      panStartOffY = oy
      return
    }
    if (Math.hypot(wx - ox, wy - oy) < r) {
      dragMode = 'origin'
      history.beginTransaction('调整格子')
      panStartOffX = ox
      panStartOffY = oy
      dragStartX = wx
      dragStartY = wy
      return
    }
    dragMode = 'pan'
    panStartVX = vx
    panStartVY = vy
    dragStartX = mx
    dragStartY = my
    return
  }

  // 找被点击的 token（从上到下）
  for (let i = mm.tokens.length - 1; i >= 0; i--) {
    const t = mm.tokens[i]
    const fp = creatureFootprint(t.code)
    const size = fp * cs
    const cx = ox + t.x * cs
    const cy = oy + t.y * cs
    const half = size / 2
    if (wx >= cx - half && wx <= cx + half && wy >= cy - half && wy <= cy + half) {
      if (e.button == 2) return
      if (e.button != 0) return
      dragMode = 'token'
      history.beginTransaction('移动 Token')
      dragCode = t.code
      dragStartX = t.x
      dragStartY = t.y
      dragOriginX = wx
      dragOriginY = wy
      dragTokenStartX = t.x
      dragTokenStartY = t.y
      dragTokenPreview = { x: t.x, y: t.y }
      dragTokenDropX = (wx - ox) / cs
      dragTokenDropY = (wy - oy) / cs
      dragTokenDropCellX = gridCellCenter(dragTokenDropX)
      dragTokenDropCellY = gridCellCenter(dragTokenDropY)
      dragMoveCost = e.ctrlKey || e.metaKey || (isNonMousePointer(e) && touchMoveCostMode.value)
      if (dragMoveCost) {
        const c = creatureByCode.value.get(t.code)
        dragMoveStartPoints = c ? c.currentMov : 0
      } else {
        dragMoveStartPoints = 0
      }
      draw()
      return
    }
  }

  // 空白区域拖拽 = 移动地图（仅左/中键）
  if (e.button == 2) return
  dragMode = 'pan'
  panStartVX = vx
  panStartVY = vy
  dragStartX = mx
  dragStartY = my
}

function canvasMouseMove(e: MouseEvent): void {
  const canvas0 = canvasRef.value
  if (canvas0) {
    const rect0 = canvas0.getBoundingClientRect()
    canvasMousePos = {
      x: (e.clientX - rect0.left) * (canvas0.width / rect0.width),
      y: (e.clientY - rect0.top) * (canvas0.height / rect0.height)
    }
  }

  // 多边形模式：跟踪鼠标位置用于预览
  if ((drawMode.value == 'polygon' || drawMode.value == 'fog') && currentPolygon.value.length > 0) {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top) * scaleY
    const s = mm.viewScale
    const wx = (mx - mm.viewX) / s
    const wy = (my - mm.viewY) / s
    const cs = mm.cellSize
    const ox = mm.offsetX
    const oy = mm.offsetY
    const pt = gridSnap(wx, wy, ox, oy, cs)
    drawPreviewPoint.value = pt
    draw()
    return
  }

  // 二阶段绘制（线形宽度 / 扇形角度）
  if (drawPending.value == 'lineWidth') {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top) * scaleY
    const s = mm.viewScale
    const cs = mm.cellSize
    const ox = mm.offsetX
    const oy = mm.offsetY
    const gx = ((mx - mm.viewX) / s - ox) / cs
    const gy = ((my - mm.viewY) / s - oy) / cs
    const p1 = pendingOrigin
    const p2 = pendingEnd
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const len = Math.hypot(dx, dy)
    if (len == 0) {
      cancelPendingDrawing()
      return
    }
    const nx = -dy / len
    const ny = dx / len
    const d = Math.abs((gx - p1.x) * nx + (gy - p1.y) * ny) * 2
    const w = snapEnabled.value ? Math.max(0.5, snapPrecision(d)) : d
    drawPreviewPoint.value = { x: w, y: 0 }
    draw()
    return
  }
  if (drawPending.value == 'sectorAngle') {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top) * scaleY
    const s = mm.viewScale
    const gx = (mx - mm.viewX) / s
    const gy = (my - mm.viewY) / s
    const ox = mm.offsetX
    const oy = mm.offsetY
    const cs = mm.cellSize
    const p1 = pendingOrigin
    const p2 = pendingEnd
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) == 0) {
      cancelPendingDrawing()
      return
    }
    const wx1 = ox + p1.x * cs
    const wy1 = oy + p1.y * cs
    const wx2 = ox + p2.x * cs
    const wy2 = oy + p2.y * cs
    const a1 = Math.atan2(gy - wy1, gx - wx1)
    const a2 = Math.atan2(wy2 - wy1, wx2 - wx1)
    let angleDeg = Math.abs(a1 - a2) * (180 / Math.PI) * 2
    if (angleDeg > 360) angleDeg = 360
    angleDeg = Math.round(angleDeg / 15) * 15
    if (angleDeg < 15) angleDeg = 15
    if (angleDeg > 360) angleDeg = 360
    drawPreviewPoint.value = { x: angleDeg, y: 0 }
    draw()
    return
  }
  if (dragMode == 'pinch') return
  if (!dragMode) return
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mx = (e.clientX - rect.left) * scaleX
  const my = (e.clientY - rect.top) * scaleY

  if (dragMode == 'token') {
    const s2 = mm.viewScale
    const vx2 = mm.viewX
    const vy2 = mm.viewY
    const wx = (mx - vx2) / s2
    const wy = (my - vy2) / s2
    const ox2 = mm.offsetX
    const oy2 = mm.offsetY
    const gridX = (wx - ox2) / mm.cellSize
    const gridY = (wy - oy2) / mm.cellSize
    dragTokenDropX = gridX
    dragTokenDropY = gridY
    dragTokenDropCellX = gridCellCenter(gridX)
    dragTokenDropCellY = gridCellCenter(gridY)
    dragTokenPreview = snappedTokenPosition(dragCode, gridX, gridY)
  } else if (dragMode == 'fogPolygon' || dragMode == 'drawing') {
    const s3 = mm.viewScale
    const vx3 = mm.viewX
    const vy3 = mm.viewY
    const wx = (mx - vx3) / s3
    const wy = (my - vy3) / s3
    const cs2 = mm.cellSize
    const rawDx = (wx - dragStartX) / cs2
    const rawDy = (wy - dragStartY) / cs2
    const dx = snapEnabled.value ? snapPrecision(rawDx) : rawDx
    const dy = snapEnabled.value ? snapPrecision(rawDy) : rawDy
    drawingMoveOffset = { x: dx, y: dy }
  } else if (dragMode == 'origin') {
    const s4 = mm.viewScale
    const wx = (mx - mm.viewX) / s4
    mm.offsetX = panStartOffX + (wx - dragStartX)
    mm.offsetY = panStartOffY + ((my - mm.viewY) / s4 - dragStartY)
  } else if (dragMode == 'oneMeter') {
    const s5 = mm.viewScale
    const wx = (mx - mm.viewX) / s5
    const wy = (my - mm.viewY) / s5
    mm.cellSize = Math.max(2, Math.hypot(wx - panStartOffX, wy - panStartOffY))
  } else if (dragMode == 'drawShape') {
    const s6 = mm.viewScale
    const wx6 = (mx - mm.viewX) / s6
    const wy6 = (my - mm.viewY) / s6
    drawPreviewPoint.value = gridSnap(wx6, wy6, mm.offsetX, mm.offsetY, mm.cellSize)
    draw()
  } else {
    mm.viewX = panStartVX + (mx - dragStartX)
    mm.viewY = panStartVY + (my - dragStartY)
  }
  draw()
}

function canvasMouseUp(): void {
  const completedDragMode = dragMode
  if (dragMode == 'pinch') {
    dragMode = null
    draw()
    return
  }
  if (dragMode == 'token' && dragCode) {
    const attackerToken = tokenByCode.value.get(dragCode)
    const wasDragged =
      attackerToken != null &&
      dragTokenPreview != null &&
      Math.hypot(
        dragTokenPreview.x - dragTokenStartX,
        dragTokenPreview.y - dragTokenStartY
      ) > 1e-8
    const defenderToken =
      attackerToken && wasDragged && !dragMoveCost
        ? findAutoAttackTarget(dragCode, {
            x: dragTokenDropX,
            y: dragTokenDropY
          })
        : undefined
    if (attackerToken && defenderToken) {
      const points = autoAttackPoints(defenderToken)
      triggerAutoAttack(dragCode, defenderToken.code, points)
    } else if (attackerToken && dragTokenPreview) {
      attackerToken.x = dragTokenPreview.x
      attackerToken.y = dragTokenPreview.y
    }
  }
  if (dragMode == 'token' && dragMoveCost && dragCode) {
    const t = tokenByCode.value.get(dragCode)
    const c = creatureByCode.value.get(dragCode)
    if (t && c) {
      const dist = Math.ceil(Math.hypot(t.x - dragTokenStartX, t.y - dragTokenStartY) * 100) / 100
      const distInt = Math.round(dist * 100)
      const mpInt = Math.round(c.currentMov * 100)
      c.currentMov = (mpInt - distInt) / 100
    }
  }
  if (
    drawingMoveBackup &&
    (dragMode == 'drawing' || dragMode == 'fogPolygon') &&
    (drawingMoveOffset.x != 0 || drawingMoveOffset.y != 0)
  ) {
    const target =
      dragMode == 'drawing'
        ? mm.drawings[Number(dragCode)]?.points
        : mm.fogPolygons[Number(dragCode)]
    if (target) {
      for (const point of target) {
        point.x += drawingMoveOffset.x
        point.y += drawingMoveOffset.y
      }
    }
  }
  // 完成绘制形状（点击-拖动结束）
  if (dragMode == 'drawShape' && drawOrigin.value && drawPreviewPoint.value) {
    const dm = drawMode.value as string
    const p1 = drawOrigin.value
    const p2 = drawPreviewPoint.value
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) == 0) {
      dragMode = null
      cancelPendingDrawing()
      return
    }
    if (dm == 'line') {
      pendingOrigin = { ...drawOrigin.value }
      pendingEnd = { ...drawPreviewPoint.value }
      const initW = snapEnabled.value ? 0.5 : 1
      drawPreviewPoint.value = { x: initW, y: 0 }
      drawPending.value = 'lineWidth'
      dragMode = null
      draw()
      return
    }
    if (dm == 'sector') {
      pendingOrigin = { ...drawOrigin.value }
      pendingEnd = { ...drawPreviewPoint.value }
      drawPreviewPoint.value = { x: 45, y: 0 }
      drawPending.value = 'sectorAngle'
      dragMode = null
      draw()
      return
    }
    if (dm == 'ruler') {
      // 测距：不保留轨迹
    } else if (dm == 'arrow') {
      mm.drawings.push({
        type: 'arrow',
        color: drawColor.value,
        alpha: drawAlpha.value,
        points: [drawOrigin.value, drawPreviewPoint.value],
        width: drawWidth.value,
        angle: 0
      } as any)
      captureHistory('绘制箭头')
    } else {
      mm.drawings.push(
        maybeAttachFieldToNewDrawing({
          type: dm as any,
          color: drawColor.value,
          alpha: drawAlpha.value,
          points: [drawOrigin.value, drawPreviewPoint.value],
          width: dm == 'rectangle' ? drawWidth.value : 0,
          angle: dm == 'sector' || dm == 'cone' ? drawAngle.value : 0
        } as any)
      )
      captureHistory('绘制图形')
    }
    drawOrigin.value = null
    drawPreviewPoint.value = null
  }
  dragMode = null
  dragMoveCost = false
  dragTokenPreview = null
  drawingMoveBackup = null
  drawingMoveOffset = { x: 0, y: 0 }
  draw()
  if (
    completedDragMode == 'token' ||
    completedDragMode == 'drawing' ||
    completedDragMode == 'fogPolygon' ||
    completedDragMode == 'origin' ||
    completedDragMode == 'oneMeter'
  ) {
    history.endTransaction(historySnapshot())
  }
}

// ── 生命周期 ──
function fitCanvas(): void {
  const canvas = canvasRef.value
  const container = canvas?.parentElement
  if (!container || !canvas) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  const scale = currentRenderScale()
  canvasWidth.value = Math.floor(cw * scale)
  canvasHeight.value = Math.floor(ch * scale)
  canvas.style.width = cw + 'px'
  canvas.style.height = ch + 'px'
  nextTick(() => draw())
}

function attachTacticalMap(container: HTMLElement, canvas: HTMLCanvasElement): void {
  canvasRef.value = canvas
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    fitCanvas()
    scheduleKeepFloatingPanelsReachable()
  })
  resizeObserver.observe(container)
  fitCanvas()
}

function detachTacticalMap(canvas: HTMLCanvasElement): void {
  if (canvasRef.value != canvas) return
  resizeObserver?.disconnect()
  resizeObserver = null
  canvasRef.value = null
}

onMounted(() => {
  normalizeMapAssets(mm)
  loadTokenImages()
  loadBgFromDataUrl()
  refreshQuickSaveSlots()
  fitCanvas()
  history.initialize(historySnapshot())
  nextTick(() => draw())
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerup', handleGlobalPointerFinished, true)
  window.addEventListener('pointercancel', handleGlobalPointerFinished, true)
  if (window.api) {
    window.api.onAutoSave(async () => {
      if (hasContent()) {
        await window.api.quickSave(ESSerializerSerialize())
        await refreshQuickSaveSlots()
      }
      window.api.autoSaveDone()
    })
  }

  // 所有入口统一交给 requestAnimationFrame 合并，同一帧最多重绘一次。
  const scheduleDraw = draw
  watch(
    () => appSettings.renderScale,
    (nextValue, previousValue) => {
      const previous = normalizeRenderScale(previousValue)
      const next = normalizeRenderScale(nextValue)
      if (previous == next) return
      const ratio = next / previous
      mm.viewX *= ratio
      mm.viewY *= ratio
      mm.viewScale = clampNumber(mm.viewScale * ratio, minViewScale(), maxViewScale())
      fitCanvas()
    }
  )
  watch(
    () => appSettings.workspaceMode,
    () => migrateOpenPanelsForWorkspaceMode(),
    { flush: 'sync' }
  )
  watch(
    () =>
      Creatures.value.map(
        (c) =>
          [
            c.name(),
            c.currentHP,
            c.tempHP,
            c.currentPP,
            c.currentMov,
            c.faction,
            c.sizeAbility.size
          ] as const
      ),
    scheduleDraw,
    { deep: true }
  )
  watch(() => mm.tokens.map((t) => [t.x, t.y, t.color, t.imageScale] as const), scheduleDraw, {
    deep: true
  })
  watch(
    () => [
      mm.fogVisible,
      mm.fogAlpha,
      mm.fogPolygons.length,
      mm.drawings.length,
      mm.gridAlpha,
      mm.gridColor,
      mm.gridDashLength,
      mm.gridLineWidth,
      mm.cellSize,
      mm.offsetX,
      mm.offsetY,
      mm.bgWorldW,
      mm.bgWorldH,
      mm.viewX,
      mm.viewY,
      mm.viewScale,
      appSettings.renderScale
    ],
    scheduleDraw
  )
  watch(
    () => [
      mm.cellSize,
      mm.offsetX,
      mm.offsetY,
      mm.bgWorldW,
      mm.bgWorldH,
      mm.gridAlpha,
      mm.gridColor,
      mm.gridDashLength,
      mm.gridLineWidth
    ],
    () => {
      const asset = mm.currentBackgroundKey
        ? mm.assets.find((item) => item.key == mm.currentBackgroundKey)
        : null
      if (asset) saveCurrentBackgroundSettingsToAsset(mm, asset)
    }
  )
  watch(
    () => {
      const asset = mm.currentBackgroundKey
        ? mm.assets.find((item) => item.key == mm.currentBackgroundKey)
        : null
      return [mm.currentBackgroundKey, asset?.dataUrl.length ?? 0] as const
    },
    () => loadBgFromDataUrl(),
    { deep: true }
  )
  watch(
    () => mm.assets.map((asset) => `${asset.key}:${asset.usage}:${asset.dataUrl.length}`).join('|'),
    () => {
      loadTokenImages()
      draw()
    }
  )
  watch(
    () => [
      Creatures.value,
      envMemory.value,
      historyTrackedMapState(),
      statusMemory.value,
      mainMemory.value,
      toolsMemory.value,
      fieldEditMemory.value,
      surviveMemory.value,
      characterMemory.value,
      battleMemory.value,
      battleMemoryHeal.value,
      battleMemoryStatus.value,
      moveMemory.value
    ],
    () => scheduleHistoryCapture(),
    { deep: true, flush: 'post' }
  )
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointerup', handleGlobalPointerFinished, true)
  window.removeEventListener('pointercancel', handleGlobalPointerFinished, true)
  if (drawFrameId != null) {
    window.cancelAnimationFrame(drawFrameId)
    drawFrameId = null
  }
  history.dispose()
  disposeDockviewPanelMemoryListeners()
  cleanupDockview()
})

function onKeyDown(e: KeyboardEvent): void {
  if (e.key == 'Control' || e.key == 'Meta') {
    ctrlPressed = true
    return
  }
  const target = e.target
  if (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') ||
      target.isContentEditable ||
      Boolean(target.closest('[contenteditable="true"]')))
  ) {
    return
  }

  if (e.key == 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    tabPressed = true
    return
  }

  const key = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && key == 'z') {
    e.preventDefault()
    if (e.shiftKey) redoHistory()
    else undoHistory()
    return
  }
  if (e.ctrlKey && !e.metaKey && key == 'y') {
    e.preventDefault()
    redoHistory()
    return
  }
  if (e.key == 'F5') {
    e.preventDefault()
    buildSaveJson()
    return
  }
  if (e.key == 'F9') {
    e.preventDefault()
    loadFromQuickSave()
    return
  }

  if (
    !e.repeat &&
    tabPressed &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !e.altKey &&
    /^[1-5]$/.test(e.key)
  ) {
    e.preventDefault()
    const panelShortcuts = [
      () => openPanel('CharacterListPanel', 'panel-chars', '角色列表', {}),
      () => openPanel('InitiativePanel', 'panel-initiative', '先攻', {}),
      () => openPanel('SurvivePanel', 'panel-survive', '检定与豁免', {}),
      () => openPanel('WeatherFieldPanel', 'panel-weather', '天气背景场地', {}),
      () => openFieldEditorForTemplate()
    ]
    panelShortcuts[Number(e.key) - 1]?.()
    return
  }

  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return

  if (activePanelId.value == 'panel-map' && /^[1-9]$/.test(e.key)) {
    const mode = drawModes[Number(e.key) - 1]
    if (mode) {
      e.preventDefault()
      enterDrawMode(mode)
    }
    return
  }
  if (activePanelId.value == 'panel-map' && e.key == '0') {
    e.preventDefault()
    toggleFogVisible()
    return
  }
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key == 'Control' || e.key == 'Meta') ctrlPressed = false
  if (e.key == 'Tab') tabPressed = false
}

function battleMemorySaveData(memory: BattleMemory): Record<string, unknown> {
  const { attacker, defender, ...values } = memory
  return {
    ...values,
    attackerCode: attacker?.code() ?? '',
    defenderCode: defender?.code() ?? ''
  }
}

function characterMemorySaveData(): Record<string, unknown> {
  const { cur, ...values } = characterMemory.value
  return {
    ...values,
    curCode: cur?.code() ?? ''
  }
}

interface SerializeStateOptions {
  includeView?: boolean
  includeAssets?: boolean
}

function ESSerializerSerialize(options: SerializeStateOptions = {}): string {
  const includeView = options.includeView ?? true
  const includeAssets = options.includeAssets ?? true
  const data = {
    saveVersion: 3,
    creatures: Creatures.value,
    env: {
      climateBase: envMemory.value.climateBase,
      weatherLayers: envMemory.value.weatherLayers,
      fieldLayers: envMemory.value.fieldLayers,
      surfaceLayers: envMemory.value.surfaceLayers
    },
    map: {
      ...(includeView
        ? {
            viewUnit: 'css',
            viewX: mm.viewX / currentRenderScale(),
            viewY: mm.viewY / currentRenderScale(),
            viewScale: mm.viewScale / currentRenderScale()
          }
        : {}),
      tokens: mm.tokens,
      cellSize: mm.cellSize,
      offsetX: mm.offsetX,
      offsetY: mm.offsetY,
      bgWorldW: mm.bgWorldW,
      bgWorldH: mm.bgWorldH,
      gridColor: mm.gridColor,
      gridAlpha: mm.gridAlpha,
      gridDashLength: mm.gridDashLength,
      gridLineWidth: mm.gridLineWidth,
      fogPolygons: mm.fogPolygons,
      fogAlpha: mm.fogAlpha,
      drawings: mm.drawings,
      ...(includeAssets ? { assets: mm.assets } : {}),
      currentBackgroundKey: mm.currentBackgroundKey,
      hpDisplayLevels: mm.hpDisplayLevels,
      collapsedSections: mm.collapsedSections,
      initiativeBarEnabled: mm.initiativeBarEnabled,
      fogVisible: mm.fogVisible
    },
    status: {
      curCode: statusMemory.value.cur?.code() ?? '',
      pageNumber: statusMemory.value.pageNumber,
      selectedPowerIdx: statusMemory.value.selectedPowerIdx,
      initMode: statusMemory.value.initMode,
      currentInitiativeIdx: statusMemory.value.currentInitiativeIdx,
      activeInitiativeCodes: Creatures.value.filter((c) => c.inRound).map((c) => c.code()),
      initiativeTransparent: statusMemory.value.initiativeTransparent,
      initiativeControlsExpanded: statusMemory.value.initiativeControlsExpanded,
      initiativeCardScale: statusMemory.value.initiativeCardScale,
      newStatus: statusMemory.value.newStatus
    },
    main: {
      pageNumber: mainMemory.value.pageNumber
    },
    tools: {
      ...toolsMemory.value
    },
    fieldEdit: {
      ...fieldEditMemory.value
    },
    survive: {
      ...surviveMemory.value,
      chosen: Array.from(surviveMemory.value.chosen),
      prevChosen: Array.from(surviveMemory.value.prevChosen)
    },
    character: characterMemorySaveData(),
    battle: {
      attack: battleMemorySaveData(battleMemory.value),
      heal: battleMemorySaveData(battleMemoryHeal.value),
      status: battleMemorySaveData(battleMemoryStatus.value),
      move: {
        ...moveMemory.value
      }
    }
  }
  return ESSerializer.serialize(data)
}

function historySnapshot(): string {
  return ESSerializerSerialize({ includeView: false, includeAssets: false })
}

function historyTrackedMapState(): unknown[] {
  return [
    mm.tokens,
    mm.cellSize,
    mm.offsetX,
    mm.offsetY,
    mm.bgWorldW,
    mm.bgWorldH,
    mm.gridColor,
    mm.gridAlpha,
    mm.gridDashLength,
    mm.gridLineWidth,
    mm.fogPolygons,
    mm.fogAlpha,
    mm.drawings,
    mm.currentBackgroundKey,
    mm.hpDisplayLevels,
    mm.collapsedSections,
    mm.initiativeBarEnabled,
    mm.fogVisible
  ]
}

function captureHistory(label = '操作'): void {
  history.capture(historySnapshot(), label)
}

function scheduleHistoryCapture(label = '编辑'): void {
  history.captureDebounced(historySnapshot, label)
}

function undoHistory(): void {
  const snapshot = history.undo()
  if (!snapshot) return
  loadFromJson(snapshot, { clearHistory: false, preserveView: true, preserveAssets: true })
}

function redoHistory(): void {
  const snapshot = history.redo()
  if (!snapshot) return
  loadFromJson(snapshot, { clearHistory: false, preserveView: true, preserveAssets: true })
}

async function loadFromQuickSave(): Promise<void> {
  const result = await window.api.quickLoad()
  if (result.success && result.data) loadFromJson(result.data)
  else if (result.message) alert(result.message)
}

function canvasWheel(e: WheelEvent): void {
  e.preventDefault()
  const point = canvasEventPoint(e)
  if (!point) return
  const oldScale = mm.viewScale
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  mm.viewScale = clampNumber(oldScale * delta, minViewScale(), maxViewScale())
  // 缩放中心为鼠标位置
  mm.viewX = point.mx - (point.mx - mm.viewX) * (mm.viewScale / oldScale)
  mm.viewY = point.my - (point.my - mm.viewY) * (mm.viewScale / oldScale)
  draw()
}

async function saveToFile(): Promise<void> {
  if (window.api && hasContent()) {
    const result = await window.api.saveState(ESSerializerSerialize())
    if (result.success) console.log('Saved to:', result.filePath)
    else if (result.message) alert(result.message)
  }
}

async function loadFromFile(): Promise<void> {
  if (!window.api) return
  const result = await window.api.openLoadDialog()
  if (result.success && result.data) loadFromJson(result.data)
}

const ESS_CLASSES = [
  Profile,
  Relative,
  Ability,
  BattleAbility,
  SizeAbility,
  Attribute,
  Race,
  MovePower,
  Move,
  Skill,
  ElemType,
  ExtraResist,
  Status,
  StatusManager,
  ResistManager,
  Feature,
  Equipment,
  Item,
  Creature
]

interface LoadJsonOptions {
  clearHistory?: boolean
  preserveView?: boolean
  preserveAssets?: boolean
}

function loadFromJson(json: string, options: LoadJsonOptions = {}): void {
  const clearHistory = options.clearHistory ?? true
  const preserveView = options.preserveView ?? false
  const wasRestoring = history.isRestoring.value
  history.isRestoring.value = true
  try {
    const loaded = ESSerializer.deserialize(json, ESS_CLASSES)
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      const data = loaded as Record<string, unknown>
      if (data.creatures) {
        const arr = data.creatures as Creature[]
        Creatures.value.length = 0
        for (const c of arr) {
          c.validate()
          Creatures.value.push(c)
        }
      }
      loadEnvData((data.env as Record<string, unknown>) ?? {})
      loadMapData((data.map as Record<string, unknown>) ?? {}, {
        preserveView,
        preserveAssets: options.preserveAssets
      })
      loadStatusData((data.status as Record<string, unknown>) ?? {})
      loadContextData(data)
    }
    // 重置绘图状态
    drawMode.value = 'none'
    drawOrigin.value = null
    drawPreviewPoint.value = null
    drawPending.value = 'none'
    currentPolygon.value = []
    dragMode = null
    dragTokenPreview = null
    drawingMoveBackup = null
    drawingMoveOffset = { x: 0, y: 0 }
    draw()
    if (clearHistory) history.clear(historySnapshot())
    else history.markRestored(historySnapshot())
  } finally {
    history.isRestoring.value = wasRestoring
  }
}

function loadEnvData(data: Record<string, unknown>): void {
  envMemory.value.climateBase = (data.climateBase as Record<string, number>) ?? {}
  envMemory.value.weatherLayers = (data.weatherLayers as Record<string, number>) ?? {}
  envMemory.value.fieldLayers = (data.fieldLayers as Record<string, number>) ?? {}
  envMemory.value.surfaceLayers = (data.surfaceLayers as Record<string, number>) ?? {}
}

function loadStatusData(data: Record<string, unknown>): void {
  const defaults = new StatusMemory()
  const {
    curCode,
    activeInitiativeCodes,
    cur: _legacyCur,
    ...values
  } = data as Record<string, unknown> & {
    curCode?: string
    activeInitiativeCodes?: string[]
  }
  Object.assign(statusMemory.value, defaults, values)
  statusMemory.value.cur = Creatures.value.find((c) => c.code() == curCode) ?? null
  statusMemory.value.currentInitiativeIdx = Math.max(
    0,
    Math.floor(Number(statusMemory.value.currentInitiativeIdx) || 0)
  )
  statusMemory.value.initiativeCardScale = clampNumber(
    Number(statusMemory.value.initiativeCardScale) || 1,
    0.5,
    2
  )
  if (Array.isArray(activeInitiativeCodes)) {
    const active = new Set(activeInitiativeCodes)
    for (const creature of Creatures.value) creature.inRound = active.has(creature.code())
  }
}

function loadBattleMemoryData(
  memory: BattleMemory,
  data: Record<string, unknown> | undefined,
  type: number
): void {
  const defaults = new BattleMemory(type)
  const {
    attackerCode,
    defenderCode,
    attacker: _legacyAttacker,
    defender: _legacyDefender,
    ...values
  } = (data ?? {}) as Record<string, unknown> & {
    attackerCode?: string
    defenderCode?: string
  }
  Object.assign(memory, defaults, values)
  memory.attacker = Creatures.value.find((c) => c.code() == attackerCode) ?? null
  memory.defender = Creatures.value.find((c) => c.code() == defenderCode) ?? null
}

function loadContextData(data: Record<string, unknown>): void {
  Object.assign(mainMemory.value, new MainMemory(), (data.main as object) ?? {})
  mainMemory.value.pendingLoadData = ''

  Object.assign(toolsMemory.value, new ToolsMemory(), (data.tools as object) ?? {})
  Object.assign(fieldEditMemory.value, new FieldEditMemory(), (data.fieldEdit as object) ?? {})

  const survive = (data.survive as Record<string, unknown> | undefined) ?? {}
  const { chosen, prevChosen, ...surviveValues } = survive as Record<string, unknown> & {
    chosen?: string[]
    prevChosen?: string[]
  }
  Object.assign(surviveMemory.value, new SurviveMemory(), surviveValues)
  surviveMemory.value.chosen = new Set(Array.isArray(chosen) ? chosen : [])
  surviveMemory.value.prevChosen = new Set(Array.isArray(prevChosen) ? prevChosen : [])

  const character = (data.character as Record<string, unknown> | undefined) ?? {}
  const {
    curCode,
    cur: _legacyCur,
    ...characterValues
  } = character as Record<string, unknown> & {
    curCode?: string
  }
  Object.assign(characterMemory.value, new CharacterMemory(), characterValues)
  characterMemory.value.cur = Creatures.value.find((c) => c.code() == curCode) ?? null

  const battle = (data.battle as Record<string, unknown> | undefined) ?? {}
  loadBattleMemoryData(battleMemory.value, battle.attack as Record<string, unknown> | undefined, 1)
  loadBattleMemoryData(
    battleMemoryHeal.value,
    battle.heal as Record<string, unknown> | undefined,
    2
  )
  loadBattleMemoryData(
    battleMemoryStatus.value,
    battle.status as Record<string, unknown> | undefined,
    3
  )
  Object.assign(
    moveMemory.value,
    new MoveMemory(),
    (battle.move as Record<string, unknown> | undefined) ?? {}
  )
}

function loadMapData(
  m: Record<string, unknown>,
  options: { preserveView?: boolean; preserveAssets?: boolean } = {}
): void {
  const previousView = {
    viewX: mm.viewX,
    viewY: mm.viewY,
    viewScale: mm.viewScale
  }
  const previousAssets = mm.assets
  const sourceRenderScale =
    m.viewUnit == 'css' ? 1 : normalizeRenderScale(m.renderScale ?? defaultRenderScale)
  const viewScaleRatio = currentRenderScale() / sourceRenderScale
  Object.assign(mm, new MapMemory())
  if (options.preserveAssets) mm.assets = previousAssets
  if (Array.isArray(m.tokens)) {
    mm.tokens = (m.tokens as typeof mm.tokens).map((token) => ({
      ...token,
      imageScale: normalizedTokenImageScale(token.imageScale)
    }))
  }
  if (m.cellSize) mm.cellSize = m.cellSize as number
  if (m.offsetX !== undefined) mm.offsetX = m.offsetX as number
  if (m.offsetY !== undefined) mm.offsetY = m.offsetY as number
  if (m.viewX !== undefined) mm.viewX = Number(m.viewX) * viewScaleRatio
  else if (options.preserveView) mm.viewX = previousView.viewX
  if (m.viewY !== undefined) mm.viewY = Number(m.viewY) * viewScaleRatio
  else if (options.preserveView) mm.viewY = previousView.viewY
  if (m.viewScale !== undefined) mm.viewScale = Number(m.viewScale) * viewScaleRatio
  else if (options.preserveView) mm.viewScale = previousView.viewScale
  else mm.viewScale = currentRenderScale()
  if (m.bgWorldW) mm.bgWorldW = m.bgWorldW as number
  if (m.bgWorldH) mm.bgWorldH = m.bgWorldH as number
  if (m.gridColor) mm.gridColor = m.gridColor as string
  if (m.gridAlpha !== undefined) mm.gridAlpha = m.gridAlpha as number
  if (m.gridDashLength !== undefined) mm.gridDashLength = m.gridDashLength as number
  if (m.gridLineWidth !== undefined) mm.gridLineWidth = m.gridLineWidth as number
  if (m.fogPolygons) mm.fogPolygons = m.fogPolygons as typeof mm.fogPolygons
  if (m.fogAlpha !== undefined) mm.fogAlpha = m.fogAlpha as number
  if (m.drawings) mm.drawings = m.drawings as typeof mm.drawings
  if (!options.preserveAssets && m.assets) mm.assets = m.assets as typeof mm.assets
  if (m.currentBackgroundKey !== undefined)
    mm.currentBackgroundKey = m.currentBackgroundKey as string
  if (m.hpDisplayLevels) mm.hpDisplayLevels = m.hpDisplayLevels as Record<string, number>
  if (m.collapsedSections) mm.collapsedSections = m.collapsedSections as string[]
  if (m.initiativeBarEnabled !== undefined)
    mm.initiativeBarEnabled = m.initiativeBarEnabled as boolean
  if (m.fogVisible !== undefined) mm.fogVisible = m.fogVisible as boolean
  normalizeMapAssets(mm, {
    bgDataUrl: typeof m.bgDataUrl == 'string' ? m.bgDataUrl : undefined,
    tokenImages: Array.isArray(m.tokenImages)
      ? (m.tokenImages as { key: string; dataUrl: string }[])
      : undefined
  })
  ensureCreatureTokens()
  loadTokenImages()
  loadBgFromDataUrl()
  fitCanvas()
}

function hasContent(): boolean {
  if (Creatures.value.length > 0) return true
  if (mm.tokens.length > 0) return true
  if (mm.drawings.length > 0) return true
  if (mm.fogPolygons.length > 0) return true
  if (backgroundDataUrl.value) return true
  return false
}

async function buildSaveJson(): Promise<void> {
  if (window.api && hasContent()) {
    await window.api.quickSave(ESSerializerSerialize())
    await refreshQuickSaveSlots()
  }
}

provide('tacticalMapContext', {
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
})
</script>

<template>
  <div class="desktop" :class="{ 'desktop--calculator': calculatorMode }">
    <SceneSidebar
      :groups="menuGroups"
      :home-label="calculatorHomeButtonLabel"
      :home-active="calculatorMode && calculatorHomeVisible"
      :opened-actions="openedSidebarActions"
      :active-action="activeSidebarAction"
      @select="handleMenuSelect"
    />
    <div ref="containerRef" class="workspace-content">
      <input
        ref="xlsxFileInput"
        type="file"
        multiple
        accept=".xlsx"
        style="display: none"
        @change="onXlsxChange"
      />
      <CalculatorWorkbench
        v-if="calculatorMode && calculatorHomeVisible"
        :character-count="thisCreatures.length"
        :has-map="Boolean(backgroundDataUrl || mm.tokens.length || mm.drawings.length)"
        @select="handleMenuSelect"
      />
      <SceneDockview
        :calculator-mode="calculatorMode"
        :home-visible="!calculatorMode || calculatorHomeVisible"
        @ready="handleDockviewReady"
      />
    </div>
  </div>
  <!-- 右键菜单（根层级，不受 desktop overflow 影响）-->
  <ContextMenu
    v-if="ctxMenuVisible"
    :x="ctxMenuX"
    :y="ctxMenuY"
    :actions="ctxMenuActions"
    @select="handleContextMenu"
    @close="closeContextMenu"
  />
  <div
    v-if="ctxMenuVisible"
    class="context-menu-backdrop"
    @click="closeContextMenu"
    @contextmenu.prevent="closeContextMenu"
  />
</template>

<style scoped>
.desktop {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
  position: relative;
  user-select: none;
  overscroll-behavior: none;
}

.workspace-content {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
}
</style>
