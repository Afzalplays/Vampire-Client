/** Best-effort privacy filter for common credentials and machine/network identifiers. */
function isIPv6Literal(value: string): boolean {
  if (!/^[0-9a-f:]+$/i.test(value) || value.includes(":::")) return false;
  const compressed = value.includes("::");
  if (compressed && value.indexOf("::") !== value.lastIndexOf("::")) return false;
  const groups = value.split(":");
  const nonEmpty = groups.filter(Boolean);
  if (nonEmpty.some(group => group.length > 4)) return false;
  return compressed ? nonEmpty.length >= 2 && nonEmpty.length < 8 : groups.length === 8 && nonEmpty.length === 8;
}

export function redactDiagnosticLog(log: string): string {
  return log
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[JWT]")
    .replace(/((?:token|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|password|passwd)\s*[=:]\s*["']?)[^\s"',;&}]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:access_token|refresh_token|id_token|client_secret|api_key|code)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b[A-F0-9]{8}-[A-F0-9]{4}-[1-8][A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}\b/gi, "[UUID]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]")
    .replace(/([A-Za-z]:\\Users\\)[^\\\r\n]+/g, "$1[USER]")
    .replace(/(\/home\/)[^/\s]+/g, "$1[USER]")
    .replace(/(\/Users\/)[^/\s]+/g, "$1[USER]")
    .replace(/\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gi, "[MAC]")
    .replace(/[0-9a-f:]{2,}/gi, candidate => isIPv6Literal(candidate) ? "[IPV6]" : candidate)
    .replace(/([?&](?:client_id|device_code|code_verifier|state)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(\\\\[^\\\\]+\\\\)[^\\\\]+/g, "$1[USER]");
}
