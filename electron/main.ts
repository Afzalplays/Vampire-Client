import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { launch, Version } from "@xmcl/core";
import { getVersionList, install, getFabricLoaders, installFabric, installDependencies } from "@xmcl/installer";
import { offline } from "@xmcl/user";

const allowedHosts = new Set(["modrinth.com", "www.modrinth.com", "github.com", "www.github.com"]);
let mainWindow: BrowserWindow | null = null;
let gameProcess: import("node:child_process").ChildProcess | null = null;

const dataRoot = () => path.join(app.getPath("userData"), "vampire-client");
const gameRoot = () => path.join(dataRoot(), "game");
const modsRoot = () => path.join(gameRoot(), "mods");
const profilesFile = () => path.join(dataRoot(), "profiles.json");
const settingsFile = () => path.join(dataRoot(), "settings.json");
const installedVersionsFile = () => path.join(dataRoot(), "installed-versions.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}
function safeName(value: string) {
  const name = value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error("Username must be 3–16 letters, numbers or underscores.");
  return name;
}
function sendStatus(message: string) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("game:status", message);
}

async function listVersions() {
  const manifest = await getVersionList();
  return manifest.versions
    .filter((v: any) => v.type === "release" || v.type === "snapshot")
    .map((v: any) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

ipcMain.handle("profile:get", async () =>
  readJson<{ active: string; names: string[] }>(profilesFile(), { active: "Player", names: ["Player"] })
);
ipcMain.handle("profile:save", async (_event, username: string) => {
  const name = safeName(username);
  const current = await readJson<{ active: string; names: string[] }>(profilesFile(), { active: "Player", names: ["Player"] });
  const profiles = { active: name, names: Array.from(new Set([name, ...current.names])).slice(0, 20) };
  await writeJson(profilesFile(), profiles);
  return profiles;
});
ipcMain.handle("settings:get", async () =>
  readJson(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric" })
);
ipcMain.handle("settings:save", async (_event, settings: { ram?: number; javaPath?: string; version?: string; loader?: string }) => {
  const current = await readJson(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric" });
  const next = {
    ram: Math.max(1, Math.min(16, Number(settings.ram ?? current.ram))),
    javaPath: typeof settings.javaPath === "string" && settings.javaPath.length < 1024 ? settings.javaPath : current.javaPath,
    version: typeof settings.version === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(settings.version) ? settings.version : current.version,
    loader: ["vanilla", "fabric"].includes(String(settings.loader)) ? settings.loader : current.loader
  };
  await writeJson(settingsFile(), next);
  return next;
});
ipcMain.handle("versions:list", async () => listVersions());

ipcMain.handle("game:install", async (_event, args: { version: string; loader: string }) => {
  const versionId = String(args.version || "");
  const loader = String(args.loader || "vanilla");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(versionId)) throw new Error("Invalid Minecraft version ID.");
  if (!["vanilla", "fabric"].includes(loader)) throw new Error("This build supports Vanilla and Fabric profiles.");
  sendStatus("Preparing Minecraft " + versionId + " installation…");
  const manifest = await getVersionList();
  const metadata = manifest.versions.find((v: any) => v.id === versionId);
  if (!metadata) throw new Error("Minecraft version was not found in the official manifest.");
  await fs.mkdir(gameRoot(), { recursive: true });
  await install(metadata, gameRoot());

  let launchVersion = versionId;
  if (loader === "fabric") {
    sendStatus("Installing Fabric loader for Minecraft " + versionId + "…");
    const loaders = await getFabricLoaders({});
    const selected = loaders.find((item: any) => item.stable) || loaders[0];
    if (!selected?.version) throw new Error("Fabric loader metadata is unavailable.");
    launchVersion = await installFabric({
      minecraft: gameRoot(),
      minecraftVersion: versionId,
      version: selected.version,
      side: "client"
    });
    const resolved = await Version.parse(gameRoot(), launchVersion);
    await installDependencies(resolved, {});
  }

  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  installed[versionId + ":" + loader] = launchVersion;
  await writeJson(installedVersionsFile(), installed);
  sendStatus("Minecraft " + versionId + (loader === "fabric" ? " + Fabric" : "") + " is installed.");
  return { success: true, version: versionId, launchVersion };
});

ipcMain.handle("game:launch", async (_event, args: { username: string; version: string; ram: number; javaPath?: string }) => {
  if (gameProcess && gameProcess.exitCode === null) throw new Error("Minecraft is already running.");
  const username = safeName(args.username);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(args.version)) throw new Error("Invalid Minecraft version.");
  const settings = await readJson(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric" });
  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  const launchVersion = installed[args.version + ":" + settings.loader] || args.version;
  const javaPath = typeof args.javaPath === "string" && args.javaPath.trim() ? args.javaPath.trim() : settings.javaPath;
  const memory = Math.max(1, Math.min(16, Number(args.ram) || settings.ram));
  const user = offline(username);
  sendStatus("Checking installed game files…");
  const proc = await launch({
    gamePath: gameRoot(),
    javaPath,
    version: launchVersion,
    gameProfile: user.selectedProfile,
    accessToken: user.accessToken,
    userType: "legacy",
    launcherName: "Vampire Client",
    launcherBrand: "Vampire Studios",
    maxMemory: memory * 1024,
    minMemory: Math.min(1024, memory * 512),
    extraJVMArgs: ["-XX:+UseG1GC"]
  });
  gameProcess = proc;
  sendStatus("Minecraft launched (PID " + proc.pid + ").");
  proc.once("error", error => sendStatus("Minecraft process error: " + error.message));
  proc.once("close", code => {
    sendStatus("Minecraft closed with exit code " + String(code));
    gameProcess = null;
  });
  return { success: true, pid: proc.pid };
});

ipcMain.handle("mods:list", async () => {
  await fs.mkdir(modsRoot(), { recursive: true });
  const files = await fs.readdir(modsRoot(), { withFileTypes: true });
  return files.filter(file => file.isFile() && file.name.toLowerCase().endsWith(".jar")).map(file => file.name);
});
ipcMain.handle("mods:install", async (_event, args: { projectId: string; minecraftVersion: string; loader: string }) => {
  const projectId = String(args.projectId || "");
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(projectId)) throw new Error("Invalid Modrinth project ID.");
  const loader = String(args.loader || "fabric");
  if (loader !== "fabric") throw new Error("Mod downloads in this preview are configured for Fabric profiles only.");
  const mcVersion = String(args.minecraftVersion || "");
  if (!/^[0-9A-Za-z._-]{1,32}$/.test(mcVersion)) throw new Error("Invalid Minecraft version.");
  const endpoint = "https://api.modrinth.com/v2/project/" + encodeURIComponent(projectId) +
    "/version?game_versions=" + encodeURIComponent(JSON.stringify([mcVersion])) +
    "&loaders=" + encodeURIComponent(JSON.stringify([loader]));
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Modrinth version lookup failed (" + response.status + ").");
  const versions = await response.json() as any[];
  const selected = versions[0];
  if (!selected?.files?.length) throw new Error("No compatible file was found for this Minecraft version and loader.");
  const file = selected.files.find((item: any) => item.primary) || selected.files[0];
  const fileUrl = new URL(file.url);
  if (fileUrl.protocol !== "https:" || fileUrl.hostname !== "cdn.modrinth.com") throw new Error("Mod download host was rejected.");
  const download = await fetch(fileUrl);
  if (!download.ok) throw new Error("Mod download failed (" + download.status + ").");
  const fileName = path.basename(String(file.filename || "mod.jar")).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!fileName.toLowerCase().endsWith(".jar")) throw new Error("Modrinth returned a non-JAR file.");
  await fs.mkdir(modsRoot(), { recursive: true });
  const destination = path.join(modsRoot(), fileName);
  try {
    await fs.writeFile(destination, Buffer.from(await download.arrayBuffer()), { flag: "wx" });
  } catch (error: any) {
    if (error.code === "EEXIST") throw new Error("This mod file is already installed.");
    throw error;
  }
  return { success: true, fileName };
});
ipcMain.handle("mods:remove", async (_event, fileName: string) => {
  const name = path.basename(String(fileName));
  if (name !== fileName || !name.toLowerCase().endsWith(".jar")) throw new Error("Invalid mod filename.");
  await fs.unlink(path.join(modsRoot(), name));
  return { success: true };
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1050, minHeight: 680,
    backgroundColor: "#09090d", title: "Vampire Client",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && allowedHosts.has(parsed.hostname)) void shell.openExternal(url);
    } catch { /* reject malformed URLs */ }
    return { action: "deny" };
  });
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}
app.whenReady().then(() => {
  void fs.mkdir(dataRoot(), { recursive: true });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
