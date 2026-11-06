import { useRef, useState, type PointerEvent } from "react";

type Tool = "pencil" | "eraser" | "fill";
const size = 128;

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ -1) >>> 0;
}
function zipStore(files: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), crc = crc32(file.data), n = file.data.length;
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, n, true); h.setUint32(22, n, true); h.setUint16(26, name.length, true); head.set(name, 30);
    local.push(head, file.data);
    const dir = new Uint8Array(46 + name.length), d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true);
    d.setUint32(16, crc, true); d.setUint32(20, n, true); d.setUint32(24, n, true);
    d.setUint16(28, name.length, true); d.setUint32(42, offset, true); dir.set(name, 46);
    central.push(dir); offset += head.length + n;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const all = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) { all.set(part, cursor); cursor += part.length; }
  return all;
}
function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode PNG")), "image/png"));
}
function blobBytes(blob: Blob) { return blob.arrayBuffer().then(buffer => new Uint8Array(buffer)); }

export default function TexturePackEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [packName, setPackName] = useState("Vampire Custom Pack");
  const [description, setDescription] = useState("Created with Vampire Client Texture Studio");
  const [color, setColor] = useState("#FF526F");
  const [tool, setTool] = useState<Tool>("pencil");
  const [brush, setBrush] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [status, setStatus] = useState("Draw on the pixel canvas or import a PNG texture.");
  const [importName, setImportName] = useState("vampire_custom");
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState(2);
  const [category, setCategory] = useState("block");
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  function checkpoint() { const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return; undoStack.current.push(ctx.getImageData(0, 0, size, size)); if (undoStack.current.length > 40) undoStack.current.shift(); redoStack.current = []; setHistoryCount(undoStack.current.length); setRedoCount(0); }
  function undo() { const ctx = canvasRef.current?.getContext("2d"); if (!ctx || !undoStack.current.length) return; redoStack.current.push(ctx.getImageData(0, 0, size, size)); ctx.putImageData(undoStack.current.pop()!, 0, 0); setHistoryCount(undoStack.current.length); setRedoCount(redoStack.current.length); }
  function redo() { const ctx = canvasRef.current?.getContext("2d"); if (!ctx || !redoStack.current.length) return; undoStack.current.push(ctx.getImageData(0, 0, size, size)); ctx.putImageData(redoStack.current.pop()!, 0, 0); setHistoryCount(undoStack.current.length); setRedoCount(redoStack.current.length); }
  function exportPng() { const canvas = canvasRef.current; if (!canvas) return; const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = (importName || "vampire_texture") + ".png"; link.click(); setStatus("PNG texture exported."); }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(size - 1, Math.floor((event.clientX - rect.left) * size / rect.width))), y: Math.max(0, Math.min(size - 1, Math.floor((event.clientY - rect.top) * size / rect.height))) };
  }
  function paint(event: React.PointerEvent<HTMLCanvasElement>, start = false) {
    const canvas = canvasRef.current, p = point(event); if (!canvas || !p) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (tool === "fill" && start) {
      ctx.fillStyle = color; ctx.fillRect(0, 0, size, size); return;
    }
    ctx.fillStyle = tool === "eraser" ? "#00000000" : color;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.fillRect(p.x - Math.floor(brush / 2), p.y - Math.floor(brush / 2), brush, brush);
    ctx.globalCompositeOperation = "source-over";
  }
  function clear() {
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.clearRect(0, 0, size, size);
    setStatus("Canvas cleared.");
  }
  async function importPng(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus("Choose a PNG or image file.");
    const image = new Image();
    image.onload = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, size, size);
      setImportName(file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48) || "vampire_custom");
      setStatus("Imported " + file.name + " and scaled it to 128 × 128 pixels.");
    };
    image.onerror = () => setStatus("Could not read that image.");
    image.src = URL.createObjectURL(file);
  }
  async function exportPack() {
    const canvas = canvasRef.current; if (!canvas) return;
    try {
      const png = await blobBytes(await canvasBlob(canvas));
      const icon = document.createElement("canvas"); icon.width = 128; icon.height = 128;
      icon.getContext("2d")?.drawImage(canvas, 0, 0, 128, 128);
      const iconBytes = await blobBytes(await canvasBlob(icon));
      const textureName = importName.trim();
      if (!packName.trim()) throw new Error("Enter a pack name before exporting.");
      if (!/^[a-zA-Z0-9_]{1,48}$/.test(textureName)) throw new Error("Texture filename may contain only letters, numbers and underscores.");
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, size, size).data;
      if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) throw new Error("Canvas is empty. Draw or import a texture first.");
      const meta = new TextEncoder().encode(JSON.stringify({ pack: { pack_format: 34, description: description.slice(0, 256) } }, null, 2));
      const zip = zipStore([
        { name: "pack.mcmeta", data: meta },
        { name: "pack.png", data: iconBytes },
        { name: "assets/minecraft/textures/" + category + "/" + textureName + ".png", data: png }
      ]);
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const a = document.createElement("a"); a.href = url; a.download = (packName.trim() || "Vampire-Pack").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-") + ".zip";
      a.click(); URL.revokeObjectURL(url);
      setStatus("Resource pack ZIP exported. Add a block/model reference to use the custom texture in-game.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Export failed."); }
  }

  return <div className="texture-editor">
    <section className="panel glass">
      <div className="panel-title"><div><h3>Texture Pack Editor</h3><p>Pixel editor · PNG import · resource-pack ZIP export</p></div><span className="pill">128 × 128</span></div>
      <div className="field-row"><label>Pack name</label><input value={packName} maxLength={48} onChange={e=>setPackName(e.target.value)}/></div>
      <div className="field-row"><label>Description</label><input value={description} maxLength={256} onChange={e=>setDescription(e.target.value)}/></div>
      <div className="field-row"><label>Texture file name</label><input value={importName} maxLength={48} onChange={e=>setImportName(e.target.value.replace(/[^a-zA-Z0-9_]/g,"_"))}/></div>
      <div className="field-row"><label>Texture category</label><select value={category} onChange={e=>setCategory(e.target.value)}><option value="block">Block</option><option value="item">Item</option><option value="entity">Entity</option><option value="environment">Environment</option><option value="gui">GUI</option></select></div>
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(220px,1fr)",gap:18,alignItems:"start"}}>
        <div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {(["pencil","eraser","fill"] as Tool[]).map(item=><button key={item} className={tool===item?"primary-button compact":"secondary-button tiny"} onClick={()=>setTool(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}
            <button className="secondary-button tiny" onClick={undo} disabled={!historyCount}>Undo</button><button className="secondary-button tiny" onClick={redo} disabled={!redoCount}>Redo</button><button className="secondary-button tiny" onClick={clear}>Clear</button>
          </div>
          <canvas ref={canvasRef} width={size} height={size} style={{width:`${210 * zoom}px`,maxWidth:"none",aspectRatio:"1",backgroundColor:"#17131b",backgroundImage:grid?"linear-gradient(45deg,#29232e 25%,transparent 25%),linear-gradient(-45deg,#29232e 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#29232e 75%),linear-gradient(-45deg,transparent 75%,#29232e 75%)":undefined,backgroundSize:grid?"16px 16px":undefined,backgroundPosition:grid?"0 0,0 8px,8px -8px,-8px 0":undefined,imageRendering:"pixelated",border:"1px solid #66515e",borderRadius:12,touchAction:"none",cursor:"crosshair"}}
            onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);if(tool!=="fill")checkpoint();setDrawing(true);paint(e,true);}}
            onPointerMove={e=>{if(drawing)paint(e);}} onPointerUp={()=>setDrawing(false)} onPointerCancel={()=>setDrawing(false)}/>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:10}}>
            <label style={{display:"flex",gap:7,alignItems:"center"}}>Color <input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
            <label style={{display:"flex",gap:7,alignItems:"center"}}>Brush <input type="range" min="1" max="16" value={brush} onChange={e=>setBrush(Number(e.target.value))}/>{brush}px</label>
            <label style={{display:"flex",gap:7,alignItems:"center"}}>Zoom <input type="range" min="1" max="4" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/>{zoom}×</label>
            <label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/> Pixel grid</label>
          </div>
        </div>
        <div>
          <div className="eyebrow">TEXTURE TOOLS</div>
          <p className="muted">Import any PNG or image and scale it to 128 × 128. Pencil, eraser and fill tools edit the actual pixel canvas.</p>
          <label className="secondary-button" style={{display:"inline-flex",cursor:"pointer"}}>Import PNG<input type="file" accept="image/png,image/*" hidden onChange={e=>void importPng(e.target.files?.[0])}/></label>
          <div style={{height:12}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary-button" onClick={exportPng}>Export PNG</button><button className="primary-button" onClick={()=>void exportPack()}>Export resource pack ZIP</button></div>
          <p className="muted" style={{marginTop:12}}>Exports pack.mcmeta, pack.png and your texture at assets/minecraft/textures/block/. This creates a valid starter pack; a block/model or item definition must reference the texture for it to appear in-game.</p>
          <div className="info-banner">{status}</div>
        </div>
      </div>
    </section>
  </div>;
}
