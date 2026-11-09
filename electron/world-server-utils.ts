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
  return Math.max(0, Math.min(16, Math.floor((totalBytes - 2 * GIB) / GIB), Math.floor((freeBytes - GIB) / GIB)));
}
export function validateWorldServerRam(value: unknown, totalBytes: number, freeBytes: number): number {
  const ram = Number(value);
  if (!Number.isInteger(ram) || ram < 1 || ram > 16) throw new Error("World server RAM must be a whole number from 1 to 16 GB.");
  const maximum = maxSafeWorldServerRamGB(totalBytes, freeBytes);
  if (maximum < 1) throw new Error("Not enough currently available memory to safely host a Minecraft server. Close other apps or use a PC with more RAM.");
  if (ram > maximum) throw new Error("This PC can safely allocate up to " + maximum + " GB right now. At least 2 GB is reserved for the operating system and 1 GB of free memory is kept available.");
  return ram;
}
