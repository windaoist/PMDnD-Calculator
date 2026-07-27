<script setup lang="ts">
import {
  ElemType,
  Move,
  Skill,
  Feature,
  Equipment,
  Item,
  Race,
  Attribute,
  sizeString,
  tagList
} from '@renderer/model/DataType'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import { ref, watch, computed, nextTick } from 'vue'
import {
  CharacterMemory,
  environmentStatusEntriesForCreature,
  mapMemory,
  toolsMemory,
  ToolsMemory,
  type MapAsset
} from '@renderer/model/GlobalMemory'
import Creatures, { type Creature } from '@renderer/model/Creature'
import { valueToColorBinary } from '@renderer/utils'

type CharacterPanelParams = {
  code?: string
}

type DockviewPanelProps = CharacterPanelParams & {
  params?: CharacterPanelParams
}

type OverviewStatusItem = {
  key: string
  name: string
  detail: string
}

const props = defineProps<{ params?: DockviewPanelProps }>()

const memory = ref<CharacterMemory>(new CharacterMemory())
const toolsMem = ref<ToolsMemory>(toolsMemory.value)
const mm = mapMemory.value
const tokenCanvas = ref<HTMLCanvasElement | null>(null)
const temporaryRaceName = ref('')
const temporaryRaceLevel = ref(1)
const temporaryRaceBattleScale = ref(1)
const temporaryRaceCastScale = ref(1)
const temporaryRaceAttributes = ref('100/100/100/100/100/100/0')
const temporaryRaceCantrips = ref(0)
const temporaryRaceError = ref('')

const creatureCode = computed(() => props.params?.params?.code ?? props.params?.code ?? '')
const currentCode = computed(() => memory.value.cur?.code() ?? creatureCode.value)
const currentName = computed(() => memory.value.cur?.name() ?? '')
const portraitAsset = computed(() => findPortraitAsset(currentCode.value))
const tokenAsset = computed(() => findTokenAsset(currentCode.value, currentName.value))
const isOverviewPage = computed(() => memory.value.pageNumber == 1)
const overviewBattleRows = computed(() => {
  const cur = memory.value.cur
  if (!cur) return []
  return [
    { label: '物攻', value: cur.patk(), change: overviewBattleChange(cur, 1) },
    { label: '物防', value: cur.pdef(), change: overviewBattleChange(cur, 2) },
    { label: '特攻', value: cur.satk(), change: overviewBattleChange(cur, 3) },
    { label: '特防', value: cur.sdef(), change: overviewBattleChange(cur, 4) },
    { label: '速度', value: cur.spd(), change: overviewBattleChange(cur, 5) }
  ]
})
const overviewAbilityRows = computed(() => {
  const cur = memory.value.cur
  if (!cur) return []
  return ['力量', '敏捷', '体质', '智力', '感知', '魅力'].map((label, idx) => ({
    label,
    value: cur.ability(idx),
    modifier: cur.modifier(idx),
    save: cur.save(idx)
  }))
})
const overviewFeatureList = computed(() => {
  const cur = memory.value.cur
  if (!cur) return []
  return [...cur.classFeatures, ...cur.nonClassFeatures].filter((feature) => feature.name.trim())
})
const overviewStatusList = computed<OverviewStatusItem[]>(() => {
  const cur = memory.value.cur
  if (!cur) return []
  const environmentStatuses = environmentStatusEntriesForCreature(cur).map((entry) => ({
    key: `environment-${entry.typeLabel}-${entry.stateName}`,
    name: entry.statusName,
    detail: `${entry.typeLabel} / ${entry.layers} 层${entry.details ? ` / ${entry.details}` : ''}`
  }))
  const creatureStatuses = cur.status.status
    .filter((status) => status.stack > 0)
    .map((status) => ({
      key: `status-${status.name}`,
      name: status.name,
      detail: `${status.type ? '累积型' : '持续型'} / ${status.stack} ${
        status.type || status.name == '刚毅' ? '层' : '回合'
      }`
    }))
  return [...environmentStatuses, ...creatureStatuses]
})

watch(
  () => [tokenAsset.value?.dataUrl, memory.value.pageNumber],
  () => {
    nextTick(renderTokenPreview)
  },
  { immediate: true }
)

// 根据 params.code 定位角色
watch(
  creatureCode,
  (code) => {
    if (code) {
      const c = Creatures.value.find((x) => x.code() == code)
      if (c) {
        memory.value.cur = c
        c.shallowRefresh()
        // 默认打开能力页
        if (memory.value.pageNumber < 1 || memory.value.pageNumber > 9) memory.value.pageNumber = 1
      }
    }
  },
  { immediate: true }
)

function toOverviewPage(): void {
  memory.value.pageNumber = 1
}
function toStatPage(): void {
  memory.value.pageNumber = 2
}
function toSkillPage(): void {
  memory.value.pageNumber = 3
}
function toTypePage(): void {
  memory.value.pageNumber = 4
}
function toResistPage(): void {
  memory.value.pageNumber = 5
}
function toFeaturesPage(): void {
  memory.value.pageNumber = 6
}
function toEquipmentsPage(): void {
  memory.value.pageNumber = 7
}
function toMovesPage(): void {
  memory.value.pageNumber = 8
}
function toClassPage(): void {
  memory.value.pageNumber = 9
}

function movCal(): number {
  return (
    Math.ceil(
      (memory.value.movDistance +
        Math.sqrt(
          memory.value.movDistanceX * memory.value.movDistanceX +
            memory.value.movDistanceY * memory.value.movDistanceY
        )) *
        100
    ) / 100
  )
}

function valueToColor(val: number): string {
  if (val == 0) return 'lightgray'
  else if (val > 0) return 'crimson'
  else return 'dodgerblue'
}

function signedValue(val: number): string {
  return val > 0 ? `+${val}` : `${val}`
}

function overviewBattleChange(
  cur: Creature,
  index: 1 | 2 | 3 | 4 | 5
): { text: string; color: string } {
  const levelChange = cur.attributeChange.get(index)
  const statusChange = cur.attributeDChange.get(index) + cur.grandStatus().attributeMdf.get(index)
  const totalChange = levelChange + statusChange
  const text =
    statusChange == 0
      ? signedValue(levelChange)
      : `${signedValue(totalChange)}（状态 ${signedValue(statusChange)}）`
  return {
    text,
    color: valueToColor(-totalChange)
  }
}

function overviewFeatureSource(feature: Feature): string {
  const parts = [feature.source, feature.sourceLevel].filter((part) => part.trim())
  if (feature.innate) parts.push('固有')
  if (!feature.known) parts.push('未知')
  return parts.join(' / ')
}

function moveWheel(event: { preventDefault(): unknown; deltaY: number }): void {
  let movelist: string[] = memory.value.cur?.getMoveList() || []
  if (movelist.length > 0) {
    let index = movelist.indexOf(memory.value.selectedMove)
    if (event.deltaY < 0) {
      memory.value.selectedMove = movelist[Math.max(index - 1, 0)]
    } else if (event.deltaY > 0) {
      memory.value.selectedMove = movelist[Math.min(index + 1, movelist.length - 1)]
    }
  } else {
    memory.value.selectedMove = ''
  }
  event.preventDefault()
}

function currentMove(): Move {
  return memory.value.cur?.getMove(memory.value.selectedMove) ?? new Move()
}

function matchesKeyword(feature: Feature, keyword: string): boolean {
  if (!keyword) return true
  const lowerKeyword = keyword.toLowerCase()
  return (
    feature.name.toLowerCase().includes(lowerKeyword) ||
    feature.source.toLowerCase().includes(lowerKeyword) ||
    feature.description.toLowerCase().includes(lowerKeyword)
  )
}

function matchesEquipmentOrItemKeyword(obj: Equipment | Item, keyword: string): boolean {
  if (!keyword) return true
  const lowerKeyword = keyword.toLowerCase()
  if ('slot' in obj) {
    const equipment = obj as Equipment
    return (
      equipment.name.toLowerCase().includes(lowerKeyword) ||
      equipment.slot.toLowerCase().includes(lowerKeyword) ||
      equipment.category.toLowerCase().includes(lowerKeyword) ||
      equipment.performance.toLowerCase().includes(lowerKeyword) ||
      equipment.description.toLowerCase().includes(lowerKeyword) ||
      tagList(equipment.tags).some((tag) => tag.toLowerCase().includes(lowerKeyword))
    )
  }
  if ('unitWeight' in obj) {
    const item = obj as Item
    return (
      item.name.toLowerCase().includes(lowerKeyword) ||
      item.type.toLowerCase().includes(lowerKeyword) ||
      item.effect.toLowerCase().includes(lowerKeyword) ||
      item.description.toLowerCase().includes(lowerKeyword) ||
      tagList(item.tags).some((tag) => tag.toLowerCase().includes(lowerKeyword))
    )
  }
  return false
}

function calculateTotalWeight(items: (Equipment | Item)[]): number {
  return items.reduce((total, item) => {
    if ('weight' in item) {
      return total + item.weight
    }
    if ('unitWeight' in item) {
      return total + item.unitWeight * item.quantity
    }
    return total
  }, 0)
}

function knownFeatureCount(features: Feature[]): number {
  return features.filter((feature) => feature.known).length
}

function raceTypeCount(type: string): number {
  return memory.value.cur?.races.filter((race) => race.type == type).length ?? 0
}

function castLvFrom(type: string): number {
  return (
    memory.value.cur?.races.reduce((total, race) => {
      return race.type == type && (type != '种族' || race.enabled) ? total + race.castLv() : total
    }, 0) ?? 0
  )
}

function enableRace(race: Race, event: Event): void {
  const cur = memory.value.cur
  if (!cur) return
  const input = event.target as HTMLInputElement
  if (!input.checked) {
    input.checked = true
    return
  }
  cur.races
    .filter((entry) => entry.type == '种族')
    .forEach((entry) => (entry.enabled = entry === race))
  cur.shallowRefresh()
}

function addTemporaryRace(): void {
  const cur = memory.value.cur
  if (!cur) return
  const name = temporaryRaceName.value.trim()
  if (!name) {
    temporaryRaceError.value = '请输入临时种族名。'
    return
  }
  if (cur.races.some((race) => race.type == '种族' && race.name.trim() == name)) {
    temporaryRaceError.value = '种族名不能与已有种族重复。'
    return
  }
  const values = temporaryRaceAttributes.value.split(/[\/／]/).map((value) => Number(value.trim()))
  if (
    values.length != 7 ||
    values.some((value) => !Number.isFinite(value)) ||
    values.slice(0, 6).some((value) => value <= 0) ||
    values[6] < 0
  ) {
    temporaryRaceError.value =
      '种族值格式应为 HP/物攻/物防/特攻/特防/速度/PP；前六项须大于 0，PP 不得小于 0。'
    return
  }
  const numericFields = [
    temporaryRaceLevel.value,
    temporaryRaceBattleScale.value,
    temporaryRaceCastScale.value,
    temporaryRaceCantrips.value
  ]
  if (numericFields.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
    temporaryRaceError.value = '等级、倍率和戏法位必须是非负数字。'
    return
  }
  cur.races.filter((race) => race.type == '种族').forEach((race) => (race.enabled = false))
  const race = new Race(
    '种族',
    name,
    Number(temporaryRaceLevel.value),
    Number(temporaryRaceBattleScale.value),
    Number(temporaryRaceCastScale.value),
    new Attribute(...(values as [number, number, number, number, number, number, number])),
    Number(temporaryRaceCantrips.value)
  )
  race.temporary = true
  race.enabled = true
  cur.races.push(race)
  cur.shallowRefresh()
  temporaryRaceName.value = ''
  temporaryRaceError.value = ''
}

function removeTemporaryRace(race: Race): void {
  const cur = memory.value.cur
  if (!cur || !race.temporary) return
  const index = cur.races.indexOf(race)
  if (index < 0) return
  const wasEnabled = race.enabled
  cur.races.splice(index, 1)
  if (wasEnabled) {
    const fallback = cur.races.find((entry) => entry.type == '种族')
    if (fallback) fallback.enabled = true
  }
  cur.shallowRefresh()
}

function sameAssetCode(a: string | undefined, b: string): boolean {
  return !!a && a.toLowerCase() == b.toLowerCase()
}

function findPortraitAsset(code: string): MapAsset | null {
  if (!code) return null
  const lower = code.toLowerCase()
  return (
    mm.assets.find(
      (asset) =>
        asset.usage == 'portrait' &&
        (sameAssetCode(asset.portraitForCode, code) ||
          asset.key.toLowerCase() == `portrait:${lower}` ||
          asset.key.toLowerCase() == `${lower}-portrait`)
    ) ?? null
  )
}

function findTokenAsset(code: string, name: string): MapAsset | null {
  if (!code) return null
  const lowerCode = code.toLowerCase()
  const lowerName = name.toLowerCase()
  return (
    mm.assets.find((asset) => {
      if (asset.usage != 'token' && asset.usage != 'both') return false
      if (sameAssetCode(asset.tokenForCode, code)) return true
      const lowerKey = asset.key.toLowerCase()
      return lowerKey == lowerCode || (!!lowerName && lowerKey == lowerName)
    }) ?? null
  )
}

function renderTokenPreview(): void {
  const canvas = tokenCanvas.value
  const dataUrl = tokenAsset.value?.dataUrl
  if (!canvas || !dataUrl) return

  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const img = new Image()
  img.onload = () => {
    if (tokenAsset.value?.dataUrl != dataUrl) return
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (iw <= 0 || ih <= 0) return
    const scale = Math.min(rect.width / iw, rect.height / ih)
    const drawW = iw * scale
    const drawH = ih * scale
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.imageSmoothingEnabled = drawW * dpr <= iw && drawH * dpr <= ih
    ctx.drawImage(img, (rect.width - drawW) / 2, (rect.height - drawH) / 2, drawW, drawH)
  }
  img.src = dataUrl
}

function deleteCurrentCharacter(): void {
  const cur = memory.value.cur
  if (!cur) return
  if (!window.confirm(`确定删除角色“${cur.name()}”（${cur.code()}）吗？`)) return
  const index = Creatures.value.findIndex((creature) => creature.code() == cur.code())
  if (index >= 0) Creatures.value.splice(index, 1)
  memory.value.cur = null
}

if (memory.value.cur != null) {
  memory.value.cur.shallowRefresh()
}
</script>

<template>
  <div
    v-if="memory.cur != null"
    class="character-full-panel"
    :class="{
      'has-character-background': portraitAsset || tokenAsset,
      'overview-mode': isOverviewPage
    }"
  >
    <div class="character-full-shell">
      <div class="w3-bar character-tabs">
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-black': memory.pageNumber == 1 }"
          @click="toOverviewPage"
        >
          概要
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-black': memory.pageNumber == 2 }"
          @click="toStatPage"
        >
          能力
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-black': memory.pageNumber == 3 }"
          @click="toSkillPage"
        >
          技术
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{
            'w3-black': memory.pageNumber == 4
          }"
          @click="toTypePage"
        >
          属性
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-black': memory.pageNumber == 5 }"
          @click="toResistPage"
        >
          抗性
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-black': memory.pageNumber == 6 }"
          @click="toFeaturesPage"
        >
          特性
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-black': memory.pageNumber == 7 }"
          @click="toEquipmentsPage"
        >
          装备与道具
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-black': memory.pageNumber == 8 }"
          @click="toMovesPage"
        >
          招式
        </button>
        <button
          class="w3-bar-item w3-button"
          :class="{ 'w3-red': memory.pageNumber == 9 }"
          @click="toClassPage"
        >
          种族与职业
        </button>
      </div>
      <div class="character-content">
        <div
          v-if="tokenAsset && !isOverviewPage"
          class="character-art-background token-only"
          aria-hidden="true"
        >
          <canvas v-if="tokenAsset" ref="tokenCanvas" class="character-token-image"></canvas>
        </div>
        <section v-if="!isOverviewPage" class="character-summary">
          <div class="character-summary-head">
            <div class="character-title-row">
              <div>
                <div class="character-name-line">
                  <span class="character-name">{{ memory.cur.name() }}</span>
                  <span class="character-profile">
                    {{ memory.cur.profile.gender }}性{{ memory.cur.profile.species }}（{{
                      memory.cur.profile.pronoun
                    }}），年龄 {{ memory.cur.profile.age }}
                  </span>
                </div>
                <div class="character-code">{{ memory.cur.code() }}</div>
              </div>
            </div>
            <div class="character-stats-strip">
              <span>PLV {{ memory.cur.characterLv() }}</span>
              <span>CR {{ memory.cur.battleLv() }}</span>
              <span>施法者 {{ memory.cur.castLv() }}</span>
              <span>种族最大 {{ memory.cur.maxPokemonRing() }} 环</span>
              <span>施法最大 {{ memory.cur.maxRing() }} 环</span>
            </div>
          </div>
          <div class="resource-grid">
            <div class="resource-card hp-card">
              <div
                class="resource-fill hp"
                :style="{
                  width: Math.max(Math.min(100, 100 * memory.cur.hpRatio()), 0) + '%'
                }"
              ></div>
              <div class="resource-content resource-content-split">
                <div class="resource-main">
                  <span class="resource-label">HP</span>
                  <vue-number-input
                    v-model="memory.cur.currentHP"
                    size="small"
                    inline
                    center
                    :step="1"
                  />
                  <span class="resource-max">/ {{ memory.cur.maxHP() }}</span>
                  <span class="resource-percent">{{ memory.cur.hpPercentageString() }}</span>
                </div>
                <div class="resource-shield">
                  <span class="resource-label muted-label">护盾</span>
                  <vue-number-input
                    v-model="memory.cur.tempHP"
                    size="small"
                    inline
                    center
                    :step="1"
                  />
                </div>
              </div>
            </div>
            <div class="resource-card pp-card">
              <div
                class="resource-fill pp"
                :style="{
                  width:
                    Math.max(Math.min(100, (100 * memory.cur.currentPP) / memory.cur.maxPP()), 0) +
                    '%'
                }"
              ></div>
              <div class="resource-content resource-content-compact">
                <span class="resource-label">PP</span>
                <vue-number-input
                  v-model="memory.cur.currentPP"
                  size="small"
                  inline
                  center
                  :step="1"
                />
                <span>/ {{ memory.cur.maxPP() }}</span>
              </div>
            </div>
            <label
              class="resource-card concentration-card"
              :class="{ active: memory.cur.concentrating }"
            >
              <input v-model="memory.cur.concentrating" type="checkbox" />
              <span>{{ memory.cur.concentrating ? '正在专注' : '未专注' }}</span>
            </label>
          </div>
        </section>
        <div v-if="isOverviewPage" class="character-overview">
          <section class="overview-portrait-stage">
            <img
              v-if="portraitAsset"
              class="overview-portrait-image"
              :src="portraitAsset.dataUrl"
              alt=""
            />
            <div v-else class="overview-portrait-fallback">
              <span>{{ memory.cur.name() }}</span>
            </div>
          </section>

          <section class="overview-sheet">
            <div class="overview-heading">
              <div>
                <div class="overview-title-line">
                  <h2>{{ memory.cur.name() }}</h2>
                  <span class="overview-code">{{ memory.cur.code() }}</span>
                </div>
                <p>
                  {{ memory.cur.profile.gender }}性{{ memory.cur.profile.species }}（{{
                    memory.cur.profile.pronoun
                  }}），年龄 {{ memory.cur.profile.age }}
                </p>
              </div>
              <canvas v-if="tokenAsset" ref="tokenCanvas" class="overview-token-image"></canvas>
            </div>

            <div class="overview-chip-row">
              <span>阵营 {{ memory.cur.faction }}</span>
              <span>{{ sizeString(memory.cur.sizeAbility.size) }}</span>
              <span>PLV {{ memory.cur.characterLv() }}</span>
              <span>CR {{ memory.cur.battleLv() }}</span>
              <span>施法者 {{ memory.cur.castLv() }}</span>
              <span>先攻 {{ memory.cur.initiative() + memory.cur.tempInitiative }}</span>
            </div>

            <div class="overview-resource-grid">
              <div class="resource-card hp-card overview-resource-card">
                <div
                  class="resource-fill hp"
                  :style="{
                    width: Math.max(Math.min(100, 100 * memory.cur.hpRatio()), 0) + '%'
                  }"
                ></div>
                <div class="resource-content resource-content-split">
                  <div class="resource-main">
                    <span class="resource-label">HP</span>
                    <vue-number-input
                      v-model="memory.cur.currentHP"
                      size="small"
                      inline
                      center
                      :step="1"
                    />
                    <span class="resource-max">/ {{ memory.cur.maxHP() }}</span>
                    <span class="resource-percent">{{ memory.cur.hpPercentageString() }}</span>
                  </div>
                  <div class="resource-shield">
                    <span class="resource-label muted-label">护盾</span>
                    <vue-number-input
                      v-model="memory.cur.tempHP"
                      size="small"
                      inline
                      center
                      :step="1"
                    />
                  </div>
                </div>
              </div>
              <div class="resource-card pp-card overview-resource-card">
                <div
                  class="resource-fill pp"
                  :style="{
                    width:
                      Math.max(
                        Math.min(100, (100 * memory.cur.currentPP) / memory.cur.maxPP()),
                        0
                      ) + '%'
                  }"
                ></div>
                <div class="resource-content resource-content-compact">
                  <span class="resource-label">PP</span>
                  <vue-number-input
                    v-model="memory.cur.currentPP"
                    size="small"
                    inline
                    center
                    :step="1"
                  />
                  <span>/ {{ memory.cur.maxPP() }}</span>
                </div>
              </div>
              <label
                class="resource-card concentration-card overview-resource-card"
                :class="{ active: memory.cur.concentrating }"
              >
                <input v-model="memory.cur.concentrating" type="checkbox" />
                <span>{{ memory.cur.concentrating ? '正在专注' : '未专注' }}</span>
              </label>
            </div>

            <section class="overview-card overview-scroll-card overview-status-card-inline">
              <h3>状态</h3>
              <div class="overview-scroll-list">
                <div v-if="overviewStatusList.length == 0" class="overview-empty">暂无状态</div>
                <template v-else>
                  <article
                    v-for="status in overviewStatusList"
                    :key="`inline-${status.key}`"
                    class="overview-list-item compact"
                  >
                    <strong>{{ status.name }}</strong>
                    <small>{{ status.detail }}</small>
                  </article>
                </template>
              </div>
            </section>

            <div class="overview-card-grid">
              <section class="overview-card">
                <h3>战斗能力</h3>
                <div class="overview-stat-grid five-cols">
                  <div v-for="row in overviewBattleRows" :key="row.label" class="overview-stat">
                    <span>{{ row.label }}</span>
                    <strong>{{ row.value }}</strong>
                    <small :style="{ color: row.change.color }">{{ row.change.text }}</small>
                  </div>
                </div>
              </section>

              <section class="overview-card">
                <h3>六维属性</h3>
                <div class="overview-stat-grid six-cols">
                  <div v-for="row in overviewAbilityRows" :key="row.label" class="overview-stat">
                    <span>{{ row.label }}</span>
                    <strong>{{ row.value }}</strong>
                    <small
                      >{{ signedValue(row.modifier) }} / 豁免 {{ signedValue(row.save) }}</small
                    >
                  </div>
                </div>
              </section>

              <section class="overview-card overview-metrics-card">
                <h3>行动与体型</h3>
                <div class="overview-metric-groups">
                  <div class="overview-metric-group">
                    <h4>回合资源</h4>
                    <div class="overview-metric-grid">
                      <span>
                        <em>移动</em>
                        <strong
                          >{{ memory.cur.currentMov }}/{{ memory.cur.sizeAbility.mov }}m</strong
                        >
                      </span>
                      <span>
                        <em>动作</em>
                        <strong>{{ memory.cur.currentAction }}/{{ memory.cur.action }}</strong>
                      </span>
                      <span>
                        <em>附赠</em>
                        <strong
                          >{{ memory.cur.currentBonusAction }}/{{ memory.cur.bonusAction }}</strong
                        >
                      </span>
                      <span>
                        <em>反应</em>
                        <strong>{{ memory.cur.currentReaction }}/{{ memory.cur.reaction }}</strong>
                      </span>
                    </div>
                  </div>

                  <div class="overview-metric-group">
                    <h4>体型空间</h4>
                    <div class="overview-metric-grid">
                      <span>
                        <em>体型</em>
                        <strong>{{ sizeString(memory.cur.sizeAbility.size) }}</strong>
                      </span>
                      <span>
                        <em>占地</em>
                        <strong
                          >{{ memory.cur.sizeAbility.size }}m x
                          {{ memory.cur.sizeAbility.size }}m</strong
                        >
                      </span>
                      <span>
                        <em>触及</em>
                        <strong>{{ memory.cur.sizeAbility.reach }}m</strong>
                      </span>
                      <span>
                        <em>身高</em>
                        <strong>{{ memory.cur.sizeAbility.height.toFixed(2) }}m</strong>
                      </span>
                      <span>
                        <em>体重</em>
                        <strong>{{ memory.cur.sizeAbility.weight.toFixed(1) }}kg</strong>
                      </span>
                    </div>
                  </div>

                  <div class="overview-metric-group">
                    <h4>负重与跳跃</h4>
                    <div class="overview-metric-grid">
                      <span>
                        <em>载重</em>
                        <strong
                          >{{ memory.cur.currentLoadCapacity.toFixed(2) }}/{{
                            memory.cur.maxCapacity().toFixed(2)
                          }}kg</strong
                        >
                      </span>
                      <span>
                        <em>跳跃</em>
                        <strong>{{ memory.cur.jumpDistance().toFixed(2) }}m</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div class="overview-list-grid">
              <section class="overview-card overview-scroll-card">
                <h3>特性</h3>
                <div class="overview-scroll-list">
                  <div v-if="overviewFeatureList.length == 0" class="overview-empty">暂无特性</div>
                  <template v-else>
                    <article
                      v-for="feature in overviewFeatureList"
                      :key="`${feature.source}-${feature.sourceLevel}-${feature.name}`"
                      class="overview-list-item"
                    >
                      <strong>{{ feature.name }}</strong>
                      <small>{{ overviewFeatureSource(feature) }}</small>
                      <p>{{ feature.description || '无描述' }}</p>
                    </article>
                  </template>
                </div>
              </section>

              <section class="overview-card overview-scroll-card overview-status-card-list">
                <h3>状态</h3>
                <div class="overview-scroll-list">
                  <div v-if="overviewStatusList.length == 0" class="overview-empty">暂无状态</div>
                  <template v-else>
                    <article
                      v-for="status in overviewStatusList"
                      :key="status.key"
                      class="overview-list-item compact"
                    >
                      <strong>{{ status.name }}</strong>
                      <small>{{ status.detail }}</small>
                    </article>
                  </template>
                </div>
              </section>
            </div>
          </section>
        </div>

        <div v-if="memory.pageNumber == 2">
          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">体型与负重</span>
              <span class="summary-metrics">
                <span>{{ sizeString(memory.cur.sizeAbility.size) }}体型</span>
                <span>{{ memory.cur.sizeAbility.weight.toFixed(1) }}kg</span>
                <span
                  >{{ memory.cur.currentLoadCapacity.toFixed(2) }}/{{
                    memory.cur.maxCapacity()
                  }}kg</span
                >
                <span>跳跃 {{ memory.cur.jumpDistance().toFixed(2) }}m</span>
              </span>
            </summary>
            <div class="section-body compact-form">
              <p>
                身高 {{ memory.cur.sizeAbility.height.toFixed(2) }} 米，体重
                {{ memory.cur.sizeAbility.weight.toFixed(1) }} 千克，占地面积边长
                <vue-number-input
                  v-model="memory.cur.sizeAbility.size"
                  size="small"
                  inline
                  center
                  controls
                  :min="0.5"
                  :step="0.5"
                />
                米（{{ sizeString(memory.cur.sizeAbility.size) }}体型<span
                  v-if="memory.cur.sizeAbility.originalSize.length > 0"
                  >，原始：{{ memory.cur.sizeAbility.originalSize }}</span
                >）
              </p>
              <p>
                载重
                <vue-number-input
                  v-model="memory.cur.currentLoadCapacity"
                  size="small"
                  inline
                  center
                  :step="0.01"
                />
                / {{ memory.cur.maxCapacity() }} 千克，最大拾取
                {{ memory.cur.maxPickup() }} 千克；投掷重量
                {{ memory.cur.optionalThrow().toFixed(2) }}/{{
                  memory.cur.maxThrow().toFixed(2)
                }}
                千克，最多跳 {{ memory.cur.jumpDistance().toFixed(2) }} 米远或
                {{ memory.cur.jumpHeight().toFixed(2) }} 米高
              </p>
              <p>
                被当成临时武器的威力：净重
                {{ memory.cur.improvisedWeaponEffect(toolsMem.gravity, true) }}，包含载重
                {{ memory.cur.improvisedWeaponEffect(toolsMem.gravity) }}
              </p>
            </div>
          </details>

          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">回合资源</span>
              <span class="summary-metrics">
                <span>移动 {{ memory.cur.currentMov }}/{{ memory.cur.sizeAbility.mov }}m</span>
                <span>动作 {{ memory.cur.currentAction }}/{{ memory.cur.action }}</span>
                <span>附赠 {{ memory.cur.currentBonusAction }}/{{ memory.cur.bonusAction }}</span>
                <span>反应 {{ memory.cur.currentReaction }}/{{ memory.cur.reaction }}</span>
                <span>先攻 {{ memory.cur.initiative() + memory.cur.tempInitiative }}</span>
              </span>
            </summary>
            <div class="section-body w3-border-top w3-border-bottom w3-panel compact-form">
              <p>
                <button class="w3-bar-item w3-button" @click="memory.cur.newRound()">
                  开始新一回合
                </button>

                <span style="padding-left: 2em">
                  移动力
                  <vue-number-input
                    v-model="memory.cur.currentMov"
                    size="small"
                    inline
                    center
                    :step="0.01"
                  />
                  / {{ memory.cur.sizeAbility.mov }}m
                </span>

                <a class="w3-right">
                  当前先攻：{{ memory.cur.initiative() }} +
                  <vue-number-input
                    v-model="memory.cur.tempInitiative"
                    size="small"
                    inline
                    center
                    controls
                    :step="1"
                  />
                  = {{ memory.cur.initiative() + memory.cur.tempInitiative }}
                </a>
              </p>

              <p>
                动作
                <vue-number-input
                  v-model="memory.cur.currentAction"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="0"
                />
                / {{ memory.cur.action }}，附赠动作
                <vue-number-input
                  v-model="memory.cur.currentBonusAction"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="0"
                />
                / {{ memory.cur.bonusAction }}，反应
                <vue-number-input
                  v-model="memory.cur.currentReaction"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="0"
                />
                / {{ memory.cur.reaction }}
              </p>
              <p>
                移动力变动
                <vue-number-input
                  v-model="memory.movDistance"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="0"
                />
                + √(
                <vue-number-input
                  v-model="memory.movDistanceX"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="0"
                />^2 +
                <vue-number-input
                  v-model="memory.movDistanceY"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="0"
                />^2) = {{ movCal().toFixed(2) }}m
                <button
                  class="w3-bar-item w3-button"
                  @click="
                    memory.cur.currentMov =
                      Math.round(100 * (memory.cur.currentMov - movCal())) / 100
                  "
                >
                  扣除
                </button>
                <button
                  class="w3-bar-item w3-button"
                  @click="
                    memory.cur.currentMov =
                      Math.round(100 * (memory.cur.currentMov + movCal())) / 100
                  "
                >
                  增加
                </button>
              </p>
            </div>
          </details>

          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">战斗能力</span>
              <span class="summary-metrics">
                <span>物攻 {{ memory.cur.patk() }}</span>
                <span>物防 {{ memory.cur.pdef() }}</span>
                <span>特攻 {{ memory.cur.satk() }}</span>
                <span>特防 {{ memory.cur.sdef() }}</span>
                <span>速度 {{ memory.cur.spd() }}</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>能力</th>
                    <th>当前值</th>
                    <th>原始值</th>
                    <th>固有加成</th>
                    <th>装备加成</th>
                    <th>变化（状态）</th>
                    <th>变化等级</th>
                    <th>变化等级基准</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>物攻</td>
                    <td style="font-weight: bold">{{ memory.cur.patk() }}</td>
                    <td>{{ memory.cur.attributeRaw(1) }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDBase.patk"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDEquip.patk"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().attributeMdf.patk)
                        }"
                      >
                        {{ memory.cur.grandStatus().attributeMdf.patk }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.attributeDChange.patk"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChange.patk"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChangeBase.patk"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>物防</td>
                    <td style="font-weight: bold">
                      {{ memory.cur.pdef() }}({{ memory.cur.pdef(false) }})
                    </td>
                    <td>{{ memory.cur.attributeRaw(2) }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDBase.pdef"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDEquip.pdef"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().attributeMdf.pdef)
                        }"
                      >
                        {{ memory.cur.grandStatus().attributeMdf.pdef }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.attributeDChange.pdef"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChange.pdef"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChangeBase.pdef"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>特攻</td>
                    <td style="font-weight: bold">{{ memory.cur.satk() }}</td>
                    <td>{{ memory.cur.attributeRaw(3) }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDBase.satk"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDEquip.satk"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().attributeMdf.satk)
                        }"
                      >
                        {{ memory.cur.grandStatus().attributeMdf.satk }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.attributeDChange.satk"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChange.satk"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChangeBase.satk"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>特防</td>
                    <td style="font-weight: bold">
                      {{ memory.cur.sdef() }}({{ memory.cur.sdef(false) }})
                    </td>
                    <td>{{ memory.cur.attributeRaw(4) }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDBase.sdef"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDEquip.sdef"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().attributeMdf.sdef)
                        }"
                      >
                        {{ memory.cur.grandStatus().attributeMdf.sdef }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.attributeDChange.sdef"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChange.sdef"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChangeBase.sdef"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>速度</td>
                    <td style="font-weight: bold">{{ memory.cur.spd() }}</td>
                    <td>{{ memory.cur.attributeRaw(5) }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDBase.spd"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeDEquip.spd"
                        size="small"
                        inline
                        center
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{ color: valueToColor(-memory.cur.grandStatus().attributeMdf.spd) }"
                      >
                        {{ memory.cur.grandStatus().attributeMdf.spd }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.attributeDChange.spd"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChange.spd"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.attributeChangeBase.spd"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel">
            <summary class="section-summary">
              <span class="section-title">六维属性</span>
              <span class="summary-metrics">
                <span
                  >力量 {{ memory.cur.strv() }} ({{ memory.cur.strmod() > 0 ? '+' : ''
                  }}{{ memory.cur.strmod() }})</span
                >
                <span
                  >敏捷 {{ memory.cur.dexv() }} ({{ memory.cur.dexmod() > 0 ? '+' : ''
                  }}{{ memory.cur.dexmod() }})</span
                >
                <span
                  >体质 {{ memory.cur.conv() }} ({{ memory.cur.conmod() > 0 ? '+' : ''
                  }}{{ memory.cur.conmod() }})</span
                >
                <span
                  >智力 {{ memory.cur.intv() }} ({{ memory.cur.intmod() > 0 ? '+' : ''
                  }}{{ memory.cur.intmod() }})</span
                >
                <span
                  >感知 {{ memory.cur.wisv() }} ({{ memory.cur.wismod() > 0 ? '+' : ''
                  }}{{ memory.cur.wismod() }})</span
                >
                <span
                  >魅力 {{ memory.cur.chav() }} ({{ memory.cur.chamod() > 0 ? '+' : ''
                  }}{{ memory.cur.chamod() }})</span
                >
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>属性</th>
                    <th>属性值</th>
                    <th>调整值</th>
                    <th>豁免</th>
                    <th>原始值</th>
                    <th>豁免熟练</th>
                    <th>临时修正</th>
                    <th>豁免修正</th>
                    <th>优劣势：攻击</th>
                    <th>技术检定</th>
                    <th>豁免检定</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>力量</td>
                    <td style="font-weight: bold">{{ memory.cur.strv() }}</td>
                    <td>{{ memory.cur.strmod() > 0 ? '+' : '' }}{{ memory.cur.strmod() }}</td>
                    <td>{{ memory.cur.strsave() > 0 ? '+' : '' }}{{ memory.cur.strsave() }}</td>
                    <td>{{ memory.cur.abilityRaw(0) }}</td>
                    <td>{{ memory.cur.abilitySave.str }}</td>
                    <td>
                      <span
                        :style="{ color: valueToColor(-memory.cur.grandStatus().abilityMdf.str) }"
                      >
                        {{ memory.cur.grandStatus().abilityMdf.str }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.abilityBaseD.str"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.abilitySaveD.str"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityMoveMdf.str)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityMoveMdf.str }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityCheckMdf.str)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityCheckMdf.str }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilitySaveMdf.str)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilitySaveMdf.str }}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>敏捷</td>
                    <td style="font-weight: bold">{{ memory.cur.dexv() }}</td>
                    <td>{{ memory.cur.dexmod() > 0 ? '+' : '' }}{{ memory.cur.dexmod() }}</td>
                    <td>{{ memory.cur.dexsave() > 0 ? '+' : '' }}{{ memory.cur.dexsave() }}</td>
                    <td>{{ memory.cur.abilityRaw(1) }}</td>
                    <td>{{ memory.cur.abilitySave.dex }}</td>
                    <td>
                      <span
                        :style="{ color: valueToColor(-memory.cur.grandStatus().abilityMdf.dex) }"
                      >
                        {{ memory.cur.grandStatus().abilityMdf.dex }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.abilityBaseD.dex"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.abilitySaveD.dex"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityMoveMdf.dex)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityMoveMdf.dex }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityCheckMdf.dex)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityCheckMdf.dex }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilitySaveMdf.dex)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilitySaveMdf.dex }}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>体质</td>
                    <td style="font-weight: bold">{{ memory.cur.conv() }}</td>
                    <td>{{ memory.cur.conmod() > 0 ? '+' : '' }}{{ memory.cur.conmod() }}</td>
                    <td>{{ memory.cur.consave() > 0 ? '+' : '' }}{{ memory.cur.consave() }}</td>
                    <td>{{ memory.cur.abilityRaw(2) }}</td>
                    <td>{{ memory.cur.abilitySave.con }}</td>
                    <td>
                      <span
                        :style="{ color: valueToColor(-memory.cur.grandStatus().abilityMdf.con) }"
                      >
                        {{ memory.cur.grandStatus().abilityMdf.con }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.abilityBaseD.con"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.abilitySaveD.con"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityMoveMdf.con)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityMoveMdf.con }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityCheckMdf.con)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityCheckMdf.con }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilitySaveMdf.con)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilitySaveMdf.con }}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>智力</td>
                    <td style="font-weight: bold">{{ memory.cur.intv() }}</td>
                    <td>{{ memory.cur.intmod() > 0 ? '+' : '' }}{{ memory.cur.intmod() }}</td>
                    <td>{{ memory.cur.intsave() > 0 ? '+' : '' }}{{ memory.cur.intsave() }}</td>
                    <td>{{ memory.cur.abilityRaw(3) }}</td>
                    <td>{{ memory.cur.abilitySave.int }}</td>
                    <td>
                      <span
                        :style="{ color: valueToColor(-memory.cur.grandStatus().abilityMdf.int) }"
                      >
                        {{ memory.cur.grandStatus().abilityMdf.int }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.abilityBaseD.int"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.abilitySaveD.int"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityMoveMdf.int)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityMoveMdf.int }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityCheckMdf.int)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityCheckMdf.int }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilitySaveMdf.int)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilitySaveMdf.int }}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>感知</td>
                    <td style="font-weight: bold">{{ memory.cur.wisv() }}</td>
                    <td>{{ memory.cur.wismod() > 0 ? '+' : '' }}{{ memory.cur.wismod() }}</td>
                    <td>{{ memory.cur.wissave() > 0 ? '+' : '' }}{{ memory.cur.wissave() }}</td>
                    <td>{{ memory.cur.abilityRaw(4) }}</td>
                    <td>{{ memory.cur.abilitySave.wis }}</td>
                    <td>
                      <span
                        :style="{ color: valueToColor(-memory.cur.grandStatus().abilityMdf.wis) }"
                      >
                        {{ memory.cur.grandStatus().abilityMdf.wis }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.abilityBaseD.wis"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.abilitySaveD.wis"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityMoveMdf.wis)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityMoveMdf.wis }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityCheckMdf.wis)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityCheckMdf.wis }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilitySaveMdf.wis)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilitySaveMdf.wis }}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>魅力</td>
                    <td style="font-weight: bold">{{ memory.cur.chav() }}</td>
                    <td>{{ memory.cur.chamod() > 0 ? '+' : '' }}{{ memory.cur.chamod() }}</td>
                    <td>{{ memory.cur.chasave() > 0 ? '+' : '' }}{{ memory.cur.chasave() }}</td>
                    <td>{{ memory.cur.abilityRaw(5) }}</td>
                    <td>{{ memory.cur.abilitySave.cha }}</td>
                    <td>
                      <span
                        :style="{ color: valueToColor(-memory.cur.grandStatus().abilityMdf.cha) }"
                      >
                        {{ memory.cur.grandStatus().abilityMdf.cha }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.abilityBaseD.cha"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.abilitySaveD.cha"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityMoveMdf.cha)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityMoveMdf.cha }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilityCheckMdf.cha)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilityCheckMdf.cha }}
                      </span>
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().abilitySaveMdf.cha)
                        }"
                      >
                        {{ memory.cur.grandStatus().abilitySaveMdf.cha }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel">
            <summary class="section-summary">
              <span class="section-title">战斗参数</span>
              <span class="summary-metrics">
                <span>先攻 {{ memory.cur.initiative() }}</span>
                <span>命中 {{ memory.cur.accuracy() }}</span>
                <span>回避 {{ memory.cur.evasion() }}</span>
                <span>效应强度 {{ memory.cur.effectPower() }}</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>参数</th>
                    <th>当前值</th>
                    <th>原始值</th>
                    <th>固有加成</th>
                    <th>装备加成</th>
                    <th>状态修正</th>
                    <th>临时修正</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>先攻</td>
                    <td style="font-weight: bold">{{ memory.cur.initiative() }}</td>
                    <td>{{ memory.cur.initiativeRaw() }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDBase.initiative"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDEquip.initiative"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().battleAbilityMdf.initiative)
                        }"
                      >
                        {{ memory.cur.grandStatus().battleAbilityMdf.initiative }} </span
                      ><span> + </span>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDState.initiative"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDChange.initiative"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>命中</td>
                    <td style="font-weight: bold">{{ memory.cur.accuracy() }}</td>
                    <td>{{ memory.cur.accuracyRaw() }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDBase.acc"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDEquip.acc"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().battleAbilityMdf.acc)
                        }"
                      >
                        {{ memory.cur.grandStatus().battleAbilityMdf.acc }} </span
                      ><span> + </span>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDState.acc"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDChange.acc"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>回避</td>
                    <td style="font-weight: bold">{{ memory.cur.evasion() }}</td>
                    <td>{{ memory.cur.evasionRaw() }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDBase.eva"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDEquip.eva"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().battleAbilityMdf.eva)
                        }"
                      >
                        {{ memory.cur.grandStatus().battleAbilityMdf.eva }} </span
                      ><span> + </span>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDState.eva"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDChange.eva"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>效应强度</td>
                    <td style="font-weight: bold">{{ memory.cur.effectPower() }}</td>
                    <td>{{ memory.cur.effectPowerRaw() }}</td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDBase.pwr"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDEquip.pwr"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(-memory.cur.grandStatus().battleAbilityMdf.pwr)
                        }"
                      >
                        {{ memory.cur.grandStatus().battleAbilityMdf.pwr }} </span
                      ><span> + </span>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDState.pwr"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.battleAbilityDChange.pwr"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div v-if="memory.pageNumber == 3">
          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">技术检定</span>
              <span class="summary-metrics">
                <span>{{ Skill.nameList.length }} 项</span>
                <span
                  >察觉 {{ memory.cur.skillMod('察觉') > 0 ? '+' : ''
                  }}{{ memory.cur.skillMod('察觉') }}</span
                >
                <span
                  >隐匿 {{ memory.cur.skillMod('隐匿') > 0 ? '+' : ''
                  }}{{ memory.cur.skillMod('隐匿') }}</span
                >
                <span
                  >专注 {{ memory.cur.skillMod('专注') > 0 ? '+' : ''
                  }}{{ memory.cur.skillMod('专注') }}</span
                >
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>技术</th>
                    <th>总值</th>
                    <th>熟练</th>
                    <th>职业加成</th>
                    <th>装备加成</th>
                    <th>状态加成</th>
                    <th>优劣势骰</th>
                    <th>保底</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(skillName, index) in Skill.nameList" :key="skillName">
                    <td>{{ skillName }}</td>
                    <td
                      style="font-weight: bold"
                      :style="{
                        color: valueToColor(-memory.cur.skillMod(skillName))
                      }"
                    >
                      {{ memory.cur.skillMod(skillName) > 0 ? '+' : ''
                      }}{{ memory.cur.skillMod(skillName) }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(-memory.cur.skillPro.value[index])
                      }"
                    >
                      {{ memory.cur.skillPro.value[index] }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(-memory.cur.skillRace.value[index])
                      }"
                    >
                      {{ memory.cur.skillRace.value[index] }}
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.skillEquip.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.skillState.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(
                            -memory.cur.skillCheckAdvanceStatus(Skill.nameList[index])
                          )
                        }"
                      >
                        {{ memory.cur.skillCheckAdvanceStatus(Skill.nameList[index]) }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.skillAdvance.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.skillMin.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div v-if="memory.pageNumber == 4">
          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">属性一致</span>
              <span class="summary-metrics">
                <span>{{ ElemType.nameList.slice(0, 22).length }} 种属性</span>
                <span>查看属性加成与临时修正</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>属性</th>
                    <th>一致加成</th>
                    <th>来自种族</th>
                    <th>来自职业</th>
                    <th>来自特性</th>
                    <th>来自装备</th>
                    <th>来自状态</th>
                    <th>其他修正</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(name, index) in ElemType.nameList.slice(0, 22)" :key="name">
                    <td>{{ name }}</td>
                    <td
                      style="font-weight: bold"
                      :style="{
                        color: valueToColor(-memory.cur.typeStab(name))
                      }"
                    >
                      {{ memory.cur.typeStab(name) }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(-memory.cur.typeRace.value[index])
                      }"
                    >
                      {{ memory.cur.typeRace.value[index] }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(-memory.cur.typeClasses.value[index])
                      }"
                    >
                      {{ memory.cur.typeClasses.value[index] }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(-memory.cur.typeAbility.value[index])
                      }"
                    >
                      {{ memory.cur.typeAbility.value[index] }}
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.typeEquip.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.typeState.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.typeChange.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="5"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div v-if="memory.pageNumber == 5">
          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">伤害修正</span>
              <span class="summary-metrics">
                <span>{{ ElemType.nameList.length }} 种伤害</span>
                <span>装备 / 状态 / 其他修正</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>属性</th>
                    <th>伤害修正</th>
                    <th>来自种族</th>
                    <th>来自职业</th>
                    <th>来自特性</th>
                    <th>来自装备</th>
                    <th>来自状态</th>
                    <th>其他修正</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(name, index) in ElemType.nameList" :key="name">
                    <td>{{ name }}</td>
                    <td
                      style="font-weight: bold"
                      :style="{
                        color: valueToColor(memory.cur.typeMdf(name))
                      }"
                    >
                      {{ memory.cur.typeMdf(name) }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(memory.cur.typeMdfRace.value[index])
                      }"
                    >
                      {{ memory.cur.typeMdfRace.value[index] }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(memory.cur.typeMdfClasses.value[index])
                      }"
                    >
                      {{ memory.cur.typeMdfClasses.value[index] }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(memory.cur.typeMdfAbility.value[index])
                      }"
                    >
                      {{ memory.cur.typeMdfAbility.value[index] }}
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.typeMdfEquip.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <span
                        :style="{
                          color: valueToColor(memory.cur.grandStatus().typeMdf.value[index])
                        }"
                      >
                        {{ memory.cur.grandStatus().typeMdf.value[index] }}
                      </span>
                      <span> + </span>
                      <vue-number-input
                        v-model="memory.cur.typeMdfState.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="memory.cur.typeMdfChange.value[index]"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel">
            <summary class="section-summary">
              <span class="section-title">抗性修正</span>
              <span class="summary-metrics">
                <span>{{ memory.cur.resist.resist.length }} 项状态</span>
                <span>种族 / 职业 / 特性 / 装备</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>抗性修正</th>
                    <th>来自种族</th>
                    <th>来自职业</th>
                    <th>来自特性</th>
                    <th>来自装备</th>
                    <th>来自状态</th>
                    <th>其他修正</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="value in memory.cur.resist.resist" :key="value.name">
                    <td>{{ value.name }}</td>
                    <td
                      style="font-weight: bold"
                      :style="{
                        color: valueToColor(value.sum())
                      }"
                    >
                      {{ value.sum() }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(value.race)
                      }"
                    >
                      {{ value.race }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(value.classes)
                      }"
                    >
                      {{ value.classes }}
                    </td>
                    <td
                      :style="{
                        color: valueToColor(value.ability)
                      }"
                    >
                      {{ value.ability }}
                    </td>
                    <td>
                      <vue-number-input
                        v-model="value.equip"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="value.state"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                    <td>
                      <vue-number-input
                        v-model="value.change"
                        size="small"
                        inline
                        center
                        controls
                        :step="1"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div v-if="memory.pageNumber == 6">
          <div class="compact-toolbar">
            <label for="feature-search">筛选特性:</label>
            <input
              id="feature-search"
              v-model="memory.featureSearchKeyword"
              class="w3-input"
              placeholder="输入关键词"
            />
          </div>

          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">非职业特性</span>
              <span class="summary-metrics">
                <span>{{ memory.cur.nonClassFeatures.length }} 项</span>
                <span>已知 {{ knownFeatureCount(memory.cur.nonClassFeatures) }}</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>特性名</th>
                    <th>固有</th>
                    <th>已知</th>
                    <th>来源</th>
                    <th>等级</th>
                    <th>描述</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(feature, index) in memory.cur.nonClassFeatures"
                    v-show="matchesKeyword(feature, memory.featureSearchKeyword)"
                    :key="'nonclass-' + index"
                  >
                    <!-- 新增：v-show 指令进行筛选 -->
                    <td>{{ feature.name }}</td>
                    <td :style="{ color: valueToColorBinary(feature.innate ? 0 : 1) }">
                      {{ feature.innate ? '是' : '否' }}
                    </td>
                    <td :style="{ color: valueToColorBinary(feature.known ? 0 : 1) }">
                      {{ feature.known ? '是' : '否' }}
                    </td>
                    <td>{{ feature.source }}</td>
                    <td>{{ feature.sourceLevel }}</td>
                    <td>
                      <div class="feature-description">{{ feature.description }}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel">
            <summary class="section-summary">
              <span class="section-title">职业特性</span>
              <span class="summary-metrics">
                <span>{{ memory.cur.classFeatures.length }} 项</span>
                <span>已知 {{ knownFeatureCount(memory.cur.classFeatures) }}</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>特性名</th>
                    <th>固有</th>
                    <th>已知</th>
                    <th>来源</th>
                    <th>等级</th>
                    <th>描述</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(feature, index) in memory.cur.classFeatures"
                    v-show="matchesKeyword(feature, memory.featureSearchKeyword)"
                    :key="'class-' + index"
                  >
                    <td>{{ feature.name }}</td>
                    <td :style="{ color: valueToColorBinary(feature.innate ? 0 : 1) }">
                      {{ feature.innate ? '是' : '否' }}
                    </td>
                    <td :style="{ color: valueToColorBinary(feature.known ? 0 : 1) }">
                      {{ feature.known ? '是' : '否' }}
                    </td>
                    <td>{{ feature.source }}</td>
                    <td>{{ feature.sourceLevel }}</td>
                    <td>
                      <div class="feature-description">{{ feature.description }}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div v-if="memory.pageNumber == 7">
          <div class="compact-toolbar">
            <label for="equipment-search">筛选装备:</label>
            <input
              id="equipment-search"
              v-model="memory.equipmentSearchKeyword"
              class="w3-input"
              placeholder="输入关键词"
            />
          </div>

          <p>
            <strong
              >总重量:
              {{
                (
                  calculateTotalWeight(memory.cur.battleEquipment) +
                  calculateTotalWeight(memory.cur.appearanceEquipment) +
                  calculateTotalWeight(memory.cur.items)
                ).toFixed(2)
              }}
              千克</strong
            >
          </p>

          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">战斗装备</span>
              <span class="summary-metrics">
                <span>{{ memory.cur.battleEquipment.length }} 件</span>
                <span>{{ calculateTotalWeight(memory.cur.battleEquipment).toFixed(2) }}kg</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>部位</th>
                    <th>可用类型</th>
                    <th>装备名</th>
                    <th>装备种类</th>
                    <th>装备性能</th>
                    <th>标签</th>
                    <th>描述</th>
                    <th>重量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(eq, index) in memory.cur.battleEquipment"
                    v-show="matchesEquipmentOrItemKeyword(eq, memory.equipmentSearchKeyword)"
                    :key="'battle-eq-' + index"
                  >
                    <td>{{ eq.slot }}</td>
                    <td>{{ eq.usableTypes }}</td>
                    <td>{{ eq.name }}</td>
                    <td>{{ eq.category }}</td>
                    <td class="equipment-performance">{{ eq.performance }}</td>
                    <td>
                      <span
                        v-for="(tag, tagIndex) in tagList(eq.tags)"
                        :key="'battle-tag-' + index + '-' + tagIndex"
                        class="equipment-tag"
                        >{{ tag }}</span
                      >
                    </td>
                    <td class="equipment-description">{{ eq.description }}</td>
                    <td>{{ eq.weight.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel">
            <summary class="section-summary">
              <span class="section-title">外观装备</span>
              <span class="summary-metrics">
                <span>{{ memory.cur.appearanceEquipment.length }} 件</span>
                <span>{{ calculateTotalWeight(memory.cur.appearanceEquipment).toFixed(2) }}kg</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>部位</th>
                    <th>可用类型</th>
                    <th>装备名</th>
                    <th>装备种类</th>
                    <th>装备性能</th>
                    <th>标签</th>
                    <th>描述</th>
                    <th>重量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(eq, index) in memory.cur.appearanceEquipment"
                    v-show="matchesEquipmentOrItemKeyword(eq, memory.equipmentSearchKeyword)"
                    :key="'appearance-eq-' + index"
                  >
                    <td>{{ eq.slot }}</td>
                    <td>{{ eq.usableTypes }}</td>
                    <td>{{ eq.name }}</td>
                    <td>{{ eq.category }}</td>
                    <td class="equipment-performance">{{ eq.performance }}</td>
                    <td>
                      <span
                        v-for="(tag, tagIndex) in tagList(eq.tags)"
                        :key="'appearance-tag-' + index + '-' + tagIndex"
                        class="equipment-tag"
                        >{{ tag }}</span
                      >
                    </td>
                    <td class="equipment-description">{{ eq.description }}</td>
                    <td>{{ eq.weight.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel">
            <summary class="section-summary">
              <span class="section-title">道具</span>
              <span class="summary-metrics">
                <span>{{ memory.cur.items.length }} 类</span>
                <span>{{ calculateTotalWeight(memory.cur.items).toFixed(2) }}kg</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table">
                <thead>
                  <tr>
                    <th>道具类型</th>
                    <th>数量</th>
                    <th>道具名</th>
                    <th>单位重量</th>
                    <th>道具效果</th>
                    <th>标签</th>
                    <th>描述</th>
                    <th>总重量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, index) in memory.cur.items"
                    v-show="matchesEquipmentOrItemKeyword(item, memory.equipmentSearchKeyword)"
                    :key="'item-' + index"
                  >
                    <td>{{ item.type }}</td>
                    <td>{{ item.quantity }}</td>
                    <td>{{ item.name }}</td>
                    <td>{{ item.unitWeight.toFixed(2) }}</td>
                    <td class="item-effect">{{ item.effect }}</td>
                    <td>
                      <span
                        v-for="(tag, tagIndex) in tagList(item.tags)"
                        :key="'item-tag-' + index + '-' + tagIndex"
                        class="item-tag"
                        >{{ tag }}</span
                      >
                    </td>
                    <td class="item-description">{{ item.description }}</td>
                    <td>{{ (item.unitWeight * item.quantity).toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div v-if="memory.pageNumber == 8">
          <div class="compact-toolbar move-toolbar">
            <span>
              记忆位
              <span
                :style="{
                  color:
                    memory.cur.memorizedSpellCount() <= memory.cur.spellCount()
                      ? 'default'
                      : 'crimson'
                }"
              >
                {{ memory.cur.memorizedSpellCount() }} / {{ memory.cur.spellCount() }}
              </span>
            </span>
            <span>
              戏法位
              <span
                :style="{
                  color:
                    memory.cur.memorizedCantripCount() <= memory.cur.cantripCount()
                      ? 'default'
                      : 'crimson'
                }"
              >
                {{ memory.cur.memorizedCantripCount() }} / {{ memory.cur.cantripCount() }}
              </span>
            </span>
            <label for="move-select">查看招式</label>
            <select
              id="move-select"
              v-model="memory.selectedMove"
              style="width: 10em"
              class="w3-select w3-border"
              @wheel="moveWheel"
            >
              <option v-for="name in memory.cur.getMoveList()" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
          </div>

          <details v-if="currentMove().name.length > 0" class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">{{ currentMove().name }}</span>
              <span class="summary-metrics">
                <span>{{ currentMove().ring < 0 ? `动作` : `${currentMove().ring} 环` }}</span>
                <span>{{ currentMove().elemType }}</span>
                <span>攻击 {{ memory.cur.getMoveMdf(currentMove().name) }}</span>
                <span>DC {{ memory.cur.getMoveDC(currentMove().name) }}</span>
              </span>
            </summary>
            <div class="section-body compact-form move-detail">
              <div class="move-title-row">
                <span class="move-title">{{ currentMove().name }}</span>
                <span style="margin-left: 1em; margin-right: 1em">
                  <select
                    v-model="currentMove().inMemory"
                    style="width: 6em"
                    class="w3-select w3-border"
                  >
                    <option :key="'固有'" :value="'固有'">固有</option>
                    <option :key="'是'" :value="'是'">已预备</option>
                    <option :key="''" :value="''">未预备</option>
                  </select>
                </span>
                <span v-if="currentMove().maxCharge > 0">
                  次数剩余：{{ currentMove().chargeAt }}
                  <vue-number-input
                    v-model="currentMove().charge"
                    size="small"
                    inline
                    center
                    :step="1"
                    style="min-width: 75px"
                  />
                  /
                  {{ currentMove().maxCharge }}
                </span>
              </div>
              <div>
                {{ currentMove().ring < 0 ? `动作` : `${currentMove().ring} 环` }}
                {{ currentMove().elemType }}
                {{ currentMove().castAbility }}
              </div>
              <div>
                属性一致加成 {{ memory.cur.getMoveStab(currentMove().name) }}，攻击加值
                {{ memory.cur.getMoveMdf(currentMove().name) }}，法术豁免难度
                {{ memory.cur.getMoveDC(currentMove().name) }}
              </div>
              <div>威力列表：{{ currentMove().powerList.map((m) => m.message()) }}</div>
              <div>施法资源：{{ currentMove().costs() }}</div>
              <div>
                施法距离：{{ currentMove().castRange
                }}{{ currentMove().castRange.includes('*') ? '（受威胁）' : '' }}
              </div>
              <div>
                持续时间：{{ currentMove().concentration.length > 0 ? '专注，至多 ' : ''
                }}{{ currentMove().duration.length > 0 ? currentMove().duration : '立即' }}
              </div>
              <div>法术成分：{{ currentMove().components() }}</div>
              <div v-if="currentMove().cooldown.length > 0">
                冷却回合：{{ currentMove().cooldown }}
              </div>
              <div style="display: flex; flex-direction: column">
                <textarea
                  id="logs"
                  v-model="currentMove().description"
                  spellcheck="false"
                  class="move-description-editor"
                ></textarea>
              </div>
            </div>
          </details>
        </div>

        <div v-if="memory.pageNumber == 9">
          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">种族</span>
              <span class="summary-metrics">
                <span>{{ raceTypeCount('种族') }} 项</span>
                <span>CR {{ memory.cur.battleLvFrom('种族').toFixed(1) }}</span>
                <span>施法 {{ castLvFrom('种族').toFixed(1) }}</span>
              </span>
            </summary>
            <div class="section-body">
              <div class="temporary-race-form">
                <input
                  v-model="temporaryRaceName"
                  class="w3-input w3-border temporary-race-name"
                  placeholder="临时种族名（如 Mega、变形形态）"
                />
                <label>
                  等级
                  <input
                    v-model.number="temporaryRaceLevel"
                    class="w3-input w3-border"
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  战斗倍率
                  <input
                    v-model.number="temporaryRaceBattleScale"
                    class="w3-input w3-border"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </label>
                <label>
                  施法倍率
                  <input
                    v-model.number="temporaryRaceCastScale"
                    class="w3-input w3-border"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </label>
                <label class="temporary-race-stats">
                  种族值（HP/物攻/物防/特攻/特防/速度/PP）
                  <input v-model="temporaryRaceAttributes" class="w3-input w3-border" />
                </label>
                <label>
                  戏法位
                  <input
                    v-model.number="temporaryRaceCantrips"
                    class="w3-input w3-border"
                    type="number"
                    min="0"
                  />
                </label>
                <button
                  class="w3-button w3-blue temporary-race-submit"
                  type="button"
                  @click="addTemporaryRace"
                >
                  增加并启用临时种族
                </button>
              </div>
              <div v-if="temporaryRaceError" class="temporary-race-error">
                {{ temporaryRaceError }}
              </div>
              <table class="w3-table-all w3-centered dense-table race-career-table">
                <thead>
                  <tr>
                    <th>种族名</th>
                    <th>等级</th>
                    <th>战斗倍率</th>
                    <th>施法倍率</th>
                    <th>挑战等级</th>
                    <th>施法者等级</th>
                    <th>种族值</th>
                    <th>记忆位</th>
                    <th>戏法位</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="value in memory.cur.races.filter((s) => s.type == '种族')"
                    :key="value.name"
                  >
                    <td>
                      <div class="race-name-cell">
                        <label class="race-enable-control" title="种族同时只能启用一个">
                          <input
                            type="checkbox"
                            :checked="value.enabled"
                            @change="enableRace(value, $event)"
                          />
                          <span>{{ value.name }}</span>
                        </label>
                        <button
                          v-if="value.temporary"
                          class="temporary-race-delete"
                          type="button"
                          title="删除临时种族"
                          @click="removeTemporaryRace(value)"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                    <td>
                      <vue-number-input
                        v-model="value.lv"
                        size="small"
                        inline
                        center
                        :step="1"
                        :min="0"
                      />
                    </td>
                    <td :style="{ color: valueToColorBinary(value.battleScale) }">
                      {{ value.battleScale.toFixed(2) }}
                    </td>
                    <td :style="{ color: valueToColorBinary(value.castScale) }">
                      {{ value.castScale.toFixed(2) }}
                    </td>
                    <td>{{ value.battleLv().toFixed(1) }}</td>
                    <td>{{ value.castLv().toFixed(1) }}</td>
                    <td>
                      {{ value.attribute.hp }}/{{ value.attribute.patk }}/{{
                        value.attribute.pdef
                      }}/{{ value.attribute.satk }}/{{ value.attribute.sdef }}/{{
                        value.attribute.spd
                      }}/{{ value.attribute.pp }}
                    </td>
                    <td>
                      {{ value.spellCount() }}
                    </td>
                    <td>
                      {{ value.cantripCount }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">职业</span>
              <span class="summary-metrics">
                <span>{{ raceTypeCount('职业') }} 项</span>
                <span>CR {{ memory.cur.battleLvFrom('职业').toFixed(1) }}</span>
                <span>施法 {{ castLvFrom('职业').toFixed(1) }}</span>
              </span>
            </summary>
            <div class="section-body">
              <table class="w3-table-all w3-centered dense-table race-career-table">
                <thead>
                  <tr>
                    <th>职业名</th>
                    <th>等级</th>
                    <th>战斗倍率</th>
                    <th>施法倍率</th>
                    <th>挑战等级</th>
                    <th>施法者等级</th>
                    <th>种族值</th>
                    <th>记忆位</th>
                    <th>戏法位</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="value in memory.cur.races.filter((s) => s.type == '职业')"
                    :key="value.name"
                  >
                    <td>{{ value.name }}</td>
                    <td>
                      <vue-number-input
                        v-model="value.lv"
                        size="small"
                        inline
                        center
                        :step="1"
                        :min="0"
                      />
                    </td>
                    <td :style="{ color: valueToColorBinary(value.battleScale) }">
                      {{ value.battleScale.toFixed(2) }}
                    </td>
                    <td :style="{ color: valueToColorBinary(value.castScale) }">
                      {{ value.castScale.toFixed(2) }}
                    </td>
                    <td>{{ value.battleLv().toFixed(1) }}</td>
                    <td>{{ value.castLv().toFixed(1) }}</td>
                    <td>
                      {{ value.attribute.hp }}/{{ value.attribute.patk }}/{{
                        value.attribute.pdef
                      }}/{{ value.attribute.satk }}/{{ value.attribute.sdef }}/{{
                        value.attribute.spd
                      }}/{{ value.attribute.pp }}
                    </td>
                    <td>
                      {{ value.spellCount() }}
                    </td>
                    <td>
                      {{ value.cantripCount }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="section-panel" open>
            <summary class="section-summary">
              <span class="section-title">角色修正</span>
              <span class="summary-metrics">
                <span>难度 {{ memory.cur.difficultyModifier }}</span>
                <span>传奇 {{ memory.cur.legendaryModifier }}</span>
                <span>{{ memory.cur.faction }}</span>
              </span>
            </summary>
            <div class="section-body compact-form">
              <div
                v-if="memory.cur.battleLvFrom('种族') < memory.cur.battleLvFrom('职业')"
                style="color: crimson"
              >
                警告：种族挑战等级小于职业挑战等级
              </div>
              <br />
              <div>
                难度等级：
                <vue-number-input
                  v-model="memory.cur.difficultyModifier"
                  size="small"
                  inline
                  center
                  :step="0.25"
                  :min="0"
                />
              </div>
              <div>
                传奇修正：
                <vue-number-input
                  v-model="memory.cur.legendaryModifier"
                  size="small"
                  inline
                  center
                  :step="0.1"
                  :min="0"
                />
              </div>
              <div>
                阵营：
                <select
                  v-model="memory.cur.faction"
                  class="w3-select w3-border"
                  style="width: auto; display: inline"
                >
                  <option v-for="f in ['玩家', '友方', '中立', '敌方']" :key="f" :value="f">
                    {{ f }}
                  </option>
                </select>
              </div>
              <div class="danger-zone">
                <button class="w3-button w3-red" @click="deleteCurrentCharacter">删除该角色</button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-full-panel {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  background: #fff;
  font-size: 14px;
}

.character-full-shell {
  min-width: 0;
  min-height: 100%;
}

.character-full-panel.overview-mode {
  overflow: hidden;
}

.overview-mode .character-full-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.character-tabs {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  background-color: white;
  border-bottom: 1px solid #e7e7e7;
  padding: 4px;
}

.character-tabs .w3-button {
  flex: 1 1 74px;
  width: auto;
  min-width: 0;
  padding: 6px 8px;
  font-size: 13px;
  line-height: 1.2;
  white-space: nowrap;
}

.overview-mode .character-tabs {
  position: relative;
  top: auto;
  flex: 0 0 auto;
}

.character-content {
  position: relative;
  isolation: isolate;
  min-width: 0;
  padding: 0.6em;
  container-type: inline-size;
}

.overview-mode .character-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.character-content > :not(.character-art-background) {
  position: relative;
  z-index: 1;
}

.section-panel {
  margin: 0.6em 0;
  border: 1px solid #dfe3e8;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}

.section-panel[open] {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.section-summary {
  display: flex;
  align-items: center;
  gap: 0.65em;
  min-height: 36px;
  padding: 0.45em 0.65em;
  background: #f6f7f9;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.section-summary::-webkit-details-marker {
  display: none;
}

.section-summary::before {
  content: '›';
  flex: 0 0 auto;
  color: #59616b;
  font-size: 18px;
  line-height: 1;
  transition: transform 120ms ease;
}

.section-panel[open] > .section-summary::before {
  transform: rotate(90deg);
}

.section-title {
  flex: 0 0 auto;
  font-weight: 700;
  color: #1f2328;
}

.summary-metrics {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.28em;
  min-width: 0;
}

.summary-metrics span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 1px 7px;
  border: 1px solid #d8dee4;
  border-radius: 999px;
  background: #fff;
  color: #454c56;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
}

.section-body {
  overflow-x: auto;
  padding: 0.65em;
}

.section-body > .dense-table {
  margin: 0;
}

.compact-form {
  display: grid;
  gap: 0.45em;
}

.compact-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45em 0.7em;
  margin: 0.45em 0 0.65em;
}

.compact-toolbar .w3-input,
.compact-toolbar .w3-select {
  width: auto;
  min-width: 12em;
  max-width: 100%;
  display: inline-block;
}

.move-toolbar span {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
}

.move-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4em;
}

.move-title {
  font-size: 18px;
  font-weight: 700;
}

.character-full-panel p {
  margin: 0.45em 0;
  line-height: 1.45;
}

.character-summary {
  display: grid;
  gap: 0.55em;
  margin-bottom: 0.75em;
  padding-bottom: 0.75em;
  border-bottom: 1px solid #eee;
}

.character-summary-head {
  display: grid;
  gap: 0.45em;
  min-width: 0;
}

.character-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4em 1em;
}

.character-name-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2em 0.55em;
  min-width: 0;
}

.character-name {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.15;
}

.character-code {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}

.character-profile {
  color: #555;
  font-size: 13px;
  line-height: 1.25;
}

.character-stats-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em;
}

.character-stats-strip span {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border: 1px solid #e0e0e0;
  background: #f7f7f7;
  font-size: 12px;
}

.character-art-background {
  display: flex;
  position: absolute;
  top: 0.6em;
  right: 0.6em;
  z-index: 0;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 0.7em;
  width: min(100%, 680px);
  pointer-events: none;
}

.character-token-image,
.overview-token-image,
.overview-portrait-image {
  display: block;
  object-fit: contain;
  background: transparent;
}

.character-token-image {
  flex: 0 0 auto;
  width: 74px;
  height: 74px;
  opacity: 0.88;
}

.overview-token-image {
  flex: 0 0 auto;
  width: 82px;
  height: 82px;
}

.character-overview {
  display: grid;
  grid-template-columns: minmax(260px, 36%) minmax(0, 1fr);
  align-items: stretch;
  gap: 0.9em;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.overview-portrait-stage {
  position: relative;
  top: auto;
  align-self: stretch;
  display: grid;
  place-items: center;
  height: 100%;
  max-height: none;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(73, 56, 35, 0.28);
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(42, 34, 28, 0.1)), #ece4d2;
}

.overview-portrait-stage::after {
  content: '';
  position: absolute;
  inset: auto 8% 0;
  height: 26%;
  background: linear-gradient(180deg, rgba(94, 76, 56, 0), rgba(94, 76, 56, 0.22));
  pointer-events: none;
}

.overview-portrait-image {
  position: relative;
  z-index: 1;
  width: auto;
  height: min(88%, 560px);
  aspect-ratio: 3 / 4;
  max-width: 92%;
  max-height: calc(100% - 1.5em);
  object-fit: contain;
}

.overview-portrait-fallback {
  display: grid;
  place-items: center;
  width: auto;
  height: min(88%, 560px);
  max-width: 92%;
  max-height: calc(100% - 1.5em);
  aspect-ratio: 3 / 4;
  border: 1px dashed rgba(73, 56, 35, 0.35);
  color: rgba(38, 33, 28, 0.72);
  font-size: 22px;
  font-weight: 700;
}

.overview-sheet {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75em;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-right: 0.25em;
}

.overview-sheet > * {
  box-sizing: border-box;
  flex: 0 0 auto;
  width: 100%;
}

.overview-heading,
.overview-card {
  border: 1px solid rgba(98, 84, 66, 0.26);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(2px);
  box-shadow: 0 1px 3px rgba(38, 33, 28, 0.08);
}

.overview-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75em;
  padding: 0.85em;
}

.overview-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45em;
}

.overview-title-line h2,
.overview-card h3 {
  margin: 0;
}

.overview-title-line h2 {
  font-size: 26px;
  line-height: 1.1;
}

.overview-code {
  color: #6c6258;
  font-size: 13px;
}

.overview-heading p {
  margin: 0.35em 0 0;
  color: #4f4942;
}

.overview-chip-row,
.overview-metric-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em;
}

.overview-chip-row span,
.overview-metric-list span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid rgba(98, 84, 66, 0.24);
  background: rgba(255, 255, 255, 0.78);
  color: #3d3832;
  font-size: 12px;
  white-space: nowrap;
}

.overview-resource-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  gap: 0.55em;
}

.overview-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75em;
}

.overview-card {
  padding: 0.75em;
  min-width: 0;
  container-type: inline-size;
}

.character-full-panel .overview-card h3 {
  margin-bottom: 0.55em;
  color: #2f2a25;
  font-size: 15px;
}

.overview-metrics-card {
  grid-column: 1 / -1;
}

.overview-stat-grid {
  display: grid;
  gap: 0.45em;
}

.overview-stat-grid.five-cols {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.overview-stat-grid.five-cols .overview-stat:nth-child(-n + 2) {
  grid-column: span 3;
}

.overview-stat-grid.five-cols .overview-stat:nth-child(n + 3) {
  grid-column: span 2;
}

.overview-stat-grid.six-cols {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.overview-stat {
  display: grid;
  gap: 0.1em;
  min-width: 0;
  padding: 0.55em 0.5em;
  border: 1px solid rgba(98, 84, 66, 0.22);
  background: rgba(255, 255, 255, 0.64);
  text-align: center;
}

.overview-stat span,
.overview-stat small,
.overview-list-item small {
  color: #62594f;
}

.overview-stat strong {
  color: #1f2328;
  font-size: 20px;
  line-height: 1.1;
}

.overview-stat small {
  font-size: 11px;
  line-height: 1.15;
}

.overview-metric-groups {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.55em;
}

.overview-metric-group {
  display: grid;
  align-content: start;
  gap: 0.45em;
  min-width: 0;
  padding: 0.55em;
  border: 1px solid rgba(98, 84, 66, 0.18);
  background: rgba(255, 255, 255, 0.54);
}

.overview-metric-group:last-child {
  grid-column: 1 / -1;
}

.overview-metric-group h4 {
  margin: 0;
  color: #51483f;
  font-size: 12px;
  font-weight: 700;
}

.overview-metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 82px), 1fr));
  gap: 0.35em;
}

.overview-metric-grid span {
  display: grid;
  gap: 0.1em;
  min-width: 0;
  min-height: 42px;
  padding: 0.4em 0.45em;
  border: 1px solid rgba(98, 84, 66, 0.16);
  background: rgba(255, 255, 255, 0.68);
}

.overview-metric-grid em {
  overflow: hidden;
  color: #6c6258;
  font-size: 11px;
  font-style: normal;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-metric-grid strong {
  min-width: 0;
  color: #24211d;
  font-size: 13px;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.overview-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.65fr);
  gap: 0.75em;
}

.overview-scroll-card {
  min-height: 0;
}

.overview-status-card-inline {
  display: none;
  justify-self: stretch;
  width: 100%;
  min-width: 0;
  contain: none;
  container-type: normal;
}

.overview-status-card-inline .overview-scroll-list {
  min-height: 40px;
  max-height: clamp(96px, 18vh, 180px);
  overflow: auto;
}

.overview-scroll-list {
  display: grid;
  gap: 0.45em;
  max-height: min(34vh, 280px);
  overflow: auto;
  padding-right: 0.25em;
}

.overview-list-item {
  display: grid;
  gap: 0.2em;
  padding: 0.5em 0.55em;
  border: 1px solid rgba(98, 84, 66, 0.18);
  background: rgba(255, 255, 255, 0.6);
}

.overview-list-item.compact {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
}

.overview-list-item p {
  margin: 0;
  color: #3f3a34;
  font-size: 12px;
  white-space: pre-line;
}

.overview-empty {
  padding: 1.2em;
  color: #6c6258;
  text-align: center;
}

.resource-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  gap: 0.5em;
  align-items: stretch;
}

.resource-card {
  position: relative;
  min-height: 40px;
  overflow: hidden;
  border: 1px solid #ddd;
  background: #f1f1f1;
}

.overview-mode .overview-resource-card {
  background: rgba(241, 241, 241, 0.78);
  backdrop-filter: blur(1px);
}

.overview-mode .hp-card {
  min-width: 0;
}

.overview-mode .resource-main {
  flex: 1 1 auto;
}

.hp-card {
  min-width: 340px;
}

.pp-card {
  min-width: max-content;
}

.temporary-race-form {
  display: grid;
  width: 100%;
  max-width: 100%;
  grid-template-columns:
    minmax(0, 1.5fr) repeat(3, minmax(0, 0.7fr)) minmax(0, 2fr) minmax(0, 0.65fr)
    minmax(0, 1.15fr);
  align-items: end;
  gap: 0.5em;
  margin-bottom: 0.55em;
  box-sizing: border-box;
}

.temporary-race-form > * {
  min-width: 0;
  max-width: 100%;
}

.temporary-race-form label {
  min-width: 0;
  color: #555;
  font-size: 12px;
  text-align: left;
}

.temporary-race-form input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.temporary-race-stats {
  grid-column: auto;
}

.temporary-race-submit {
  min-width: 0;
  line-height: 1.25;
  white-space: normal;
}

.temporary-race-error {
  margin-bottom: 0.55em;
  color: crimson;
}

.race-career-table {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed;
  box-sizing: border-box;
  white-space: normal !important;
}

.race-career-table :is(th, td) {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.race-career-table :deep(.vue-number-input) {
  width: 100%;
  max-width: 100%;
}

.race-name-cell {
  display: flex;
  min-width: 8.5em;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
}

.race-enable-control {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.35em;
}

.race-enable-control input {
  flex: 0 0 auto;
  margin: 0;
}

.temporary-race-delete {
  flex: 0 0 auto;
  padding: 2px 5px;
  border: 1px solid #e57373;
  border-radius: 3px;
  background: #ffebee;
  color: #b71c1c;
  font-size: 11px;
  cursor: pointer;
}

.temporary-race-delete:hover {
  border-color: #c62828;
  background: #ffcdd2;
}

.concentration-card {
  display: flex;
  min-width: 7.5em;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  padding: 0 0.65em;
  background: #f1f1f1;
  color: #6b7280;
  font-weight: 650;
  cursor: pointer;
  user-select: none;
}

.concentration-card.active {
  border-color: #d6aa23;
  background: #fff3cd;
  color: #725800;
}

.concentration-card input {
  margin: 0;
}

.resource-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 3px;
}

.resource-fill.hp {
  background: #b9efb9;
}

.resource-fill.pp {
  background: #bdd4ff;
}

.overview-mode .overview-resource-card .resource-fill.hp {
  background: rgba(185, 239, 185, 0.74);
}

.overview-mode .overview-resource-card .resource-fill.pp {
  background: rgba(189, 212, 255, 0.74);
}

.resource-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em;
  min-height: 40px;
  padding: 5px 8px;
}

.resource-content-compact {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.resource-content-split {
  justify-content: space-between;
  gap: 0.35em 0.75em;
}

.resource-main,
.resource-shield {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.3em;
  min-width: 0;
}

.resource-main {
  flex: 1 1 220px;
}

.resource-shield {
  flex: 0 1 auto;
  margin-left: auto;
}

.resource-label {
  font-weight: 700;
  white-space: nowrap;
}

.muted-label {
  color: #555;
}

.resource-max,
.resource-percent {
  white-space: nowrap;
}

.resource-percent {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.55);
  color: #454c56;
  font-size: 12px;
}

@media (max-width: 720px) {
  .character-overview {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .overview-portrait-stage {
    display: none;
  }

  .character-token-image {
    width: 58px;
    height: 58px;
  }

  .overview-token-image {
    width: 64px;
    height: 64px;
  }

  .overview-portrait-image,
  .overview-portrait-fallback {
    width: min(72%, 320px);
  }

  .overview-sheet {
    overflow: visible;
    padding-right: 0;
  }

  .overview-resource-grid,
  .overview-card-grid,
  .overview-list-grid {
    grid-template-columns: 1fr;
  }

  .overview-status-card-inline {
    display: block;
  }

  .overview-status-card-list {
    display: none;
  }
}

@media (max-width: 560px) {
  .resource-grid {
    grid-template-columns: 1fr;
  }

  .hp-card {
    min-width: 0;
  }

  .resource-content-split {
    align-items: flex-start;
  }

  .resource-main,
  .resource-shield {
    flex: 1 1 100%;
    margin-left: 0;
  }
}

@container (max-width: 960px) {
  .temporary-race-form {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .temporary-race-name,
  .temporary-race-stats {
    grid-column: span 2;
  }
}

@container (max-width: 720px) {
  .character-overview {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .overview-portrait-stage {
    display: none;
  }

  .overview-sheet {
    overflow: visible;
    padding-right: 0;
  }

  .overview-token-image {
    width: 64px;
    height: 64px;
  }

  .overview-portrait-image,
  .overview-portrait-fallback {
    width: min(72%, 320px);
  }

  .overview-resource-grid,
  .overview-card-grid,
  .overview-list-grid {
    grid-template-columns: 1fr;
  }

  .overview-status-card-inline {
    display: block;
  }

  .overview-status-card-list {
    display: none;
  }

  .overview-metric-groups {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 620px) {
  .temporary-race-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .temporary-race-name,
  .temporary-race-stats,
  .temporary-race-submit {
    grid-column: 1 / -1;
  }

  .overview-stat-grid.five-cols {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .overview-stat-grid.five-cols .overview-stat:nth-child(-n + 2) {
    grid-column: span 3;
  }

  .overview-stat-grid.five-cols .overview-stat:nth-child(n + 3) {
    grid-column: span 2;
  }

  .overview-stat-grid.six-cols {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@container (max-width: 560px) {
  .overview-resource-grid {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 400px) {
  .overview-mode .resource-main {
    flex: 1 1 100%;
  }

  .overview-mode .resource-shield {
    flex: 0 1 auto;
    margin-left: 0;
  }
}

.character-full-panel :deep(.vue-number-input) {
  vertical-align: middle;
}

.character-full-panel :deep(.vue-number-input input) {
  box-sizing: border-box;
  min-width: 0;
}

.character-full-panel .w3-right {
  float: none !important;
}

.character-full-panel .w3-panel {
  margin: 0.6em 0;
  padding: 0.45em 0.6em;
}

.character-full-panel .dense-table {
  display: table;
  width: 100%;
  max-width: none;
  font-size: 12px;
  white-space: nowrap;
}

.character-full-panel .dense-table th,
.character-full-panel .dense-table td {
  padding: 4px 6px;
  vertical-align: middle;
}

.character-full-panel h3 {
  margin: 0.8em 0 0.35em;
  font-size: 16px;
}

.move-description-editor {
  width: 100%;
  min-height: 180px;
  height: 240px;
  resize: vertical;
  box-sizing: border-box;
}

.feature-description {
  text-align: left;
  white-space: pre-line;
  padding: 0.2em 0;
}

.equipment-performance,
.equipment-description,
.item-effect,
.item-description {
  text-align: left;
  white-space: pre-line;
  padding: 0.2em 0;
}

.equipment-tag,
.item-tag {
  display: inline-block;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1em 0.3em;
  margin: 0.1em;
  font-size: 0.8em;
  color: #333;
}

.weight-info {
  font-weight: normal;
  color: #666;
  font-size: 0.9em;
}

.danger-zone {
  margin-top: 1.5em;
  padding-top: 1em;
  border-top: 1px solid #eee;
}
</style>
