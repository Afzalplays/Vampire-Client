import { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { totalmem, freemem, networkInterfaces } from "node:os";
import { launch, Version } from "@xmcl/core";
import { getVersionList, install, getLoaderArtifactListFor, installFabric, installDependencies } from "@xmcl/installer";
import { offline, MicrosoftAuthenticator, MojangClient } from "@xmcl/user";
import { PublicClientApplication } from "@azure/msal-node";

const allowedHosts = new Set(["modrinth.com", "www.modrinth.com", "github.com", "www.github.com"]);
let mainWindow: BrowserWindow | null = null;
let gameProcess: import("node:child_process").ChildProcess | null = null;
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

function safeInstance(version: string, loader: string, instanceId = "default") {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(version || ""))) throw new Error("Invalid Minecraft instance version.");
  if (!["vanilla", "fabric"].includes(String(loader || ""))) throw new Error("Invalid Minecraft mod loader.");
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

async function listVersions() {
  const manifest = await getVersionList();
  return manifest.versions
    .filter((v: any) => ["release", "snapshot", "old_beta", "old_alpha"].includes(v.type))
    .map((v: any) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

ipcMain.handle("instances:list", async () => readJson<Array<{ id: string; name: string; createdAt: string }>>(instancesFile(), [{ id: "default", name: "Default", createdAt: "" }]));
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
  if (proc.stdin && !proc.stdin.destroyed) {
    proc.stdin.write("stop\n");
    const previousTimer = worldServerStopTimers.get(id);
    if (previousTimer) clearTimeout(previousTimer);
    const forceTimer = setTimeout(() => {
      if (proc.exitCode === null) proc.kill("SIGTERM");
      worldServerStopTimers.delete(id);
    }, 15000);
    forceTimer.unref();
    worldServerStopTimers.set(id, forceTimer);
  } else proc.kill("SIGTERM");
  return { success: true, stopped: true };
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
    loader: ["vanilla", "fabric"].includes(String(settings.loader)) ? settings.loader : current.loader,
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

ipcMain.handle("java:detect", async (_event, args: { javaPath?: string }) => {
  const executable = typeof args.javaPath === "string" && args.javaPath.trim() ? args.javaPath.trim() : "java";
  if (executable.length > 1024) throw new Error("Java path is too long.");
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const { execFile } = require("node:child_process") as typeof import("node:child_process");
    execFile(executable, ["-version"], { timeout: 7000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || stdout || error.message).trim().slice(0, 1200)));
      else resolve({ stdout: stdout || "", stderr: stderr || "" });
    });
  });
  const output = (result.stderr + "\\n" + result.stdout).trim();
  const match = output.match(/version "([^"]+)"/i);
  return { success: true, executable, version: match?.[1] || "Detected (version string unavailable)", output: output.slice(0, 1200), platform: process.platform, architecture: process.arch };
});

ipcMain.handle("system:memory", async () => ({ totalBytes: totalmem(), freeBytes: freemem(), totalGB: Math.round((totalmem() / 1024 ** 3) * 10) / 10, freeGB: Math.round((freemem() / 1024 ** 3) * 10) / 10 }));

ipcMain.handle("versions:list", async () => listVersions());

ipcMain.handle("game:install", async (_event, args: { version: string; loader: string; instanceId?: string }) => {
  const versionId = String(args.version || "");
  const loader = String(args.loader || "vanilla");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(versionId)) throw new Error("Invalid Minecraft version ID.");
  if (!["vanilla", "fabric"].includes(loader)) throw new Error("This build supports Vanilla and Fabric profiles.");
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
  }

  const installed = await readJson<Record<string, string>>(installedVersionsFile(), {});
  installed[instanceKey(versionId, loader, args.instanceId || "default")] = launchVersion;
  await writeJson(installedVersionsFile(), installed);
  sendStatus("Minecraft " + versionId + (loader === "fabric" ? " + Fabric" : "") + " is installed.");
  return { success: true, version: versionId, launchVersion };
});

ipcMain.handle("game:installStatus", async (_event, args: { version: string; loader: string; instanceId?: string }) => {
  const versionId = String(args.version || "");
  const loader = String(args.loader || "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(versionId) || !["vanilla", "fabric"].includes(loader)) {
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
  const activeLoader = ["vanilla", "fabric"].includes(settings.loader) ? settings.loader : "vanilla";
  const activeInstanceId = args.instanceId || settings.instanceId || "default";
  const installKey = instanceKey(args.version, activeLoader, activeInstanceId);
  const launchVersion = installed[installKey] || (activeInstanceId === "default" ? installed[args.version + ":" + activeLoader] : undefined);
  if (!launchVersion) {
    throw new Error("Minecraft " + args.version + " (" + activeLoader + ") is not installed yet. Open Versions and install it before launching.");
  }
  const root = (await safeInstanceAsync(args.version, activeLoader, activeInstanceId)).root;
  try {
    await fs.access(root);
    await Version.parse(root, launchVersion);
  } catch {
    throw new Error("The installed Minecraft files are missing or damaged. Reinstall this version from the Versions page.");
  }
  const scopedSettings = settings.instanceSettings?.[activeInstanceId] || {};
  const javaPath = typeof args.javaPath === "string" && args.javaPath.trim() ? args.javaPath.trim() : (scopedSettings.javaPath || settings.javaPath);
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
  proc.once("close", code => {
    sendStatus("Minecraft closed with exit code " + String(code));
    gameProcess = null;
  });
  return { success: true, pid: proc.pid };
});

ipcMain.handle("game:stop", async () => {
  if (!gameProcess || gameProcess.exitCode !== null || gameProcess.killed) {
    gameProcess = null;
    return { success: true, stopped: false };
  }
  const pid = gameProcess.pid;
  const stopped = gameProcess.kill("SIGTERM");
  if (stopped) sendStatus("Stop signal sent to Minecraft (PID " + String(pid) + ").");
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
  if (loader !== "fabric") throw new Error("Mod downloads in this preview are configured for Fabric profiles only.");
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
  if (args.loader !== "fabric") throw new Error("Modpack imports currently support Fabric only.");
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
async function assertResourcePackZip(file: string) {
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
    const disk = tail.readUInt16LE(eocd + 4);
    const centralDisk = tail.readUInt16LE(eocd + 6);
    const diskEntries = tail.readUInt16LE(eocd + 8);
    const entries = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (disk || centralDisk || diskEntries !== entries || entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error("Multi-disk and ZIP64 resource packs are not supported.");
    }
    if (!entries || entries > 50_000 || centralSize > 32 * 1024 * 1024 || centralOffset + centralSize > stat.size) {
      throw new Error("Resource pack ZIP directory exceeds safety limits.");
    }
    const directory = Buffer.alloc(centralSize);
    await handle.read(directory, 0, centralSize, centralOffset);
    let offset = 0;
    let totalUncompressed = 0;
    let hasMetadata = false;
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
      const commentLength = directory.readUInt16LE(offset + 32);
      const end = offset + 46 + nameLength + extraLength + commentLength;
      if (end > directory.length || (flags & 1) !== 0 || ![0, 8].includes(method) ||
          compressed === 0xffffffff || uncompressed === 0xffffffff) {
        throw new Error("Resource pack contains encrypted, unsupported or malformed ZIP entries.");
      }
      const entryName = directory.toString("utf8", offset + 46, offset + 46 + nameLength).replace(/\\/g, "/");
      if (entryName.startsWith("/") || entryName.split("/").some(part => part === "..")) {
        throw new Error("Resource pack contains an unsafe file path.");
      }
      if (entryName === "pack.mcmeta") hasMetadata = true;
      totalUncompressed += uncompressed;
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
}

ipcMain.handle("resourcepacks:import", async (_event, args: { version: string; loader: string ; instanceId?: string}) => {
  const root = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root;
  const choice = await dialog.showOpenDialog(mainWindow!, { title: "Import Minecraft resource pack", properties: ["openFile"], filters: [{ name: "Resource pack ZIP", extensions: ["zip"] }] });
  if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
  const source = choice.filePaths[0];
  const stat = await fs.stat(source);
  if (path.extname(source).toLowerCase() !== ".zip" || !stat.isFile() || stat.size < 4 || stat.size > 512 * 1024 * 1024) throw new Error("Resource pack must be a ZIP file between 4 bytes and 512 MB.");
  await assertResourcePackZip(source);
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
ipcMain.handle("resourcepacks:remove", async (_event, args: { version: string; loader: string; fileName: string ; instanceId?: string}) => {
  const root = (await safeInstanceAsync(args.version, args.loader, args.instanceId || "default")).root;
  const name = String(args.fileName || "");
  if (!/^[A-Za-z0-9._ -]{1,180}\.zip$/i.test(name) || path.basename(name) !== name) throw new Error("Invalid resource pack filename.");
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
  if (args.loader !== "fabric") throw new Error("Mod updates are available for Fabric instances only.");
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
  const destination = path.join(dir, base);
  await fs.copyFile(source, destination);
  return { canceled: false, fileName: base };
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
  const destination = path.join(directory, fileName);
  const temporary = destination + ".vampire-tmp";
  await fs.writeFile(temporary, bytes, { flag: "w" });
  try { await assertZipSignature(temporary); await fs.rename(temporary, destination); }
  catch (error) { await fs.unlink(temporary).catch(() => undefined); throw error; }
  return { success: true, fileName };
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
  if (!["vanilla", "fabric"].includes(String(args.loader || ""))) throw new Error("Invalid Minecraft loader.");
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
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      const expectedAppUrl = pathToFileURL(path.resolve(__dirname, "../dist/index.html")).href;
      const isAppPage = url === expectedAppUrl;
      const isDevServer = !app.isPackaged && parsed.origin === "http://127.0.0.1:5173" && parsed.pathname === "/";
      if (!isAppPage && !isDevServer) event.preventDefault();
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
app.on("before-quit", () => {
  for (const [id, proc] of worldServerProcesses) {
    if (proc.exitCode !== null) continue;
    try {
      if (proc.stdin && !proc.stdin.destroyed) proc.stdin.write("stop\n");
      else proc.kill("SIGTERM");
      const previousTimer = worldServerStopTimers.get(id);
      if (previousTimer) clearTimeout(previousTimer);
      const forceTimer = setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGTERM");
        worldServerStopTimers.delete(id);
      }, 8000);
      forceTimer.unref();
      worldServerStopTimers.set(id, forceTimer);
    } catch { /* best-effort graceful shutdown during app exit */ }
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
