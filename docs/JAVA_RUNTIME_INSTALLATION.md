# Java runtime installation

Vampire Client can install Eclipse Temurin Java 8, 17 or 21 JREs into separate application-data directories. Settings selects the recommended major for the chosen Minecraft version: Java 8 before 1.17, Java 17 for 1.17–1.20.4, and Java 21 for 1.20.5 and newer. The launch path independently checks the installed Minecraft metadata and refuses a runtime below its declared Java requirement.

## Download and verification

- Runtime metadata is requested from the Adoptium assets API over HTTPS.
- The returned package must include a supported ZIP or TAR.GZ filename, a positive declared size no larger than 300 MB, and a 64-character SHA-256 checksum.
- The archive URL and every redirect are restricted to HTTPS GitHub release asset hosts. Redirects are followed manually, with a maximum of five hops.
- The response is streamed and bounded while reading. Both the declared package size and the 300 MB hard limit are enforced before the archive is accepted.
- SHA-256 is checked before extraction.

## Extraction and activation

Archive extraction rejects traversal paths, symbolic links, unsupported TAR entries, encrypted or unsupported ZIP entries, excessive entry counts, oversized files and excessive expansion. TAR.GZ extraction supports per-file POSIX PAX path metadata (used by some Temurin archives) while rejecting link, sparse-file and unsafe global path overrides. The extracted Java executable is then launched with `-version`; installation succeeds only when it reports the exact requested major version.

A verified installation is staged beside the active runtime. Activation first moves the existing runtime to a uniquely named backup, then renames the staged directory into place. If activation fails, the previous runtime is restored. A backup is removed only after successful activation.

## Verification limits

Automated tests cover Java version parsing, Minecraft-to-Java major selection, runtime-directory replacement/rollback, PAX long-path extraction and PAX path-traversal rejection. The actual Adoptium downloads, archive extraction and Java process startup still require platform-specific CI or desktop execution. The current automatic choices are Java 8, 17 and 21; other Java majors can still be selected manually through the Java executable path.


## POSIX PAX TAR metadata

The TAR.GZ reader supports per-entry PAX `path` metadata for long runtime filenames. It rejects malformed length-prefixed records, link/sparse metadata, global path overrides, unsupported size overrides and a dangling extended header. These checks are covered by archive regression tests.
