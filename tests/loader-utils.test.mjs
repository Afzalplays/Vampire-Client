import test from "node:test";
import assert from "node:assert/strict";
import { selectQuiltLoaderVersion } from "../electron/loader-utils.ts";

test("selects the first valid Quilt loader version from official metadata", () => {
  assert.equal(selectQuiltLoaderVersion([
    { loader: { version: "0.27.1" } },
    { loader: { version: "0.26.0" } }
  ]), "0.27.1");
});

test("rejects malformed or missing Quilt loader metadata", () => {
  assert.throws(() => selectQuiltLoaderVersion({ loader: { version: "0.27.1" } }), /did not return a loader list/);
  assert.throws(() => selectQuiltLoaderVersion([{ loader: { version: "../evil" } }]), /No usable Quilt loader version/);
  assert.throws(() => selectQuiltLoaderVersion([]), /No usable Quilt loader version/);
});

import { selectForgeVersion, selectNeoForgeVersion } from "../electron/loader-utils.ts";

test("selects the newest stable Forge version for the requested Minecraft version", () => {
  const metadata = "<metadata><versioning><versions><version>1.20.1-47.2.0</version><version>1.20.1-47.3.0</version><version>1.20.1-47.4.0-beta</version><version>1.19.4-45.2.0</version></versions></versioning></metadata>";
  assert.equal(selectForgeVersion(metadata, "1.20.1"), "47.3.0");
});

test("rejects Forge metadata without a matching Minecraft build", () => {
  assert.throws(() => selectForgeVersion("<metadata><versioning><versions><version>1.19.4-45.2.0</version></versions></versioning></metadata>", "1.20.1"), /No stable Forge build/);
});

test("selects NeoForge builds using the Minecraft major/minor mapping", () => {
  const metadata = "<metadata><versioning><versions><version>20.2.88</version><version>20.4.250</version><version>21.1.219</version><version>21.1.220-beta</version></versions></versioning></metadata>";
  assert.equal(selectNeoForgeVersion(metadata, "1.21.1"), "21.1.219");
  assert.equal(selectNeoForgeVersion(metadata, "1.20.4"), "20.4.250");
});

test("rejects unsupported legacy NeoForge versions", () => {
  assert.throws(() => selectNeoForgeVersion("<metadata><versioning><versions><version>20.1.1</version></versions></versioning></metadata>", "1.20.1"), /1.20.2 or newer/);
});
