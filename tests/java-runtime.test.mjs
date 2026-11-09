import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { activateRuntimeDirectory, parseJavaMajorVersion, requiredJavaMajorForMinecraft } from "../electron/java-runtime.ts";

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

import { gzipSync } from "node:zlib";
import { extractTarGz } from "../electron/java-runtime.ts";

function tarHeader(name, size, type = "0") {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return header;
}

function paxRecord(key, value) {
  const body = key + "=" + value + "\n";
  let length = Buffer.byteLength(body) + 2;
  while (true) {
    const next = Buffer.byteLength(String(length) + " " + body);
    if (next === length) return Buffer.from(String(length) + " " + body);
    length = next;
  }
}

function makePaxMetadataArchive(metadata, headerType = "x", entryType = "0") {
  const file = Buffer.from("verified java archive fixture");
  const pad = data => Buffer.concat([data, Buffer.alloc((512 - data.length % 512) % 512)]);
  return gzipSync(Buffer.concat([
    tarHeader("PaxHeaders.0/file", metadata.length, headerType), pad(metadata),
    tarHeader("short-name.txt", entryType === "5" ? 0 : file.length, entryType), ...(entryType === "5" ? [] : [pad(file)]),
    Buffer.alloc(1024)
  ]));
}
function makePaxArchive(paxPath, entryType = "0") {
  return makePaxMetadataArchive(paxRecord("path", paxPath), "x", entryType);
}

test("extracts a valid PAX extended path from a Temurin-style TAR.GZ", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-pax-"));
  const nested = "runtime/" + "long-directory-name/".repeat(5) + "release-notes.txt";
  try {
    await extractTarGz(makePaxArchive(nested), root);
    assert.equal(await fs.readFile(path.join(root, nested), "utf8"), "verified java archive fixture");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects path traversal supplied by TAR PAX metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-pax-"));
  try {
    await assert.rejects(extractTarGz(makePaxArchive("../../escape.txt"), root), /path traversal|Unsafe runtime archive path/);
    await assert.rejects(fs.access(path.join(root, "escape.txt")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test("creates PAX-named directories without retaining a trailing separator", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-pax-dir-"));
  try {
    const directory = "runtime/" + "nested-folder/".repeat(4);
    await extractTarGz(makePaxArchive(directory, "5"), root);
    const stat = await fs.stat(path.join(root, directory));
    assert.equal(stat.isDirectory(), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test("rejects malformed PAX record lengths instead of interpreting them", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-pax-invalid-"));
  try {
    await assert.rejects(
      extractTarGz(makePaxMetadataArchive(Buffer.from("x path=runtime/file.txt\\n")), root),
      /Malformed TAR PAX record length/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects PAX link metadata and global path overrides", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-pax-invalid-"));
  try {
    const linkMetadata = paxRecord("linkpath", "../../outside");
    await assert.rejects(extractTarGz(makePaxMetadataArchive(linkMetadata), root), /link and sparse-file metadata/);
    const globalPath = paxRecord("path", "../../outside");
    await assert.rejects(extractTarGz(makePaxMetadataArchive(globalPath, "g"), root), /Global TAR path overrides/);
    await assert.rejects(fs.access(path.join(root, "outside")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects an archive ending with an unused PAX path header", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vampire-pax-invalid-"));
  try {
    const metadata = paxRecord("path", "runtime/orphan.txt");
    const pad = Buffer.concat([metadata, Buffer.alloc((512 - metadata.length % 512) % 512)]);
    const archive = gzipSync(Buffer.concat([tarHeader("PaxHeaders.0/orphan", metadata.length, "x"), pad, Buffer.alloc(1024)]));
    await assert.rejects(extractTarGz(archive, root), /ended after a PAX header/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("selects a compatible Temurin runtime for Minecraft version families", () => {
  assert.equal(requiredJavaMajorForMinecraft("1.16.5"), 8);
  assert.equal(requiredJavaMajorForMinecraft("1.17.1"), 17);
  assert.equal(requiredJavaMajorForMinecraft("1.20.4"), 17);
  assert.equal(requiredJavaMajorForMinecraft("1.20.5"), 21);
  assert.equal(requiredJavaMajorForMinecraft("1.21.1"), 21);
  assert.equal(requiredJavaMajorForMinecraft("invalid-version"), 21);
});
