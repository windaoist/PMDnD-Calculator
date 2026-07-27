import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  saveState: (data: string) => ipcRenderer.invoke('saveState', data),
  openLoadDialog: () =>
    ipcRenderer.invoke('openLoadDialog') as Promise<{ success: boolean; data?: string }>,
  quickSave: (data: string, slot?: number) => ipcRenderer.invoke('quickSave', data, slot),
  quickLoad: (slot?: number) => ipcRenderer.invoke('quickLoad', slot),
  quickSaveSlots: () => ipcRenderer.invoke('quickSaveSlots'),
  deleteQuickSave: (slot: number) => ipcRenderer.invoke('deleteQuickSave', slot),
  getSaveDir: () => ipcRenderer.invoke('getSaveDir'),
  openSaveDir: () => ipcRenderer.invoke('openSaveDir'),
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  onAutoSave: (cb: () => void) => ipcRenderer.on('autoSave', cb),
  autoSaveDone: () => ipcRenderer.send('autoSaveDone')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
