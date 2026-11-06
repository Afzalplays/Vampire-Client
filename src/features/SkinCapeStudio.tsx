import { useEffect, useState } from "react";
import { Crown, ImagePlus, LockKeyhole, Palette, Sparkles, Upload, UserRound } from "lucide-react";

type SavedImage = { name: string; data: string; width: number; height: number };
const STORAGE_KEY = "vampire-cosmetics-local-v1";
const MAX_FILE_BYTES = 2 * 1024 * 1024;

async function readPng(file: File, kind: "skin" | "cape"): Promise<SavedImage> {
  if (file.type !== "image/png") throw new Error("Please choose a PNG image.");
  if (file.size > MAX_FILE_BYTES) throw new Error("PNG must be 2 MB or smaller.");
  const bitmap = await createImageBitmap(file);
  const valid = kind === "skin"
    ? (bitmap.width === 64 && (bitmap.height === 64 || bitmap.height === 32)) || (bitmap.width === 128 && (bitmap.height === 128 || bitmap.height === 64))
    : (bitmap.width === 64 && bitmap.height === 32) || (bitmap.width === 128 && bitmap.height === 64);
  const { width, height } = bitmap;
  bitmap.close();
  if (!valid) throw new Error(kind === "skin" ? "Skin must be 64×64, 64×32, 128×128 or 128×64." : "Cape must be 64×32 or 128×64 pixels.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read PNG."));
    reader.onerror = () => reject(new Error("Could not read PNG."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, data, width, height };
}

export default function SkinCapeStudio() {
  const [skin, setSkin] = useState<SavedImage | null>(null);
  const [cape, setCape] = useState<SavedImage | null>(null);
  const [style, setStyle] = useState("inferno");
  const [logo, setLogo] = useState(true);
  const [sparkles, setSparkles] = useState(true);
  const [glitter, setGlitter] = useState(true);
  const [message, setMessage] = useState("Cosmetics are stored locally on this device.");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.skin?.data) setSkin(saved.skin);
      if (saved.cape?.data) setCape(saved.cape);
      if (["inferno", "void", "royal"].includes(saved.style)) setStyle(saved.style);
      setLogo(saved.logo !== false); setSparkles(saved.sparkles !== false); setGlitter(saved.glitter !== false);
    } catch { setMessage("Saved cosmetics could not be loaded; you can upload them again."); }
  }, []);
  function persist(next: Partial<{skin: SavedImage | null; cape: SavedImage | null; style: string; logo: boolean; sparkles: boolean; glitter: boolean}>) {
    const current = { skin, cape, style, logo, sparkles, glitter, ...next };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); setMessage("Saved on this device."); }
    catch { setMessage("Browser storage is full. Use a smaller PNG (under 2 MB) and try again."); }
  }
  function exportCapeTexture() {
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setMessage("Could not create cape artwork.");
    const colors = style === "void" ? ["#050509","#210714","#9e1235","#09070c"] : style === "royal" ? ["#09070b","#65152a","#d83d55","#17090d"] : ["#08080c","#4b0a1a","#ef334f","#09070b"];
    const gradient = ctx.createLinearGradient(0,0,64,32);
    gradient.addColorStop(0,colors[0]); gradient.addColorStop(.36,colors[1]); gradient.addColorStop(.58,colors[2]); gradient.addColorStop(1,colors[3]);
    ctx.fillStyle=gradient; ctx.fillRect(0,0,64,32);
    if(glitter){for(let i=0;i<150;i++){ctx.fillStyle=i%4===0?"#fff0f3":"#ff9bab";ctx.globalAlpha=.12+(i%5)*.09;ctx.fillRect((i*37+11)%64,(i*19+7)%32,1,1);}ctx.globalAlpha=1;}
    if(sparkles){ctx.fillStyle="#fff";for(const [x,y] of [[8,6],[53,5],[12,25],[55,23],[31,4],[43,28]]){ctx.fillRect(x-1,y,3,1);ctx.fillRect(x,y-1,1,3);}}
    if(logo){ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 22px Georgia";ctx.shadowColor="#ff3155";ctx.shadowBlur=8;ctx.fillStyle="#fff4f6";ctx.fillText("V",32,16);ctx.shadowBlur=0;}
    const link=document.createElement("a");link.href=canvas.toDataURL("image/png");link.download="vampire-client-cape-64x32.png";link.click();
    setMessage("Exported a real 64×32 cape texture PNG.");
  }
  async function upload(file: File | undefined, kind: "skin" | "cape") {
    if (!file) return;
    try {
      const image = await readPng(file, kind);
      if (kind === "skin") { setSkin(image); persist({ skin: image }); }
      else { setCape(image); persist({ cape: image }); }
      setMessage(kind === "skin" ? "Skin saved locally. Uploading it to your Minecraft account is not connected yet." : "Cape artwork saved locally for preview. Multiplayer delivery is not connected yet.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
  }
  return <section className="cosmetics-page">
    <div className="cosmetics-banner glass"><div><div className="eyebrow"><Sparkles size={14}/> VAMPIRE COSMETICS LAB</div><h2>Wear your identity.</h2><p>Upload your skin, design a signature cape and preview your black-and-crimson look.</p><div className="studio-tags"><span>HD PNG VALIDATION</span><span>LOCAL PREVIEW</span><span>VAMPIRE STYLE</span></div></div><div className={"cosmetic-cape cape-"+style}>{sparkles && <i className="cape-stars"/>}{glitter && <i className="cape-glitter"/>}{logo && <b>V</b>}<small>VAMPIRE</small></div></div>
    <div className="cosmetics-grid">
      <section className="panel glass"><div className="panel-title"><div><h3><UserRound size={17}/> Skin uploader</h3><p>Classic or slim skin texture PNG</p></div><ImagePlus size={18}/></div>
        <div className="skin-preview">{skin ? <img src={skin.data} alt="Uploaded Minecraft skin texture"/> : <div className="skin-empty"><UserRound size={38}/><span>No skin uploaded</span></div>}</div>
        <div className="cosmetic-meta">{skin ? <><b>{skin.name}</b><small>{skin.width} × {skin.height} PNG</small></> : <small>Supported: 64×64, 64×32, 128×128, 128×64</small>}</div>
        <label className="primary-button upload-button"><Upload size={15}/> Upload skin PNG<input type="file" accept="image/png" onChange={e=>{void upload(e.target.files?.[0],"skin");e.currentTarget.value="";}}/></label>
        <p className="muted">This validates and previews the skin texture. It does not yet change your official Minecraft profile or sync to other players.</p>
        {skin && <button className="secondary-button tiny" onClick={()=>{setSkin(null);persist({skin:null});}}>Remove local skin</button>}
      </section>
      <section className="panel glass"><div className="panel-title"><div><h3><Crown size={17}/> HD cape designer</h3><p>Black, red, glitter and the centered Vampire emblem</p></div><Palette size={18}/></div>
        {cape ? <div className="custom-cape-texture"><img src={cape.data} alt="Uploaded custom cape texture"/><span>{cape.width} × {cape.height} · {cape.name}</span></div> : <div className={"cape-large cape-"+style}>{sparkles && <i className="cape-stars"/>}{glitter && <i className="cape-glitter"/>}{logo && <b>V</b>}<small>VAMPIRE</small></div>}
        <div className="cape-options">{[{id:"inferno",label:"Inferno"},{id:"void",label:"Blood Void"},{id:"royal",label:"Royal Ember"}].map(item=><button key={item.id} className={"cape-choice "+(style===item.id?"selected":"")} onClick={()=>{setStyle(item.id);persist({style:item.id});}}>{item.label}</button>)}</div>
        <div className="setting-row"><div><b>Centered Vampire logo</b><small>Brand emblem on the cape</small></div><button className={logo?"toggle-on":"toggle-off"} onClick={()=>{setLogo(v=>{persist({logo:!v});return !v;});}}>{logo?"ON":"OFF"}</button></div>
        <div className="setting-row"><div><b>Sparkle effects</b><small>Star highlights on the preview</small></div><button className={sparkles?"toggle-on":"toggle-off"} onClick={()=>{setSparkles(v=>{persist({sparkles:!v});return !v;});}}>{sparkles?"ON":"OFF"}</button></div>
        <div className="setting-row"><div><b>Glitter finish</b><small>Metallic shimmer pattern</small></div><button className={glitter?"toggle-on":"toggle-off"} onClick={()=>{setGlitter(v=>{persist({glitter:!v});return !v;});}}>{glitter?"ON":"OFF"}</button></div>
        <div className="hero-buttons"><label className="primary-button upload-button"><Upload size={15}/> Upload custom cape PNG<input type="file" accept="image/png" onChange={e=>{void upload(e.target.files?.[0],"cape");e.currentTarget.value="";}}/></label><button className="secondary-button" onClick={exportCapeTexture}><Sparkles size={15}/> Export 64×32 cape PNG</button></div>
        {cape && <div className="cosmetic-meta"><b>{cape.name}</b><small>{cape.width} × {cape.height} PNG · local artwork preview saved</small><button className="secondary-button tiny" onClick={()=>{setCape(null);persist({cape:null});}}>Remove custom cape</button></div>}
        <p className="muted">Cape PNG format: 64×32 or 128×64. The uploaded texture is stored locally; this preview does not animate the actual in-game cape.</p>
      </section>
      <section className="panel glass"><div className="panel-title"><div><h3><Crown size={17}/> Cape collection</h3><p>Free client cosmetics and future premium drops</p></div><LockKeyhole size={18}/></div>
        <div className="collection-item"><div className="collection-swatch inferno-swatch">V</div><div><b>Vampire Inferno</b><small>Free · Vampire Client cosmetic concept</small></div><span className="pill">FREE</span></div>
        <div className="collection-item"><div className="collection-swatch void-swatch">V</div><div><b>Blood Void HD</b><small>Premium collection · purchase flow not connected</small></div><span className="pill locked">SOON</span></div>
        <div className="collection-item"><div className="collection-swatch royal-swatch">V</div><div><b>Royal Ember</b><small>Premium collection · purchase flow not connected</small></div><span className="pill locked">SOON</span></div>
        <div className="info-banner"><LockKeyhole size={16}/><span>Shared skins/capes need a hosted cosmetics API, account authentication and a compatible Minecraft server/mod delivery path. These local previews do not claim global visibility or paid ownership.</span></div>
      </section>
    </div>
    <p className="cosmetic-status" role="status">{message}</p>
  </section>;
}
