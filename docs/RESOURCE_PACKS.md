# Resource pack management

Vampire Client stores imported Minecraft resource packs as ZIP files in the selected instance's `resourcepacks` directory. Imports are copied, not extracted or executed.

## Import validation

- Only ZIP files between 4 bytes and 512 MB are accepted.
- The archive must have a valid, single-disk ZIP directory; ZIP64 and multi-disk archives are not supported.
- Root `pack.mcmeta` must be valid JSON with an integer `pack.pack_format` from 1 through 10,000.
- Archives are limited to 50,000 entries, a 32 MB central directory and 2 GB total declared expanded content. Individual entries are limited to a 1,000:1 compression ratio.
- Encrypted entries, symbolic links, special filesystem entries, traversal paths, duplicate case-insensitive names and malformed local headers are rejected.
- The inspection view reports pack format, metadata description, file count, texture count, compressed size, expanded size and whether a root `pack.png` exists.

The pack format is shown as metadata, not asserted to be compatible with the selected Minecraft version. Enable the imported pack in Minecraft's Options → Resource Packs screen.

## Filename safety

Resource pack inspect/remove operations accept only a plain ZIP filename (letters, digits, spaces, dots, underscores and hyphens). Path separators, drive paths and other characters are rejected. Regression tests cover accepted names and path traversal attempts.
