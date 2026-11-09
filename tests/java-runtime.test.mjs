import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { activateRuntimeDirectory, parseJavaMajorVersion } from "../electron/java-runtime.ts";

test("activates a verified runtime and replaces the previous directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-java-"));
  try {
    const destination = path.join(root, "java-runtime");
    const temporary = path.join(root, "java-runtime.installing");
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, "old.txt"), "old runtime");
    await fs.mkdir(temporary);
    await fs.writeFile(path.join(temporary, "new.txt"), "new runtime");

    await activateRuntimeDirectory(temporary, destination);

    assert.equal(await fs.readFile(path.join(destination, "new.txt"), "utf8"), "new runtime");
    await assert.rejects(fs.access(path.join(destination, "old.txt")));
    await assert.rejects(fs.access(temporary));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("restores the previous runtime when activation fails", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-java-"));
  try {
    const destination = path.join(root, "java-runtime");
    const missingTemporary = path.join(root, "missing-install");
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, "keep.txt"), "working runtime");

    await assert.rejects(activateRuntimeDirectory(missingTemporary, destination));
    assert.equal(await fs.readFile(path.join(destination, "keep.txt"), "utf8"), "working runtime");
    const entries = await fs.readdir(root);
    assert.deepEqual(entries, ["java-runtime"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Java runtime parser still handles legacy and modern version output", () => {
  assert.equal(parseJavaMajorVersion('openjdk version "21.0.2" 2024-01-16'), 21);
  assert.equal(parseJavaMajorVersion('java version "1.8.0_402"'), 8);
  assert.equal(parseJavaMajorVersion('openjdk version "17.0.10" 2024-01-16'), 17);
});
