<script setup lang="ts">
interface WorkbenchAction {
  label: string
  description: string
  action: string
  accent: string
  shortcut?: string
}

defineProps<{
  characterCount: number
  hasMap: boolean
}>()

defineEmits<{ select: [action: string] }>()

const primaryActions: WorkbenchAction[] = [
  {
    label: '施法与结算',
    description: '批量攻击、治疗与状态结算',
    action: 'panel-multi',
    accent: '#6d5bd0'
  },
  {
    label: '检定与豁免',
    description: '选择角色并完成批量检定',
    action: 'panel-survive',
    accent: '#2176ae',
    shortcut: 'Ctrl/⌘+3'
  },
  {
    label: '伤害详细编辑',
    description: '调整伤害组成、抗性与最终结果',
    action: 'panel-battle',
    accent: '#c85450'
  },
  {
    label: '角色列表',
    description: '导入、浏览并管理参战角色',
    action: 'panel-characters',
    accent: '#298267',
    shortcut: 'Ctrl/⌘+1'
  },
  {
    label: '先攻',
    description: '管理当前战斗的行动顺序',
    action: 'panel-initiative',
    accent: '#c37b24',
    shortcut: 'Ctrl/⌘+2'
  },
  {
    label: '状态管理',
    description: '查看并修改角色状态与效果',
    action: 'panel-status',
    accent: '#7b5b8c'
  }
]

const ruleActions: WorkbenchAction[] = [
  {
    label: '临时武器攻击及高空抛物',
    description: '临时武器与坠落伤害结算',
    action: 'panel-fall-damage',
    accent: '#557a95'
  },
  { label: '擒抱', description: '擒抱相关结算', action: 'panel-grapple', accent: '#557a95' },
  { label: '装备打造', description: '工匠装备打造', action: 'panel-crafting', accent: '#557a95' },
  { label: '休息', description: '短休与长休结算', action: 'panel-rest', accent: '#557a95' },
  { label: '种族值', description: '种族值标准化', action: 'panel-race-stats', accent: '#557a95' },
  {
    label: '天气背景场地',
    description: '天气、气候与全局场地环境',
    action: 'panel-weather',
    accent: '#557a95'
  },
  { label: '日历', description: '查看团内日期', action: 'panel-calendar', accent: '#557a95' }
]
</script>

<template>
  <main class="workbench">
    <header class="workbench-header">
      <div>
        <p class="eyebrow">PMDnD · DM TOOLKIT</p>
        <h1>计算器工作台</h1>
        <p class="intro">选择一个功能开始结算。所有工具会在当前工作区中以标签页打开。</p>
      </div>
      <div class="session-summary" aria-label="当前存档摘要">
        <div><strong>{{ characterCount }}</strong><span>角色</span></div>
        <div><strong>{{ hasMap ? '已就绪' : '空白' }}</strong><span>地图数据</span></div>
      </div>
    </header>

    <section aria-labelledby="core-tools-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">常用结算</p>
          <h2 id="core-tools-title">核心计算器</h2>
        </div>
        <span>面板可拖动、停靠或最小化</span>
      </div>
      <div class="primary-grid">
        <button
          v-for="item in primaryActions"
          :key="item.action"
          type="button"
          class="tool-card"
          :style="{ '--card-accent': item.accent }"
          @click="$emit('select', item.action)"
        >
          <span class="tool-card-mark" aria-hidden="true" />
          <span class="tool-card-content">
            <span class="tool-card-title">{{ item.label }}</span>
            <span class="tool-card-description">{{ item.description }}</span>
          </span>
          <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
          <span class="tool-card-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </section>

    <section aria-labelledby="rule-tools-title">
      <div class="section-heading section-heading--compact">
        <div>
          <p class="section-kicker">规则速查</p>
          <h2 id="rule-tools-title">辅助计算</h2>
        </div>
      </div>
      <div class="utility-grid">
        <button
          v-for="item in ruleActions"
          :key="item.action"
          type="button"
          class="utility-card"
          @click="$emit('select', item.action)"
        >
          <span class="utility-title">{{ item.label }}</span>
          <span>{{ item.description }}</span>
        </button>
      </div>
    </section>

    <section class="map-accessory" aria-labelledby="map-title">
      <div class="map-copy">
        <p class="section-kicker">可选功能</p>
        <h2 id="map-title">需要战术地图时再打开</h2>
        <p>地图、Token、迷雾和测距仍完整保留，但不会占用日常计算器工作区。</p>
      </div>
      <button type="button" class="map-button" @click="$emit('select', 'workspace-map')">
        打开地图
        <span aria-hidden="true">↗</span>
      </button>
    </section>
  </main>
</template>

<style scoped>
.workbench {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: auto;
  padding: clamp(28px, 5vw, 64px);
  color: #172033;
  background:
    radial-gradient(circle at 90% 0%, rgba(102, 82, 190, 0.12), transparent 32%),
    linear-gradient(145deg, #f8f9fc 0%, #f2f5f8 100%);
  user-select: text;
}

.workbench::before {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  opacity: 0.32;
  background-image: linear-gradient(rgba(37, 54, 78, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37, 54, 78, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
}

.workbench > * {
  position: relative;
  max-width: 1180px;
  margin-right: auto;
  margin-left: auto;
}

.workbench-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  margin-bottom: 46px;
}

.eyebrow,
.section-kicker {
  margin: 0 0 6px;
  color: #6652be;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 8px;
  font-size: clamp(32px, 4vw, 52px);
  font-weight: 720;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.intro {
  max-width: 620px;
  margin-bottom: 0;
  color: #647086;
  font-size: 15px;
}

.session-summary {
  display: flex;
  flex: 0 0 auto;
  gap: 1px;
  overflow: hidden;
  border: 1px solid rgba(29, 42, 62, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 8px 30px rgba(29, 42, 62, 0.06);
}

.session-summary div {
  display: grid;
  min-width: 104px;
  padding: 12px 16px;
}

.session-summary div + div {
  border-left: 1px solid rgba(29, 42, 62, 0.1);
}

.session-summary strong {
  font-size: 17px;
  font-weight: 700;
}

.session-summary span {
  color: #798397;
  font-size: 11px;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 16px;
}

.section-heading--compact {
  margin-top: 34px;
}

.section-heading h2,
.map-copy h2 {
  margin-bottom: 0;
  font-size: 20px;
  font-weight: 680;
  letter-spacing: -0.02em;
}

.section-heading > span {
  color: #8992a3;
  font-size: 12px;
}

.primary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.tool-card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 112px;
  align-items: flex-start;
  gap: 14px;
  padding: 20px;
  overflow: hidden;
  text-align: left;
  border: 1px solid rgba(30, 45, 68, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: inherit;
  cursor: pointer;
  box-shadow: 0 7px 24px rgba(33, 46, 68, 0.045);
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.tool-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--card-accent) 45%, transparent);
  box-shadow: 0 12px 28px rgba(33, 46, 68, 0.1);
}

.tool-card-mark {
  width: 10px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 5px;
  background: var(--card-accent);
  box-shadow: 0 5px 14px color-mix(in srgb, var(--card-accent) 28%, transparent);
}

.tool-card-content {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.tool-card-title,
.utility-title {
  font-size: 16px;
  font-weight: 680;
}

.tool-card-description,
.utility-card > span:last-child {
  color: #707b8f;
  font-size: 12px;
  line-height: 1.5;
}

.shortcut {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 6px;
  border: 1px solid rgba(30, 45, 68, 0.1);
  border-radius: 5px;
  color: #8b94a4;
  background: #f7f8fa;
  font-size: 9px;
}

.tool-card-arrow {
  position: absolute;
  right: 16px;
  bottom: 11px;
  color: var(--card-accent);
  font-size: 18px;
  transition: transform 160ms ease;
}

.tool-card:hover .tool-card-arrow {
  transform: translateX(3px);
}

.utility-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.utility-card {
  display: grid;
  min-height: 76px;
  align-content: center;
  gap: 3px;
  padding: 12px;
  text-align: left;
  border: 1px solid rgba(30, 45, 68, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.63);
  color: inherit;
  cursor: pointer;
}

.utility-card:hover {
  border-color: rgba(85, 122, 149, 0.5);
  background: #fff;
}

.utility-title {
  font-size: 13px;
}

.map-accessory {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  margin-top: 38px;
  padding: 24px 26px;
  border: 1px solid rgba(68, 58, 122, 0.14);
  border-radius: 16px;
  background: linear-gradient(105deg, rgba(242, 239, 255, 0.94), rgba(255, 255, 255, 0.78));
}

.map-copy p:last-child {
  margin: 7px 0 0;
  color: #70798c;
  font-size: 13px;
}

.map-button {
  display: inline-flex;
  min-width: 132px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 15px;
  border: 0;
  border-radius: 9px;
  background: #493c88;
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(73, 60, 136, 0.2);
}

.map-button:hover {
  background: #3d3274;
}

@media (max-width: 900px) {
  .primary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .utility-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .workbench-header,
  .map-accessory {
    align-items: stretch;
    flex-direction: column;
  }

  .session-summary {
    align-self: flex-start;
  }

  .primary-grid,
  .utility-grid {
    grid-template-columns: 1fr;
  }

  .section-heading > span {
    display: none;
  }
}
</style>
