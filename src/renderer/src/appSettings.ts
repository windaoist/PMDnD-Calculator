import { reactive, ref } from 'vue'

const APP_SETTINGS_KEY = 'pmdnd-kate-app-settings-v1'
const APP_SETTINGS_VERSION = 3
const DEFAULT_UI_SCALE = 1
const DEFAULT_RENDER_SCALE = 2
const DEFAULT_WORKSPACE_MODE: WorkspaceMode = 'calculator'
const DEFAULT_THEME_MODE: ThemeMode = 'light'

export type WorkspaceMode = 'calculator' | 'map'
export type ThemeMode = 'light' | 'dark'

export const uiScaleOptions = [
  { value: 0.75, label: '75%' },
  { value: 0.8, label: '80%' },
  { value: 0.9, label: '90%' },
  { value: 1, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 1.75, label: '175%' },
  { value: 2, label: '200%' }
] as const

export const renderScaleOptions = [1, 2, 3, 4, 5, 6, 7, 8] as const

export interface AppSettings {
  uiScale: number
  renderScale: number
  workspaceMode: WorkspaceMode
  themeMode: ThemeMode
}

export const appSettings = reactive<AppSettings>({
  uiScale: DEFAULT_UI_SCALE,
  renderScale: DEFAULT_RENDER_SCALE,
  workspaceMode: DEFAULT_WORKSPACE_MODE,
  themeMode: DEFAULT_THEME_MODE
})

export const appSettingsError = ref('')

let initialized = false

function normalizeUiScale(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_UI_SCALE
  return uiScaleOptions.reduce(
    (nearest, option) =>
      Math.abs(option.value - numeric) < Math.abs(nearest - numeric) ? option.value : nearest,
    DEFAULT_UI_SCALE
  )
}

export function normalizeRenderScale(value: unknown): number {
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric)) return DEFAULT_RENDER_SCALE
  return Math.max(renderScaleOptions[0], Math.min(renderScaleOptions.at(-1)!, numeric))
}

function normalizeWorkspaceMode(value: unknown): WorkspaceMode {
  // The tactical map now opens as a normal tab. Migrate installations that
  // previously started in the separate map workspace back to the tabbed shell.
  void value
  return DEFAULT_WORKSPACE_MODE
}

function normalizeThemeMode(value: unknown): ThemeMode {
  return value == 'dark' ? 'dark' : DEFAULT_THEME_MODE
}

function applyThemeMode(): void {
  document.documentElement.dataset.theme = appSettings.themeMode
  document.documentElement.style.colorScheme = appSettings.themeMode
}

function applyUiScale(): void {
  window.api.setZoomFactor(appSettings.uiScale)
}

function persistAppSettings(): void {
  try {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: APP_SETTINGS_VERSION,
        uiScale: appSettings.uiScale,
        renderScale: appSettings.renderScale,
        workspaceMode: appSettings.workspaceMode,
        themeMode: appSettings.themeMode
      })
    )
    appSettingsError.value = ''
  } catch {
    appSettingsError.value = '设置无法保存，刷新或重启后可能恢复默认值。'
  }
}

export function initializeAppSettings(): void {
  if (initialized) return
  initialized = true
  try {
    const stored = localStorage.getItem(APP_SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AppSettings> & { version?: number }
      appSettings.uiScale = normalizeUiScale(parsed.uiScale)
      // v1 used 4x as its default. Migrate that value once so existing users
      // also receive the safer 2x default; 4x remains selectable afterwards.
      appSettings.renderScale =
        parsed.version === undefined && Number(parsed.renderScale) == 4
          ? DEFAULT_RENDER_SCALE
          : normalizeRenderScale(parsed.renderScale)
      appSettings.workspaceMode = normalizeWorkspaceMode(parsed.workspaceMode)
      appSettings.themeMode = normalizeThemeMode(parsed.themeMode)
      if (parsed.version !== APP_SETTINGS_VERSION) persistAppSettings()
    }
  } catch {
    appSettingsError.value = '设置读取失败，已使用默认值。'
  }
  applyUiScale()
  applyThemeMode()
}

export function setUiScale(value: unknown): void {
  appSettings.uiScale = normalizeUiScale(value)
  applyUiScale()
  persistAppSettings()
}

export function resetUiScale(): void {
  setUiScale(DEFAULT_UI_SCALE)
}

export function setRenderScale(value: unknown): void {
  appSettings.renderScale = normalizeRenderScale(value)
  persistAppSettings()
}

export function setWorkspaceMode(value: unknown): void {
  appSettings.workspaceMode = normalizeWorkspaceMode(value)
  persistAppSettings()
}

export function setThemeMode(value: unknown): void {
  appSettings.themeMode = normalizeThemeMode(value)
  applyThemeMode()
  persistAppSettings()
}
