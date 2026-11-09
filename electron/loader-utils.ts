export function selectQuiltLoaderVersion(payload: unknown): string {
  if (!Array.isArray(payload)) throw new Error("Quilt metadata did not return a loader list.");
  for (const item of payload) {
    const version = (item as { loader?: { version?: unknown } } | null)?.loader?.version;
    if (typeof version === "string" && /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(version)) return version;
  }
  throw new Error("No usable Quilt loader version is available for this Minecraft release.");
}
