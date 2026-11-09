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
