export type StudioFileKind = "schematics" | "replays";

const policies = {
  schematics: { folder: "schematics", extensions: [".litematic", ".schem", ".schematic", ".nbt"], maxBytes: 128 * 1024 * 1024 },
  replays: { folder: "replay_recordings", extensions: [".mcpr"], maxBytes: 2 * 1024 * 1024 * 1024 }
} as const;

export function getStudioFilePolicy(kind: string) {
  if (kind !== "schematics" && kind !== "replays") throw new Error("Unknown Studio file category.");
  return policies[kind];
}

export function isSafeStudioFileName(kind: string, fileName: string): boolean {
  const policy = getStudioFilePolicy(kind);
  const name = String(fileName || "");
  if (!name || name.length > 180 || name.startsWith(".") || /[\\/]/.test(name) || !/^[A-Za-z0-9._ ()-]+$/.test(name)) return false;
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return policy.extensions.includes(extension as never);
}

export function validateStudioFileSize(kind: string, bytes: number): number {
  const policy = getStudioFilePolicy(kind);
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > policy.maxBytes) {
    throw new Error(kind === "replays" ? "Replay files must be between 1 byte and 2 GB." : "Schematic files must be between 1 byte and 128 MB.");
  }
  return bytes;
}

export function sanitizeStudioImportName(kind: string, sourceName: string): string {
  const policy = getStudioFilePolicy(kind);
  const leaf = String(sourceName || "").replace(/\\/g, "/").split("/").pop() || "";
  const extension = leaf.slice(leaf.lastIndexOf(".")).toLowerCase();
  if (!policy.extensions.includes(extension as never)) throw new Error("This file type is not supported for " + kind + ".");
  const stem = leaf.slice(0, leaf.length - extension.length).replace(/[^A-Za-z0-9._ ()-]/g, "_").replace(/^[. ]+/, "").trim().slice(0, 150) || "Imported";
  const result = stem + extension;
  if (!isSafeStudioFileName(kind, result)) throw new Error("The selected filename is not safe.");
  return result;
}
