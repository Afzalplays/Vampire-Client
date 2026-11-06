import { useEffect, useMemo, useState, type ReactNode } from "react";
import ShaderLibrary from "./features/ShaderLibrary";
import TexturePackEditor from "./features/TexturePackEditor";
import { scanModConflicts, extractLogIssues, extractLogIssueContext } from "./features/diagnostics";
import { Activity, Blocks, ChevronDown, CircleUserRound, Cpu, Download, ExternalLink, Gamepad2, Gauge, HardDrive, Layers3, Monitor, Package, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Zap } from "lucide-react";

function requiredJavaMajor(version: string): number {
  const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return 21;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] || 0);
  if (major > 1) return 21;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
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
  const [catalogSort, setCatalogSort] = useState<"downloads" | "name">("downloads");
  const [javaCheck, setJavaCheck] = useState<{version:string;executable:string;platform:string;architecture:string}|null>(null);
  const [javaChecking, setJavaChecking] = useState(false);
  const [logText, setLogText] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("Player");
  const [ram, setRam] = useState(2);
  const [systemMemory, setSystemMemory] = useState<{ totalGB: number; freeGB: number } | null>(null);
  const [version, setVersion] = useState("1.21.1");
  const [instanceId, setInstanceId] = useState("default");
  const [instances, setInstances] = useState<Array<{id:string;name:string;createdAt:string}>>([{id:"default",name:"Default",createdAt:""}]);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [installed, setInstalled] = useState<Array<{fileName:string;enabled:boolean}>>([]);
  const [resourcePacks, setResourcePacks] = useState<string[]>([]);
  const [resourcePackFilter, setResourcePackFilter] = useState("");
  const [resourcePacksLoading, setResourcePacksLoading] = useState(false);
  const [modUpdates, setModUpdates] = useState<Array<{projectId:string;fileName:string;currentVersion:string;latestVersion:string;latestVersionName:string}>>([]);
  const [versions, setVersions] = useState<Array<{id:string;type:string;releaseTime:string}>>([]);
  const [versionTypeFilter, setVersionTypeFilter] = useState("release");
  const [loader, setLoader] = useState("fabric");
  const [javaPath, setJavaPath] = useState("java");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [accountType, setAccountType] = useState("Offline");
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
  const [worldServers, setWorldServers] = useState<Array<{id:string;name:string;version:string;createdAt:string;ramGB:number;running:boolean}>>([]);
  const [newWorldServerName, setNewWorldServerName] = useState("My Vampire World");
  const [worldServerRam, setWorldServerRam] = useState(2);
  const [worldServerEulaAccepted, setWorldServerEulaAccepted] = useState(false);
  const [activeWorldServerId, setActiveWorldServerId] = useState("");
  const [worldServerLogs, setWorldServerLogs] = useState("");
  const [worldServerAddresses, setWorldServerAddresses] = useState<string[]>([]);
  const [worldServerPort, setWorldServerPort] = useState(25565);
  const [worldServerExitStatus, setWorldServerExitStatus] = useState("");
  const [worldServerCommand, setWorldServerCommand] = useState("");
  const [hostingMode, setHostingMode] = useState<"both" | "lan" | "internet">("both");
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
        setProfile(microsoftAccount.authenticated && microsoftAccount.profile ? microsoftAccount.profile.name : savedProfile.active); setAccountType(microsoftAccount.accountType === "microsoft" ? "Microsoft" : "Offline"); setRam(settings.ram); setVersion(settings.version); setJavaPath(settings.javaPath); setLoader(settings.loader); setMicrosoftClientId(settings.clientId || ""); setVersions(catalog); setInstances(savedInstances); setInstanceId(savedInstances.some(item => item.id === settings.instanceId) ? (settings.instanceId || "default") : "default"); setSystemMemory({ totalGB: memory.totalGB, freeGB: memory.freeGB });
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
      if (event.text.includes("Server stopped with exit code")) void window.vampire?.listWorldServers().then(setWorldServers);
    });
  }, [activeWorldServerId]);

  async function selectWorldServer(id: string) {
    if (!window.vampire) return;
    setActiveWorldServerId(id);
    try {
      const info = await window.vampire.getWorldServerInfo(id);
      setWorldServerLogs(info.logs);
      setWorldServerAddresses(info.lanAddresses);
      setWorldServerPort(info.port);
      setWorldServerExitStatus(info.running ? "Server process is running." : info.lastError ? "Could not start server: " + info.lastError : info.lastExitCode !== null ? "Last server process exited with code " + info.lastExitCode + (info.lastExitAt ? " at " + new Date(info.lastExitAt).toLocaleString() : "") + "." : "Server is stopped. Start it after accepting the Minecraft EULA.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not load server details."); }
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
      const created = await window.vampire.createWorldServer({ name: newWorldServerName, version, ramGB: worldServerRam });
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
  async function stopWorldServer(id: string) {
    if (!window.vampire) return;
    try {
      await window.vampire.stopWorldServer(id);
      window.setTimeout(() => { void window.vampire?.listWorldServers().then(setWorldServers); }, 1200);
      notify("Graceful stop requested.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not stop world server."); }
  }
  async function deleteWorldServer(id: string) {
    if (!window.vampire || !window.confirm("Delete this world server and its entire local world folder? This cannot be undone.")) return;
    try {
      await window.vampire.deleteWorldServer(id);
      setWorldServers(await window.vampire.listWorldServers());
      if (activeWorldServerId === id) { setActiveWorldServerId(""); setWorldServerLogs(""); setWorldServerAddresses([]); }
      notify("World server files deleted.");
    } catch (e) { notify(e instanceof Error ? e.message : "Could not delete world server."); }
  }

  async function searchMods() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ query: query.trim() || "performance", limit: "24", facets: JSON.stringify(loader === "fabric" ? [[ "versions:" + version ], [ "categories:fabric" ]] : [[ "versions:" + version ]]) });
      const response = await fetch("https://api.modrinth.com/v2/search?" + params.toString());
      if (!response.ok) throw new Error("Modrinth returned " + response.status);
      const data = await response.json();
      setMods(data.hits ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reach Modrinth."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (tab === "Mods" && mods.length === 0) void searchMods(); }, [tab]);
  useEffect(() => { if (!window.vampire) return; let active = true; window.vampire.listMods({ version, loader, instanceId }).then(files => { if (active) { setInstalled(files); setRendererProfile(files.some(file => file.enabled && file.fileName.toLowerCase().includes("vulkanmod")) ? "vulkanmod" : "sodium"); } }).catch(() => undefined); return () => { active = false; }; }, [version, loader, instanceId]);
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
    if (!window.vampire) return;
    try { await window.vampire.removeShaderPack({ version, loader, instanceId, fileName }); setShaderPacks(await window.vampire.listShaderPacks({ version, loader, instanceId })); notify("Removed shader pack: " + fileName); } catch (e) { notify(e instanceof Error ? e.message : "Could not remove shader pack."); }
  }

  async function saveOfflineProfile() {
    try { if (!window.vampire) throw new Error("Run the desktop app to save profiles."); if (accountType === "Microsoft") { await window.vampire.logoutMicrosoft(); setAccountType("Offline"); } const saved = await window.vampire.saveProfile(profile); setProfile(saved.active); notify("Offline profile saved."); } catch (e) { notify(e instanceof Error ? e.message : "Could not save profile."); }
  }
  async function signInMicrosoft() {
    if (!window.vampire) return notify("Microsoft sign-in is available in the desktop app.");
    if (!microsoftClientId.trim()) return notify("Enter your Microsoft app Client ID first.");
    setBusy(true); try { await window.vampire.saveSettings({ ram, javaPath, version, loader, instanceId, clientId: microsoftClientId.trim() }); const result = await window.vampire.loginMicrosoft(microsoftClientId.trim()); setProfile(result.profile.name); setAccountType("Microsoft"); notify("Microsoft account connected: " + result.profile.name); if (!result.encryptedStorage) notify("Secure token storage is unavailable; sign in again after restarting."); } catch (e) { notify(e instanceof Error ? e.message : "Microsoft sign-in failed."); } finally { setBusy(false); }
  }
  async function signOutMicrosoft() {
    if (!window.vampire) return;
    try { await window.vampire.logoutMicrosoft(); setAccountType("Offline"); notify("Microsoft account signed out."); } catch (e) { notify(e instanceof Error ? e.message : "Sign-out failed."); }
  }
  async function detectJavaRuntime() {
    if (!window.vampire) return notify("Java detection is available in the desktop app.");
    setJavaChecking(true);
    try {
      const result = await window.vampire.detectJava(javaPath);
      setJavaCheck({ version: result.version, executable: result.executable, platform: result.platform, architecture: result.architecture });
      notify("Java detected: " + result.version);
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

  async function createNamedInstance() { if (!window.vampire) return; try { const created = await window.vampire.createInstance(newInstanceName); const next = await window.vampire.listInstances(); setInstances(next); setInstanceId(created.id); setNewInstanceName(""); await window.vampire.saveSettings({ ram, javaPath, version, loader, clientId: microsoftClientId, instanceId: created.id }); notify("Created isolated instance: " + created.name); } catch (e) { notify(e instanceof Error ? e.message : "Could not create instance."); } }
  async function deleteNamedInstance() { if (!window.vampire || instanceId === "default") return; const selected = instances.find(item => item.id === instanceId); if (!selected || !window.confirm("Delete instance \"" + selected.name + "\" and all its local game files, mods and packs?")) return; try { await window.vampire.deleteInstance(instanceId); const next = await window.vampire.listInstances(); setInstances(next); const defaults = await window.vampire.getSettings("default"); setInstanceId("default"); setRam(defaults.ram); setJavaPath(defaults.javaPath); await window.vampire.saveSettings({ instanceId: "default" }); notify("Deleted instance and its files."); } catch (e) { notify(e instanceof Error ? e.message : "Could not delete instance."); } }

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
  async function refreshResourcePacks() {
    if (!window.vampire) return notify("Resource pack manager is available in the desktop app.");
    setResourcePacksLoading(true);
    try { setResourcePacks(await window.vampire.listResourcePacks({ version, loader, instanceId })); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not refresh resource packs."); }
    finally { setResourcePacksLoading(false); }
  }
  async function importResourcePack() {
    if (!window.vampire) return notify("Resource pack import is available in the desktop app.");
    try { const result = await window.vampire.importResourcePack({ version, loader, instanceId }); if (result.fileName) { await refreshResourcePacks(); notify("Imported resource pack: " + result.fileName); } }
    catch (e) { notify(e instanceof Error ? e.message : "Resource pack import failed."); }
  }
  async function removeResourcePack(fileName: string) {
    if (!window.vampire) return;
    if (!window.confirm("Remove resource pack \"" + fileName + "\" from this Minecraft instance?")) return;
    try { await window.vampire.removeResourcePack({ version, loader, instanceId, fileName }); await refreshResourcePacks(); notify("Removed resource pack: " + fileName); }
    catch (e) { notify(e instanceof Error ? e.message : "Could not remove resource pack."); }
  }
  async function removeMod(fileName: string) {
    if (!window.vampire) return;
    try { await window.vampire.removeMod({ fileName, version, loader, instanceId }); setInstalled(await window.vampire.listMods({ version, loader, instanceId })); notify("Removed " + fileName); } catch (e) { notify(e instanceof Error ? e.message : "Could not remove mod."); }
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
  const visibleInstalled = useMemo(() => installed.filter(file => file.fileName.toLowerCase().includes(installedFilter.trim().toLowerCase())), [installed, installedFilter]);
  const compatibilityWarnings = useMemo(() => scanModConflicts(installed), [installed]);
  const logIssues = useMemo(() => extractLogIssues(logText), [logText]);
  const logIssueContext = useMemo(() => extractLogIssueContext(logText), [logText]);
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
        {tab === "Versions" && <><PageTitle eyebrow="GAME LIBRARY" title="Versions" desc="Browse the full official Minecraft version manifest, including current releases, snapshots and legacy versions."/><section className="panel glass"><div className="panel-title"><div><h3>Minecraft instances</h3><p>Separate game folders, mods, resource packs, shaders and options per instance.</p></div><Layers3 size={18}/></div><div className="field-row"><label>Active instance</label><select value={instanceId} onChange={async e=>{const id=e.target.value;if(window.vampire){try{const scoped=await window.vampire.getSettings(id);setInstanceId(id);setRam(scoped.ram);setJavaPath(scoped.javaPath);await window.vampire.saveSettings({instanceId:id});notify("Switched to "+(instances.find(x=>x.id===id)?.name||"instance")+" · "+scoped.ram+" GB RAM");}catch(error){notify(error instanceof Error?error.message:"Could not switch instance.");}}else{setInstanceId(id);}}}>{instances.map(item=><option key={item.id} value={item.id}>{item.name}{item.id==="default"?" · legacy":""}</option>)}</select></div><div className="field-row"><label>New instance name</label><input value={newInstanceName} onChange={e=>setNewInstanceName(e.target.value)} placeholder="e.g. Survival 1.21.10" maxLength={32}/></div><div className="hero-buttons"><button className="primary-button compact" disabled={busy||newInstanceName.trim().length<2} onClick={()=>void createNamedInstance()}>Create instance</button><button className="secondary-button tiny" disabled={instanceId==="default"||busy} onClick={()=>void deleteNamedInstance()}>Delete active instance</button></div><p className="muted">The Default instance keeps your existing version-based installs. New instances use independent storage. Deleting a named instance permanently removes its local files.</p></section><section className="panel glass"><div className="field-row"><label>Version channel</label><select value={versionTypeFilter} onChange={e => { const next = e.target.value; setVersionTypeFilter(next); const candidates = versions.filter(item => next === "all" || item.type === next); if (candidates.length && !candidates.some(item => item.id === version)) setVersion(candidates[0].id); }}><option value="release">Stable releases</option><option value="snapshot">Snapshots</option><option value="old_beta">Old beta</option><option value="old_alpha">Old alpha</option><option value="all">All versions</option></select></div><div className="field-row"><label>Selected Minecraft version</label><select value={version} onChange={e => setVersion(e.target.value)}>{(visibleVersions.length ? visibleVersions : versions).map(v => <option key={v.id} value={v.id}>{v.id} · {v.type}</option>)}</select></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={!latestRelease} onClick={() => { setVersionTypeFilter("release"); setVersion(latestRelease); notify("Selected latest official release: " + latestRelease); }}>Use latest release{latestRelease ? " (" + latestRelease + ")" : ""}</button><button className="secondary-button tiny" onClick={() => setVersionTypeFilter("all")}>Show every version</button></div><div className="info-banner"><ShieldCheck size={18}/><span>Vanilla installation uses official Minecraft version metadata. Legacy alpha/beta versions may have older Java and asset requirements. Fabric is only available where Fabric publishes a compatible loader build. Java must be installed and configured in Settings.</span></div><button className="primary-button" disabled={busy || !versions.some(v => v.id === version)} onClick={() => void installSelectedVersion()}><Download size={15}/>{busy ? "Working..." : "Install selected version"}</button></section></>}
        {tab === "Mods" && <><PageTitle eyebrow="MOD LIBRARY" title="Discover mods" desc="Search the Modrinth catalog and explore compatible projects."/><section className="panel glass"><div className="field-row"><label>Mod loader compatibility</label><select value={loader} onChange={e => setLoader(e.target.value)}><option value="fabric">Fabric</option><option value="vanilla">Vanilla (no mods)</option></select></div><div className="search-row"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && void searchMods()} placeholder="Search Sodium, Iris, Lithium..."/><button className="primary-button compact" onClick={() => void searchMods()} disabled={loading}>{loading ? "Searching..." : "Search"}</button></div><div className="field-row"><label>Sort catalogue</label><select value={catalogSort} onChange={e => setCatalogSort(e.target.value as "downloads" | "name")}><option value="downloads">Most downloaded</option><option value="name">Name A–Z</option></select></div>{error && <div className="error-text">{error}</div>}<div className="muted">{sortedMods.length} matching projects</div><div className="mod-grid">{sortedMods.map(mod => <article className="mod-card" key={mod.project_id}><div className="mod-card-head">{mod.icon_url ? <img src={mod.icon_url} alt=""/> : <div className="mod-symbol"><Blocks/></div>}<div><b>{mod.title}</b><small>{mod.downloads.toLocaleString()} downloads</small></div></div><p>{mod.description}</p><div className="mod-card-foot"><a href={"https://modrinth.com/mod/" + mod.slug} target="_blank" rel="noreferrer">View on Modrinth <ExternalLink size={12}/></a><button className="secondary-button tiny" disabled={busy || loader !== "fabric"} onClick={() => void installMod(mod)}><Download size={12}/> Install</button></div></article>)}</div>{loader !== "fabric" && <p className="muted">Select Fabric to install mods. Vanilla profiles do not load Fabric mods.</p>}<div className="divider-line"/><div className="divider-line"/><div className="panel-title"><div><h3>Mod compatibility scan</h3><p>Common renderer and optimization conflicts detected from enabled filenames.</p></div><ShieldCheck size={18}/></div>{compatibilityWarnings.length ? <div className="error-text">{compatibilityWarnings.map((warning, index) => <p key={index}>⚠ {warning}</p>)}</div> : <div className="info-banner"><ShieldCheck size={17}/><span>No known filename-based conflicts detected. This heuristic cannot verify every mod dependency or runtime compatibility.</span></div>}<div className="panel-title"><h3>Installed mod files ({installed.length})</h3><div className="hero-buttons"><button className="secondary-button tiny" disabled={busy || loader !== "fabric"} onClick={() => void checkModUpdates()}>Check updates</button><button className="secondary-button tiny" disabled={busy || !installed.length} onClick={() => void bulkToggleMods(true)}>Enable all</button><button className="secondary-button tiny" disabled={busy || !installed.length} onClick={() => void bulkToggleMods(false)}>Disable all</button></div></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={busy || loader !== "fabric"} onClick={() => void exportModpack()}>Export modpack</button><button className="secondary-button tiny" disabled={busy || loader !== "fabric"} onClick={() => void importModpack()}>Import modpack</button></div><div className="field-row"><label>Filter installed mods</label><input value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} placeholder="Filter installed .jar files..."/></div>{modUpdates.map(item => <div className="setting-row" key={item.projectId}><div><b>{item.fileName}</b><small>Update available · {item.latestVersionName}</small></div><button className="primary-button compact" disabled={busy} onClick={() => void updateMod(item.projectId)}>Update</button></div>)}{visibleInstalled.length ? visibleInstalled.map(file => <div className="setting-row" key={file.fileName}><div><b>{file.fileName}</b><small>{file.enabled ? "Enabled" : "Disabled"} · {version}</small></div><div className="hero-buttons"><button className="secondary-button tiny" onClick={() => void toggleMod(file.fileName)}>{file.enabled ? "Disable" : "Enable"}</button><button className="secondary-button tiny" onClick={() => void removeMod(file.fileName)}>Remove</button></div></div>) : <p className="muted">No installed mods match this filter.</p>}<div className="info-banner"><Blocks size={17}/><span>Mods are downloaded to the Minecraft mods folder. Select Fabric before installing the game version to automatically install the Fabric loader. Mods are not compatible with Vanilla-only profiles.</span></div></section></>}
        {tab === "Shaders" && <><PageTitle eyebrow="VAMPIRE LIBRARY" title="Shader packs" desc="Browse community shader packs, check compatibility and manage this instance’s shader ZIPs."/><ShaderLibrary installed={shaderPacks} installedMods={installed} loader={loader} version={version} onImport={()=>void importShaderPack()} onRemove={name=>void removeShaderPack(name)} onDownload={slug=>void downloadShaderPack(slug)}/></>}
        {tab === "Texture Editor" && <><PageTitle eyebrow="VAMPIRE STUDIO" title="Texture Pack Editor" desc="Create a custom texture, import PNG artwork and export a Minecraft resource-pack ZIP."/><TexturePackEditor/></>}
        {tab === "Studio" && <><PageTitle eyebrow="VAMPIRE CLIENT STUDIO" title="Make it yours." desc="Cosmetics, HUD, shader packs, mod profiles and local-world tools — one place to customize your Minecraft experience."/>
          <section className="studio-hero glass"><div><div className="eyebrow">COSMETIC LAB · LIVE PREVIEW</div><h2>Your identity. Your style.</h2><p>Preview your Vampire identity. Cosmetic sync and in-game rendering are being built as the next companion-mod milestone.</p><div className="studio-tags"><span>CLIENT COSMETICS</span><span>HD CAPE READY DESIGN</span><span>GRADIENT IDENTITY</span></div></div><div className={"cape-preview cape-"+capeStyle}><div className="cape-emblem">V</div><small>VAMPIRE</small></div></section>
          <div className="studio-grid">
            <section className="panel glass"><div className="panel-title"><div><h3>HD cape designer</h3><p>Choose a branded cape preview</p></div><Sparkles size={18}/></div><div className="cape-options">{[{id:"crimson",label:"Crimson"},{id:"void",label:"Void"},{id:"royal",label:"Royal"}].map(c=><button key={c.id} className={"cape-choice "+(capeStyle===c.id?"selected":"")} onClick={()=>setCapeStyle(c.id)}><span className={"cape-swatch cape-"+c.id}/>{c.label}</button>)}</div><div className="info-banner"><ShieldCheck size={17}/><span>Selected visibility: Vampire account sync across devices. Cape upload, cloud storage, signed delivery and in-game rendering still require the cosmetics service and companion-mod integration. No Mojang cape APIs are bypassed.</span></div><div className="field-row"><label>Cape visibility</label><select value={capeVisibility} onChange={e=>setCapeVisibility(e.target.value as "account" | "client-only")}><option value="account">Vampire account sync (all signed-in devices)</option><option value="client-only">Vampire Client users only (local preview)</option></select></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Name & chat identity</h3><p>Gradient name styling and Vampire nametag mark</p></div><Sparkles size={18}/></div><div className={"name-preview name-"+nameStyle}>{profile || "Player"} <span>{nametagLogo?"◆":" "}</span></div><div className="field-row"><label>Gradient preset</label><select value={nameStyle} onChange={e=>setNameStyle(e.target.value)}><option value="inferno">Inferno red</option><option value="bloodmoon">Blood moon</option><option value="frost">Frost violet</option><option value="gold">Royal gold</option></select></div><div className="setting-row"><div><b>Chat name gradient</b><small>Visible only to compatible Vampire Client users.</small></div><button className={chatGradient?"toggle-on":"toggle-off"} onClick={()=>setChatGradient(v=>!v)}>{chatGradient?"ON":"OFF"}</button></div><div className="setting-row"><div><b>Nametag Vampire mark</b><small>Small brand mark before your name.</small></div><button className={nametagLogo?"toggle-on":"toggle-off"} onClick={()=>setNametagLogo(v=>!v)}>{nametagLogo?"ON":"OFF"}</button></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>HUD & overlays</h3><p>Client-side layout controls</p></div><Monitor size={18}/></div><div className="setting-row"><div><b>Custom HUD editor</b><small>Position, scale, opacity and widgets.</small></div><button className={customHud?"toggle-on":"toggle-off"} onClick={()=>setCustomHud(v=>!v)}>{customHud?"ON":"OFF"}</button></div><div className="hud-mini"><span>VAMPIRE · 144 FPS</span><span>XYZ 120 / 64 / -32</span><span>MEM 2.1 GB</span></div><p className="muted">Toggle is saved locally; drag-and-drop HUD editor and in-game persistence are planned for the companion mod.</p></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Shader & resource packs</h3><p>Shader loader and pack management</p></div><Layers3 size={18}/></div><div className="setting-row"><div><b>Shader support</b><small>Iris shader loader for Fabric; compatible GPU required.</small></div><button className={shaderSupport?"toggle-on":"toggle-off"} onClick={()=>setShaderSupport(v=>!v)}>{shaderSupport?"ON":"OFF"}</button></div><button className="secondary-button" onClick={()=>{setTab("Mods");setQuery("Iris shaders");void searchMods();}}>Find Iris shader loader <ExternalLink size={13}/></button><div className="hero-buttons"><button className="primary-button compact" onClick={() => void importShaderPack()}>Import shader ZIP</button><button className="secondary-button" onClick={() => { setTab("Mods"); setQuery("Iris"); void searchMods(); }}>Find Iris loader</button></div>{shaderPacks.length ? shaderPacks.map(file => <div className="setting-row" key={file}><div><b>{file}</b><small>Stored in this Minecraft instance shaderpacks folder</small></div><button className="secondary-button tiny" onClick={() => void removeShaderPack(file)}>Remove</button></div>) : <p className="muted">No shader ZIPs imported for this instance yet.</p>}<div className="info-banner"><Zap size={17}/><span>ZIP files are copied to the selected instance. To use them in-game, install a compatible shader loader such as Iris and select the pack in Video Settings → Shader Packs. Import does not execute ZIP contents.</span></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Resource pack manager</h3><p>Import and manage local Minecraft resource pack ZIPs</p></div><Layers3 size={18}/></div><div className="hero-buttons"><button className="primary-button compact" onClick={() => void importResourcePack()}>Import resource pack ZIP</button><button className="secondary-button tiny" disabled={resourcePacksLoading} onClick={() => void refreshResourcePacks()}>{resourcePacksLoading ? "Refreshing..." : "Refresh list"}</button></div><div className="field-row"><label>Filter installed packs ({resourcePacks.length})</label><input value={resourcePackFilter} onChange={e=>setResourcePackFilter(e.target.value)} placeholder="Search resource pack ZIPs..."/></div>{resourcePacks.filter(file=>file.toLowerCase().includes(resourcePackFilter.trim().toLowerCase())).length ? resourcePacks.filter(file=>file.toLowerCase().includes(resourcePackFilter.trim().toLowerCase())).map(file => <div className="setting-row" key={file}><div><b>{file}</b><small>Stored in this Minecraft instance resourcepacks folder</small></div><button className="secondary-button tiny" onClick={() => void removeResourcePack(file)}>Remove</button></div>) : <p className="muted">{resourcePacks.length ? "No resource packs match this filter." : "No resource packs imported for this instance."}</p>}<div className="info-banner"><ShieldCheck size={17}/><span>ZIP files are copied, not extracted or executed. Enable imported packs in Minecraft Options → Resource Packs after restarting or refreshing the game.</span></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Mod & feature library</h3><p>Discover compatible community mods plus Vampire tools</p></div><Blocks size={18}/></div><div className="feature-pills">{["Performance","Minimap","Zoom","Replay","Voice chat","Emotes","World map","Inventory","Animations","Schematic","Dynamic lights","AppleSkin","Entity culling","HUD","Screenshot","Cosmetics"].map(x=><span key={x}>{x}</span>)}</div><button className="primary-button" onClick={()=>{setTab("Mods");setQuery("");void searchMods();}}>Browse Modrinth catalogue <ExternalLink size={13}/></button><p className="muted">100+ compatible mods will be discoverable from Modrinth; we will not bundle third-party mods without their authors' permission. Each mod will have one-click install, enable, disable and remove.</p></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Replay & schematics</h3><p>Creator tools and build assistance</p></div><Layers3 size={18}/></div><div className="setting-row"><div><b>Replay Mod support</b><small>Record, replay and export gameplay sessions.</small></div><button className={replaySupport?"toggle-on":"toggle-off"} onClick={()=>setReplaySupport(v=>!v)}>{replaySupport?"ON":"OFF"}</button></div><div className="setting-row"><div><b>Schematic tools</b><small>Litematica-style schematic placement and previews.</small></div><button className={schematicsEnabled?"toggle-on":"toggle-off"} onClick={()=>setSchematicsEnabled(v=>!v)}>{schematicsEnabled?"ON":"OFF"}</button></div><div className="info-banner"><Blocks size={17}/><span>These switches save your preferences only. Replay Mod and schematic file handling still need compatible loader versions, dependencies and in-game integration.</span></div></section>
            <section className="panel glass"><div className="panel-title"><div><h3>Vampire World Hosting</h3><p>Run a vanilla Minecraft server locally on this PC</p></div><Gamepad2 size={18}/></div><div className="setting-row"><div><b>World hosting tools</b><small>Manage isolated server folders and server processes.</small></div><button className={worldHosting?"toggle-on":"toggle-off"} onClick={()=>setWorldHosting(v=>!v)}>{worldHosting?"ON":"OFF"}</button></div><div className="field-row"><label>Network access plan</label><select value={hostingMode} onChange={e=>setHostingMode(e.target.value as "both" | "lan" | "internet")}><option value="both">Both LAN and Internet</option><option value="lan">LAN only</option><option value="internet">Internet only</option></select></div><div className="field-row"><label>Server name</label><input value={newWorldServerName} maxLength={32} onChange={e=>setNewWorldServerName(e.target.value)} placeholder="My Minecraft World"/></div><div className="field-row"><label>Server RAM (1–16 GB)</label><input type="number" min={1} max={16} step={1} value={worldServerRam} onChange={e=>setWorldServerRam(Math.max(1,Math.min(16,Number(e.target.value)||1)))}/></div><p className="muted">New server will use Minecraft {version} (the currently selected version). Vampire Client downloads the official Mojang server JAR and verifies its SHA-1 checksum.</p><button className="primary-button" disabled={busy || !worldHosting} onClick={()=>void createWorldServer()}><Download size={15}/> Create &amp; download server</button><div className="divider-line"/><div className="setting-row"><div><b>Minecraft EULA acceptance</b><small>Required before any server can start. Read the Minecraft EULA and accept it yourself.</small></div><input type="checkbox" checked={worldServerEulaAccepted} onChange={e=>setWorldServerEulaAccepted(e.target.checked)}/></div>{worldServers.length===0?<p className="muted">No local world servers created yet.</p>:worldServers.map(server=><div className="recommend" key={server.id}><div className="mod-symbol"><Gamepad2 size={17}/></div><div><b>{server.name}</b><small>Minecraft {server.version} · {server.ramGB} GB saved RAM · {server.running?"Running":"Stopped"}</small></div><div className="hero-buttons">{server.running?<button className="secondary-button" onClick={()=>void stopWorldServer(server.id)}>Stop</button>:<button className="primary-button" disabled={busy || !worldServerEulaAccepted} onClick={()=>void startWorldServer(server.id)}>Accept EULA &amp; Start</button>}<button className="secondary-button" onClick={()=>void deleteWorldServer(server.id)}>Delete</button></div></div>)}{worldServers.length>0&&<><div className="field-row"><label>Console server</label><select value={activeWorldServerId} onChange={e=>void selectWorldServer(e.target.value)}><option value="">Select a server</option>{worldServers.map(server=><option key={server.id} value={server.id}>{server.name}</option>)}</select></div>{activeWorldServerId&&<><div className="panel-title"><div><h3>Live server console</h3><p>Output is also saved in this server's local server.log file.</p></div><Terminal size={17}/></div><div className="info-banner"><ShieldCheck size={17}/><span>LAN connection: {worldServerAddresses.length?worldServerAddresses.map(address=>address+":"+worldServerPort).join(" · "):"No active LAN IPv4 address detected"} . Players must be on the same local network. Internet access requires manual port forwarding or a trusted tunnel.</span></div><div className="info-banner"><ShieldCheck size={17}/><span>{worldServerExitStatus || "Select a server to view its runtime status."}</span></div><pre className="server-console">{worldServerLogs||"Waiting for server output…"}</pre><div className="server-command"><input value={worldServerCommand} maxLength={256} onChange={e=>setWorldServerCommand(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void sendWorldServerCommand();}} placeholder="Enter server command (e.g. list, say hello)"/><button className="primary-button" disabled={!worldServerCommand.trim()} onClick={()=>void sendWorldServerCommand()}>Send</button></div></>}</>}<div className="info-banner"><ShieldCheck size={17}/><span>Saved network preference: {hostingMode==="both"?"LAN + Internet":hostingMode==="lan"?"LAN only":"Internet only"} (not enforced yet). The server currently uses the default port 25565, online-mode=true and RCON disabled. Internet access still requires you to configure router port forwarding or a trusted tunnel manually. Vampire Client does not modify firewall, router, UPnP or public network settings.</span></div></section>
          </div><section className="panel glass"><div className="panel-title"><div><h3>Save your studio setup</h3><p>Preferences are stored on this device.</p></div><span className="pill">LOCAL PROFILE</span></div><button className="primary-button" onClick={()=>notify("Studio preferences saved on this device.")}>Save Studio preferences</button></section>
        </>}
        {tab === "Accounts" && <><PageTitle eyebrow="IDENTITY" title="Accounts" desc="Sign in with Microsoft for owned Minecraft Java Edition, or use a local offline profile on offline-mode servers."/><section className="panel glass"><div className="field-row"><label>Offline profile name</label><input value={profile} maxLength={16} onChange={e => setProfile(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}/></div><div className="info-banner"><CircleUserRound size={18}/><span>Offline profiles do not authenticate ownership and only work on servers that explicitly allow offline-mode connections.</span></div><button className="primary-button" onClick={() => void saveOfflineProfile()}>Save profile</button><div className="divider-line"/><h3>Microsoft account</h3><p className="muted">Use your own Microsoft public-client app registration. Vampire Client checks Minecraft Java entitlement before allowing official account launch.</p><div className="field-row"><label>Microsoft App Client ID</label><input value={microsoftClientId} onChange={e => setMicrosoftClientId(e.target.value)} placeholder="Paste your Azure app Client ID"/></div><div className="hero-buttons"><button className="primary-button" disabled={busy} onClick={() => void signInMicrosoft()}>Sign in with Microsoft</button>{accountType === "Microsoft" && <button className="secondary-button" onClick={() => void signOutMicrosoft()}>Sign out</button>}</div><p className="muted">Setup guide: docs/MICROSOFT_LOGIN_SETUP.md</p></section></>}
        {tab === "Settings" && <><PageTitle eyebrow="PREFERENCES" title="Settings" desc="RAM and Java executable are saved independently for each Minecraft instance."/><section className="panel glass"><div className="setting-row"><div><b>Memory allocation · {instances.find(item => item.id === instanceId)?.name || "Default"}</b><small>{systemMemory ? `Detected ${systemMemory.totalGB} GB system RAM · ${systemMemory.freeGB} GB currently free. Leave memory for Windows and background apps.` : "Recommended starting point for a 4 GB system: 1.5–2 GB."}</small></div><div className="range-value">{ram} GB</div></div><input className="range" type="range" min="1" max="16" step=".5" value={ram} onChange={e => setRam(Number(e.target.value))}/>{systemMemory && ram > Math.max(1, systemMemory.totalGB - 1.5) && <div className="info-banner"><ShieldCheck size={17}/><span>This allocation may leave too little RAM for your operating system. Reduce it to keep at least 1.5 GB available for the system.</span></div>}<div className="field-row"><label>Java executable path · active instance</label><input value={javaPath} onChange={e => setJavaPath(e.target.value)} placeholder="java or full path to java.exe"/></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={javaChecking} onClick={() => void detectJavaRuntime()}>{javaChecking ? "Checking Java..." : "Detect Java runtime"}</button></div>{javaCheck && <div className="info-banner"><ShieldCheck size={17}/><span>Java {javaCheck.version} · {javaCheck.platform}/{javaCheck.architecture} · {javaCheck.executable}</span></div>}{javaCheck && <div className="info-banner"><ShieldCheck size={17}/><span>{(() => { const required = requiredJavaMajor(version); const detected = detectedJavaMajor(javaCheck.version); return detected === null ? "Could not read Java major version; check the runtime manually." : detected < required ? "Java " + detected + " may be too old for Minecraft " + version + ". This version normally requires Java " + required + " or newer." : "Java " + detected + " meets the expected Java " + required + "+ requirement for Minecraft " + version + "."; })()}</span></div>}<div className="setting-row"><div><b>Renderer performance profile</b><small>Choose one renderer per Fabric instance. Switching disables the other renderer; restart Minecraft to apply.</small></div><div className="hero-buttons"><button className={rendererProfile === "sodium" ? "primary-button compact" : "secondary-button tiny"} disabled={busy || loader !== "fabric"} onClick={() => void switchRenderer("sodium")}>Sodium</button><button className={rendererProfile === "vulkanmod" ? "primary-button compact" : "secondary-button tiny"} disabled={busy || loader !== "fabric"} onClick={() => void switchRenderer("vulkanmod")}>VulkanMod</button></div></div><div className="info-banner"><Zap size={17}/><span>VulkanMod requires a Vulkan 1.2-compatible GPU and may not work with every mod. Sodium uses OpenGL. They are mutually exclusive renderer profiles.</span></div><div className="panel-title"><div><h3>Automatic graphics tuning</h3><p>Writes real Minecraft options for the selected instance.</p></div><Gauge size={18}/></div><div className="hero-buttons"><button className="primary-button compact" disabled={busy} onClick={() => void applyGraphicsPreset("celeron-low")}>Celeron / 4 GB low-end</button><button className="secondary-button" disabled={busy} onClick={() => void applyGraphicsPreset("i3-balanced")}>i3 balanced</button></div><p className="muted">The preset changes render distance, simulation distance, particles, clouds, entity shadows and other options in options.txt. It does not guarantee a specific FPS. Apply while Minecraft is closed; the game may overwrite options while running.</p><div className="panel-title"><div><h3>One-click optimization packs</h3><p>Install compatible performance mods for this Minecraft version.</p></div><Zap size={18}/></div><div className="hero-buttons"><button className="primary-button compact" disabled={busy || loader !== "fabric"} onClick={() => void installOptimizationPack("sodium")}>Sodium + Low-end pack</button><button className="secondary-button" disabled={busy || loader !== "fabric"} onClick={() => void installOptimizationPack("vulkanmod")}>VulkanMod + Low-end pack</button></div><p className="muted">Pack includes Fabric API, Lithium, FerriteCore, ImmediatelyFast, EntityCulling, Dynamic FPS and More Culling where compatible. Modrinth versions are checked against your selected Minecraft version. Some mods may be skipped if no compatible build exists.</p><div className="info-banner"><ShieldCheck size={17}/><span>For a 4 GB system, start around 1.5–2 GB game RAM and close background apps. Reduce render distance (4–6 chunks), simulation distance (4), particles and graphics quality. These are tuning suggestions, not FPS guarantees.</span></div><div className="setting-row"><div><b>Launcher appearance</b><small>Vampire glass — dark translucent panels with red accents.</small></div><span className="pill">Active</span></div><div className="setting-row"><div><b>Quick menu shortcut</b><small>Right Shift toggles the desktop preview panel. In-game menu is provided by the separate Fabric mod module.</small></div><kbd>RIGHT SHIFT</kbd></div><div className="divider-line"/><div className="panel-title"><div><h3>Diagnostics & launcher logs</h3><p>Recent launcher status, Java/game launch details and captured game output.</p></div><Terminal size={18}/></div><div className="hero-buttons"><button className="secondary-button tiny" disabled={logsLoading} onClick={() => void loadLauncherLogs()}>{logsLoading ? "Loading logs..." : "View recent logs"}</button><button className="secondary-button tiny" onClick={() => void exportLauncherLogs()}>Export log file</button>{logText && <button className="secondary-button tiny" onClick={() => setIssuesOnly(value => !value)}>{issuesOnly ? "Show full log" : "Show issue lines (" + logIssues.length + ")"}</button><button className="secondary-button tiny" onClick={() => { setContextOnly(value => !value); setIssuesOnly(false); }}>{contextOnly ? "Hide context" : "Show issue context"}</button>}</div>{logText && <><div className="muted">{logIssues.length} lines matched error/exception/fatal/failed/crash keywords. Review context before diagnosing; handled errors may also match.</div><pre className="log-viewer">{(contextOnly ? logIssueContext.join("\n") : issuesOnly ? logIssues.join("\n") : logText) || "No matching issue lines in the current log."}</pre></>}<p className="muted">Logs are stored locally in the Vampire Client user-data folder. Review them before sharing because game output may contain account or server details.</p><button className="primary-button" onClick={() => void saveLauncherSettings()}>Save settings</button></section></>}
      </div>
    </main>
    {menuOpen && <div className="quick-overlay" onMouseDown={e => e.target === e.currentTarget && setMenuOpen(false)}><section className="quick-modal glass"><div className="modal-head"><div className="brand-mark small">V</div><div><b>Vampire Quick Menu</b><small>Launcher controls · Right Shift to close</small></div><button className="icon-button" onClick={() => setMenuOpen(false)}><X size={17}/></button></div><div className="quick-modal-grid"><Quick icon={<Blocks/>} title="Mods" text="Browse mod catalog" onClick={() => {setTab("Mods");setMenuOpen(false)}}/><Quick icon={<Sparkles/>} title="Client Studio" text="Cosmetics, HUD and packs" onClick={() => {setTab("Studio");setMenuOpen(false)}}/><Quick icon={<Gauge/>} title="Performance" text="Manage profile settings" onClick={() => {setTab("Settings");setMenuOpen(false)}}/><Quick icon={<Layers3/>} title="Versions" text="Switch game version" onClick={() => {setTab("Versions");setMenuOpen(false)}}/><Quick icon={<CircleUserRound/>} title="Accounts" text="Select local profile" onClick={() => {setTab("Accounts");setMenuOpen(false)}}/></div><div className="modal-note">This shortcut opens the launcher quick menu. For the actual in-game Right Shift menu, install the companion Fabric mod from the repository's <code>game-mod</code> folder.</div></section></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
function Stat({icon,label,value,sub}:{icon:ReactNode;label:string;value:string;sub:string}) { return <div className="stat-card glass"><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>; }
function Quick({icon,title,text,onClick}:{icon:ReactNode;title:string;text:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><span>{icon}</span><div><b>{title}</b><small>{text}</small></div><Plus size={15}/></button>; }
function PageTitle({eyebrow,title,desc}:{eyebrow:string;title:string;desc:string}) { return <div className="page-title"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>; }
