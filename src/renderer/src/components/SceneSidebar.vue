<script setup lang="ts">
import { ref } from 'vue'

export interface SidebarItem {
  label: string
  shortcut?: string
  action?: string
  separator?: boolean
  disabled?: boolean
  children?: SidebarItem[]
}

export interface SidebarGroup {
  label: string
  shortcut?: string
  action?: string
  items?: SidebarItem[]
}

const props = defineProps<{
  groups: SidebarGroup[]
  homeLabel: string
  homeActive: boolean
  openedActions: ReadonlySet<string>
  activeAction: string
}>()

const emit = defineEmits<{ select: [action: string] }>()
const expanded = ref(localStorage.getItem('scene-sidebar-expanded') != 'false')
const openGroups = ref(new Set<string>())

const groupIcons: Record<string, string> = {
  编辑: '✎',
  角色: '♟',
  战斗: '⚔',
  检定: '✓',
  场景: '▧',
  工具: '⌘',
  关于: 'i',
  存档: '▣'
}

function toggleExpanded(): void {
  expanded.value = !expanded.value
  localStorage.setItem('scene-sidebar-expanded', String(expanded.value))
}

function selectGroup(group: SidebarGroup): void {
  if (group.action) {
    emit('select', group.action)
    return
  }
  if (!expanded.value) {
    toggleExpanded()
    openGroups.value.add(group.label)
    return
  }
  if (openGroups.value.has(group.label)) openGroups.value.delete(group.label)
  else openGroups.value.add(group.label)
}

function selectItem(item: SidebarItem): void {
  if (!item.disabled && item.action) emit('select', item.action)
}

function actionIsOpened(action?: string): boolean {
  return !!action && props.openedActions.has(action)
}

function actionIsActive(action?: string): boolean {
  return !!action && props.activeAction == action
}

function itemIsOpened(item: SidebarItem): boolean {
  return actionIsOpened(item.action) || !!item.children?.some(itemIsOpened)
}

function itemIsActive(item: SidebarItem): boolean {
  return actionIsActive(item.action) || !!item.children?.some(itemIsActive)
}

function groupIsOpened(group: SidebarGroup): boolean {
  return actionIsOpened(group.action) || !!group.items?.some(itemIsOpened)
}

function groupIsActive(group: SidebarGroup): boolean {
  return actionIsActive(group.action) || !!group.items?.some(itemIsActive)
}
</script>

<template>
  <aside class="scene-sidebar" :class="{ 'scene-sidebar--collapsed': !expanded }">
    <div class="sidebar-header">
      <div v-if="expanded" class="sidebar-brand">
        <span class="sidebar-brand-mark">K</span>
        <span class="sidebar-brand-copy">
          <strong>PMDnD计算器</strong>
          <small>DM 控制台</small>
        </span>
      </div>
      <button
        type="button"
        class="sidebar-collapse"
        :title="expanded ? '半隐藏侧栏' : '展开侧栏'"
        :aria-label="expanded ? '半隐藏侧栏' : '展开侧栏'"
        @click="toggleExpanded"
      >
        {{ expanded ? '‹' : '›' }}
      </button>
    </div>

    <nav class="sidebar-scroll" aria-label="主导航">
      <div class="sidebar-primary">
        <button
          type="button"
          class="sidebar-primary-button"
          :class="{ active: homeActive }"
          :title="homeLabel"
          @click="emit('select', 'workspace-home')"
        >
          <span class="sidebar-icon" aria-hidden="true">⌂</span>
          <span v-if="expanded" class="sidebar-label">{{ homeLabel }}</span>
        </button>
      </div>

      <section v-for="group in groups" :key="group.label" class="sidebar-group">
        <button
          type="button"
          class="sidebar-group-heading"
          :class="{
            'sidebar-group-heading--action': group.action,
            opened: groupIsOpened(group),
            active: groupIsActive(group)
          }"
          :title="group.shortcut ? `${group.label}（${group.shortcut}）` : group.label"
          :aria-expanded="group.items?.length ? openGroups.has(group.label) : undefined"
          @click="selectGroup(group)"
        >
          <span class="sidebar-icon" aria-hidden="true">{{ groupIcons[group.label] ?? '•' }}</span>
          <span v-if="expanded" class="sidebar-label">{{ group.label }}</span>
          <span v-if="expanded && group.shortcut" class="sidebar-shortcut">{{ group.shortcut }}</span>
          <span
            v-if="expanded && group.items?.length"
            class="sidebar-group-chevron"
            :class="{ open: openGroups.has(group.label) }"
            aria-hidden="true"
          >›</span>
        </button>

        <div
          v-if="expanded && group.items?.length && openGroups.has(group.label)"
          class="sidebar-items"
        >
          <template v-for="(item, index) in group.items" :key="`${group.label}-${index}`">
            <div v-if="item.separator" class="sidebar-separator" />
            <details v-else-if="item.children?.length" class="sidebar-nested">
              <summary
                :class="{
                  disabled: item.disabled,
                  opened: itemIsOpened(item),
                  active: itemIsActive(item)
                }"
              >
                <span>{{ item.label }}</span>
                <span class="sidebar-item-meta">
                  <span v-if="item.shortcut" class="sidebar-shortcut">{{ item.shortcut }}</span>
                  <span class="sidebar-chevron">›</span>
                </span>
              </summary>
              <button
                v-for="(child, childIndex) in item.children"
                :key="childIndex"
                type="button"
                class="sidebar-child-item"
                :class="{ opened: itemIsOpened(child), active: itemIsActive(child) }"
                :disabled="child.disabled"
                :aria-current="itemIsActive(child) ? 'page' : undefined"
                :title="child.shortcut ? `${child.label}（${child.shortcut}）` : child.label"
                @click="selectItem(child)"
              >
                <span>{{ child.label }}</span>
                <span v-if="child.shortcut" class="sidebar-shortcut">{{ child.shortcut }}</span>
              </button>
            </details>
            <button
              v-else
              type="button"
              class="sidebar-item"
              :class="{ opened: itemIsOpened(item), active: itemIsActive(item) }"
              :disabled="item.disabled"
              :aria-current="itemIsActive(item) ? 'page' : undefined"
              :title="item.shortcut ? `${item.label}（${item.shortcut}）` : item.label"
              @click="selectItem(item)"
            >
              <span>{{ item.label }}</span>
              <span v-if="item.shortcut" class="sidebar-shortcut">{{ item.shortcut }}</span>
            </button>
          </template>
        </div>
      </section>
    </nav>
  </aside>
</template>

<style scoped>
.scene-sidebar {
  position: relative;
  z-index: 50;
  display: flex;
  flex: 0 0 244px;
  width: 244px;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #d9dde7;
  background: linear-gradient(180deg, #f8f9fc 0%, #f2f4f8 100%);
  box-shadow: 2px 0 12px rgba(25, 34, 50, 0.07);
  color: #293246;
  transition: width 160ms ease, flex-basis 160ms ease;
  -webkit-app-region: no-drag;
}

.scene-sidebar--collapsed {
  flex-basis: 58px;
  width: 58px;
}

.sidebar-header {
  display: flex;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 8px 8px 12px;
  border-bottom: 1px solid #e1e4eb;
}

.scene-sidebar--collapsed .sidebar-header {
  justify-content: center;
  padding: 9px 8px 8px;
}

.sidebar-brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.sidebar-brand-mark {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 9px;
  background: #54459b;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 4px 10px rgba(84, 69, 155, 0.24);
}

.sidebar-brand-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.15;
}

.sidebar-brand-copy strong {
  font-size: 14px;
  white-space: nowrap;
}

.sidebar-brand-copy small {
  margin-top: 3px;
  color: #81899a;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.sidebar-collapse {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  padding: 0;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  font-size: 23px;
  cursor: pointer;
}

.sidebar-collapse:hover {
  border-color: #d4d8e2;
  background: #fff;
  color: #493c88;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  padding: 8px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

.sidebar-primary {
  display: grid;
  gap: 4px;
  padding-bottom: 9px;
  border-bottom: 1px solid #dfe3eb;
}

.sidebar-primary-button,
.sidebar-group-heading,
.sidebar-item,
.sidebar-child-item,
.sidebar-nested summary {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sidebar-primary-button {
  min-height: 40px;
  gap: 10px;
  padding: 0 10px;
  border-radius: 9px;
  background: transparent;
  font-size: 13px;
  font-weight: 650;
}

.scene-sidebar--collapsed .sidebar-primary-button,
.scene-sidebar--collapsed .sidebar-group-heading {
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}

.sidebar-primary-button:hover,
.sidebar-primary-button.active {
  background: #e8e5f6;
  color: #493c88;
}

.sidebar-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  place-items: center;
  border-radius: 7px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}

.sidebar-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-group {
  padding-top: 7px;
}

.sidebar-group-heading {
  min-height: 34px;
  gap: 9px;
  padding: 0 9px;
  border-radius: 8px;
  background: transparent;
  color: #5d6575;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.04em;
}

.sidebar-group-chevron {
  flex: 0 0 auto;
  font-size: 17px;
  line-height: 1;
  transition: transform 120ms ease;
}

.sidebar-group-chevron.open {
  transform: rotate(90deg);
}

.sidebar-group-heading:hover,
.sidebar-group-heading--action:hover {
  background: #e9ecf2;
  color: #313b50;
}

.sidebar-items {
  display: grid;
  gap: 1px;
  margin: 2px 0 0 33px;
  padding-left: 7px;
  border-left: 1px solid #d9dde6;
}

.sidebar-item,
.sidebar-nested summary {
  min-height: 31px;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 7px;
  background: transparent;
  font-size: 12px;
  line-height: 1.25;
  list-style: none;
}

.sidebar-nested summary::-webkit-details-marker {
  display: none;
}

.sidebar-item:hover:not(:disabled),
.sidebar-nested summary:hover,
.sidebar-child-item:hover:not(:disabled) {
  background: #e7eaf1;
  color: #3f347d;
}

.sidebar-group-heading.opened {
  color: #4d408b;
}

.sidebar-group-heading.opened .sidebar-icon {
  background: #e6e1f7;
  color: #55449a;
}

.sidebar-item.opened,
.sidebar-nested summary.opened,
.sidebar-child-item.opened {
  background: #ebe8f7;
  color: #493b89;
  box-shadow: inset 3px 0 #8b7acb;
  font-weight: 650;
}

.sidebar-group-heading.active .sidebar-icon,
.sidebar-item.active,
.sidebar-nested summary.active,
.sidebar-child-item.active {
  background: #6655ad;
  color: #fff;
  box-shadow: inset 3px 0 #3f317f;
}

.sidebar-item.active .sidebar-shortcut,
.sidebar-nested summary.active .sidebar-shortcut,
.sidebar-child-item.active .sidebar-shortcut {
  color: rgba(255, 255, 255, 0.78);
}

.sidebar-item:disabled,
.sidebar-child-item:disabled,
.sidebar-nested summary.disabled {
  color: #aeb4c0;
  cursor: default;
}

.sidebar-item-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sidebar-chevron {
  display: inline-block;
  font-size: 16px;
  transition: transform 120ms ease;
}

.sidebar-nested[open] .sidebar-chevron {
  transform: rotate(90deg);
}

.sidebar-child-item {
  min-height: 29px;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px 5px 17px;
  border-radius: 6px;
  background: transparent;
  font-size: 11px;
  line-height: 1.25;
}

.sidebar-shortcut {
  flex: 0 0 auto;
  color: #8a91a0;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sidebar-separator {
  height: 1px;
  margin: 4px 7px;
  background: #dfe2e9;
}

@media (pointer: coarse) and (orientation: landscape) {
  .scene-sidebar {
    flex-basis: 260px;
    width: 260px;
  }

  .scene-sidebar--collapsed {
    flex-basis: 64px;
    width: 64px;
  }

  .sidebar-primary-button,
  .sidebar-group-heading {
    min-height: 44px;
  }

  .sidebar-item,
  .sidebar-nested summary,
  .sidebar-child-item {
    min-height: 38px;
  }
}
</style>
