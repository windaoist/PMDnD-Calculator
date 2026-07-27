<script setup lang="ts">
import { toolsMemory, ToolsMemory } from '@renderer/model/GlobalMemory'
import { ref, computed } from 'vue'
import VueNumberInput from '@chenfengyuan/vue-number-input'

const memory = ref<ToolsMemory>(toolsMemory.value)

function craftCoef(level: number): number {
  return 0.8 + level / 100
}
function armorPower(armorCoef: number): number[] {
  let bonus = Math.floor((armorCoef * 1000 - 1000) * 0.2)
  let a = Math.floor(bonus / 2)
  return [bonus, a, bonus - a]
}

const craftCoefVal = computed(() => craftCoef(memory.value.craftLevel))
const armorClothing = computed(() => armorPower(craftCoefVal.value * 1.08))
const armorLight = computed(() => armorPower(craftCoefVal.value * 1.25))
const armorMedium = computed(() => armorPower(craftCoefVal.value * 1.5))
const armorHeavy = computed(() => armorPower(craftCoefVal.value * 1.8))
const armorCustom = computed(() => armorPower(craftCoefVal.value * memory.value.craftArmorCoef))
</script>

<template>
  <div class="panel-page">
    <div class="panel-field-grid">
      <div class="panel-field">
        <span class="panel-field-label">工匠等级</span>
        <vue-number-input
          v-model="memory.craftLevel"
          size="medium"
          inline
          center
          controls
          :step="10"
          :min="0"
        />
      </div>
      <div class="panel-field">
        <span class="panel-field-label">工匠系数</span>
        <div class="panel-result">{{ craftCoefVal.toFixed(1) }}</div>
      </div>
      <div class="panel-field">
        <span class="panel-field-label">武器初始威力</span>
        <vue-number-input
          v-model="memory.craftWeaponPower"
          size="medium"
          inline
          center
          controls
          :step="1"
          :min="0"
        />
      </div>
      <div class="panel-field">
        <span class="panel-field-label">工匠武器威力</span>
        <div class="panel-result">
          {{ Math.max(0, Math.floor(Math.sqrt(craftCoefVal) * memory.craftWeaponPower)) }}
        </div>
      </div>
      <div class="panel-field">
        <span class="panel-field-label">自定义防御系数基准</span>
        <vue-number-input
          v-model="memory.craftArmorCoef"
          size="medium"
          inline
          center
          controls
          :step="0.1"
          :min="0"
        />
      </div>
      <div class="panel-field">
        <span class="panel-field-label">自定义护甲</span>
        <div class="panel-result">
          共 {{ armorCustom[0] }}%，例 {{ armorCustom[1] }}% 物防 / {{ armorCustom[2] }}% 特防
        </div>
      </div>
    </div>

    <div class="armor-grid">
      <div class="panel-result">
        服装：共 {{ armorClothing[0] }}%，例 {{ armorClothing[1] }}% 物防 / {{ armorClothing[2] }}%
        特防
      </div>
      <div class="panel-result">
        轻甲：共 {{ armorLight[0] }}%，例 {{ armorLight[1] }}% 物防 / {{ armorLight[2] }}% 特防
      </div>
      <div class="panel-result">
        中甲：共 {{ armorMedium[0] }}%，例 {{ armorMedium[1] }}% 物防 / {{ armorMedium[2] }}% 特防
      </div>
      <div class="panel-result">
        重甲：共 {{ armorHeavy[0] }}%，例 {{ armorHeavy[1] }}% 物防 / {{ armorHeavy[2] }}% 特防
      </div>
    </div>
  </div>
</template>

<style scoped>
.armor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.55em;
  margin-top: 0.75em;
}
</style>
