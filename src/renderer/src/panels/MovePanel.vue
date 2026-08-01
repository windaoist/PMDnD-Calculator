<script setup lang="ts">
import {
  BattleMemory,
  battleMemory,
  battleMemoryHeal,
  battleMemoryStatus,
  currentMove,
  getAttackAdvantage,
  healDiceroll,
  moveMemory,
  spellModifierHeal,
  spellTypeStabHeal
} from '@renderer/model/GlobalMemory'
import { MoveMemory } from '@renderer/model/GlobalMemory'
import { damageAttackList, damageTypeList, modifierList, MovePower } from '@renderer/model/DataType'
import { ref, onUpdated, nextTick } from 'vue'
import { autoResize, toAdvantage, valueToColor } from '@renderer/utils'
import VueNumberInput from '@chenfengyuan/vue-number-input'

import {
  onChangeSelectedCreature,
  removeAttacker,
  removeDefender,
  battleLv,
  spellTypeStab,
  spellModifier,
  damageMdf,
  envTypeMdfTotal,
  envEffectIntensity,
  modifyWorldlineMemory,
  accuracyAdvance,
  attackDiceroll,
  attackDicerollPercentage,
  copyAttackMessageToClipboard,
  applyAttackResult,
  damageCalc,
  attackMessage,
  toggleEnableCT,
  toggleEnableMiss,
  rolld20,
  toggleEnableAccuracyAdvance,
  spellAttack,
  damageDefense,
  copyHealMessageToClipboard,
  healMessage,
  applyHealResult,
  healCalc,
  healDicerollPercentage,
  healMdf,
  rollHeald20,
  copyHealShieldMessageToClipboard,
  applyHealShieldResult,
  healShieldMessage,
  healShieldCalc,
  spellAttackHeal,
  spellAttackHealShield,
  battleLvStatus,
  damageDefenseStatus,
  damageMdfStatus,
  toggleStatusEnableCT,
  toggleStatusEnableMiss,
  rollStatusd20,
  statusDiceroll,
  statusDicerollPercentage,
  copyStatusMessageToClipboard,
  applyStatusResult,
  statusMessage,
  statusCalc,
  copyHealStatusMessageToClipboard,
  applyHealStatusResult,
  healStatusMessage,
  copyHealShieldStatusMessageToClipboard,
  applyHealShieldStatusResult,
  healShieldStatusMessage,
  copyNullMessageToClipboard,
  applyNullResult,
  nullMessage,
  toggleSurviveMemory,
  spellModifierStatus
} from '@renderer/model/GlobalMemory'
import BattleCharacterSidebar from '@renderer/components/BattleCharacterSidebar.vue'
import Creatures, { Creature } from '@renderer/model/Creature'

const thisCreatures = ref<Creature[]>(Creatures.value)
const memory = ref<BattleMemory>(battleMemory.value)
const movem = ref<MoveMemory>(moveMemory.value)
const memoryHeal = ref<BattleMemory>(battleMemoryHeal.value)
const memoryStatus = ref<BattleMemory>(battleMemoryStatus.value)

if (memory.value.attacker != null) {
  const index = thisCreatures.value.findIndex(
    (creature) => creature.code() == memory.value.attacker?.code()
  )
  if (index >= 0) {
    memory.value.attacker = thisCreatures.value[index]
    memory.value.attacker.shallowRefresh()
  } else {
    memory.value.attacker = null
  }
}

if (memory.value.defender != null) {
  const index = thisCreatures.value.findIndex(
    (creature) => creature.code() == memory.value.defender?.code()
  )
  if (index >= 0) {
    memory.value.defender = thisCreatures.value[index]
    memory.value.defender.shallowRefresh()
  } else {
    memory.value.defender = null
  }
}

function setCurrentMove(): void {
  let thisMoveName = memory.value.attacker?.name + currentMove().name

  movem.value.dcDelta = 0
  movem.value.selectedPowerIdx = Math.min(
    Math.max(0, movem.value.selectedPowerIdx),
    currentMove().powerList.length - 1
  )
  if (
    movem.value.selectedPowerIdx < 0 ||
    movem.value.selectedPowerIdx >= currentMove().powerList.length
  ) {
    return
  }
  const mov = currentMove()
  const pwr = mov.powerList[movem.value.selectedPowerIdx]

  let costPPOverride = mov.costPP
  let rgx = /([0-9]+)[Pp][Pp]/
  let res = rgx.exec(pwr.extra)
  if (res) {
    costPPOverride = Number(res[1])
  }

  // if (memory.value.defender == null) {
  //   return
  // }

  let elemTypeOverride = mov.elemType
  for (let i of damageTypeList) {
    if (pwr.extra.includes(i)) {
      elemTypeOverride = i
    }
  }

  let spellAttackOverride = pwr.psType == '物理' ? '物攻' : '特攻'
  for (let i of damageAttackList) {
    if (pwr.extra.includes(i)) {
      spellAttackOverride = i
    }
  }

  let spellModOverride = mov.castAbility
  for (let i of modifierList) {
    if (pwr.extra.includes(i)) {
      spellModOverride = i
    }
  }

  let advantageOverride: number | null = null
  const advMatch = pwr.extra.match(/([0-9]+)\s*优势/)
  const disMatch = pwr.extra.match(/([0-9]+)\s*劣势/)
  if (advMatch) {
    advantageOverride = Number(advMatch[1])
  } else if (disMatch) {
    advantageOverride = -Number(disMatch[1])
  }

  if (isNoPower() || memory.value.defender == null) {
    memory.value.attackType = 0
    movem.value.nullCostPP = costPPOverride
    return
  }

  let damageDefense = pwr.psType == '物理' ? '物防' : '特防'

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
    if (thisMoveName != movem.value.lastMoveName) {
      memoryStatus.value.damageMdfD = 0
      memoryStatus.value.dicerollD = 0
      memoryStatus.value.diceroll = 10
      memoryStatus.value.advantageDelta = advantageOverride ?? 0
      memoryStatus.value.rollHistory = [memoryStatus.value.diceroll]
    }
    memoryStatus.value.customDamage = 0
    memoryStatus.value.enableCT = 0
    memoryStatus.value.enableMiss = 0
    memoryStatus.value.enableAccuracyAdvance = 0
  } else if (damageTypeList.includes(pwr.elemType)) {
    if (memory.value.attacker == null) {
      return
    }
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
    if (thisMoveName != movem.value.lastMoveName) {
      memory.value.damageMdfD = 0
      memory.value.dicerollD = 0
      memory.value.diceroll = memory.value.defender.grandStatus().autoCrit ? 20 : 10
      memory.value.advantageDelta = advantageOverride ?? 0
      memory.value.rollHistory = [memory.value.diceroll]
    }
    memory.value.customDamage = 0
    memory.value.enableCT = 1
    memory.value.enableMiss = 1
    memory.value.enableAccuracyAdvance = 1
  } else {
    if (memory.value.attacker == null) {
      return
    }
    memory.value.attackType = 2
    memoryHeal.value.costPP = costPPOverride
    memoryHeal.value.battleLvD = 100 - memory.value.attacker.battleLv()
    memoryHeal.value.ctLimit = 20
    memoryHeal.value.spellName = mov.name
    memoryHeal.value.effect = pwr.power
    memoryHeal.value.spellType = elemTypeOverride
    memoryHeal.value.spellTypeStabD = 0
    memoryHeal.value.spellAttack = '特防'
    memoryHeal.value.spellAttackShield = '物防'
    for (let i of damageAttackList) {
      if (pwr.extra.includes(i)) {
        memoryHeal.value.spellAttack = i
        memoryHeal.value.spellAttackShield = i
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
    if (thisMoveName != movem.value.lastMoveName) {
      memoryHeal.value.damageMdfD = 0
      memoryHeal.value.dicerollD = 0
      memoryHeal.value.diceroll = 10
      memoryHeal.value.advantageDelta = advantageOverride ?? 0
      memoryHeal.value.rollHistory = [memoryHeal.value.diceroll]
    }
    memoryHeal.value.customDamage = 0
    memoryHeal.value.enableCT = 1
    memoryHeal.value.enableMiss = 0
    memoryHeal.value.enableAccuracyAdvance = 0
  }

  movem.value.lastMoveName = thisMoveName
}

function movePowerWheel(event: { preventDefault(): unknown; deltaY: number }): void {
  if (currentMove().powerList.length > 0) {
    if (event.deltaY < 0) {
      movem.value.selectedPowerIdx -= 1
    } else if (event.deltaY > 0) {
      movem.value.selectedPowerIdx += 1
    }
    movem.value.selectedPowerIdx = Math.min(
      Math.max(0, movem.value.selectedPowerIdx),
      currentMove().powerList.length - 1
    )
    setCurrentMove()
  }
  event.preventDefault()
}

function currentPower(): MovePower {
  return currentMove().powerList[movem.value.selectedPowerIdx]
}

function moveWheel(event: { preventDefault(): unknown; deltaY: number }): void {
  let movelist: string[] = memory.value.attacker?.getMoveInMemoryList() || []
  if (movelist.length > 0) {
    let index = movelist.indexOf(movem.value.selectedMove)
    if (event.deltaY < 0) {
      movem.value.selectedMove = movelist[Math.max(index - 1, 0)]
    } else if (event.deltaY > 0) {
      movem.value.selectedMove = movelist[Math.min(index + 1, movelist.length - 1)]
    }
    movem.value.selectedPowerIdx = 1
  } else {
    movem.value.selectedMove = ''
  }
  setCurrentMove()
  event.preventDefault()
}

function isNoPower(): boolean {
  return currentPower().message() == '无威力'
}

function currentDC(): number {
  if (memory.value.attacker == null) {
    return 10 + movem.value.dcDelta
  }
  return (
    memory.value.attacker.getMoveDC(currentMove().name) +
    movem.value.dcDelta +
    envEffectIntensity(currentMove().elemType, memory.value.attacker)
  )
}

function thisOnChangeSelectedCreature(code: string): void {
  onChangeSelectedCreature(code)
  setCurrentMove()
}

function thisRemoveAttacker(): void {
  removeAttacker()
  memory.value.attackType = 0
  setCurrentMove()
}

function thisRemoveDefender(): void {
  removeDefender()
  memory.value.attackType = 0
  setCurrentMove()
}

if (memory.value.attacker != null) {
  memory.value.attacker.shallowRefresh()
}
if (memory.value.defender != null) {
  memory.value.defender.shallowRefresh()
}

onUpdated(() => {
  nextTick(() => {
    document.querySelectorAll<HTMLTextAreaElement>('textarea[data-autosize]').forEach(autoResize)
  })
})
</script>

<template>
  <div class="move-panel">
    <BattleCharacterSidebar collapsible :on-change="thisOnChangeSelectedCreature" />
    <div class="move-panel-main">
      <div class="move-panel-header">
        <div class="w3-bar">
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.attacker != null }"
            style="width: 50%"
            @click="thisRemoveAttacker"
          >
            {{
              memory.attacker == null
                ? '未选择攻击方'
                : `攻击方：${memory.attacker.name()} ${memory.attacker.code()}`
            }}
          </button>
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.defender != null }"
            style="width: 50%"
            @click="thisRemoveDefender"
          >
            {{
              memory.defender == null
                ? '未选择防御方'
                : `防御方：${memory.defender.name()} ${memory.defender.code()}`
            }}
          </button>
        </div>

        <div class="w3-bar">
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.attackType == 1 }"
            style="width: 33.3%"
          >
            攻击
          </button>
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.attackType == 2 }"
            style="width: 33.3%"
          >
            治疗或护盾
          </button>
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.attackType == 3 }"
            style="width: 33.3%"
          >
            状态或自定义伤害
          </button>
        </div>
      </div>

      <div class="move-panel-content">
        <div v-if="memory.attacker != null">
          <div>
            <button class="w3-button w3-light-gray">{{ memory.attacker.name() }}</button> 要使用招式
            <input
              v-model="movem.selectedMove"
              class="w3-input"
              style="width: 12em"
              list="suggestions"
              @change="setCurrentMove()"
            />
            <datalist id="suggestions">
              <option
                v-for="name in memory.attacker.getMoveInMemoryList()"
                :key="name"
                :value="name"
              ></option>
            </datalist>
            <select
              v-model="movem.selectedMove"
              style="width: 10em"
              class="w3-select w3-border"
              @change="setCurrentMove()"
              @wheel="moveWheel"
            >
              <option
                v-for="name in memory.attacker.getMoveInMemoryList()"
                :key="name"
                :value="name"
              >
                {{ name }}
              </option>
            </select>
            ，消耗
            <vue-number-input
              v-if="memory.attackType == 0"
              v-model="movem.nullCostPP"
              size="small"
              inline
              center
              controls
              :step="15"
              :min="0"
            />
            <vue-number-input
              v-if="memory.attackType == 1"
              v-model="memory.costPP"
              size="small"
              inline
              center
              controls
              :step="15"
              :min="0"
            />
            <vue-number-input
              v-if="memory.attackType == 2"
              v-model="memoryHeal.costPP"
              size="small"
              inline
              center
              controls
              :step="15"
              :min="0"
            />
            <vue-number-input
              v-if="memory.attackType == 3"
              v-model="memoryStatus.costPP"
              size="small"
              inline
              center
              controls
              :step="15"
              :min="0"
            />
            PP
          </div>
          <div v-if="currentMove().name.length > 0">
            <div v-if="currentMove().inMemory.length <= 0" style="color: crimson">该招式未预备</div>
            <div v-if="currentMove().maxCharge > 0">
              次数剩余：{{ currentMove().chargeAt }} {{ currentMove().charge }} /
              {{ currentMove().maxCharge }}
            </div>
            <div>
              {{ currentMove().ring < 0 ? `动作` : `${currentMove().ring} 环` }}
              {{ currentMove().elemType }}
              {{ currentMove().castAbility }} | 施法资源：{{ currentMove().costs() }} | 施法距离：{{
                currentMove().castRange
              }}{{ currentMove().castRange.includes('*') ? '（受威胁）' : '' }}
            </div>
            <div>
              法术成分：{{ currentMove().components() }} | 持续时间：{{
                currentMove().concentration.length > 0 ? '专注，至多 ' : ''
              }}{{ currentMove().duration.length > 0 ? currentMove().duration : '立即' }}
            </div>
            <div v-if="currentMove().cooldown.length > 0">
              冷却回合：{{ currentMove().cooldown }}
            </div>
          </div>
          <div v-if="currentMove().name.length > 0">
            <div>
              选择威力：
              <select
                v-model="movem.selectedPowerIdx"
                style="width: 30em"
                class="w3-select w3-border"
                @change="setCurrentMove()"
                @wheel="movePowerWheel"
              >
                <option v-for="pwr in currentMove().powerList" :key="pwr.idx" :value="pwr.idx">
                  {{ pwr.message() }}
                </option>
              </select>
            </div>

            <div v-if="memory.attackType == 1">
              <p>
                攻击等级 {{ battleLv() }} | {{ memory.spellType }}：属性一致加成
                {{ spellTypeStab() }} |
                <button
                  class="w3-button w3-light-gray"
                  @click="memory.dicerollD += spellModifier()"
                >
                  {{ memory.spellMod }}：{{ spellModifier() }}
                </button>
                ，DC {{ memory.attacker.getMoveDC(currentMove().name) }} +
                <vue-number-input
                  v-model="movem.dcDelta"
                  size="small"
                  inline
                  center
                  controls
                  :step="1"
                />
              </p>
              <div v-if="memory.defender != null">
                <p>
                  {{ memory.spellAttack }} {{ spellAttack() }} {{ memory.damageDefense }}
                  {{ damageDefense() }}
                </p>
                <p class="battlepage-item">
                  伤害修正：{{
                    memory.defender.typeMdf(memory.damageType) +
                    memory.defender.typeMdf(memory.damageAspect) +
                    memory.defender.grandStatus().grandMdf
                  }}
                  <span
                    v-if="
                      envTypeMdfTotal(
                        [memory.damageType, memory.damageAspect],
                        memory.attacker,
                        memory.defender
                      ) != 0
                    "
                  >
                    + 环境
                    {{
                      envTypeMdfTotal(
                        [memory.damageType, memory.damageAspect],
                        memory.attacker,
                        memory.defender
                      ).toFixed(1)
                    }}
                  </span>
                  +
                  <vue-number-input
                    v-model="memory.damageMdfD"
                    size="medium"
                    inline
                    center
                    controls
                    :step="0.1"
                  />
                  =
                  <span
                    style="margin-top: 0.3em; font-size: larger; font-weight: bold"
                    :style="{ color: valueToColor(-damageMdf()) }"
                    >{{ damageMdf().toFixed(1) }}</span
                  >
                </p>
                <p class="battlepage-item">
                  招式掷骰
                  <button
                    class="w3-button"
                    :class="{ 'w3-black': !memory.enableCT }"
                    @click="toggleEnableCT"
                  >
                    {{ memory.enableCT ? '启用暴击' : '禁用暴击' }}
                  </button>
                  <vue-number-input
                    v-model="memory.ctLimit"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                    :min="1"
                    :max="20"
                  />
                  <button
                    class="w3-button"
                    :class="{ 'w3-black': !memory.enableMiss }"
                    @click="toggleEnableMiss"
                  >
                    {{ memory.enableMiss ? '启用大失败' : '禁用大失败' }}
                  </button>
                  <button
                    class="w3-button"
                    :class="{ 'w3-black': !memory.enableAccuracyAdvance }"
                    @click="toggleEnableAccuracyAdvance"
                  >
                    {{ memory.enableAccuracyAdvance ? '命中减值有效' : '命中减值无效' }}
                  </button>
                  优劣势
                  <vue-number-input
                    v-model="memory.advantageDelta"
                    size="small"
                    inline
                    center
                    controls
                    :step="1"
                  />
                  <button
                    class="w3-button"
                    :class="{ 'w3-red': memory.defender.grandStatus().autoCrit }"
                    @click="rolld20"
                  >
                    {{
                      memory.defender.grandStatus().autoCrit ? '自动暴击' : '投掷攻击掷骰'
                    }}</button
                  ><span
                    v-if="getAttackAdvantage(memory.spellMod) != 0"
                    class="battlepage-item"
                    :style="{
                      color: valueToColor(-getAttackAdvantage(memory.spellMod))
                    }"
                  >
                    {{ toAdvantage(getAttackAdvantage(memory.spellMod)) }} </span
                  >：
                </p>
                <p class="battlepage-item">
                  原始值
                  <vue-number-input
                    :model-value="memory.diceroll"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                    :min="1"
                    :max="20"
                    @update:model-value="(v: number) => modifyWorldlineMemory(memory, v)"
                  />
                  + 加值
                  <span
                    style="font-weight: bold; font-size: larger"
                    :style="{ color: valueToColor(-spellModifier()) }"
                    >{{ spellModifier() }}</span
                  >
                  + 命中
                  <span
                    style="font-weight: bold; font-size: larger"
                    :style="{ color: valueToColor(-accuracyAdvance()) }"
                    >{{ accuracyAdvance() }}</span
                  >
                  + 其他调整值
                  <vue-number-input
                    v-model="memory.dicerollD"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                  />
                  =
                  <span
                    class="w3-right"
                    style="margin-top: 0.3em; font-size: larger; font-weight: bold"
                    :style="{ color: valueToColor(-memory.dicerollD) }"
                    >{{ attackDiceroll() }} ({{ attackDicerollPercentage() }}%)</span
                  >
                </p>
                <p class="battlepage-item">
                  <a style="font-size: x-large">伤害：{{ damageCalc() }}</a>
                  <button class="w3-button w3-center" @click="copyAttackMessageToClipboard">
                    复制到剪贴板
                  </button>
                  <button class="w3-button w3-center w3-blue w3-right" @click="applyAttackResult">
                    应用更改
                  </button>
                </p>
                <textarea
                  data-autosize
                  style="width: 100%; height: calc(100vh - 43em); resize: none"
                  :value="attackMessage()"
                ></textarea>
              </div>
            </div>
            <div v-if="memory.attackType == 2">
              <p>
                {{ memoryHeal.spellType }}：属性一致加成 {{ spellTypeStabHeal() }} |
                <button
                  class="w3-button w3-light-gray"
                  @click="memoryHeal.dicerollD += spellModifierHeal()"
                >
                  {{ memoryHeal.spellMod }}：{{ spellModifierHeal() }}
                </button>
                ，DC
                {{ memory.attacker.getMoveDC(currentMove().name) }}
              </p>
              <div v-if="memory.defender != null">
                <p>
                  治疗：{{ memoryHeal.spellAttack }} {{ spellAttackHeal() }} | 护盾：{{
                    memoryHeal.spellAttackShield
                  }}
                  {{ spellAttackHealShield() }}
                </p>
                <p class="battlepage-item">
                  伤害修正：
                  <vue-number-input
                    v-model="memoryHeal.damageMdfD"
                    size="medium"
                    inline
                    center
                    controls
                    :step="0.1"
                  />
                  =
                  <span
                    style="margin-top: 0.3em; font-size: larger; font-weight: bold"
                    :style="{ color: valueToColor(-healMdf()) }"
                    >{{ healMdf().toFixed(1) }}</span
                  >
                </p>
                <p class="battlepage-item">
                  招式掷骰
                  <button
                    class="w3-button"
                    :class="{ 'w3-black': !memoryHeal.enableCT }"
                    @click="toggleEnableCT"
                  >
                    {{ memoryHeal.enableCT ? '启用暴击' : '禁用暴击' }}
                  </button>
                  <vue-number-input
                    v-model="memoryHeal.ctLimit"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                    :min="1"
                    :max="20"
                  />
                  <button
                    class="w3-button"
                    :class="{ 'w3-black': !memoryHeal.enableMiss }"
                    @click="toggleEnableMiss"
                  >
                    {{ memoryHeal.enableMiss ? '启用大失败' : '禁用大失败' }}
                  </button>
                  优劣势
                  <vue-number-input
                    v-model="memoryHeal.advantageDelta"
                    size="small"
                    inline
                    center
                    controls
                    :step="1"
                  />
                  <button class="w3-button" @click="rollHeald20">投掷攻击掷骰</button>：
                </p>
                <p class="battlepage-item">
                  原始值
                  <vue-number-input
                    :model-value="memoryHeal.diceroll"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                    :min="1"
                    :max="20"
                    @update:model-value="(v: number) => modifyWorldlineMemory(memoryHeal, v)"
                  />
                  + 加值
                  <span
                    style="font-weight: bold; font-size: larger"
                    :style="{ color: valueToColor(-spellModifierHeal()) }"
                    >{{ spellModifierHeal() }}</span
                  >
                  + 其他调整值
                  <vue-number-input
                    v-model="memoryHeal.dicerollD"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                  />
                  =
                  <span
                    class="w3-right"
                    style="margin-top: 0.3em; font-size: larger; font-weight: bold"
                    :style="{ color: valueToColor(-memoryHeal.dicerollD) }"
                    >{{ healDiceroll() }} ({{ healDicerollPercentage() }}%)</span
                  >
                </p>
                <div v-if="currentPower().elemType == '治疗'">
                  <p class="battlepage-item">
                    <a style="font-size: x-large">治疗：{{ healCalc() }}</a>
                    <button class="w3-button w3-center" @click="copyHealMessageToClipboard">
                      复制到剪贴板
                    </button>
                    <button
                      class="w3-button w3-center w3-right"
                      :class="{
                        'w3-red': memory.defender.currentHP != memory.defender.maxHP(),
                        'w3-blue': memory.defender.currentHP == memory.defender.maxHP()
                      }"
                      @click="applyHealResult"
                    >
                      应用更改
                    </button>
                  </p>

                  <textarea
                    data-autosize
                    style="width: 100%; height: calc(100vh - 43em); resize: none"
                    :value="healMessage()"
                  ></textarea>
                </div>
                <div v-if="currentPower().elemType == '护盾'">
                  <p class="battlepage-item">
                    <a style="font-size: x-large">获得护盾：{{ healShieldCalc() }}</a>
                    <button class="w3-button w3-center" @click="copyHealShieldMessageToClipboard">
                      复制到剪贴板
                    </button>
                    <label>
                      <input v-model="memoryHeal.stackShield" type="checkbox" /> 护盾叠加
                    </label>
                    <button
                      class="w3-button w3-center w3-red w3-right"
                      @click="applyHealShieldResult"
                    >
                      应用更改
                    </button>
                  </p>

                  <textarea
                    data-autosize
                    style="width: 100%; height: calc(100vh - 43em); resize: none"
                    :value="healShieldMessage()"
                  ></textarea>
                </div>
              </div>
            </div>

            <div v-if="memory.attackType == 3">
              <p>
                状态等级 {{ battleLvStatus() }} |
                <button
                  class="w3-button w3-light-gray"
                  @click="memoryStatus.dicerollD += spellModifierStatus()"
                >
                  {{ memoryStatus.spellMod }}：{{ spellModifierStatus() }}
                </button>
                ，DC
                {{ memory.attacker.getMoveDC(currentMove().name) }}
              </p>
              <div v-if="memory.defender != null">
                <p>无装备{{ memoryStatus.damageDefense }} {{ damageDefenseStatus() }}</p>
                <p>
                  伤害修正：{{
                    memory.defender.typeMdf(memoryStatus.damageType) +
                    memory.defender.typeMdf(memoryStatus.damageAspect)
                  }}
                  <span
                    v-if="
                      envTypeMdfTotal(
                        [memoryStatus.damageType, memoryStatus.damageAspect],
                        memory.attacker,
                        memory.defender
                      ) != 0
                    "
                  >
                    + 环境
                    {{
                      envTypeMdfTotal(
                        [memoryStatus.damageType, memoryStatus.damageAspect],
                        memory.attacker,
                        memory.defender
                      ).toFixed(1)
                    }}
                  </span>
                  +
                  <vue-number-input
                    v-model="memoryStatus.damageMdfD"
                    size="medium"
                    inline
                    center
                    controls
                    :step="0.1"
                  />
                  =
                  <span
                    v-if="memoryStatus.customDamage <= 0"
                    style="margin-top: 0.3em; font-size: larger; font-weight: bold"
                    :style="{ color: valueToColor(-damageMdfStatus()) }"
                  >
                    {{ damageMdfStatus().toFixed(1) }}</span
                  >
                </p>

                <p class="battlepage-item">
                  伤害掷骰
                  <button
                    class="w3-button"
                    :class="{ 'w3-black': !memoryStatus.enableCT }"
                    @click="toggleStatusEnableCT"
                  >
                    {{ memoryStatus.enableCT ? '启用暴击' : '禁用暴击' }}
                  </button>
                  <vue-number-input
                    v-model="memoryStatus.ctLimit"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                    :min="1"
                    :max="20"
                  />
                  <button
                    class="w3-button"
                    :class="{ 'w3-black': !memoryStatus.enableMiss }"
                    @click="toggleStatusEnableMiss"
                  >
                    {{ memoryStatus.enableMiss ? '启用大失败' : '禁用大失败' }}
                  </button>
                  优劣势
                  <vue-number-input
                    v-model="memoryStatus.advantageDelta"
                    size="small"
                    inline
                    center
                    controls
                    :step="1"
                  />
                  <button class="w3-button" @click="rollStatusd20">投掷伤害掷骰</button
                  >{{ memoryStatus.diceroll != 10 ? ' （* 状态的伤害掷骰一般总为 10）' : '' }}：
                </p>
                <p class="battlepage-item">
                  原始值
                  <vue-number-input
                    :model-value="memoryStatus.diceroll"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                    :min="1"
                    :max="20"
                    @update:model-value="(v: number) => modifyWorldlineMemory(memoryStatus, v)"
                  />
                  + 其他调整值
                  <vue-number-input
                    v-model="memoryStatus.dicerollD"
                    size="medium"
                    inline
                    center
                    controls
                    :step="1"
                  />
                  =
                  <span
                    class="w3-right"
                    style="margin-top: 0.3em; font-size: larger; font-weight: bold"
                    :style="{ color: valueToColor(-memoryStatus.dicerollD) }"
                  >
                    {{ statusDiceroll() }} ({{ statusDicerollPercentage() }}%)</span
                  >
                </p>

                <div v-if="currentPower().elemType != '治疗' && currentPower().elemType != '护盾'">
                  <p class="battlepage-item">
                    <a style="font-size: x-large">状态伤害：{{ statusCalc(false) }}</a>
                    <button class="w3-button w3-center" @click="copyStatusMessageToClipboard">
                      复制到剪贴板
                    </button>
                    <button class="w3-button w3-center w3-red w3-right" @click="applyStatusResult">
                      应用更改
                    </button>
                  </p>

                  <textarea
                    data-autosize
                    style="width: 100%; height: calc(100vh - 43em); resize: none"
                    :value="statusMessage()"
                  ></textarea>
                </div>

                <div v-if="currentPower().elemType == '治疗'">
                  <p class="battlepage-item">
                    <a style="font-size: x-large">治疗：{{ statusCalc(true) }}</a>
                    <button class="w3-button w3-center" @click="copyHealStatusMessageToClipboard">
                      复制到剪贴板
                    </button>
                    <button
                      class="w3-button w3-center w3-red w3-right"
                      @click="applyHealStatusResult"
                    >
                      应用更改
                    </button>
                  </p>

                  <textarea
                    data-autosize
                    style="width: 100%; height: calc(100vh - 43em); resize: none"
                    :value="healStatusMessage()"
                  ></textarea>
                </div>

                <div v-if="currentPower().elemType == '护盾'">
                  <p class="battlepage-item">
                    <a style="font-size: x-large">获得护盾：{{ statusCalc(true) }}</a>
                    <button
                      class="w3-button w3-center"
                      @click="copyHealShieldStatusMessageToClipboard"
                    >
                      复制到剪贴板
                    </button>
                    <label>
                      <input v-model="memoryStatus.stackShield" type="checkbox" /> 护盾叠加
                    </label>
                    <button
                      class="w3-button w3-center w3-red w3-right"
                      @click="applyHealShieldStatusResult"
                    >
                      应用更改
                    </button>
                  </p>

                  <textarea
                    data-autosize
                    style="width: 100%; height: calc(100vh - 43em); resize: none"
                    :value="healShieldStatusMessage()"
                  ></textarea>
                </div>
              </div>
            </div>

            <div v-if="memory.attackType == 0">
              <p class="battlepage-item">
                <button class="w3-button w3-center" @click="copyNullMessageToClipboard">
                  复制到剪贴板
                </button>
                <button class="w3-button w3-center w3-red w3-right" @click="applyNullResult">
                  应用更改
                </button>
              </p>

              <textarea
                data-autosize
                style="width: 100%; height: calc(100vh - 43em); resize: none"
                :value="nullMessage()"
              ></textarea>
            </div>

            <div>
              <button
                v-if="memory.defender != null && memory.attackType == 1"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="
                  toggleSurviveMemory(
                    memory.defender.code(),
                    '专注',
                    1,
                    memory.defender.concentrationSaveFromDamage(damageCalc())
                  )
                "
              >
                专注豁免 {{ memory.defender.concentrationSaveFromDamage(damageCalc()) }}
              </button>
              <button
                v-if="memory.defender != null && memory.attackType == 3"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="
                  toggleSurviveMemory(
                    memory.defender.code(),
                    '专注',
                    1,
                    memory.defender.concentrationSaveFromDamage(statusCalc(false))
                  )
                "
              >
                专注豁免 {{ memory.defender.concentrationSaveFromDamage(statusCalc(false)) }}
              </button>
              <button
                v-if="memory.defender != null"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="toggleSurviveMemory(memory.defender.code(), '力量', 1, currentDC())"
              >
                力量豁免 {{ currentDC() }}
              </button>
              <button
                v-if="memory.defender != null"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="toggleSurviveMemory(memory.defender.code(), '敏捷', 1, currentDC())"
              >
                敏捷豁免 {{ currentDC() }}
              </button>
              <button
                v-if="memory.defender != null"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="toggleSurviveMemory(memory.defender.code(), '体质', 1, currentDC())"
              >
                体质豁免 {{ currentDC() }}
              </button>
              <button
                v-if="memory.defender != null"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="toggleSurviveMemory(memory.defender.code(), '智力', 1, currentDC())"
              >
                智力豁免 {{ currentDC() }}
              </button>
              <button
                v-if="memory.defender != null"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="toggleSurviveMemory(memory.defender.code(), '感知', 1, currentDC())"
              >
                感知豁免 {{ currentDC() }}
              </button>
              <button
                v-if="memory.defender != null"
                class="w3-button w3-light-gray"
                style="width: 14%"
                @click="toggleSurviveMemory(memory.defender.code(), '魅力', 1, currentDC())"
              >
                魅力豁免 {{ currentDC() }}
              </button>
            </div>

            <p
              v-if="envEffectIntensity(memory.spellType, memory.attacker) != 0"
              class="battlepage-item"
              style="font-size: small; color: gray"
            >
              环境效应强度 {{ memory.spellType }}
              {{ envEffectIntensity(memory.spellType, memory.attacker) > 0 ? '+' : ''
              }}{{ envEffectIntensity(memory.spellType, memory.attacker) }}
            </p>

            <div style="display: flex; flex-direction: column">
              <textarea
                id="logs"
                v-model="currentMove().description"
                data-autosize
                spellcheck="false"
                style="
                  width: 100%;
                  height: calc(100vh - 28em);
                  resize: vertical;
                  box-sizing: border-box;
                "
              ></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.move-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  background: #fff;
  color: #222;
}

.move-panel-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.move-panel-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #eee;
}

.move-panel-content {
  padding: 0.6em;
}

.move-panel .w3-bar {
  display: flex;
  flex-wrap: wrap;
}

.move-panel .w3-bar .w3-button {
  flex: 1 1 160px;
  width: auto !important;
}

.move-panel .w3-button[style*='width'] {
  width: auto !important;
}

.move-panel :is(input, select, textarea) {
  max-width: 100%;
}

.move-panel :is(input, select)[style*='width'] {
  max-width: 100% !important;
}

.battlepage-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35em;
}

.move-panel .w3-right {
  float: none !important;
  margin-left: auto;
}
</style>
