import test from "node:test";
import assert from "node:assert/strict";
import { isSafeResourcePackFilename } from "../electron/resource-pack-utils.ts";

test("accepts ordinary Minecraft resource-pack ZIP filenames", () => {
  assert.equal(isSafeResourcePackFilename("Vampire Pack.zip"), true);
  assert.equal(isSafeResourcePackFilename("faithful-32x-1.21.zip"), true);
});

test("rejects paths, unsafe characters and non-ZIP filenames", () => {
  for (const value of [
    "../escape.zip",
    "..\\escape.zip",
    "/tmp/pack.zip",
    "C:\\temp\\pack.zip",
    "pack.jar",
    "pack.zip/../other.zip",
    "bad:name.zip",
    "",
    "a".repeat(181) + ".zip",
    null,
    42
  ]) assert.equal(isSafeResourcePackFilename(value), false, String(value));
});
