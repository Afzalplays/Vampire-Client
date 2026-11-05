/// <reference types="vite/client" />
interface Window {
  vampire?: {
    version: string;
    platform: string;
    listInstances(): Promise<Array<{ id: string; name: string; createdAt: string }>>;
    createInstance(name: string): Promise<{ id: string; name: string; createdAt: string }>;
    deleteInstance(id: string): Promise<{ success: boolean }>;
    getProfile(): Promise<{ active: string; names: string[] }>;
    getMicrosoftAccount(): Promise<{ authenticated: boolean; accountType: string; profile: { id: string; name: string } | null }>;
    loginMicrosoft(clientId: string): Promise<{ success: boolean; profile: { id: string; name: string }; encryptedStorage: boolean }>;
    logoutMicrosoft(): Promise<{ success: boolean }>;
    saveProfile(username: string): Promise<{ active: string; names: string[] }>;
    getSettings(): Promise<{ ram: number; javaPath: string; version: string; loader: string; clientId: string; instanceId?: string }>;
    saveSettings(settings: { ram?: number; javaPath?: string; version?: string; loader?: string; clientId?: string }): Promise<{ ram: number; javaPath: string; version: string; loader: string; clientId: string }>;
    listVersions(): Promise<Array<{ id: string; type: string; releaseTime: string }>>;
    getSystemMemory(): Promise<{ totalBytes: number; freeBytes: number; totalGB: number; freeGB: number }>;
    detectJava(javaPath?: string): Promise<{ success: boolean; executable: string; version: string; output: string; platform: string; architecture: string }>;
    readLogs(): Promise<string>;
    exportLogs(): Promise<{ canceled?: boolean; filePath?: string }>;
    installVersion(args: { version: string; loader: string; instanceId?: string }): Promise<{ success: boolean; version: string; launchVersion: string }>;
    getInstallStatus(args: { version: string; loader: string ; instanceId?: string }): Promise<{ installed: boolean; launchVersion: string | null; reason: string | null }>;
    launchGame(args: { username: string; version: string; ram: number; javaPath?: string; instanceId?: string }): Promise<{ success: boolean; pid?: number }>;
    stopGame(): Promise<{ success: boolean; stopped: boolean; pid?: number }>;
    listMods(args: { version: string; loader: string ; instanceId?: string }): Promise<Array<{ fileName: string; enabled: boolean }>>;
    bulkToggleMods(args: { version: string; loader: string; enabled: boolean; instanceId?: string }): Promise<{ success: boolean; changed: number }>;
    exportModpack(args: { version: string; loader: string ; instanceId?: string }): Promise<{ canceled?: boolean; filePath?: string; count?: number }>;
    importModpack(args: { version: string; loader: string ; instanceId?: string }): Promise<{ canceled?: boolean; installed: number; failed: string[] }>;
    listResourcePacks(args: { version: string; loader: string ; instanceId?: string }): Promise<string[]>;
    importResourcePack(args: { version: string; loader: string ; instanceId?: string }): Promise<{ canceled?: boolean; fileName?: string }>;
    removeResourcePack(args: { version: string; loader: string; fileName: string; instanceId?: string }): Promise<{ success: boolean }>;
    checkModUpdates(args: { version: string; loader: string ; instanceId?: string }): Promise<Array<{ projectId: string; fileName: string; currentVersion: string; latestVersion: string; latestVersionName: string }>>;
    updateMod(args: { version: string; loader: string; projectId: string; instanceId?: string }): Promise<{ success: boolean; fileName: string }>;
    installMod(args: { projectId: string; minecraftVersion: string; loader: string; instanceId?: string }): Promise<{ success: boolean; fileName: string; installedFiles?: string[]; skippedOptional?: string[] }>;
    removeMod(args: { fileName: string; version: string; loader: string; instanceId?: string }): Promise<{ success: boolean }>;
    toggleMod(args: { fileName: string; version: string; loader: string ; instanceId?: string }): Promise<{ success: boolean; fileName: string; enabled: boolean }>;
    setPerformanceProfile(args: { profile: string; version: string; loader: string; instanceId?: string }): Promise<{ success: boolean; profile: string; fileName: string }>;
    applyPerformancePreset(args: { preset: string; version: string; loader: string; instanceId?: string }): Promise<{ success: boolean; preset: string; optionsFile: string }>;
    listShaderPacks(args: { version: string; loader: string ; instanceId?: string }): Promise<string[]>;
    importShaderPack(args: { version: string; loader: string ; instanceId?: string }): Promise<{ canceled?: boolean; fileName?: string }>;
    removeShaderPack(args: { version: string; loader: string; fileName: string ; instanceId?: string }): Promise<{ success: boolean }>;
    onGameStatus(callback: (message: string) => void): () => void;
  };
}