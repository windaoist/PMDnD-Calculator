import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'

const title = 'PMDnD计算器'

const saveDir = join(app.getPath('userData'), 'saves')
const quickSlotCount = 10
fs.mkdirSync(saveDir, { recursive: true })

function quickSlotFileName(slot: number): string {
  return `quick-slot-${slot}.json`
}

function quickSlotPath(slot: number): string {
  return join(saveDir, quickSlotFileName(slot))
}

function normalizeQuickSlot(slot: number): number | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > quickSlotCount) return null
  return slot
}

function quickSaveCharacterCount(filePath: string): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { creatures?: unknown }
    return Array.isArray(parsed.creatures) ? parsed.creatures.length : 0
  } catch {
    return 0
  }
}

function getQuickSaveSlots(): {
  slot: number
  exists: boolean
  updatedAt?: number
  fileName?: string
  characterCount?: number
  fileSizeBytes?: number
}[] {
  return Array.from({ length: quickSlotCount }, (_, i) => {
    const slot = i + 1
    const filePath = quickSlotPath(slot)
    if (!fs.existsSync(filePath)) return { slot, exists: false }
    const stat = fs.statSync(filePath)
    return {
      slot,
      exists: true,
      updatedAt: stat.mtimeMs,
      fileName: quickSlotFileName(slot),
      characterCount: quickSaveCharacterCount(filePath),
      fileSizeBytes: stat.size
    }
  })
}

function chooseQuickSaveSlot(requestedSlot?: number): number {
  const normalized = requestedSlot === undefined ? null : normalizeQuickSlot(requestedSlot)
  if (normalized != null) return normalized

  const slots = getQuickSaveSlots()
  const empty = slots.find((slot) => !slot.exists)
  if (empty) return empty.slot
  return [...slots].sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))[0]?.slot ?? 1
}

function chooseQuickLoadSlot(requestedSlot?: number): number | null {
  const normalized = requestedSlot === undefined ? null : normalizeQuickSlot(requestedSlot)
  if (normalized != null) return normalized

  const latest = getQuickSaveSlots()
    .filter((slot) => slot.exists)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
  return latest?.slot ?? null
}

// IPC handlers (registered once at module level)
ipcMain.handle('getSaveDir', () => saveDir)

ipcMain.handle('openSaveDir', () => {
  if (saveDir) shell.openPath(saveDir)
})

ipcMain.handle('openLoadDialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: saveDir,
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (!canceled && filePaths.length > 0) {
    const data = fs.readFileSync(filePaths[0], 'utf-8')
    return { success: true, data }
  }
  return { success: false }
})

ipcMain.handle('quickSaveSlots', async () => {
  if (!saveDir) return []
  try {
    fs.mkdirSync(saveDir, { recursive: true })
    return getQuickSaveSlots()
  } catch {
    return []
  }
})

ipcMain.handle('deleteQuickSave', async (_event, slot: number) => {
  const normalized = normalizeQuickSlot(slot)
  if (normalized == null) return { success: false, message: '存档位无效' }
  try {
    const filePath = quickSlotPath(normalized)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return { success: true }
  } catch (error) {
    return { success: false, message: String(error) }
  }
})

ipcMain.handle('quickLoad', async (_event, slot?: number) => {
  if (!saveDir) return { success: false, message: '未指定存档文件夹' }
  try {
    const target = chooseQuickLoadSlot(slot)
    if (target == null) return { success: false, message: '快速存档位中没有存档' }
    const filePath = quickSlotPath(target)
    if (!fs.existsSync(filePath)) return { success: false, message: '该存档位为空' }
    const data = fs.readFileSync(filePath, 'utf-8')
    return { success: true, data, fileName: quickSlotFileName(target), slot: target }
  } catch (error) {
    return { success: false, message: String(error) }
  }
})

ipcMain.removeHandler('saveState')
ipcMain.handle('saveState', async (_event, data) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `pmdnd-${timestamp}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, data)
      return { success: true, filePath: filePath }
    } else {
      return { success: false, message: 'Save dialog canceled or no file path selected.' }
    }
  } catch (error) {
    console.error('Error saving file:', error)
    return { success: false, message: error }
  }
})

ipcMain.handle('quickSave', async (_event, data: string, slot?: number) => {
  if (!saveDir) return { success: false, message: '未指定存档文件夹' }
  try {
    fs.mkdirSync(saveDir, { recursive: true })
    const target = chooseQuickSaveSlot(slot)
    const filePath = quickSlotPath(target)
    fs.writeFileSync(filePath, data)
    const updatedAt = fs.statSync(filePath).mtimeMs
    return { success: true, filePath, slot: target, updatedAt }
  } catch (error) {
    return { success: false, message: String(error) }
  }
})

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1280,
    minHeight: 600,
    title: title,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const showMainWindow = (): void => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }

  mainWindow.once('ready-to-show', showMainWindow)
  // Some Electron/Windows combinations can finish loading a hidden window
  // without emitting ready-to-show. Do not leave a successfully loaded app
  // permanently hidden in that case.
  mainWindow.webContents.once('did-finish-load', showMainWindow)
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error('Renderer failed to load:', { errorCode, errorDescription, validatedURL })
      showMainWindow()
    }
  )

  mainWindow.on('close', (e) => {
    if (saveDir) {
      e.preventDefault()
      mainWindow.webContents.send('autoSave')
    }
  })

  ipcMain.on('autoSaveDone', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.pmdnd.calculator')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.setName(title)
  app.dock?.setIcon(icon)

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
