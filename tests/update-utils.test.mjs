import test from "node:test";
import assert from "node:assert/strict";
import { isNewerVersion, summarizeLatestRelease } from "../electron/update-utils.ts";

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
      { name: "VampireClient-Setup.exe", browser_download_url: "https://github.com/Afzalplays/Vampire-Client/releases/download/v0.4.0/VampireClient-Setup.exe" },
      { name: "unsafe.exe", browser_download_url: "https://example.com/unsafe.exe" }
    ]
  }, "0.3.0");
  assert.equal(result.updateAvailable, true);
  assert.equal(result.latestVersion, "0.4.0");
  assert.equal(result.assets.length, 1);
});

test("does not advertise drafts, prereleases, malformed versions or foreign release pages", () => {
  assert.equal(summarizeLatestRelease({ draft: true, tag_name: "v0.4.0" }, "0.3.0").reason, "prerelease");
  assert.equal(summarizeLatestRelease({ tag_name: "nightly" }, "0.3.0").reason, "invalid-release");
  assert.throws(() => summarizeLatestRelease({
    tag_name: "v0.4.0", html_url: "https://evil.example/release"
  }, "0.3.0"), /unexpected release URL/);
});
