export type ModFile = { fileName: string; enabled: boolean };

export function scanModConflicts(files: ModFile[]): string[] {
  const names = files.filter(file => file.enabled).map(file => file.fileName.toLowerCase());
  const has = (pattern: RegExp) => names.some(name => pattern.test(name));
  const warnings: string[] = [];
  if (has(/sodium/) && has(/vulkanmod/)) warnings.push("Sodium and VulkanMod are both enabled; use one renderer at a time.");
  if (has(/optifine/) && has(/iris/)) warnings.push("OptiFine and Iris are both enabled; their rendering hooks may conflict.");
  if (has(/sodium/) && has(/rubidium|embeddium/)) warnings.push("Sodium and Rubidium/Embeddium are both enabled; avoid combining renderer replacements.");
  if (has(/lithium/) && has(/canary/)) warnings.push("Lithium and Canary overlap in game-logic optimizations and may conflict.");
  if (names.length && !has(/fabric-api/)) warnings.push("Fabric API was not detected by filename; some Fabric mods require it.");
  return warnings;
}

export function extractLogIssues(log: string): string[] {
  return log.split(/\r?\n/).filter(line => /\b(error|exception|fatal|failed|crash)\b/i.test(line));
}
