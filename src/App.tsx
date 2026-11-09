import { useEffect, useMemo, useState, type ReactNode } from "react";
import ShaderLibrary from "./features/ShaderLibrary";
import TexturePackEditor from "./features/TexturePackEditor";
import SkinCapeStudio from "./features/SkinCapeStudio";
import { scanModConflicts, extractLogIssues, extractLogIssueContext, summarizeLogIssues, analyzeLauncherLog, redactDiagnosticLog } from "./features/diagnostics";
import { Activity, Blocks, ChevronDown, CircleUserRound, Cpu, Download, ExternalLink, Gamepad2, Gauge, HardDrive, Layers3, Monitor, Package, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Zap } from "lucide-react";

function requiredJavaMajor(version: string): number {
  const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return 21;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] || 0);
  if (major >= 26) return 25;
  if (major > 1) return 21;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 17;
  return 8;
}

function detectedJavaMajor(version: string): number | null {
  const legacy = version.match(/^1\.(\d+)/);
  if (legacy) return Number(legacy[1]);
  const current = version.match(/^(\d+)/);
  return current ? Number(current[1]) : null;
}

type Tab = "Home" | "Versions" | "Mods" | "Shaders" | "Texture Editor" | "Studio" | "Accounts" | "Settings";
type Mod = { project_id: string; title: string; description: string; downloads: number; icon_url?: string; slug: string; };
const nav: { name: Tab; icon: typeof Gamepad2 }[] = [
  { name: "Home", icon: Gamepad2 }, { name: "Versions", icon: Layers3 }, { name: "Mods", icon: Blocks }, { name: "Shaders", icon: Sparkles }, { name: "Texture Editor", icon: Package }, { name: "Studio", icon: Sparkles }, { name: "Accounts", icon: CircleUserRound }, { name: "Settings", icon: Settings2 }
];

export default function App() {
  const [booting, setBooting] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setBooting(false), 1400); return () => window.clearTimeout(timer); }, []);
  const [tab, setTab] = useState<Tab>("Home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState("");
  const [installedStatusFilter, setInstalledStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [modsRefreshing, setModsRefreshing] = useState(false);
  const [catalogSort, setCatalogSort] = useState<"downloads" | "name">("downloads");
  const [javaCheck, setJavaCheck] = useState<{version:string;executable:string;platform:string;architecture:string}|null>(null);
  const [javaChecking, setJavaChecking] = useState(false);
  const [javaInstalling, setJavaInstalling] = useState(false);
  const [logText, setLogText] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [downloadedUpdate, setDownloadedUpdate] = useState<{fileName:string;version:string;sha256:string}|null>(null);
  const [updateResult, setUpdateResult] = useState<Awaited<ReturnType<NonNullable<Window["vampire"]>["checkForUpdates"]>> | null>(null);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("Player");
  const [ram, setRam] = useState(2);
  const [systemMemory, setSystemMemory] = useState<{ totalGB: number; freeGB: number; maxWorldServerRamGB: number } | null>(null);
  const [version, setVersion] = useState("1.21.1");
  const [instanceId, setInstanceId] = useState("default");
  const [instances, setInstances] = useState<Array<{id:string;name:string;createdAt:string}>>([{id:"default",name:"Default",createdAt:""}]);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [installed, setInstalled] = useState<Array<{fileName:string;enabled:boolean}>>([]);
  const [resourcePacks, setResourcePacks] = useState<string[]>([]);
  const [schematicFiles, setSchematicFiles] = useState<Array<{fileName:string;bytes:number;modifiedAt:string}>>([]);
  const [replayFiles, setReplayFiles] = useState<Array<{fileName:string;bytes:number;modifiedAt:string}>>([]);
  const [resourcePackFilter, setResourcePackFilter] = useState("");
  const [resourcePacksLoading, setResourcePacksLoading] = useState(false);
  const [resourcePackInspection, setResourcePackInspection] = useState<{fileName:string;fileSizeBytes:number;fileCount:number;textureCount:number;totalUncompressedBytes:number;packFormat:number;description:string;hasPackIcon:boolean}|null>(null);
  const [resourcePackInspecting, setResourcePackInspecting] = useState(false);
  const [modUpdates, setModUpdates] = useState<Array<{projectId:string;fileName:string;currentVersion:string;latestVersion:string;latestVersionName:string}>>([]);
  const [versions, setVersions] = useState<Array<{id:string;type:string;releaseTime:string}>>([]);
  const [versionTypeFilter, setVersionTypeFilter] = useState("release");
  const [loader, setLoader] = useState("fabric");
  const [javaPath, setJavaPath] = useState("java");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [accountType, setAccountType] = useState("Offline");
  const [microsoftAccounts, setMicrosoftAccounts] = useState<Array<{id:string;username:string;name:string}>>([]);
  const [rendererProfile, setRendererProfile] = useState<"sodium" | "vulkanmod">("sodium");
  const [gameStatus, setGameStatus] = useState("Ready");
  const [installedGame, setInstalledGame] = useState<{ installed: boolean; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [capeStyle, setCapeStyle] = useState("crimson");
  const [nameStyle, setNameStyle] = useState("inferno");
  const [chatGradient, setChatGradient] = useState(true);
  const [nametagLogo, setNametagLogo] = useState(true);
  const [customHud, setCustomHud] = useState(true);
  const [schematicsEnabled, setSchematicsEnabled] = useState(true);
  const [shaderSupport, setShaderSupport] = useState(true);
  const [replaySupport, setReplaySupport] = useState(false);
  const [worldHosting, setWorldHosting] = useState(false);
  const [worldServers, setWorldServers] = useState<Array<{id:string;name:string;version:string;createdAt:string;ramGB:number;port:number;autoRestart:boolean;running:boolean}>>([]);
  const [worldServerBackups, setWorldServerBackups] = useState<Array<{id:string;serverId:string;serverName:string;version:string;createdAt:string;bytes:number}>>([]);
  const [newWorldServerName, setNewWorldServerName] = useState("My Vampire World");
  const [worldServerRam, setWorldServerRam] = useState(1);
  const [newWorldServerPort, setNewWorldServerPort] = useState(25565);
  const [worldServerEulaAccepted, setWorldServerEulaAccepted] = useState(false);
  const [activeWorldServerId, setActiveWorldServerId] = useState("");
  const [worldServerLogs, setWorldServerLogs] = useState("");
  const [worldServerAddresses, setWorldServerAddresses] = useState<string[]>([]);
  const [worldServerPort, setWorldServerPort] = useState(25565);
  const [worldServerExitStatus, setWorldServerExitStatus] = useState("");
  const [worldServerDiagnostics, setWorldServerDiagnostics] = useState<Array<{title:string;detail:string;severity:"error"|"warning"|"info"}>>([]);
  const [worldServerCommand, setWorldServerCommand] = useState("");
  const [hostingMode, setHostingMode] = useState<"both" | "lan" | "internet">("both");
  const worldServerRamLimit = systemMemory?.maxWorldServerRamGB ?? 0;
  const [capeVisibility, setCapeVisibility] = useState<"account" | "client-only">("account");
  const [shaderPacks, setShaderPacks] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("vampire-studio-preferences") || "{}");
      setCapeStyle(saved.capeStyle || "crimson");
      setNameStyle(saved.nameStyle || "inferno");
      setChatGradient(saved.chatGradient ?? true);
      setNametagLogo(saved.nametagLogo ?? true);
      setCustomHud(saved.customHud ?? true);
      setSchematicsEnabled(saved.schematicsEnabled ?? true);
      setShaderSupport(saved.shaderSupport ?? true);
      setReplaySupport(saved.replaySupport ?? false);
      setWorldHosting(saved.worldHosting ?? false);
      setHostingMode(saved.hostingMode === "lan" || saved.hostingMode === "internet" ? saved.hostingMode : "both");
      setCapeVisibility(saved.capeVisibility === "client-only" ? "client-only" : "account");
    } catch { /* keep safe defaults */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("vampire-studio-preferences", JSON.stringify({
        capeStyle, nameStyle, chatGradient, nametagLogo, customHud,
        schematicsEnabled, shaderSupport, replaySupport, worldHosting, hostingMode, capeVisibility
      }));
    } catch { /* storage can be unavailable in restricted environments */ }
  }, [capeStyle, nameStyle, chatGradient, nametagLogo, customHud, schematicsEnabled, shaderSupport, replaySupport, worldHosting, hostingMode, capeVisibility]);


  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "ShiftRight" && !event.repeat) setMenuOpen(v => !v);
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!window.vampire) return;
    let active = true;
    const unsubscribe = window.vampire.onGameStatus(message => { if (active) setGameStatus(message); });
    Promise.all([window.vampire.getProfile(), window.vampire.getSettings(), window.vampire.listVersions(), window.vampire.getMicrosoftAccount(), window.vampire.getSystemMemory(), window.vampire.listInstances()])
      .then(([savedProfile, settings, catalog, microsoftAccount, memory, savedInstances]) => {
        if (!active) return;
        setProfile(microsoftAccount.authenticated && microsoftAccount.profile ? microsoftAccount.profile.name : savedProfile.active); setAccountType(microsoftAccount.accountType === "microsoft" ? "Microsoft" : "Offline"); void window.vampire?.listMicrosoftAccounts().then(setMicrosoftAccounts).catch(() => undefined); setRam(settings.ram); setVersion(settings.version); setJavaPath(settings.javaPath); setLoader(settings.loader); setMicrosoftClientId(settings.clientId || ""); setVersions(catalog); setInstances(savedInstances); setInstanceId(savedInstances.some(item => item.id === settings.instanceId) ? (settings.instanceId || "default") : "default"); setSystemMemory({ totalGB: memory.totalGB, freeGB: memory.freeGB, maxWorldServerRamGB: memory.maxWorldServerRamGB });
      }).catch(error => { if (active) setGameStatus(error instanceof Error ? error.message : "Could not load launcher data."); });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!window.vampire) return;
    let active = true;
    window.vampire.listWorldServers().then(items => { if (active) setWorldServers(items); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!window.vampire) return;
    return window.vampire.onWorldServerOutput(event => {
      if (event.id === activeWorldServerId) setWorldServerLogs(previous => (previous + event.text + "\\n").slice(-80000));
      if (event.text.includes("Server stopped with exit code")) {
        void window.vampire?.listWorldServers().then(setWorldServers);
        if (event.id === activeWorldServerId) {
          // Allow the asynchronous log append to finish before fetching the final
          // diagnostic snapshot, so the crash cause is available immediately.
          window.setTimeout(() => {
            void window.vampire?.getWorldServerInfo(event.id).then(info => {
              setWorldServerLogs(info.logs);
              setWorldServerDiagnostics(info.diagnostics || []);
              setWorldServerExitStatus(info.lastError
                ? "Server process error: " + info.lastError
                : info.lastExitCode !== null
                  ? "Server exited with code " + info.lastExitCode + (info.lastExitAt ? " at " + new Date(info.lastExitAt).toLocaleString() : "") + "."
                  : "Server stopped.");
            }).catch(() => undefined);
          }, 500);
        }
      }
    });
  }, [activeWorldServerId]);

  async function selectWorldServer(id: string) {
    if (!window.vampire) return;
    if (!id) { setActiveWorldServerId(""); setWorldServerBackups([]); setWorldServerLogs(""); setWorldServerAddresses([]); setWorldServerExitStatus(""); setWorldServerDiagnostics([]); return; }
    setActiveWorldServerId(id);
    try {
      const info = await window.vampire.getWorldServerInfo(id);
      setWorldServerBackups(await window.vampire.listWorldServerBackups(id));
      setWorldServerLogs(info.logs);
      setWorldServerDiagnostics(info.diagnostics || []);
      setWorldServerAddresses(info.lanAddresses);
      setWorldServerPort(info.port);
      setWorldServerExitStatus(info.running ? "Server process is running." : info.lastError ? "Could not start server: " + info.lastError : info.lastExitCode !== null ? "Last server process exited with code " + info.lastExitCode + (info.lastExitAt ? " at " + new Date(info.lastExitAt).toLocaleString() : "") + "." : "Server is stopped. Start it after accepting the Minecraft EULA.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not load server details."); }
  }
  async function saveWorldServerPort() {
    if (!window.vampire || !activeWorldServerId) return;
    setBusy(true);
    try {
      const result = await window.vampire.setWorldServerPort({ id: activeWorldServerId, port: worldServerPort });
      setWorldServerPort(result.port);
      setWorldServers(await window.vampire.listWorldServers());
      notify("Server port saved: " + result.port + ". Restart the server to apply it.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save server port."); }
    finally { setBusy(false); }
  }
  async function createWorldServerBackup() {
    if (!window.vampire || !activeWorldServerId) return;
    setBusy(true);
    try {
      const backup = await window.vampire.createWorldServerBackup(activeWorldServerId);
      setWorldServerBackups(await window.vampire.listWorldServerBackups(activeWorldServerId));
      notify("Backup created: " + backup.serverName + " · " + (backup.bytes / 1024 / 1024).toFixed(1) + " MB.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not create server backup."); }
    finally { setBusy(false); }
  }
  async function restoreWorldServerBackup(backupId: string) {
    if (!window.vampire || !activeWorldServerId) return;
    if (!window.confirm("Restore this backup? Current server files will be replaced. The server must remain stopped.")) return;
    setBusy(true);
    try {
      await window.vampire.restoreWorldServerBackup({ id: activeWorldServerId, backupId });
      await selectWorldServer(activeWorldServerId);
      setWorldServers(await window.vampire.listWorldServers());
      notify("World server backup restored.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not restore server backup."); }
    finally { setBusy(false); }
  }
  async function deleteWorldServerBackup(backupId: string) {
    if (!window.vampire || !activeWorldServerId) return;
    if (!window.confirm("Permanently delete this backup?")) return;
    try {
      await window.vampire.deleteWorldServerBackup({ id: activeWorldServerId, backupId });
      setWorldServerBackups(await window.vampire.listWorldServerBackups(activeWorldServerId));
      notify("Backup deleted.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not delete backup."); }
  }
  async function sendWorldServerCommand() {
    if (!window.vampire || !activeWorldServerId) return;
    try {
      await window.vampire.sendWorldServerCommand({ id: activeWorldServerId, command: worldServerCommand });
      setWorldServerCommand("");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not send server command."); }
  }

  async function createWorldServer() {
    if (!window.vampire) return notify("World server hosting is available in the desktop app.");
    if (!newWorldServerName.trim()) return notify("Enter a name for your world server.");
    setBusy(true);
    try {
      const created = await window.vampire.createWorldServer({ name: newWorldServerName, version, ramGB: worldServerRam, port: newWorldServerPort });
      setWorldServers(await window.vampire.listWorldServers());
      setActiveWorldServerId(created.id);
      await selectWorldServer(created.id);
      setNewWorldServerName("");
      notify("Server JAR downloaded and SHA-1 verified. Review the EULA before starting.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not create world server."); }
    finally { setBusy(false); }
  }
  async function startWorldServer(id: string) {
    if (!window.vampire) return;
    if (!worldServerEulaAccepted) return notify("Read and accept the Minecraft EULA before starting.");
    setBusy(true);
    try {
      await window.vampire.startWorldServer({ id, javaPath, ramGB: worldServerRam, acceptEula: true });
      setWorldServers(await window.vampire.listWorldServers());
      await selectWorldServer(id);
      notify("World server start command sent. First startup may take a few minutes.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not start world server."); }
    finally { setBusy(false); }
  }
  async function setWorldServerAutoRestart(id: string, enabled: boolean) {
    if (!window.vampire) return;
    try {
      await window.vampire.setWorldServerAutoRestart({ id, enabled });
      setWorldServers(await window.vampire.listWorldServers());
      notify(enabled ? "Automatic crash recovery enabled: up to 3 restart attempts within 10 minutes." : "Automatic crash recovery disabled.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not update crash recovery setting."); }
  }

  async function stopWorldServer(id: string) {
    if (!window.vampire) return;
    try {
      await window.vampire.stopWorldServer(id);
      window.setTimeout(() => { void window.vampire?.listWorldServers().then(setWorldServers); }, 1200);
      notify("Graceful stop requested.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not stop world server."); }
  }
  async function deleteWorldServer(id: string) {
    if (!window.vampire || !window.confirm("Delete this world server, its complete local world folder and all its backups? This cannot be undone.")) return;
    try {
      await window.vampire.deleteWorldServer(id);
      setWorldServers(await window.vampire.listWorldServers());
      if (activeWorldServerId === id) { setActiveWorldServerId(""); setWorldServerBackups([]); setWorldServerLogs(""); setWorldServerAddresses([]); setWorldServerExitStatus(""); }
      notify("World server files deleted.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not delete world server."); }
  }

  async function searchMods() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ query: query.trim() || "performance", limit: "24", facets: JSON.stringify(loader !== "vanilla" ? [[ "versions:" + version ], [ "categories:" + loader ]] : [[ "versions:" + version ]]) });
      const response = await fetch("https://api.modrinth.com/v2/search?" + params.toString());
      if (!response.ok) throw new Error("Modrinth returned " + response.status);
      const data = await response.json();
      setMods(data.hits ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reach Modrinth."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (tab === "Mods" && mods.length === 0) void searchMods(); }, [tab]);
  useEffect(() => { if (!window.vampire) return; let active = true; window.vampire.listMods({ version, loader, instanceId }).then(files => { if (active) { setInstalled(files); setRendererProfile(files.some(file => file.enabled && file.fileName.toLowerCase().includes("vulkanmod")) ? "vulkanmod" : "sodium"); } }).catch(() => undefined); return () => { active = false; }; }, [version, loader, instanceId]);
  useEffect(() => { if (!window.vampire) return; let active = true; window.vampire.listStudioFiles({kind:"schematics",version,loader,instanceId}).then(files=>{if(active)setSchematicFiles(files);}).catch(()=>undefined); window.vampire.listStudioFiles({kind:"replays",version,loader,instanceId}).then(files=>{if(active)setReplayFiles(files);}).catch(()=>undefined); return ()=>{active=false;}; }, [version,loader,instanceId]);
  useEffect(() => { if (!window.vampire) return; let active = true; window.vampire.listShaderPacks({ version, loader, instanceId }).then(files => { if (active) setShaderPacks(files); }).catch(() => undefined); window.vampire.listResourcePacks({ version, loader, instanceId }).then(files => { if (active) setResourcePacks(files); }).catch(() => undefined); return () => { active = false; }; }, [version, loader, instanceId]);
  useEffect(() => { if (!window.vampire) return; let active = true; setInstalledGame(null); window.vampire.getInstallStatus({ version, loader, instanceId }).then(status => { if (active) setInstalledGame({ installed: status.installed, reason: status.reason }); }).catch(() => { if (active) setInstalledGame({ installed: false, reason: "status-error" }); }); return () => { active = false; }; }, [version, loader, instanceId]);

  async function importShaderPack() {
    if (!window.vampire) return notify("Shader pack import is available in the desktop app.");
    try { const result = await window.vampire.importShaderPack({ version, loader, instanceId }); if (result.fileName) { setShaderPacks(await window.vampire.listShaderPacks({ version, loader, instanceId })); notify("Imported shader pack: " + result.fileName); } } catch (e) { notify(e instanceof Error ? e.message : "Shader import failed."); }
  }
  async function downloadShaderPack(slug: string) {
    if (!window.vampire) return notify("Shader installation is available in the desktop app.");
    try {
      const result = await window.vampire.downloadShaderPack({ slug, version, loader, instanceId });
      setShaderPacks(await window.vampire.listShaderPacks({ version, loader, instanceId }));
      notify("Installed shader pack: " + result.fileName);
    } catch (e) { notify(e instanceof Error ? e.message : "Shader download failed."); }
  }

  async function removeShaderPack(fileName: string) {
    if (!window.vampire || !window.confirm("Remove shader pack \"" + fileName + "\" from this Minecraft instance?")) return;
    try { await window.vampire.removeShaderPack({ version, loader, instanceId, fileName }); setShaderPacks(await window.vampire.listShaderPacks({ version, loader, instanceId })); notify("Removed shader pack: " + fileName); } catch (e) { notify(e instanceof Error ? e.message : "Could not remove shader pack."); }
  }

  async function saveOfflineProfile() {
    try { if (!window.vampire) throw new Error("Run the desktop app to save profiles."); if (accountType === "Microsoft") { await window.vampire.logoutMicrosoft(); setAccountType("Offline"); } const saved = await window.vampire.saveProfile(profile); setProfile(saved.active); notify("Offline profile saved."); } catch (e) { notify(e instanceof Error ? e.message : "Could not save profile."); }
  }
  async function signInMicrosoft() {
    if (!window.vampire) return notify("Microsoft sign-in is available in the desktop app.");
    if (!microsoftClientId.trim()) return notify("Enter your Microsoft app Client ID first.");
    setBusy(true); try { await window.vampire.saveSettings({ ram, javaPath, version, loader, instanceId, clientId: microsoftClientId.trim() }); const result = await window.vampire.loginMicrosoft(microsoftClientId.trim()); setProfile(result.profile.name); setAccountType("Microsoft"); void window.vampire.listMicrosoftAccounts().then(setMicrosoftAccounts).catch(() => undefined); notify("Microsoft account connected: " + result.profile.name); if (!result.encryptedStorage) notify("Secure token storage is unavailable; sign in again after restarting."); } catch (e) { notify(e instanceof Error ? e.message : "Microsoft sign-in failed."); } finally { setBusy(false); }
  }
  async function signOutMicrosoft() {
    if (!window.vampire) return;
    try { await window.vampire.logoutMicrosoft(); setAccountType("Offline"); setMicrosoftAccounts(await window.vampire.listMicrosoftAccounts()); notify("Microsoft account signed out."); } catch (e) { notify(e instanceof Error ? e.message : "Sign-out failed."); }
  }
  async function switchMicrosoftAccount(accountId: string) {
    if (!window.vampire || busy) return;
    setBusy(true);
    try {
      const result = await window.vampire.switchMicrosoftAccount(accountId);
      setProfile(result.profile.name);
      setAccountType("Microsoft");
      notify("Active Microsoft account: " + result.profile.name);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not switch Microsoft account.");
    } finally { setBusy(false); }
  }

  async function installJavaRuntime() {
    if (!window.vampire) return notify("Java installation is available in the desktop app.");
    if (busy || javaInstalling) return;
    setJavaInstalling(true);
    try {
      const requiredMajor = requiredJavaMajor(version);
      const result = await window.vampire.installJava(requiredMajor);
      setJavaPath(result.executable);
      const detected = await window.vampire.detectJava(result.executable);
      setJavaCheck({ version: detected.version, executable: detected.executable, platform: detected.platform, architecture: detected.architecture });
      await window.vampire.saveSettings({ ram, javaPath: result.executable, version, loader, clientId: microsoftClientId, instanceId });
      notify("Java " + requiredMajor + " installed, verified and selected for Minecraft " + version + ".");
    } catch (e) {
      notify("Java installation failed: " + (e instanceof Error ? e.message : "Unknown error."));
    } finally { setJavaInstalling(false); }
  }

  async function detectJavaRuntime() {
    if (!window.vampire) return notify("Java detection is available in the desktop app.");
    setJavaChecking(true);
    try {
      const result = await window.vampire.detectJava(javaPath);
      setJavaCheck({ version: result.version, executable: result.executable, platform: result.platform, architecture: result.architecture });
      setJavaPath(result.executable);
      notify("Java detected and selected: " + result.version + ". Save settings to keep this runtime.");
    } catch (e) {
      setJavaCheck(null);
      notify("Java detection failed: " + (e instanceof Error ? e.message : "Java was not found."));
    } finally { setJavaChecking(false); }
  }

  async function loadLauncherLogs() {
    if (!window.vampire) return notify("Log viewer is available in the desktop app.");
    setLogsLoading(true);
    try { setLogText(await window.vampire.readLogs()); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not read launcher logs."); }
    finally { setLogsLoading(false); }
  }
  async function exportLauncherLogs() {
    if (!window.vampire) return notify("Log export is available in the desktop app.");
    try { const result = await window.vampire.exportLogs(); if (!result.canceled) notify("Logs exported."); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not export logs."); }
  }

  async function copyRedactedDiagnostics() {
    if (!logText) return notify("Load launcher logs before copying diagnostics.");
    try {
      await navigator.clipboard.writeText(redactDiagnosticLog(logText));
      notify("Redacted diagnostics copied. Review them before sharing.");
    } catch {
      notify("Clipboard access failed. Export the log and redact it before sharing.");
    }
  }

  async function createNamedInstance() { if (!window.vampire) return; try { const created = await window.vampire.createInstance(newInstanceName); const next = await window.vampire.listInstances(); setInstances(next); setInstanceId(created.id); setNewInstanceName(""); await window.vampire.saveSettings({ ram, javaPath, version, loader, clientId: microsoftClientId, instanceId: created.id }); notify("Created isolated instance: " + created.name); } catch (e) { notify(e instanceof Error ? e.message : "Could not create instance."); } }
  async function deleteNamedInstance() { if (!window.vampire || instanceId === "default") return; const selected = instances.find(item => item.id === instanceId); if (!selected || !window.confirm("Delete instance \"" + selected.name + "\" and all its local game files, mods and packs?")) return; try { await window.vampire.deleteInstance(instanceId); const next = await window.vampire.listInstances(); setInstances(next); const defaults = await window.vampire.getSettings("default"); setInstanceId("default"); setRam(defaults.ram); setJavaPath(defaults.javaPath); await window.vampire.saveSettings({ instanceId: "default" }); notify("Deleted instance and its files."); } catch (e) { notify(e instanceof Error ? e.message : "Could not delete instance."); } }

  async function checkForLauncherUpdates() {
    if (!window.vampire) return notify("Update checks are available in the desktop app.");
    setUpdateChecking(true);
    try {
      const result = await window.vampire.checkForUpdates();
      setUpdateResult(result);
      notify(result.updateAvailable ? "Vampire Client " + result.latestVersion + " is available." : result.reason === "no-release" ? "No public release has been published yet." : "Vampire Client is up to date.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not check for updates.");
    } finally { setUpdateChecking(false); }
  }
  async function downloadLauncherUpdate() {
    if (!window.vampire) return notify("Update downloads are available in the desktop app.");
    setUpdateDownloading(true);
    try {
      const result = await window.vampire.downloadLatestUpdate();
      setDownloadedUpdate({ fileName: result.fileName, version: result.version, sha256: result.sha256 });
      notify("Installer downloaded and SHA-256 verified. Open its folder to run it manually.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not download the update.");
    } finally { setUpdateDownloading(false); }
  }
  async function revealLauncherUpdate() {
    try { await window.vampire?.revealDownloadedUpdate(); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not reveal the downloaded installer."); }
  }
  async function saveLauncherSettings() {
    try { if (!window.vampire) throw new Error("Settings can only be saved in the desktop app."); await window.vampire.saveSettings({ ram, javaPath, version, loader, clientId: microsoftClientId, instanceId }); notify("Settings saved."); } catch (e) { notify(e instanceof Error ? e.message : "Could not save settings."); }
  }
  async function installSelectedVersion() {
    if (!window.vampire) return notify("Version installation is available in the desktop app.");
    setBusy(true); try { await window.vampire.saveSettings({ ram, javaPath, version, loader, instanceId, clientId: microsoftClientId }); await window.vampire.installVersion({ version, loader, instanceId }); setInstalledGame({ installed: true, reason: null }); notify("Minecraft " + version + " installed."); setGameStatus("Minecraft " + version + " installed."); } catch (e) { notify(e instanceof Error ? e.message : "Installation failed."); } finally { setBusy(false); }
  }
  async function playGame() {
    if (!window.vampire) return notify("Game launching is available in the desktop app.");
    setBusy(true);
    try {
      await window.vampire.saveSettings({ ram, javaPath, version, loader, instanceId, clientId: microsoftClientId });
      await window.vampire.launchGame({ username: profile, version, ram, javaPath, instanceId });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not launch Minecraft.");
    } finally {
      setBusy(false);
    }
  }
  async function stopGame() {
    if (!window.vampire) return notify("Game controls are available in the desktop app.");
    try {
      const result = await window.vampire.stopGame();
      notify(result.stopped ? "Stop signal sent to Minecraft." : "No Minecraft process is currently running.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not stop Minecraft.");
    }
  }
  async function installMod(mod: Mod) {
    if (!window.vampire) return notify("Mod installation is available in the desktop app.");
    setBusy(true); try { const result = await window.vampire.installMod({ projectId: mod.project_id, minecraftVersion: version, loader, instanceId }); const files = await window.vampire.listMods({ version, loader, instanceId }); setInstalled(files); const count = Array.isArray(result.installedFiles) ? result.installedFiles.length : 1; notify("Installed " + count + " mod(s), including required dependencies."); } catch (e) { notify(e instanceof Error ? e.message : "Mod installation failed."); } finally { setBusy(false); }
  }
  async function checkModUpdates() {
    if (!window.vampire) return notify("Mod updates are available in the desktop app.");
    setBusy(true);
    try { const updates = await window.vampire.checkModUpdates({ version, loader, instanceId }); setModUpdates(updates); notify(updates.length ? updates.length + " mod update(s) found." : "All tracked mods are up to date."); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not check mod updates."); }
    finally { setBusy(false); }
  }
  async function updateMod(projectId: string) {
    if (!window.vampire) return;
    setBusy(true);
    try { const result = await window.vampire.updateMod({ version, loader, instanceId, projectId }); setInstalled(await window.vampire.listMods({ version, loader, instanceId })); setModUpdates(items => items.filter(item => item.projectId !== projectId)); notify("Updated " + result.fileName); }
    catch (e) { notify(e instanceof Error ? e.message : "Mod update failed."); }
    finally { setBusy(false); }
  }
  async function bulkToggleMods(enabled: boolean) {
    if (!window.vampire) return;
    setBusy(true);
    try { const result = await window.vampire.bulkToggleMods({ version, loader, instanceId, enabled }); setInstalled(await window.vampire.listMods({ version, loader, instanceId })); notify((enabled ? "Enabled " : "Disabled ") + result.changed + " mod(s)."); }
    catch (e) { notify(e instanceof Error ? e.message : "Bulk mod action failed."); }
    finally { setBusy(false); }
  }
  async function exportModpack() {
    if (!window.vampire) return notify("Modpack export is available in the desktop app.");
    try { const result = await window.vampire.exportModpack({ version, loader, instanceId }); if (!result.canceled) notify("Exported " + result.count + " tracked mod(s)."); }
    catch (e) { notify(e instanceof Error ? e.message : "Modpack export failed."); }
  }
  async function importModpack() {
    if (!window.vampire) return notify("Modpack import is available in the desktop app.");
    setBusy(true);
    try { const result = await window.vampire.importModpack({ version, loader, instanceId }); if (!result.canceled) { setInstalled(await window.vampire.listMods({ version, loader, instanceId })); notify("Imported " + result.installed + " project(s); " + result.failed.length + " failed."); if (result.failed.length) console.warn("Modpack import issues:", result.failed); } }
    catch (e) { notify(e instanceof Error ? e.message : "Modpack import failed."); }
    finally { setBusy(false); }
  }

  async function refreshStudioFiles() {
    if (!window.vampire) return;
    try {
      const [schematics, replays] = await Promise.all([
        window.vampire.listStudioFiles({ kind: "schematics", version, loader, instanceId }),
        window.vampire.listStudioFiles({ kind: "replays", version, loader, instanceId })
      ]);
      setSchematicFiles(schematics);
      setReplayFiles(replays);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not refresh Studio files."); }
  }
  async function importStudioFile(kind: "schematics" | "replays") {
    if (!window.vampire) return notify("Studio file management is available in the desktop app.");
    try {
      const result = await window.vampire.importStudioFile({ kind, version, loader, instanceId });
      if (result.fileName) {
        await refreshStudioFiles();
        notify("Imported " + (kind === "replays" ? "replay" : "schematic") + ": " + result.fileName);
      }
    } catch (error) { notify(error instanceof Error ? error.message : "Studio file import failed."); }
  }
  async function removeStudioFile(kind: "schematics" | "replays", fileName: string) {
    if (!window.vampire || !window.confirm("Remove " + fileName + " from this Minecraft instance?")) return;
    try {
      await window.vampire.removeStudioFile({ kind, version, loader, instanceId, fileName });
      await refreshStudioFiles();
      notify("Removed " + fileName);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not remove Studio file."); }
  }
  async function openStudioFolder(kind: "schematics" | "replays") {
    if (!window.vampire) return notify("Opening Studio folders is available in the desktop app.");
    try { await window.vampire.openStudioFolder({ kind, version, loader, instanceId }); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not open Studio folder."); }
  }

  async function refreshResourcePacks() {
    if (!window.vampire) return notify("Resource pack manager is available in the desktop app.");
    setResourcePacksLoading(true);
    try { setResourcePacks(await window.vampire.listResourcePacks({ version, loader, instanceId })); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not refresh resource packs."); }
    finally { setResourcePacksLoading(false); }
  }
  async function inspectResourcePack(fileName: string) {
    if (!window.vampire) return notify("Resource pack inspection is available in the desktop app.");
    setResourcePackInspecting(true);
    setResourcePackInspection(null);
    try { setResourcePackInspection(await window.vampire.inspectResourcePack({ version, loader, instanceId, fileName })); }
    catch (e) { notify(e instanceof Error ? e.message : "Resource pack inspection failed."); }
    finally { setResourcePackInspecting(false); }
  }
  async function importResourcePack() {
    if (!window.vampire) return notify("Resource pack import is available in the desktop app.");
    try { const result = await window.vampire.importResourcePack({ version, loader, instanceId }); if (result.fileName) { await refreshResourcePacks(); notify("Imported resource pack: " + result.fileName); } }
    catch (e) { notify(e instanceof Error ? e.message : "Resource pack import failed."); }
  }
  async function openResourcePackFolder() {
    if (!window.vampire) return notify("Opening the resource pack folder is available in the desktop app.");
    try { await window.vampire.openResourcePackFolder({ version, loader, instanceId }); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not open the resource pack folder."); }
  }
  async function removeResourcePack(fileName: string) {
    if (!window.vampire) return;
    if (!window.confirm("Remove resource pack \"" + fileName + "\" from this Minecraft instance?")) return;
    try { await window.vampire.removeResourcePack({ version, loader, instanceId, fileName }); await refreshResourcePacks(); notify("Removed resource pack: " + fileName); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not remove resource pack."); }
  }
  async function refreshInstalledMods() {
    if (!window.vampire) return notify("Installed mod refresh is available in the desktop app.");
    setModsRefreshing(true);
    try { const files = await window.vampire.listMods({ version, loader, instanceId }); setInstalled(files); notify("Installed mod list refreshed."); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not refresh installed mods."); }
    finally { setModsRefreshing(false); }
  }
  async function removeMod(fileName: string) {
    if (!window.vampire) return;
    if (!window.confirm("Remove " + fileName + " from this Minecraft instance?")) return;
    try { await window.vampire.removeMod({ fileName, version, loader, instanceId }); setInstalled(await window.vampire.listMods({ version, loader, instanceId })); setModUpdates(items => items.filter(item => item.fileName !== fileName)); notify("Removed " + fileName); } catch (e) { notify(e instanceof Error ? e.message : "Could not remove mod."); }
  }
  async function toggleMod(fileName: string) {
    if (!window.vampire) return;
    try { await window.vampire.toggleMod({ fileName, version, loader, instanceId }); setInstalled(await window.vampire.listMods({ version, loader, instanceId })); } catch (e) { notify(e instanceof Error ? e.message : "Could not change mod state."); }
  }
  async function installOptimizationPack(renderer: "sodium" | "vulkanmod") {
    if (!window.vampire) return notify("Optimization packs are available in the desktop app.");
    if (loader !== "fabric") return notify("Select a Fabric instance before installing optimization mods.");
    setBusy(true);
    const pack = [
      { id: "P7dR8mSH", name: "Fabric API" },
      { id: "gvQqBUqZ", name: "Lithium" },
      { id: "uXXizFIs", name: "FerriteCore" },
      { id: "5ZwdcRci", name: "ImmediatelyFast" },
      { id: "NNAgCjsB", name: "EntityCulling" },
      { id: "LQ3K71Q1", name: "Dynamic FPS" },
      { id: "51shyZVL", name: "More Culling" }
    ];
    const installedNames: string[] = [];
    const skipped: string[] = [];
    try {
      const selected = await window.vampire.setPerformanceProfile({ profile: renderer, version, loader, instanceId });
      setRendererProfile(renderer);
      installedNames.push(selected.fileName);
      for (const mod of pack) {
        try {
          const result = await window.vampire.installMod({ projectId: mod.id, minecraftVersion: version, loader, instanceId });
          installedNames.push(result.fileName);
        } catch {
          skipped.push(mod.name + " (no compatible build or download error)");
        }
      }
      setInstalled(await window.vampire.listMods({ version, loader, instanceId }));
      notify("Optimization pack finished. Installed " + installedNames.length + " files; skipped " + skipped.length + ". Restart Minecraft to apply.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not install the optimization pack.");
    } finally {
      setBusy(false);
    }
  }

  async function applyGraphicsPreset(preset: "celeron-low" | "i3-balanced") {
    if (!window.vampire) return notify("Graphics presets are available in the desktop app.");
    setBusy(true);
    try {
      await window.vampire.saveSettings({ ram, javaPath, version, loader, instanceId, clientId: microsoftClientId });
      await window.vampire.applyPerformancePreset({ preset, version, loader, instanceId });
      notify((preset === "celeron-low" ? "Celeron low-end" : "i3 balanced") + " graphics preset saved. Restart Minecraft to apply.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not apply graphics preset.");
    } finally {
      setBusy(false);
    }
  }

  async function switchRenderer(profile: "sodium" | "vulkanmod") {
    if (!window.vampire) return notify("Renderer switching is available in the desktop app.");
    if (loader !== "fabric") return notify("Select a Fabric instance before switching renderers.");
    setBusy(true);
    try {
      await window.vampire.saveSettings({ ram, javaPath, version, loader, instanceId, clientId: microsoftClientId });
      const result = await window.vampire.setPerformanceProfile({ profile, version, loader, instanceId });
      setRendererProfile(profile); setInstalled(await window.vampire.listMods({ version, loader, instanceId }));
      notify("Switched renderer profile to " + result.profile + ". Restart Minecraft to apply.");
    } catch (e) { notify(e instanceof Error ? e.message : "Renderer switch failed."); }
    finally { setBusy(false); }
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  const visibleMods = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mods.filter(mod => !needle || mod.title.toLowerCase().includes(needle) || mod.description.toLowerCase().includes(needle));
  }, [mods, query]);
  const sortedMods = useMemo(() => [...visibleMods].sort((left, right) =>
    catalogSort === "name" ? left.title.localeCompare(right.title) : right.downloads - left.downloads
  ), [visibleMods, catalogSort]);
  const visibleInstalled = useMemo(() => installed.filter(file => file.fileName.toLowerCase().includes(installedFilter.trim().toLowerCase()) && (installedStatusFilter === "all" || (installedStatusFilter === "enabled" ? file.enabled : !file.enabled))), [installed, installedFilter, installedStatusFilter]);
  const enabledModCount = useMemo(() => installed.filter(file => file.enabled).length, [installed]);
  const disabledModCount = installed.length - enabledModCount;
  const compatibilityWarnings = useMemo(() => scanModConflicts(installed, loader), [installed, loader]);
  const logIssues = useMemo(() => extractLogIssues(logText), [logText]);
  const logIssueContext = useMemo(() => extractLogIssueContext(logText), [logText]);
  const logIssueSummary = useMemo(() => summarizeLogIssues(logText), [logText]);
  const logFindings = useMemo(() => analyzeLauncherLog(logText), [logText]);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [contextOnly, setContextOnly] = useState(false);
  const visibleVersions = useMemo(() => versions.filter(item => versionTypeFilter === "all" || item.type === versionTypeFilter), [versions, versionTypeFilter]);
  const latestRelease = useMemo(() => versions.find(item => item.type === "release")?.id || "", [versions]);

  const popular = useMemo(() => [
    { name: "Sodium", desc: "Rendering optimization", tag: "Performance" },
    { name: "Lithium", desc: "Server and game logic optimization", tag: "Performance" },
    { name: "FerriteCore", desc: "Lower memory usage", tag: "Memory" }
  ], []);

  if (booting) return <div className="splash-screen"><div className="splash-emblem">V</div><div className="splash-title">VAMPIRE <span>STUDIOS</span></div><div className="splash-loader"><i/></div><small>INITIALIZING VAMPIRE CLIENT</small></div>;

  return <div className="app-shell">
    <aside className="sidebar glass">
      <div className="brand"><div className="brand-mark">V</div><div><b>VAMPIRE</b><small>STUDIOS</small></div></div>
      <div className="side-label">LAUNCHER</div>
      <nav>{nav.map(item => <button key={item.name} className={"nav-item " + (tab === item.name ? "active" : "")} onClick={() => setTab(item.name)}><item.icon size={18}/>{item.name}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="profile-mini"><div className="avatar">{profile.slice(0,1).toUpperCase()}</div><div><b>{profile}</b><small>{accountType} account</small></div><ChevronDown size={15}/></div>
        <div className="build-label">VAMPIRE CLIENT <span>v0.3.0</span></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb">Vampire Client <span>/</span> {tab}</div><div className="top-actions"><span className="status-dot"/> {gameStatus} <button className="icon-button" onClick={() => setTab("Settings")}><Settings2 size={17}/></button></div></header>
      <div className="content">
        {tab === "Home" && <>
          <section className="hero glass"><div className="hero-copy"><div className="eyebrow"><Sparkles size={14}/> YOUR GAME. YOUR RULES.</div><h1>Enter the <em>night.</em></h1><p>A cleaner Minecraft experience, built around performance, mods and control.</p><div className="hero-buttons">{installedGame?.installed ? <button className="primary-button" disabled={busy} onClick={() => void playGame()}><Play size={16} fill="currentColor"/> Play Minecraft</button> : <button className="primary-button" disabled={busy || installedGame === null} onClick={() => { setTab("Versions"); void installSelectedVersion(); }}><Download size={16}/> {installedGame === null ? "Checking installation..." : installedGame.reason === "files-missing" ? "Repair installation" : "Install Minecraft"}</button>}<button className="secondary-button" onClick={() => void stopGame()}><X size={15}/> Stop game</button><button className="secondary-button" onClick={() => setTab("Versions")}>Manage versions <ChevronDown size={15}/></button></div></div><div className="hero-orb"><div className="orb-ring"/><div className="orb-core">V</div><div className="orb-caption">VAMPIRE<br/>STUDIOS</div></div></section>
          <div className="section-heading"><div><div className="eyebrow">OVERVIEW</div><h2>Command center</h2></div><span className="muted">{gameStatus}</span></div>
          <div className="stat-grid"><Stat icon={<Gauge/>} label="Performance profile" value="Balanced" sub="Profile selection planned"/><Stat icon={<HardDrive/>} label="Memory allocation" value={ram + " GB"} sub="Adjust in settings"/><Stat icon={<Layers3/>} label="Selected version" value={version} sub="Selected game version"/><Stat icon={<Activity/>} label="Game status" value={gameStatus.length > 22 ? "Ready" : gameStatus} sub="Local game process status"/></div>
          <div className="two-grid"><section className="panel glass"><div className="panel-title"><div><h3>Quick actions</h3><p>Jump into your setup</p></div><Zap size={18}/></div><div className="quick-grid"><Quick icon={<Package/>} title="Browse mods" text="Discover on Modrinth" onClick={() => setTab("Mods")}/><Quick icon={<Layers3/>} title="Game versions" text="Choose a Minecraft version" onClick={() => setTab("Versions")}/><Quick icon={<CircleUserRound/>} title="Accounts" text="Manage local profiles" onClick={() => setTab("Accounts")}/><Quick icon={<Settings2/>} title="Preferences" text="Memory and appearance" onClick={() => setTab("Settings")}/></div></section>
          <section className="panel glass"><div className="panel-title"><div><h3>Recommended mods</h3><p>Popular performance additions</p></div><button className="text-button" onClick={() => setTab("Mods")}>Explore all <ExternalLink size={13}/></button></div>{popular.map(m => <div className="recommend" key={m.name}><div className="mod-symbol"><Blocks size={17}/></div><div><b>{m.name}</b><small>{m.desc}</small></div><span>{m.tag}</span></div>)}</section></div>
        </>}
        {tab === "Versions" && <><PageTitle eyebrow="GAME LIBRARY" title="Versions" desc="Browse the full official Minecraft version manifest, including current releases, snapshots and legacy versions."/><section className="panel glass"><div className="panel-title"><div><h3>Minecraft instances</h3><p>Separate game folders, mods, resource packs, shaders and options per instance.</p></div><Layers3 size={18}/></div><div className="field-row"><label>Active instance</label><select value={instanceId} onChange={async e=>{const id=e.target.value;if(window.vampire){try{const scoped=await window.vampire.getSettings(id);setInstanceId(id);setRam(scoped.ram);setJavaPath(scoped.javaPath);await window.vampire.saveSettings({instanceId:id});notify("Switched to "+(instances.find(x=>x.id===id)?.name||"instance")+" · "+scoped.ram+" GB RAM");}catch(error){notify(error instanceof Error?error.message:"Could not switch instance.");}}else{setInstanceId(id);}}}>{instances.map(item=><option key={item.id} value={item.id}>{item.name}{item.id==="default"?" · legacy":""}</option>)}</select></div><div className="field-row"><label>New instance name</label><input value={newInstanceName} onChange={e=>setNewInstanceName(e.target.value)} placeholder="e.g. Survival 1.21.10" maxLength={32}/></div><div className="hero-buttons"><button className="primary-button compact" disabled={busy||newInstanceName.trim().length<2} onClick={()=>void createNamedInstance()}>Create instance</button><button className="secondary-button tiny" disabled={instanceId==="default"||busy} onClick={()=>void deleteNamedInstance()}>Delete active instance</button></div><p className="muted">The Default instance keeps your existing version-based installs. New instances use independent storage. Deleting a named instance permanently removes its local files.</p></section><section className="panel glass"><div className="field-row"><label>Version channel</label><select value={versionTypeFilter} onChange={e => { const next = e.target.value; setVersionTypeFilter(next); const candidates = versions.filter(item => next === "all" || item.type === next); if (candidates.length && !candidates.some(item => item.id === version)) setVersion(candidates[0].id); }}><option value="release">Stable releases</option><option value="snapshot">Snapshots</option><option value="old_beta">Old beta</option><option value="old_alpha">Old alpha</option><option value="all">All versions</option></select></div><div className="field-row"><label>Selected Minecraft version</label><select value={version} onChange={e => setVersion(e.target.value)}>{(visibleVersions.length ? visibleVersions : versions).map(v => <option key={v.id} value={v.id}>{v.id} · {v.type}</option>)}</select></div><div className="field-row"><label>Mod loader</label><select value={loader} onChange={e => setLoader(e.target.value)}><option value="vanilla">Vanilla</option><option value="fabric">Fabric</option><option value="quilt">Quilt</option><option value="forge">Forge</option><option value="neoforge">NeoForge</option></select></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={!latestRelease} onClick={() => { setVersionTypeFilter("release"); setVersion(latestRelease); notify("Selected latest official release: " + latestRelease); }}>Use latest release{latestRelease ? " (" + latestRelease + ")" : ""}</button><button className="secondary-button tiny" onClick={() => setVersionTypeFilter("all")}>Show every version</button></div><div className="info-banner"><ShieldCheck size={18}/><span>Vanilla installation uses official Minecraft version metadata. Legacy alpha/beta versions may have older Java and asset requirements. Fabric, Quilt, Forge and NeoForge use compatible loader builds for the selected Minecraft version. NeoForge requires Minecraft 1.20.2 or newer. Java must be installed and configured in Settings.</span></div><button className="primary-button" disabled={busy || !versions.some(v => v.id === version)} onClick={() => void installSelectedVersion()}><Download size={15}/>{busy ? "Working..." : "Install selected version"}</button></section></>}
        {tab === "Mods" && <><PageTitle eyebrow="MOD LIBRARY" title="Discover mods" desc="Search the Modrinth catalog and explore compatible projects."/><section className="panel glass"><div className="field-row"><label>Mod loader compatibility</label><select value={loader} onChange={e => setLoader(e.target.value)}><option value="fabric">Fabric</option><option value="quilt">Quilt</option><option value="forge">Forge</option><option value="neoforge">NeoForge</option><option value="vanilla">Vanilla (no mods)</option></select></div><div className="search-row"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && void searchMods()} placeholder="Search Sodium, Iris, Lithium..."/><button className="primary-button compact" onClick={() => void searchMods()} disabled={loading}>{loading ? "Searching..." : "Search"}</button></div><div className="field-row"><label>Sort catalogue</label><select value={catalogSort} onChange={e => setCatalogSort(e.target.value as "downloads" | "name")}><option value="downloads">Most downloaded</option><option value="name">Name A–Z</option></select></div>{error && <div className="error-text">{error}</div>}<div className="muted">{sortedMods.length} matching projects</div><div className="mod-grid">{sortedMods.map(mod => <article className="mod-card" key={mod.project_id}><div className="mod-card-head">{mod.icon_url ? <img src={mod.icon_url} alt=""/> : <div className="mod-symbol"><Blocks/></div>}<div><b>{mod.title}</b><small>{mod.downloads.toLocaleString()} downloads</small></div></div><p>{mod.description}</p><div className="mod-card-foot"><a href={"https://modrinth.com/mod/" + mod.slug} target="_blank" rel="noreferrer">View on Modrinth <ExternalLink size={12}/></a><button className="secondary-button tiny" disabled={busy || loader === "vanilla"} onClick={() => void installMod(mod)}><Download size={12}/> Install</button></div></article>)}</div>{loader === "vanilla" && <p className="muted">Select Fabric, Quilt, Forge or NeoForge to install mods. Vanilla profiles do not load mod-loader mods.</p>}<div className="divider-line"/><div className="divider-line"/><div className="panel-title"><div><h3>Mod compatibility scan</h3><p>Common renderer and optimization conflicts detected from enabled filenames.</p></div><ShieldCheck size={18}/></div>{compatibilityWarnings.length ? <div className="error-text">{compatibilityWarnings.map((warning, index) => <p key={index}>⚠ {warning}</p>)}</div> : <div className="info-banner"><ShieldCheck size={17}/><span>No known filename-based conflicts detected. This heuristic cannot verify every mod dependency or runtime compatibility.</span></div>}<div className="panel-title"><div><h3>Installed mod files ({installed.length})</h3><p>{enabledModCount} enabled · {disabledModCount} disabled · {visibleInstalled.length} shown</p></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={modsRefreshing} onClick={() => void refreshInstalledMods()}>{modsRefreshing ? "Refreshing..." : "Refresh"}</button><button className="secondary-button tiny" disabled={busy || loader === "vanilla"} onClick={() => void checkModUpdates()}>Check updates</button><button className="secondary-button tiny" disabled={busy || !installed.length} onClick={() => void bulkToggleMods(true)}>Enable all</button><button className="secondary-button tiny" disabled={busy || !installed.length} onClick={() => void bulkToggleMods(false)}>Disable all</button></div></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={busy || loader === "vanilla"} onClick={() => void exportModpack()}>Export modpack</button><button className="secondary-button tiny" disabled={busy || loader === "vanilla"} onClick={() => void importModpack()}>Import modpack</button></div><div className="field-row"><label>Filter installed mods</label><input value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} placeholder="Filter installed .jar files..."/></div><div className="field-row"><label>Mod state</label><select value={installedStatusFilter} onChange={e=>setInstalledStatusFilter(e.target.value as "all" | "enabled" | "disabled")}><option value="all">All mods</option><option value="enabled">Enabled only</option><option value="disabled">Disabled only</option></select></div>{modUpdates.map(item => <div className="setting-row" key={item.projectId}><div><b>{item.fileName}</b><small>Update available · {item.latestVersionName}</small></div><button className="primary-button compact" disabled={busy} onClick={() => void updateMod(item.projectId)}>Update</button></div>)}{visibleInstalled.length ? visibleInstalled.map(file => <div className="setting-row" key={file.fileName}><div><b>{file.fileName}</b><small>{file.enabled ? "Enabled" : "Disabled"} · {version}</small></div><div className="hero-buttons"><button className="secondary-button tiny" onClick={() => void toggleMod(file.fileName)}>{file.enabled ? "Disable" : "Enable"}</button><button className="secondary-button tiny" onClick={() => void removeMod(file.fileName)}>Remove</button></div></div>) : <p className="muted">No installed mods match this filter.</p>}<div className="info-banner"><Blocks size={17}/><span>Mods are downloaded to the Minecraft mods folder. Install a Fabric, Quilt, Forge or NeoForge profile first; Vanilla profiles do not load mod-loader mods.</span></div></section></>}
        {tab === "Shaders" && <><PageTitle eyebrow="VAMPIRE LIBRARY" title="Shader packs" desc="Browse community shader packs, check compatibility and manage this instance’s shader ZIPs."/><ShaderLibrary installed={shaderPacks} installedMods={installed} loader={loader} version={version} onImport={()=>void importShaderPack()} onRemove={name=>void removeShaderPack(name)} onDownload={slug=>void downloadShaderPack(slug)}/></>}
        {tab === "Texture Editor" && <><PageTitle eyebrow="VAMPIRE STUDIO" title="Texture Pack Editor" desc="Create a custom texture, import PNG artwork and export a Minecraft resource-pack ZIP."/><TexturePackEditor/></>}
        {tab === "Studio" && <><PageTitle eyebrow="VAMPIRE CLIENT STUDIO" title="Make it yours." desc="Cosmetics, HUD, shader packs, mod profiles and local-world tools — one place to customize your Minecraft experience."/><SkinCapeStudio/>
          <section className="studio-hero glass"><div><div className="eyebrow">COSMETIC LAB · LIVE PREVIEW</div><h2>Your identity. Your style.</h2><p>Preview your Vampire identity. Cosmetic sync and in-game rendering are being built as the next companion-mod milestone.</p><div className="studio-tags"><span>CLIENT COSMETICS</span><span>HD CAPE READY DESIGN</span><span>GRADIENT IDENTITY</span></div></div><div className={"cape-preview cape-"+capeStyle}><div className="cape-emblem">V</div><small>VAMPIRE</small></div></section>
          <div className="studio-grid">
            <section className="panel glass"><div className="panel-title"><div><h3>HD cape designer</h3><p>Choose a branded cape preview</p></div><Sparkles size={18}/></div><div className="cape-options">{[{id:"crimson",label:"Crimson"},{id:"void",label:"Void"},{id:"royal",label:"Royal"}].map(c=><button key={c.id} className={"cape-choice "+(capeStyle===c.id?"selected":"")} onClick={()=>setCapeStyle(c.id)}><span className={"cape-swatch cape-"+c.id}/>{c.label}</button>)}</div><div className="info-banner"><ShieldCheck size={17}/><span>Selected visibility: Vampire account sync across devices. Cape upload, cloud storage, signed delivery and in-game rendering still require the cosmetics service and companion-mod integration. No Mojang cape APIs are bypassed.</span></div><div className="field-row"><label>Cape visibility</label><select value={capeVisibility} onChange={e=>setCapeVisibility(e.target.value as "account" | "client-only")}><option value="account">Vampire account sync (all signed-in devices)</option><option value="client-only">Vampire Client users only (local preview)</option></select></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Name & chat identity</h3><p>Gradient name styling and Vampire nametag mark</p></div><Sparkles size={18}/></div><div className={"name-preview name-"+nameStyle}>{profile || "Player"} <span>{nametagLogo?"◆":" "}</span></div><div className="field-row"><label>Gradient preset</label><select value={nameStyle} onChange={e=>setNameStyle(e.target.value)}><option value="inferno">Inferno red</option><option value="bloodmoon">Blood moon</option><option value="frost">Frost violet</option><option value="gold">Royal gold</option></select></div><div className="setting-row"><div><b>Chat name gradient</b><small>Visible only to compatible Vampire Client users.</small></div><button className={chatGradient?"toggle-on":"toggle-off"} onClick={()=>setChatGradient(v=>!v)}>{chatGradient?"ON":"OFF"}</button></div><div className="setting-row"><div><b>Nametag Vampire mark</b><small>Small brand mark before your name.</small></div><button className={nametagLogo?"toggle-on":"toggle-off"} onClick={()=>setNametagLogo(v=>!v)}>{nametagLogo?"ON":"OFF"}</button></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>HUD & overlays</h3><p>Client-side layout controls</p></div><Monitor size={18}/></div><div className="setting-row"><div><b>Custom HUD editor</b><small>Position, scale, opacity and widgets.</small></div><button className={customHud?"toggle-on":"toggle-off"} onClick={()=>setCustomHud(v=>!v)}>{customHud?"ON":"OFF"}</button></div><div className="hud-mini"><span>VAMPIRE · 144 FPS</span><span>XYZ 120 / 64 / -32</span><span>MEM 2.1 GB</span></div><p className="muted">Toggle is saved locally; drag-and-drop HUD editor and in-game persistence are planned for the companion mod.</p></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Shader & resource packs</h3><p>Shader loader and pack management</p></div><Layers3 size={18}/></div><div className="setting-row"><div><b>Shader support</b><small>Iris shader loader for Fabric; compatible GPU required.</small></div><button className={shaderSupport?"toggle-on":"toggle-off"} onClick={()=>setShaderSupport(v=>!v)}>{shaderSupport?"ON":"OFF"}</button></div><button className="secondary-button" onClick={()=>{setTab("Mods");setQuery("Iris shaders");void searchMods();}}>Find Iris shader loader <ExternalLink size={13}/></button><div className="hero-buttons"><button className="primary-button compact" onClick={() => void importShaderPack()}>Import shader ZIP</button><button className="secondary-button" onClick={() => { setTab("Mods"); setQuery("Iris"); void searchMods(); }}>Find Iris loader</button></div>{shaderPacks.length ? shaderPacks.map(file => <div className="setting-row" key={file}><div><b>{file}</b><small>Stored in this Minecraft instance shaderpacks folder</small></div><button className="secondary-button tiny" onClick={() => void removeShaderPack(file)}>Remove</button></div>) : <p className="muted">No shader ZIPs imported for this instance yet.</p>}<div className="info-banner"><Zap size={17}/><span>ZIP files are copied to the selected instance. To use them in-game, install a compatible shader loader such as Iris and select the pack in Video Settings → Shader Packs. Import does not execute ZIP contents.</span></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Resource pack manager</h3><p>Import and manage local Minecraft resource pack ZIPs</p></div><Layers3 size={18}/></div><div className="hero-buttons"><button className="primary-button compact" onClick={() => void importResourcePack()}>Import resource pack ZIP</button><button className="secondary-button tiny" disabled={resourcePacksLoading} onClick={() => void refreshResourcePacks()}>{resourcePacksLoading ? "Refreshing..." : "Refresh list"}</button><button className="secondary-button tiny" onClick={() => void openResourcePackFolder()}>Open folder</button></div><div className="field-row"><label>Filter installed packs ({resourcePacks.length})</label><input value={resourcePackFilter} onChange={e=>setResourcePackFilter(e.target.value)} placeholder="Search resource pack ZIPs..."/></div>{resourcePacks.filter(file=>file.toLowerCase().includes(resourcePackFilter.trim().toLowerCase())).length ? resourcePacks.filter(file=>file.toLowerCase().includes(resourcePackFilter.trim().toLowerCase())).map(file => <div className="setting-row" key={file}><div><b>{file}</b><small>Stored in this Minecraft instance resourcepacks folder</small></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={resourcePackInspecting} onClick={() => void inspectResourcePack(file)}>Inspect</button><button className="secondary-button tiny" onClick={() => void removeResourcePack(file)}>Remove</button></div></div>) : <p className="muted">{resourcePacks.length ? "No resource packs match this filter." : "No resource packs imported for this instance."}</p>}{resourcePackInspection && <div className="info-banner"><Package size={17}/><span><b>{resourcePackInspection.fileName}</b> · Pack format {resourcePackInspection.packFormat} · {resourcePackInspection.fileCount.toLocaleString()} files · {resourcePackInspection.textureCount.toLocaleString()} texture files · {(resourcePackInspection.fileSizeBytes / 1024 / 1024).toFixed(2)} MB ZIP · {(resourcePackInspection.totalUncompressedBytes / 1024 / 1024).toFixed(2)} MB expanded · {resourcePackInspection.hasPackIcon ? "pack.png found" : "no pack.png"}.{resourcePackInspection.description ? " Description: " + resourcePackInspection.description : ""}</span><button className="secondary-button tiny" onClick={() => setResourcePackInspection(null)}>Close</button></div>}<div className="info-banner"><ShieldCheck size={17}/><span>ZIP files are copied, not extracted or executed. Enable imported packs in Minecraft Options → Resource Packs after restarting or refreshing the game.</span></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Mod & feature library</h3><p>Discover compatible community mods plus Vampire tools</p></div><Blocks size={18}/></div><div className="feature-pills">{["Performance","Minimap","Zoom","Replay","Voice chat","Emotes","World map","Inventory","Animations","Schematic","Dynamic lights","AppleSkin","Entity culling","HUD","Screenshot","Cosmetics"].map(x=><span key={x}>{x}</span>)}</div><button className="primary-button" onClick={()=>{setTab("Mods");setQuery("");void searchMods();}}>Browse Modrinth catalogue <ExternalLink size={13}/></button><p className="muted">100+ compatible mods will be discoverable from Modrinth; we will not bundle third-party mods without their authors' permission. Each mod will have one-click install, enable, disable and remove.</p></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Replay recordings</h3><p>Import and manage Replay Mod .mcpr files for this instance</p></div><Activity size={18}/></div><div className="hero-buttons"><button className="primary-button compact" onClick={()=>void importStudioFile("replays")}>Import replay file</button><button className="secondary-button tiny" onClick={()=>void openStudioFolder("replays")}>Open replay folder</button><button className="secondary-button tiny" onClick={()=>void refreshStudioFiles()}>Refresh</button></div>{replayFiles.length?replayFiles.map(file=><div className="setting-row" key={file.fileName}><div><b>{file.fileName}</b><small>{(file.bytes/1024/1024).toFixed(1)} MB · {new Date(file.modifiedAt).toLocaleString()}</small></div><button className="secondary-button tiny" onClick={()=>void removeStudioFile("replays",file.fileName)}>Remove</button></div>):<p className="muted">No replay recordings in this instance yet. Recording and playback require a compatible Replay Mod build.</p>}<div className="divider-line"/><div className="panel-title"><div><h3>Schematic library</h3><p>Manage Litematica, Sponge and NBT schematic files</p></div><Layers3 size={18}/></div><div className="hero-buttons"><button className="primary-button compact" onClick={()=>void importStudioFile("schematics")}>Import schematic</button><button className="secondary-button tiny" onClick={()=>void openStudioFolder("schematics")}>Open schematic folder</button></div>{schematicFiles.length?schematicFiles.map(file=><div className="setting-row" key={file.fileName}><div><b>{file.fileName}</b><small>{(file.bytes/1024).toFixed(0)} KB · {new Date(file.modifiedAt).toLocaleString()}</small></div><button className="secondary-button tiny" onClick={()=>void removeStudioFile("schematics",file.fileName)}>Remove</button></div>):<p className="muted">No schematic files imported for this instance. Placement and preview require Litematica, WorldEdit or another compatible mod.</p>}<div className="info-banner"><ShieldCheck size={17}/><span>Files are copied into isolated per-instance folders and never extracted or executed. Replay recording/playback and schematic placement still depend on compatible Minecraft mods.</span></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Vampire World Hosting</h3><p>Run a vanilla Minecraft server locally on this PC</p></div><Gamepad2 size={18}/></div><div className="setting-row"><div><b>World hosting tools</b><small>Manage isolated server folders and server processes.</small></div><button className={worldHosting?"toggle-on":"toggle-off"} onClick={()=>setWorldHosting(v=>!v)}>{worldHosting?"ON":"OFF"}</button></div><div className="field-row"><label>Network access preference (guidance only)</label><select value={hostingMode} onChange={e=>setHostingMode(e.target.value as "both" | "lan" | "internet")}><option value="both">Both LAN and Internet</option><option value="lan">LAN only</option><option value="internet">Internet only</option></select></div><div className="field-row"><label>Server name</label><input value={newWorldServerName} maxLength={32} onChange={e=>setNewWorldServerName(e.target.value)} placeholder="My Minecraft World"/></div><div className="field-row"><label>Server RAM (safe limit: {worldServerRamLimit} GB)</label><input type="number" min={1} max={Math.max(1,worldServerRamLimit)} step={1} value={worldServerRam} disabled={worldServerRamLimit<1} onChange={e=>setWorldServerRam(Math.max(1,Math.min(Math.max(1,worldServerRamLimit),Number(e.target.value)||1)))}/></div><div className="field-row"><label>New server port (1024–65535)</label><input type="number" min={1024} max={65535} step={1} value={newWorldServerPort} onChange={e=>setNewWorldServerPort(Math.max(1024,Math.min(65535,Number(e.target.value)||1024)))}/></div><p className="muted">New server will use Minecraft {version} (the currently selected version). Vampire Client downloads the official Mojang server JAR and verifies its SHA-1 checksum.</p><button className="primary-button" disabled={busy || !worldHosting || worldServerRamLimit<1 || worldServerRam>worldServerRamLimit} onClick={()=>void createWorldServer()}><Download size={15}/> Create &amp; download server</button><div className="divider-line"/><div className="setting-row"><div><b>Minecraft EULA acceptance</b><small>Required before any server can start. Read the Minecraft EULA and accept it yourself.</small></div><input type="checkbox" checked={worldServerEulaAccepted} onChange={e=>setWorldServerEulaAccepted(e.target.checked)}/></div>{worldServers.length===0?<p className="muted">No local world servers created yet.</p>:worldServers.map(server=><div className="recommend" key={server.id}><div className="mod-symbol"><Gamepad2 size={17}/></div><div><b>{server.name}</b><small>Minecraft {server.version} · {server.ramGB} GB · Port {server.port} · {server.running?"Running":"Stopped"}</small><label className="muted"><input type="checkbox" checked={!!server.autoRestart} onChange={e=>void setWorldServerAutoRestart(server.id,e.target.checked)}/> Auto-restart after unexpected crash (max 3 / 10 min)</label></div><div className="hero-buttons">{server.running?<button className="secondary-button" onClick={()=>void stopWorldServer(server.id)}>Stop</button>:<button className="primary-button" disabled={busy || !worldServerEulaAccepted} onClick={()=>void startWorldServer(server.id)}>Accept EULA &amp; Start</button>}<button className="secondary-button" onClick={()=>void deleteWorldServer(server.id)}>Delete</button></div></div>)}{worldServers.length>0&&<><div className="field-row"><label>Console server</label><select value={activeWorldServerId} onChange={e=>void selectWorldServer(e.target.value)}><option value="">Select a server</option>{worldServers.map(server=><option key={server.id} value={server.id}>{server.name}</option>)}</select></div>{activeWorldServerId&&<><div className="panel-title"><div><h3>Live server console</h3><p>Output is also saved in this server's local server.log file.</p></div><Terminal size={17}/></div><div className="info-banner"><ShieldCheck size={17}/><span>LAN connection: {worldServerAddresses.length?worldServerAddresses.map(address=>address+":"+worldServerPort).join(" · "):"No active LAN IPv4 address detected"} . Players must be on the same local network. Internet access requires manual port forwarding or a trusted tunnel.</span></div><div className="field-row"><label>Server port (1024–65535)</label><div className="hero-buttons"><input type="number" min={1024} max={65535} step={1} value={worldServerPort} onChange={e=>setWorldServerPort(Math.max(1024,Math.min(65535,Number(e.target.value)||1024)))}/><button className="secondary-button tiny" disabled={busy || !!worldServers.find(server=>server.id===activeWorldServerId)?.running} onClick={()=>void saveWorldServerPort()}>Save port</button></div></div><div className="info-banner"><ShieldCheck size={17}/><span>{worldServerExitStatus || "Select a server to view its runtime status."}</span></div>{worldServerDiagnostics.map((finding,i)=><div className="info-banner" key={finding.title+i}><ShieldCheck size={17}/><span><b>{finding.title}</b> · {finding.detail}</span></div>)}<pre className="server-console">{worldServerLogs||"Waiting for server output…"}</pre><div className="server-command"><input value={worldServerCommand} maxLength={256} onChange={e=>setWorldServerCommand(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void sendWorldServerCommand();}} placeholder="Enter server command (e.g. list, say hello)"/><button className="primary-button" disabled={!worldServerCommand.trim()} onClick={()=>void sendWorldServerCommand()}>Send</button></div><div className="panel-title"><div><h3>World backups</h3><p>Create a stopped-server snapshot and restore it later. Up to 10 backups per server.</p></div><HardDrive size={17}/></div><button className="secondary-button tiny" disabled={busy || !!worldServers.find(server=>server.id===activeWorldServerId)?.running} onClick={()=>void createWorldServerBackup()}>Create backup</button>{worldServerBackups.length ? worldServerBackups.map(backup=><div className="setting-row" key={backup.id}><div><b>{new Date(backup.createdAt).toLocaleString()}</b><small>Minecraft {backup.version} · {(backup.bytes/1024/1024).toFixed(1)} MB</small></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={busy || !!worldServers.find(server=>server.id===activeWorldServerId)?.running} onClick={()=>void restoreWorldServerBackup(backup.id)}>Restore</button><button className="secondary-button tiny" disabled={busy} onClick={()=>void deleteWorldServerBackup(backup.id)}>Delete</button></div></div>) : <p className="muted">No backups created for this server yet.</p>}</>}</>}<div className="info-banner"><ShieldCheck size={17}/><span>Selected network preference: {hostingMode==="both"?"LAN + Internet":hostingMode==="lan"?"LAN only":"Internet only"} (not enforced by the server process). The server binds using Minecraft defaults; configure your firewall/router manually to restrict access. Internet access requires manual port forwarding or a trusted tunnel. Vampire Client never changes firewall, router, UPnP or public network settings.</span></div></section>
          </div><section className="panel glass"><div className="panel-title"><div><h3>Save your studio setup</h3><p>Preferences are stored on this device.</p></div><span className="pill">LOCAL PROFILE</span></div><button className="primary-button" onClick={()=>notify("Studio preferences saved on this device.")}>Save Studio preferences</button></section>
        </>}
        {tab === "Accounts" && <><PageTitle eyebrow="IDENTITY" title="Accounts" desc="Sign in with Microsoft for owned Minecraft Java Edition, or use a local offline profile on offline-mode servers."/><section className="panel glass"><div className="field-row"><label>Offline profile name</label><input value={profile} maxLength={16} onChange={e => setProfile(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}/></div><div className="info-banner"><CircleUserRound size={18}/><span>Offline profiles do not authenticate ownership and only work on servers that explicitly allow offline-mode connections.</span></div><button className="primary-button" onClick={() => void saveOfflineProfile()}>Save profile</button><div className="divider-line"/><h3>Microsoft account</h3><p className="muted">Use your own Microsoft public-client app registration. Vampire Client checks Minecraft Java entitlement before allowing official account launch.</p><div className="field-row"><label>Microsoft App Client ID</label><input value={microsoftClientId} onChange={e => setMicrosoftClientId(e.target.value)} placeholder="Paste your Azure app Client ID"/></div><div className="hero-buttons"><button className="primary-button" disabled={busy} onClick={() => void signInMicrosoft()}>Sign in with Microsoft</button>{accountType === "Microsoft" && <button className="secondary-button" onClick={() => void signOutMicrosoft()}>Sign out</button>}</div>{microsoftAccounts.length > 0 && <><div className="divider-line"/><h3>Saved Microsoft accounts</h3><p className="muted">Switch between accounts already signed in on this device. Each account keeps its own Microsoft authorization in encrypted system storage.</p><div className="account-list">{microsoftAccounts.map(item => <div className="setting-row" key={item.id}><div><b>{item.name}</b><small>{item.username}</small></div><button className="secondary-button tiny" disabled={busy} onClick={() => void switchMicrosoftAccount(item.id)}>Switch</button></div>)}</div></>}<p className="muted">Setup guide: docs/MICROSOFT_LOGIN_SETUP.md</p><div className="divider-line"/><h3>Vampire Nodes billing</h3><p className="muted">Manage your Vampire Nodes account, products, orders and payments through the official billing panel. Checkout and payment verification stay on the billing service.</p><button className="secondary-button" onClick={() => void window.vampire?.openBillingPortal().catch(e => notify(e instanceof Error ? e.message : "Could not open billing portal."))}>Open billing portal</button></section></>}
        {tab === "Settings" && <><PageTitle eyebrow="PREFERENCES" title="Settings" desc="RAM and Java executable are saved independently for each Minecraft instance."/><section className="panel glass"><div className="panel-title"><div><h3>Vampire Client updates</h3><p>Check the official GitHub releases page for verified desktop builds.</p></div><Download size={18}/></div><button className="secondary-button tiny" disabled={updateChecking} onClick={() => void checkForLauncherUpdates()}>{updateChecking ? "Checking releases..." : "Check for updates"}</button>{updateResult && <div className="info-banner"><ShieldCheck size={17}/><span>{updateResult.updateAvailable ? "Update available: " + updateResult.latestVersion + " (installed " + updateResult.currentVersion + ")." : updateResult.reason === "no-release" ? "No public release has been published yet." : updateResult.reason === "prerelease" ? "No stable public release is available." : updateResult.reason === "invalid-release" ? "The release metadata could not be validated." : "Installed version " + updateResult.currentVersion + " is up to date."} {updateResult.releaseName ? updateResult.releaseName + " · " : ""}<a href={updateResult.releaseUrl} target="_blank" rel="noreferrer">Open official release page</a></span></div>}{updateResult?.updateAvailable && <div className="hero-buttons"><button className="primary-button compact" disabled={updateDownloading || !updateResult.canDownload} onClick={() => void downloadLauncherUpdate()}>{updateDownloading ? "Downloading and verifying..." : "Download verified installer"}</button></div>}{downloadedUpdate && <div className="info-banner"><ShieldCheck size={17}/><span>Downloaded {downloadedUpdate.fileName} for version {downloadedUpdate.version}; SHA-256 verified.</span><button className="secondary-button tiny" onClick={() => void revealLauncherUpdate()}>Show in folder</button></div>}{updateResult?.assets?.length ? <div className="field-row"><label>Release downloads</label>{updateResult.assets.map(asset=><div className="setting-row" key={asset.name}><b>{asset.name}</b><a href={asset.downloadUrl} target="_blank" rel="noreferrer">Download</a></div>)}</div> : null}</section><section className="panel glass"><div className="setting-row"><div><b>Memory allocation · {instances.find(item => item.id === instanceId)?.name || "Default"}</b><small>{systemMemory ? `Detected ${systemMemory.totalGB} GB system RAM · ${systemMemory.freeGB} GB currently free. Leave memory for Windows and background apps.` : "Recommended starting point for a 4 GB system: 1.5–2 GB."}</small></div><div className="range-value">{ram} GB</div></div><input className="range" type="range" min="1" max="16" step=".5" value={ram} onChange={e => setRam(Number(e.target.value))}/>{systemMemory && ram > Math.max(1, systemMemory.totalGB - 1.5) && <div className="info-banner"><ShieldCheck size={17}/><span>This allocation may leave too little RAM for your operating system. Reduce it to keep at least 1.5 GB available for the system.</span></div>}<div className="field-row"><label>Java executable path · active instance</label><input value={javaPath} onChange={e => setJavaPath(e.target.value)} placeholder="java or full path to java.exe"/></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={javaChecking || javaInstalling || busy} onClick={() => void detectJavaRuntime()}>{javaChecking ? "Checking Java..." : "Detect Java runtime"}</button><button className="primary-button tiny" disabled={javaInstalling || javaChecking || busy} onClick={() => void installJavaRuntime()}>{javaInstalling ? "Installing Java " + requiredJavaMajor(version) + "..." : "Install Java " + requiredJavaMajor(version) + " automatically"}</button></div>{javaCheck && <div className="info-banner"><ShieldCheck size={17}/><span>Java {javaCheck.version} · {javaCheck.platform}/{javaCheck.architecture} · {javaCheck.executable}</span></div>}{javaCheck && <div className="info-banner"><ShieldCheck size={17}/><span>{(() => { const required = requiredJavaMajor(version); const detected = detectedJavaMajor(javaCheck.version); return detected === null ? "Could not read Java major version; check the runtime manually." : detected < required ? "Java " + detected + " may be too old for Minecraft " + version + ". This version normally requires Java " + required + " or newer." : "Java " + detected + " meets the expected Java " + required + "+ requirement for Minecraft " + version + "."; })()}</span></div>}<div className="setting-row"><div><b>Renderer performance profile</b><small>Choose one renderer per Fabric instance. Switching disables the other renderer; restart Minecraft to apply.</small></div><div className="hero-buttons"><button className={rendererProfile === "sodium" ? "primary-button compact" : "secondary-button tiny"} disabled={busy || loader !== "fabric"} onClick={() => void switchRenderer("sodium")}>Sodium</button><button className={rendererProfile === "vulkanmod" ? "primary-button compact" : "secondary-button tiny"} disabled={busy || loader !== "fabric"} onClick={() => void switchRenderer("vulkanmod")}>VulkanMod</button></div></div><div className="info-banner"><Zap size={17}/><span>VulkanMod requires a Vulkan 1.2-compatible GPU and may not work with every mod. Sodium uses OpenGL. They are mutually exclusive renderer profiles.</span></div><div className="panel-title"><div><h3>Automatic graphics tuning</h3><p>Writes real Minecraft options for the selected instance.</p></div><Gauge size={18}/></div><div className="hero-buttons"><button className="primary-button compact" disabled={busy} onClick={() => void applyGraphicsPreset("celeron-low")}>Celeron / 4 GB low-end</button><button className="secondary-button" disabled={busy} onClick={() => void applyGraphicsPreset("i3-balanced")}>i3 balanced</button></div><p className="muted">The preset changes render distance, simulation distance, particles, clouds, entity shadows and other options in options.txt. It does not guarantee a specific FPS. Apply while Minecraft is closed; the game may overwrite options while running.</p><div className="panel-title"><div><h3>One-click optimization packs</h3><p>Install compatible performance mods for this Minecraft version.</p></div><Zap size={18}/></div><div className="hero-buttons"><button className="primary-button compact" disabled={busy || loader !== "fabric"} onClick={() => void installOptimizationPack("sodium")}>Sodium + Low-end pack</button><button className="secondary-button" disabled={busy || loader !== "fabric"} onClick={() => void installOptimizationPack("vulkanmod")}>VulkanMod + Low-end pack</button></div><p className="muted">Pack includes Fabric API, Lithium, FerriteCore, ImmediatelyFast, EntityCulling, Dynamic FPS and More Culling where compatible. Modrinth versions are checked against your selected Minecraft version. Some mods may be skipped if no compatible build exists.</p><div className="info-banner"><ShieldCheck size={17}/><span>For a 4 GB system, start around 1.5–2 GB game RAM and close background apps. Reduce render distance (4–6 chunks), simulation distance (4), particles and graphics quality. These are tuning suggestions, not FPS guarantees.</span></div><div className="setting-row"><div><b>Launcher appearance</b><small>Vampire glass — dark translucent panels with red accents.</small></div><span className="pill">Active</span></div><div className="setting-row"><div><b>Quick menu shortcut</b><small>Right Shift toggles the desktop preview panel. In-game menu is provided by the separate Fabric mod module.</small></div><kbd>RIGHT SHIFT</kbd></div><div className="divider-line"/><div className="panel-title"><div><h3>Diagnostics & launcher logs</h3><p>Recent launcher status, Java/game launch details and captured game output.</p></div><Terminal size={18}/></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={logsLoading} onClick={() => void loadLauncherLogs()}>{logsLoading ? "Loading logs..." : "View recent logs"}</button><button className="secondary-button tiny" onClick={() => void exportLauncherLogs()}>Export log file</button>{logText && <button className="secondary-button tiny" onClick={() => void copyRedactedDiagnostics()}>Copy redacted log</button>}{logText && <button className="secondary-button tiny" onClick={() => setIssuesOnly(value => !value)}>{issuesOnly ? "Show full log" : "Show issue lines (" + logIssues.length + ")"}</button>}<button className="secondary-button tiny" onClick={() => { setContextOnly(value => !value); setIssuesOnly(false); }}>{contextOnly ? "Hide context" : "Show issue context"}</button></div>{logText && <><div className="muted">{logIssues.length} lines matched issue keywords · Error {logIssueSummary.errors} · Exception {logIssueSummary.exceptions} · Fatal {logIssueSummary.fatal} · Crash {logIssueSummary.crashes} · Failed {logIssueSummary.failed}. Review context before diagnosing; handled errors may also match.</div><div className="diagnostic-findings"><b>Automatic checks (heuristics)</b>{logFindings.length ? logFindings.map((finding, index) => <div className={"diagnostic-finding " + finding.severity} key={index}><strong>{finding.title}</strong><p>{finding.detail}</p></div>) : <p className="muted">No known crash signature detected. This does not prove the log is error-free.</p>}</div><pre className="log-viewer">{(contextOnly ? logIssueContext.join("\n") : issuesOnly ? logIssues.join("\n") : logText) || "No matching issue lines in the current log."}</pre></>}<p className="muted">Logs are stored locally in the Vampire Client user-data folder. Review them before sharing because game output may contain account or server details.</p><button className="primary-button" onClick={() => void saveLauncherSettings()}>Save settings</button></section></>}
      </div>
    </main>
    {menuOpen && <div className="quick-overlay" onMouseDown={e => e.target === e.currentTarget && setMenuOpen(false)}><section className="quick-modal glass"><div className="modal-head"><div className="brand-mark small">V</div><div><b>Vampire Quick Menu</b><small>Launcher controls · Right Shift to close</small></div><button className="icon-button" onClick={() => setMenuOpen(false)}><X size={17}/></button></div><div className="quick-modal-grid"><Quick icon={<Blocks/>} title="Mods" text="Browse mod catalog" onClick={() => {setTab("Mods");setMenuOpen(false)}}/><Quick icon={<Sparkles/>} title="Client Studio" text="Cosmetics, HUD and packs" onClick={() => {setTab("Studio");setMenuOpen(false)}}/><Quick icon={<Gauge/>} title="Performance" text="Manage profile settings" onClick={() => {setTab("Settings");setMenuOpen(false)}}/><Quick icon={<Layers3/>} title="Versions" text="Switch game version" onClick={() => {setTab("Versions");setMenuOpen(false)}}/><Quick icon={<CircleUserRound/>} title="Accounts" text="Select local profile" onClick={() => {setTab("Accounts");setMenuOpen(false)}}/></div><div className="modal-note">This shortcut opens the launcher quick menu. For the actual in-game Right Shift menu, install the companion Fabric mod from the repository's <code>game-mod</code> folder.</div></section></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
function Stat({icon,label,value,sub}:{icon:ReactNode;label:string;value:string;sub:string}) { return <div className="stat-card glass"><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>; }
function Quick({icon,title,text,onClick}:{icon:ReactNode;title:string;text:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><span>{icon}</span><div><b>{title}</b><small>{text}</small></div><Plus size={15}/></button>; }
function PageTitle({eyebrow,title,desc}:{eyebrow:string;title:string;desc:string}) { return <div className="page-title"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>; }
