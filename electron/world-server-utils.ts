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
