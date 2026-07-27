import type { MapAsset, MapAssetBackground, MapAssetUsage, MapMemory } from './GlobalMemory'

export function backgroundSettingsFromMap(map: MapMemory): MapAssetBackground {
  return {
    cellSize: map.cellSize,
    offsetX: map.offsetX,
    offsetY: map.offsetY,
    bgWorldW: map.bgWorldW,
    bgWorldH: map.bgWorldH,
    gridColor: map.gridColor,
    gridAlpha: map.gridAlpha,
    gridDashLength: map.gridDashLength,
    gridLineWidth: map.gridLineWidth
  }
}

export function applyBackgroundSettingsToMap(map: MapMemory, bg: MapAssetBackground): void {
  map.cellSize = bg.cellSize
  map.offsetX = bg.offsetX
  map.offsetY = bg.offsetY
  map.bgWorldW = bg.bgWorldW
  map.bgWorldH = bg.bgWorldH
  map.gridColor = bg.gridColor
  map.gridAlpha = bg.gridAlpha
  map.gridDashLength = Math.max(0, bg.gridDashLength ?? 0)
  map.gridLineWidth = Math.max(0.1, bg.gridLineWidth ?? 0.5)
}

export function assetUsesToken(asset: MapAsset): boolean {
  return asset.usage == 'token' || asset.usage == 'both'
}

export function assetUsesPortrait(asset: MapAsset): boolean {
  return asset.usage == 'portrait'
}

export function assetUsesBackground(asset: MapAsset): boolean {
  return asset.usage == 'background' || asset.usage == 'both'
}

export function addAssetUsage(asset: MapAsset, usage: 'token' | 'background'): void {
  if (asset.usage == 'both' || asset.usage == usage) return
  if (asset.usage == 'unused') {
    asset.usage = usage
  } else {
    asset.usage = 'both'
  }
}

export function makeUniqueAssetKey(map: MapMemory, preferred: string): string {
  const raw = preferred.replace(/\.(png)$/i, '').trim() || 'asset'
  let key = raw
  let idx = 2
  while (map.assets.some((asset) => asset.key == key)) {
    key = `${raw}-${idx}`
    idx++
  }
  return key
}

export function upsertMapAsset(
  map: MapMemory,
  key: string,
  dataUrl: string,
  usage: MapAssetUsage,
  naturalWidth?: number,
  naturalHeight?: number
): MapAsset {
  let asset = map.assets.find((item) => item.key == key)
  if (!asset) {
    asset = {
      key,
      dataUrl,
      usage,
      naturalWidth,
      naturalHeight,
      background: {
        ...backgroundSettingsFromMap(map),
        bgWorldW: naturalWidth || map.bgWorldW,
        bgWorldH: naturalHeight || map.bgWorldH
      }
    }
    map.assets.push(asset)
  } else {
    asset.dataUrl = dataUrl
    asset.usage = usage
    if (naturalWidth) asset.naturalWidth = naturalWidth
    if (naturalHeight) asset.naturalHeight = naturalHeight
    if (naturalWidth) asset.background.bgWorldW = naturalWidth
    if (naturalHeight) asset.background.bgWorldH = naturalHeight
  }
  return asset
}

export function applyAssetAsBackground(map: MapMemory, asset: MapAsset): void {
  addAssetUsage(asset, 'background')
  map.currentBackgroundKey = asset.key
  applyBackgroundSettingsToMap(map, asset.background)
}

export function saveCurrentBackgroundSettingsToAsset(map: MapMemory, asset: MapAsset): void {
  asset.background = backgroundSettingsFromMap(map)
}

export interface LegacyMapImageData {
  bgDataUrl?: string
  tokenImages?: { key: string; dataUrl: string }[]
}

export function normalizeMapAssets(map: MapMemory, legacy: LegacyMapImageData = {}): void {
  if (!map.assets) map.assets = []

  for (const asset of map.assets) {
    if (!asset.background) {
      asset.background = backgroundSettingsFromMap(map)
    } else {
      if (asset.background.gridDashLength === undefined) {
        asset.background.gridDashLength = 0
      }
      if (asset.background.gridLineWidth === undefined) {
        asset.background.gridLineWidth = 0.5
      }
    }
  }

  for (const token of legacy.tokenImages ?? []) {
    if (!map.assets.some((asset) => asset.key == token.key)) {
      map.assets.push({
        key: token.key,
        dataUrl: token.dataUrl,
        usage: 'token',
        background: backgroundSettingsFromMap(map)
      })
    }
  }

  if (legacy.bgDataUrl) {
    const existing = map.assets.find((asset) => asset.dataUrl == legacy.bgDataUrl)
    if (existing) {
      addAssetUsage(existing, 'background')
      if (!map.currentBackgroundKey) map.currentBackgroundKey = existing.key
      saveCurrentBackgroundSettingsToAsset(map, existing)
    } else {
      const key = makeUniqueAssetKey(map, map.currentBackgroundKey || 'background')
      map.assets.push({
        key,
        dataUrl: legacy.bgDataUrl,
        usage: 'background',
        background: backgroundSettingsFromMap(map)
      })
      map.currentBackgroundKey = key
    }
  }

}
