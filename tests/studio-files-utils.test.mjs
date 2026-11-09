import test from "node:test";
import assert from "node:assert/strict";
import { getStudioFilePolicy, isSafeStudioFileName, sanitizeStudioImportName, validateStudioFileSize } from "../electron/studio-files-utils.ts";

test("allows only supported schematic and Replay Mod file extensions", () => {
  assert.equal(isSafeStudioFileName("schematics", "castle.litematic"), true);
  assert.equal(isSafeStudioFileName("schematics", "build.schem"), true);
  assert.equal(isSafeStudioFileName("schematics", "world.nbt"), true);
  assert.equal(isSafeStudioFileName("replays", "session.mcpr"), true);
  assert.equal(isSafeStudioFileName("schematics", "session.mcpr"), false);
  assert.equal(isSafeStudioFileName("replays", "build.schem"), false);
  assert.equal(isSafeStudioFileName("schematics", "../escape.litematic"), false);
  assert.equal(isSafeStudioFileName("replays", ".hidden.mcpr"), false);
  assert.throws(() => getStudioFilePolicy("unknown"));
});

test("sanitizes imported names and enforces category-specific size limits", () => {
  assert.equal(sanitizeStudioImportName("schematics", "C:\\Downloads\\My Build!.litematic"), "My Build_.litematic");
  assert.equal(sanitizeStudioImportName("replays", "recording.MCPR"), "recording.mcpr");
  assert.throws(() => sanitizeStudioImportName("replays", "image.png"));
  assert.equal(validateStudioFileSize("schematics", 1024), 1024);
  assert.equal(validateStudioFileSize("replays", 1024), 1024);
  assert.throws(() => validateStudioFileSize("schematics", 129 * 1024 * 1024), /128 MB/);
  assert.throws(() => validateStudioFileSize("replays", 2 * 1024 * 1024 * 1024 + 1), /2 GB/);
});
