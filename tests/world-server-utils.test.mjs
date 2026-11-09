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
 assert.equal(maxSafeWorldServerRamGB(8*gib,6.5*gib),5);
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
