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
