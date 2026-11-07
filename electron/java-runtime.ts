import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync, inflateRawSync } from "node:zlib";

const MAX_ARCHIVE = 300 * 1024 * 1024;
const MAX_EXPANDED = 800 * 1024 * 1024;
const MAX_FILE = 128 * 1024 * 1024;
const MAX_ENTRIES = 20000;

function safeName(raw: string): string {
  const name = raw.replace(/\\/g, "/");
  if (!name || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("\0")) throw new Error("Unsafe runtime archive path.");
  const parts = name.split("/").filter((part, index, all) => !(part === "" && index === all.length - 1));
  if (!parts.length || parts.some(part => !part || part === "." || part === "..")) throw new Error("Runtime archive path traversal rejected.");
  return parts.join(path.sep);
}
async function writeEntry(root: string, name: string, data: Buffer, directory = false) {
  const target = path.resolve(root, safeName(name));
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Runtime archive path escaped its install folder.");
  if (directory) { await fs.mkdir(target, { recursive: true }); return; }
  if (data.length > MAX_FILE) throw new Error("Runtime archive file exceeds safety limit.");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data, { flag: "wx", mode: 0o755 });
}
async function extractZip(bytes: Buffer, root: string) {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if (eocd < Math.max(0,bytes.length-65557) || eocd < 0 || eocd+22 > bytes.length) throw new Error("Malformed Java ZIP archive.");
  const disk=bytes.readUInt16LE(eocd+4), cdDisk=bytes.readUInt16LE(eocd+6), count=bytes.readUInt16LE(eocd+10);
  const cdSize=bytes.readUInt32LE(eocd+12), cdOffset=bytes.readUInt32LE(eocd+16);
  if (disk || cdDisk || count===0xffff || cdSize===0xffffffff || cdOffset===0xffffffff || count>MAX_ENTRIES || cdOffset+cdSize>eocd) throw new Error("Unsupported ZIP64 or multi-disk Java archive.");
  let off=cdOffset, expanded=0;
  const entries:Array<{name:string;method:number;compressed:number;size:number;local:number;dir:boolean}>=[];
  for(let i=0;i<count;i++){
    if(off+46>bytes.length||bytes.readUInt32LE(off)!==0x02014b50) throw new Error("Malformed ZIP central directory.");
    const flags=bytes.readUInt16LE(off+8),method=bytes.readUInt16LE(off+10),compressed=bytes.readUInt32LE(off+20),size=bytes.readUInt32LE(off+24);
    const nl=bytes.readUInt16LE(off+28),el=bytes.readUInt16LE(off+30),cl=bytes.readUInt16LE(off+32),external=bytes.readUInt32LE(off+38),local=bytes.readUInt32LE(off+42);
    if(off+46+nl+el+cl>bytes.length||(flags&1)||![0,8].includes(method)||compressed===0xffffffff||size===0xffffffff) throw new Error("Encrypted or unsupported ZIP entry.");
    const raw=bytes.subarray(off+46,off+46+nl).toString("utf8");
    safeName(raw);
    if(((external>>>16)&0xf000)===0xa000) throw new Error("Runtime symbolic links are not accepted.");
    const dir=raw.endsWith("/");
    expanded+=size;
    if(size>MAX_FILE||expanded>MAX_EXPANDED||(compressed===0&&size>0)||(compressed>0&&size/compressed>250)) throw new Error("Runtime ZIP expansion limit exceeded.");
    entries.push({name:raw,method,compressed,size,local,dir});
    off+=46+nl+el+cl;
  }
  if(off!==cdOffset+cdSize) throw new Error("ZIP central directory size mismatch.");
  for(const e of entries){
    if(e.dir){await writeEntry(root,e.name,Buffer.alloc(0),true);continue;}
    const p=e.local;
    if(p+30>bytes.length||bytes.readUInt32LE(p)!==0x04034b50) throw new Error("Malformed ZIP local header.");
    const start=p+30+bytes.readUInt16LE(p+26)+bytes.readUInt16LE(p+28),end=start+e.compressed;
    if(end>bytes.length) throw new Error("Truncated ZIP file data.");
    const packed=bytes.subarray(start,end);
    const data=e.method===0?Buffer.from(packed):inflateRawSync(packed,{maxOutputLength:MAX_FILE});
    if(data.length!==e.size) throw new Error("ZIP entry size mismatch.");
    await writeEntry(root,e.name,data);
  }
}
async function extractTarGz(bytes: Buffer, root: string) {
  const tar=gunzipSync(bytes,{maxOutputLength:MAX_EXPANDED});
  let off=0,total=0,count=0;
  while(off+512<=tar.length){
    const h=tar.subarray(off,off+512);if(h.every(v=>v===0))break;
    const stored=parseInt(h.subarray(148,156).toString("ascii").replace(/\0.*$/,"").trim()||"0",8);
    let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];
    if(stored!==sum)throw new Error("Invalid TAR header checksum.");
    const field=(a:number,b:number)=>h.subarray(a,b).toString("utf8").replace(/\0.*$/,"");
    const name=field(0,100),prefix=field(345,500),full=prefix?prefix+"/"+name:name;
    const sizeText=field(124,136).trim(),size=sizeText?parseInt(sizeText,8):0,type=field(156,157)||"0";
    if(!Number.isSafeInteger(size)||size<0||size>MAX_FILE||++count>MAX_ENTRIES)throw new Error("Invalid TAR entry size/count.");
    if(!["0","\0","5"].includes(type))throw new Error("TAR links and special files are rejected.");
    total+=size;if(total>MAX_EXPANDED)throw new Error("TAR expanded size limit exceeded.");
    const start=off+512,end=start+size;if(end>tar.length)throw new Error("Truncated TAR entry.");
    if(type==="5")await writeEntry(root,full+"/",Buffer.alloc(0),true);
    else await writeEntry(root,full,Buffer.from(tar.subarray(start,end)));
    off=start+Math.ceil(size/512)*512;
  }
}
async function findJava(dir:string,depth=0):Promise<string|null>{
  if(depth>8)return null;
  for(const item of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory()){const found=await findJava(file,depth+1);if(found)return found;}
    else if(item.isFile()&&(item.name==="java"||item.name==="java.exe")){const stat=await fs.stat(file);if(stat.size>0&&stat.size<100*1024*1024)return file;}
  }
  return null;
}
function targetFor(os:string,arch:string){
  const platform=os==="win32"?"windows":os==="darwin"?"mac":os==="linux"?"linux":"";
  const architecture=arch==="x64"?"x64":arch==="arm64"?"aarch64":arch==="ia32"?"x86":"";
  if(!platform||!architecture||(platform==="windows"&&architecture==="aarch64")||(platform==="mac"&&architecture==="x86"))throw new Error("Java 21 auto-install is unavailable for this platform/architecture.");
  return {platform,architecture};
}

export function parseJavaMajorVersion(output: string): number {
  const version = output.match(/version\\s+["']([^"']+)["']/i)?.[1]
    || output.match(/\\bopenjdk\\s+(\\d+(?:\\.\\d+){0,2})/i)?.[1]
    || "";
  const legacy = version.match(/^1\\.(\\d+)/);
  const current = version.match(/^(\\d+)/);
  const major = Number(legacy?.[1] || current?.[1] || 0);
  if (!Number.isInteger(major) || major < 1) {
    throw new Error("Could not determine the selected Java version. Check the Java executable in Settings.");
  }
  return major;
}
\nexport async function installJava21Runtime(root:string,os:string,arch:string,onProgress?:(message:string)=>void){
  const target=targetFor(os,arch);
  const api=new URL("https://api.adoptium.net/v3/assets/latest/21/hotspot");
  api.search=new URLSearchParams({architecture:target.architecture,heap_size:"normal",image_type:"jre",jvm_impl:"hotspot",os:target.platform,vendor:"eclipse",page_size:"1"}).toString();
  onProgress?.("Finding official Eclipse Temurin Java 21…");
  const meta=await fetch(api);if(!meta.ok)throw new Error("Java metadata request failed ("+meta.status+").");
  const data=await meta.json() as any,asset=Array.isArray(data)?data[0]:null,pkg=asset?.binary?.package;
  if(!pkg?.link||!pkg?.checksum||!String(pkg.name||"").match(/\.(zip|tar\.gz)$/))throw new Error("No supported Temurin Java 21 JRE package was returned.");
  const url=new URL(String(pkg.link));
  const hosts=["github.com","githubusercontent.com","objects.githubusercontent.com","release-assets.githubusercontent.com"];
  if(url.protocol!=="https:"||!hosts.some(h=>url.hostname===h||url.hostname.endsWith("."+h)))throw new Error("Java download host rejected.");
  const declared=Number(pkg.size||0);if(declared>MAX_ARCHIVE)throw new Error("Java package exceeds 300 MB.");
  onProgress?.("Downloading Java 21 for "+target.platform+"/"+target.architecture+"…");
  const response=await fetch(url);if(!response.ok)throw new Error("Java download failed ("+response.status+").");
  const finalUrl=new URL(response.url);if(finalUrl.protocol!=="https:"||!hosts.some(h=>finalUrl.hostname===h||finalUrl.hostname.endsWith("."+h)))throw new Error("Java redirect host rejected.");
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.length||bytes.length>MAX_ARCHIVE||(declared>0&&bytes.length!==declared))throw new Error("Java package size verification failed.");
  const expected=String(pkg.checksum).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(expected)||createHash("sha256").update(bytes).digest("hex")!==expected)throw new Error("Java SHA-256 verification failed.");
  const destination=path.join(root,"java-runtime"),temporary=destination+".installing-"+Date.now();
  await fs.rm(temporary,{recursive:true,force:true});await fs.mkdir(temporary,{recursive:true});
  try{
    onProgress?.("SHA-256 verified. Safely extracting Java…");
    if(String(pkg.name).endsWith(".zip"))await extractZip(bytes,temporary);else await extractTarGz(bytes,temporary);
    const executable=await findJava(temporary);if(!executable)throw new Error("Java executable missing after extraction.");
    const relative=path.relative(temporary,executable);
    await fs.rm(destination,{recursive:true,force:true});await fs.rename(temporary,destination);
    const installed=path.join(destination,relative);if(os!=="win32")await fs.chmod(installed,0o755);
    onProgress?.("Java 21 installed.");
    return {success:true,executable:installed,version:"21",platform:os,architecture:arch};
  }catch(error){await fs.rm(temporary,{recursive:true,force:true});throw error;}
}
