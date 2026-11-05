import { app, BrowserWindow, ipcMain, shell, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { launch, Version } from "@xmcl/core";
import { getVersionList, install, getLoaderArtifactListFor, installFabric, installDependencies } from "@xmcl/installer";
import { offline, MicrosoftAuthenticator, MojangClient } from "@xmcl/user";
import { PublicClientApplication } from "@azure/msal-node";

const allowedHosts = new Set(["modrinth.com", "www.modrinth.com", "github.com", "www.github.com"]);
let mainWindow: BrowserWindow | null = null;
let gameProcess: import("node:child_process").ChildProcess | null = null;

const dataRoot = () => path.join(app.getPath("userData"), "vampire-client");
const gameRoot = (version?: string, loader = "vanilla") => version ? path.join(dataRoot(), "instances", version + "-" + loader) : path.join(dataRoot(), "game");
const modsRoot = (version?: string, loader = "vanilla") => path.join(gameRoot(version, loader), "mods");
const profilesFile = () => path.join(dataRoot(), "profiles.json");
const settingsFile = () => path.join(dataRoot(), "settings.json");
const installedVersionsFile = () => path.join(dataRoot(), "installed-versions.json");
const microsoftSessionFile = () => path.join(dataRoot(), "microsoft-session.bin");
const accountFile = () => path.join(dataRoot(), "account.json");
let memoryMicrosoftSession: { accessToken: string; expiresAt: number; profile: { id: string; name: string } } | null = null;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}
async function getMicrosoftSession() {
  if (memoryMicrosoftSession && memoryMicrosoftSession.expiresAt > Date.now() + 60_000) return memoryMicrosoftSession;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(microsoftSessionFile(), "utf8");
    const decrypted = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    const session = JSON.parse(decrypted);
    if (session?.accessToken && session?.profile?.id && session?.profile?.name && session.expiresAt > Date.now() + 60_000) {
      memoryMicrosoftSession = session;
      return session;
    }
  } catch { /* no stored or decryptable Microsoft session */ }
  return null;
}
async function saveMicrosoftSession(session: { accessToken: string; expiresAt: number; profile: { id: string; name: string } }) {
  memoryMicrosoftSession = session;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(session));
    await fs.mkdir(dataRoot(), { recursive: true });
    await fs.writeFile(microsoftSessionFile(), encrypted.toString("base64"), { mode: 0o600 });
  }
}

async function verifyModrinthDownload(response: Response, file: any) {
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 150 * 1024 * 1024) throw new Error("Mod file exceeds the 150 MB safety limit.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 150 * 1024 * 1024) throw new Error("Mod file exceeds the 150 MB safety limit.");
  const hashes = file?.hashes || {};
  const algorithm = hashes.sha512 ? "sha512" : hashes.sha1 ? "sha1" : null;
  const expected = algorithm ? String(hashes[algorithm]).toLowerCase() : "";
  if (!algorithm || !/^[a-f0-9]+$/.test(expected)) throw new Error("Modrinth did not provide a usable file checksum.");
  const actual = createHash(algorithm).update(bytes).digest("hex").toLowerCase();
  if (actual !== expected) throw new Error("Mod file checksum verification failed; download rejected.");
  return bytes;
}

function safeInstance(version: string, loader: string) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(version || ""))) throw new Error("Invalid Minecraft instance version.");
  if (!["vanilla", "fabric"].includes(String(loader || ""))) throw new Error("Invalid Minecraft mod loader.");
  return { root: gameRoot(version, loader), mods: modsRoot(version, loader) };
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
ipcMain.handle("auth:get", async () => {
  const session = await getMicrosoftSession();
  const account = await readJson<{ type: string }>(accountFile(), { type: "offline" });
  return { authenticated: Boolean(session), accountType: account.type, profile: session?.profile || null };
});
ipcMain.handle("auth:logout", async () => {
  memoryMicrosoftSession = null;
  await fs.unlink(microsoftSessionFile()).catch(() => undefined);
  await writeJson(accountFile(), { type: "offline" });
  return { success: true };
});
ipcMain.handle("auth:login", async (_event, clientId: string) => {
  if (!/^[0-9a-fA-F-]{36}$/.test(String(clientId || ""))) throw new Error("Enter a valid Microsoft app Client ID first.");
  sendStatus("Starting Microsoft device-code sign-in…");
  const msal = new PublicClientApplication({ auth: { clientId, authority: "https://login.microsoftonline.com/consumers" } });
  const tokenResult = await msal.acquireTokenByDeviceCode({
    scopes: ["XboxLive.signin", "offline_access"],
    deviceCodeCallback: (response) => sendStatus(response.message)
  });
  if (!tokenResult?.accessToken) throw new Error("Microsoft sign-in did not return an access token.");
  const signal = new AbortController().signal;
  const authenticator = new MicrosoftAuthenticator({});
  const { minecraftXstsResponse } = await authenticator.acquireXBoxToken(tokenResult.accessToken, signal);
  const claim = minecraftXstsResponse.DisplayClaims?.xui?.[0];
  if (!claim?.uhs) throw new Error("Xbox authentication did not return a valid user hash.");
  const minecraftAuth = await authenticator.loginMinecraftWithXBox(claim.uhs, minecraftXstsResponse.Token, signal);
  const mojang = new MojangClient({});
  const ownership = await mojang.checkGameOwnership(minecraftAuth.access_token, signal);
  if (!ownership.items?.some((item: any) => item.name === "game_minecraft" || item.name === "product_minecraft")) throw new Error("This Microsoft account does not have Minecraft Java Edition entitlement.");
  const gameProfile = await mojang.getProfile(minecraftAuth.access_token, signal);
  const session = { accessToken: minecraftAuth.access_token, expiresAt: Date.now() + Math.max(60, minecraftAuth.expires_in - 120) * 1000, profile: { id: gameProfile.id, name: gameProfile.name } };
  await saveMicrosoftSession(session);
  await writeJson(accountFile(), { type: "microsoft", profile: session.profile });
  await writeJson(profilesFile(), { active: gameProfile.name, names: [gameProfile.name] });
  sendStatus("Signed in as " + gameProfile.name + ".");
  return { success: true, profile: session.profile, encryptedStorage: safeStorage.isEncryptionAvailable() };
});
ipcMain.handle("settings:get", async () =>
  readJson(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric", clientId: "" })
);
ipcMain.handle("settings:save", async (_event, settings: { ram?: number; javaPath?: string; version?: string; loader?: string; clientId?: string }) => {
  const current = await readJson(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric", clientId: "" });
  const next = {
    ram: Math.max(1, Math.min(16, Number(settings.ram ?? current.ram))),
    javaPath: typeof settings.javaPath === "string" && settings.javaPath.length < 1024 ? settings.javaPath : current.javaPath,
    version: typeof settings.version === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(settings.version) ? settings.version : current.version,
    loader: ["vanilla", "fabric"].includes(String(settings.loader)) ? settings.loader : current.loader,
    clientId: typeof settings.clientId === "string" && settings.clientId.length <= 64 ? settings.clientId : current.clientId
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
  const root = gameRoot(versionId, loader);
  await fs.mkdir(root, { recursive: true });
  await install(metadata, root);

  let launchVersion = versionId;
  if (loader === "fabric") {
    sendStatus("Installing Fabric loader for Minecraft " + versionId + "…");
    const loaders = await getLoaderArtifactListFor(versionId, {});
    const selected = loaders.find((item: any) => item.loader?.stable) || loaders[0];
    if (!selected?.loader?.version) throw new Error("Fabric loader metadata is unavailable.");
    launchVersion = await installFabric(selected, root, { side: "client" });
    const resolved = await Version.parse(root, launchVersion);
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
  const settings = await readJson(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric", clientId: "" });
  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  const activeLoader = ["vanilla", "fabric"].includes(settings.loader) ? settings.loader : "vanilla";
  const launchVersion = installed[args.version + ":" + activeLoader] || args.version;
  const root = safeInstance(args.version, activeLoader).root;
  const javaPath = typeof args.javaPath === "string" && args.javaPath.trim() ? args.javaPath.trim() : settings.javaPath;
  const memory = Math.max(1, Math.min(16, Number(args.ram) || settings.ram));
  const accountState = await readJson<{ type: string }>(accountFile(), { type: "offline" });
  const microsoft = await getMicrosoftSession();
  if (accountState.type === "microsoft" && !microsoft) throw new Error("Microsoft session expired or secure storage is unavailable. Sign in with Microsoft again.");
  const user = microsoft ? null : offline(username);
  const selectedProfile = microsoft ? microsoft.profile : user!.selectedProfile;
  const accessToken = microsoft ? microsoft.accessToken : user!.accessToken;
  sendStatus("Checking installed game files…");
  const proc = await launch({
    gamePath: root,
    javaPath,
    version: launchVersion,
    gameProfile: selectedProfile,
    accessToken,
    userType: microsoft ? undefined : "legacy",
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

ipcMain.handle("mods:list", async (_event, args: { version: string; loader: string }) => {
  const directory = safeInstance(args.version, args.loader).mods;
  await fs.mkdir(directory, { recursive: true });
  const files = await fs.readdir(directory, { withFileTypes: true });
  return files.filter(file => file.isFile() && (file.name.toLowerCase().endsWith(".jar") || file.name.toLowerCase().endsWith(".jar.disabled")))
    .map(file => ({ fileName: file.name, enabled: file.name.toLowerCase().endsWith(".jar") }));
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
  const bytes = await verifyModrinthDownload(download, file);
  const fileName = path.basename(String(file.filename || "mod.jar")).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!fileName.toLowerCase().endsWith(".jar")) throw new Error("Modrinth returned a non-JAR file.");
  const directory = modsRoot(mcVersion, loader);
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, fileName);
  try {
    await fs.writeFile(destination, bytes, { flag: "wx" });
  } catch (error: any) {
    if (error.code === "EEXIST") throw new Error("This mod file is already installed.");
    throw error;
  }
  return { success: true, fileName };
});
ipcMain.handle("mods:remove", async (_event, args: { fileName: string; version: string; loader: string }) => {
  const name = path.basename(String(args.fileName));
  if (name !== args.fileName || !(name.toLowerCase().endsWith(".jar") || name.toLowerCase().endsWith(".jar.disabled"))) throw new Error("Invalid mod filename.");
  await fs.unlink(path.join(safeInstance(args.version, args.loader).mods, name));
  return { success: true };
});
ipcMain.handle("mods:toggle", async (_event, args: { fileName: string; version: string; loader: string }) => {
  const name = path.basename(String(args.fileName));
  if (name !== args.fileName || !(name.toLowerCase().endsWith(".jar") || name.toLowerCase().endsWith(".jar.disabled"))) throw new Error("Invalid mod filename.");
  const directory = safeInstance(args.version, args.loader).mods;
  const enabled = name.toLowerCase().endsWith(".jar");
  const nextName = enabled ? name + ".disabled" : name.slice(0, -".disabled".length);
  await fs.rename(path.join(directory, name), path.join(directory, nextName));
  return { success: true, fileName: nextName, enabled: !enabled };
});

ipcMain.handle("performance:set", async (_event, args: { profile: string; version: string; loader: string }) => {
  const profile = String(args.profile || "");
  if (!["sodium", "vulkanmod"].includes(profile)) throw new Error("Unknown performance renderer profile.");
  if (args.loader !== "fabric") throw new Error("Performance renderer profiles require a Fabric instance.");
  const instance = safeInstance(args.version, args.loader);
  const projectId = profile === "sodium" ? "AANobbMI" : "vulkanmod";
  const endpoint = "https://api.modrinth.com/v2/project/" + projectId +
    "/version?game_versions=" + encodeURIComponent(JSON.stringify([args.version])) +
    "&loaders=" + encodeURIComponent(JSON.stringify(["fabric"]));
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Modrinth renderer lookup failed (" + response.status + ").");
  const versions = await response.json() as any[];
  const selected = versions[0];
  if (!selected?.files?.length) throw new Error("No compatible " + profile + " build exists for Minecraft " + args.version + ".");
  const file = selected.files.find((item: any) => item.primary) || selected.files[0];
  const url = new URL(file.url);
  if (url.protocol !== "https:" || url.hostname !== "cdn.modrinth.com") throw new Error("Renderer download host was rejected.");
  const download = await fetch(url);
  if (!download.ok) throw new Error("Renderer download failed (" + download.status + ").");
  const bytes = await verifyModrinthDownload(download, file);
  const fileName = path.basename(String(file.filename || profile + ".jar")).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!fileName.toLowerCase().endsWith(".jar")) throw new Error("Modrinth returned a non-JAR renderer file.");
  await fs.mkdir(instance.mods, { recursive: true });
  const files = await fs.readdir(instance.mods);
  for (const existing of files) {
    const lower = existing.toLowerCase();
    const isRenderer = lower.includes("sodium") || lower.includes("vulkanmod");
    const isOpposite = profile === "sodium" ? lower.includes("vulkanmod") : lower.includes("sodium");
    if (isRenderer && isOpposite && lower.endsWith(".jar")) {
      await fs.rename(path.join(instance.mods, existing), path.join(instance.mods, existing + ".disabled"));
    }
  }
  const disabledTarget = path.join(instance.mods, fileName + ".disabled");
  const enabledTarget = path.join(instance.mods, fileName);
  try {
    await fs.access(disabledTarget);
    await fs.rename(disabledTarget, enabledTarget);
  } catch {
    try {
      await fs.writeFile(enabledTarget, bytes, { flag: "wx" });
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  return { success: true, profile, fileName };
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
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      const isDevServer = !app.isPackaged && parsed.origin === "http://127.0.0.1:5173";
      if (parsed.protocol !== "file:" && !isDevServer) event.preventDefault();
    } catch { event.preventDefault(); }
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
