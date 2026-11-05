import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vampire", {
  version: "0.3.0",
  platform: process.platform,
  getProfile: () => ipcRenderer.invoke("profile:get"),\n  getMicrosoftAccount: () => ipcRenderer.invoke("auth:get"),\n  loginMicrosoft: (clientId: string) => ipcRenderer.invoke("auth:login", clientId),\n  logoutMicrosoft: () => ipcRenderer.invoke("auth:logout"),
  saveProfile: (username: string) => ipcRenderer.invoke("profile:save", username),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: { ram?: number; javaPath?: string; version?: string; loader?: string }) => ipcRenderer.invoke("settings:save", settings),
  listVersions: () => ipcRenderer.invoke("versions:list"),
  installVersion: (args: { version: string; loader: string }) => ipcRenderer.invoke("game:install", args),
  launchGame: (args: { username: string; version: string; ram: number; javaPath?: string }) => ipcRenderer.invoke("game:launch", args),
  listMods: () => ipcRenderer.invoke("mods:list"),
  installMod: (args: { projectId: string; minecraftVersion: string; loader: string }) => ipcRenderer.invoke("mods:install", args),
  removeMod: (fileName: string) => ipcRenderer.invoke("mods:remove", fileName),
  onGameStatus: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("game:status", listener);
    return () => ipcRenderer.removeListener("game:status", listener);
  }
});