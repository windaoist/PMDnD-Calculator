export const factions = ['玩家', '友方', '中立', '敌方'] as const

export type FactionName = (typeof factions)[number]

export const factionHpColor: Record<string, string> = {
  玩家: '#b3d9ff',
  友方: '#b3ffb3',
  中立: '#ffe0b3',
  敌方: '#ffb3b3'
}

export const factionColor: Record<string, string> = {
  玩家: '#2196f3',
  友方: '#4caf50',
  中立: '#ff9800',
  敌方: '#e53935'
}

export const factionShortLabel: Record<string, string> = {
  玩家: '玩',
  友方: '友',
  中立: '中',
  敌方: '敌'
}

export type DrawMode =
  | 'none'
  | 'ruler'
  | 'arrow'
  | 'rectangle'
  | 'line'
  | 'cone'
  | 'sector'
  | 'circle'
  | 'polygon'
  | 'fog'

export const drawModes: DrawMode[] = [
  'ruler',
  'arrow',
  'rectangle',
  'line',
  'cone',
  'sector',
  'circle',
  'polygon',
  'fog'
]

export const drawModeTitles: Record<Exclude<DrawMode, 'none'>, string> = {
  ruler: '标尺',
  arrow: '箭头',
  rectangle: '矩形',
  line: '线形',
  cone: '锥状',
  sector: '扇形',
  circle: '圆形',
  polygon: '多边形',
  fog: '迷雾多边形'
}

export const drawModeLabels: Record<Exclude<DrawMode, 'none'>, string> = {
  ruler: '测距',
  arrow: '箭头',
  rectangle: '矩形',
  line: '线形',
  cone: '锥状',
  sector: '扇形',
  circle: '圆形',
  polygon: '多边',
  fog: '迷雾'
}

export interface PanelSizePreset {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

export const panelSizePresets: Record<string, PanelSizePreset> = {
  CharacterListPanel: { width: 380, height: 560, minWidth: 220, minHeight: 300 },
  CharacterFullPanel: { width: 600, height: 680, minWidth: 280, minHeight: 420 },
  CharacterSheetPanel: { width: 300, height: 280, minWidth: 200, minHeight: 180 },
  BattlePanel: { width: 920, height: 680, minWidth: 300, minHeight: 420 },
  MovePanel: { width: 920, height: 680, minWidth: 300, minHeight: 420 },
  MultiTargetPanel: { width: 980, height: 700, minWidth: 300, minHeight: 420 },
  WeatherFieldPanel: { width: 720, height: 540, minWidth: 260, minHeight: 300 },
  SurvivePanel: { width: 880, height: 640, minWidth: 280, minHeight: 380 },
  StatusPanel: { width: 820, height: 620, minWidth: 280, minHeight: 360 },
  CalendarPanel: { width: 680, height: 360, minWidth: 260, minHeight: 360 },
  FallDamagePanel: { width: 520, height: 340, minWidth: 260, minHeight: 260 },
  GrapplePanel: { width: 720, height: 560, minWidth: 280, minHeight: 360 },
  CraftingPanel: { width: 560, height: 480, minWidth: 240, minHeight: 320 },
  RestPanel: { width: 660, height: 520, minWidth: 260, minHeight: 340 },
  RaceStatsPanel: { width: 840, height: 680, minWidth: 280, minHeight: 420 },
  InitiativePanel: { width: 820, height: 200, minWidth: 180, minHeight: 72 },
  AssetManagerPanel: { width: 860, height: 620, minWidth: 280, minHeight: 420 },
  BackgroundSettingsPanel: { width: 700, height: 560, minWidth: 260, minHeight: 360 },
  AboutPanel: { width: 420, height: 300, minWidth: 220, minHeight: 220 },
  FieldEditPanel: { width: 520, height: 420, minWidth: 260, minHeight: 280 },
  SettingsPanel: { width: 440, height: 320, minWidth: 260, minHeight: 260 }
}

export const defaultPanelSizePreset: PanelSizePreset = {
  width: 280,
  height: 260,
  minWidth: 180,
  minHeight: 160
}
