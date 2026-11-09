import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gunzipSync, inflateRawSync } from "node:zlib";

const execFileAsync = promisify(execFile);
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
function parsePaxRecords(data: Buffer): Map<string, string> {
  const records = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) throw new Error("Malformed TAR PAX record length.");
    const lengthText = data.subarray(offset, space).toString("ascii");
    if (!/^\d+$/.test(lengthText)) throw new Error("Malformed TAR PAX record length.");
    const length = Number(lengthText);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || length <= space - offset + 3 || end > data.length || data[end - 1] !== 0x0a) {
      throw new Error("Malformed TAR PAX record.");
    }
    const record = data.subarray(space + 1, end - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals <= 0) throw new Error("Malformed TAR PAX key/value.");
    records.set(record.slice(0, equals), record.slice(equals + 1));
    offset = end;
  }
  return records;
}

export async function extractTarGz(bytes: Buffer, root: string) {
  const tar=gunzipSync(bytes,{maxOutputLength:MAX_EXPANDED});
  let off=0,total=0,count=0,pendingPath:string|null=null;
  while(off+512<=tar.length){
    const h=tar.subarray(off,off+512);if(h.every(v=>v===0))break;
    const stored=parseInt(h.subarray(148,156).toString("ascii").replace(/\0.*$/,"").trim()||"0",8);
    let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];
    if(stored!==sum)throw new Error("Invalid TAR header checksum.");
    const field=(a:number,b:number)=>h.subarray(a,b).toString("utf8").replace(/\0.*$/,"");
    const name=field(0,100),prefix=field(345,500),headerName=prefix?prefix+"/"+name:name;
    const sizeText=field(124,136).trim(),size=sizeText?parseInt(sizeText,8):0,type=field(156,157)||"0";
    if(!Number.isSafeInteger(size)||size<0||size>MAX_FILE||++count>MAX_ENTRIES)throw new Error("Invalid TAR entry size/count.");
    const start=off+512,end=start+size;if(end>tar.length)throw new Error("Truncated TAR entry.");
    const payload=tar.subarray(start,end);
    if(type==="x"||type==="g"){
      const records=parsePaxRecords(payload);
      if(records.has("linkpath")||records.has("GNU.sparse.name"))throw new Error("TAR link and sparse-file metadata are rejected.");
      if(records.has("size")&&Number(records.get("size"))!==size)throw new Error("TAR PAX size overrides are not supported.");
      if(type==="g"&&records.has("path"))throw new Error("Global TAR path overrides are not supported.");
      if(type==="x")pendingPath=records.get("path")||null;
      off=start+Math.ceil(size/512)*512;
      continue;
    }
    if(!["0","\0","5"].includes(type))throw new Error("TAR links and special files are rejected.");
    total+=size;if(total>MAX_EXPANDED)throw new Error("TAR expanded size limit exceeded.");
    const full=pendingPath||headerName;pendingPath=null;
    if(type==="5")await writeEntry(root,full.replace(/\/$/,"")+"/",Buffer.alloc(0),true);
    else await writeEntry(root,full,Buffer.from(payload));
    off=start+Math.ceil(size/512)*512;
  }
  if(pendingPath)throw new Error("TAR archive ended after a PAX header without its file entry.");
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
  if(!platform||!architecture||(platform==="windows"&&architecture==="aarch64")||(platform==="mac"&&architecture==="x86"))throw new Error("Automatic Java installation is unavailable for this platform/architecture.");
  return {platform,architecture};
}

export function parseJavaMajorVersion(output: string): number {
  const version = output.match(/version\s+["']([^"']+)["']/i)?.[1]
    || output.match(/\bopenjdk\s+(\d+(?:\.\d+){0,2})/i)?.[1]
    || "";
  const legacy = version.match(/^1\.(\d+)/);
  const current = version.match(/^(\d+)/);
  const major = Number(legacy?.[1] || current?.[1] || 0);
  if (!Number.isInteger(major) || major < 1) throw new Error("Could not determine the selected Java version. Check the Java executable in Settings.");
  return major;
}

const TEMURIN_DOWNLOAD_HOSTS = ["github.com", "githubusercontent.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];
function assertTemurinDownloadUrl(url: URL) {
  if (url.protocol !== "https:" || !TEMURIN_DOWNLOAD_HOSTS.some(host => url.hostname === host || url.hostname.endsWith("." + host))) {
    throw new Error("Java download host rejected.");
  }
}
async function fetchTemurinPackage(initialUrl: URL): Promise<Response> {
  let url = initialUrl;
  for (let redirect = 0; redirect <= 5; redirect++) {
    assertTemurinDownloadUrl(url);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 5) throw new Error("Java download returned too many or invalid redirects.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error("Java download failed (" + response.status + ").");
    assertTemurinDownloadUrl(new URL(response.url || url.href));
    return response;
  }
  throw new Error("Java download redirect limit exceeded.");
}
async function readLimitedResponse(response: Response, declaredSize: number): Promise<Buffer> {
  const headerSize = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(headerSize) && headerSize > MAX_ARCHIVE) throw new Error("Java package exceeds 300 MB.");
  if (declaredSize > 0 && headerSize > 0 && headerSize !== declaredSize) throw new Error("Java package size metadata does not match the download.");
  if (!response.body) throw new Error("Java download returned an empty response body.");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > MAX_ARCHIVE || (declaredSize > 0 && total > declaredSize)) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Java package exceeded its declared download size.");
      }
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  if (!total || (declaredSize > 0 && total !== declaredSize)) throw new Error("Java package size verification failed.");
  return Buffer.concat(chunks, total);
}
async function verifyJavaExecutable(executable: string, expectedMajor: number): Promise<void> {
  let output = "";
  try {
    const result = await execFileAsync(executable, ["-version"], { timeout: 15_000, windowsHide: true, cwd: path.dirname(executable), maxBuffer: 64 * 1024 });
    output = String(result.stderr || "") + "\n" + String(result.stdout || "");
  } catch (error: any) {
    const detail = String(error?.stderr || error?.stdout || error?.message || "").trim().slice(0, 300);
    throw new Error("The downloaded Java runtime failed its startup check." + (detail ? " " + detail : ""));
  }
  const major = parseJavaMajorVersion(output);
  if (major !== expectedMajor) throw new Error("The downloaded runtime reported Java " + major + "; Java " + expectedMajor + " was expected.");
}

export async function activateRuntimeDirectory(temporary: string, destination: string): Promise<void> {
  const backup = destination + ".previous-" + randomUUID();
  let previousRuntimeMoved = false;
  try {
    try { await fs.rename(destination, backup); previousRuntimeMoved = true; }
    catch (error: any) { if (error?.code !== "ENOENT") throw error; }
    await fs.rename(temporary, destination);
  } catch (error) {
    if (previousRuntimeMoved) {
      try { await fs.rename(backup, destination); }
      catch (restoreError: any) {
        throw new Error("Could not activate the new Java runtime and could not restore the previous runtime. Previous files remain at " + backup + ". Original error: " + String((error as Error)?.message || error) + ". Restore error: " + String(restoreError?.message || restoreError));
      }
    }
    throw error;
  }
  if (previousRuntimeMoved) await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
}

export function requiredJavaMajorForMinecraft(version: string): number {
  const match = /^1\.(\d+)(?:\.(\d+))?/.exec(String(version || ""));
  if (!match) return 21;
  const minor = Number(match[1]);
  const patch = Number(match[2] || 0);
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 17) return 17;
  return 8;
}

export async function installJavaRuntime(root:string,os:string,arch:string,major:number,onProgress?:(message:string)=>void){
  if (![8,17,21,25].includes(major)) throw new Error("Supported automatic Java runtimes are Java 8, 17, 21 and 25.");
  const target=targetFor(os,arch);
  const api=new URL("https://api.adoptium.net/v3/assets/latest/"+major+"/hotspot");
  api.search=new URLSearchParams({architecture:target.architecture,heap_size:"normal",image_type:"jre",jvm_impl:"hotspot",os:target.platform,vendor:"eclipse",page_size:"1"}).toString();
  onProgress?.("Finding official Eclipse Temurin Java "+major+"…");
  const meta=await fetch(api,{redirect:"error",signal:AbortSignal.timeout(15_000),headers:{accept:"application/json"}});
  if(!meta.ok)throw new Error("Java metadata request failed ("+meta.status+").");
  const metadataText=await meta.text();
  if(metadataText.length>1024*1024)throw new Error("Java metadata response is unexpectedly large.");
  let data:any;
  try{data=JSON.parse(metadataText);}catch{throw new Error("Java metadata response was not valid JSON.");}
  const asset=Array.isArray(data)?data[0]:null,pkg=asset?.binary?.package;
  const packageName=String(pkg?.name||"");
  if(typeof pkg?.link!=="string"||typeof pkg?.checksum!=="string"||! /\.(zip|tar\.gz)$/i.test(packageName))throw new Error("No supported Temurin Java "+major+" JRE package was returned.");
  const url=new URL(pkg.link);
  assertTemurinDownloadUrl(url);
  const declared=Number(pkg.size||0);
  if(!Number.isSafeInteger(declared)||declared<=0||declared>MAX_ARCHIVE)throw new Error("Java package size is missing or exceeds 300 MB.");
  const expected=String(pkg.checksum).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(expected))throw new Error("Java package checksum metadata is invalid.");
  onProgress?.("Downloading Java "+major+" for "+target.platform+"/"+target.architecture+"…");
  const response=await fetchTemurinPackage(url);
  const bytes=await readLimitedResponse(response,declared);
  if(createHash("sha256").update(bytes).digest("hex")!==expected)throw new Error("Java SHA-256 verification failed.");
  const destination=path.join(root,"java-runtime-"+major);
  const temporary=destination+".installing-"+randomUUID();
  await fs.mkdir(root,{recursive:true});
  await fs.mkdir(temporary,{recursive:true});
  try{
    onProgress?.("SHA-256 verified. Safely extracting Java…");
    if(packageName.toLowerCase().endsWith(".zip"))await extractZip(bytes,temporary);else await extractTarGz(bytes,temporary);
    const executable=await findJava(temporary);
    if(!executable)throw new Error("Java executable missing after extraction.");
    if(os!=="win32")await fs.chmod(executable,0o755);
    onProgress?.("Checking the extracted Java runtime…");
    await verifyJavaExecutable(executable, major);
    const relative=path.relative(temporary,executable);
    await activateRuntimeDirectory(temporary,destination);
    const installed=path.join(destination,relative);
    onProgress?.("Java "+major+" installed and startup-verified.");
    return {success:true,executable:installed,version:String(major),platform:os,architecture:arch};
  }catch(error){
    await fs.rm(temporary,{recursive:true,force:true});
    throw error;
  }
}

export async function installJava21Runtime(root:string,os:string,arch:string,onProgress?:(message:string)=>void){
  return installJavaRuntime(root,os,arch,21,onProgress);
}
