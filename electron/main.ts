import { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, session } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { totalmem, freemem, networkInterfaces } from "node:os";
import { launch, Version } from "@xmcl/core";
import { getVersionList, install, getLoaderArtifactListFor, installFabric, installQuiltVersion, installDependencies } from "@xmcl/installer";
import { selectQuiltLoaderVersion } from "./loader-utils";
import { offline, MicrosoftAuthenticator, MojangClient } from "@xmcl/user";
import { PublicClientApplication } from "@azure/msal-node";
import { installJavaRuntime, parseJavaMajorVersion, requiredJavaMajorForMinecraft } from "./java-runtime";
import { isSafeResourcePackFilename } from "./resource-pack-utils";
import { summarizeLatestRelease } from "./update-utils";

const allowedHosts = new Set(["modrinth.com", "www.modrinth.com", "github.com", "www.github.com", "billing.vampirenodes.in"]);
let mainWindow: BrowserWindow | null = null;
let gameProcess: import("node:child_process").ChildProcess | null = null;
let gameStopTimer: ReturnType<typeof setTimeout> | null = null;
const worldServerProcesses = new Map<string, ChildProcess>();
const worldServerLastExit = new Map<string, { code: number | null; error: string | null; at: string }>();
const worldServerStopTimers = new Map<string, ReturnType<typeof setTimeout>>();

const dataRoot = () => path.join(app.getPath("userData"), "vampire-client");
const gameRoot = (version?: string, loader = "vanilla", instanceId = "default") => {
  if (!version) return path.join(dataRoot(), "game");
  return instanceId === "default"
    ? path.join(dataRoot(), "instances", version + "-" + loader)
    : path.join(dataRoot(), "instances", "named", instanceId);
};
const modsRoot = (version?: string, loader = "vanilla", instanceId = "default") => path.join(gameRoot(version, loader, instanceId), "mods");
const instancesFile = () => path.join(dataRoot(), "instances.json");
const instanceKey = (version: string, loader: string, instanceId = "default") => version + ":" + loader + (instanceId === "default" ? "" : ":" + instanceId);
const profilesFile = () => path.join(dataRoot(), "profiles.json");
const settingsFile = () => path.join(dataRoot(), "settings.json");
const installedVersionsFile = () => path.join(dataRoot(), "installed-versions.json");
const microsoftSessionFile = () => path.join(dataRoot(), "microsoft-session.bin");
const microsoftCacheFile = () => path.join(dataRoot(), "msal-cache.bin");
const accountFile = () => path.join(dataRoot(), "account.json");
type MicrosoftSession = { accessToken: string; expiresAt: number; profile: { id: string; name: string }; microsoftAccountId?: string };
let memoryMicrosoftSession: MicrosoftSession | null = null;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}
async function writeEncryptedFile(file: string, value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable; Microsoft account persistence is disabled.");
  const encrypted = safeStorage.encryptString(value);
  await fs.mkdir(dataRoot(), { recursive: true });
  const temporary = file + ".tmp";
  await fs.writeFile(temporary, encrypted.toString("base64"), { mode: 0o600 });
  await fs.rename(temporary, file);
}
async function readEncryptedFile(file: string) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(file, "utf8");
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch { return null; }
}
function createMicrosoftClient(clientId: string) {
  const cachePlugin = {
    beforeCacheAccess: async (context: any) => {
      const serialized = await readEncryptedFile(microsoftCacheFile());
      if (serialized) context.tokenCache.deserialize(serialized);
    },
    afterCacheAccess: async (context: any) => {
      if (context.cacheHasChanged && safeStorage.isEncryptionAvailable()) {
        await writeEncryptedFile(microsoftCacheFile(), context.tokenCache.serialize());
      }
    }
  };
  return new PublicClientApplication({
    auth: { clientId, authority: "https://login.microsoftonline.com/consumers" },
    cache: { cachePlugin }
  });
}
async function exchangeMicrosoftToken(accessToken: string, expectedProfileId?: string): Promise<MicrosoftSession> {
  const signal = new AbortController().signal;
  const authenticator = new MicrosoftAuthenticator({});
  const { minecraftXstsResponse } = await authenticator.acquireXBoxToken(accessToken, signal);
  const claim = minecraftXstsResponse.DisplayClaims?.xui?.[0];
  if (!claim?.uhs) throw new Error("Xbox authentication did not return a valid user hash.");
  const minecraftAuth = await authenticator.loginMinecraftWithXBox(claim.uhs, minecraftXstsResponse.Token, signal);
  const mojang = new MojangClient({});
  const ownership = await mojang.checkGameOwnership(minecraftAuth.access_token, signal);
  if (!ownership.items?.some((item: any) => item.name === "game_minecraft" || item.name === "product_minecraft")) {
    throw new Error("This Microsoft account does not have Minecraft Java Edition entitlement.");
  }
  const gameProfile = await mojang.getProfile(minecraftAuth.access_token, signal);
  if (expectedProfileId && gameProfile.id !== expectedProfileId) {
    throw new Error("The cached Microsoft account no longer matches the active Minecraft profile. Sign in again.");
  }
  return {
    accessToken: minecraftAuth.access_token,
    expiresAt: Date.now() + Math.max(60, minecraftAuth.expires_in - 120) * 1000,
    profile: { id: gameProfile.id, name: gameProfile.name }
  };
}
async function refreshMicrosoftSession(): Promise<MicrosoftSession | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const saved = await readEncryptedFile(microsoftSessionFile());
  if (!saved) return null;
  let previous: MicrosoftSession;
  try { previous = JSON.parse(saved) as MicrosoftSession; } catch { return null; }
  const settings = await readJson<{ clientId?: string }>(settingsFile(), {});
  const clientId = String(settings.clientId || "");
  if (!/^[0-9a-fA-F-]{36}$/.test(clientId) || !previous.profile?.id) return null;
  try {
    const msal = createMicrosoftClient(clientId);
    const accounts = await msal.getTokenCache().getAllAccounts();
    const account = (previous.microsoftAccountId
      ? accounts.find(item => item.homeAccountId === previous.microsoftAccountId)
      : undefined) || accounts[0];
    if (!account) return null;
    const tokenResult = await msal.acquireTokenSilent({ account, scopes: ["XboxLive.signin", "offline_access"] });
    if (!tokenResult?.accessToken) return null;
    const refreshed = await exchangeMicrosoftToken(tokenResult.accessToken, previous.profile.id);
    refreshed.microsoftAccountId = account.homeAccountId;
    await saveMicrosoftSession(refreshed);
    return refreshed;
  } catch (error) {
    sendStatus("Microsoft session refresh failed. Sign in again if prompted.");
    return null;
  }
}
async function getMicrosoftSession(): Promise<MicrosoftSession | null> {
  if (memoryMicrosoftSession && memoryMicrosoftSession.expiresAt > Date.now() + 60_000) return memoryMicrosoftSession;
  const decrypted = await readEncryptedFile(microsoftSessionFile());
  if (decrypted) {
    try {
      const session = JSON.parse(decrypted) as MicrosoftSession;
      if (session?.accessToken && session?.profile?.id && session?.profile?.name && session.expiresAt > Date.now() + 60_000) {
        memoryMicrosoftSession = session;
        return session;
      }
    } catch { /* invalid encrypted session payload */ }
  }
  return refreshMicrosoftSession();
}
async function saveMicrosoftSession(session: MicrosoftSession) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable. Microsoft account tokens cannot be saved safely.");
  }
  // Persist successfully before exposing the new session to the running app.
  await writeEncryptedFile(microsoftSessionFile(), JSON.stringify(session));
  memoryMicrosoftSession = session;
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

function safeInstance(version: string, loader: string, instanceId = "default") {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(version || ""))) throw new Error("Invalid Minecraft instance version.");
  if (!["vanilla", "fabric", "quilt"].includes(String(loader || ""))) throw new Error("Invalid Minecraft mod loader.");
  if (instanceId !== "default" && !/^[a-f0-9-]{36}$/.test(String(instanceId))) throw new Error("Invalid Minecraft instance ID.");
  return { root: gameRoot(version, loader, instanceId), mods: modsRoot(version, loader, instanceId) };
}

async function safeInstanceAsync(version: string, loader: string, instanceId = "default") {
  const paths = safeInstance(version, loader, instanceId);
  if (instanceId !== "default") {
    const instances = await readJson<Array<{ id: string }>>(instancesFile(), [{ id: "default" }]);
    if (!instances.some(item => item.id === instanceId)) throw new Error("Minecraft instance not found. Select or create a valid instance first.");
  }
  return paths;
}

async function detectJavaMajor(executable: string): Promise<number> {
  if (!executable || executable.length > 1024) throw new Error("Select a valid Java executable path.");
  const output = await new Promise<string>((resolve, reject) => {
    execFile(executable, ["-version"], { timeout: 7000, windowsHide: true }, (error, stdout, stderr) => {
      const combined = String(stderr || "") + "\n" + String(stdout || "");
      if (error) reject(new Error("Could not run the selected Java executable: " + combined.trim().slice(0, 500)));
      else resolve(combined);
    });
  });
  return parseJavaMajorVersion(output);
}

function safeName(value: string) {
  const name = value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error("Username must be 3–16 letters, numbers or underscores.");
  return name;
}
const launcherLogFile = () => path.join(dataRoot(), "logs", "launcher.log");
async function writeLauncherLog(message: string) {
  try {
    const file = launcherLogFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const stamp = new Date().toISOString();
    const line = "[" + stamp + "] " + String(message).replace(/[\r\n]+/g, " ").slice(0, 4000) + "\n";
    try {
      const stat = await fs.stat(file);
      if (stat.size > 2 * 1024 * 1024) {
        const previous = await fs.readFile(file, "utf8");
        await fs.writeFile(file, previous.slice(-1024 * 1024), "utf8");
      }
    } catch {}
    await fs.appendFile(file, line, "utf8");
  } catch {}
}

function sendStatus(message: string) {
  void writeLauncherLog(message);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("game:status", message);
}

// Observe fatal exceptions without swallowing them: Node/Electron keeps its normal
// crash behavior, while the launcher log retains the diagnostic stack for support.
process.on("uncaughtExceptionMonitor", (error, origin) => {
  void writeLauncherLog("[fatal process exception] origin=" + origin + " " + (error?.stack || error?.message || String(error)));
});
process.on("warning", warning => {
  void writeLauncherLog("[node warning] " + (warning?.stack || warning?.message || String(warning)));
});

async function listVersions() {
  const manifest = await getVersionList();
  return manifest.versions
    .filter((v: any) => ["release", "snapshot", "old_beta", "old_alpha"].includes(v.type))
    .map((v: any) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

ipcMain.handle("instances:list", async () => readJson<Array<{ id: string; name: string; createdAt: string }>>(instancesFile(), [{ id: "default", name: "Default", createdAt: "" }]));
ipcMain.handle("billing:openPortal", async () => { await shell.openExternal("https://billing.vampirenodes.in/"); return { success: true }; });
ipcMain.handle("updates:check", async () => {
  const currentVersion = app.getVersion();
  const response = await fetch("https://api.github.com/repos/Afzalplays/Vampire-Client/releases/latest", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Vampire-Client" }
  });
  if (response.status === 404) return {
    currentVersion, latestVersion: null, updateAvailable: false,
    releaseUrl: "https://github.com/Afzalplays/Vampire-Client/releases",
    assets: [], reason: "no-release"
  };
  if (!response.ok) throw new Error("GitHub release check failed (" + response.status + ").");
  return summarizeLatestRelease(await response.json(), currentVersion);
});
ipcMain.handle("instances:create", async (_event, nameValue: string) => {
  const name = String(nameValue || "").trim();
  if (name.length < 2 || name.length > 32 || !/^[A-Za-z0-9 _.-]+$/.test(name)) throw new Error("Instance name must be 2–32 letters, numbers, spaces, dots or dashes.");
  const instances = await readJson<Array<{ id: string; name: string; createdAt: string }>>(instancesFile(), [{ id: "default", name: "Default", createdAt: "" }]);
  if (instances.length >= 30) throw new Error("You can create up to 30 instances.");
  if (instances.some(item => item.name.toLowerCase() === name.toLowerCase())) throw new Error("An instance with this name already exists.");
  const instance = { id: randomUUID(), name, createdAt: new Date().toISOString() };
  instances.push(instance); await writeJson(instancesFile(), instances); return instance;
});
ipcMain.handle("instances:delete", async (_event, idValue: string) => {
  const id = String(idValue || "");
  if (id === "default" || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("The default or invalid instance cannot be deleted.");
  if (gameProcess && gameProcess.exitCode === null) throw new Error("Stop Minecraft before deleting an instance.");
  const instances = await readJson<Array<{ id: string; name: string; createdAt: string }>>(instancesFile(), [{ id: "default", name: "Default", createdAt: "" }]);
  if (!instances.some(item => item.id === id)) throw new Error("Instance not found.");
  await fs.rm(path.join(dataRoot(), "instances", "named", id), { recursive: true, force: true });
  await writeJson(instancesFile(), instances.filter(item => item.id !== id));
  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  for (const key of Object.keys(installed)) if (key.endsWith(":" + id)) delete installed[key];
  await writeJson(installedVersionsFile(), installed);
  const settings = await readJson<any>(settingsFile(), null);
  if (settings) {
    if (settings.instanceSettings?.[id]) delete settings.instanceSettings[id];
    if (settings.instanceId === id) settings.instanceId = "default";
    await writeJson(settingsFile(), settings);
  }
  return { success: true };
});

type WorldServerRecord = { id: string; name: string; version: string; createdAt: string; ramGB: number; };
const worldServersFile = () => path.join(dataRoot(), "world-servers.json");
const worldServerRoot = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(String(id || ""))) throw new Error("Invalid world server ID.");
  return path.join(dataRoot(), "world-servers", id);
};
async function listWorldServers() {
  const records = await readJson<WorldServerRecord[]>(worldServersFile(), []);
  return records.map(record => ({ ...record, running: Boolean(worldServerProcesses.get(record.id) && worldServerProcesses.get(record.id)!.exitCode === null) }));
}
ipcMain.handle("servers:list", async () => listWorldServers());
ipcMain.handle("servers:create", async (_event, args: { name: string; version: string; ramGB?: number }) => {
  const name = String(args.name || "").trim();
  const version = String(args.version || "");
  if (name.length < 2 || name.length > 32 || !/^[A-Za-z0-9 _.-]+$/.test(name)) throw new Error("Server name must be 2–32 letters, numbers, spaces, dots or dashes.");
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(version)) throw new Error("Invalid Minecraft server version.");
  const records = await readJson<WorldServerRecord[]>(worldServersFile(), []);
  if (records.length >= 10) throw new Error("You can create up to 10 local world servers.");
  if (records.some(record => record.name.toLowerCase() === name.toLowerCase())) throw new Error("A world server with this name already exists.");
  const ramGB = Math.max(1, Math.min(16, Math.round(Number(args.ramGB || 2))));
  sendStatus("Fetching official Minecraft " + version + " server metadata…");
  const manifestResponse = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
  if (!manifestResponse.ok) throw new Error("Could not fetch the official Minecraft version manifest.");
  const manifest = await manifestResponse.json() as any;
  const entry = Array.isArray(manifest.versions) ? manifest.versions.find((item: any) => item.id === version) : null;
  if (!entry?.url) throw new Error("Minecraft version was not found in Mojang's official manifest.");
  const metadataUrl = new URL(String(entry.url));
  if (metadataUrl.protocol !== "https:" || !["piston-meta.mojang.com", "launchermeta.mojang.com"].includes(metadataUrl.hostname)) throw new Error("Minecraft metadata host was rejected.");
  const metadataResponse = await fetch(metadataUrl);
  if (!metadataResponse.ok) throw new Error("Could not fetch official server metadata.");
  const metadata = await metadataResponse.json() as any;
  const serverArtifact = metadata?.downloads?.server;
  if (!serverArtifact?.url || !/^[a-f0-9]{40}$/i.test(String(serverArtifact.sha1 || ""))) throw new Error("This Minecraft version does not publish a verifiable official server JAR.");
  const jarUrl = new URL(String(serverArtifact.url));
  if (jarUrl.protocol !== "https:" || !["piston-data.mojang.com", "launcher.mojang.com"].includes(jarUrl.hostname)) throw new Error("Minecraft server download host was rejected.");
  const download = await fetch(jarUrl);
  if (!download.ok) throw new Error("Official Minecraft server download failed (" + download.status + ").");
  const declaredSize = Number(download.headers.get("content-length") || 0);
  if (declaredSize > 200 * 1024 * 1024) throw new Error("Server JAR exceeds the 200 MB safety limit.");
  const bytes = Buffer.from(await download.arrayBuffer());
  if (!bytes.length || bytes.length > 200 * 1024 * 1024) throw new Error("Server JAR size is invalid or exceeds 200 MB.");
  const actualSha1 = createHash("sha1").update(bytes).digest("hex");
  if (actualSha1.toLowerCase() !== String(serverArtifact.sha1).toLowerCase()) throw new Error("Official server JAR checksum verification failed.");
  const id = randomUUID();
  const root = worldServerRoot(id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "server.jar"), bytes, { flag: "wx" });
  await fs.writeFile(path.join(root, "eula.txt"), "eula=false\n", "utf8");
  await fs.writeFile(path.join(root, "server.properties"), [
    "server-port=25565", "server-ip=", "online-mode=true", "enable-rcon=false",
    "enable-command-block=false", "max-players=10", "view-distance=6",
    "simulation-distance=4", "motd=Vampire Client World", "white-list=false", ""
  ].join("\n"), "utf8");
  const record: WorldServerRecord = { id, name, version, createdAt: new Date().toISOString(), ramGB };
  records.push(record);
  await writeJson(worldServersFile(), records);
  sendStatus("World server " + name + " downloaded and verified. EULA acceptance is required before first start.");
  return { ...record, running: false, eulaAccepted: false };
});
ipcMain.handle("servers:start", async (_event, args: { id: string; javaPath?: string; ramGB?: number; acceptEula: boolean }) => {
  const id = String(args.id || "");
  const records = await readJson<WorldServerRecord[]>(worldServersFile(), []);
  const record = records.find(item => item.id === id);
  if (!record) throw new Error("World server not found.");
  const existing = worldServerProcesses.get(id);
  if (existing && existing.exitCode === null) throw new Error("This world server is already running.");
  if (args.acceptEula !== true) throw new Error("You must explicitly accept the Minecraft EULA before starting this server.");
  const root = worldServerRoot(id);
  await fs.access(path.join(root, "server.jar"));
  const javaPath = typeof args.javaPath === "string" && args.javaPath.trim() ? args.javaPath.trim() : "java";
  if (javaPath.length > 1024) throw new Error("Java executable path is too long.");
  const requestedRam = Number(args.ramGB ?? record.ramGB);
  if (!Number.isFinite(requestedRam) || requestedRam < 1 || requestedRam > 16) throw new Error("Server RAM must be between 1 and 16 GB.");
  await fs.writeFile(path.join(root, "eula.txt"), "eula=true\n", "utf8");
  const proc = spawn(javaPath, ["-Xms512M", "-Xmx" + Math.round(requestedRam) + "G", "-jar", "server.jar", "nogui"], {
    cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
  });
  worldServerProcesses.set(id, proc);
  const logPath = path.join(root, "server.log");
  const append = (label: string, chunk: unknown) => {
    const line = "[" + new Date().toISOString() + "] [" + label + "] " + String(chunk).replace(/[\r]+/g, "").slice(0, 8000);
    void (async () => {
      try {
        await fs.mkdir(root, { recursive: true });
        try {
          const stat = await fs.stat(logPath);
          if (stat.size > 2 * 1024 * 1024) {
            const previous = await fs.readFile(logPath, "utf8");
            await fs.writeFile(logPath, previous.slice(-1024 * 1024), "utf8");
          }
        } catch {}
        await fs.appendFile(logPath, line.endsWith("\n") ? line : line + "\n", "utf8");
      } catch {}
    })();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("server:output", { id, text: line });
  };
  proc.stdout?.on("data", chunk => append("stdout", chunk));
  proc.stderr?.on("data", chunk => append("stderr", chunk));
  proc.once("error", error => {
    worldServerLastExit.set(id, { code: null, error: error.message, at: new Date().toISOString() });
    append("process-error", error.message);
  });
  proc.once("close", code => {
    const timer = worldServerStopTimers.get(id);
    if (timer) clearTimeout(timer);
    worldServerStopTimers.delete(id);
    const previousExit = worldServerLastExit.get(id);
    worldServerLastExit.set(id, { code, error: previousExit?.error ?? null, at: new Date().toISOString() });
    append("process", "Server stopped with exit code " + String(code));
    if (worldServerProcesses.get(id) === proc) worldServerProcesses.delete(id);
  });
  append("launcher", "Starting " + record.name + " with " + Math.round(requestedRam) + " GB RAM.");
  return { success: true, pid: proc.pid };
});
ipcMain.handle("servers:info", async (_event, idValue: string) => {
  const id = String(idValue || "");
  const records = await readJson<WorldServerRecord[]>(worldServersFile(), []);
  if (!records.some(record => record.id === id)) throw new Error("World server not found.");
  const root = worldServerRoot(id);
  let logs = "";
  try { const contents = await fs.readFile(path.join(root, "server.log"), "utf8"); logs = contents.slice(-80 * 1024); } catch {}
  const addresses = Object.values(networkInterfaces()).flatMap(items => (items || [])
    .filter(item => item.family === "IPv4" && !item.internal)
    .map(item => item.address)).filter((value, index, all) => all.indexOf(value) === index);
  const proc = worldServerProcesses.get(id);
  const lastExit = worldServerLastExit.get(id) || null;
  return { logs, running: Boolean(proc && proc.exitCode === null), lanAddresses: addresses, port: 25565, lastExitCode: lastExit?.code ?? null, lastError: lastExit?.error ?? null, lastExitAt: lastExit?.at ?? null };
});
ipcMain.handle("servers:command", async (_event, args: { id: string; command: string }) => {
  const id = String(args?.id || "");
  const command = String(args?.command || "").trim();
  if (!command || command.length > 256 || /[\r\n\0]/.test(command)) throw new Error("Enter a single server command (maximum 256 characters).");
  if (/^stop$/i.test(command)) throw new Error("Use the Stop button for a graceful shutdown.");
  const proc = worldServerProcesses.get(id);
  if (!proc || proc.exitCode !== null || !proc.stdin || proc.stdin.destroyed) throw new Error("This world server is not running.");
  proc.stdin.write(command + "\n");
  return { success: true };
});
ipcMain.handle("servers:stop", async (_event, idValue: string) => {
  const id = String(idValue || "");
  const proc = worldServerProcesses.get(id);
  if (!proc || proc.exitCode !== null) { worldServerProcesses.delete(id); return { success: true, stopped: false }; }

  const previousTimer = worldServerStopTimers.get(id);
  if (previousTimer) clearTimeout(previousTimer);

  const scheduleForceKill = () => {
    const timer = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        try { proc.kill("SIGKILL"); } catch { /* process may have exited */ }
      }
      worldServerStopTimers.delete(id);
    }, 5000);
    timer.unref();
    worldServerStopTimers.set(id, timer);
  };

  let gracefulRequested = false;
  if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) {
    try {
      proc.stdin.write("stop\n");
      gracefulRequested = true;
    } catch {
      gracefulRequested = false;
    }
  }

  if (gracefulRequested) {
    const timer = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        try { proc.kill("SIGTERM"); } catch { /* process may have exited */ }
        scheduleForceKill();
      } else {
        worldServerStopTimers.delete(id);
      }
    }, 15000);
    timer.unref();
    worldServerStopTimers.set(id, timer);
  } else {
    try { proc.kill("SIGTERM"); } catch { /* process may have exited */ }
    scheduleForceKill();
  }

  return { success: true, stopped: true, graceful: gracefulRequested };
});
ipcMain.handle("servers:delete", async (_event, idValue: string) => {
  const id = String(idValue || "");
  const proc = worldServerProcesses.get(id);
  if (proc && proc.exitCode === null) throw new Error("Stop this world server before deleting it.");
  const records = await readJson<WorldServerRecord[]>(worldServersFile(), []);
  if (!records.some(record => record.id === id)) throw new Error("World server not found.");
  await fs.rm(worldServerRoot(id), { recursive: true, force: true });
  await writeJson(worldServersFile(), records.filter(record => record.id !== id));
  return { success: true };
});

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
ipcMain.handle("auth:accounts", async () => {
  if (!safeStorage.isEncryptionAvailable()) return [];
  const settings = await readJson<{ clientId?: string }>(settingsFile(), {});
  const clientId = String(settings.clientId || "");
  if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) return [];
  const msal = createMicrosoftClient(clientId);
  const accounts = await msal.getTokenCache().getAllAccounts();
  return accounts.map(item => ({ id: item.homeAccountId, username: item.username, name: item.name || item.username }));
});
ipcMain.handle("auth:switch", async (_event, accountId: string) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is required to switch Microsoft accounts.");
  const settings = await readJson<{ clientId?: string }>(settingsFile(), {});
  const clientId = String(settings.clientId || "");
  if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) throw new Error("Enter and save your Microsoft app Client ID first.");
  const msal = createMicrosoftClient(clientId);
  const accounts = await msal.getTokenCache().getAllAccounts();
  const account = accounts.find(item => item.homeAccountId === accountId);
  if (!account) throw new Error("Microsoft account is no longer available. Sign in again.");
  const tokenResult = await msal.acquireTokenSilent({ account, scopes: ["XboxLive.signin", "offline_access"] });
  if (!tokenResult?.accessToken) throw new Error("Microsoft could not refresh this account. Sign in again.");
  const session = await exchangeMicrosoftToken(tokenResult.accessToken);
  session.microsoftAccountId = account.homeAccountId;
  await saveMicrosoftSession(session);
  await writeJson(accountFile(), { type: "microsoft", profile: session.profile });
  await writeJson(profilesFile(), { active: session.profile.name, names: [session.profile.name] });
  sendStatus("Switched to " + session.profile.name + ".");
  return { success: true, profile: session.profile };
});
ipcMain.handle("auth:logout", async () => {
  const active = memoryMicrosoftSession || (await getMicrosoftSession());
  const settings = await readJson<{ clientId?: string }>(settingsFile(), {});
  const clientId = String(settings.clientId || "");
  if (active?.microsoftAccountId && /^[0-9a-fA-F-]{36}$/.test(clientId) && safeStorage.isEncryptionAvailable()) {
    const msal = createMicrosoftClient(clientId);
    const accounts = await msal.getTokenCache().getAllAccounts();
    const account = accounts.find(item => item.homeAccountId === active.microsoftAccountId);
    if (account) await msal.getTokenCache().removeAccount(account);
  }
  memoryMicrosoftSession = null;
  await fs.unlink(microsoftSessionFile()).catch(() => undefined);
  await writeJson(accountFile(), { type: "offline" });
  return { success: true };
});
ipcMain.handle("auth:login", async (_event, clientId: string) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable. Microsoft sign-in is disabled because account tokens cannot be saved securely on this device.");
  if (!/^[0-9a-fA-F-]{36}$/.test(String(clientId || ""))) throw new Error("Enter a valid Microsoft app Client ID first.");
  sendStatus("Starting Microsoft device-code sign-in…");
  const msal = createMicrosoftClient(clientId);
  const tokenResult = await msal.acquireTokenByDeviceCode({
    scopes: ["XboxLive.signin", "offline_access"],
    deviceCodeCallback: (response) => sendStatus(response.message)
  });
  if (!tokenResult?.accessToken) throw new Error("Microsoft sign-in did not return an access token.");
  const session = await exchangeMicrosoftToken(tokenResult.accessToken);
  session.microsoftAccountId = tokenResult.account?.homeAccountId;
  await saveMicrosoftSession(session);
  await writeJson(accountFile(), { type: "microsoft", profile: session.profile });
  await writeJson(profilesFile(), { active: session.profile.name, names: [session.profile.name] });
  sendStatus("Signed in as " + session.profile.name + ".");
  return { success: true, profile: session.profile, encryptedStorage: safeStorage.isEncryptionAvailable() };
});
ipcMain.handle("settings:get", async (_event, instanceIdValue?: string) => {
  const saved = await readJson<{ ram: number; javaPath: string; version: string; loader: string; clientId: string; instanceId?: string; instanceSettings?: Record<string, { ram?: number; javaPath?: string }> } | null>(settingsFile(), null);
  const manifest = saved ? null : await getVersionList();
  const latestRelease = manifest?.versions.find((item: any) => item.type === "release")?.id || "1.21.1";
  const base = saved || { ram: 2, javaPath: "java", version: latestRelease, loader: "fabric", clientId: "", instanceId: "default" };
  const requestedInstanceId = typeof instanceIdValue === "string" ? instanceIdValue : (base.instanceId || "default");
  let instanceId = requestedInstanceId;
  if (instanceId !== "default") {
    if (!/^[a-f0-9-]{36}$/.test(instanceId)) {
      if (typeof instanceIdValue === "string") throw new Error("Invalid Minecraft instance ID.");
      instanceId = "default";
    } else {
      const instances = await readJson<Array<{ id: string }>>(instancesFile(), [{ id: "default" }]);
      if (!instances.some(item => item.id === instanceId)) {
        if (typeof instanceIdValue === "string") throw new Error("Minecraft instance not found.");
        instanceId = "default";
      }
    }
  }
  const scoped = base.instanceSettings?.[instanceId] || {};
  return { ...base, ram: Number(scoped.ram ?? base.ram), javaPath: typeof scoped.javaPath === "string" ? scoped.javaPath : base.javaPath, instanceId };
});
ipcMain.handle("settings:save", async (_event, settings: { ram?: number; javaPath?: string; version?: string; loader?: string; clientId?: string; instanceId?: string }) => {
  const current = await readJson<{ ram: number; javaPath: string; version: string; loader: string; clientId: string; instanceId?: string; instanceSettings?: Record<string, { ram?: number; javaPath?: string }> }>(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric", clientId: "", instanceId: "default", instanceSettings: {} });
  const requestedInstanceId = typeof settings.instanceId === "string" ? settings.instanceId : (current.instanceId || "default");
  if (requestedInstanceId !== "default") {
    if (!/^[a-f0-9-]{36}$/.test(requestedInstanceId)) throw new Error("Invalid Minecraft instance ID.");
    const instances = await readJson<Array<{ id: string }>>(instancesFile(), [{ id: "default" }]);
    if (!instances.some(item => item.id === requestedInstanceId)) throw new Error("Minecraft instance not found. Select a valid instance.");
  }
  const storedRam = Number(current.instanceSettings?.[requestedInstanceId]?.ram ?? current.ram ?? 2);
  const requestedRam = Number(settings.ram ?? storedRam);
  const normalizeRam = (value: number) => Math.max(1, Math.min(16, Math.round(value * 2) / 2));
  const ram = Number.isFinite(requestedRam)
    ? normalizeRam(requestedRam)
    : (Number.isFinite(storedRam) ? normalizeRam(storedRam) : 2);
  const javaPath = typeof settings.javaPath === "string" && settings.javaPath.length < 1024 ? settings.javaPath : (current.instanceSettings?.[requestedInstanceId]?.javaPath || current.javaPath);
  const instanceSettings = { ...(current.instanceSettings || {}), [requestedInstanceId]: { ram, javaPath } };
  const next = {
    ram: requestedInstanceId === "default" ? ram : current.ram,
    javaPath: requestedInstanceId === "default" ? javaPath : current.javaPath,
    instanceSettings,
    version: typeof settings.version === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(settings.version) ? settings.version : current.version,
    loader: ["vanilla", "fabric", "quilt"].includes(String(settings.loader)) ? settings.loader : current.loader,
    clientId: typeof settings.clientId === "string" && settings.clientId.length <= 64 ? settings.clientId : current.clientId,
    instanceId: requestedInstanceId
  };
  await writeJson(settingsFile(), next);
  return { ...next, ram, javaPath };
});
ipcMain.handle("logs:read", async () => {
  try {
    const content = await fs.readFile(launcherLogFile(), "utf8");
    return content.slice(-100 * 1024);
  } catch { return "No launcher log has been created yet."; }
});
ipcMain.handle("logs:export", async () => {
  const source = launcherLogFile();
  try { await fs.access(source); } catch { throw new Error("No launcher log is available yet."); }
  const choice = await dialog.showSaveDialog(mainWindow!, { title: "Export Vampire Client logs", defaultPath: "VampireClient-launcher.log", filters: [{ name: "Log files", extensions: ["log", "txt"] }] });
  if (choice.canceled || !choice.filePath) return { canceled: true };
  await fs.copyFile(source, choice.filePath);
  return { canceled: false, filePath: choice.filePath };
});

ipcMain.handle("java:install", async (_event, args: { major?: number }) => {
  if (gameProcess && gameProcess.exitCode === null) throw new Error("Stop Minecraft before installing Java.");
  const major = Number(args?.major);
  if (![8, 17, 21].includes(major)) throw new Error("Select a supported Java version: 8, 17 or 21.");
  return installJavaRuntime(dataRoot(), process.platform, process.arch, major, message => sendStatus(message));
});

ipcMain.handle("java:detect", async (_event, args: { javaPath?: string }) => {
  const executable = typeof args.javaPath === "string" && args.javaPath.trim() ? args.javaPath.trim() : "java";
  const major = await detectJavaMajor(executable);
  return { success: true, executable, version: String(major), majorVersion: major, platform: process.platform, architecture: process.arch };
});

ipcMain.handle("system:memory", async () => ({ totalBytes: totalmem(), freeBytes: freemem(), totalGB: Math.round((totalmem() / 1024 ** 3) * 10) / 10, freeGB: Math.round((freemem() / 1024 ** 3) * 10) / 10 }));

ipcMain.handle("versions:list", async () => listVersions());

ipcMain.handle("game:install", async (_event, args: { version: string; loader: string; instanceId?: string }) => {
  const versionId = String(args.version || "");
  const loader = String(args.loader || "vanilla");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(versionId)) throw new Error("Invalid Minecraft version ID.");
  if (!["vanilla", "fabric", "quilt"].includes(loader)) throw new Error("This build supports Vanilla, Fabric and Quilt profiles.");
  sendStatus("Preparing Minecraft " + versionId + " installation…");
  const manifest = await getVersionList();
  const metadata = manifest.versions.find((v: any) => v.id === versionId);
  if (!metadata) throw new Error("Minecraft version was not found in the official manifest.");
  const root = (await safeInstanceAsync(versionId, loader, args.instanceId || "default")).root;
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
  } else if (loader === "quilt") {
    sendStatus("Installing Quilt loader for Minecraft " + versionId + "…");
    const response = await fetch("https://meta.quiltmc.org/v3/versions/loader/" + encodeURIComponent(versionId));
    if (!response.ok) throw new Error("Quilt metadata request failed (" + response.status + ").");
    const quiltVersion = selectQuiltLoaderVersion(await response.json());
    launchVersion = await installQuiltVersion({ minecraftVersion: versionId, version: quiltVersion, minecraft: root });
    const resolved = await Version.parse(root, launchVersion);
    await installDependencies(resolved, {});
  }

  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  installed[instanceKey(versionId, loader, args.instanceId || "default")] = launchVersion;
  await writeJson(installedVersionsFile(), installed);
  sendStatus("Minecraft " + versionId + (loader === "fabric" ? " + Fabric" : loader === "quilt" ? " + Quilt" : "") + " is installed.");
  return { success: true, version: versionId, launchVersion };
});

ipcMain.handle("game:installStatus", async (_event, args: { version: string; loader: string; instanceId?: string }) => {
  const versionId = String(args.version || "");
  const loader = String(args.loader || "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(versionId) || !["vanilla", "fabric", "quilt"].includes(loader)) {
    throw new Error("Invalid Minecraft version or loader.");
  }
  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  const launchVersion = installed[instanceKey(versionId, loader, args.instanceId || "default")] || (args.instanceId === "default" || !args.instanceId ? installed[versionId + ":" + loader] : undefined);
  if (!launchVersion) return { installed: false, launchVersion: null, reason: "not-installed" };
  const root = (await safeInstanceAsync(versionId, loader, args.instanceId || "default")).root;
  try {
    await fs.access(root);
    await Version.parse(root, launchVersion);
    return { installed: true, launchVersion, reason: null };
  } catch {
    return { installed: false, launchVersion, reason: "files-missing" };
  }
});

ipcMain.handle("game:launch", async (_event, args: { username: string; version: string; ram: number; javaPath?: string; instanceId?: string }) => {
  if (gameProcess && gameProcess.exitCode === null) throw new Error("Minecraft is already running.");
  const username = safeName(args.username);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(args.version)) throw new Error("Invalid Minecraft version.");
  const settings = await readJson<{ ram: number; javaPath: string; version: string; loader: string; clientId: string; instanceId?: string; instanceSettings?: Record<string, { ram?: number; javaPath?: string }> }>(settingsFile(), { ram: 2, javaPath: "java", version: "1.21.1", loader: "fabric", clientId: "", instanceId: "default", instanceSettings: {} });
  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  const activeLoader = ["vanilla", "fabric", "quilt"].includes(settings.loader) ? settings.loader : "vanilla";
  const activeInstanceId = args.instanceId || settings.instanceId || "default";
  const installKey = instanceKey(args.version, activeLoader, activeInstanceId);
  const launchVersion = installed[installKey] || (activeInstanceId === "default" ? installed[args.version + ":" + activeLoader] : undefined);
  if (!launchVersion) {
    throw new Error("Minecraft " + args.version + " (" + activeLoader + ") is not installed yet. Open Versions and install it before launching.");
  }
  const root = (await safeInstanceAsync(args.version, activeLoader, activeInstanceId)).root;
  let parsedVersion: any;
  try {
    await fs.access(root);
    parsedVersion = await Version.parse(root, launchVersion);
  } catch {
    throw new Error("The installed Minecraft files are missing or damaged. Reinstall this version from the Versions page.");
  }
  const scopedSettings = settings.instanceSettings?.[activeInstanceId] || {};
  const javaPath = typeof args.javaPath === "string" && args.javaPath.trim() ? args.javaPath.trim() : (scopedSettings.javaPath || settings.javaPath);
  const requiredJava = Number(parsedVersion?.javaVersion?.majorVersion || 0);
  const detectedJava = await detectJavaMajor(javaPath);
  if (requiredJava > 0 && detectedJava < requiredJava) {
    throw new Error("Minecraft " + args.version + " requires Java " + requiredJava + " or newer, but the selected runtime is Java " + detectedJava + ". Install or select a compatible Java runtime in Settings.");
  }
  const memory = Math.max(1, Math.min(16, Number(args.ram) || Number(scopedSettings.ram) || settings.ram));
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
  void writeLauncherLog("Game process started; version=" + launchVersion + "; java=" + javaPath + "; ramGB=" + memory + "; pid=" + proc.pid);
  proc.stdout?.on("data", chunk => void writeLauncherLog("[game stdout] " + String(chunk).slice(0, 3500)));
  proc.stderr?.on("data", chunk => void writeLauncherLog("[game stderr] " + String(chunk).slice(0, 3500)));
  sendStatus("Minecraft launched (PID " + proc.pid + ").");
  proc.once("error", error => sendStatus("Minecraft process error: " + error.message));
  proc.once("close", (code, signal) => {
    if (gameStopTimer) clearTimeout(gameStopTimer);
    gameStopTimer = null;
    if (code !== 0 || signal) {
      void writeLauncherLog("[game crash candidate] version=" + launchVersion + "; exitCode=" + String(code) + "; signal=" + String(signal || "none") + "; inspect the preceding game stdout/stderr for the root cause.");
      sendStatus("Minecraft exited unexpectedly (code " + String(code) + (signal ? ", signal " + signal : "") + "). Check Settings → Launcher Logs for diagnostics.");
    } else {
      sendStatus("Minecraft closed normally (exit code 0).");
    }
    gameProcess = null;
  });
  return { success: true, pid: proc.pid };
});

ipcMain.handle("game:stop", async () => {
  const proc = gameProcess;
  if (!proc || proc.exitCode !== null) {
    gameProcess = null;
    if (gameStopTimer) clearTimeout(gameStopTimer);
    gameStopTimer = null;
    return { success: true, stopped: false };
  }
  const pid = proc.pid;
  const stopped = proc.kill("SIGTERM");
  if (stopped) {
    sendStatus("Graceful stop requested for Minecraft (PID " + String(pid) + ").");
    if (gameStopTimer) clearTimeout(gameStopTimer);
    gameStopTimer = setTimeout(() => {
      if (gameProcess === proc && proc.exitCode === null) {
        sendStatus("Minecraft did not stop gracefully; forcing process termination.");
        try { proc.kill("SIGKILL"); } catch { /* process may have exited */ }
      }
      gameStopTimer = null;
    }, 8000);
    gameStopTimer.unref();
  }
  return { success: stopped, stopped, pid };
});

ipcMain.handle("mods:list", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const directory = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).mods;
  await fs.mkdir(directory, { recursive: true });
  const files = await fs.readdir(directory, { withFileTypes: true });
  return files.filter(file => file.isFile() && (file.name.toLowerCase().endsWith(".jar") || file.name.toLowerCase().endsWith(".jar.disabled")))
    .map(file => ({ fileName: file.name, enabled: file.name.toLowerCase().endsWith(".jar") }));
});
async function fetchModrinthVersion(projectId: string, mcVersion: string, loader: string) {
  const endpoint = "https://api.modrinth.com/v2/project/" + encodeURIComponent(projectId) +
    "/version?game_versions=" + encodeURIComponent(JSON.stringify([mcVersion])) +
    "&loaders=" + encodeURIComponent(JSON.stringify([loader]));
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Modrinth version lookup failed for " + projectId + " (" + response.status + ").");
  const versions = await response.json() as any[];
  const selected = versions[0];
  if (!selected?.files?.length) throw new Error("No compatible file was found for dependency " + projectId + ".");
  return selected;
}

async function installModrinthTree(projectId: string, mcVersion: string, loader: string, instanceId = "default") {
  const visited = new Set<string>();
  const incompatibleProjects = new Set<string>();
  const installedFiles: string[] = [];
  const installedEntries: Array<{ projectId: string; versionId: string; fileName: string }> = [];
  const skippedOptional: string[] = [];
  const directory = (await safeInstanceAsync(mcVersion, loader, instanceId)).mods;
  await fs.mkdir(directory, { recursive: true });

  async function installProject(id: string, pinnedVersionId?: string): Promise<void> {
    if (incompatibleProjects.has(id)) throw new Error("Mod conflict detected: " + id + " is marked incompatible by another selected mod.");
    if (visited.has(id)) return;
    visited.add(id);
    let selected: any;
    if (pinnedVersionId) {
      const pinned = await fetch("https://api.modrinth.com/v2/version/" + encodeURIComponent(pinnedVersionId));
      if (!pinned.ok) throw new Error("Could not resolve required Modrinth dependency " + id + ".");
      selected = await pinned.json();
      if (!Array.isArray(selected.game_versions) || !selected.game_versions.includes(mcVersion) ||
          !Array.isArray(selected.loaders) || !selected.loaders.includes(loader)) {
        throw new Error("Required dependency " + id + " has no build compatible with " + mcVersion + " / " + loader + ".");
      }
    } else {
      selected = await fetchModrinthVersion(id, mcVersion, loader);
    }

    for (const dependency of (Array.isArray(selected.dependencies) ? selected.dependencies : [])) {
      const kind = String(dependency.dependency_type || "");
      const depId = String(dependency.project_id || "");
      const depVersion = String(dependency.version_id || "");
      if (kind === "incompatible") {
        if (depId) {
          incompatibleProjects.add(depId);
          if (visited.has(depId)) throw new Error("Mod conflict detected: " + id + " conflicts with " + depId + ".");
        }
        continue;
      }
      if (kind === "optional") {
        if (depId) skippedOptional.push(depId);
        continue;
      }
      if (kind !== "required") continue;
      if (!depId && !depVersion) throw new Error("A required dependency for " + id + " has invalid Modrinth metadata.");
      await installProject(depId || ("version-" + depVersion), depVersion || undefined);
    }

    const file = selected.files.find((item: any) => item.primary) || selected.files[0];
    const fileUrl = new URL(String(file?.url || ""));
    if (fileUrl.protocol !== "https:" || fileUrl.hostname !== "cdn.modrinth.com") throw new Error("Mod download host was rejected.");
    const download = await fetch(fileUrl);
    if (!download.ok) throw new Error("Mod download failed (" + download.status + ").");
    const bytes = await verifyModrinthDownload(download, file);
    const fileName = path.basename(String(file.filename || "mod.jar")).replace(/[^A-Za-z0-9._-]/g, "_");
    if (!fileName.toLowerCase().endsWith(".jar")) throw new Error("Modrinth returned a non-JAR file.");
    const destination = path.join(directory, fileName);
    try { await fs.writeFile(destination, bytes, { flag: "wx" }); }
    catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const existingBytes = await fs.readFile(destination);
      const hashes = file?.hashes || {};
      const algorithm = hashes.sha512 ? "sha512" : hashes.sha1 ? "sha1" : null;
      const expected = algorithm ? String(hashes[algorithm]).toLowerCase() : "";
      if (!algorithm || !/^[a-f0-9]+$/.test(expected)) {
        throw new Error("Cannot safely verify the existing mod file collision: " + fileName);
      }
      const existingHash = createHash(algorithm).update(existingBytes).digest("hex").toLowerCase();
      if (existingHash !== expected) {
        throw new Error("A different mod already uses the filename " + fileName + ". Remove or rename that file before installing this dependency.");
      }
      if (id === projectId) throw new Error("This mod file is already installed: " + fileName);
      installedEntries.push({ projectId: id, versionId: String(selected.id || ""), fileName });
      return;
    }
    installedFiles.push(fileName);
    installedEntries.push({ projectId: id, versionId: String(selected.id || ""), fileName });
  }

  await installProject(projectId);
  const registryFile = path.join(directory, ".vampire-mods.json");
  const registry = await readJson<Array<{ projectId: string; versionId: string; fileName: string }>>(registryFile, []);
  const merged = [...registry.filter(entry => !installedEntries.some(next => next.fileName === entry.fileName)), ...installedEntries];
  await writeJson(registryFile, merged);
  return { installedFiles, skippedOptional: Array.from(new Set(skippedOptional)) };
}

ipcMain.handle("mods:install", async (_event, args: { projectId: string; minecraftVersion: string; loader: string; instanceId?: string }) => {
  const projectId = String(args.projectId || "");
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(projectId)) throw new Error("Invalid Modrinth project ID.");
  const loader = String(args.loader || "fabric");
  if (!["fabric", "quilt"].includes(loader)) throw new Error("Select a Fabric or Quilt profile before installing mods.");
  const mcVersion = String(args.minecraftVersion || "");
  if (!/^[0-9A-Za-z._-]{1,32}$/.test(mcVersion)) throw new Error("Invalid Minecraft version.");
  const result = await installModrinthTree(projectId, mcVersion, loader, args.instanceId || "default");
  return { success: true, fileName: result.installedFiles[result.installedFiles.length - 1], installedFiles: result.installedFiles, skippedOptional: result.skippedOptional };
});
ipcMain.handle("mods:bulkToggle", async (_event, args: { version: string; loader: string; enabled: boolean ; instanceId?: string}) => {
  const directory = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).mods;
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let changed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const isDisabled = name.toLowerCase().endsWith(".jar.disabled");
    const isEnabled = name.toLowerCase().endsWith(".jar") && !isDisabled;
    if (args.enabled && isDisabled) {
      await fs.rename(path.join(directory, name), path.join(directory, name.slice(0, -".disabled".length)));
      changed++;
    } else if (!args.enabled && isEnabled) {
      await fs.rename(path.join(directory, name), path.join(directory, name + ".disabled"));
      changed++;
    }
  }
  return { success: true, changed };
});

ipcMain.handle("mods:exportPack", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const instance = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default"));
  const registry = await readJson<Array<{ projectId: string; versionId: string; fileName: string }>>(path.join(instance.mods, ".vampire-mods.json"), []);
  const manifest = { format: "vampire-modpack", formatVersion: 1, minecraftVersion: args.version, loader: args.loader,
    createdAt: new Date().toISOString(), projects: registry.map(item => ({ projectId: item.projectId, versionId: item.versionId })).filter(item => /^[A-Za-z0-9_-]{3,64}$/.test(item.projectId)) };
  const choice = await dialog.showSaveDialog(mainWindow!, { title: "Export Vampire modpack", defaultPath: "Vampire-" + args.version + "-modpack.json", filters: [{ name: "Vampire modpack manifest", extensions: ["json"] }] });
  if (choice.canceled || !choice.filePath) return { canceled: true };
  await fs.writeFile(choice.filePath, JSON.stringify(manifest, null, 2), "utf8");
  return { canceled: false, filePath: choice.filePath, count: manifest.projects.length };
});

ipcMain.handle("mods:importPack", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default"));
  const choice = await dialog.showOpenDialog(mainWindow!, { title: "Import Vampire modpack manifest", properties: ["openFile"], filters: [{ name: "Vampire modpack manifest", extensions: ["json"] }] });
  if (choice.canceled || !choice.filePaths[0]) return { canceled: true, installed: 0, failed: [] };
  const stat = await fs.stat(choice.filePaths[0]);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("Modpack manifest must be a JSON file smaller than 1 MB.");
  const manifest = JSON.parse(await fs.readFile(choice.filePaths[0], "utf8"));
  if (manifest?.format !== "vampire-modpack" || manifest?.formatVersion !== 1 || !Array.isArray(manifest.projects) || manifest.projects.length > 200) throw new Error("Invalid or unsupported Vampire modpack manifest.");
  if (manifest.minecraftVersion !== args.version || manifest.loader !== args.loader) throw new Error("This modpack targets Minecraft " + manifest.minecraftVersion + " / " + manifest.loader + ". Select that exact profile before importing.");
  if (!["fabric", "quilt"].includes(args.loader)) throw new Error("Modpack imports require a Fabric or Quilt profile.");
  const projectIds: string[] = manifest.projects.map((item: unknown) => { const value = (item as { projectId?: unknown } | null)?.projectId; return typeof value === "string" ? value : ""; }).filter((id: string) => /^[A-Za-z0-9_-]{3,64}$/.test(id));
  const projects: string[] = Array.from(new Set<string>(projectIds));
  const failed: string[] = [];
  let installed = 0;
  for (const projectId of projects) {
    try { await installModrinthTree(projectId, args.version, args.loader, args.instanceId || "default"); installed++; }
    catch (error) { failed.push(projectId + ": " + (error instanceof Error ? error.message : "install failed")); }
  }
  return { canceled: false, installed, failed };
});

ipcMain.handle("resourcepacks:list", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const root = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root;
  const directory = path.join(root, "resourcepacks");
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".zip")).map(entry => entry.name).sort();
});
ipcMain.handle("resourcepacks:openFolder", async (_event, args: { version: string; loader: string; instanceId?: string }) => {
  const root = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root;
  const directory = path.join(root, "resourcepacks");
  await fs.mkdir(directory, { recursive: true });
  const error = await shell.openPath(directory);
  if (error) throw new Error("Could not open the resource pack folder: " + error);
  return { success: true };
});
async function assertZipSignature(file: string) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 22) throw new Error("ZIP archive is empty or incomplete.");
    const tailLength = Math.min(stat.size, 65_557);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, stat.size - tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("ZIP archive directory is missing or damaged.");
    const disk = tail.readUInt16LE(eocd + 4);
    const centralDisk = tail.readUInt16LE(eocd + 6);
    const diskEntries = tail.readUInt16LE(eocd + 8);
    const entries = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (disk || centralDisk || diskEntries !== entries || entries === 0xffff ||
        centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error("Multi-disk and ZIP64 shader archives are not supported.");
    }
    if (!entries || entries > 50_000 || centralSize > 32 * 1024 * 1024 ||
        centralOffset + centralSize > stat.size) {
      throw new Error("ZIP archive directory exceeds safety limits.");
    }
    const directory = Buffer.alloc(centralSize);
    await handle.read(directory, 0, centralSize, centralOffset);
    let offset = 0;
    let totalUncompressed = 0;
    for (let index = 0; index < entries; index++) {
      if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error("ZIP archive directory is invalid.");
      }
      const flags = directory.readUInt16LE(offset + 8);
      const method = directory.readUInt16LE(offset + 10);
      const compressed = directory.readUInt32LE(offset + 20);
      const uncompressed = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const commentLength = directory.readUInt16LE(offset + 32);
      const end = offset + 46 + nameLength + extraLength + commentLength;
      if (end > directory.length || (flags & 1) !== 0 || ![0, 8].includes(method) ||
          compressed === 0xffffffff || uncompressed === 0xffffffff) {
        throw new Error("ZIP archive contains encrypted, unsupported or malformed entries.");
      }
      const entryName = directory.toString("utf8", offset + 46, offset + 46 + nameLength).replace(/\\\\/g, "/");
      if (entryName.startsWith("/") || /^[A-Za-z]:/.test(entryName) ||
          entryName.split("/").some(part => part === "..")) {
        throw new Error("ZIP archive contains an unsafe file path.");
      }
      totalUncompressed += uncompressed;
      if (totalUncompressed > 2 * 1024 * 1024 * 1024 ||
          (uncompressed > 64 * 1024 * 1024 && compressed === 0) ||
          (compressed > 0 && uncompressed / compressed > 1000)) {
        throw new Error("ZIP archive expands beyond safe size limits.");
      }
      offset = end;
    }
    if (offset !== directory.length) throw new Error("ZIP archive directory has trailing or malformed data.");
  } finally { await handle.close(); }
}

async function inspectResourcePackZip(file: string) {
  const summary = { fileCount: 0, textureCount: 0, totalUncompressedBytes: 0, packFormat: 0, description: "", hasPackIcon: false };
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    const tailLength = Math.min(stat.size, 65_557);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, stat.size - tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("ZIP directory is missing or damaged.");
    const commentLength = tail.readUInt16LE(eocd + 20);
    if (eocd + 22 + commentLength !== tail.length) throw new Error("ZIP end record or archive comment is malformed.");
    const absoluteEocd = stat.size - tailLength + eocd;
    const disk = tail.readUInt16LE(eocd + 4);
    const centralDisk = tail.readUInt16LE(eocd + 6);
    const diskEntries = tail.readUInt16LE(eocd + 8);
    const entries = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (disk || centralDisk || diskEntries !== entries || entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error("Multi-disk and ZIP64 resource packs are not supported.");
    }
    if (!entries || entries > 50_000 || centralSize > 32 * 1024 * 1024 || centralOffset + centralSize !== absoluteEocd) {
      throw new Error("Resource pack ZIP directory exceeds safety limits.");
    }
    const directory = Buffer.alloc(centralSize);
    await handle.read(directory, 0, centralSize, centralOffset);
    let offset = 0;
    let totalUncompressed = 0;
    let hasMetadata = false;
    const entryNames = new Set<string>();
    for (let index = 0; index < entries; index++) {
      if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error("Resource pack ZIP directory is invalid.");
      }
      const flags = directory.readUInt16LE(offset + 8);
      const method = directory.readUInt16LE(offset + 10);
      const compressed = directory.readUInt32LE(offset + 20);
      const uncompressed = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const entryCommentLength = directory.readUInt16LE(offset + 32);
      const externalAttributes = directory.readUInt32LE(offset + 38);
      const localOffset = directory.readUInt32LE(offset + 42);
      const end = offset + 46 + nameLength + extraLength + entryCommentLength;
      if (end > directory.length || (flags & 1) !== 0 || (flags & 0x40) !== 0 || ![0, 8].includes(method) ||
          compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) {
        throw new Error("Resource pack contains encrypted, unsupported or malformed ZIP entries.");
      }
      const entryName = directory.toString("utf8", offset + 46, offset + 46 + nameLength).replace(/\\/g, "/");
      const parts = entryName.split("/");
      if (!entryName || entryName.includes("\0") || entryName.startsWith("/") || /^[A-Za-z]:/.test(entryName) ||
          parts.some(part => part === ".." || part === ".") || entryNames.has(entryName.toLowerCase())) {
        throw new Error("Resource pack contains an unsafe or duplicate file path.");
      }
      entryNames.add(entryName.toLowerCase());
      const unixMode = externalAttributes >>> 16;
      if (((unixMode & 0xf000) === 0xa000) || ((unixMode & 0xf000) !== 0 && (unixMode & 0xf000) !== 0x8000 && (unixMode & 0xf000) !== 0x4000)) {
        throw new Error("Resource pack contains a symbolic link or unsupported filesystem entry.");
      }
      if (localOffset + 30 > centralOffset) throw new Error("Resource pack local file header is out of bounds.");
      const localHeader = Buffer.alloc(30);
      await handle.read(localHeader, 0, 30, localOffset);
      if (localHeader.readUInt32LE(0) !== 0x04034b50 ||
          localHeader.readUInt16LE(6) !== flags || localHeader.readUInt16LE(8) !== method) {
        throw new Error("Resource pack local file header does not match its directory entry.");
      }
      const localNameLength = localHeader.readUInt16LE(26);
      const localExtraLength = localHeader.readUInt16LE(28);
      if (localNameLength !== nameLength || localOffset + 30 + localNameLength + localExtraLength > centralOffset) throw new Error("Resource pack local filename or extra field is out of bounds.");
      const localName = Buffer.alloc(localNameLength);
      await handle.read(localName, 0, localNameLength, localOffset + 30);
      if (localName.toString("utf8") !== directory.toString("utf8", offset + 46, offset + 46 + nameLength)) {
        throw new Error("Resource pack local filename does not match its directory entry.");
      }
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (dataStart + compressed > centralOffset) throw new Error("Resource pack compressed data is out of bounds.");
      summary.fileCount++;
      if (entryName.startsWith("assets/") && entryName.includes("/textures/")) summary.textureCount++;
      if (entryName.toLowerCase() === "pack.png") summary.hasPackIcon = true;
      if (entryName === "pack.mcmeta") {
        if (hasMetadata || uncompressed < 2 || uncompressed > 1024 * 1024 || compressed > 1024 * 1024) {
          throw new Error("Resource pack metadata is duplicated or outside the 1 MB safety limit.");
        }
        const metadataBytes = Buffer.alloc(compressed);
        await handle.read(metadataBytes, 0, compressed, dataStart);
        try {
          const decoded = method === 0 ? metadataBytes : inflateRawSync(metadataBytes, { maxOutputLength: 1024 * 1024 });
          if (decoded.length !== uncompressed) throw new Error("Metadata size mismatch.");
          const metadata = JSON.parse(decoded.toString("utf8")) as { pack?: { pack_format?: unknown; description?: unknown } };
          const pack = metadata.pack;
          const packFormat = pack?.pack_format;
          if (!pack || typeof packFormat !== "number" || !Number.isInteger(packFormat) ||
              packFormat < 1 || packFormat > 10_000) {
            throw new Error("Missing or invalid pack_format.");
          }
          summary.packFormat = packFormat;
          const description = pack.description;
          summary.description = typeof description === "string" ? description.slice(0, 300) :
            description && typeof description === "object" ? JSON.stringify(description).slice(0, 300) : "";
        } catch {
          throw new Error("Resource pack root pack.mcmeta must contain valid JSON and a positive pack.pack_format.");
        }
        hasMetadata = true;
      }
      totalUncompressed += uncompressed;
      summary.totalUncompressedBytes = totalUncompressed;
      if (totalUncompressed > 2 * 1024 * 1024 * 1024 || (uncompressed > 64 * 1024 * 1024 && compressed === 0) ||
          (compressed > 0 && uncompressed / compressed > 1000)) {
        throw new Error("Resource pack expands beyond safe size limits.");
      }
      offset = end;
    }
    if (offset !== directory.length || !hasMetadata) {
      throw new Error("This ZIP is not a valid Minecraft resource pack: root pack.mcmeta was not found.");
    }
  } finally { await handle.close(); }
  return summary;
}

ipcMain.handle("resourcepacks:import", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const root = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root;
  const choice = await dialog.showOpenDialog(mainWindow!, { title: "Import Minecraft resource pack", properties: ["openFile"], filters: [{ name: "Resource pack ZIP", extensions: ["zip"] }] });
  if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
  const source = choice.filePaths[0];
  const stat = await fs.stat(source);
  if (path.extname(source).toLowerCase() !== ".zip" || !stat.isFile() || stat.size < 4 || stat.size > 512 * 1024 * 1024) throw new Error("Resource pack must be a ZIP file between 4 bytes and 512 MB.");
  await inspectResourcePackZip(source);
  const directory = path.join(root, "resourcepacks");
  await fs.mkdir(directory, { recursive: true });
  const baseName = path.basename(source).replace(/[^A-Za-z0-9._ -]/g, "_");
  const extension = path.extname(baseName);
  const stem = path.basename(baseName, extension);
  let name = baseName;
  for (let suffix = 2; await fs.access(path.join(directory, name)).then(() => true).catch(() => false); suffix++) {
    name = stem.slice(0, 160) + " (" + suffix + ")" + extension;
  }
  await fs.copyFile(source, path.join(directory, name), fsConstants.COPYFILE_EXCL);
  return { canceled: false, fileName: name };
});

ipcMain.handle("resourcepacks:inspect", async (_event, args: { version: string; loader: string; fileName: string; instanceId?: string }) => {
  const root = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root;
  const name = String(args.fileName || "");
  if (!isSafeResourcePackFilename(name)) throw new Error("Invalid resource pack filename.");
  const file = path.join(root, "resourcepacks", name);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size < 4 || stat.size > 512 * 1024 * 1024) throw new Error("Resource pack file is missing or outside the 512 MB safety limit.");
  const summary = await inspectResourcePackZip(file);
  return { fileName: name, fileSizeBytes: stat.size, ...summary };
});

ipcMain.handle("resourcepacks:remove", async (_event, args: { version: string; loader: string; fileName: string ; instanceId?: string}) => {
  const root = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root;
  const name = String(args.fileName || "");
  if (!isSafeResourcePackFilename(name)) throw new Error("Invalid resource pack filename.");
  await fs.unlink(path.join(root, "resourcepacks", name));
  return { success: true };
});

ipcMain.handle("mods:updates", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const directory = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).mods;
  const registryFile = path.join(directory, ".vampire-mods.json");
  const registry = await readJson<Array<{ projectId: string; versionId: string; fileName: string }>>(registryFile, []);
  const updates: Array<{ projectId: string; fileName: string; currentVersion: string; latestVersion: string; latestVersionName: string }> = [];
  for (const entry of registry) {
    if (!entry.projectId || !entry.versionId || !entry.fileName) continue;
    const response = await fetch("https://api.modrinth.com/v2/project/" + encodeURIComponent(entry.projectId) +
      "/version?game_versions=" + encodeURIComponent(JSON.stringify([args.version])) +
      "&loaders=" + encodeURIComponent(JSON.stringify([args.loader])));
    if (!response.ok) continue;
    const versions = await response.json() as any[];
    const latest = versions[0];
    if (latest?.id && latest.id !== entry.versionId) updates.push({
      projectId: entry.projectId, fileName: entry.fileName, currentVersion: entry.versionId,
      latestVersion: String(latest.id), latestVersionName: String(latest.version_number || latest.name || latest.id)
    });
  }
  return updates;
});

ipcMain.handle("mods:update", async (_event, args: { version: string; loader: string; projectId: string ; instanceId?: string}) => {
  const instance = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default"));
  if (!["fabric", "quilt"].includes(args.loader)) throw new Error("Mod updates require a Fabric or Quilt instance.");
  const directory = instance.mods;
  const registryFile = path.join(directory, ".vampire-mods.json");
  const registry = await readJson<Array<{ projectId: string; versionId: string; fileName: string }>>(registryFile, []);
  const entry = registry.find(item => item.projectId === args.projectId);
  if (!entry) throw new Error("This mod has no Vampire install record. Remove it and reinstall through Modrinth to enable updates.");
  const selected = await fetchModrinthVersion(entry.projectId, args.version, args.loader);
  const file = selected.files.find((item: any) => item.primary) || selected.files[0];
  const url = new URL(String(file?.url || ""));
  if (url.protocol !== "https:" || url.hostname !== "cdn.modrinth.com") throw new Error("Mod download host was rejected.");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Mod update download failed (" + response.status + ").");
  const bytes = await verifyModrinthDownload(response, file);
  const fileName = path.basename(String(file.filename || "mod.jar")).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!fileName.toLowerCase().endsWith(".jar")) throw new Error("Modrinth returned a non-JAR file.");
  const oldPath = path.join(directory, entry.fileName);
  const newPath = path.join(directory, fileName);
  const tempPath = newPath + ".vampire-tmp";
  await fs.writeFile(tempPath, bytes, { flag: "w" });
  if (oldPath !== newPath) await fs.unlink(oldPath).catch(() => undefined);
  await fs.rename(tempPath, newPath);
  entry.fileName = fileName;
  entry.versionId = String(selected.id);
  await writeJson(registryFile, registry);
  return { success: true, fileName };
});

ipcMain.handle("mods:remove", async (_event, args: { fileName: string; version: string; loader: string ; instanceId?: string}) => {
  const name = path.basename(String(args.fileName));
  if (name !== args.fileName || !(name.toLowerCase().endsWith(".jar") || name.toLowerCase().endsWith(".jar.disabled"))) throw new Error("Invalid mod filename.");
  await fs.unlink(path.join((await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).mods, name));
  return { success: true };
});
ipcMain.handle("mods:toggle", async (_event, args: { fileName: string; version: string; loader: string ; instanceId?: string}) => {
  const name = path.basename(String(args.fileName));
  if (name !== args.fileName || !(name.toLowerCase().endsWith(".jar") || name.toLowerCase().endsWith(".jar.disabled"))) throw new Error("Invalid mod filename.");
  const directory = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).mods;
  const enabled = name.toLowerCase().endsWith(".jar");
  const nextName = enabled ? name + ".disabled" : name.slice(0, -".disabled".length);
  await fs.rename(path.join(directory, name), path.join(directory, nextName));
  return { success: true, fileName: nextName, enabled: !enabled };
});

async function uniqueArchivePath(directory: string, fileName: string) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  for (let index = 1; index <= 10_000; index++) {
    const candidate = path.join(directory, index === 1 ? fileName : stem + " (" + index + ")" + extension);
    try { await fs.access(candidate); }
    catch { return candidate; }
  }
  throw new Error("Too many files with this name in the destination folder.");
}

ipcMain.handle("shaders:list", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const instance = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default"));
  const dir = path.join(instance.root, "shaderpacks");
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
    .map(entry => entry.name).sort((a, b) => a.localeCompare(b));
});

ipcMain.handle("shaders:import", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const instance = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default"));
  const choice = await dialog.showOpenDialog(mainWindow!, {
    title: "Import Minecraft shader pack",
    properties: ["openFile"],
    filters: [{ name: "Shader pack ZIP", extensions: ["zip"] }]
  });
  if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
  const source = choice.filePaths[0];
  if (path.extname(source).toLowerCase() !== ".zip") throw new Error("Only ZIP shader packs are supported.");
  const stat = await fs.stat(source);
  if (!stat.isFile() || stat.size < 4 || stat.size > 512 * 1024 * 1024) throw new Error("Shader ZIP must be between 4 bytes and 512 MB.");
  await assertZipSignature(source);
  const dir = path.join(instance.root, "shaderpacks");
  await fs.mkdir(dir, { recursive: true });
  const base = path.basename(source).replace(/[^A-Za-z0-9._ -]/g, "_");
  const destination = await uniqueArchivePath(dir, base);
  await fs.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
  return { canceled: false, fileName: path.basename(destination) };
});

ipcMain.handle("shaders:download", async (_event, args: { slug: string; version: string; loader: string; instanceId?: string }) => {
  const slug = String(args.slug || "");
  if (!/^[a-z0-9-]{2,80}$/i.test(slug)) throw new Error("Invalid Modrinth shader project.");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(args.version || ""))) throw new Error("Invalid Minecraft version.");
  const instance = await safeInstanceAsync(args.version, args.loader, args.instanceId || "default");
  const endpoint = "https://api.modrinth.com/v2/project/" + encodeURIComponent(slug) +
    "/version?game_versions=" + encodeURIComponent(JSON.stringify([args.version]));
  const response = await fetch(endpoint, { headers: { "User-Agent": "VampireClient/0.3.0 (shader-installer)" } });
  if (!response.ok) throw new Error("Modrinth shader lookup failed (" + response.status + ").");
  const versions = await response.json() as any[];
  const release = versions.find((entry: any) => Array.isArray(entry.files) && entry.files.some((file: any) => String(file.filename || "").toLowerCase().endsWith(".zip")));
  if (!release) throw new Error("No shader ZIP release was found for Minecraft " + args.version + ".");
  const file = release.files.find((entry: any) => entry.primary && String(entry.filename || "").toLowerCase().endsWith(".zip"))
    || release.files.find((entry: any) => String(entry.filename || "").toLowerCase().endsWith(".zip"));
  if (!file?.url) throw new Error("Modrinth did not provide a shader ZIP download.");
  const url = new URL(String(file.url));
  if (url.protocol !== "https:" || url.hostname !== "cdn.modrinth.com") throw new Error("Shader download host was rejected.");
  const download = await fetch(url);
  if (!download.ok) throw new Error("Shader download failed (" + download.status + ").");
  const bytes = await verifyModrinthDownload(download, file);
  const fileName = path.basename(String(file.filename || "shader.zip")).replace(/[^A-Za-z0-9._ -]/g, "_");
  if (!fileName.toLowerCase().endsWith(".zip")) throw new Error("Modrinth returned a non-ZIP shader file.");
  const directory = path.join(instance.root, "shaderpacks");
  await fs.mkdir(directory, { recursive: true });
  const destination = await uniqueArchivePath(directory, fileName);
  const temporary = path.join(directory, ".vampire-" + randomUUID() + ".tmp");
  await fs.writeFile(temporary, bytes, { flag: "wx" });
  try {
    await assertZipSignature(temporary);
    await fs.copyFile(temporary, destination, fsConstants.COPYFILE_EXCL);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
  return { success: true, fileName: path.basename(destination) };
});

ipcMain.handle("shaders:remove", async (_event, args: { version: string; loader: string; fileName: string ; instanceId?: string}) => {
  const instance = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default"));
  const name = String(args.fileName || "");
  if (!/^[A-Za-z0-9._ -]{1,180}\.zip$/i.test(name) || path.basename(name) !== name) throw new Error("Invalid shader pack filename.");
  await fs.unlink(path.join(instance.root, "shaderpacks", name));
  return { success: true };
});

ipcMain.handle("performance:applyPreset", async (_event, args: { preset: string; version: string; loader: string; instanceId?: string }) => {
  const presets: Record<string, Record<string, string>> = {
    "celeron-low": { renderDistance: "5", simulationDistance: "4", graphicsMode: "0", particles: "0", entityDistanceScaling: "0.5", biomeBlendRadius: "0", mipmapLevels: "0", ao: "false", enableVsync: "false", clouds: "fast", entityShadows: "false", maxFps: "260" },
    "i3-balanced": { renderDistance: "8", simulationDistance: "5", graphicsMode: "0", particles: "1", entityDistanceScaling: "0.75", biomeBlendRadius: "1", mipmapLevels: "2", ao: "false", enableVsync: "false", clouds: "fast", entityShadows: "false", maxFps: "500" }
  };
  const preset = presets[String(args.preset || "")];
  if (!preset) throw new Error("Unknown performance preset.");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(args.version || ""))) throw new Error("Invalid Minecraft version.");
  if (!["vanilla", "fabric", "quilt"].includes(String(args.loader || ""))) throw new Error("Invalid Minecraft loader.");
  const optionsFile = path.join((await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root, "options.txt");
  await fs.mkdir(path.dirname(optionsFile), { recursive: true });
  let existing = "";
  try { existing = await fs.readFile(optionsFile, "utf8"); } catch { /* first launch: create options file */ }
  const values = new Map<string, string>();
  for (const line of existing.split(/\r?\n/)) {
    const split = line.indexOf(":");
    if (split > 0) values.set(line.slice(0, split), line.slice(split + 1));
  }
  for (const [key, value] of Object.entries(preset)) values.set(key, value);
  await fs.writeFile(optionsFile, Array.from(values.entries()).map(([key, value]) => key + ":" + value).join("\n") + "\n", "utf8");
  return { success: true, preset: args.preset, optionsFile };
});

ipcMain.handle("performance:set", async (_event, args: { profile: string; version: string; loader: string; instanceId?: string }) => {
  const profile = String(args.profile || "");
  if (!["sodium", "vulkanmod"].includes(profile)) throw new Error("Unknown performance renderer profile.");
  if (args.loader !== "fabric") throw new Error("Performance renderer profiles require a Fabric instance.");
  const instance = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default"));
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
  mainWindow.webContents.on("will-attach-webview", (event) => { event.preventDefault(); });
  const isTrustedAppNavigation = (url: string) => {
    try {
      const parsed = new URL(url);
      const expectedAppUrl = pathToFileURL(path.resolve(__dirname, "../dist/index.html")).href;
      return url === expectedAppUrl ||
        (!app.isPackaged && parsed.origin === "http://127.0.0.1:5173" && parsed.pathname === "/");
    } catch {
      return false;
    }
  };
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedAppNavigation(url)) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (!isTrustedAppNavigation(url)) event.preventDefault();
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
  // The launcher has no browser-permission features; deny requests from both the app and remote content.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  void fs.mkdir(dataRoot(), { recursive: true });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
let shutdownInProgress = false;
function waitForChildExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      proc.removeListener("close", onClose);
      resolve();
    }, timeoutMs);
    const onClose = () => {
      clearTimeout(timer);
      resolve();
    };
    proc.once("close", onClose);
  });
}

app.on("before-quit", event => {
  if (shutdownInProgress) return;
  event.preventDefault();
  shutdownInProgress = true;

  void (async () => {
    const children: ChildProcess[] = [];
    const activeGame = gameProcess;
    if (activeGame && activeGame.exitCode === null) {
      children.push(activeGame);
      try { activeGame.kill("SIGTERM"); } catch { /* process may have exited */ }
    }

    for (const [id, proc] of worldServerProcesses) {
      if (proc.exitCode !== null) continue;
      children.push(proc);
      try {
        if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) proc.stdin.write("stop\n");
        else proc.kill("SIGTERM");
      } catch {
        try { proc.kill("SIGTERM"); } catch { /* process may have exited */ }
      }
      const previousTimer = worldServerStopTimers.get(id);
      if (previousTimer) clearTimeout(previousTimer);
      worldServerStopTimers.delete(id);
    }

    await Promise.all(children.map(proc => waitForChildExit(proc, 8000)));
    for (const proc of children) {
      if (proc.exitCode === null && proc.signalCode === null) {
        try { proc.kill("SIGKILL"); } catch { /* process may have exited */ }
      }
    }
    await Promise.all(children.map(proc => waitForChildExit(proc, 1500)));
    if (gameStopTimer) clearTimeout(gameStopTimer);
    gameStopTimer = null;
    app.quit();
  })();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
