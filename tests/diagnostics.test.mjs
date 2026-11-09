import test from "node:test";
import assert from "node:assert/strict";
import { analyzeLauncherLog, extractLogIssues, extractLogIssueContext, redactDiagnosticLog, scanModConflicts, summarizeLogIssues } from "../src/features/diagnostics.ts";

test("redacts credentials, JWTs, emails, UUIDs, IPs and home paths", () => {
  const input = [
    "Authorization: Bearer secret-header-value-123456",
    "token=super-secret-value",
    "Bearer generic-secret-token-123456",
    "eyJabcdefghijk.abcdefghijk.abcdefghijk",
    "contact user@example.com",
    "profile 123e4567-e89b-42d3-a456-426614174000",
    "server 192.168.1.25",
    "path C:\\Users\\Afzal\\AppData\\Roaming",
    "path /home/afzal/.minecraft",
    "path /Users/afzal/Library"
  ].join("\n");
  const output = redactDiagnosticLog(input);
  for (const secret of ["secret-header-value-123456", "super-secret-value", "generic-secret-token-123456", "user@example.com", "123e4567-e89b-42d3-a456-426614174000", "192.168.1.25", "Afzal", "afzal"]) {
    assert.equal(output.includes(secret), false, "leaked: " + secret);
  }
  assert.match(output, /\[REDACTED\]/);
  assert.match(output, /\[JWT\]/);
});

test("keeps useful non-sensitive diagnostics readable", () => {
  const output = redactDiagnosticLog("Minecraft launch failed: Java heap space");
  assert.match(output, /Minecraft launch failed/);
  assert.match(output, /Java heap space/);
});

test("detects common crash signatures", () => {
  const findings = analyzeLauncherLog("java.lang.OutOfMemoryError: Java heap space");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].title, "Java ran out of memory");
});

test("extracts issue lines and nearby context", () => {
  const log = "start\nloading\nException: broken\ncaused by\nend";
  assert.deepEqual(extractLogIssues(log), ["Exception: broken"]);
  assert.deepEqual(extractLogIssueContext(log, 1), ["    2 | loading", "    3 | Exception: broken", "    4 | caused by"]);
});

test("summarizes issue markers by line", () => {
  assert.deepEqual(summarizeLogIssues("error exception\nfatal crash failed\nfailed"), {
    errors: 1, exceptions: 1, fatal: 1, crashes: 1, failed: 2
  });
});

test("warns when mutually exclusive renderers are enabled", () => {
  const warnings = scanModConflicts([
    { fileName: "sodium.jar", enabled: true },
    { fileName: "vulkanmod.jar", enabled: true },
    { fileName: "fabric-api.jar", enabled: true }
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /one renderer at a time/);
});

test("redacts MAC, complete IPv6 addresses and OAuth query credentials", () => {
  const input = "adapter 00:1A:2B:3C:4D:5E host 2001:db8:85a3::8a2e:370:7334 ?device_code=private-device-code&client_id=public-id";
  const output = redactDiagnosticLog(input);
  for (const secret of [
    "00:1A:2B:3C:4D:5E",
    "2001:db8:85a3::8a2e:370:7334",
    "2001:db8",
    "8a2e:370:7334",
    "private-device-code"
  ]) {
    assert.equal(output.includes(secret), false, "leaked: " + secret);
  }
  assert.ok(output.includes("[MAC]"));
  assert.ok(output.includes("[IPV6]"));
  assert.ok(output.includes("device_code=[REDACTED]"));
});

import { parseJavaMajorVersion } from "../electron/java-runtime.ts";

test("parses common Java runtime version output", () => {
  assert.equal(parseJavaMajorVersion('openjdk version "21.0.2" 2024-01-16'), 21);
  assert.equal(parseJavaMajorVersion('java version "1.8.0_402"'), 8);
  assert.equal(parseJavaMajorVersion('openjdk version "17.0.10" 2024-01-16'), 17);
  assert.equal(parseJavaMajorVersion('openjdk 21.0.2 2024-01-16'), 21);
});

test("rejects Java version output that cannot be identified", () => {
  assert.throws(() => parseJavaMajorVersion("not a Java runtime"), /Could not determine/);
});

test("does not incorrectly require Fabric API in Forge and NeoForge profiles", () => {
  assert.deepEqual(scanModConflicts([{ fileName: "jei.jar", enabled: true }], "forge"), []);
  assert.deepEqual(scanModConflicts([{ fileName: "jei.jar", enabled: true }], "neoforge"), []);
});

test("warns about duplicate Embeddium and Rubidium renderer forks", () => {
  const warnings = scanModConflicts([
    { fileName: "embeddium.jar", enabled: true },
    { fileName: "rubidium.jar", enabled: true }
  ], "forge");
  assert.ok(warnings.some(warning => /alternative renderer forks/.test(warning)));
});

test("detects additional lighting, shader-loader and cross-loader conflicts", () => {
  assert.ok(scanModConflicts([{ fileName: "starlight.jar", enabled: true }, { fileName: "phosphor.jar", enabled: true }]).some(message => /Starlight and Phosphor/.test(message)));
  assert.ok(scanModConflicts([{ fileName: "iris.jar", enabled: true }, { fileName: "oculus.jar", enabled: true }]).some(message => /Iris and Oculus/.test(message)));
  assert.ok(scanModConflicts([{ fileName: "fabric-api.jar", enabled: true }], "forge").some(message => /Forge\/NeoForge profile/.test(message)));
  assert.ok(scanModConflicts([{ fileName: "optifine.jar", enabled: true }, { fileName: "sodium.jar", enabled: true }]).some(message => /OptiFine and Sodium/.test(message)));
});
