/// <reference types="vite/client" />
interface Window {
  vampire?: {
    version: string;
    platform: string;
    getProfile(): Promise<{ active: string; names: string[] }>;
    getMicrosoftAccount(): Promise<{ authenticated: boolean; accountType: string; profile: { id: string; name: string } | null }>;
    loginMicrosoft(clientId: string): Promise<{ success: boolean; profile: { id: string; name: string }; encryptedStorage: boolean }>;
    logoutMicrosoft(): Promise<{ success: boolean }>;
    saveProfile(username: string): Promise<{ active: string; names: string[] }>;
    getSettings(): Promise<{ ram: number; javaPath: string; version: string; loader: string; clientId: string }>;
    saveSettings(settings: { ram?: number; javaPath?: string; version?: string; loader?: string; clientId?: string }): Promise<{ ram: number; javaPath: string; version: string; loader: string; clientId: string }>;
    listVersions(): Promise<Array<{ id: string; type: string; releaseTime: string }>>;
    installVersion(args: { version: string; loader: string }): Promise<{ success: boolean; version: string; launchVersion: string }>;
    launchGame(args: { username: string; version: string; ram: number; javaPath?: string }): Promise<{ success: boolean; pid?: number }>;
    listMods(args: { version: string; loader: string }): Promise<Array<{ fileName: string; enabled: boolean }>>;
    installMod(args: { projectId: string; minecraftVersion: string; loader: string }): Promise<{ success: boolean; fileName: string }>;
    removeMod(args: { fileName: string; version: string; loader: string }): Promise<{ success: boolean }>;
    toggleMod(args: { fileName: string; version: string; loader: string }): Promise<{ success: boolean; fileName: string; enabled: boolean }>;
    onGameStatus(callback: (message: string) => void): () => void;
  };
}