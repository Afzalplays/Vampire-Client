import test from "node:test";
import assert from "node:assert/strict";
import { validateWorldServerPort, parseWorldServerPort } from "../electron/world-server-utils.ts";

test("validates configurable Minecraft server ports", () => {
  assert.equal(validateWorldServerPort(25565), 25565);
  assert.equal(validateWorldServerPort("30123"), 30123);
  for (const value of [0, 80, 1023, 65536, 25565.5, "not-a-port", null, undefined]) {
    assert.throws(() => validateWorldServerPort(value), /1024 to 65535/);
  }
});

test("reads a valid server-port property and safely falls back for malformed values", () => {
  assert.equal(parseWorldServerPort("motd=Test\nserver-port=25570\nonline-mode=true"), 25570);
  assert.equal(parseWorldServerPort("server-port=80", 25565), 25565);
  assert.equal(parseWorldServerPort("no-port-here", 25566), 25566);
});

import { maxSafeWorldServerRamGB, validateWorldServerRam } from "../electron/world-server-utils.ts";
test("calculates a conservative world server RAM cap from total and free memory", () => {
 const gib=1024*1024*1024;
 assert.equal(maxSafeWorldServerRamGB(4*gib,3.2*gib),2);
 assert.equal(maxSafeWorldServerRamGB(8*gib,6.5*gib),6);
 assert.equal(maxSafeWorldServerRamGB(32*gib,20*gib),16);
 assert.equal(maxSafeWorldServerRamGB(2*gib,1.5*gib),0);
 assert.equal(maxSafeWorldServerRamGB(Number.NaN,1),0);
});
test("rejects unsafe world server heap sizes", () => {
 const gib=1024*1024*1024;
 assert.equal(validateWorldServerRam(2,4*gib,3.2*gib),2);
 assert.throws(()=>validateWorldServerRam(3,4*gib,3.2*gib),/up to 2 GB/);
 assert.throws(()=>validateWorldServerRam(1,2*gib,1.5*gib),/Not enough currently available memory/);
 assert.throws(()=>validateWorldServerRam(1.5,8*gib,7*gib),/whole number/);
});

import { validateWorldServerArtifactUrl } from "../electron/world-server-utils.ts";

test("accepts only HTTPS Mojang artifact hosts without embedded credentials", () => {
  assert.equal(validateWorldServerArtifactUrl("https://piston-meta.mojang.com/meta.json", ["piston-meta.mojang.com"]).hostname, "piston-meta.mojang.com");
  for (const url of [
    "http://piston-meta.mojang.com/meta.json",
    "https://evil.example/payload",
    "https://user:pass@piston-meta.mojang.com/meta.json",
    "file:///etc/passwd"
  ]) assert.throws(() => validateWorldServerArtifactUrl(url, ["piston-meta.mojang.com"]));
});

import { analyzeWorldServerLog } from "../electron/world-server-utils.ts";
test("classifies common vanilla server startup failures with actionable guidance", () => {
  assert.equal(analyzeWorldServerLog("java.net.BindException: Address already in use")[0]?.title, "Server port is already in use");
  assert.equal(analyzeWorldServerLog("java.lang.OutOfMemoryError: Java heap space")[0]?.severity, "error");
  assert.match(analyzeWorldServerLog("You need to agree to the EULA")[0]?.detail || "", /EULA acceptance checkbox/);
  assert.equal(analyzeWorldServerLog("Unusual error happened")[0]?.title, "Unclassified server error");
  assert.deepEqual(analyzeWorldServerLog("Server started successfully"), []);
});

import { shouldAutoRestartWorldServer } from "../electron/world-server-utils.ts";
test("limits automatic world-server recovery to three unexpected exits per ten minutes", () => {
  const now = 1_000_000;
  assert.equal(shouldAutoRestartWorldServer(1, false, [], now), true);
  assert.equal(shouldAutoRestartWorldServer(0, false, [], now), false);
  assert.equal(shouldAutoRestartWorldServer(1, true, [], now), false);
  assert.equal(shouldAutoRestartWorldServer(1, false, [now - 1000, now - 2000, now - 3000], now), false);
  assert.equal(shouldAutoRestartWorldServer(1, false, [now - 700_000, now - 1000, now - 2000], now), true);
});
