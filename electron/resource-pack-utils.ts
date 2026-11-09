export function isSafeResourcePackFilename(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._ -]{1,180}\.zip$/i.test(value);
}
