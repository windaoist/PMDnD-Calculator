export interface QuickSaveSlotInfo {
  slot: number
  exists: boolean
  updatedAt?: number
  fileName?: string
  characterCount?: number
  fileSizeBytes?: number
}

export interface AppAPI {
  saveState: (data: string) => Promise<{ success: boolean; filePath?: string; message?: string }>
  openLoadDialog: () => Promise<{ success: boolean; data?: string }>
  quickSave: (
    data: string,
    slot?: number
  ) => Promise<{
    success: boolean
    filePath?: string
    slot?: number
    updatedAt?: number
    message?: string
  }>
  quickLoad: (slot?: number) => Promise<{
    success: boolean
    data?: string
    fileName?: string
    slot?: number
    message?: string
  }>
  quickSaveSlots: () => Promise<QuickSaveSlotInfo[]>
  deleteQuickSave: (slot: number) => Promise<{ success: boolean; message?: string }>
  getSaveDir: () => Promise<string>
  openSaveDir: () => Promise<void>
  setZoomFactor: (factor: number) => void
  onAutoSave: (cb: () => void) => void
  autoSaveDone: () => void
}
