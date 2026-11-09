import test from "node:test";
import assert from "node:assert/strict";
import { isNewerVersion, summarizeLatestRelease, selectPlatformUpdateAsset } from "../electron/update-utils.ts";

test("compares stable and prerelease versions", () => {
  assert.equal(isNewerVersion("v0.4.0", "0.3.9"), true);
  assert.equal(isNewerVersion("0.3.0", "0.3.0"), false);
  assert.equal(isNewerVersion("0.3.0-beta.2", "0.3.0-beta.1"), true);
  assert.equal(isNewerVersion("0.3.0-beta.1", "0.3.0"), false);
  assert.equal(isNewerVersion("latest", "0.3.0"), false);
});

test("summarizes the official release and filters untrusted asset URLs", () => {
  const result = summarizeLatestRelease({
    tag_name: "v0.4.0",
    name: "Vampire Client 0.4.0",
    html_url: "https://github.com/Afzalplays/Vampire-Client/releases/tag/v0.4.0",
    published_at: "2026-11-09T00:00:00Z",
    body: "Release notes",
    assets: [
      { name: "VampireClient-Setup-0.4.0-x64.exe", browser_download_url: "https://github.com/Afzalplays/Vampire-Client/releases/download/v0.4.0/VampireClient-Setup-0.4.0-x64.exe", digest: "sha256:" + "a".repeat(64), size: 12345 },
      { name: "unsafe.exe", browser_download_url: "https://example.com/unsafe.exe" }
    ]
  }, "0.3.0");
  assert.equal(result.updateAvailable, true);
  assert.equal(result.latestVersion, "0.4.0");
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].sha256, "a".repeat(64));
  assert.equal(selectPlatformUpdateAsset(result.assets, "win32", "x64")?.name, "VampireClient-Setup-0.4.0-x64.exe");
});

test("does not advertise drafts, prereleases, malformed versions or foreign release pages", () => {
  assert.equal(summarizeLatestRelease({ draft: true, tag_name: "v0.4.0" }, "0.3.0").reason, "prerelease");
  assert.equal(summarizeLatestRelease({ tag_name: "nightly" }, "0.3.0").reason, "invalid-release");
  assert.throws(() => summarizeLatestRelease({
    tag_name: "v0.4.0", html_url: "https://evil.example/release"
  }, "0.3.0"), /unexpected release URL/);
});

test("selects only the platform-native release package", () => {
  const assets = [
    { name: "VampireClient-Setup-0.4.0-ia32.exe", downloadUrl: "https://github.com/Afzalplays/Vampire-Client/releases/download/v0.4.0/a", sha256: "a".repeat(64), size: 1 },
    { name: "VampireClient-Setup-0.4.0-x64.exe", downloadUrl: "https://github.com/Afzalplays/Vampire-Client/releases/download/v0.4.0/b", sha256: "b".repeat(64), size: 1 },
    { name: "VampireClient-0.4.0-mac-universal.dmg", downloadUrl: "https://github.com/Afzalplays/Vampire-Client/releases/download/v0.4.0/c", sha256: "c".repeat(64), size: 1 },
    { name: "VampireClient-0.4.0-linux-x64.AppImage", downloadUrl: "https://github.com/Afzalplays/Vampire-Client/releases/download/v0.4.0/d", sha256: "d".repeat(64), size: 1 }
  ];
  assert.equal(selectPlatformUpdateAsset(assets, "win32", "ia32")?.name, assets[0].name);
  assert.equal(selectPlatformUpdateAsset(assets, "win32", "x64")?.name, assets[1].name);
  assert.equal(selectPlatformUpdateAsset(assets, "darwin", "arm64")?.name, assets[2].name);
  assert.equal(selectPlatformUpdateAsset(assets, "linux", "x64")?.name, assets[3].name);
  assert.equal(selectPlatformUpdateAsset(assets, "linux", "arm64"), null);
});
