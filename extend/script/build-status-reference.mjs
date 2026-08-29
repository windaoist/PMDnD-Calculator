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
  'status-reference.json'
)

const source = (await readFile(sourcePath, 'utf8')).replace(/\r\n?/g, '\n')
const appendixStart = source.indexOf('\n## 附录 A\n')
const appendixEnd = source.indexOf('\n## 附录 B\n', appendixStart + 1)

if (appendixStart < 0 || appendixEnd < 0) {
  throw new Error('无法在玩家手册中定位“附录 A：状态”的完整边界。')
}

const appendix = source.slice(appendixStart + 1, appendixEnd)
const pageBreakCount = appendix.match(/^\\page$/gm)?.length ?? 0
if (pageBreakCount !== 15) {
  throw new Error(`附录 A 页数校验失败：预期 P284-P298 共 15 页，实际找到 ${pageBreakCount} 个分页符。`)
}

const statusTitleAt = appendix.indexOf('\n# 状态\n')
if (statusTitleAt < 0) throw new Error('附录 A 中缺少“状态”标题。')

const cleaned = appendix
  .slice(statusTitleAt + '\n# 状态\n'.length)
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

const headingPattern = /^(#{2,4})\s+(.+)$/gm
const headings = [...cleaned.matchAll(headingPattern)]
if (headings.length === 0) throw new Error('附录 A 中未读取到状态小节。')

const introduction = cleaned.slice(0, headings[0].index).trim()
let currentChapter = ''
let currentCategory = ''
const sections = headings.map((match, index) => {
  const level = match[1].length
  const title = match[2].trim()
  if (level === 2) {
    currentChapter = title
    currentCategory = ''
  } else if (level === 3) {
    currentCategory = title
  }

  const contentStart = (match.index ?? 0) + match[0].length
  const contentEnd = headings[index + 1]?.index ?? cleaned.length
  return {
    id: `status-${String(index + 1).padStart(3, '0')}`,
    title,
    level,
    chapter: currentChapter,
    category: currentCategory,
    content: cleaned.slice(contentStart, contentEnd).trim()
  }
})

const entryCount = sections.filter((section) => section.level === 4).length
if (entryCount < 70) {
  throw new Error(`状态条目校验失败：仅整理出 ${entryCount} 个四级条目。`)
}

const result = {
  title: '状态',
  appendix: '附录 A',
  pageRange: 'P284–P298',
  source: 'HB-PMDnD玩家手册.txt',
  introduction,
  entryCount,
  sections
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(`已生成 ${outputPath}`)
console.log(`共 ${sections.length} 个小节，其中 ${entryCount} 个状态条目。`)
