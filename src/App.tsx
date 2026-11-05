import { useEffect, useMemo, useState } from "react";
import { Activity, Blocks, ChevronDown, CircleUserRound, Cpu, Download, ExternalLink, Gamepad2, Gauge, HardDrive, Layers3, Monitor, Package, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Zap } from "lucide-react";

type Tab = "Home" | "Versions" | "Mods" | "Accounts" | "Settings";
type Mod = { project_id: string; title: string; description: string; downloads: number; icon_url?: string; slug: string; };
const nav: { name: Tab; icon: typeof Gamepad2 }[] = [
  { name: "Home", icon: Gamepad2 }, { name: "Versions", icon: Layers3 }, { name: "Mods", icon: Blocks }, { name: "Accounts", icon: CircleUserRound }, { name: "Settings", icon: Settings2 }
];

export default function App() {
  const [tab, setTab] = useState<Tab>("Home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("Player");
  const [ram, setRam] = useState(2);
  const [version, setVersion] = useState("1.21.1");
  const [installed, setInstalled] = useState<string[]>([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "ShiftRight" && !event.repeat) setMenuOpen(v => !v);
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function searchMods() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ query: query.trim() || "performance", limit: "24", facets: JSON.stringify([[ "versions:1.21.1" ]]) });
      const response = await fetch("https://api.modrinth.com/v2/search?" + params.toString());
      if (!response.ok) throw new Error("Modrinth returned " + response.status);
      const data = await response.json();
      setMods(data.hits ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reach Modrinth."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (tab === "Mods" && mods.length === 0) void searchMods(); }, [tab]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  const popular = useMemo(() => [
    { name: "Sodium", desc: "Rendering optimization", tag: "Performance" },
    { name: "Lithium", desc: "Server and game logic optimization", tag: "Performance" },
    { name: "FerriteCore", desc: "Lower memory usage", tag: "Memory" }
  ], []);

  return <div className="app-shell">
    <aside className="sidebar glass">
      <div className="brand"><div className="brand-mark">V</div><div><b>VAMPIRE</b><small>STUDIOS</small></div></div>
      <div className="side-label">LAUNCHER</div>
      <nav>{nav.map(item => <button key={item.name} className={"nav-item " + (tab === item.name ? "active" : "")} onClick={() => setTab(item.name)}><item.icon size={18}/>{item.name}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="profile-mini"><div className="avatar">{profile.slice(0,1).toUpperCase()}</div><div><b>{profile}</b><small>Offline profile</small></div><ChevronDown size={15}/></div>
        <div className="build-label">VAMPIRE CLIENT <span>v0.2.1</span></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb">Vampire Client <span>/</span> {tab}</div><div className="top-actions"><span className="status-dot"/> Preview build <button className="icon-button" onClick={() => setTab("Settings")}><Settings2 size={17}/></button></div></header>
      <div className="content">
        {tab === "Home" && <>
          <section className="hero glass"><div className="hero-copy"><div className="eyebrow"><Sparkles size={14}/> YOUR GAME. YOUR RULES.</div><h1>Enter the <em>night.</em></h1><p>A cleaner Minecraft experience, built around performance, mods and control.</p><div className="hero-buttons"><button className="primary-button" onClick={() => notify("Game launching is not wired up in this preview yet.")}><Play size={16} fill="currentColor"/> Play Minecraft</button><button className="secondary-button" onClick={() => setTab("Versions")}>Manage versions <ChevronDown size={15}/></button></div></div><div className="hero-orb"><div className="orb-ring"/><div className="orb-core">V</div><div className="orb-caption">VAMPIRE<br/>STUDIOS</div></div></section>
          <div className="section-heading"><div><div className="eyebrow">OVERVIEW</div><h2>Command center</h2></div><span className="muted">Preview environment</span></div>
          <div className="stat-grid"><Stat icon={<Gauge/>} label="Performance profile" value="Balanced" sub="Profile selection planned"/><Stat icon={<HardDrive/>} label="Memory allocation" value={ram + " GB"} sub="Adjust in settings"/><Stat icon={<Layers3/>} label="Selected version" value={version} sub="Version catalog preview"/><Stat icon={<Activity/>} label="Game status" value="Not running" sub="Launcher preview only"/></div>
          <div className="two-grid"><section className="panel glass"><div className="panel-title"><div><h3>Quick actions</h3><p>Jump into your setup</p></div><Zap size={18}/></div><div className="quick-grid"><Quick icon={<Package/>} title="Browse mods" text="Discover on Modrinth" onClick={() => setTab("Mods")}/><Quick icon={<Layers3/>} title="Game versions" text="Choose a Minecraft version" onClick={() => setTab("Versions")}/><Quick icon={<CircleUserRound/>} title="Accounts" text="Manage local profiles" onClick={() => setTab("Accounts")}/><Quick icon={<Settings2/>} title="Preferences" text="Memory and appearance" onClick={() => setTab("Settings")}/></div></section>
          <section className="panel glass"><div className="panel-title"><div><h3>Recommended mods</h3><p>Popular performance additions</p></div><button className="text-button" onClick={() => setTab("Mods")}>Explore all <ExternalLink size={13}/></button></div>{popular.map(m => <div className="recommend" key={m.name}><div className="mod-symbol"><Blocks size={17}/></div><div><b>{m.name}</b><small>{m.desc}</small></div><span>{m.tag}</span></div>)}</section></div>
        </>}
        {tab === "Versions" && <><PageTitle eyebrow="GAME LIBRARY" title="Versions" desc="Choose a Minecraft release for your local profile."/><section className="panel glass"><div className="field-row"><label>Selected Minecraft version</label><select value={version} onChange={e => setVersion(e.target.value)}><option>1.21.1</option><option>1.21.4</option><option>1.20.1</option><option>1.19.4</option></select></div><div className="info-banner"><ShieldCheck size={18}/><span>Version selection is a UI preview. Downloading game assets, libraries and launching the game are not implemented yet.</span></div><button className="primary-button" onClick={() => notify("Saved selection in this preview session.")}>Set active version</button></section></>}
        {tab === "Mods" && <><PageTitle eyebrow="MOD LIBRARY" title="Discover mods" desc="Search the Modrinth catalog and explore compatible projects."/><section className="panel glass"><div className="search-row"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && void searchMods()} placeholder="Search Sodium, Iris, Lithium..."/><button className="primary-button compact" onClick={() => void searchMods()} disabled={loading}>{loading ? "Searching..." : "Search"}</button></div>{error && <div className="error-text">{error}</div>}<div className="mod-grid">{mods.map(mod => <article className="mod-card" key={mod.project_id}><div className="mod-card-head">{mod.icon_url ? <img src={mod.icon_url} alt=""/> : <div className="mod-symbol"><Blocks/></div>}<div><b>{mod.title}</b><small>{mod.downloads.toLocaleString()} downloads</small></div></div><p>{mod.description}</p><div className="mod-card-foot"><a href={"https://modrinth.com/mod/" + mod.slug} target="_blank" rel="noreferrer">View on Modrinth <ExternalLink size={12}/></a><button className="secondary-button tiny" onClick={() => notify("Mod installer is not connected yet. Open the Modrinth page to review the project.")}>Details</button></div></article>)}</div></section></>}
        {tab === "Accounts" && <><PageTitle eyebrow="IDENTITY" title="Accounts" desc="Use a local offline profile for offline-mode servers, or sign in with Microsoft when authentication is implemented."/><section className="panel glass"><div className="field-row"><label>Offline profile name</label><input value={profile} maxLength={16} onChange={e => setProfile(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}/></div><div className="info-banner"><CircleUserRound size={18}/><span>Offline profiles do not authenticate ownership and only work on servers that explicitly allow offline-mode connections.</span></div><button className="primary-button" onClick={() => notify("Offline profile name updated for this preview session.")}>Save profile</button><div className="divider-line"/><h3>Microsoft account</h3><p className="muted">Official Microsoft OAuth and Minecraft entitlement verification are not implemented yet.</p><button className="secondary-button" disabled>Sign in with Microsoft — coming later</button></section></>}
        {tab === "Settings" && <><PageTitle eyebrow="PREFERENCES" title="Settings" desc="Tune the launcher preview to match your system."/><section className="panel glass"><div className="setting-row"><div><b>Memory allocation</b><small>Recommended starting point for a 4 GB system: 1.5–2 GB.</small></div><div className="range-value">{ram} GB</div></div><input className="range" type="range" min="1" max="8" step=".5" value={ram} onChange={e => setRam(Number(e.target.value))}/><div className="setting-row"><div><b>Launcher appearance</b><small>Vampire glass — dark translucent panels with red accents.</small></div><span className="pill">Active</span></div><div className="setting-row"><div><b>Quick menu shortcut</b><small>Right Shift toggles the desktop preview panel. In-game menu is provided by the separate Fabric mod module.</small></div><kbd>RIGHT SHIFT</kbd></div></section></>}
      </div>
    </main>
    {menuOpen && <div className="quick-overlay" onMouseDown={e => e.target === e.currentTarget && setMenuOpen(false)}><section className="quick-modal glass"><div className="modal-head"><div className="brand-mark small">V</div><div><b>Vampire Quick Menu</b><small>Launcher controls · Right Shift to close</small></div><button className="icon-button" onClick={() => setMenuOpen(false)}><X size={17}/></button></div><div className="quick-modal-grid"><Quick icon={<Blocks/>} title="Mods" text="Browse mod catalog" onClick={() => {setTab("Mods");setMenuOpen(false)}}/><Quick icon={<Gauge/>} title="Performance" text="Manage profile settings" onClick={() => {setTab("Settings");setMenuOpen(false)}}/><Quick icon={<Layers3/>} title="Versions" text="Switch game version" onClick={() => {setTab("Versions");setMenuOpen(false)}}/><Quick icon={<CircleUserRound/>} title="Accounts" text="Select local profile" onClick={() => {setTab("Accounts");setMenuOpen(false)}}/></div><div className="modal-note">This shortcut opens the launcher quick menu. For the actual in-game Right Shift menu, install the companion Fabric mod from the repository's <code>game-mod</code> folder.</div></section></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
function Stat({icon,label,value,sub}:{icon:React.ReactNode;label:string;value:string;sub:string}) { return <div className="stat-card glass"><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>; }
function Quick({icon,title,text,onClick}:{icon:React.ReactNode;title:string;text:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><span>{icon}</span><div><b>{title}</b><small>{text}</small></div><Plus size={15}/></button>; }
function PageTitle({eyebrow,title,desc}:{eyebrow:string;title:string;desc:string}) { return <div className="page-title"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>; }
