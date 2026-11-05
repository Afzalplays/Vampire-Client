import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Blocks, ChevronDown, CircleUserRound, Cpu, Download, ExternalLink, Gamepad2, Gauge, HardDrive, Layers3, Monitor, Package, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Zap } from "lucide-react";

type Tab = "Home" | "Versions" | "Mods" | "Accounts" | "Settings";
type Mod = { project_id: string; title: string; description: string; downloads: number; icon_url?: string; slug: string; };
const nav: { name: Tab; icon: typeof Gamepad2 }[] = [
  { name: "Home", icon: Gamepad2 }, { name: "Versions", icon: Layers3 }, { name: "Mods", icon: Blocks }, { name: "Accounts", icon: CircleUserRound }, { name: "Settings", icon: Settings2 }
];

export default function App() {
  const [booting, setBooting] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setBooting(false), 1400); return () => window.clearTimeout(timer); }, []);
  const [tab, setTab] = useState<Tab>("Home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("Player");
  const [ram, setRam] = useState(2);
  const [version, setVersion] = useState("1.21.1");
  const [installed, setInstalled] = useState<Array<{fileName:string;enabled:boolean}>>([]);
  const [versions, setVersions] = useState<Array<{id:string;type:string;releaseTime:string}>>([]);
  const [loader, setLoader] = useState("fabric");
  const [javaPath, setJavaPath] = useState("java");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [accountType, setAccountType] = useState("Offline");
  const [gameStatus, setGameStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

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
    Promise.all([window.vampire.getProfile(), window.vampire.getSettings(), window.vampire.listVersions(), window.vampire.getMicrosoftAccount()])
      .then(([savedProfile, settings, catalog, microsoftAccount]) => {
        if (!active) return;
        setProfile(microsoftAccount.authenticated && microsoftAccount.profile ? microsoftAccount.profile.name : savedProfile.active); setAccountType(microsoftAccount.authenticated ? "Microsoft" : "Offline"); setRam(settings.ram); setVersion(settings.version); setJavaPath(settings.javaPath); setLoader(settings.loader); setMicrosoftClientId(settings.clientId || ""); setVersions(catalog);
      }).catch(error => { if (active) setGameStatus(error instanceof Error ? error.message : "Could not load launcher data."); });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function searchMods() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ query: query.trim() || "performance", limit: "24", facets: JSON.stringify([[ "versions:" + version ], [ "categories:" + loader ]]) });
      const response = await fetch("https://api.modrinth.com/v2/search?" + params.toString());
      if (!response.ok) throw new Error("Modrinth returned " + response.status);
      const data = await response.json();
      setMods(data.hits ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reach Modrinth."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (tab === "Mods" && mods.length === 0) void searchMods(); }, [tab]);
  useEffect(() => { if (!window.vampire) return; let active = true; window.vampire.listMods({ version, loader }).then(files => { if (active) setInstalled(files); }).catch(() => undefined); return () => { active = false; }; }, [version, loader]);

  async function saveOfflineProfile() {
    try { if (!window.vampire) throw new Error("Run the desktop app to save profiles."); if (accountType === "Microsoft") { await window.vampire.logoutMicrosoft(); setAccountType("Offline"); } const saved = await window.vampire.saveProfile(profile); setProfile(saved.active); notify("Offline profile saved."); } catch (e) { notify(e instanceof Error ? e.message : "Could not save profile."); }
  }
  async function signInMicrosoft() {
    if (!window.vampire) return notify("Microsoft sign-in is available in the desktop app.");
    if (!microsoftClientId.trim()) return notify("Enter your Microsoft app Client ID first.");
    setBusy(true); try { await window.vampire.saveSettings({ ram, javaPath, version, loader, clientId: microsoftClientId.trim() }); const result = await window.vampire.loginMicrosoft(microsoftClientId.trim()); setProfile(result.profile.name); setAccountType("Microsoft"); notify("Microsoft account connected: " + result.profile.name); if (!result.encryptedStorage) notify("Secure token storage is unavailable; sign in again after restarting."); } catch (e) { notify(e instanceof Error ? e.message : "Microsoft sign-in failed."); } finally { setBusy(false); }
  }
  async function signOutMicrosoft() {
    if (!window.vampire) return;
    try { await window.vampire.logoutMicrosoft(); setAccountType("Offline"); notify("Microsoft account signed out."); } catch (e) { notify(e instanceof Error ? e.message : "Sign-out failed."); }
  }
  async function saveLauncherSettings() {
    try { if (!window.vampire) throw new Error("Settings can only be saved in the desktop app."); await window.vampire.saveSettings({ ram, javaPath, version, loader, clientId: microsoftClientId }); notify("Settings saved."); } catch (e) { notify(e instanceof Error ? e.message : "Could not save settings."); }
  }
  async function installSelectedVersion() {
    if (!window.vampire) return notify("Version installation is available in the desktop app.");
    setBusy(true); try { await window.vampire.installVersion({ version, loader }); notify("Minecraft " + version + " installed."); setGameStatus("Minecraft " + version + " installed."); } catch (e) { notify(e instanceof Error ? e.message : "Installation failed."); } finally { setBusy(false); }
  }
  async function playGame() {
    if (!window.vampire) return notify("Game launching is available in the desktop app.");
    setBusy(true); try { await window.vampire.launchGame({ username: profile, version, ram, javaPath }); } catch (e) { notify(e instanceof Error ? e.message : "Could not launch Minecraft."); } finally { setBusy(false); }
  }
  async function installMod(mod: Mod) {
    if (!window.vampire) return notify("Mod installation is available in the desktop app.");
    setBusy(true); try { const result = await window.vampire.installMod({ projectId: mod.project_id, minecraftVersion: version, loader }); const files = await window.vampire.listMods({ version, loader }); setInstalled(files); notify("Installed " + result.fileName); } catch (e) { notify(e instanceof Error ? e.message : "Mod installation failed."); } finally { setBusy(false); }
  }
  async function removeMod(fileName: string) {
    if (!window.vampire) return;
    try { await window.vampire.removeMod(fileName); setInstalled(await window.vampire.listMods()); notify("Removed " + fileName); } catch (e) { notify(e instanceof Error ? e.message : "Could not remove mod."); }
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

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
      <header className="topbar"><div className="crumb">Vampire Client <span>/</span> {tab}</div><div className="top-actions"><span className="status-dot"/> Preview build <button className="icon-button" onClick={() => setTab("Settings")}><Settings2 size={17}/></button></div></header>
      <div className="content">
        {tab === "Home" && <>
          <section className="hero glass"><div className="hero-copy"><div className="eyebrow"><Sparkles size={14}/> YOUR GAME. YOUR RULES.</div><h1>Enter the <em>night.</em></h1><p>A cleaner Minecraft experience, built around performance, mods and control.</p><div className="hero-buttons"><button className="primary-button" onClick={() => void playGame()}><Play size={16} fill="currentColor"/> Play Minecraft</button><button className="secondary-button" onClick={() => setTab("Versions")}>Manage versions <ChevronDown size={15}/></button></div></div><div className="hero-orb"><div className="orb-ring"/><div className="orb-core">V</div><div className="orb-caption">VAMPIRE<br/>STUDIOS</div></div></section>
          <div className="section-heading"><div><div className="eyebrow">OVERVIEW</div><h2>Command center</h2></div><span className="muted">{gameStatus}</span></div>
          <div className="stat-grid"><Stat icon={<Gauge/>} label="Performance profile" value="Balanced" sub="Profile selection planned"/><Stat icon={<HardDrive/>} label="Memory allocation" value={ram + " GB"} sub="Adjust in settings"/><Stat icon={<Layers3/>} label="Selected version" value={version} sub="Selected game version"/><Stat icon={<Activity/>} label="Game status" value={gameStatus.length > 22 ? "Ready" : gameStatus} sub="Local game process status"/></div>
          <div className="two-grid"><section className="panel glass"><div className="panel-title"><div><h3>Quick actions</h3><p>Jump into your setup</p></div><Zap size={18}/></div><div className="quick-grid"><Quick icon={<Package/>} title="Browse mods" text="Discover on Modrinth" onClick={() => setTab("Mods")}/><Quick icon={<Layers3/>} title="Game versions" text="Choose a Minecraft version" onClick={() => setTab("Versions")}/><Quick icon={<CircleUserRound/>} title="Accounts" text="Manage local profiles" onClick={() => setTab("Accounts")}/><Quick icon={<Settings2/>} title="Preferences" text="Memory and appearance" onClick={() => setTab("Settings")}/></div></section>
          <section className="panel glass"><div className="panel-title"><div><h3>Recommended mods</h3><p>Popular performance additions</p></div><button className="text-button" onClick={() => setTab("Mods")}>Explore all <ExternalLink size={13}/></button></div>{popular.map(m => <div className="recommend" key={m.name}><div className="mod-symbol"><Blocks size={17}/></div><div><b>{m.name}</b><small>{m.desc}</small></div><span>{m.tag}</span></div>)}</section></div>
        </>}
        {tab === "Versions" && <><PageTitle eyebrow="GAME LIBRARY" title="Versions" desc="Choose a Minecraft release for your local profile."/><section className="panel glass"><div className="field-row"><label>Selected Minecraft version</label><select value={version} onChange={e => setVersion(e.target.value)}>{(versions.length ? versions.filter(v => v.type === "release") : [{id:"1.21.1",type:"release",releaseTime:""}]).slice(0,150).map(v => <option key={v.id} value={v.id}>{v.id}</option>)}</select></div><div className="info-banner"><ShieldCheck size={18}/><span>Installs the selected vanilla Minecraft version, assets and libraries from the official version metadata. Java must be installed and available on PATH or set in Settings.</span></div><button className="primary-button" disabled={busy} onClick={() => void installSelectedVersion()}><Download size={15}/>{busy ? "Working..." : "Install selected version"}</button></section></>}
        {tab === "Mods" && <><PageTitle eyebrow="MOD LIBRARY" title="Discover mods" desc="Search the Modrinth catalog and explore compatible projects."/><section className="panel glass"><div className="field-row"><label>Mod loader compatibility</label><select value={loader} onChange={e => setLoader(e.target.value)}><option value="fabric">Fabric</option><option value="vanilla">Vanilla (no mods)</option></select></div><div className="search-row"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && void searchMods()} placeholder="Search Sodium, Iris, Lithium..."/><button className="primary-button compact" onClick={() => void searchMods()} disabled={loading}>{loading ? "Searching..." : "Search"}</button></div>{error && <div className="error-text">{error}</div>}<div className="mod-grid">{mods.map(mod => <article className="mod-card" key={mod.project_id}><div className="mod-card-head">{mod.icon_url ? <img src={mod.icon_url} alt=""/> : <div className="mod-symbol"><Blocks/></div>}<div><b>{mod.title}</b><small>{mod.downloads.toLocaleString()} downloads</small></div></div><p>{mod.description}</p><div className="mod-card-foot"><a href={"https://modrinth.com/mod/" + mod.slug} target="_blank" rel="noreferrer">View on Modrinth <ExternalLink size={12}/></a><button className="secondary-button tiny" disabled={busy} onClick={() => void installMod(mod)}><Download size={12}/> Install</button></div></article>)}</div><div className="divider-line"/><h3>Installed mod files</h3>{installed.length ? installed.map(file => <div className="setting-row" key={file.fileName}><div><b>{file.fileName}</b><small>{file.enabled ? "Enabled" : "Disabled"} · " + version + "</small></div><div className="hero-buttons"><button className="secondary-button tiny" onClick={() => void toggleMod(file.fileName)}>{file.enabled ? "Disable" : "Enable"}</button><button className="secondary-button tiny" onClick={() => void removeMod(file.fileName)}>Remove</button></div></div>) : <p className="muted">No mod JAR files installed for this version yet.</p>}<div className="info-banner"><Blocks size={17}/><span>Mods are downloaded to the Minecraft mods folder. Select Fabric before installing the game version to automatically install the Fabric loader. Mods are not compatible with Vanilla-only profiles.</span></div></section></>}
        {tab === "Accounts" && <><PageTitle eyebrow="IDENTITY" title="Accounts" desc="Use a local offline profile for offline-mode servers, or sign in with Microsoft when authentication is implemented."/><section className="panel glass"><div className="field-row"><label>Offline profile name</label><input value={profile} maxLength={16} onChange={e => setProfile(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}/></div><div className="info-banner"><CircleUserRound size={18}/><span>Offline profiles do not authenticate ownership and only work on servers that explicitly allow offline-mode connections.</span></div><button className="primary-button" onClick={() => void saveOfflineProfile()}>Save profile</button><div className="divider-line"/><h3>Microsoft account</h3><p className="muted">Use your own Microsoft public-client app registration. Vampire Client checks Minecraft Java entitlement before allowing official account launch.</p><div className="field-row"><label>Microsoft App Client ID</label><input value={microsoftClientId} onChange={e => setMicrosoftClientId(e.target.value)} placeholder="Paste your Azure app Client ID"/></div><div className="hero-buttons"><button className="primary-button" disabled={busy} onClick={() => void signInMicrosoft()}>Sign in with Microsoft</button>{accountType === "Microsoft" && <button className="secondary-button" onClick={() => void signOutMicrosoft()}>Sign out</button>}</div><p className="muted">Setup guide: docs/MICROSOFT_LOGIN_SETUP.md</p></section></>}
        {tab === "Settings" && <><PageTitle eyebrow="PREFERENCES" title="Settings" desc="Tune the launcher preview to match your system."/><section className="panel glass"><div className="setting-row"><div><b>Memory allocation</b><small>Recommended starting point for a 4 GB system: 1.5–2 GB.</small></div><div className="range-value">{ram} GB</div></div><input className="range" type="range" min="1" max="8" step=".5" value={ram} onChange={e => setRam(Number(e.target.value))}/><div className="field-row"><label>Java executable path</label><input value={javaPath} onChange={e => setJavaPath(e.target.value)} placeholder="java or full path to java.exe"/></div><div className="setting-row"><div><b>Launcher appearance</b><small>Vampire glass — dark translucent panels with red accents.</small></div><span className="pill">Active</span></div><div className="setting-row"><div><b>Quick menu shortcut</b><small>Right Shift toggles the desktop preview panel. In-game menu is provided by the separate Fabric mod module.</small></div><kbd>RIGHT SHIFT</kbd></div><button className="primary-button" onClick={() => void saveLauncherSettings()}>Save settings</button></section></>}
      </div>
    </main>
    {menuOpen && <div className="quick-overlay" onMouseDown={e => e.target === e.currentTarget && setMenuOpen(false)}><section className="quick-modal glass"><div className="modal-head"><div className="brand-mark small">V</div><div><b>Vampire Quick Menu</b><small>Launcher controls · Right Shift to close</small></div><button className="icon-button" onClick={() => setMenuOpen(false)}><X size={17}/></button></div><div className="quick-modal-grid"><Quick icon={<Blocks/>} title="Mods" text="Browse mod catalog" onClick={() => {setTab("Mods");setMenuOpen(false)}}/><Quick icon={<Gauge/>} title="Performance" text="Manage profile settings" onClick={() => {setTab("Settings");setMenuOpen(false)}}/><Quick icon={<Layers3/>} title="Versions" text="Switch game version" onClick={() => {setTab("Versions");setMenuOpen(false)}}/><Quick icon={<CircleUserRound/>} title="Accounts" text="Select local profile" onClick={() => {setTab("Accounts");setMenuOpen(false)}}/></div><div className="modal-note">This shortcut opens the launcher quick menu. For the actual in-game Right Shift menu, install the companion Fabric mod from the repository's <code>game-mod</code> folder.</div></section></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
function Stat({icon,label,value,sub}:{icon:ReactNode;label:string;value:string;sub:string}) { return <div className="stat-card glass"><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>; }
function Quick({icon,title,text,onClick}:{icon:ReactNode;title:string;text:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><span>{icon}</span><div><b>{title}</b><small>{text}</small></div><Plus size={15}/></button>; }
function PageTitle({eyebrow,title,desc}:{eyebrow:string;title:string;desc:string}) { return <div className="page-title"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>; }
