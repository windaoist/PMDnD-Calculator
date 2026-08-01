<script setup lang="ts">
import {
  damageTypeList,
  damageAspectList,
  modifierList,
  damageAttackList,
  damageDefenseList
} from '@renderer/model/DataType'
import {
  battleMemory,
  BattleMemory,
  battleMemoryHeal,
  battleMemoryStatus,
  getAttackAdvantage,
  onChangeSelectedCreature
} from '@renderer/model/GlobalMemory'
import { ref, computed, onUpdated, nextTick } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'
import { autoResize, toAdvantage, valueToColor } from '@renderer/utils'

import {
  toggleSurviveMemory,
  removeAttacker,
  removeDefender,
  toggleAttackType,
  toggleDamageDef,
  battleLv,
  spellTypeStab,
  spellModifier,
  spellAttack,
  damageDefense,
  damageMdf,
  envTypeMdfTotal,
  envEffectIntensity,
  modifyWorldlineMemory,
  toggleEnableCT,
  toggleEnableMiss,
  toggleEnableAccuracyAdvance,
  rolld20,
  accuracyAdvance,
  attackDiceroll,
  attackDicerollPercentage,
  damageCalc,
  copyAttackMessageToClipboard,
  applyAttackResult,
  attackMessage,
  battleLvHeal,
  spellTypeStabHeal,
  spellModifierHeal,
  spellAttackHeal,
  spellAttackHealShield,
  healMdf,
  toggleHealEnableCT,
  toggleHealEnableMiss,
  rollHeald20,
  healDiceroll,
  healDicerollPercentage,
  healCalc,
  healShieldCalc,
  copyHealMessageToClipboard,
  applyHealResult,
  healMessage,
  copyHealShieldMessageToClipboard,
  applyHealShieldResult,
  healShieldMessage,
  toggleStatusDamageDef,
  battleLvStatus,
  damageDefenseStatus,
  damageMdfStatus,
  toggleStatusEnableCT,
  toggleStatusEnableMiss,
  rollStatusd20,
  statusMessage,
  statusDiceroll,
  statusDicerollPercentage,
  statusCalc,
  copyStatusMessageToClipboard,
  applyStatusResult,
  copyHealStatusMessageToClipboard,
  applyHealStatusResult,
  healStatusMessage,
  copyHealShieldStatusMessageToClipboard,
  applyHealShieldStatusResult,
  healShieldStatusMessage
} from '@renderer/model/GlobalMemory'
import BattleCharacterSidebar from '@renderer/components/BattleCharacterSidebar.vue'
import Creatures, { Creature } from '@renderer/model/Creature'

const thisCreatures = ref<Creature[]>(Creatures.value)
const memory = ref<BattleMemory>(battleMemory.value)
const memoryHeal = ref<BattleMemory>(battleMemoryHeal.value)
const memoryStatus = ref<BattleMemory>(battleMemoryStatus.value)

const damageResult = computed(() => damageCalc())
const healResult = computed(() => healCalc())
const healShieldResult = computed(() => healShieldCalc())
const statusDamageResult = computed(() => statusCalc(false))
const statusHealResult = computed(() => statusCalc(true))

if (memory.value.attacker != null) {
  const index = thisCreatures.value.findIndex(
    (creature) => creature.code() == memory.value.attacker?.code()
  )
  if (index >= 0) {
    memory.value.attacker = thisCreatures.value[index]
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
  } else {
    memory.value.defender = null
  }
}

function createWheelHandler<T>(
  getList: () => T[],
  getMemoryValue: () => T,
  setMemoryValue: (value: T) => void
): (event: { preventDefault(): void; deltaY: number }) => void {
  return (event: { preventDefault(): void; deltaY: number }) => {
    const list = getList()
    const currentValue = getMemoryValue()
    let index = list.indexOf(currentValue)

    if (event.deltaY < 0) {
      setMemoryValue(list[Math.max(index - 1, 0)])
    } else if (event.deltaY > 0) {
      setMemoryValue(list[Math.min(index + 1, list.length - 1)])
    }
    event.preventDefault()
  }
}

const damageTypeWheel = createWheelHandler(
  () => damageTypeList,
  () => memory.value.damageType,
  (val) => {
    memory.value.damageType = val
  }
)

const damageStatusTypeWheel = createWheelHandler(
  () => damageTypeList,
  () => memoryStatus.value.damageType,
  (val) => {
    memoryStatus.value.damageType = val
  }
)

const damageAspectWheel = createWheelHandler(
  () => damageAspectList,
  () => memory.value.damageAspect,
  (val) => {
    memory.value.damageAspect = val
  }
)

const damageStatusAspectWheel = createWheelHandler(
  () => damageAspectList,
  () => memoryStatus.value.damageAspect,
  (val) => {
    memoryStatus.value.damageAspect = val
  }
)

const spellTypeWheel = createWheelHandler(
  () => damageTypeList,
  () => memory.value.spellType,
  (val) => {
    memory.value.spellType = val
  }
)

const spellHealTypeWheel = createWheelHandler(
  () => damageTypeList,
  () => memoryHeal.value.spellType,
  (val) => {
    memoryHeal.value.spellType = val
  }
)

const spellModWheel = createWheelHandler(
  () => modifierList,
  () => memory.value.spellMod,
  (val) => {
    memory.value.spellMod = val
  }
)

const spellHealModWheel = createWheelHandler(
  () => modifierList,
  () => memoryHeal.value.spellMod,
  (val) => {
    memoryHeal.value.spellMod = val
  }
)

const spellAttackWheel = createWheelHandler(
  () => damageAttackList,
  () => memory.value.spellAttack,
  (val) => {
    memory.value.spellAttack = val
  }
)

const spellHealAttackWheel = createWheelHandler(
  () => damageAttackList,
  () => memoryHeal.value.spellAttack,
  (val) => {
    memoryHeal.value.spellAttack = val
  }
)

const spellHealShieldAttackWheel = createWheelHandler(
  () => damageAttackList,
  () => memoryHeal.value.spellAttackShield,
  (val) => {
    memoryHeal.value.spellAttackShield = val
  }
)

const damageDefenseWheel = createWheelHandler(
  () => damageDefenseList,
  () => memory.value.damageDefense,
  (val) => {
    memory.value.damageDefense = val
  }
)

const damageStatusDefenseWheel = createWheelHandler(
  () => damageDefenseList,
  () => memoryStatus.value.damageDefense,
  (val) => {
    memoryStatus.value.damageDefense = val
  }
)

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
  <div class="battle-panel">
    <BattleCharacterSidebar collapsible :on-change="onChangeSelectedCreature" />
    <div class="battle-panel-main">
      <div style="background-color: white; position: sticky; top: 0; z-index: 10">
        <div class="w3-bar">
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.attacker != null }"
            style="width: 50%"
            @click="removeAttacker"
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
            @click="removeDefender"
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
            @click="toggleAttackType(1)"
          >
            攻击
          </button>
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.attackType == 2 }"
            style="width: 33.3%"
            @click="toggleAttackType(2)"
          >
            治疗或护盾
          </button>
          <button
            class="w3-bar-item w3-button"
            :class="{ 'w3-black': memory.attackType == 3 }"
            style="width: 33.3%"
            @click="toggleAttackType(3)"
          >
            状态或自定义伤害
          </button>
        </div>
      </div>

      <div style="padding: 0.5em">
        <div v-if="memory.attackType == 1 && memory.attacker != null && memory.defender != null">
          <p class="battlepage-item">
            <button class="w3-button w3-light-gray">{{ memory.attacker.name() }}</button> 要对
            <button class="w3-button w3-light-gray">{{ memory.defender.name() }}</button> 使用招式
            <input v-model="memory.spellName" class="w3-input" style="width: 12em" />，消耗
            <vue-number-input
              v-model="memory.costPP"
              size="small"
              inline
              center
              controls
              :step="15"
              :min="0"
            />
            PP
          </p>
          <p class="battlepage-item">
            造成威力
            <vue-number-input
              v-model="memory.effect"
              size="medium"
              inline
              center
              controls
              :min="1"
              :step="5"
            />
            的
            <select
              v-model="memory.damageType"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="damageTypeWheel"
            >
              <option v-for="name in damageTypeList" :key="name" :value="name">
                {{ name }}
              </option></select
            ><button
              class="w3-button"
              :class="{ 'w3-black': memory.damageDef == '特殊' }"
              @click="toggleDamageDef"
            >
              {{ memory.damageDef }}
            </button>
            <select
              v-model="memory.damageAspect"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="damageAspectWheel"
            >
              <option v-for="name in damageAspectList" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            伤害

            <span class="w3-right" style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              >威力 {{ memory.effect }}</span
            >
          </p>
          <br />
          <p class="battlepage-item">
            攻击等级 {{ memory.attacker.battleLv() }} +
            <vue-number-input
              v-model="memory.battleLvD"
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
              :style="{ color: valueToColor(-memory.battleLvD) }"
              >攻击等级 {{ battleLv() }}</span
            >
          </p>
          <p class="battlepage-item">
            招式属性
            <select
              v-model="memory.spellType"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="spellTypeWheel"
            >
              <option v-for="name in damageTypeList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：属性一致加成 = {{ memory.attacker.typeStab(memory.spellType) }} +
            <vue-number-input
              v-model="memory.spellTypeStabD"
              size="medium"
              inline
              center
              controls
              :step="5"
            />
            =
            <span
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-spellTypeStab()) }"
              >属性一致加成 {{ spellTypeStab() }}</span
            >
          </p>
          <p class="battlepage-item">
            招式加值
            <select
              v-model="memory.spellMod"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="spellModWheel"
            >
              <option v-for="name in modifierList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：{{ memory.attacker.getModifierByName(memory.spellMod) }} +
            <vue-number-input
              v-model="memory.spellModD"
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
              :style="{ color: valueToColor(-spellModifier()) }"
            >
              招式加值 {{ spellModifier() }}</span
            >
          </p>
          <p class="battlepage-item">
            使用数值
            <select
              v-model="memory.spellAttack"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="spellAttackWheel"
            >
              <option v-for="name in damageAttackList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：{{ memory.attacker.getAttackAttributeByName(memory.spellAttack) }} +
            <vue-number-input
              v-model="memory.spellAttackD"
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
              :style="{ color: valueToColor(-memory.spellAttackD) }"
            >
              攻击方攻击数值 {{ spellAttack() }}</span
            >
          </p>
          <br />

          <p class="battlepage-item">
            防御数值
            <select
              v-model="memory.damageDefense"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="damageDefenseWheel"
            >
              <option v-for="name in damageDefenseList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：{{ memory.defender.getAttributeByName(memory.damageDefense) }} +
            <vue-number-input
              v-model="memory.damageDefenseD"
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
              :style="{ color: valueToColor(-memory.damageDefenseD) }"
              >防御方防御数值 {{ damageDefense() }}</span
            >
          </p>
          <p class="battlepage-item">
            {{ memory.defender.name() }}对于{{ memory.damageType
            }}{{ memory.damageAspect == '无性相' ? '' : memory.damageAspect }}的伤害修正：{{
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
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-damageMdf()) }"
              >伤害修正 {{ damageMdf().toFixed(1) }}</span
            >
          </p>
          <p
            v-if="envEffectIntensity(memory.spellType, memory.attacker) != 0"
            class="battlepage-item"
            style="font-size: small; color: gray"
          >
            环境效应强度 {{ memory.spellType }}
            {{ envEffectIntensity(memory.spellType, memory.attacker) > 0 ? '+' : ''
            }}{{ envEffectIntensity(memory.spellType, memory.attacker) }}
          </p>
          <br />
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
              {{ memory.defender.grandStatus().autoCrit ? '自动暴击' : '投掷攻击掷骰' }}
            </button>
            <span
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

          <br />
          <p class="battlepage-item">
            <a style="font-size: x-large">伤害：{{ damageResult }}</a>
            <button class="w3-button w3-center" @click="copyAttackMessageToClipboard">
              复制到剪贴板
            </button>
            <button class="w3-button w3-center w3-blue w3-right" @click="applyAttackResult">
              应用更改
            </button>
          </p>

          <textarea
            data-autosize
            style="width: 100%; height: 8em; resize: vertical"
            :value="attackMessage()"
          ></textarea>

          <p class="battlepage-item">
            {{ memory.defender.name() }}的专注豁免难度为
            {{ memory.defender.concentrationSaveFromDamage(damageResult) }}。
            <button
              class="w3-button w3-center"
              @click="
                toggleSurviveMemory(
                  memory.defender.code(),
                  '专注',
                  1,
                  memory.defender.concentrationSaveFromDamage(damageResult)
                )
              "
            >
              设置专注豁免
            </button>
          </p>
        </div>

        <div v-if="memory.attackType == 2 && memory.attacker != null && memory.defender != null">
          <p class="battlepage-item">
            <button class="w3-button w3-light-gray">{{ memory.attacker.name() }}</button> 要对
            <button class="w3-button w3-light-gray">{{ memory.defender.name() }}</button> 使用招式
            <input v-model="memoryHeal.spellName" class="w3-input" style="width: 12em" />，消耗
            <vue-number-input
              v-model="memoryHeal.costPP"
              size="small"
              inline
              center
              controls
              :step="15"
              :min="0"
            />
            PP
          </p>

          <p class="battlepage-item">
            造成威力
            <vue-number-input
              v-model="memoryHeal.effect"
              size="medium"
              inline
              center
              controls
              :min="1"
              :step="5"
            />
            的回复

            <span class="w3-right" style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              >威力 {{ memoryHeal.effect }}</span
            >
          </p>
          <br />
          <p class="battlepage-item">
            治疗等级 {{ memory.attacker.battleLv() }} +
            <vue-number-input
              v-model="memoryHeal.battleLvD"
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
              :style="{
                color: valueToColor(100 - memory.attacker.battleLv() - memoryHeal.battleLvD)
              }"
            >
              治疗等级 {{ battleLvHeal() }}</span
            >
          </p>
          <p class="battlepage-item">
            招式属性
            <select
              v-model="memoryHeal.spellType"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="spellHealTypeWheel"
            >
              <option v-for="name in damageTypeList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：属性一致加成 = {{ memory.attacker.typeStab(memoryHeal.spellType) }} +
            <vue-number-input
              v-model="memoryHeal.spellTypeStabD"
              size="medium"
              inline
              center
              controls
              :step="5"
            />
            =
            <span
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-spellTypeStabHeal()) }"
            >
              属性一致加成 {{ spellTypeStabHeal() }}</span
            >
          </p>
          <p class="battlepage-item">
            招式加值
            <select
              v-model="memoryHeal.spellMod"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="spellHealModWheel"
            >
              <option v-for="name in modifierList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：{{ memory.attacker.getModifierByName(memoryHeal.spellMod) }} +
            <vue-number-input
              v-model="memoryHeal.spellModD"
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
              :style="{ color: valueToColor(-spellModifierHeal()) }"
            >
              招式加值 {{ spellModifierHeal() }}</span
            >
          </p>

          <p class="battlepage-item">
            治疗使用数值
            <select
              v-model="memoryHeal.spellAttack"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="spellHealAttackWheel"
            >
              <option v-for="name in damageAttackList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：{{ memory.attacker.getAttackAttributeByName(memoryHeal.spellAttack) }} +
            <vue-number-input
              v-model="memoryHeal.spellAttackD"
              size="medium"
              inline
              center
              controls
              :step="1"
            />
            = {{ memoryHeal.spellAttack != '特防' ? '（* 治疗一般是特防）' : '' }}

            <span
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-memoryHeal.spellAttackD) }"
            >
              治疗方治疗数值 {{ spellAttackHeal() }}</span
            >
          </p>
          <p class="battlepage-item">
            护盾使用数值
            <select
              v-model="memoryHeal.spellAttackShield"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="spellHealShieldAttackWheel"
            >
              <option v-for="name in damageAttackList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：{{ memory.attacker.getAttackAttributeByName(memoryHeal.spellAttackShield) }} +
            <vue-number-input
              v-model="memoryHeal.spellAttackShieldD"
              size="medium"
              inline
              center
              controls
              :step="1"
            />
            = {{ memoryHeal.spellAttackShield != '物防' ? '（* 护盾一般是物防）' : '' }}

            <span
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-memoryHeal.spellAttackShieldD) }"
            >
              护盾数值 {{ spellAttackHealShield() }}</span
            >
          </p>
          <p class="battlepage-item">
            治疗修正：
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
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-healMdf()) }"
            >
              治疗修正 {{ healMdf().toFixed(1) }}</span
            >
          </p>
          <br />
          <p class="battlepage-item">
            招式掷骰
            <button
              class="w3-button"
              :class="{ 'w3-black': !memoryHeal.enableCT }"
              @click="toggleHealEnableCT"
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
              @click="toggleHealEnableMiss"
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
            <button class="w3-button" @click="rollHeald20">投掷治疗掷骰</button>：
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
            >
              {{ healDiceroll() }} ({{ healDicerollPercentage() }}%)</span
            >
          </p>
          <br />
          <p class="battlepage-item">
            <a style="font-size: x-large">治疗：{{ healResult }}</a>
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
            style="width: 100%; height: 8em; resize: vertical"
            :value="healMessage()"
          ></textarea>
          <br />
          <p class="battlepage-item">
            <a style="font-size: x-large">获得护盾：{{ healShieldResult }}</a>
            <button class="w3-button w3-center" @click="copyHealShieldMessageToClipboard">
              复制到剪贴板
            </button>
            护盾的来源只能有一个
            <button class="w3-button w3-center w3-red w3-right" @click="applyHealShieldResult">
              应用更改
            </button>
          </p>

          <textarea
            data-autosize
            style="width: 100%; height: 8em; resize: vertical"
            :value="healShieldMessage()"
          ></textarea>
        </div>

        <div v-if="memory.attackType == 3 && memory.defender != null">
          <p class="battlepage-item">
            <button class="w3-button w3-light-gray">{{ memory.defender.name() }}</button> 受到了来自
            <input v-model="memoryStatus.spellName" class="w3-input" style="width: 12em" />
            的伤害，攻击方消耗
            <vue-number-input
              v-model="memoryStatus.costPP"
              size="small"
              inline
              center
              controls
              :step="15"
              :min="0"
            />
            PP
          </p>
          <p class="battlepage-item">
            受到威力
            <vue-number-input
              v-model="memoryStatus.effect"
              size="medium"
              inline
              center
              controls
              :min="1"
              :step="5"
            />
            的
            <select
              v-model="memoryStatus.damageType"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="damageStatusTypeWheel"
            >
              <option v-for="name in damageTypeList" :key="name" :value="name">
                {{ name }}
              </option></select
            ><button
              class="w3-button"
              :class="{ 'w3-black': memoryStatus.damageDef == '特殊' }"
              @click="toggleStatusDamageDef"
            >
              {{ memoryStatus.damageDef }}
            </button>
            <select
              v-model="memoryStatus.damageAspect"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="damageStatusAspectWheel"
            >
              <option v-for="name in damageAspectList" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            伤害

            <span class="w3-right" style="margin-top: 0.3em; font-size: larger; font-weight: bold">
              威力 {{ memoryStatus.effect }}</span
            >
          </p>
          <p class="battlepage-item">
            自定义数值：<vue-number-input
              v-model="memoryStatus.customDamage"
              size="medium"
              inline
              center
              controls
              :step="1"
              :min="0"
            />

            <button
              v-if="memoryStatus.customDamage > 0"
              class="w3-button w3-black"
              @click="memoryStatus.customDamage = 0"
            >
              {{ '应用自定义数值中' }}
            </button>

            <span
              v-if="memoryStatus.customDamage > 0"
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
            >
              自定义数值 {{ memoryStatus.customDamage }}</span
            >
          </p>
          <p class="battlepage-item">
            状态等级 {{ memory.defender.battleLv() }} +
            <vue-number-input
              v-model="memoryStatus.battleLvD"
              size="medium"
              inline
              center
              controls
              :step="1"
            />
            =
            <span
              v-if="memoryStatus.customDamage <= 0"
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-memoryStatus.battleLvD) }"
            >
              状态等级 {{ battleLvStatus() }}</span
            >
          </p>
          <p class="battlepage-item">
            无装备防御数值
            <select
              v-model="memoryStatus.damageDefense"
              style="width: 5em"
              class="w3-select w3-border"
              @wheel="damageStatusDefenseWheel"
            >
              <option v-for="name in damageDefenseList" :key="name" :value="name">
                {{ name }}
              </option></select
            >：{{ memory.defender.getAttackAttributeByName(memoryStatus.damageDefense) }} +
            <vue-number-input
              v-model="memoryStatus.damageDefenseD"
              size="medium"
              inline
              center
              controls
              :step="1"
            />
            =
            <span
              v-if="memoryStatus.customDamage <= 0"
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-memoryStatus.damageDefenseD) }"
            >
              防御方防御数值 {{ damageDefenseStatus() }}</span
            >
          </p>
          <p class="battlepage-item">
            {{ memory.defender.name() }}对于{{ memoryStatus.damageType
            }}{{
              memoryStatus.damageAspect == '无性相' ? '' : memoryStatus.damageAspect
            }}的伤害修正：{{
              memory.defender.typeMdf(memoryStatus.damageType) +
              memory.defender.typeMdf(memoryStatus.damageAspect) +
              memory.defender.grandStatus().grandMdf
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
              class="w3-right"
              style="margin-top: 0.3em; font-size: larger; font-weight: bold"
              :style="{ color: valueToColor(-damageMdfStatus()) }"
            >
              伤害修正 {{ damageMdfStatus().toFixed(1) }}</span
            >
          </p>
          <br />
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
          <p class="battlepage-item">
            <a style="font-size: x-large">状态伤害：{{ statusDamageResult }}</a>
            <button class="w3-button w3-center" @click="copyStatusMessageToClipboard">
              复制到剪贴板
            </button>
            <button class="w3-button w3-center w3-red w3-right" @click="applyStatusResult">
              应用更改
            </button>
          </p>

          <textarea
            data-autosize
            style="width: 100%; height: 8em; resize: vertical"
            :value="statusMessage()"
          ></textarea>

          <p class="battlepage-item">
            {{ memory.defender.name() }}的专注豁免难度为
            {{ memory.defender.concentrationSaveFromDamage(statusDamageResult) }}。
            <button
              class="w3-button w3-center"
              @click="
                toggleSurviveMemory(
                  memory.defender.code(),
                  '专注',
                  1,
                  memory.defender.concentrationSaveFromDamage(statusDamageResult)
                )
              "
            >
              设置专注豁免
            </button>
          </p>

          <p class="battlepage-item">
            <a style="font-size: x-large">治疗：{{ statusHealResult }}</a>
            <button class="w3-button w3-center" @click="copyHealStatusMessageToClipboard">
              复制到剪贴板
            </button>
            <button class="w3-button w3-center w3-red w3-right" @click="applyHealStatusResult">
              应用更改
            </button>
          </p>

          <textarea
            data-autosize
            style="width: 100%; height: 8em; resize: vertical"
            :value="healStatusMessage()"
          ></textarea>
          <p class="battlepage-item">
            <a style="font-size: x-large">获得护盾：{{ statusHealResult }}</a>
            <button class="w3-button w3-center" @click="copyHealShieldStatusMessageToClipboard">
              复制到剪贴板
            </button>
            <button
              class="w3-button w3-center w3-red w3-right"
              @click="applyHealShieldStatusResult"
            >
              应用更改
            </button>
          </p>

          <textarea
            data-autosize
            style="width: 100%; height: 8em; resize: vertical"
            :value="healShieldStatusMessage()"
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.battle-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  background: #fff;
  color: #222;
}

.battle-panel-main {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  min-width: 0;
  background: #fff;
}

.battle-panel .w3-bar {
  display: flex;
  flex-wrap: wrap;
}

.battle-panel .w3-bar .w3-button {
  flex: 1 1 160px;
  width: auto !important;
}

.battle-panel :is(input, select, textarea) {
  max-width: 100%;
}

.battle-panel :is(input, select)[style*='width'] {
  max-width: 100% !important;
}

.battlepage-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35em;
}
</style>
