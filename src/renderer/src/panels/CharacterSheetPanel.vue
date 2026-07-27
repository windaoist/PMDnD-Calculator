<script setup lang="ts">
import { computed } from 'vue'
import Creatures from '../model/Creature'
import { showHP } from '../model/Damage'

type CharacterPanelParams = {
  code?: string
}

type DockviewPanelProps = CharacterPanelParams & {
  params?: CharacterPanelParams
}

const props = defineProps<{ params?: DockviewPanelProps }>()

const creature = computed(() => {
  const code = props.params?.params?.code ?? props.params?.code
  if (!code) return null
  return Creatures.value.find((c) => c.code() === code) ?? null
})
</script>

<template>
  <div v-if="creature" style="padding: 0.5em; min-width: 220px; background: #fff; color: #333">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
      <div
        style="
          width: 48px;
          height: 48px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 20px;
          color: white;
        "
        :style="{
          backgroundColor:
            { 玩家: '#2196f3', 友方: '#4caf50', 中立: '#ff9800', 敌方: '#e53935' }[
              creature.faction
            ] ?? '#888'
        }"
      >
        {{ creature.name().substring(0, 2) }}
      </div>
      <div>
        <div style="font-weight: bold">{{ creature.name() }}</div>
        <div style="font-size: small; color: gray">{{ creature.faction }}</div>
      </div>
    </div>

    <div style="font-size: small">
      <div>HP: {{ showHP([creature.currentHP, creature.tempHP]) }} / {{ creature.maxHP() }}</div>
      <div>PP: {{ creature.currentPP }} / {{ creature.maxPP() }}</div>
      <div>移动力: {{ creature.currentMov }}</div>
      <label
        style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 6px;
          padding: 3px 7px;
          border-radius: 4px;
          background: #fff3cd;
          color: #6f5700;
          cursor: pointer;
        "
      >
        <input v-model="creature.concentrating" type="checkbox" />
        正在专注
      </label>
      <div style="margin-top: 4px; color: gray">
        物攻 {{ creature.getAttackAttributeByName('物攻') }} 特攻
        {{ creature.getAttackAttributeByName('特攻') }}
      </div>
      <div style="color: gray">
        物防 {{ creature.getAttackAttributeByName('物防') }} 特防
        {{ creature.getAttackAttributeByName('特防') }}
      </div>
      <div style="color: gray">速度 {{ creature.spd }}</div>
    </div>
  </div>
  <div v-else style="padding: 1em; color: gray">未选择角色</div>
</template>
