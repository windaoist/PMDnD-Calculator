<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import Creatures, { Creature } from '../model/Creature'
import { showHP as formatHP } from '../model/Damage'

const openPanel = inject('openPanel') as (
  component: string,
  id: string,
  title: string,
  params?: Record<string, unknown>
) => void
const centerOnToken = inject('centerOnToken') as (code: string) => void
const openStatusPanel = inject('openStatusPanel') as (code: string) => void

const creatures = ref<Creature[]>(Creatures.value)

const showCode = ref(true)
const showHP = ref(true)
const showPP = ref(true)
const showInitiative = ref(false)
const sortBy = ref<'name' | 'code' | 'faction' | 'initiative'>('name')
const filterFaction = ref<string>('全部')

const factionOrder: Record<string, number> = { 玩家: 0, 友方: 1, 中立: 2, 敌方: 3 }
const factionHpBg: Record<string, string> = {
  玩家: '#b3d9ff',
  友方: '#b3ffb3',
  中立: '#ffe0b3',
  敌方: '#ffb3b3'
}

const sortedCreatures = computed(() => {
  let list = [...creatures.value]
  if (filterFaction.value != '全部') {
    list = list.filter((c) => c.faction == filterFaction.value)
  }
  if (sortBy.value == 'name') {
    list.sort((a, b) => a.name().localeCompare(b.name(), 'zh-CN'))
  } else if (sortBy.value == 'code') {
    list.sort((a, b) => a.code().localeCompare(b.code(), 'en-US'))
  } else if (sortBy.value == 'initiative') {
    list.sort((a, b) => {
      const diff = b.initiative() + b.tempInitiative - (a.initiative() + a.tempInitiative)
      if (diff != 0) return diff
      return (factionOrder[a.faction] ?? 4) - (factionOrder[b.faction] ?? 4)
    })
  } else {
    list.sort((a, b) => (factionOrder[a.faction] ?? 4) - (factionOrder[b.faction] ?? 4))
  }
  return list
})

function hpTextColor(c: Creature): string {
  const pct = c.hpRatio()
  if (c.currentHP <= 0) return 'hsl(0, 100%, 50%)'
  return `hsl(${Math.max(0, Math.min(120, 120 * pct))}, 70%, 40%)`
}

function hpBarWidth(c: Creature): string {
  const pct = c.hpRatio() * 100
  return Math.max(0, Math.min(100, pct)) + '%'
}

function openCharacter(code: string): void {
  const c = Creatures.value.find((x) => x.code() == code)
  if (c && openPanel) {
    centerOnToken(code)
    openPanel('CharacterFullPanel', `char-${c.code()}`, c.name(), { code: c.code() })
  }
}

function openCharacterStatus(code: string): void {
  openStatusPanel?.(code)
}

function deleteCharacter(c: Creature): void {
  if (!window.confirm(`确定删除角色“${c.name()}”（${c.code()}）吗？`)) return
  const index = Creatures.value.findIndex((creature) => creature.code() == c.code())
  if (index >= 0) Creatures.value.splice(index, 1)
}
</script>

<template>
  <div
    style="
      height: 100%;
      min-width: 260px;
      min-height: 200px;
      display: flex;
      flex-direction: column;
      font-size: 13px;
      overflow: hidden;
    "
  >
    <div
      style="
        padding: 6px 8px;
        border-bottom: 1px solid #eee;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
        flex-shrink: 0;
      "
    >
      <label style="font-size: 11px; color: #666">
        <input type="checkbox" v-model="showCode" /> 代号
      </label>
      <label style="font-size: 11px; color: #666">
        <input type="checkbox" v-model="showHP" /> HP
      </label>
      <label style="font-size: 11px; color: #666">
        <input type="checkbox" v-model="showPP" /> PP
      </label>
      <label style="font-size: 11px; color: #666">
        <input type="checkbox" v-model="showInitiative" /> 先攻
      </label>
      <span style="font-size: 11px; color: #666">排序</span>
      <select v-model="sortBy" style="font-size: 11px; width: auto; padding: 1px">
        <option value="name">名字</option>
        <option value="code">代号</option>
        <option value="initiative">先攻</option>
        <option value="faction">阵营</option>
      </select>
      <span style="font-size: 11px; color: #666">筛选</span>
      <select v-model="filterFaction" style="font-size: 11px; width: auto; padding: 1px">
        <option value="全部">全部</option>
        <option value="玩家">玩家</option>
        <option value="友方">友方</option>
        <option value="中立">中立</option>
        <option value="敌方">敌方</option>
      </select>
    </div>
    <div style="flex: 1; overflow-y: auto; min-height: 0; padding: 4px 0">
      <div
        v-for="c in sortedCreatures"
        :key="c.code()"
        class="creature-row"
        style="cursor: pointer; position: relative; overflow: hidden"
        title="单击打开详情，右键打开状态管理"
        @click="openCharacter(c.code())"
        @contextmenu.prevent.stop="openCharacterStatus(c.code())"
      >
        <!-- HP 背景条 -->
        <div
          v-if="showHP"
          :style="{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: hpBarWidth(c),
            backgroundColor: factionHpBg[c.faction] ?? '#e0e0e0',
            opacity: 0.5
          }"
        />
        <div
          style="position: relative; padding: 3px 8px; display: flex; align-items: center; gap: 6px"
        >
          <span
            :style="{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor:
                { 玩家: '#2196f3', 友方: '#4caf50', 中立: '#f9a825', 敌方: '#e53935' }[c.faction] ??
                '#888'
            }"
          />
          <span style="font-weight: 500">{{ c.name() }}</span>
          <span v-if="showCode" style="font-size: 11px; color: #999">{{ c.code() }}</span>
          <span v-if="showInitiative" style="font-size: 11px; color: #666">
            {{ c.initiative() + c.tempInitiative }}
          </span>
          <span style="flex: 1" />
          <button
            type="button"
            class="delete-character-button"
            :aria-label="`删除角色 ${c.name()}`"
            :title="`删除角色 ${c.name()}`"
            @click.stop="deleteCharacter(c)"
          >
            删除
          </button>
          <span
            v-if="showHP"
            :style="{
              fontSize: '11px',
              color: hpTextColor(c),
              fontWeight: '600',
              marginRight: showPP ? '0' : '0'
            }"
          >
            {{ formatHP([c.currentHP, c.tempHP]) }}/{{ c.maxHP() }}
          </span>
          <span
            v-if="showPP"
            style="font-size: 11px; color: steelblue; min-width: 36px; text-align: right"
            >{{ c.currentPP }}</span
          >
        </div>
      </div>
    </div>
    <div
      style="
        padding: 4px 8px;
        font-size: 11px;
        color: #999;
        border-top: 1px solid #eee;
        flex-shrink: 0;
      "
    >
      共 {{ creatures.length }} 个角色
    </div>
  </div>
</template>

<style scoped>
.creature-row:hover {
  background: rgba(0, 0, 0, 0.03);
}

.delete-character-button {
  padding: 1px 6px;
  border: 1px solid #c62828;
  border-radius: 3px;
  background: #e53935;
  color: #fff;
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.delete-character-button:hover {
  background: #c62828;
}

.delete-character-button:focus-visible {
  outline: 2px solid rgba(198, 40, 40, 0.4);
  outline-offset: 1px;
}
</style>
