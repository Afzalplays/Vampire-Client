/// <reference types="vite/client" />
interface Window {
  vampire?: {
    version: string;
    platform: string;
    getProfile(): Promise<{ active: string; names: string[] }>;\n    getMicrosoftAccount(): Promise<{ authenticated: boolean; profile: { id: string; name: string } | null }>;\n    loginMicrosoft(clientId: string): Promise<{ success: boolean; profile: { id: string; name: string }; encryptedStorage: boolean }>;\n    logoutMicrosoft(): Promise<{ success: boolean }>;
    saveProfile(username: string): Promise<{ active: string; names: string[] }>;
    getSettings(): Promise<{ ram: number; javaPath: string; version: string; loader: string; clientId: string }>;
    saveSettings(settings: { ram?: number; javaPath?: string; version?: string; loader?: string; clientId?: string }): Promise<{ ram: number; javaPath: string; version: string; loader: string; clientId: string }>;
    listVersions(): Promise<Array<{ id: string; type: string; releaseTime: string }>>;
    installVersion(args: { version: string; loader: string }): Promise<{ success: boolean; version: string; launchVersion: string }>;
    launchGame(args: { username: string; version: string; ram: number; javaPath?: string }): Promise<{ success: boolean; pid?: number }>;
    listMods(): Promise<string[]>;
    installMod(args: { projectId: string; minecraftVersion: string; loader: string }): Promise<{ success: boolean; fileName: string }>;
    removeMod(fileName: string): Promise<{ success: boolean }>;
    onGameStatus(callback: (message: string) => void): () => void;
  };
}