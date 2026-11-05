import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vampire", {
  version: "0.3.0",
  platform: process.platform,
  getProfile: () => ipcRenderer.invoke("profile:get"),
  getMicrosoftAccount: () => ipcRenderer.invoke("auth:get"),
  loginMicrosoft: (clientId: string) => ipcRenderer.invoke("auth:login", clientId),
  logoutMicrosoft: () => ipcRenderer.invoke("auth:logout"),
  saveProfile: (username: string) => ipcRenderer.invoke("profile:save", username),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: { ram?: number; javaPath?: string; version?: string; loader?: string; clientId?: string }) => ipcRenderer.invoke("settings:save", settings),
  listVersions: () => ipcRenderer.invoke("versions:list"),
  installVersion: (args: { version: string; loader: string }) => ipcRenderer.invoke("game:install", args),
  launchGame: (args: { username: string; version: string; ram: number; javaPath?: string }) => ipcRenderer.invoke("game:launch", args),
  listMods: (args: { version: string; loader: string }) => ipcRenderer.invoke("mods:list", args),
  bulkToggleMods: (args: { version: string; loader: string; enabled: boolean }) => ipcRenderer.invoke("mods:bulkToggle", args),
  exportModpack: (args: { version: string; loader: string }) => ipcRenderer.invoke("mods:exportPack", args),
  importModpack: (args: { version: string; loader: string }) => ipcRenderer.invoke("mods:importPack", args),
  listResourcePacks: (args: { version: string; loader: string }) => ipcRenderer.invoke("resourcepacks:list", args),
  importResourcePack: (args: { version: string; loader: string }) => ipcRenderer.invoke("resourcepacks:import", args),
  removeResourcePack: (args: { version: string; loader: string; fileName: string }) => ipcRenderer.invoke("resourcepacks:remove", args),
  checkModUpdates: (args: { version: string; loader: string }) => ipcRenderer.invoke("mods:updates", args),
  updateMod: (args: { version: string; loader: string; projectId: string }) => ipcRenderer.invoke("mods:update", args),
  installMod: (args: { projectId: string; minecraftVersion: string; loader: string }) => ipcRenderer.invoke("mods:install", args),
  removeMod: (args: { fileName: string; version: string; loader: string }) => ipcRenderer.invoke("mods:remove", args),
  toggleMod: (args: { fileName: string; version: string; loader: string }) => ipcRenderer.invoke("mods:toggle", args),
  setPerformanceProfile: (args: { profile: string; version: string; loader: string }) => ipcRenderer.invoke("performance:set", args),
  applyPerformancePreset: (args: { preset: string; version: string; loader: string }) => ipcRenderer.invoke("performance:applyPreset", args),
  listShaderPacks: (args: { version: string; loader: string }) => ipcRenderer.invoke("shaders:list", args),
  importShaderPack: (args: { version: string; loader: string }) => ipcRenderer.invoke("shaders:import", args),
  removeShaderPack: (args: { version: string; loader: string; fileName: string }) => ipcRenderer.invoke("shaders:remove", args),
  onGameStatus: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("game:status", listener);
    return () => ipcRenderer.removeListener("game:status", listener);
  }
});