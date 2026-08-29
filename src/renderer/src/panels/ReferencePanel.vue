<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import statusReference from '../data/status-reference.json'
import commonMechanicsReference from '../data/common-mechanics-reference.json'

type ReferenceSection = (typeof statusReference.sections)[number]

const query = ref('')
const catalogOpen = ref(true)
const mechanicsCatalogOpen = ref(true)
const articleRef = ref<HTMLElement | null>(null)
const activeId = ref(statusReference.sections[0]?.id ?? '')
const allSectionIds = [
  ...statusReference.sections.map((section) => section.id),
  ...commonMechanicsReference.topics.flatMap((topic) => [
    topic.id,
    ...topic.directory.map((section) => section.id)
  ])
]
const commonMechanicsIds = new Set(
  commonMechanicsReference.topics.flatMap((topic) => [
    topic.id,
    ...topic.directory.map((section) => section.id)
  ])
)

const statusChapters = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase('zh-CN')
  const result: { title: string; id: string; sections: ReferenceSection[] }[] = []

  statusReference.sections.forEach((section) => {
    if (section.level === 2) {
      result.push({ title: section.title, id: section.id, sections: [] })
    }
    result.at(-1)?.sections.push(section)
  })

  if (!normalizedQuery) return result
  return result
    .map((chapter) => ({
      ...chapter,
      sections: chapter.sections.filter((section) =>
        `${section.title}\n${section.content}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
      )
    }))
    .filter((chapter) => chapter.sections.length > 0)
})

const mechanicsTopics = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase('zh-CN')
  if (!normalizedQuery) return commonMechanicsReference.topics
  return commonMechanicsReference.topics.filter((topic) =>
    `${topic.title}\n${topic.sourceLabel}\n${topic.content}`
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedQuery)
  )
})

const resultCount = computed(
  () =>
    statusChapters.value.reduce((sum, item) => sum + item.sections.length, 0) +
    mechanicsTopics.value.length
)

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableDivider(line: string): boolean {
  return tableCells(line).every((cell) => /^:?-{2,}:?$/.test(cell))
}

function renderMarkdown(markdown: string, directory: readonly { id: string }[] = []): string {
  if (!markdown) return ''
  const lines = markdown.split('\n')
  const html: string[] = []
  let index = 0
  let headingIndex = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }

    const subheading = line.match(/^(#{3,5})\s+(.+)$/)
    if (subheading) {
      const headingLevel = Math.min(subheading[1].length, 5)
      const headingId = directory[headingIndex]?.id
      const idAttribute = headingId ? ` id="${headingId}"` : ''
      html.push(`<h${headingLevel}${idAttribute}>${renderInline(subheading[2])}</h${headingLevel}>`)
      headingIndex += 1
      index += 1
      continue
    }

    if (line.trim().startsWith('|') && lines[index + 1] && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index]?.trim().startsWith('|')) {
        rows.push(tableCells(lines[index] ?? ''))
        index += 1
      }
      html.push(
        `<div class="reference-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      )
      continue
    }

    if (/^\s*-\s+/.test(line)) {
      const items: { depth: number; text: string }[] = []
      while (index < lines.length) {
        const item = (lines[index] ?? '').match(/^(\s*)-\s+(.+)$/)
        if (!item) break
        items.push({ depth: Math.min(Math.floor(item[1].length / 2), 3), text: item[2] })
        index += 1
      }
      html.push(
        `<ul>${items.map((item) => `<li class="list-depth-${item.depth}">${renderInline(item.text)}</li>`).join('')}</ul>`
      )
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !/^#{3,5}\s+/.test(lines[index] ?? '') &&
      !/^\s*-\s+/.test(lines[index] ?? '') &&
      !(
        lines[index]?.trim().startsWith('|') &&
        lines[index + 1] &&
        isTableDivider(lines[index + 1])
      )
    ) {
      paragraph.push(lines[index] ?? '')
      index += 1
    }
    html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
  }

  return html.join('')
}

function scrollToSection(id: string): void {
  activeId.value = id
  nextTick(() => {
    articleRef.value?.querySelector<HTMLElement>(`#${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  })
}

function updateActiveSection(): void {
  const article = articleRef.value
  if (!article) return
  const articleTop = article.getBoundingClientRect().top
  let closest = allSectionIds[0] ?? ''
  for (const id of allSectionIds) {
    const element = article.querySelector<HTMLElement>(`#${id}`)
    if (!element || element.getBoundingClientRect().top - articleTop > 120) break
    closest = id
  }
  activeId.value = closest
}

onMounted(updateActiveSection)
</script>

<template>
  <div class="reference-panel">
    <aside class="reference-catalog" aria-label="查阅目录">
      <div class="catalog-heading">
        <span class="catalog-kicker">查阅</span>
        <strong>规则图鉴</strong>
      </div>

      <label class="catalog-search">
        <span aria-hidden="true">⌕</span>
        <input v-model="query" type="search" placeholder="搜索状态或规则…" />
      </label>

      <nav class="catalog-tree">
        <button
          type="button"
          class="catalog-root"
          :aria-expanded="catalogOpen"
          @click="catalogOpen = !catalogOpen"
        >
          <span><span class="catalog-root-icon">◇</span>状态</span>
          <span class="catalog-count">{{ statusReference.entryCount }}</span>
        </button>

        <div v-if="catalogOpen" class="catalog-branches">
          <p v-if="statusChapters.length === 0" class="catalog-empty">没有匹配的状态</p>
          <section v-for="chapter in statusChapters" :key="chapter.id" class="catalog-chapter">
            <button type="button" @click="scrollToSection(chapter.id)">{{ chapter.title }}</button>
            <button
              v-for="section in chapter.sections.filter((item) => item.level > 2)"
              :key="section.id"
              type="button"
              class="catalog-entry"
              :class="{
                'catalog-entry--category': section.level === 3,
                active: activeId === section.id
              }"
              @click="scrollToSection(section.id)"
            >
              {{ section.title }}
            </button>
          </section>
        </div>

        <button
          type="button"
          class="catalog-root catalog-root--mechanics"
          :class="{ active: commonMechanicsIds.has(activeId) }"
          :aria-expanded="mechanicsCatalogOpen"
          @click="mechanicsCatalogOpen = !mechanicsCatalogOpen"
        >
          <span><span class="catalog-root-icon">⚙</span>{{ commonMechanicsReference.title }}</span>
          <span class="catalog-count">{{ commonMechanicsReference.topics.length }}</span>
        </button>

        <div v-if="mechanicsCatalogOpen" class="catalog-branches catalog-branches--mechanics">
          <p v-if="mechanicsTopics.length === 0" class="catalog-empty">没有匹配的机制</p>
          <template v-for="topic in mechanicsTopics" :key="topic.id">
            <button
              type="button"
              class="catalog-mechanic"
              :class="{
                active:
                  activeId === topic.id || topic.directory.some((item) => item.id === activeId)
              }"
              @click="scrollToSection(topic.id)"
            >
              <span>{{ topic.title }}</span>
              <small>{{ topic.sourceLabel }}</small>
            </button>
            <button
              v-for="section in topic.directory"
              :key="section.id"
              type="button"
              class="catalog-mechanic-section"
              :class="{
                'catalog-mechanic-section--nested': section.level > 3,
                active: activeId === section.id
              }"
              @click="scrollToSection(section.id)"
            >
              {{ section.title }}
            </button>
          </template>
        </div>
      </nav>

      <div v-if="query" class="catalog-results">目录中找到 {{ resultCount }} 项</div>
      <!-- <div class="catalog-source">
        {{ statusReference.source }}<br />{{ statusReference.pageRange }}
      </div> -->
    </aside>

    <main ref="articleRef" class="reference-article" @scroll.passive="updateActiveSection">
      <article>
        <header class="reference-hero">
          <div>
            <span class="reference-eyebrow"
              >{{ statusReference.appendix }} · {{ statusReference.pageRange }}</span
            >
            <h1>{{ statusReference.title }}</h1>
            <p>{{ statusReference.introduction }}</p>
          </div>
          <div class="reference-stat">
            <strong>{{ statusReference.entryCount }}</strong
            ><span>项条目</span>
          </div>
        </header>

        <template v-for="section in statusReference.sections" :key="section.id">
          <section
            v-if="section.level === 2"
            :id="section.id"
            class="reference-section reference-section--chapter"
          >
            <span class="chapter-mark">{{
              String(
                statusReference.sections
                  .filter((item) => item.level === 2)
                  .findIndex((item) => item.id === section.id) + 1
              ).padStart(2, '0')
            }}</span>
            <div>
              <h2>{{ section.title }}</h2>
              <div class="reference-copy" v-html="renderMarkdown(section.content)" />
            </div>
          </section>
          <section
            v-else-if="section.level === 3"
            :id="section.id"
            class="reference-section reference-section--category"
          >
            <h3>{{ section.title }}</h3>
            <div class="reference-copy" v-html="renderMarkdown(section.content)" />
          </section>
          <section v-else :id="section.id" class="reference-section reference-section--entry">
            <div class="entry-heading">
              <span class="entry-diamond" aria-hidden="true">◆</span>
              <div>
                <span class="entry-path">{{ section.category || section.chapter }}</span>
                <h3>{{ section.title }}</h3>
              </div>
            </div>
            <div class="reference-copy" v-html="renderMarkdown(section.content)" />
          </section>
        </template>

        <header class="reference-hero reference-hero--mechanics">
          <div>
            <span class="reference-eyebrow">战斗规则速查</span>
            <h1>{{ commonMechanicsReference.title }}</h1>
            <p>集中收录回合、动作、掩护与迷宫战斗中最常查阅的规则。</p>
          </div>
          <div class="reference-stat">
            <strong>{{ commonMechanicsReference.topics.length }}</strong
            ><span>项机制</span>
          </div>
        </header>

        <section
          v-for="(topic, topicIndex) in commonMechanicsReference.topics"
          :id="topic.id"
          :key="topic.id"
          class="reference-section mechanics-topic"
        >
          <header class="mechanics-heading">
            <span class="chapter-mark">{{ String(topicIndex + 1).padStart(2, '0') }}</span>
            <div>
              <span class="reference-eyebrow">{{ topic.sourceLabel }} · {{ topic.pageRange }}</span>
              <h2>{{ topic.title }}</h2>
            </div>
          </header>
          <div class="reference-copy" v-html="renderMarkdown(topic.content, topic.directory)" />
        </section>
      </article>
    </main>
  </div>
</template>

<style scoped>
.reference-panel {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: minmax(190px, 248px) minmax(0, 1fr);
  overflow: hidden;
  background: var(--theme-bg-soft, #f5f6f8);
  color: var(--theme-text, #242936);
}

.reference-catalog {
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--theme-border, #d9dde5);
  background: var(--theme-surface, #fff);
}

.catalog-heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 20px 17px 13px;
}

.catalog-heading strong {
  font-size: 17px;
}
.catalog-kicker,
.reference-eyebrow,
.entry-path {
  color: var(--theme-accent, #6652be);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.catalog-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 12px 10px;
  padding: 0 9px;
  border: 1px solid var(--theme-border, #d9dde5);
  border-radius: 8px;
  background: var(--theme-bg-soft, #f5f6f8);
  color: var(--theme-text-muted, #687184);
}

.catalog-search input {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0;
  border: 0 !important;
  outline: 0;
  background: transparent !important;
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.catalog-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 9px 12px;
  scrollbar-width: thin;
}
.catalog-root,
.catalog-chapter button {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.catalog-root {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 9px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 750;
}

.catalog-root:hover,
.catalog-chapter button:hover {
  background: var(--theme-hover, #eef0f5);
}
.catalog-root--mechanics {
  margin-top: 8px;
}
.catalog-root.active {
  background: var(--theme-accent-soft, #e8e5f6);
  color: var(--theme-accent, #6652be);
}
.catalog-root-icon {
  margin-right: 8px;
  color: var(--theme-accent, #6652be);
}
.catalog-count {
  color: var(--theme-text-muted, #687184);
  font-size: 10px;
}
.catalog-branches {
  margin-left: 20px;
  padding-left: 9px;
  border-left: 1px solid var(--theme-border, #d9dde5);
}
.catalog-chapter {
  margin: 3px 0 7px;
}
.catalog-chapter > button:first-child {
  padding: 7px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 750;
}
.catalog-chapter .catalog-entry {
  padding: 5px 8px 5px 15px;
  border-radius: 6px;
  color: var(--theme-text-muted, #687184);
  font-size: 11px;
}
.catalog-chapter .catalog-entry--category {
  padding-left: 8px;
  color: var(--theme-text, #242936);
  font-weight: 700;
}
.catalog-chapter .catalog-entry.active {
  background: var(--theme-accent-soft, #e8e5f6);
  color: var(--theme-accent, #6652be);
}
.catalog-mechanic {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 2px;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--theme-text, #242936);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.catalog-mechanic:hover {
  background: var(--theme-hover, #eef0f5);
}
.catalog-mechanic.active {
  background: var(--theme-accent-soft, #e8e5f6);
  color: var(--theme-accent, #6652be);
}
.catalog-mechanic small {
  color: var(--theme-text-muted, #687184);
  font-size: 9px;
}
.catalog-mechanic-section {
  width: 100%;
  padding: 5px 8px 5px 18px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--theme-text-muted, #687184);
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
}
.catalog-mechanic-section--nested {
  padding-left: 27px;
  font-size: 9px;
}
.catalog-mechanic-section:hover {
  background: var(--theme-hover, #eef0f5);
  color: var(--theme-text, #242936);
}
.catalog-mechanic-section.active {
  background: var(--theme-accent-soft, #e8e5f6);
  color: var(--theme-accent, #6652be);
}
.catalog-empty,
.catalog-results,
.catalog-source {
  color: var(--theme-text-muted, #687184);
  font-size: 10px;
}
.catalog-empty {
  padding: 8px;
}
.catalog-results {
  padding: 8px 17px;
  border-top: 1px solid var(--theme-border, #d9dde5);
}
.catalog-source {
  padding: 11px 17px;
  border-top: 1px solid var(--theme-border, #d9dde5);
  line-height: 1.5;
}

.reference-article {
  min-width: 0;
  overflow: auto;
  scroll-behavior: smooth;
}
.reference-article article {
  width: min(860px, calc(100% - 48px));
  margin: 0 auto;
  padding: 34px 0 80px;
}
.reference-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 34px;
  padding: 30px;
  border: 1px solid
    color-mix(in srgb, var(--theme-accent, #6652be) 28%, var(--theme-border, #d9dde5));
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-accent-soft, #e8e5f6) 68%, var(--theme-surface, #fff)),
    var(--theme-surface, #fff)
  );
  box-shadow: 0 12px 34px var(--theme-shadow, rgba(25, 34, 50, 0.1));
}
.reference-hero--mechanics {
  margin-top: 72px;
}

.reference-hero h1 {
  margin: 5px 0 8px;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1;
}
.reference-hero p {
  max-width: 560px;
  margin: 0;
  color: var(--theme-text-muted, #687184);
  line-height: 1.75;
}
.reference-stat {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  color: var(--theme-text-muted, #687184);
  font-size: 10px;
}
.reference-stat strong {
  color: var(--theme-accent, #6652be);
  font-size: 30px;
  line-height: 1;
}
.reference-section {
  scroll-margin-top: 18px;
}
.reference-section--chapter {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
  margin: 42px 0 18px;
  padding-top: 22px;
  border-top: 1px solid var(--theme-border, #d9dde5);
}
.reference-section--chapter:first-of-type {
  margin-top: 0;
}
.chapter-mark {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  background: var(--theme-accent, #6652be);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}
.reference-section--chapter h2 {
  margin: 3px 0 7px;
  font-size: 22px;
}
.reference-section--category {
  margin: 28px 0 12px;
  padding-left: 12px;
  border-left: 3px solid var(--theme-accent, #6652be);
}
.reference-section--category h3 {
  margin: 0 0 7px;
  font-size: 17px;
}
.reference-section--entry {
  margin: 12px 0;
  padding: 20px 22px;
  border: 1px solid var(--theme-border, #d9dde5);
  border-radius: 12px;
  background: var(--theme-surface, #fff);
  box-shadow: 0 5px 18px var(--theme-shadow, rgba(25, 34, 50, 0.07));
}
.entry-heading {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 11px;
}
.entry-diamond {
  color: var(--theme-accent, #6652be);
  font-size: 10px;
}
.entry-heading h3 {
  margin: 2px 0 0;
  font-size: 18px;
}
.reference-copy {
  color: var(--theme-text, #242936);
  font-size: 13px;
  line-height: 1.78;
}
.reference-copy:deep(p) {
  margin: 8px 0;
}
.reference-copy:deep(p:first-child) {
  margin-top: 0;
}
.reference-copy:deep(p:last-child) {
  margin-bottom: 0;
}
.reference-copy:deep(ul) {
  margin: 7px 0;
  padding-left: 21px;
}
.reference-copy:deep(li) {
  margin: 3px 0;
}
.reference-copy:deep(.list-depth-1) {
  margin-left: 18px;
  list-style-type: circle;
}
.reference-copy:deep(.list-depth-2),
.reference-copy:deep(.list-depth-3) {
  margin-left: 36px;
  list-style-type: square;
}
.reference-copy:deep(h4) {
  margin: 22px 0 8px;
  font-size: 14px;
  scroll-margin-top: 18px;
}
.reference-copy:deep(h3) {
  margin: 25px 0 8px;
  font-size: 17px;
  scroll-margin-top: 18px;
}
.reference-copy:deep(h5) {
  margin: 18px 0 7px;
  font-size: 13px;
  scroll-margin-top: 18px;
}
.reference-copy:deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--theme-bg-muted, #eceef2);
}
.reference-copy:deep(.reference-table-wrap) {
  margin: 12px 0;
  overflow-x: auto;
  border: 1px solid var(--theme-border, #d9dde5);
  border-radius: 8px;
}
.reference-copy:deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.reference-copy:deep(th),
.reference-copy:deep(td) {
  padding: 7px 9px;
  border-right: 1px solid var(--theme-border, #d9dde5);
  border-bottom: 1px solid var(--theme-border, #d9dde5);
  text-align: left;
}
.reference-copy:deep(th) {
  background: var(--theme-bg-muted, #eceef2);
}
.reference-copy:deep(tr:last-child td) {
  border-bottom: 0;
}
.reference-copy:deep(th:last-child),
.reference-copy:deep(td:last-child) {
  border-right: 0;
}
.mechanics-topic {
  margin: 16px 0 22px;
  padding: 24px 26px;
  border: 1px solid var(--theme-border, #d9dde5);
  border-radius: 14px;
  background: var(--theme-surface, #fff);
  box-shadow: 0 7px 24px var(--theme-shadow, rgba(25, 34, 50, 0.08));
}
.mechanics-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--theme-border, #d9dde5);
}
.mechanics-heading h2 {
  margin: 3px 0 0;
  font-size: 22px;
}

@media (max-width: 720px) {
  .reference-panel {
    grid-template-columns: 176px minmax(0, 1fr);
  }
  .reference-article article {
    width: calc(100% - 28px);
    padding-top: 18px;
  }
  .reference-hero {
    padding: 22px;
  }
  .reference-stat {
    display: none;
  }
  .reference-section--entry {
    padding: 17px;
  }
}
</style>
