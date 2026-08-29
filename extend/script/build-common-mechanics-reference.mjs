import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const sourcePath = resolve(projectRoot, 'extend', 'HB-PMDnD玩家手册.txt')
const outputPath = resolve(
  projectRoot,
  'src',
  'renderer',
  'src',
  'data',
  'common-mechanics-reference.json'
)

const source = (await readFile(sourcePath, 'utf8')).replace(/\r\n?/g, '\n')

function findHeading(heading, after = 0) {
  const marker = `\n${heading}\n`
  const index = source.indexOf(marker, after)
  if (index < 0) throw new Error(`无法在玩家手册中定位标题“${heading}”。`)
  return index + 1
}

function cleanMarkup(content) {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !(
        trimmed === '___' ||
        trimmed === '}}' ||
        trimmed === '\\page' ||
        trimmed === '\\column' ||
        trimmed.startsWith('{{chapter') ||
        trimmed.startsWith('{{pageNumber') ||
        trimmed.startsWith('{{footnote') ||
        trimmed.startsWith('{{note') ||
        trimmed.startsWith('{{column-count')
      )
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractSection({
  heading,
  after,
  id,
  title,
  sourceLabel,
  pageRange,
  stopAtFirstPageBreak = false
}) {
  const start = findHeading(heading, after)
  const level = heading.match(/^#+/)?.[0].length
  if (!level) throw new Error(`标题“${heading}”缺少 Markdown 层级。`)

  const bodyStart = start + heading.length + 1
  const headingPattern = /^#{1,6}\s+.+$/gm
  headingPattern.lastIndex = bodyStart
  let end = source.length
  for (const match of source.matchAll(headingPattern)) {
    if ((match.index ?? 0) < bodyStart) continue
    const nextLevel = match[0].match(/^#+/)?.[0].length ?? 7
    if (nextLevel <= level) {
      end = match.index ?? source.length
      break
    }
  }
  if (stopAtFirstPageBreak) {
    const pageEnd = source.indexOf('\n\\page\n', bodyStart)
    if (pageEnd >= 0) end = Math.min(end, pageEnd)
  }

  const content = cleanMarkup(source.slice(bodyStart, end))
  if (!content) throw new Error(`标题“${heading}”没有可用正文。`)
  return { id, title, sourceLabel, pageRange, content }
}

const chapterSeven = findHeading('## 第 7 章')
const appendixD = findHeading('## 附录 D')
const topics = [
  extractSection({
    heading: '## 战斗动作',
    after: chapterSeven,
    id: 'mechanics-combat-actions',
    title: '战斗动作',
    sourceLabel: '第 7 章：战斗',
    pageRange: 'P220–P221'
  }),
  extractSection({
    heading: '### 大自然的回合',
    after: chapterSeven,
    id: 'mechanics-nature-turn',
    title: '大自然的回合',
    sourceLabel: '第 7 章：战斗',
    pageRange: 'P217'
  }),
  extractSection({
    heading: '### 你的回合',
    after: chapterSeven,
    id: 'mechanics-your-turn',
    title: '你的回合',
    sourceLabel: '第 7 章：战斗',
    pageRange: 'P217–P218'
  }),
  extractSection({
    heading: '## 环境掩护',
    after: chapterSeven,
    id: 'mechanics-environment-cover',
    title: '环境掩护',
    sourceLabel: '第 7 章：战斗',
    pageRange: 'P225'
  }),
  extractSection({
    heading: '### 战斗',
    after: appendixD,
    id: 'mechanics-appendix-d-combat',
    title: '战斗',
    sourceLabel: '附录 D：迷宫之主指南',
    pageRange: 'P407',
    stopAtFirstPageBreak: true
  })
]

for (const topic of topics) {
  topic.directory = []
  if (topic.id !== 'mechanics-combat-actions') continue

  const headings = [...topic.content.matchAll(/^(#{3,5})\s+(.+)$/gm)]
  topic.directory = headings.map((match, index) => ({
    id: `${topic.id}-section-${String(index + 1).padStart(2, '0')}`,
    title: match[2].replace(/[*_`]/g, '').trim(),
    level: match[1].length
  }))
}

const expectedSubheadings = ['普通攻击', '在你决定行动之前', '跟进战斗状态', '朝向']
for (const subheading of expectedSubheadings) {
  if (!topics.some((topic) => topic.content.includes(subheading))) {
    throw new Error(`常用机制内容校验失败：缺少“${subheading}”。`)
  }
}
if (topics[0].directory.length < 10) {
  throw new Error(`战斗动作目录校验失败：仅整理出 ${topics[0].directory.length} 个目录项。`)
}

const result = {
  title: '常用机制',
  source: 'HB-PMDnD玩家手册.txt',
  topics
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(`已生成 ${outputPath}`)
console.log(`共 ${topics.length} 个常用机制主题。`)
