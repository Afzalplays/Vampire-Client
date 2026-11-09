export type ModFile = { fileName: string; enabled: boolean };

export function scanModConflicts(files: ModFile[], loader = "fabric"): string[] {
  const names = files.filter(file => file.enabled).map(file => file.fileName.toLowerCase());
  const has = (pattern: RegExp) => names.some(name => pattern.test(name));
  const warnings: string[] = [];
  if (has(/sodium/) && has(/vulkanmod/)) warnings.push("Sodium and VulkanMod are both enabled; use one renderer at a time.");
  if (has(/optifine/) && has(/iris/)) warnings.push("OptiFine and Iris are both enabled; their rendering hooks may conflict.");
  if (has(/sodium/) && has(/rubidium|embeddium/)) warnings.push("Sodium and Rubidium/Embeddium are both enabled; avoid combining renderer replacements.");
  if (has(/lithium/) && has(/canary/)) warnings.push("Lithium and Canary overlap in game-logic optimizations and may conflict.");
  if (has(/embeddium/) && has(/rubidium/)) warnings.push("Embeddium and Rubidium are alternative renderer forks; do not install both.");
  if (loader === "fabric" && names.length && !has(/fabric-api/)) warnings.push("Fabric API was not detected by filename; some Fabric mods require it.");
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


export type DiagnosticFinding = { title: string; detail: string; severity: "error" | "warning" | "info" };

export function analyzeLauncherLog(log: string): DiagnosticFinding[] {
  if (!log.trim()) return [];
  const findings: DiagnosticFinding[] = [];
  const checks: Array<{ pattern: RegExp; finding: DiagnosticFinding }> = [
    { pattern: /OutOfMemoryError|Java heap space|GC overhead limit exceeded/i, finding: { title: "Java ran out of memory", detail: "Lower texture/render distance and close other apps. Increase allocated RAM only if the operating system has enough free memory; on a 4 GB PC, leave at least 1–1.5 GB for the OS.", severity: "error" } },
    { pattern: /UnsupportedClassVersionError|class file version .* newer/i, finding: { title: "Java version is too old", detail: "The game or a mod was compiled for a newer Java release. Check the Minecraft version's Java requirement and select a matching 64-bit runtime.", severity: "error" } },
    { pattern: /NoClassDefFoundError|ClassNotFoundException/i, finding: { title: "Missing class or dependency", detail: "A mod may be missing a required library, or a mod for another Minecraft version/loader may be installed. Check the first caused-by line and the mod's dependency list.", severity: "warning" } },
    { pattern: /Mixin apply failed|MixinApplyError|InvalidMixinException/i, finding: { title: "Mod mixin compatibility failure", detail: "One or more mods may be incompatible with this Minecraft version or another mod. Update the named mod, then test by disabling recently added mods one at a time.", severity: "warning" } },
    { pattern: /ModResolutionException|Incompatible mod set|requires .* but only/i, finding: { title: "Mod dependency or version mismatch", detail: "A mod's declared Minecraft, loader, or dependency requirement is not satisfied. Match installed mods to this exact game version and selected mod loader.", severity: "warning" } },
    { pattern: /GL_OUT_OF_MEMORY|OpenGL error|Failed to create .*context|Could not initialize GLFW/i, finding: { title: "Graphics initialization failed", detail: "Update the graphics driver, disable shader packs, and try the default renderer. On older integrated graphics, avoid VulkanMod and test with a supported OpenGL renderer.", severity: "warning" } },
    { pattern: /Unsupported Java.*architecture|wrong ELF class|%1 is not a valid Win32 application/i, finding: { title: "Java architecture does not match", detail: "Select a Java executable that matches the operating system architecture (normally 64-bit Java on 64-bit Windows).", severity: "error" } },
    { pattern: /Failed to download|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i, finding: { title: "Network download failed", detail: "Check the internet connection, proxy/firewall settings, and try again. A temporary upstream outage can also interrupt asset or mod downloads.", severity: "warning" } },
    { pattern: /Could not reserve enough space for .* object heap|Initial heap size set to a larger value than the maximum heap size/i, finding: { title: "Invalid Java memory allocation", detail: "The selected heap settings cannot be reserved. Reduce RAM allocation and ensure the initial heap does not exceed the maximum heap.", severity: "error" } }
  ];
  for (const check of checks) if (check.pattern.test(log)) findings.push(check.finding);
  if (/\b(fatal|exception|crash(?:ed)?)\b/i.test(log) && findings.length === 0) {
    findings.push({ title: "Unclassified game error", detail: "The log contains an exception or crash marker, but no known signature matched. Inspect the first exception and deepest 'Caused by' section; redact account/server details before sharing.", severity: "info" });
  }
  return findings;
}

export { redactDiagnosticLog } from "../../electron/log-redaction.ts";
