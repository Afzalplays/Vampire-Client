export function selectQuiltLoaderVersion(payload: unknown): string {
  if (!Array.isArray(payload)) throw new Error("Quilt metadata did not return a loader list.");
  for (const item of payload) {
    const version = (item as { loader?: { version?: unknown } } | null)?.loader?.version;
    if (typeof version === "string" && /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(version)) return version;
  }
  throw new Error("No usable Quilt loader version is available for this Minecraft release.");
}

function readMavenVersions(xml: unknown): string[] {
  if (typeof xml !== "string" || xml.length > 5_000_000) throw new Error("Maven metadata is missing or too large.");
  const block = /<versions>([\s\S]*?)<\/versions>/i.exec(xml)?.[1];
  if (!block) throw new Error("Maven metadata does not contain a versions list.");
  return Array.from(block.matchAll(/<version>([^<]{1,120})<\/version>/gi), match => match[1].trim())
    .filter(version => /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,119}$/.test(version));
}

export function selectForgeVersion(xml: unknown, minecraftVersion: string): string {
  if (!/^1\.[0-9]+(?:\.[0-9]+)?$/.test(minecraftVersion)) throw new Error("Invalid Minecraft version for Forge.");
  const prefix = minecraftVersion + "-";
  const candidates = readMavenVersions(xml).filter(version => version.startsWith(prefix))
    .map(version => version.slice(prefix.length))
    .filter(version => version.length > 0 && !/(?:alpha|beta|rc)/i.test(version));
  if (!candidates.length) throw new Error("No stable Forge build is available for Minecraft " + minecraftVersion + ".");
  return candidates[candidates.length - 1];
}

export function selectNeoForgeVersion(xml: unknown, minecraftVersion: string): string {
  const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(minecraftVersion);
  const minecraftMinor = match ? Number(match[1]) : 0;
  const minecraftPatch = match ? Number(match[2] || 0) : 0;
  if (!match || minecraftMinor < 20 || (minecraftMinor === 20 && minecraftPatch < 2)) {
    throw new Error("NeoForge automatic installation requires Minecraft 1.20.2 or newer.");
  }
  const prefix = minecraftMinor + "." + minecraftPatch + ".";
  const candidates = readMavenVersions(xml).filter(version => version.startsWith(prefix) && !/(?:alpha|beta|rc)/i.test(version));
  if (!candidates.length) throw new Error("No stable NeoForge build is available for Minecraft " + minecraftVersion + ".");
  return candidates[candidates.length - 1];
}
