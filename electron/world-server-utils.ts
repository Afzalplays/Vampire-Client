export function validateWorldServerPort(value: unknown): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Server port must be a whole number from 1024 to 65535.");
  }
  return port;
}

export function parseWorldServerPort(properties: string, fallback = 25565): number {
  const match = /^server-port=(\d+)$/m.exec(String(properties || ""));
  if (!match) return fallback;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback;
}

const GIB = 1024 * 1024 * 1024;
export function maxSafeWorldServerRamGB(totalBytes: number, freeBytes: number): number {
  if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes) || totalBytes <= 0 || freeBytes < 0) return 0;
  return Math.max(0, Math.min(16, Math.floor((totalBytes - 2 * GIB) / GIB), Math.floor((freeBytes - 0.5 * GIB) / GIB)));
}
export function validateWorldServerRam(value: unknown, totalBytes: number, freeBytes: number): number {
  const ram = Number(value);
  if (!Number.isInteger(ram) || ram < 1 || ram > 16) throw new Error("World server RAM must be a whole number from 1 to 16 GB.");
  const maximum = maxSafeWorldServerRamGB(totalBytes, freeBytes);
  if (maximum < 1) throw new Error("Not enough currently available memory to safely host a Minecraft server. Close other apps or use a PC with more RAM.");
  if (ram > maximum) throw new Error("This PC can safely allocate up to " + maximum + " GB right now. At least 2 GB is reserved for the operating system and 512 MB of free memory is kept available.");
  return ram;
}

export function validateWorldServerArtifactUrl(value: string, allowedHosts: string[]): URL {
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new Error("Invalid official Minecraft server artifact URL."); }
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error("Minecraft server download host was rejected.");
  }
  return url;
}

export type WorldServerDiagnostic = { title: string; detail: string; severity: "error" | "warning" | "info" };
export function analyzeWorldServerLog(log: string): WorldServerDiagnostic[] {
  if (!String(log || "").trim()) return [];
  const checks: Array<{ pattern: RegExp; finding: WorldServerDiagnostic }> = [
    { pattern: /Address already in use|Failed to bind to port|Perhaps a server is already running/i, finding: { title: "Server port is already in use", detail: "Stop the other Minecraft server or application using this TCP port, then change this server's port in Vampire Client.", severity: "error" } },
    { pattern: /OutOfMemoryError|Could not reserve enough space for object heap|Java heap space/i, finding: { title: "Server ran out of memory", detail: "Lower the server heap allocation and close other applications. Keep memory available for the operating system and Minecraft server overhead.", severity: "error" } },
    { pattern: /UnsupportedClassVersionError|class file version .* newer/i, finding: { title: "Server requires a newer Java version", detail: "Install or select a Java runtime compatible with this Minecraft server version, then try starting it again.", severity: "error" } },
    { pattern: /You need to agree to the EULA|eula\.txt/i, finding: { title: "Minecraft EULA has not been accepted", detail: "Read the official Minecraft EULA and tick the EULA acceptance checkbox in Vampire Client before starting the server.", severity: "warning" } },
    { pattern: /Exception in server tick loop|Encountered an unexpected exception|Failed to start the minecraft server/i, finding: { title: "Minecraft server startup/runtime exception", detail: "Inspect the first exception and its deepest 'Caused by' section in the server console. Remove recently added server files or change the server version if needed.", severity: "warning" } }
  ];
  const findings = checks.filter(check => check.pattern.test(log)).map(check => check.finding);
  if (/\b(exception|fatal|error)\b/i.test(log) && findings.length === 0) {
    findings.push({ title: "Unclassified server error", detail: "The server log contains an error marker without a known signature. Review the surrounding console output and the full server.log file.", severity: "info" });
  }
  return findings;
}

export function shouldAutoRestartWorldServer(exitCode: number | null, manualStop: boolean, attempts: number[], now = Date.now()): boolean {
  if (manualStop || exitCode === 0) return false;
  return attempts.filter(at => Number.isFinite(at) && now - at >= 0 && now - at < 10 * 60_000).length < 3;
}
