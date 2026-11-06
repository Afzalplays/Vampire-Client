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

export function extractLogIssueContext(log: string, radius = 2, maxLines = 120): string[] {
  const lines = log.split(/\r?\n/);
  const included = new Set<number>();
  for (let index = 0; index < lines.length; index++) {
    if (!/\b(error|exception|fatal|failed|crash)\b/i.test(lines[index])) continue;
    for (let line = Math.max(0, index - radius); line <= Math.min(lines.length - 1, index + radius); line++) included.add(line);
  }
  return [...included].sort((left, right) => left - right).slice(0, maxLines).map(index => String(index + 1).padStart(5, " ") + " | " + lines[index]);
}

export type LogIssueSummary = { errors: number; exceptions: number; fatal: number; crashes: number; failed: number };
export function summarizeLogIssues(log: string): LogIssueSummary {
  const summary: LogIssueSummary = { errors: 0, exceptions: 0, fatal: 0, crashes: 0, failed: 0 };
  for (const line of log.split(/\r?\n/)) {
    if (/\berror\b/i.test(line)) summary.errors++;
    if (/\bexception\b/i.test(line)) summary.exceptions++;
    if (/\bfatal\b/i.test(line)) summary.fatal++;
    if (/\bcrash(?:ed)?\b/i.test(line)) summary.crashes++;
    if (/\bfailed\b/i.test(line)) summary.failed++;
  }
  return summary;
}
