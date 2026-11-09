export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseName?: string;
  publishedAt?: string;
  releaseNotes?: string;
  assets: Array<{ name: string; downloadUrl: string }>;
  reason?: "no-release" | "prerelease" | "invalid-release";
};

function parseVersion(value: string) {
  const match = /^v?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] || "" };
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate), installed = parseVersion(current);
  if (!next || !installed) return false;
  for (const key of ["major", "minor", "patch"] as const) {
    if (next[key] !== installed[key]) return next[key] > installed[key];
  }
  if (!next.prerelease && installed.prerelease) return true;
  if (next.prerelease && !installed.prerelease) return false;
  return next.prerelease !== installed.prerelease && next.prerelease.localeCompare(installed.prerelease, undefined, { numeric: true }) > 0;
}

export function summarizeLatestRelease(payload: unknown, currentVersion: string): UpdateCheckResult {
  const fallback = "https://github.com/Afzalplays/Vampire-Client/releases";
  const current = parseVersion(currentVersion);
  if (!current) throw new Error("The installed launcher version is invalid.");
  if (!payload || typeof payload !== "object") return { currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: fallback, assets: [], reason: "invalid-release" };
  const release = payload as Record<string, unknown>;
  if (release.draft === true || release.prerelease === true) return { currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: fallback, assets: [], reason: "prerelease" };
  const tag = typeof release.tag_name === "string" ? release.tag_name : "";
  const latest = parseVersion(tag);
  if (!latest) return { currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: fallback, assets: [], reason: "invalid-release" };
  const releaseUrl = typeof release.html_url === "string" ? new URL(release.html_url) : null;
  if (!releaseUrl || releaseUrl.protocol !== "https:" || releaseUrl.hostname !== "github.com" ||
      !releaseUrl.pathname.startsWith("/Afzalplays/Vampire-Client/releases/tag/")) {
    throw new Error("GitHub returned an unexpected release URL.");
  }
  const assets = Array.isArray(release.assets) ? release.assets.flatMap((asset: any) => {
    if (typeof asset?.name !== "string" || typeof asset?.browser_download_url !== "string") return [];
    try {
      const url = new URL(asset.browser_download_url);
      if (url.protocol !== "https:" || url.hostname !== "github.com" ||
          !url.pathname.startsWith("/Afzalplays/Vampire-Client/releases/download/")) return [];
      return [{ name: asset.name.slice(0, 180), downloadUrl: url.href }];
    } catch { return []; }
  }) : [];
  return {
    currentVersion,
    latestVersion: tag.replace(/^v/, ""),
    updateAvailable: isNewerVersion(tag, currentVersion),
    releaseUrl: releaseUrl.href,
    releaseName: typeof release.name === "string" ? release.name.slice(0, 180) : tag,
    publishedAt: typeof release.published_at === "string" ? release.published_at : undefined,
    releaseNotes: typeof release.body === "string" ? release.body.slice(0, 6000) : "",
    assets
  };
}
