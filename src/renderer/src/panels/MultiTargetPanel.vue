<script setup lang="ts">
import { ref, computed, watch, onUpdated, nextTick, inject } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import { autoResize, d20, valueToColor } from '@renderer/utils'
import { damageCalcRaw, showHP, handleHP } from '@renderer/model/Damage'
import {
  battleMemory,
  battleMemoryHeal,
  battleMemoryStatus,
  BattleMemory,
  currentMove,
  moveMemory,
  MoveMemory,
  surviveMemory,
  battleLv,
  battleLvStatus,
  spellTypeStab,
  spellTypeStabHeal,
  spellModifier,
  spellModifierHeal,
  spellModifierStatus,
  spellAttack,
  spellAttackHeal,
  spellAttackHealShield,
  envTypeMdfTotal,
  envTypeMdfContributions,
  envEffectIntensity,
  envEffectIntensityContributions,
  localFieldEffectIntensityContributions,
  getAttackAdvantage,
  dicePct,
  applyAttackResult,
  applyHealResult,
  applyHealShieldResult,
  applyStatusResult,
  applyHealStatusResult,
  applyHealShieldStatusResult,
  toggleSurviveMemory
} from '@renderer/model/GlobalMemory'
import Creatures, { Creature } from '@renderer/model/Creature'
import {
  damageAspectList,
  damageAttackList,
  damageTypeList,
  modifierList,
  MovePower
} from '@renderer/model/DataType'
import type { EnvModifierContribution } from '@renderer/model/GlobalMemory'

interface TargetEntry {
  code: string
  damageMdfD: number
  diceroll: number
  dicerollD: number
  advantageDelta: number
  rollHistory: number[]
}

type PowerInputMode = 'move' | 'customPower' | 'directDamage'
type OpenPanelFn = (
  component: string,
  id: string,
  title: string,
  params?: Record<string, unknown>
) => void

const memory = ref<BattleMemory>(battleMemory.value)
const memoryHeal = ref<BattleMemory>(battleMemoryHeal.value)
const memoryStatus = ref<BattleMemory>(battleMemoryStatus.value)
const movem = ref<MoveMemory>(moveMemory.value)
const targets = ref<TargetEntry[]>([])
const selectedTargetCodes = computed<Set<string>>(() => new Set(movem.value.targetCodes))
const batchAdvantage = ref<number>(0)
const batchDiceroll = ref<number>(10)
const batchDicerollD = ref<number>(0)
const batchDamageMdfD = ref<number>(0)
const healMode = ref<'heal' | 'shield'>('heal')
const statusMode = ref<'damage' | 'heal' | 'shield'>('damage')
const resolutionSelectionKey = ref('')
const showMoveDescription = ref(false)
const casterExpanded = ref(true)
const damageDefList = ['物理', '特殊']
const openPanel = inject<OpenPanelFn>('openPanel')

const atkType = computed(() => memory.value.attackType)
const casterMoveList = computed(() => memory.value.attacker?.getMoveInMemoryList() ?? [])

function chooseCaster(code: string): void {
  memory.value.attacker = Creatures.value.find((c) => c.code() == code) ?? null
}

function currentPower(): MovePower | null {
  return currentMove().powerList[movem.value.selectedPowerIdx] ?? null
}

function customPowerEnabled(): boolean {
  return memory.value.customPowerEnabled != 0
}

function isNoPowerPlaceholder(power: MovePower | null): boolean {
  return power != null && power.idx == 0 && power.power == 0 && power.extra.trim().length == 0
}

function hasPowerSelection(): boolean {
  if (customPowerEnabled() && memory.value.attacker != null && currentMove().name.length > 0) {
    return true
  }
  const power = currentPower()
  return power != null
}

function currentMoveRangeText(): string {
  const range = currentMove().castRange
  return `${range}${range.includes('*') ? '（受威胁）' : ''}`
}

function currentMoveDurationText(): string {
  const move = currentMove()
  return `${move.concentration.length > 0 ? '专注，至多 ' : ''}${move.duration.length > 0 ? move.duration : '立即'}`
}

function currentMoveTypeText(): string {
  const move = currentMove()
  return move.ring < 0 ? '动作' : `${move.ring} 环`
}

function currentSpellModName(): string {
  if (atkType.value == 1) return memory.value.spellMod
  if (atkType.value == 2) return memoryHeal.value.spellMod
  if (atkType.value == 3) return memoryStatus.value.spellMod
  return currentMove().castAbility
}

function currentSpellTypeStabText(): string {
  if (atkType.value == 1) {
    const directDamage = currentPowerInputMode() == 'directDamage'
    const type = directDamage ? memory.value.damageType : memory.value.spellType
    return `${type}（${directDamage ? 0 : spellTypeStab()}）`
  }
  if (atkType.value == 2) {
    return `${memoryHeal.value.spellType}（${spellTypeStabHeal()}）`
  }
  if (atkType.value == 3) {
    const type =
      currentPowerInputMode() == 'directDamage'
        ? memoryStatus.value.damageType
        : memoryStatus.value.spellType
    return `${type}（0）`
  }
  return `${currentMove().elemType}（0）`
}

function collapsedCasterSummary(): string {
  if (atkType.value == 1) {
    const aspect = memory.value.damageAspect == '无性相' ? '' : memory.value.damageAspect
    return `${memory.value.spellName} / 威力 ${memory.value.effect} / ${memory.value.damageType}${memory.value.damageDef}${aspect}`
  }
  if (atkType.value == 2) {
    return `${memoryHeal.value.spellName} / 威力 ${memoryHeal.value.effect}`
  }
  if (atkType.value == 3) {
    return `${memoryStatus.value.spellName} / 威力 ${memoryStatus.value.effect}`
  }
  return ''
}

function normalizeCustomPowerFields(): void {
  const mem = memory.value
  if (!isFinite(mem.customPower)) mem.customPower = 50
  mem.customPower = Math.max(0, Math.floor(mem.customPower))
  if (!damageTypeList.includes(mem.customPowerDamageType)) {
    mem.customPowerDamageType = '无属性'
  }
  if (!damageDefList.includes(mem.customPowerDamageDef)) {
    mem.customPowerDamageDef = '物理'
  }
  if (!damageAspectList.includes(mem.customPowerDamageAspect)) {
    mem.customPowerDamageAspect = '无性相'
  }
}

function powerOptionLabel(power: MovePower): string {
  if (isNoPowerPlaceholder(power)) return '无威力'
  if (power.power == 0) {
    const effectType =
      power.elemType == '治疗' || power.elemType == '护盾'
        ? power.elemType
        : `${power.elemType}${power.isStatus ? '状态' : ''}`
    return `无威力 · ${effectType}${power.extra}`
  }
  return power.message()
}

function resolutionModeLabel(): string {
  if (atkType.value == 1) return '攻击'
  if (atkType.value == 2) return healMode.value == 'heal' ? '治疗' : '护盾'
  if (atkType.value == 3) {
    return statusMode.value == 'damage' ? '状态伤害' : statusMode.value == 'heal' ? '治疗' : '护盾'
  }
  return '无效果'
}

function canUseDirectDamageMode(): boolean {
  return atkType.value == 1 || atkType.value == 3
}

function hasPositiveDirectDamage(mem: BattleMemory): boolean {
  return isFinite(mem.customDamage) && mem.customDamage > 0
}

function currentPowerInputMode(): PowerInputMode {
  if (customPowerEnabled()) return 'customPower'
  if (atkType.value == 1 && hasPositiveDirectDamage(memory.value)) return 'directDamage'
  if (atkType.value == 3 && hasPositiveDirectDamage(memoryStatus.value)) return 'directDamage'
  return 'move'
}

function activeDirectDamageMemory(): BattleMemory | null {
  if (atkType.value == 1) return memory.value
  if (atkType.value == 3) return memoryStatus.value
  return null
}

function setPowerInputMode(mode: PowerInputMode): void {
  if (mode == 'move') {
    memory.value.customPowerEnabled = 0
    memory.value.customDamage = 0
    memoryStatus.value.customDamage = 0
    setCurrentMove()
    return
  }

  if (mode == 'customPower') {
    memory.value.customDamage = 0
    memoryStatus.value.customDamage = 0
    memory.value.customPowerEnabled = 1
    setCurrentMove()
    return
  }

  memory.value.customPowerEnabled = 0
  const previousAttackDamage = memory.value.customDamage
  const previousStatusDamage = memoryStatus.value.customDamage
  setCurrentMove()

  const directMemory = activeDirectDamageMemory()
  if (!directMemory) return

  memory.value.customDamage = 0
  memoryStatus.value.customDamage = 0
  const previousDamage = directMemory == memory.value ? previousAttackDamage : previousStatusDamage
  directMemory.customDamage =
    isFinite(previousDamage) && previousDamage > 0 ? Math.floor(previousDamage) : 1
}

function normalizedCustomDamage(mem: BattleMemory): number {
  if (!isFinite(mem.customDamage)) mem.customDamage = 0
  mem.customDamage = Math.max(0, Math.floor(mem.customDamage))
  return mem.customDamage
}

function normalizedShieldDamageRatio(mem: BattleMemory): number {
  if (!isFinite(mem.shieldDamageRatio)) mem.shieldDamageRatio = 1
  mem.shieldDamageRatio = Math.max(1, Math.floor(mem.shieldDamageRatio))
  return mem.shieldDamageRatio
}

function customDamageWithMdf(mem: BattleMemory, mdf: number): number {
  return damageCalcRaw(normalizedCustomDamage(mem), 100, 1, 1, 0, mdf, 100)
}

function syncDamageDefense(mem: BattleMemory): void {
  mem.damageDefense = mem.damageDef == '物理' ? '物防' : '特防'
}

function resetTargetRolls(defaultAdvantage: number): void {
  for (const entry of targets.value) {
    const creature = getCreature(entry.code)
    const autoCrit =
      !movem.value.dmControlRoll &&
      atkType.value == 1 &&
      (creature?.grandStatus().autoCrit ?? false)
    entry.damageMdfD = 0
    entry.diceroll = autoCrit ? 20 : 10
    entry.dicerollD = 0
    entry.advantageDelta = defaultAdvantage
    entry.rollHistory = [entry.diceroll]
  }
}

function setCurrentMove(): void {
  const caster = memory.value.attacker
  const mov = currentMove()
  const moveNameKey = `${caster?.code() ?? ''}:${mov.name}`

  movem.value.dcDelta = 0
  movem.value.selectedPowerIdx = Math.min(
    Math.max(0, movem.value.selectedPowerIdx),
    mov.powerList.length - 1
  )
  const pwr = currentPower()
  if (!caster || !mov.name) {
    memory.value.attackType = 0
    return
  }

  let costPPOverride = mov.costPP
  if (pwr) {
    const ppMatch = /([0-9]+)[Pp][Pp]/.exec(pwr.extra)
    if (ppMatch) costPPOverride = Number(ppMatch[1])
  }

  let elemTypeOverride = mov.elemType
  if (pwr) {
    for (const name of damageTypeList) {
      if (pwr.extra.includes(name)) elemTypeOverride = name
    }
  }

  let spellAttackOverride =
    (pwr?.psType ?? memory.value.customPowerDamageDef) == '物理' ? '物攻' : '特攻'
  if (pwr) {
    for (const name of damageAttackList) {
      if (pwr.extra.includes(name)) spellAttackOverride = name
    }
  }

  let spellModOverride = mov.castAbility
  if (pwr) {
    for (const name of modifierList) {
      if (pwr.extra.includes(name)) spellModOverride = name
    }
  }

  let advantageOverride: number | null = null
  if (pwr) {
    const advMatch = pwr.extra.match(/([0-9]+)\s*优势/)
    const disMatch = pwr.extra.match(/([0-9]+)\s*劣势/)
    if (advMatch) advantageOverride = Number(advMatch[1])
    else if (disMatch) advantageOverride = -Number(disMatch[1])
  }

  const defaultAdvantage = advantageOverride ?? 0

  if (!pwr || (isNoPowerPlaceholder(pwr) && !customPowerEnabled())) {
    memory.value.attackType = 0
    movem.value.nullCostPP = costPPOverride
    movem.value.lastMoveName = pwr ? `${moveNameKey}:${pwr.idx}:move` : moveNameKey
    return
  }

  const damageDefense = pwr.psType == '物理' ? '物防' : '特防'
  const selectionKey = `${moveNameKey}:${pwr.idx}`
  const powerKey = `${selectionKey}:${customPowerEnabled() ? 'custom' : 'move'}`
  const isNewPower = powerKey != movem.value.lastMoveName

  if (selectionKey != resolutionSelectionKey.value) {
    if (pwr.isStatus) {
      statusMode.value =
        pwr.elemType == '治疗' ? 'heal' : pwr.elemType == '护盾' ? 'shield' : 'damage'
    } else if (!damageTypeList.includes(pwr.elemType)) {
      healMode.value = pwr.elemType == '护盾' ? 'shield' : 'heal'
    }
    resolutionSelectionKey.value = selectionKey
  }

  if (pwr.isStatus) {
    memory.value.attackType = 3
    memoryStatus.value.costPP = costPPOverride
    memoryStatus.value.battleLvD = 0
    memoryStatus.value.ctLimit = 20
    memoryStatus.value.spellName = mov.name
    memoryStatus.value.effect = pwr.power
    memoryStatus.value.spellType = elemTypeOverride
    memoryStatus.value.spellTypeStabD = 0
    memoryStatus.value.spellAttack = spellAttackOverride
    memoryStatus.value.spellAttackD = 0
    memoryStatus.value.spellMod = spellModOverride
    memoryStatus.value.spellModD = 0
    memoryStatus.value.damageType = pwr.elemType
    memoryStatus.value.damageAspect = pwr.aspect
    memoryStatus.value.damageDef = pwr.psType
    memoryStatus.value.damageDefense = damageDefense
    memoryStatus.value.damageDefenseD = 0
    memoryStatus.value.customDamage = 0
    memoryStatus.value.enableCT = 0
    memoryStatus.value.enableMiss = 0
    memoryStatus.value.enableAccuracyAdvance = 0
    if (isNewPower) {
      memoryStatus.value.damageMdfD = 0
      memoryStatus.value.dicerollD = 0
      memoryStatus.value.diceroll = 10
      memoryStatus.value.advantageDelta = defaultAdvantage
      memoryStatus.value.rollHistory = [10]
    }
  } else if (damageTypeList.includes(pwr.elemType)) {
    memory.value.attackType = 1
    memory.value.costPP = costPPOverride
    memory.value.battleLvD = 0
    memory.value.ctLimit = 20
    memory.value.spellName = mov.name
    memory.value.effect = pwr.power
    memory.value.spellType = elemTypeOverride
    memory.value.spellTypeStabD = 0
    memory.value.spellAttack = spellAttackOverride
    memory.value.spellAttackD = 0
    memory.value.spellMod = spellModOverride
    memory.value.spellModD = 0
    memory.value.damageType = pwr.elemType
    memory.value.damageAspect = pwr.aspect
    memory.value.damageDef = pwr.psType
    memory.value.damageDefense = damageDefense
    memory.value.damageDefenseD = 0
    memory.value.customDamage = 0
    memory.value.enableCT = 1
    memory.value.enableMiss = 1
    memory.value.enableAccuracyAdvance = 1
    if (isNewPower) {
      memory.value.damageMdfD = 0
      memory.value.dicerollD = 0
      memory.value.diceroll = 10
      memory.value.advantageDelta = defaultAdvantage
      memory.value.rollHistory = [10]
    }
  } else {
    memory.value.attackType = 2
    memoryHeal.value.costPP = costPPOverride
    memoryHeal.value.battleLvD = 100 - caster.battleLv()
    memoryHeal.value.ctLimit = 20
    memoryHeal.value.spellName = mov.name
    memoryHeal.value.effect = pwr.power
    memoryHeal.value.spellType = elemTypeOverride
    memoryHeal.value.spellTypeStabD = 0
    memoryHeal.value.spellAttack = '特防'
    memoryHeal.value.spellAttackShield = '物防'
    for (const name of damageAttackList) {
      if (pwr.extra.includes(name)) {
        memoryHeal.value.spellAttack = name
        memoryHeal.value.spellAttackShield = name
      }
    }
    memoryHeal.value.spellAttackD = 0
    memoryHeal.value.spellAttackShieldD = 0
    memoryHeal.value.spellMod = spellModOverride
    memoryHeal.value.spellModD = 0
    memoryHeal.value.damageType = pwr.elemType
    memoryHeal.value.damageAspect = pwr.aspect
    memoryHeal.value.damageDef = pwr.psType
    memoryHeal.value.damageDefense = damageDefense
    memoryHeal.value.damageDefenseD = 0
    memoryHeal.value.customDamage = 0
    memoryHeal.value.enableCT = 1
    memoryHeal.value.enableMiss = 0
    memoryHeal.value.enableAccuracyAdvance = 0
    if (isNewPower) {
      memoryHeal.value.damageMdfD = 0
      memoryHeal.value.dicerollD = 0
      memoryHeal.value.diceroll = 10
      memoryHeal.value.advantageDelta = defaultAdvantage
      memoryHeal.value.rollHistory = [10]
    }
  }

  if (customPowerEnabled()) {
    normalizeCustomPowerFields()
    if (memory.value.attackType == 1) {
      memory.value.effect = memory.value.customPower
      memory.value.spellType = memory.value.customPowerDamageType
      memory.value.damageType = memory.value.customPowerDamageType
      memory.value.damageDef = memory.value.customPowerDamageDef
      memory.value.damageAspect = memory.value.customPowerDamageAspect
      memory.value.damageDefense = memory.value.customPowerDamageDef == '物理' ? '物防' : '特防'
      memory.value.spellAttack = memory.value.customPowerDamageDef == '物理' ? '物攻' : '特攻'
    } else if (memory.value.attackType == 2) {
      memoryHeal.value.effect = memory.value.customPower
    } else if (memory.value.attackType == 3) {
      memoryStatus.value.effect = memory.value.customPower
    }
  }

  if (isNewPower) resetTargetRolls(defaultAdvantage)
  movem.value.lastMoveName = powerKey
  ensureTargetData()
}

function moveWheel(event: { preventDefault(): unknown; deltaY: number }): void {
  const moveList = casterMoveList.value
  if (moveList.length > 0) {
    const index = moveList.indexOf(movem.value.selectedMove)
    if (event.deltaY < 0) movem.value.selectedMove = moveList[Math.max(index - 1, 0)]
    else if (event.deltaY > 0)
      movem.value.selectedMove = moveList[Math.min(index + 1, moveList.length - 1)]
    movem.value.selectedPowerIdx = 1
  } else {
    movem.value.selectedMove = ''
  }
  setCurrentMove()
  event.preventDefault()
}

function movePowerWheel(event: { preventDefault(): unknown; deltaY: number }): void {
  if (currentMove().powerList.length > 0) {
    if (event.deltaY < 0) movem.value.selectedPowerIdx -= 1
    else if (event.deltaY > 0) movem.value.selectedPowerIdx += 1
    movem.value.selectedPowerIdx = Math.min(
      Math.max(0, movem.value.selectedPowerIdx),
      currentMove().powerList.length - 1
    )
    setCurrentMove()
  }
  event.preventDefault()
}

function currentDC(): number {
  const caster = memory.value.attacker
  if (!caster) return 10 + movem.value.dcDelta
  return (
    caster.getMoveDC(currentMove().name) +
    movem.value.dcDelta +
    envEffectIntensity(currentMove().elemType, caster)
  )
}

const envDcContributions = computed<EnvModifierContribution[]>(() => {
  const caster = memory.value.attacker
  if (!caster || currentMove().name.length <= 0) return []
  return envEffectIntensityContributions(currentMove().elemType, caster)
})

const envDamageMdfContributions = computed<EnvModifierContribution[]>(() => {
  const caster = memory.value.attacker
  if (!caster || currentMove().name.length <= 0 || !hasPowerSelection()) return []
  if (atkType.value == 1) {
    return envTypeMdfContributions(
      [memory.value.damageType, memory.value.damageAspect],
      caster,
      null
    )
  }
  if (atkType.value == 2) {
    return envTypeMdfContributions(
      [memoryHeal.value.damageType, memoryHeal.value.damageAspect],
      caster,
      null
    )
  }
  if (atkType.value == 3) {
    return envTypeMdfContributions(
      [memoryStatus.value.damageType, memoryStatus.value.damageAspect],
      caster,
      null
    )
  }
  return []
})

function contributionTotal(items: EnvModifierContribution[]): number {
  return items.reduce((sum, item) => sum + item.value, 0)
}

function contributionValueText(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`
}

function contributionListText(items: EnvModifierContribution[]): string {
  return items
    .map((item) => `${item.name} ${item.layers}层 ${contributionValueText(item.value)}`)
    .join('、')
}

function setSaveForTargets(skill: string): void {
  surviveMemory.value.chosen = new Set(movem.value.targetCodes)
  surviveMemory.value.checkSkill = skill
  surviveMemory.value.isSave = 1
  surviveMemory.value.rollMode = 'save'
  surviveMemory.value.abilityOverride = ''
  surviveMemory.value.difficulty = currentDC()
  surviveMemory.value.chooseMode = 0
  openPanel?.('SurvivePanel', 'panel-survive', '检定与豁免', {})
}

function targetFieldEffectContributions(entry: TargetEntry): EnvModifierContribution[] {
  return localFieldEffectIntensityContributions(
    currentMove().elemType,
    getCreature(entry.code) ?? null
  )
}

function targetFieldEffectHint(entry: TargetEntry): string {
  const items = targetFieldEffectContributions(entry)
  if (items.length == 0) return ''
  return `非全局场地使效应强度 ${contributionValueText(contributionTotal(items))}：${contributionListText(items)}`
}

function targetDamageEnvContributions(entry: TargetEntry): EnvModifierContribution[] {
  const caster = memory.value.attacker
  const defender = getCreature(entry.code) ?? null
  if (!caster || !defender) return []
  if (atkType.value == 1) {
    return envTypeMdfContributions(
      [memory.value.damageType, memory.value.damageAspect],
      caster,
      defender
    )
  }
  if (atkType.value == 2) {
    return envTypeMdfContributions(
      [memoryHeal.value.damageType, memoryHeal.value.damageAspect],
      caster,
      defender
    )
  }
  if (atkType.value == 3) {
    return envTypeMdfContributions(
      [memoryStatus.value.damageType, memoryStatus.value.damageAspect],
      caster,
      defender
    )
  }
  return []
}

function targetDamageEnvHint(entry: TargetEntry): string {
  const items = targetDamageEnvContributions(entry)
  if (items.length == 0) return ''
  return `环境 ${contributionValueText(contributionTotal(items))}：${contributionListText(items)}`
}

function openConcentrationSave(entry: TargetEntry, damage: number): void {
  const defender = getCreature(entry.code)
  if (!defender || !defender.concentrating || damage <= 0) return
  toggleSurviveMemory(defender.code(), '专注', 1, defender.concentrationSaveFromDamage(damage))
  surviveMemory.value.chooseMode = 1
  openPanel?.('SurvivePanel', 'panel-survive', '检定与豁免', {})
}

function openDamageDetails(entry: TargetEntry): void {
  const mem = memory.value
  const defender = getCreature(entry.code)
  if (!mem.attacker || !defender) return
  mem.defender = defender
  mem.damageMdfD = entry.damageMdfD
  mem.diceroll = entry.diceroll
  mem.dicerollD = entry.dicerollD
  openPanel?.('BattlePanel', 'panel-battle', '伤害详细编辑', {})
}

watch(
  () => memory.value.attacker?.code() ?? '',
  () => {
    const caster = memory.value.attacker
    if (!caster) {
      movem.value.selectedMove = ''
      return
    }
    caster.shallowRefresh()
    if (!casterMoveList.value.includes(movem.value.selectedMove)) {
      movem.value.selectedMove = casterMoveList.value[0] ?? ''
      movem.value.selectedPowerIdx = 1
    }
    setCurrentMove()
  },
  { immediate: true }
)

watch(
  () => [
    memory.value.customPower,
    memory.value.customPowerDamageType,
    memory.value.customPowerDamageDef,
    memory.value.customPowerDamageAspect
  ],
  () => {
    if (customPowerEnabled()) setCurrentMove()
  }
)

function ensureTargetData(): void {
  const creaturesByCode = new Map(Creatures.value.map((creature) => [creature.code(), creature]))
  const defenderCodes = new Set(
    movem.value.targetCodes.filter((code) => code != 'DM' && creaturesByCode.has(code))
  )
  for (const code of defenderCodes) {
    const creature = creaturesByCode.get(code)
    const autoCrit =
      !movem.value.dmControlRoll &&
      atkType.value == 1 &&
      (creature?.grandStatus().autoCrit ?? false)
    const existing = targets.value.find((t) => t.code == code)
    if (existing) {
      if (autoCrit) {
        existing.diceroll = 20
        existing.rollHistory = [20]
      }
    } else {
      const defaultAdv =
        atkType.value == 2
          ? memoryHeal.value.advantageDelta
          : atkType.value == 3
            ? memoryStatus.value.advantageDelta
            : memory.value.advantageDelta
      targets.value.push({
        code,
        damageMdfD: 0,
        diceroll: autoCrit ? 20 : 10,
        dicerollD: 0,
        advantageDelta: defaultAdv,
        rollHistory: autoCrit ? [20] : [10]
      })
    }
  }
  // remove deselected
  targets.value = targets.value.filter((target) => defenderCodes.has(target.code))
}

watch(() => [...movem.value.targetCodes].sort().join('\u0000'), ensureTargetData, {
  immediate: true
})
watch(() => Creatures.value.length, ensureTargetData)
watch(atkType, ensureTargetData)

function getCreature(code: string): Creature | undefined {
  return Creatures.value.find((c) => c.code() == code)
}

function toggleChosen(code: string): void {
  if (selectedTargetCodes.value.has(code)) {
    movem.value.targetCodes = movem.value.targetCodes.filter((targetCode) => targetCode != code)
  } else {
    movem.value.targetCodes = [...movem.value.targetCodes, code]
  }
  ensureTargetData()
}

// ── 批量操作 ──

function batchRoll(): void {
  if (movem.value.dmControlRoll) {
    for (const entry of targets.value) setControlledRoll(entry, batchDiceroll.value)
    return
  }

  for (const t of targets.value) {
    if (atkType.value == 1) {
      const c = getCreature(t.code)
      if (c?.grandStatus().autoCrit) {
        t.diceroll = 20
        t.rollHistory = [20]
        continue
      }
    }
    const n = 1 + Math.abs(t.advantageDelta)
    const rolls = Array.from({ length: n }, () => d20())
    t.rollHistory = rolls
    t.diceroll =
      t.advantageDelta > 0
        ? Math.max(...rolls)
        : t.advantageDelta < 0
          ? Math.min(...rolls)
          : rolls[0]
  }
}

function batchSetAdvantage(): void {
  for (const t of targets.value) {
    t.advantageDelta = batchAdvantage.value
  }
}

function batchSetDicerollD(): void {
  for (const t of targets.value) {
    t.dicerollD = batchDicerollD.value
  }
}

function batchSetDamageMdf(value: number = batchDamageMdfD.value): void {
  batchDamageMdfD.value = value
  for (const t of targets.value) {
    t.damageMdfD = value
  }
}

watch(batchAdvantage, batchSetAdvantage)
watch(batchDicerollD, batchSetDicerollD)
watch(batchDamageMdfD, () => batchSetDamageMdf())

function rollSingle(entry: TargetEntry): void {
  entry.diceroll = d20()
  entry.rollHistory = [entry.diceroll]
}

function setAutoCrit(entry: TargetEntry): void {
  entry.diceroll = 20
  entry.rollHistory = [20]
}

function setControlledRoll(entry: TargetEntry, newValue: number): void {
  const controlledRoll = Math.min(20, Math.max(1, Math.floor(Number(newValue) || 1)))
  const count = 1 + Math.abs(entry.advantageDelta)

  if (count <= 1) {
    entry.diceroll = controlledRoll
    entry.rollHistory = [controlledRoll]
    return
  }

  const isAdvantage = entry.advantageDelta > 0
  const rolls = Array.from({ length: count }, () =>
    isAdvantage
      ? Math.floor(Math.random() * controlledRoll) + 1
      : Math.floor(Math.random() * (21 - controlledRoll)) + controlledRoll
  )

  // 将其中一枚骰子固定为控骰值；其余骰子受上下界限制，
  // 从而保证优势取最高、劣势取最低时的最终结果都是控骰值。
  rolls[Math.floor(Math.random() * count)] = controlledRoll
  entry.rollHistory = rolls
  entry.diceroll = controlledRoll
}

function setEntryDiceroll(entry: TargetEntry, newValue: number): void {
  if (movem.value.dmControlRoll) {
    setControlledRoll(entry, newValue)
  } else {
    modifyWorldline(entry, newValue)
  }
}

function toggleDmControlRoll(): void {
  movem.value.dmControlRoll = !movem.value.dmControlRoll
}

function modifyWorldline(entry: TargetEntry, newValue: number): void {
  const n = entry.rollHistory.length
  if (n <= 1) {
    entry.diceroll = newValue
    entry.rollHistory = [newValue]
    return
  }

  const isAdv = entry.advantageDelta > 0
  const rolls: number[] = []
  for (let i = 0; i < n; i++) {
    rolls.push(
      isAdv
        ? Math.floor(Math.random() * newValue) + 1 // 1d(target)
        : Math.floor(Math.random() * (21 - newValue)) + newValue // target..20
    )
  }
  // 随机将一个骰子设为目标值，确保取最高/最低时就是它
  rolls[Math.floor(Math.random() * n)] = newValue

  entry.rollHistory = rolls
  entry.diceroll = isAdv ? Math.max(...rolls) : Math.min(...rolls)
}

// ── 模式 1：攻击 ──

interface TargetResult {
  code: string
  name: string
  defValue: number
  damage: number
  mdf: number
  roll: number
  rollPct: number
}

function computeResult(entry: TargetEntry): TargetResult {
  const mem = memory.value
  const defender = getCreature(entry.code)
  if (!mem.attacker || !defender) {
    return { code: entry.code, name: '?', defValue: 0, damage: 0, mdf: 0, roll: 0, rollPct: 0 }
  }

  const defValue = Math.max(
    1,
    Math.floor(defender.getAttributeByName(mem.damageDefense) + mem.damageDefenseD)
  )
  const baseMdf =
    defender.typeMdf(mem.damageType) +
    defender.typeMdf(mem.damageAspect) +
    defender.grandStatus().grandMdf
  const mdf =
    baseMdf +
    envTypeMdfTotal([mem.damageType, mem.damageAspect], mem.attacker, defender) +
    entry.damageMdfD

  const accAdv =
    mem.enableAccuracyAdvance && entry.diceroll < mem.ctLimit
      ? mem.attacker.accuracy() - defender.evasion()
      : Math.max(0, mem.attacker.accuracy() - defender.evasion())

  const { roll, rollPct } = dicePct(
    entry.diceroll,
    entry.dicerollD,
    accAdv + spellModifier() + getAttackAdvantage(mem.spellMod),
    mem.enableCT,
    mem.ctLimit,
    mem.enableMiss
  )

  return {
    code: entry.code,
    name: defender.name(),
    defValue,
    damage:
      normalizedCustomDamage(mem) > 0
        ? customDamageWithMdf(mem, mdf)
        : damageCalcRaw(
            mem.effect,
            battleLv(),
            spellAttack(),
            defValue,
            spellTypeStab(),
            mdf,
            rollPct
          ),
    mdf,
    roll,
    rollPct
  }
}

const results = computed<TargetResult[]>(() => targets.value.map(computeResult))

// ── 模式 2：治疗 / 护盾（逐目标计算）──

interface HealResult {
  code: string
  name: string
  heal: number
  shield: number
  roll: number
  rollPct: number
  mdf: number
}

function computeHealResult(entry: TargetEntry): HealResult {
  const mem = memory.value
  const mh = memoryHeal.value
  const attacker = mem.attacker
  const creature = getCreature(entry.code)
  if (!attacker || !creature) {
    return { code: entry.code, name: '?', heal: 0, shield: 0, roll: 0, rollPct: 0, mdf: 0 }
  }

  const cr = battleLv() + mh.battleLvD
  const stab = spellTypeStabHeal()
  const mdf =
    envTypeMdfTotal([mh.damageType, mh.damageAspect], attacker, creature) + entry.damageMdfD
  const healAtk = spellAttackHeal()
  const shieldAtk = spellAttackHealShield()

  const { roll, rollPct } = dicePct(
    entry.diceroll,
    entry.dicerollD,
    spellModifierHeal(),
    mh.enableCT,
    mh.ctLimit,
    mh.enableMiss
  )

  return {
    code: entry.code,
    name: creature.name(),
    heal: damageCalcRaw(mh.effect, cr, healAtk, 200, stab, mdf, rollPct),
    shield: damageCalcRaw(mh.effect, cr, shieldAtk, 200, stab, mdf, rollPct),
    roll,
    rollPct,
    mdf
  }
}

const healResults = computed<HealResult[]>(() => targets.value.map(computeHealResult))

// ── 模式 3：状态（逐目标计算）──

interface StatusResult {
  code: string
  name: string
  damage: number
  heal: number
  shield: number
  roll: number
  rollPct: number
  mdf: number
}

function computeStatusResult(entry: TargetEntry): StatusResult {
  const ms = memoryStatus.value
  const creature = getCreature(entry.code)
  if (!creature) {
    return {
      code: entry.code,
      name: '?',
      damage: 0,
      heal: 0,
      shield: 0,
      roll: 0,
      rollPct: 0,
      mdf: 0
    }
  }

  const { roll, rollPct } = dicePct(
    entry.diceroll,
    entry.dicerollD,
    spellModifierStatus(),
    ms.enableCT,
    ms.ctLimit,
    ms.enableMiss
  )

  const cr = battleLvStatus()
  const defValue = Math.max(
    1,
    Math.floor(creature.getAttackAttributeByName(ms.damageDefense) + ms.damageDefenseD)
  )
  const baseMdf = creature.typeMdf(ms.damageType) + creature.typeMdf(ms.damageAspect)
  const mdf =
    baseMdf +
    envTypeMdfTotal([ms.damageType, ms.damageAspect], memory.value.attacker, creature) +
    entry.damageMdfD
  const healMdfVal = ms.damageMdfD + entry.damageMdfD
  const customDamage = normalizedCustomDamage(ms)

  return {
    code: entry.code,
    name: creature.name(),
    damage:
      customDamage > 0
        ? customDamageWithMdf(ms, mdf)
        : damageCalcRaw(ms.effect, cr, cr * 2, defValue, 0, mdf, rollPct),
    heal: damageCalcRaw(ms.effect, cr, 1, 1, 0, healMdfVal, rollPct),
    shield: damageCalcRaw(ms.effect, cr, 1, 1, 0, healMdfVal, rollPct),
    roll,
    rollPct,
    mdf
  }
}

const statusResults = computed<StatusResult[]>(() => targets.value.map(computeStatusResult))

// ── 日志预览 ──

const logText = computed<string>(() => {
  const mem = memory.value
  const atk = mem.attacker
  if (atkType.value != 3 && atkType.value != 0 && !atk) return ''

  const atkName = atk?.name() ?? '环境'
  const lines: string[] = []
  const spellName =
    atkType.value == 3
      ? memoryStatus.value.spellName
      : atkType.value == 2
        ? memoryHeal.value.spellName
        : atkType.value == 0
          ? currentMove().name
          : mem.spellName

  const ppCost =
    atkType.value == 3
      ? memoryStatus.value.costPP
      : atkType.value == 2
        ? memoryHeal.value.costPP
        : atkType.value == 0
          ? movem.value.nullCostPP
          : mem.costPP
  const ppLog =
    atk && ppCost != 0 ? `（PP ${atk.currentPP} -> ${Math.max(0, atk.currentPP - ppCost)}）` : ''
  if (targets.value.length > 0) {
    const targetNames = targets.value.map((t) => getCreature(t.code)?.name() ?? '?').join('、')
    if (atk) {
      lines.push(`${atkName}对${targetNames}使用了${spellName}${ppLog}。`)
    } else {
      lines.push(`${targetNames}受到${spellName}的影响。`)
    }
  } else if (atk) {
    lines.push(`${atkName}使用了${spellName}${ppLog}。`)
  } else {
    lines.push(`${spellName}的影响。`)
  }

  // 每个防御方
  for (let i = 0; i < targets.value.length; i++) {
    const entry = targets.value[i]
    const creature = getCreature(entry.code)
    if (!creature) continue

    const bonus =
      (atkType.value == 1
        ? (results.value[i]?.roll ?? 0)
        : atkType.value == 2
          ? (healResults.value[i]?.roll ?? 0)
          : (statusResults.value[i]?.roll ?? 0)) - entry.diceroll

    const ct =
      atkType.value == 1
        ? { e: mem.enableCT, l: mem.ctLimit, m: mem.enableMiss }
        : atkType.value == 2
          ? {
              e: memoryHeal.value.enableCT,
              l: memoryHeal.value.ctLimit,
              m: memoryHeal.value.enableMiss
            }
          : {
              e: memoryStatus.value.enableCT,
              l: memoryStatus.value.ctLimit,
              m: memoryStatus.value.enableMiss
            }

    for (const v of entry.rollHistory) {
      const { roll: dv, rollPct: dp } = dicePct(v, 0, bonus, ct.e, ct.l, ct.m)
      lines.push(
        `【骰子】(${atkName}：${spellName})[${dp}%]D20${bonus > 0 ? '+' : ''}${bonus != 0 ? bonus : ''}=${dv}`
      )
    }

    if (atkType.value == 1) {
      const r = results.value[i]
      if (!r) continue
      const hp = [creature.currentHP, creature.tempHP]
      const preview = handleHP(
        hp,
        creature.maxHP(),
        [-r.damage, 0],
        normalizedShieldDamageRatio(mem)
      )
      if (r.damage <= 0) {
        lines.push(`${creature.name()}没有受到伤害。`)
      } else {
        const dt =
          mem.damageType + mem.damageDef + (mem.damageAspect == '无性相' ? '' : mem.damageAspect)
        lines.push(
          `${creature.name()}受到了 ${r.damage} ${dt}伤害（HP ${showHP(hp)} -> ${showHP(preview)}）。`
        )
      }
    } else if (atkType.value == 2) {
      const r = healResults.value[i]
      if (!r) continue
      const hp = [creature.currentHP, creature.tempHP]
      const amt = healMode.value == 'heal' ? r.heal : r.shield
      if (healMode.value == 'heal') {
        lines.push(
          `${creature.name()}回复了 ${amt} HP（HP ${showHP(hp)} -> ${showHP(handleHP(hp, creature.maxHP(), [amt, 0]))}）。`
        )
      } else {
        lines.push(
          `${creature.name()}获得了 ${amt} 护盾（HP ${showHP(hp)} -> ${showHP(handleHP(hp, creature.maxHP(), [0, amt], 1, memoryHeal.value.stackShield))}）。`
        )
      }
    } else if (atkType.value == 3) {
      const r = statusResults.value[i]
      if (!r) continue
      const hp = [creature.currentHP, creature.tempHP]
      const ms = memoryStatus.value
      if (statusMode.value == 'damage') {
        if (r.damage <= 0) {
          lines.push(`${creature.name()}没有受到状态伤害。`)
        } else {
          const dt =
            ms.damageType + ms.damageDef + (ms.damageAspect == '无性相' ? '' : ms.damageAspect)
          lines.push(
            `${creature.name()}受到了 ${r.damage} ${dt}状态伤害（HP ${showHP(hp)} -> ${showHP(handleHP(hp, creature.maxHP(), [-r.damage, 0], normalizedShieldDamageRatio(ms)))}）。`
          )
        }
      } else if (statusMode.value == 'heal') {
        lines.push(
          `${creature.name()}回复了 ${r.heal} HP（HP ${showHP(hp)} -> ${showHP(handleHP(hp, creature.maxHP(), [r.heal, 0]))}）。`
        )
      } else {
        lines.push(
          `${creature.name()}获得了 ${r.shield} 护盾（HP ${showHP(hp)} -> ${showHP(handleHP(hp, creature.maxHP(), [0, r.shield], 1, ms.stackShield))}）。`
        )
      }
    }
  }

  return lines.join('\n')
})

function applyAttack(entry: TargetEntry): void {
  const mem = memory.value
  const defender = getCreature(entry.code)
  if (!mem.attacker || !defender) return

  const origDefender = mem.defender
  const origMdfD = mem.damageMdfD
  const origDiceroll = mem.diceroll
  const origDicerollD = mem.dicerollD

  mem.defender = defender
  mem.damageMdfD = entry.damageMdfD
  mem.diceroll = entry.diceroll
  mem.dicerollD = entry.dicerollD

  applyAttackResult()

  mem.defender = origDefender
  mem.damageMdfD = origMdfD
  mem.diceroll = origDiceroll
  mem.dicerollD = origDicerollD
}

function applyCasterCost(): void {
  const atk = memory.value.attacker
  if (!atk) return
  const cost =
    atkType.value == 3
      ? memoryStatus.value.costPP
      : atkType.value == 2
        ? memoryHeal.value.costPP
        : atkType.value == 0
          ? movem.value.nullCostPP
          : memory.value.costPP
  if (cost > 0) atk.currentPP = Math.max(0, atk.currentPP - cost)
}

function applyAllAttack(): void {
  const log = logText.value
  if (targets.value.length > 0) {
    for (const entry of targets.value) applyAttack(entry)
  } else {
    applyCasterCost()
  }
  navigator.clipboard.writeText(log)
}

function applyHealShield(entry: TargetEntry, action: 'heal' | 'shield'): void {
  const mem = memory.value
  const defender = getCreature(entry.code)
  if (!mem.attacker || !defender) return

  const mh = memoryHeal.value
  const origDefender = mem.defender
  const origMdfD = mh.damageMdfD
  const origDiceroll = mh.diceroll
  const origDicerollD = mh.dicerollD

  mem.defender = defender
  mh.damageMdfD = entry.damageMdfD
  mh.diceroll = entry.diceroll
  mh.dicerollD = entry.dicerollD

  if (action == 'heal') {
    applyHealResult()
  } else {
    applyHealShieldResult()
  }

  mem.defender = origDefender
  mh.damageMdfD = origMdfD
  mh.diceroll = origDiceroll
  mh.dicerollD = origDicerollD
}

function applyAllHeal(action: 'heal' | 'shield'): void {
  const log = logText.value
  if (targets.value.length > 0) {
    for (const entry of targets.value) applyHealShield(entry, action)
  } else {
    applyCasterCost()
  }
  navigator.clipboard.writeText(log)
}

function applyStatus(entry: TargetEntry, action: 'damage' | 'heal' | 'shield'): void {
  const defender = getCreature(entry.code)
  if (!defender) return

  const mem = memory.value
  const ms = memoryStatus.value
  const origDefender = mem.defender
  const origMdfD = ms.damageMdfD
  const origDiceroll = ms.diceroll
  const origDicerollD = ms.dicerollD
  const origCustomDamage = ms.customDamage

  mem.defender = defender
  ms.damageMdfD = entry.damageMdfD
  ms.diceroll = entry.diceroll
  ms.dicerollD = entry.dicerollD
  if (action != 'damage') ms.customDamage = 0

  if (action == 'heal') {
    applyHealStatusResult()
  } else if (action == 'shield') {
    applyHealShieldStatusResult()
  } else {
    applyStatusResult()
  }

  mem.defender = origDefender
  ms.damageMdfD = origMdfD
  ms.diceroll = origDiceroll
  ms.dicerollD = origDicerollD
  ms.customDamage = origCustomDamage
}

function applyAllStatus(action: 'damage' | 'heal' | 'shield'): void {
  const log = logText.value
  if (targets.value.length > 0) {
    for (const entry of targets.value) applyStatus(entry, action)
  } else {
    applyCasterCost()
  }
  navigator.clipboard.writeText(log)
}

function copyLogToClipboard(): void {
  navigator.clipboard.writeText(logText.value)
}

onUpdated(() => {
  nextTick(() => {
    document.querySelectorAll<HTMLTextAreaElement>('textarea[data-autosize]').forEach(autoResize)
  })
})
</script>

<template>
  <div class="multi-target-panel panel-page">
    <div class="spell-selector-panel">
      <div class="spell-selector-header">
        <div v-if="casterExpanded" class="spell-selector-main">
          <label class="spell-field spell-field-caster">
            <span class="spell-field-label">施法者</span>
            <select
              :value="memory.attacker?.code() ?? ''"
              class="w3-select w3-border spell-control"
              @change="chooseCaster(($event.target as HTMLSelectElement).value)"
            >
              <option value="">未选择</option>
              <option v-for="c in Creatures" :key="c.code()" :value="c.code()">
                {{ c.name() }} {{ c.code() }}
              </option>
            </select>
          </label>

          <template v-if="memory.attacker != null">
            <label class="spell-field spell-field-move">
              <span class="spell-field-label">招式</span>
              <input
                v-model="movem.selectedMove"
                class="w3-input spell-control"
                list="spell-suggestions"
                @change="setCurrentMove()"
              />
            </label>
            <datalist id="spell-suggestions">
              <option v-for="name in casterMoveList" :key="name" :value="name"></option>
            </datalist>
            <label class="spell-field spell-field-prepared">
              <span class="spell-field-label">预备</span>
              <select
                v-model="movem.selectedMove"
                class="w3-select w3-border spell-control"
                @change="setCurrentMove()"
                @wheel="moveWheel"
              >
                <option v-for="name in casterMoveList" :key="name" :value="name">
                  {{ name }}
                </option>
              </select>
            </label>
          </template>
        </div>

        <p
          v-if="
            !casterExpanded &&
            memory.attacker != null &&
            currentMove().name.length > 0 &&
            hasPowerSelection()
          "
          class="spell-selector-summary"
        >
          <span class="spell-summary-role">{{ atkType == 1 ? '攻击方' : '施法者' }}</span>
          <strong>{{ memory.attacker!.name() }}</strong>
          <span>{{ collapsedCasterSummary() }}</span>
        </p>

        <button class="w3-button spell-collapse-button" @click="casterExpanded = !casterExpanded">
          {{ casterExpanded ? '收起' : '展开' }}
        </button>
      </div>

      <div v-if="casterExpanded && currentMove().name.length > 0" class="spell-selector-body">
        <div class="spell-status-row">
          <span v-if="currentMove().inMemory.length <= 0" class="spell-warning">未预备</span>
          <span v-if="currentMove().maxCharge > 0" class="spell-status-pill">
            次数 {{ currentMove().chargeAt }} {{ currentMove().charge }} /
            {{ currentMove().maxCharge }}
          </span>
          <span v-if="currentMove().cooldown.length > 0" class="spell-status-pill">
            冷却 {{ currentMove().cooldown }}
          </span>
        </div>

        <div class="spell-meta-grid">
          <div class="spell-meta-row spell-meta-row-main">
            <div class="spell-meta-item">
              <span>类型/环位</span>
              <strong>{{ currentMoveTypeText() }}</strong>
            </div>
            <div class="spell-meta-item">
              <span>属性一致加成</span>
              <strong>{{ currentSpellTypeStabText() }}</strong>
            </div>
            <div class="spell-meta-item">
              <span>施法关键属性</span>
              <strong>{{ currentSpellModName() }}</strong>
            </div>
            <div class="spell-meta-item">
              <span>施法距离</span>
              <strong>{{ currentMoveRangeText() }}</strong>
            </div>
            <div class="spell-meta-item">
              <span>持续时间</span>
              <strong>{{ currentMoveDurationText() }}</strong>
            </div>
          </div>
          <div class="spell-meta-row spell-meta-row-support">
            <div class="spell-meta-item">
              <span>资源</span>
              <strong>{{ currentMove().costs() }}</strong>
            </div>
            <div class="spell-meta-item">
              <span>施法成分</span>
              <strong>{{ currentMove().components() }}</strong>
            </div>
            <label class="spell-meta-item spell-cost-item">
              <span>本次消耗</span>
              <span class="spell-cost-control">
                <vue-number-input
                  v-if="atkType == 0"
                  v-model="movem.nullCostPP"
                  size="small"
                  inline
                  center
                  controls
                  :step="15"
                  :min="0"
                />
                <vue-number-input
                  v-if="atkType == 1"
                  v-model="memory.costPP"
                  size="small"
                  inline
                  center
                  controls
                  :step="15"
                  :min="0"
                />
                <vue-number-input
                  v-if="atkType == 2"
                  v-model="memoryHeal.costPP"
                  size="small"
                  inline
                  center
                  controls
                  :step="15"
                  :min="0"
                />
                <vue-number-input
                  v-if="atkType == 3"
                  v-model="memoryStatus.costPP"
                  size="small"
                  inline
                  center
                  controls
                  :step="15"
                  :min="0"
                />
                <strong>PP</strong>
              </span>
            </label>
          </div>
        </div>

        <div
          v-if="envDcContributions.length > 0 || envDamageMdfContributions.length > 0"
          class="env-auto-effects"
        >
          <span class="env-auto-title">环境自动修正</span>
          <span v-if="envDcContributions.length > 0" class="env-auto-pill">
            DC {{ contributionValueText(contributionTotal(envDcContributions)) }}：{{
              contributionListText(envDcContributions)
            }}
          </span>
          <span v-if="envDamageMdfContributions.length > 0" class="env-auto-pill">
            伤害修正
            {{ contributionValueText(contributionTotal(envDamageMdfContributions)) }}：{{
              contributionListText(envDamageMdfContributions)
            }}
          </span>
        </div>

        <div class="spell-config-grid">
          <section class="spell-config-section spell-config-section-main">
            <div class="spell-config-title">威力来源与数值</div>
            <div class="spell-power-row">
              <div class="power-mode-switch" aria-label="威力模式">
                <button
                  class="w3-button power-mode-button"
                  :class="{ active: currentPowerInputMode() == 'move' }"
                  @click="setPowerInputMode('move')"
                >
                  使用招式威力
                </button>
                <button
                  class="w3-button power-mode-button"
                  :class="{ active: currentPowerInputMode() == 'customPower' }"
                  @click="setPowerInputMode('customPower')"
                >
                  手动填写威力
                </button>
                <button
                  class="w3-button power-mode-button"
                  :class="{ active: currentPowerInputMode() == 'directDamage' }"
                  :disabled="!canUseDirectDamageMode()"
                  @click="setPowerInputMode('directDamage')"
                >
                  直接填写伤害
                </button>
              </div>

              <div class="power-mode-fields">
                <template v-if="currentPowerInputMode() == 'move'">
                  <label
                    v-if="currentMove().powerList.length > 0"
                    class="spell-inline-field spell-inline-field-power"
                  >
                    <select
                      v-model="movem.selectedPowerIdx"
                      class="w3-select w3-border spell-control"
                      @change="setCurrentMove()"
                      @wheel="movePowerWheel"
                    >
                      <option
                        v-for="pwr in currentMove().powerList"
                        :key="pwr.idx"
                        :value="pwr.idx"
                      >
                        {{ powerOptionLabel(pwr) }}
                      </option>
                    </select>
                  </label>
                  <span v-else class="spell-stat-pill">无可选威力</span>
                </template>

                <template v-if="currentPowerInputMode() == 'customPower'">
                  <label class="spell-inline-field spell-number-field">
                    <span>威力</span>
                    <vue-number-input
                      v-model="memory.customPower"
                      size="small"
                      inline
                      center
                      controls
                      :min="0"
                      :step="5"
                    />
                  </label>
                  <select
                    v-if="atkType == 1"
                    v-model="memory.customPowerDamageType"
                    class="w3-select w3-border compact-select"
                  >
                    <option v-for="name in damageTypeList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <select
                    v-if="atkType == 1"
                    v-model="memory.customPowerDamageDef"
                    class="w3-select w3-border mini-select"
                  >
                    <option v-for="name in damageDefList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <select
                    v-if="atkType == 1"
                    v-model="memory.customPowerDamageAspect"
                    class="w3-select w3-border compact-select"
                  >
                    <option v-for="name in damageAspectList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <span class="spell-stat-pill">按“{{ resolutionModeLabel() }}”结算</span>
                </template>

                <template v-if="currentPowerInputMode() == 'directDamage'">
                  <label class="spell-inline-field spell-number-field">
                    <span>伤害</span>
                    <vue-number-input
                      v-if="atkType == 1"
                      v-model="memory.customDamage"
                      size="small"
                      inline
                      center
                      controls
                      :min="1"
                      :step="1"
                    />
                    <vue-number-input
                      v-if="atkType == 3"
                      v-model="memoryStatus.customDamage"
                      size="small"
                      inline
                      center
                      controls
                      :min="1"
                      :step="1"
                    />
                  </label>
                  <select
                    v-if="atkType == 1"
                    v-model="memory.damageType"
                    class="w3-select w3-border compact-select"
                  >
                    <option v-for="name in damageTypeList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <select
                    v-if="atkType == 3"
                    v-model="memoryStatus.damageType"
                    class="w3-select w3-border compact-select"
                  >
                    <option v-for="name in damageTypeList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <select
                    v-if="atkType == 1"
                    v-model="memory.damageDef"
                    class="w3-select w3-border mini-select"
                    @change="syncDamageDefense(memory)"
                  >
                    <option v-for="name in damageDefList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <select
                    v-if="atkType == 3"
                    v-model="memoryStatus.damageDef"
                    class="w3-select w3-border mini-select"
                    @change="syncDamageDefense(memoryStatus)"
                  >
                    <option v-for="name in damageDefList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <select
                    v-if="atkType == 1"
                    v-model="memory.damageAspect"
                    class="w3-select w3-border compact-select"
                  >
                    <option v-for="name in damageAspectList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <select
                    v-if="atkType == 3"
                    v-model="memoryStatus.damageAspect"
                    class="w3-select w3-border compact-select"
                  >
                    <option v-for="name in damageAspectList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                </template>

                <label
                  v-if="atkType == 1 || atkType == 3"
                  class="spell-inline-field spell-number-field"
                >
                  <span>对护盾伤害倍率</span>
                  <vue-number-input
                    v-if="atkType == 1"
                    v-model="memory.shieldDamageRatio"
                    size="small"
                    inline
                    center
                    controls
                    :min="1"
                    :step="1"
                  />
                  <vue-number-input
                    v-if="atkType == 3"
                    v-model="memoryStatus.shieldDamageRatio"
                    size="small"
                    inline
                    center
                    controls
                    :min="1"
                    :step="1"
                  />
                </label>
              </div>
            </div>
          </section>

          <section class="spell-config-section spell-save-section">
            <div class="save-inline-row">
              <span class="spell-config-title save-inline-title">豁免</span>
              <span class="spell-stat-pill">当前 DC {{ currentDC() }}</span>
              <label class="spell-inline-field spell-dc-field">
                <span>基础 {{ currentDC() - movem.dcDelta }} +</span>
                <vue-number-input
                  v-model="movem.dcDelta"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                />
              </label>
              <div class="save-button-row">
                <button
                  v-for="skill in ['力量', '敏捷', '体质', '智力', '感知', '魅力']"
                  :key="skill"
                  class="w3-button save-button"
                  @click="setSaveForTargets(skill)"
                >
                  {{ skill }}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div class="spell-description-block">
          <button
            class="w3-button w3-light-gray spell-description-toggle"
            @click="showMoveDescription = !showMoveDescription"
          >
            {{ showMoveDescription ? '收起招式描述' : '展开招式描述' }}
          </button>
          <textarea
            v-if="showMoveDescription"
            v-model="currentMove().description"
            data-autosize
            spellcheck="false"
            class="spell-description-textarea"
          ></textarea>
        </div>
      </div>
    </div>

    <div v-if="memory.attacker != null && currentMove().name.length > 0">
      <!-- 目标选择 -->
      <div v-if="hasPowerSelection()" style="margin-bottom: 0.75em">
        <p class="battlepage-item" style="font-weight: bold; margin-bottom: 0.3em">选择目标</p>
        <div class="target-choice-list">
          <div v-for="c in Creatures" :key="c.code()" class="target-choice">
            <button
              class="w3-button w3-tiny target-select-button"
              :class="{
                'w3-black': selectedTargetCodes.has(c.code()),
                'w3-light-gray': !selectedTargetCodes.has(c.code())
              }"
              @click="toggleChosen(c.code())"
            >
              {{ c.name() }}
            </button>
            <label
              class="target-concentration"
              :class="{ active: c.concentrating }"
              :title="c.concentrating ? '正在专注；点击取消' : '点击标记为正在专注'"
            >
              <input v-model="c.concentrating" type="checkbox" />
              <span>专注</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 批量操作 -->
      <div v-if="targets.length > 0" class="batch-panel">
        <div class="batch-header">
          <span class="batch-title">批量操作</span>
          <div class="batch-header-actions">
            <button
              class="w3-button spell-toggle"
              :class="{ active: movem.dmControlRoll }"
              @click="toggleDmControlRoll"
            >
              {{ movem.dmControlRoll ? '禁用DM控骰' : '启用DM控骰' }}
            </button>
            <button class="w3-button w3-blue batch-roll-button" @click="batchRoll">
              {{ movem.dmControlRoll ? '应用控骰结果' : '一键掷骰' }}
            </button>
          </div>
        </div>
        <div class="batch-grid">
          <div
            v-if="atkType == 1 || atkType == 2 || atkType == 3"
            class="batch-group batch-group-wide batch-judgement-group"
          >
            <span class="batch-label">判定</span>
            <template v-if="atkType == 1">
              <button
                class="w3-button spell-toggle"
                :class="{ active: memory.enableCT }"
                @click="memory.enableCT = memory.enableCT ? 0 : 1"
              >
                {{ memory.enableCT ? '启用暴击' : '禁用暴击' }}
              </button>
              <label class="spell-inline-field spell-number-field">
                <span>暴击阈值</span>
                <vue-number-input
                  v-model="memory.ctLimit"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="1"
                  :max="20"
                />
              </label>
              <button
                class="w3-button spell-toggle"
                :class="{ active: memory.enableMiss }"
                @click="memory.enableMiss = memory.enableMiss ? 0 : 1"
              >
                {{ memory.enableMiss ? '启用大失败' : '禁用大失败' }}
              </button>
              <button
                class="w3-button spell-toggle"
                :class="{ active: memory.enableAccuracyAdvance }"
                @click="memory.enableAccuracyAdvance = memory.enableAccuracyAdvance ? 0 : 1"
              >
                {{ memory.enableAccuracyAdvance ? '命中减值有效' : '命中减值无效' }}
              </button>
            </template>
            <template v-if="atkType == 2">
              <button
                class="w3-button spell-toggle"
                :class="{ active: memoryHeal.enableCT }"
                @click="memoryHeal.enableCT = memoryHeal.enableCT ? 0 : 1"
              >
                {{ memoryHeal.enableCT ? '启用暴击' : '禁用暴击' }}
              </button>
              <label class="spell-inline-field spell-number-field">
                <span>暴击阈值</span>
                <vue-number-input
                  v-model="memoryHeal.ctLimit"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="1"
                  :max="20"
                />
              </label>
              <button
                class="w3-button spell-toggle"
                :class="{ active: memoryHeal.enableMiss }"
                @click="memoryHeal.enableMiss = memoryHeal.enableMiss ? 0 : 1"
              >
                {{ memoryHeal.enableMiss ? '启用大失败' : '禁用大失败' }}
              </button>
            </template>
            <template v-if="atkType == 3">
              <span class="spell-stat-pill">状态等级 {{ battleLvStatus() }}</span>
              <button
                class="w3-button spell-toggle"
                :class="{ active: memoryStatus.enableCT }"
                @click="memoryStatus.enableCT = memoryStatus.enableCT ? 0 : 1"
              >
                {{ memoryStatus.enableCT ? '启用暴击' : '禁用暴击' }}
              </button>
              <label class="spell-inline-field spell-number-field">
                <span>暴击阈值</span>
                <vue-number-input
                  v-model="memoryStatus.ctLimit"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                  :min="1"
                  :max="20"
                />
              </label>
              <button
                class="w3-button spell-toggle"
                :class="{ active: memoryStatus.enableMiss }"
                @click="memoryStatus.enableMiss = memoryStatus.enableMiss ? 0 : 1"
              >
                {{ memoryStatus.enableMiss ? '启用大失败' : '禁用大失败' }}
              </button>
            </template>
          </div>
          <div class="batch-group batch-damage-group">
            <span class="batch-label">伤害修正</span>
            <vue-number-input v-model="batchDamageMdfD" size="small" inline center :step="0.1" />
            <button class="w3-button w3-tiny w3-border" @click="batchSetDamageMdf(-1)">
              攻击动作
            </button>
            <button class="w3-button w3-tiny w3-border" @click="batchSetDamageMdf(-2)">
              附赠动作
            </button>
          </div>
          <div class="batch-group">
            <span class="batch-label">优劣势</span>
            <vue-number-input v-model="batchAdvantage" size="small" inline center :step="1" />
          </div>
          <div class="batch-group">
            <span class="batch-label">调整值</span>
            <vue-number-input v-model="batchDicerollD" size="small" inline center :step="1" />
          </div>
          <div
            v-if="movem.dmControlRoll"
            class="batch-group"
            title="填写后点击“应用控骰结果”，才会写入下方目标"
          >
            <span class="batch-label">DM控骰结果</span>
            <vue-number-input
              v-model="batchDiceroll"
              size="small"
              inline
              center
              :min="1"
              :max="20"
              :step="1"
            />
          </div>
        </div>
      </div>

      <!-- ── 模式 1：攻击 ── -->
      <div v-if="atkType == 1 && targets.length > 0">
        <table class="w3-table w3-bordered">
          <thead>
            <tr class="w3-light-gray">
              <th>防御方</th>
              <th>防御</th>
              <th>伤害修正</th>
              <th>优劣势</th>
              <th>攻击掷骰</th>
              <th>其他调整值</th>
              <th>最终掷骰</th>
              <th style="font-weight: bold">伤害</th>
              <th>专注豁免</th>
              <th>伤害详细</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, idx) in targets" :key="entry.code">
              <td>
                {{ results[idx]?.name }}
                <span style="font-size: small; color: gray">{{ entry.code }}</span>
                <div v-if="targetFieldEffectHint(entry)" class="target-field-effect-hint">
                  {{ targetFieldEffectHint(entry) }}
                </div>
              </td>
              <td>{{ results[idx]?.defValue }}</td>
              <td>
                <vue-number-input
                  v-model="entry.damageMdfD"
                  size="small"
                  inline
                  center
                  :step="0.1"
                />
                <div v-if="targetDamageEnvHint(entry)" class="target-env-damage-hint">
                  {{ targetDamageEnvHint(entry) }}
                </div>
              </td>
              <td>
                <vue-number-input
                  v-model="entry.advantageDelta"
                  size="small"
                  inline
                  center
                  :step="1"
                />
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 0.2em">
                  <vue-number-input
                    :model-value="entry.diceroll"
                    size="small"
                    inline
                    center
                    :min="1"
                    :max="20"
                    :step="1"
                    @update:model-value="(v: number) => setEntryDiceroll(entry, v)"
                  />
                  <button
                    v-if="!movem.dmControlRoll && getCreature(entry.code)?.grandStatus().autoCrit"
                    class="w3-button w3-tiny w3-red"
                    style="color: white"
                    @click="setAutoCrit(entry)"
                  >
                    自动暴击
                  </button>
                  <button
                    v-else-if="!movem.dmControlRoll"
                    class="w3-button w3-tiny w3-border"
                    @click="rollSingle(entry)"
                  >
                    🎲
                  </button>
                </div>
              </td>
              <td>
                <vue-number-input v-model="entry.dicerollD" size="small" inline center :step="1" />
              </td>
              <td>
                <span :style="{ color: valueToColor(-results[idx]?.roll), fontWeight: 'bold' }">
                  {{ results[idx]?.roll }} ({{ results[idx]?.rollPct }}%)
                </span>
              </td>
              <td>
                <span
                  style="font-weight: bold; font-size: larger"
                  :style="{ color: results[idx]?.damage > 0 ? '#e53935' : 'gray' }"
                >
                  {{ results[idx]?.damage }}
                </span>
              </td>
              <td>
                <button
                  class="w3-button w3-tiny result-action-button"
                  :class="{
                    'w3-amber': getCreature(entry.code)?.concentrating,
                    'w3-light-gray': !getCreature(entry.code)?.concentrating
                  }"
                  :disabled="
                    !getCreature(entry.code)?.concentrating || (results[idx]?.damage ?? 0) <= 0
                  "
                  :title="
                    getCreature(entry.code)?.concentrating
                      ? `设置 DC ${getCreature(entry.code)?.concentrationSaveFromDamage(results[idx]?.damage ?? 0)} 的专注豁免`
                      : '该目标未标记为专注状态'
                  "
                  @click="openConcentrationSave(entry, results[idx]?.damage ?? 0)"
                >
                  DC
                  {{
                    getCreature(entry.code)?.concentrationSaveFromDamage(results[idx]?.damage ?? 0)
                  }}
                </button>
              </td>
              <td>
                <button
                  class="w3-button w3-tiny w3-border result-action-button"
                  @click="openDamageDetails(entry)"
                >
                  打开
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <button class="w3-button w3-red" style="margin-top: 0.5em" @click="applyAllAttack">
          全部应用
        </button>
        <button
          class="w3-button w3-light-gray"
          style="margin-top: 0.5em; margin-left: 0.3em"
          @click="copyLogToClipboard"
        >
          复制到剪贴板
        </button>
      </div>

      <!-- ── 模式 2：治疗 / 护盾 ── -->
      <div v-if="atkType == 2 && targets.length > 0">
        <div class="resolution-toolbar">
          <span class="resolution-label">结算方式</span>
          <button
            class="w3-button w3-tiny"
            :class="{ 'w3-green': healMode == 'heal', 'w3-light-gray': healMode != 'heal' }"
            @click="healMode = 'heal'"
          >
            治疗
          </button>
          <button
            class="w3-button w3-tiny"
            :class="{ 'w3-blue': healMode == 'shield', 'w3-light-gray': healMode != 'shield' }"
            @click="healMode = 'shield'"
          >
            护盾
          </button>
          <label v-if="healMode == 'shield'" class="shield-stack-option">
            <input v-model="memoryHeal.stackShield" type="checkbox" />
            <span>叠加现有护盾（不勾选则取较高值）</span>
          </label>
          <span class="resolution-hint">默认按招式记录选择，DM 可在此调整</span>
        </div>
        <table class="w3-table w3-bordered">
          <thead>
            <tr class="w3-light-gray">
              <th>目标</th>
              <th>HP</th>
              <th>伤害修正</th>
              <th>优劣势</th>
              <th>治疗掷骰</th>
              <th>其他调整值</th>
              <th>最终掷骰</th>
              <th style="font-weight: bold">{{ healMode == 'heal' ? '治疗' : '护盾' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, idx) in targets" :key="entry.code">
              <td>
                {{ healResults[idx]?.name }}
                <span style="font-size: small; color: gray">{{ entry.code }}</span>
                <div v-if="targetFieldEffectHint(entry)" class="target-field-effect-hint">
                  {{ targetFieldEffectHint(entry) }}
                </div>
              </td>
              <td>
                {{ getCreature(entry.code)?.currentHP }} / {{ getCreature(entry.code)?.maxHP() }}
                <span v-if="(getCreature(entry.code)?.tempHP ?? 0) > 0"
                  >+{{ getCreature(entry.code)?.tempHP }}</span
                >
              </td>
              <td>
                <vue-number-input
                  v-model="entry.damageMdfD"
                  size="small"
                  inline
                  center
                  :step="0.1"
                />
                <div v-if="targetDamageEnvHint(entry)" class="target-env-damage-hint">
                  {{ targetDamageEnvHint(entry) }}
                </div>
              </td>
              <td>
                <vue-number-input
                  v-model="entry.advantageDelta"
                  size="small"
                  inline
                  center
                  :step="1"
                />
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 0.2em">
                  <vue-number-input
                    :model-value="entry.diceroll"
                    size="small"
                    inline
                    center
                    :min="1"
                    :max="20"
                    :step="1"
                    @update:model-value="(v: number) => setEntryDiceroll(entry, v)"
                  />
                  <button
                    v-if="!movem.dmControlRoll"
                    class="w3-button w3-tiny w3-border"
                    @click="rollSingle(entry)"
                  >
                    🎲
                  </button>
                </div>
              </td>
              <td>
                <vue-number-input v-model="entry.dicerollD" size="small" inline center :step="1" />
              </td>
              <td>
                <span :style="{ color: valueToColor(-healResults[idx]?.roll), fontWeight: 'bold' }">
                  {{ healResults[idx]?.roll }} ({{ healResults[idx]?.rollPct }}%)
                </span>
              </td>
              <td>
                <span
                  style="font-weight: bold; font-size: larger"
                  :style="{ color: healMode == 'heal' ? '#4caf50' : '#2196f3' }"
                  >{{
                    healMode == 'heal' ? healResults[idx]?.heal : healResults[idx]?.shield
                  }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
        <button
          class="w3-button"
          :class="healMode == 'heal' ? 'w3-green' : 'w3-blue'"
          style="margin-top: 0.5em"
          @click="applyAllHeal(healMode)"
        >
          全部{{ healMode == 'heal' ? '治疗' : '护盾' }}
        </button>
        <button
          class="w3-button w3-light-gray"
          style="margin-top: 0.5em; margin-left: 0.3em"
          @click="copyLogToClipboard"
        >
          复制到剪贴板
        </button>
      </div>

      <!-- ── 模式 3：状态 ── -->
      <div v-if="atkType == 3 && targets.length > 0">
        <div class="resolution-toolbar">
          <span class="resolution-label">结算方式</span>
          <button
            class="w3-button w3-tiny"
            :class="{ 'w3-red': statusMode == 'damage', 'w3-light-gray': statusMode != 'damage' }"
            @click="statusMode = 'damage'"
          >
            状态伤害
          </button>
          <button
            class="w3-button w3-tiny"
            :class="{ 'w3-green': statusMode == 'heal', 'w3-light-gray': statusMode != 'heal' }"
            @click="statusMode = 'heal'"
          >
            治疗
          </button>
          <button
            class="w3-button w3-tiny"
            :class="{ 'w3-blue': statusMode == 'shield', 'w3-light-gray': statusMode != 'shield' }"
            @click="statusMode = 'shield'"
          >
            护盾
          </button>
          <label v-if="statusMode == 'shield'" class="shield-stack-option">
            <input v-model="memoryStatus.stackShield" type="checkbox" />
            <span>叠加现有护盾（不勾选则取较高值）</span>
          </label>
          <span class="resolution-hint">默认按招式记录选择，DM 可在此调整</span>
        </div>
        <table class="w3-table w3-bordered">
          <thead>
            <tr class="w3-light-gray">
              <th>目标</th>
              <th>HP</th>
              <th>伤害修正</th>
              <th>优劣势</th>
              <th>状态掷骰</th>
              <th>其他调整值</th>
              <th>最终掷骰</th>
              <th style="font-weight: bold">
                {{ statusMode == 'damage' ? '状态伤害' : statusMode == 'heal' ? '治疗' : '护盾' }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, idx) in targets" :key="entry.code">
              <td>
                {{ statusResults[idx]?.name }}
                <span style="font-size: small; color: gray">{{ entry.code }}</span>
                <div v-if="targetFieldEffectHint(entry)" class="target-field-effect-hint">
                  {{ targetFieldEffectHint(entry) }}
                </div>
              </td>
              <td>
                {{ getCreature(entry.code)?.currentHP }} / {{ getCreature(entry.code)?.maxHP() }}
                <span v-if="(getCreature(entry.code)?.tempHP ?? 0) > 0"
                  >+{{ getCreature(entry.code)?.tempHP }}</span
                >
              </td>
              <td>
                <vue-number-input
                  v-model="entry.damageMdfD"
                  size="small"
                  inline
                  center
                  :step="0.1"
                />
                <div v-if="targetDamageEnvHint(entry)" class="target-env-damage-hint">
                  {{ targetDamageEnvHint(entry) }}
                </div>
              </td>
              <td>
                <vue-number-input
                  v-model="entry.advantageDelta"
                  size="small"
                  inline
                  center
                  :step="1"
                />
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 0.2em">
                  <vue-number-input
                    :model-value="entry.diceroll"
                    size="small"
                    inline
                    center
                    :min="1"
                    :max="20"
                    :step="1"
                    @update:model-value="(v: number) => setEntryDiceroll(entry, v)"
                  />
                  <button
                    v-if="!movem.dmControlRoll"
                    class="w3-button w3-tiny w3-border"
                    @click="rollSingle(entry)"
                  >
                    🎲
                  </button>
                </div>
              </td>
              <td>
                <vue-number-input v-model="entry.dicerollD" size="small" inline center :step="1" />
              </td>
              <td>
                <span
                  :style="{ color: valueToColor(-statusResults[idx]?.roll), fontWeight: 'bold' }"
                >
                  {{ statusResults[idx]?.roll }} ({{ statusResults[idx]?.rollPct }}%)
                </span>
              </td>
              <td>
                <span
                  style="font-weight: bold; font-size: larger"
                  :style="{
                    color:
                      statusMode == 'damage'
                        ? '#e53935'
                        : statusMode == 'heal'
                          ? '#4caf50'
                          : '#2196f3'
                  }"
                  >{{
                    statusMode == 'damage'
                      ? statusResults[idx]?.damage
                      : statusMode == 'heal'
                        ? statusResults[idx]?.heal
                        : statusResults[idx]?.shield
                  }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
        <button
          class="w3-button"
          :class="statusMode == 'damage' ? 'w3-red' : statusMode == 'heal' ? 'w3-green' : 'w3-blue'"
          style="margin-top: 0.5em"
          @click="applyAllStatus(statusMode)"
        >
          全部{{ statusMode == 'damage' ? '状态伤害' : statusMode == 'heal' ? '治疗' : '护盾' }}
        </button>
        <button
          class="w3-button w3-light-gray"
          style="margin-top: 0.5em; margin-left: 0.3em"
          @click="copyLogToClipboard"
        >
          复制到剪贴板
        </button>
      </div>

      <!-- 日志预览 -->
      <div style="margin-top: 1em">
        <textarea
          data-autosize
          :value="logText"
          style="width: 100%; height: 10em; resize: vertical; box-sizing: border-box"
          readonly
        ></textarea>
      </div>
    </div>

    <div v-if="!hasPowerSelection() || targets.length == 0" style="margin-top: 0.5em">
      <button class="w3-button w3-red" @click="applyAllAttack()">消耗 PP</button>
      <button
        class="w3-button w3-light-gray"
        style="margin-left: 0.3em"
        @click="copyLogToClipboard"
      >
        复制到剪贴板
      </button>
    </div>
  </div>
</template>

<style scoped>
.multi-target-panel :is(input, select, textarea) {
  max-width: 100%;
}

.multi-target-panel :is(input, select)[style*='width'] {
  max-width: 100% !important;
}

.multi-target-panel :is(table.w3-table, table.w3-table-all) {
  display: table;
  width: 100%;
  max-width: none;
  white-space: nowrap;
}

.multi-target-panel .w3-container {
  max-width: 100%;
}

.spell-selector-panel {
  margin-bottom: 0.75em;
  padding: 10px;
  border: 1px solid #d9dde3;
  background: #fafbfc;
}

.spell-selector-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75em;
}

.spell-selector-main {
  display: grid;
  grid-template-columns: minmax(12em, 1.1fr) minmax(12em, 1fr) minmax(10em, 0.8fr);
  gap: 0.6em;
  align-items: end;
  flex: 1;
  min-width: 0;
}

.spell-field,
.spell-inline-field {
  display: flex;
  min-width: 0;
  gap: 0.25em;
}

.spell-field {
  flex-direction: column;
}

.spell-inline-field {
  align-items: center;
  flex-wrap: wrap;
}

.spell-field-label,
.spell-inline-field > span,
.spell-config-title,
.spell-meta-item > span {
  color: #57606a;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
}

.spell-control {
  width: 100%;
  min-width: 0;
}

.spell-collapse-button {
  flex: 0 0 auto;
  min-width: 4.5em;
  padding: 7px 10px;
  border: 1px solid #d0d7de;
  background: #fff;
}

.spell-selector-summary {
  display: flex;
  align-items: center;
  gap: 0.55em;
  min-width: 0;
  margin: 0;
  flex: 1;
  overflow: hidden;
  color: #24292f;
  white-space: nowrap;
}

.spell-selector-summary > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.spell-summary-role {
  flex: 0 0 auto;
  color: #57606a;
  font-size: 12px;
  font-weight: 700;
}

.spell-selector-body {
  margin-top: 0.75em;
}

.spell-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4em;
  margin-bottom: 0.55em;
}

.spell-warning,
.spell-status-pill,
.spell-stat-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid #d0d7de;
  background: #fff;
  font-size: 12px;
  line-height: 1.5;
}

.spell-warning {
  border-color: #ffccd5;
  background: #fff1f3;
  color: #cf222e;
  font-weight: 700;
}

.spell-meta-grid {
  display: flex;
  flex-direction: column;
  gap: 0.45em;
}

.spell-meta-row {
  display: grid;
  gap: 0.45em;
  align-items: stretch;
}

.spell-meta-row-main {
  grid-template-columns:
    minmax(5.5em, 0.72fr) minmax(8.5em, 1fr) minmax(8.5em, 1fr)
    minmax(9em, 1.1fr) minmax(9em, 1.1fr);
}

.spell-meta-row-support {
  grid-template-columns: minmax(9em, 1fr) minmax(9em, 1fr) minmax(12em, 1fr);
}

.spell-meta-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 45px;
  padding: 5px 8px;
  border: 1px solid #e3e6ea;
  background: #fff;
}

.spell-meta-item strong {
  min-width: 0;
  overflow: visible;
  color: #1f2328;
  font-weight: 700;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}

.spell-cost-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25em;
  min-width: 0;
}

.spell-cost-control strong {
  flex: 0 0 auto;
}

.spell-config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18em, 1fr));
  gap: 0.6em;
  margin-top: 0.7em;
}

.spell-config-section {
  min-width: 0;
  padding: 8px;
  border: 1px solid #e3e6ea;
  background: #fff;
}

.spell-config-section-main {
  grid-column: 1 / -1;
}

.spell-config-title {
  margin-bottom: 0.45em;
  color: #24292f;
}

.spell-control-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45em;
}

.spell-power-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.55em;
  align-items: center;
}

.power-mode-switch {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
}

.power-mode-button {
  min-width: 6.8em;
  padding: 6px 10px;
  border: 0;
  border-right: 1px solid #d0d7de;
  background: transparent;
  color: #57606a;
  line-height: 1.35;
}

.power-mode-button:last-child {
  border-right: 0;
}

.power-mode-button.active {
  background: #24292f;
  color: #fff;
}

.power-mode-button:disabled {
  color: #8c959f;
  cursor: not-allowed;
  opacity: 0.55;
}

.power-mode-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45em;
  min-width: 0;
}

.resolution-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35em;
  margin: 0.55em 0;
}

.resolution-label {
  margin-right: 0.2em;
  color: #57606a;
  font-size: 12px;
  font-weight: 700;
}

.resolution-hint {
  color: #6e7781;
  font-size: 12px;
}

.shield-stack-option {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  margin-left: 0.4em;
  padding: 4px 8px;
  border: 1px solid #90caf9;
  background: #e3f2fd;
  color: #0d47a1;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.shield-stack-option input {
  margin: 0;
}

.spell-inline-field-power {
  flex: 1 1 24em;
}

.spell-dc-field,
.spell-number-field {
  flex: 0 0 auto;
}

.spell-toggle {
  flex: 0 0 auto;
  padding: 5px 10px;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
  color: #24292f;
  line-height: 1.35;
}

.spell-toggle.active {
  border-color: #24292f;
  background: #24292f;
  color: #fff;
}

.spell-save-section {
  grid-column: 1 / -1;
}

.save-inline-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45em;
}

.save-inline-title {
  margin-bottom: 0;
  flex: 0 0 auto;
}

.save-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em;
  min-width: 0;
}

.save-button {
  flex: 0 0 auto;
  min-width: 3.75em;
  padding: 5px 8px;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
  line-height: 1.3;
}

.spell-description-block {
  margin-top: 0.7em;
}

.spell-description-toggle {
  border: 1px solid #d0d7de;
}

.spell-description-textarea {
  width: 100%;
  min-height: 10em;
  margin-top: 0.5em;
  box-sizing: border-box;
  resize: vertical;
}

.env-auto-effects {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4em;
  margin-top: 0.5em;
}

.target-choice-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em;
}

.target-choice {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid #d5d9e0;
  border-radius: 4px;
  background: #fff;
}

.target-select-button {
  border-radius: 0;
}

.target-concentration {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border-left: 1px solid #d5d9e0;
  color: #737b89;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}

.target-concentration.active {
  background: #fff3cd;
  color: #775b00;
  font-weight: 700;
}

.target-concentration input {
  margin: 0;
}

.target-field-effect-hint {
  width: 10em;
  max-width: 100%;
  margin-top: 0.2em;
  color: #b15c00;
  font-size: 0.78em;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.target-env-damage-hint {
  max-width: 24em;
  margin-top: 0.2em;
  color: #5d6470;
  font-size: 0.72em;
  line-height: 1.3;
}

.result-action-button {
  min-width: 4.8em;
  white-space: nowrap;
}

.env-auto-title {
  font-weight: 600;
  color: #444;
}

.env-auto-pill {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 8px;
  border: 1px solid #d9dde3;
  background: #f6f8fa;
  color: #333;
  font-size: 12px;
  line-height: 1.5;
}

.batch-panel {
  margin-bottom: 1em;
  padding: 8px 10px;
  border: 1px solid #d9dde3;
  background: #f7f8fa;
}

.batch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75em;
  margin-bottom: 0.5em;
}

.batch-title {
  font-weight: 700;
  color: #1f2328;
}

.batch-header-actions {
  display: flex;
  align-items: center;
  gap: 0.4em;
}

.batch-roll-button {
  min-width: 7em;
}

.batch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10.5em, 1fr));
  gap: 0.45em;
  align-items: stretch;
}

.batch-group {
  display: flex;
  align-items: center;
  gap: 0.35em;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #e3e6ea;
  background: #fff;
}

.batch-group-wide {
  grid-column: 1 / -1;
}

.batch-damage-group {
  grid-column: span 2;
  flex-wrap: wrap;
}

.batch-judgement-group {
  flex-wrap: wrap;
}

.batch-judgement-group .spell-toggle {
  min-width: 7.5em;
}

.batch-label {
  flex: 0 0 auto;
  min-width: 4.4em;
  color: #555;
  font-size: 12px;
  font-weight: 600;
}

.batch-group .w3-button {
  flex: 0 0 auto;
  padding: 4px 8px;
  line-height: 1.35;
}

.batch-group :deep(.vue-number-input) {
  flex: 0 0 auto;
}

.batch-hint {
  color: #6e7781;
  font-size: 11px;
  line-height: 1.3;
}

.custom-combat-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4em;
  margin-top: 0.5em;
}

.compact-select {
  width: 7em;
}

.mini-select {
  width: 5em;
}

.custom-control-hint {
  color: #666;
  font-size: 12px;
}

@media (max-width: 900px) {
  .spell-selector-main {
    grid-template-columns: 1fr 1fr;
  }

  .spell-field-caster {
    grid-column: 1 / -1;
  }

  .spell-meta-row-main {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .spell-meta-row-support {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .spell-selector-header {
    align-items: stretch;
    flex-direction: column;
  }

  .spell-selector-main,
  .spell-config-grid,
  .spell-meta-row-main,
  .spell-meta-row-support {
    grid-template-columns: 1fr;
  }

  .spell-collapse-button {
    width: 100%;
  }

  .spell-power-row {
    grid-template-columns: 1fr;
  }

  .power-mode-switch {
    width: 100%;
  }

  .power-mode-button {
    flex: 1 1 0;
    min-width: 0;
  }

  .spell-inline-field-power,
  .spell-dc-field,
  .spell-number-field {
    flex: 1 1 100%;
  }

  .save-button-row {
    width: 100%;
  }

  .save-button {
    flex: 1 1 4.8em;
  }

  .batch-header {
    align-items: stretch;
    flex-direction: column;
  }

  .batch-roll-button {
    width: 100%;
  }

  .batch-header-actions {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .batch-group {
    flex-wrap: wrap;
  }

  .batch-damage-group {
    grid-column: 1 / -1;
  }
}
</style>
