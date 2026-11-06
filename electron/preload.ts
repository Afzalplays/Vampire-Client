import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vampire", {
  version: "0.3.0",
  openBillingPortal: () => ipcRenderer.invoke("billing:openPortal"),
  platform: process.platform,
  listInstances: () => ipcRenderer.invoke("instances:list"),
  createInstance: (name: string) => ipcRenderer.invoke("instances:create", name),
  deleteInstance: (id: string) => ipcRenderer.invoke("instances:delete", id),
  listWorldServers: () => ipcRenderer.invoke("servers:list"),
  createWorldServer: (args: { name: string; version: string; ramGB?: number }) => ipcRenderer.invoke("servers:create", args),
  startWorldServer: (args: { id: string; javaPath?: string; ramGB?: number; acceptEula: boolean }) => ipcRenderer.invoke("servers:start", args),
  stopWorldServer: (id: string) => ipcRenderer.invoke("servers:stop", id),
  getWorldServerInfo: (id: string) => ipcRenderer.invoke("servers:info", id),
  sendWorldServerCommand: (args: { id: string; command: string }) => ipcRenderer.invoke("servers:command", args),
  onWorldServerOutput: (callback: (event: { id: string; text: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; text: string }) => callback(payload);
    ipcRenderer.on("server:output", listener);
    return () => ipcRenderer.removeListener("server:output", listener);
  },
  deleteWorldServer: (id: string) => ipcRenderer.invoke("servers:delete", id),
  getProfile: () => ipcRenderer.invoke("profile:get"),
  getMicrosoftAccount: () => ipcRenderer.invoke("auth:get"),
  loginMicrosoft: (clientId: string) => ipcRenderer.invoke("auth:login", clientId),
  logoutMicrosoft: () => ipcRenderer.invoke("auth:logout"),
  listMicrosoftAccounts: () => ipcRenderer.invoke("auth:accounts"),
  switchMicrosoftAccount: (accountId: string) => ipcRenderer.invoke("auth:switch", accountId),
  saveProfile: (username: string) => ipcRenderer.invoke("profile:save", username),
  getSettings: (instanceId?: string) => ipcRenderer.invoke("settings:get", instanceId),
  saveSettings: (settings: { ram?: number; javaPath?: string; version?: string; loader?: string; clientId?: string; instanceId?: string }) => ipcRenderer.invoke("settings:save", settings),
  listVersions: () => ipcRenderer.invoke("versions:list"),
  getSystemMemory: () => ipcRenderer.invoke("system:memory"),
  detectJava: (javaPath?: string) => ipcRenderer.invoke("java:detect", { javaPath }),
  installJava21: () => ipcRenderer.invoke("java:install"),
  readLogs: () => ipcRenderer.invoke("logs:read"),
  exportLogs: () => ipcRenderer.invoke("logs:export"),
  installVersion: (args: { version: string; loader: string; instanceId?: string }) => ipcRenderer.invoke("game:install", args),
  getInstallStatus: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("game:installStatus", args),
  launchGame: (args: { username: string; version: string; ram: number; javaPath?: string; instanceId?: string }) => ipcRenderer.invoke("game:launch", args),
  stopGame: () => ipcRenderer.invoke("game:stop"),
  listMods: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("mods:list", args),
  bulkToggleMods: (args: { version: string; loader: string; enabled: boolean; instanceId?: string }) => ipcRenderer.invoke("mods:bulkToggle", args),
  exportModpack: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("mods:exportPack", args),
  importModpack: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("mods:importPack", args),
  listResourcePacks: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("resourcepacks:list", args),
  inspectResourcePack: (args: { version: string; loader: string; fileName: string; instanceId?: string }) => ipcRenderer.invoke("resourcepacks:inspect", args),
  openResourcePackFolder: (args: { version: string; loader: string; instanceId?: string }) => ipcRenderer.invoke("resourcepacks:openFolder", args),
  importResourcePack: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("resourcepacks:import", args),
  removeResourcePack: (args: { version: string; loader: string; fileName: string; instanceId?: string }) => ipcRenderer.invoke("resourcepacks:remove", args),
  checkModUpdates: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("mods:updates", args),
  updateMod: (args: { version: string; loader: string; projectId: string; instanceId?: string }) => ipcRenderer.invoke("mods:update", args),
  installMod: (args: { projectId: string; minecraftVersion: string; loader: string; instanceId?: string }) => ipcRenderer.invoke("mods:install", args),
  removeMod: (args: { fileName: string; version: string; loader: string; instanceId?: string }) => ipcRenderer.invoke("mods:remove", args),
  toggleMod: (args: { fileName: string; version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("mods:toggle", args),
  setPerformanceProfile: (args: { profile: string; version: string; loader: string; instanceId?: string }) => ipcRenderer.invoke("performance:set", args),
  applyPerformancePreset: (args: { preset: string; version: string; loader: string; instanceId?: string }) => ipcRenderer.invoke("performance:applyPreset", args),
  listShaderPacks: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("shaders:list", args),
  importShaderPack: (args: { version: string; loader: string ; instanceId?: string }) => ipcRenderer.invoke("shaders:import", args),
  downloadShaderPack: (args: { slug: string; version: string; loader: string; instanceId?: string }) => ipcRenderer.invoke("shaders:download", args),
  removeShaderPack: (args: { version: string; loader: string; fileName: string ; instanceId?: string }) => ipcRenderer.invoke("shaders:remove", args),
  onGameStatus: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("game:status", listener);
    return () => ipcRenderer.removeListener("game:status", listener);
  }
});