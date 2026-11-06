import { useEffect, useState } from "react";

type Shader = { id: string; name: string; creator: string; description: string; slug: string; versions: string; loader: string; };
const library: Shader[] = [
  {id:"complementary-reimagined",name:"Complementary Reimagined",creator:"Complementary",description:"Balanced visual upgrade with configurable performance and atmosphere.",slug:"complementary-reimagined",versions:"1.16.5–1.21.x (check current file)",loader:"Iris / OptiFine"},
  {id:"complementary-unbound",name:"Complementary Unbound",creator:"Complementary",description:"Cinematic lighting and broad visual customization.",slug:"complementary-unbound",versions:"1.16.5–1.21.x (check current file)",loader:"Iris / OptiFine"},
  {id:"bsl",name:"BSL Shaders",creator:"CaptTatsu",description:"Soft lighting, rich colors and configurable effects.",slug:"bsl-shaders",versions:"Version-dependent",loader:"Iris / OptiFine"},
  {id:"sildurs-vibrant",name:"Sildur's Vibrant",creator:"Sildur",description:"Vibrant lighting presets with multiple performance tiers.",slug:"sildurs-vibrant-shaders",versions:"Version-dependent",loader:"Iris / OptiFine"},
  {id:"makeup-ultra-fast",name:"MakeUp Ultra Fast",creator:"MakeUp team",description:"Performance-focused effects with granular toggles.",slug:"makeup-ultra-fast-shaders",versions:"Version-dependent",loader:"Iris / OptiFine"},
  {id:"chocapic13",name:"Chocapic13",creator:"Chocapic13",description:"Classic shader family with several quality levels.",slug:"chocapic13-shaders",versions:"Version-dependent",loader:"Iris / OptiFine"},
  {id:"astralex",name:"AstraLex",creator:"AstraLex",description:"Stylized visuals and cinematic effects.",slug:"astralex-shader-bsl-edit",versions:"Version-dependent",loader:"Iris / OptiFine"},
  {id:"photon",name:"Photon",creator:"sixthsurge",description:"Modern lighting and atmosphere with detailed settings.",slug:"photon-shader",versions:"Version-dependent",loader:"Iris"},
  {id:"nostalgia",name:"Nostalgia",creator:"RRe36",description:"Classic Minecraft-inspired lighting and colors.",slug:"nostalgia-shader",versions:"Version-dependent",loader:"Iris / OptiFine"},
  {id:"solas",name:"Solas",creator:"Solas team",description:"Atmospheric shader with stylized lighting.",slug:"solas-shader",versions:"Version-dependent",loader:"Iris"}
];

export default function ShaderLibrary({ installed, onImport, onRemove, onDownload, version }: {installed:string[];onImport:()=>void;onRemove:(name:string)=>void;onDownload:(slug:string)=>void;version:string}) {
  const [query,setQuery]=useState("");
  const [details,setDetails]=useState<Record<string,string>>({});
  useEffect(()=>{
    let live=true;
    Promise.all(library.map(async shader=>{
      try {
        const response=await fetch("https://api.modrinth.com/v2/project/"+shader.slug);
        if(!response.ok) throw new Error("Modrinth listing unavailable");
        const data=await response.json();
        return [shader.id, data.title || shader.name] as const;
      } catch { return [shader.id, shader.name] as const; }
    })).then(items=>{if(live)setDetails(Object.fromEntries(items));});
    return ()=>{live=false;};
  },[]);
  const visible=library.filter(item=>(details[item.id]||item.name).toLowerCase().includes(query.toLowerCase())||item.description.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel glass">
    <div className="panel-title"><div><h3>Vampire Shader Library</h3><p>Curated community shader packs · selected Minecraft {version}</p></div><span className="pill">{installed.length} INSTALLED</span></div>
    <div className="search-row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search shader library..."/><button className="primary-button compact" onClick={onImport}>Import ZIP</button></div>
    <div className="mod-grid">{visible.map(shader=>{
      const file=installed.find(name=>name.toLowerCase().includes(shader.id.split("-")[0]));
      return <article className="mod-card" key={shader.id}>
        <div className="mod-card-head"><div className="mod-symbol">✦</div><div><b>{details[shader.id]||shader.name}</b><small>{shader.creator}</small></div></div>
        <p>{shader.description}</p>
        <div className="feature-pills"><span>{shader.loader}</span><span>{shader.versions}</span></div>
        <div className="mod-card-foot"><a href={"https://modrinth.com/shader/"+shader.slug} target="_blank" rel="noreferrer">Modrinth page ↗</a>{file?<button className="secondary-button tiny" onClick={()=>onRemove(file)}>Remove</button>:<button className="primary-button tiny" onClick={()=>onDownload(shader.slug)}>Install</button>}</div>
      </article>;
    })}</div>
    <div className="info-banner">Install downloads the latest Modrinth release matching the selected Minecraft version directly into this instance’s shaderpacks folder. Enable shaders in Iris or compatible OptiFine settings after installation; this launcher does not toggle the in-game shader selection.</div>
    {installed.length>0&&<><div className="divider-line"/><h3>Installed in this instance</h3>{installed.map(file=><div className="setting-row" key={file}><div><b>{file}</b><small>Minecraft {version} · shaderpacks folder</small></div><button className="secondary-button tiny" onClick={()=>onRemove(file)}>Remove</button></div>)}</>}
  </section>;
}
