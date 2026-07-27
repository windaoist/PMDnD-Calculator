import type { AppAPI } from './types'

const STORAGE_KEY = 'pmdnd-latest-save'
const QUICK_SLOT_COUNT = 10
const QUICK_SLOT_PREFIX = 'pmdnd-quick-slot-'
const QUICK_SLOT_TIME_PREFIX = 'pmdnd-quick-slot-time-'

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
}

function downloadFile(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function alertQuota(): void {
  alert(
    'localStorage 容量已满。\n\n' +
      '请清理部分快速存档，或使用「存档到文件」将存档导出为 JSON 文件。\n' +
      '菜单：存档 → 删除快速存档'
  )
}

function trySaveLatest(data: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, data)
    return true
  } catch {
    return false
  }
}

function saveCharacterCount(data: string | null): number | undefined {
  if (data == null) return undefined
  try {
    const parsed = JSON.parse(data) as { creatures?: unknown }
    return Array.isArray(parsed.creatures) ? parsed.creatures.length : 0
  } catch {
    return 0
  }
}

function utf8Size(data: string | null): number | undefined {
  return data == null ? undefined : new TextEncoder().encode(data).byteLength
}

export const webPlatform: AppAPI = {
  async saveState(data) {
    try {
      downloadFile(data, `pmdnd-${timestamp()}.json`)
    } catch (error) {
      return { success: false, message: `存档文件导出失败：${String(error)}` }
    }

    if (!trySaveLatest(data)) {
      alert(
        '存档文件已开始下载，但 localStorage 容量已满。\n\n' +
          '浏览器内的“最新存档”未能更新。请确认文件已保存，然后清理部分快速存档。\n' +
          '菜单：存档 → 删除快速存档'
      )
      return {
        success: true,
        message: '文件已导出，但 localStorage 容量已满，未更新浏览器内最新存档'
      }
    }

    return { success: true }
  },

  async quickSave(data, requestedSlot) {
    const slots = await this.quickSaveSlots()
    const target =
      requestedSlot ??
      slots.find((slot) => !slot.exists)?.slot ??
      [...slots].sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))[0]?.slot ??
      1
    const updatedAt = Date.now()
    try {
      localStorage.setItem(STORAGE_KEY, data)
      localStorage.setItem(`${QUICK_SLOT_PREFIX}${target}`, data)
      localStorage.setItem(`${QUICK_SLOT_TIME_PREFIX}${target}`, String(updatedAt))
    } catch {
      alertQuota()
      return { success: false, message: 'localStorage 容量已满' }
    }
    return { success: true, slot: target, updatedAt }
  },

  async quickLoad(requestedSlot) {
    const slots = await this.quickSaveSlots()
    const target =
      requestedSlot ??
      [...slots]
        .filter((slot) => slot.exists)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]?.slot
    if (!target) return { success: false, message: '无存档' }
    const data = localStorage.getItem(`${QUICK_SLOT_PREFIX}${target}`)
    return data ? { success: true, data, slot: target } : { success: false, message: '该槽位为空' }
  },

  async quickSaveSlots() {
    return Array.from({ length: QUICK_SLOT_COUNT }, (_, i) => {
      const slot = i + 1
      const data = localStorage.getItem(`${QUICK_SLOT_PREFIX}${slot}`)
      const updatedAt =
        Number(localStorage.getItem(`${QUICK_SLOT_TIME_PREFIX}${slot}`)) || undefined
      return {
        slot,
        exists: data != null,
        updatedAt,
        fileName: data != null ? `slot-${slot}` : undefined,
        characterCount: saveCharacterCount(data),
        fileSizeBytes: utf8Size(data)
      }
    })
  },

  async deleteQuickSave(slot) {
    localStorage.removeItem(`${QUICK_SLOT_PREFIX}${slot}`)
    localStorage.removeItem(`${QUICK_SLOT_TIME_PREFIX}${slot}`)
    return { success: true }
  },

  async openLoadDialog() {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return resolve({ success: false })
        try {
          const text = await file.text()
          resolve({ success: true, data: text })
        } catch {
          resolve({ success: false })
        }
      }
      input.click()
    })
  },

  getSaveDir: () => Promise.resolve(''),

  openSaveDir() {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) downloadFile(data, `pmdnd-${timestamp()}.json`)
    return Promise.resolve()
  },

  setZoomFactor(factor) {
    const normalized = Number.isFinite(factor) && factor > 0 ? factor : 1
    const appRoot = document.getElementById('app')
    if (!appRoot) return
    appRoot.style.setProperty('zoom', String(normalized))
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  },

  onAutoSave(cb) {
    window.addEventListener('beforeunload', (e) => {
      e.preventDefault()
      cb()
    })
  },

  autoSaveDone() {
    // web 下无需显式确认关闭
  }
}
