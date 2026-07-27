import type { Creature } from './Creature'
import type { MapDrawing, MapFieldData, MapMemory, MapToken } from './GlobalMemory'
import { ClimateStates, FieldStates, SurfaceStates, WeatherStates } from './WeatherField'
import { coneTrianglePoints, pointInPolygonInclusive } from './DrawingGeometry'

interface Point {
  x: number
  y: number
}

interface Bounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface FieldStatusEntry {
  stateName: string
  statusName: string
  layers: number
  sourceCount: number
  dcs: number[]
  casterCodes: string[]
  remainingRounds: number[]
}

const EPS = 1e-8

const fieldColors: Record<string, string> = {
  暴晒: '#ffb300',
  下雨: '#42a5f5',
  下雪: '#b3e5fc',
  冰雹: '#80deea',
  沙尘暴: '#c69c5d',
  起雾: '#b0bec5',
  强烈光照: '#ffd54f',
  光照不足: '#596275',
  气温上升: '#ef6c00',
  气温下降: '#4fc3f7',
  湿度上升: '#26a69a',
  湿度下降: '#bc8f5a',
  气压上升: '#78909c',
  起风: '#90caf9',
  电气场地: '#f2c94c',
  薄雾场地: '#a66bd6',
  精神场地: '#e0569d',
  青草场地: '#35a853',
  幽暗场地: '#4a4f78',
  龙之场地: '#3f7bd7',
  失序场地: '#ff6f61',
  结冰地表: '#8fd8ff',
  着火地表: '#ff7043'
}

export const DrawableFieldStates = [
  ...WeatherStates,
  ...ClimateStates,
  ...FieldStates,
  ...SurfaceStates
]

export function fieldStatusName(stateName: string): string {
  return `在${stateName}中`
}

function normalizeFieldName(stateName: string | undefined): string {
  const trimmed = (stateName ?? '').trim()
  return trimmed || '电气场地'
}

function normalizeFieldColor(color: string | undefined, stateName: string): string {
  const trimmed = (color ?? '').trim()
  if (/^#[\da-fA-F]{6}$/.test(trimmed)) return trimmed
  return fieldColors[stateName] ?? '#607d8b'
}

function normalizeRemainingRounds(value: number | undefined): number {
  const raw = Math.floor(value ?? -1)
  if (!Number.isFinite(raw)) return -1
  return Math.max(-1, raw)
}

export function fieldColorForState(stateName: string, color?: string): string {
  return normalizeFieldColor(color, stateName)
}

export function fieldColorForField(field: Partial<MapFieldData> | undefined): string {
  const normalized = normalizeFieldData(field)
  return normalized.color
}

export function fieldRemainingText(rounds: number): string {
  if (rounds < 0) return '无限'
  return `${rounds} 回合`
}

export function isAreaDrawing(d: MapDrawing | undefined): d is MapDrawing {
  if (!d || d.type == 'arrow' || d.type == 'ruler') return false
  if (d.type == 'circle' || d.type == 'cone' || d.type == 'sector' || d.type == 'rectangle') {
    return d.points.length >= 2
  }
  return d.points.length >= 3
}

export function normalizeFieldData(field: Partial<MapFieldData> | undefined): MapFieldData {
  const stateName = normalizeFieldName(field?.stateName)
  const layers = Math.max(1, Math.floor(field?.layers ?? 1) || 1)
  const casterCode = (field?.casterCode ?? '').trim()
  const dcAbility = ['力量', '敏捷', '体质', '智力', '感知', '魅力'].includes(
    field?.dcAbility ?? ''
  )
    ? (field?.dcAbility ?? '')
    : ''
  const fallbackDc = casterCode.length > 0 ? 0 : 10
  const rawDc = Math.floor(field?.dc ?? fallbackDc)
  const dc = Number.isFinite(rawDc) ? Math.max(0, rawDc) : fallbackDc
  const color = normalizeFieldColor(field?.color, stateName)
  const remainingRounds = normalizeRemainingRounds(field?.remainingRounds)
  return { stateName, layers, casterCode, dcAbility, dc, color, remainingRounds }
}

export function drawingIsField(
  d: MapDrawing | undefined
): d is MapDrawing & { field: MapFieldData } {
  return Boolean(isAreaDrawing(d) && d.field && normalizeFieldData(d.field).remainingRounds != 0)
}

export function applyFieldDataToDrawing(
  d: MapDrawing | undefined,
  field: Partial<MapFieldData> | undefined
): boolean {
  if (!isAreaDrawing(d)) return false
  d.field = normalizeFieldData(field)
  return true
}

export function removeFieldDataFromDrawing(d: MapDrawing | undefined): boolean {
  if (!d?.field) return false
  delete d.field
  return true
}

export function convertAreaDrawingsToFields(
  map: MapMemory,
  field: Partial<MapFieldData> | undefined
): number {
  let count = 0
  for (const drawing of map.drawings) {
    if (applyFieldDataToDrawing(drawing, field)) count += 1
  }
  return count
}

export function advanceFieldRounds(map: MapMemory): number {
  let expired = 0
  for (const drawing of map.drawings) {
    if (!drawing.field) continue
    const field = normalizeFieldData(drawing.field)
    if (field.remainingRounds < 0) {
      drawing.field = field
      continue
    }
    if (field.remainingRounds > 0) {
      field.remainingRounds -= 1
    }
    if (field.remainingRounds <= 0) {
      delete drawing.field
      expired += 1
    } else {
      drawing.field = field
    }
  }
  return expired
}

function angleDiff(a: number, b: number): number {
  let diff = a - b
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return diff
}

function pointInBounds(p: Point, bounds: Bounds): boolean {
  return (
    p.x >= bounds.left - EPS &&
    p.x <= bounds.right + EPS &&
    p.y >= bounds.top - EPS &&
    p.y <= bounds.bottom + EPS
  )
}

function boundsCorners(bounds: Bounds): [Point, Point, Point, Point] {
  return [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom }
  ]
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function pointOnSegment(p: Point, a: Point, b: Point): boolean {
  if (Math.abs(cross(a, b, p)) > EPS) return false
  return (
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  )
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (
    ((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
    ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))
  ) {
    return true
  }
  return (
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d)
  )
}

function boundsEdges(bounds: Bounds): [Point, Point][] {
  const corners = boundsCorners(bounds)
  return corners.map((point, idx) => [point, corners[(idx + 1) % corners.length]])
}

function polygonIntersectsBounds(polygon: Point[], bounds: Bounds): boolean {
  if (polygon.length < 3) return false
  if (polygon.some((point) => pointInBounds(point, bounds))) return true
  const corners = boundsCorners(bounds)
  if (corners.some((point) => pointInPolygonInclusive(point, polygon))) return true
  const edges = boundsEdges(bounds)
  for (let idx = 0; idx < polygon.length; idx++) {
    const start = polygon[idx]
    const end = polygon[(idx + 1) % polygon.length]
    if (edges.some(([a, b]) => segmentsIntersect(start, end, a, b))) return true
  }
  return false
}

function circleIntersectsBounds(center: Point, radius: number, bounds: Bounds): boolean {
  const closestX = Math.max(bounds.left, Math.min(center.x, bounds.right))
  const closestY = Math.max(bounds.top, Math.min(center.y, bounds.bottom))
  return Math.hypot(center.x - closestX, center.y - closestY) <= radius + EPS
}

function pointInSector(p: Point, center: Point, direction: number, radius: number, half: number): boolean {
  const distance = Math.hypot(p.x - center.x, p.y - center.y)
  if (distance > radius + EPS) return false
  if (distance <= EPS) return true
  const angle = Math.atan2(p.y - center.y, p.x - center.x)
  return Math.abs(angleDiff(angle, direction)) <= half + EPS
}

function segmentCircleIntersections(
  start: Point,
  end: Point,
  center: Point,
  radius: number
): Point[] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const fx = start.x - center.x
  const fy = start.y - center.y
  const a = dx * dx + dy * dy
  if (a <= EPS) return []
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - radius * radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < -EPS) return []
  const root = Math.sqrt(Math.max(0, discriminant))
  const result: Point[] = []
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t >= -EPS && t <= 1 + EPS) {
      result.push({ x: start.x + dx * t, y: start.y + dy * t })
    }
  }
  return result
}

function sectorIntersectsBounds(
  center: Point,
  edgePoint: Point,
  angleDegrees: number,
  bounds: Bounds
): boolean {
  const radius = Math.hypot(edgePoint.x - center.x, edgePoint.y - center.y)
  if (radius <= EPS) return pointInBounds(center, bounds)
  const direction = Math.atan2(edgePoint.y - center.y, edgePoint.x - center.x)
  const half = (angleDegrees * Math.PI) / 360
  if (pointInBounds(center, bounds)) return true
  if (boundsCorners(bounds).some((point) => pointInSector(point, center, direction, radius, half))) {
    return true
  }

  const radialEndA = {
    x: center.x + radius * Math.cos(direction - half),
    y: center.y + radius * Math.sin(direction - half)
  }
  const radialEndB = {
    x: center.x + radius * Math.cos(direction + half),
    y: center.y + radius * Math.sin(direction + half)
  }
  const edges = boundsEdges(bounds)
  if (
    edges.some(
      ([a, b]) =>
        segmentsIntersect(center, radialEndA, a, b) || segmentsIntersect(center, radialEndB, a, b)
    )
  ) {
    return true
  }

  return edges.some(([a, b]) =>
    segmentCircleIntersections(a, b, center, radius).some((point) =>
      pointInSector(point, center, direction, radius, half)
    )
  )
}

export function areaDrawingIntersectsBounds(d: MapDrawing, bounds: Bounds): boolean {
  if (!isAreaDrawing(d)) return false

  if (d.type == 'rectangle') {
    const [p1, p2] = d.points
    return !(
      Math.max(p1.x, p2.x) < bounds.left - EPS ||
      Math.min(p1.x, p2.x) > bounds.right + EPS ||
      Math.max(p1.y, p2.y) < bounds.top - EPS ||
      Math.min(p1.y, p2.y) > bounds.bottom + EPS
    )
  }

  if (d.type == 'polygon') return polygonIntersectsBounds(d.points, bounds)

  if (d.type == 'circle') {
    const [center, edge] = d.points
    return circleIntersectsBounds(center, Math.hypot(edge.x - center.x, edge.y - center.y), bounds)
  }

  if (d.type == 'cone') {
    const triangle = coneTrianglePoints(d)
    return triangle ? polygonIntersectsBounds(triangle, bounds) : false
  }

  if (d.type == 'sector') {
    const [center, edge] = d.points
    return sectorIntersectsBounds(center, edge, d.angle || 45, bounds)
  }

  return false
}

export function pointInAreaDrawingGrid(p: Point, d: MapDrawing): boolean {
  if (!isAreaDrawing(d)) return false

  if (d.type == 'rectangle') {
    const [p1, p2] = d.points
    return (
      p.x >= Math.min(p1.x, p2.x) - EPS &&
      p.x <= Math.max(p1.x, p2.x) + EPS &&
      p.y >= Math.min(p1.y, p2.y) - EPS &&
      p.y <= Math.max(p1.y, p2.y) + EPS
    )
  }

  if (d.type == 'polygon') {
    return pointInPolygonInclusive(p, d.points)
  }

  if (d.type == 'circle') {
    const [p1, p2] = d.points
    const r = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    return Math.hypot(p.x - p1.x, p.y - p1.y) <= r + EPS
  }

  if (d.type == 'cone') {
    const triangle = coneTrianglePoints(d)
    return triangle ? pointInPolygonInclusive(p, triangle) : false
  }

  if (d.type == 'sector') {
    const [p1, p2] = d.points
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const r = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const half = ((d.angle || 45) * Math.PI) / 360
    const da = Math.atan2(p.y - p1.y, p.x - p1.x)
    const dr = Math.hypot(p.x - p1.x, p.y - p1.y)
    return dr <= r + EPS && Math.abs(angleDiff(da, angle)) <= half + EPS
  }

  return false
}

function creatureFootprint(creature: Creature): number {
  const size = creature.sizeAbility.size
  return size < 1 ? 0.5 : Math.floor(size)
}

function tokenBounds(token: MapToken, footprint: number): Bounds {
  const half = footprint / 2
  return {
    left: token.x - half,
    right: token.x + half,
    top: token.y - half,
    bottom: token.y + half
  }
}

export function creatureIsInFieldDrawing(
  creature: Creature,
  drawing: MapDrawing,
  map: MapMemory
): boolean {
  if (!drawingIsField(drawing)) return false
  const token = map.tokens.find((t) => t.code == creature.code())
  if (!token) return false
  return areaDrawingIntersectsBounds(
    drawing,
    tokenBounds(token, creatureFootprint(creature))
  )
}

export function fieldStatusesForCreature(
  creature: Creature | null,
  map: MapMemory
): FieldStatusEntry[] {
  if (!creature) return []
  const entries = new Map<string, FieldStatusEntry>()

  for (const drawing of map.drawings) {
    if (!drawingIsField(drawing) || !creatureIsInFieldDrawing(creature, drawing, map)) continue
    const field = normalizeFieldData(drawing.field)
    const entry = entries.get(field.stateName) ?? {
      stateName: field.stateName,
      statusName: fieldStatusName(field.stateName),
      layers: 0,
      sourceCount: 0,
      dcs: [],
      casterCodes: [],
      remainingRounds: []
    }
    entry.layers += field.layers
    entry.sourceCount += 1
    if (!entry.dcs.includes(field.dc)) entry.dcs.push(field.dc)
    const casterLabel = field.casterCode || '大自然'
    if (!entry.casterCodes.includes(casterLabel)) entry.casterCodes.push(casterLabel)
    if (!entry.remainingRounds.includes(field.remainingRounds)) {
      entry.remainingRounds.push(field.remainingRounds)
    }
    entries.set(field.stateName, entry)
  }

  return Array.from(entries.values()).sort((a, b) => {
    const ai = DrawableFieldStates.findIndex((f) => f.name == a.stateName)
    const bi = DrawableFieldStates.findIndex((f) => f.name == b.stateName)
    const orderDiff = (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
    return orderDiff != 0 ? orderDiff : a.stateName.localeCompare(b.stateName)
  })
}

export function fieldLayersForCreature(
  creature: Creature | null,
  map: MapMemory
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const entry of fieldStatusesForCreature(creature, map)) {
    result[entry.stateName] = entry.layers
  }
  return result
}

export function fieldLabelPoint(d: MapDrawing): Point | null {
  if (!isAreaDrawing(d)) return null
  if (d.type == 'rectangle') {
    const [p1, p2] = d.points
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  }
  if (d.type == 'circle' || d.type == 'cone' || d.type == 'sector') {
    return d.points[0] ?? null
  }
  const sum = d.points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / d.points.length, y: sum.y / d.points.length }
}
