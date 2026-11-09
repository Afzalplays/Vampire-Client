# Java runtime installation

Vampire Client can install an Eclipse Temurin Java 21 JRE into its application data directory.

## Download and verification

- Runtime metadata is requested from the Adoptium assets API over HTTPS.
- The returned package must include a supported ZIP or TAR.GZ filename, a positive declared size no larger than 300 MB, and a 64-character SHA-256 checksum.
- The archive URL and every redirect are restricted to HTTPS GitHub release asset hosts. Redirects are followed manually, with a maximum of five hops.
- The response is streamed and bounded while reading. Both the declared package size and the 300 MB hard limit are enforced before the archive is accepted.
- SHA-256 is checked before extraction.

## Extraction and activation

Archive extraction rejects traversal paths, symbolic links, unsupported TAR entries, encrypted or unsupported ZIP entries, excessive entry counts, oversized files and excessive expansion. The extracted Java executable is then launched with `-version`; installation succeeds only when it reports Java 21.

A verified installation is staged beside the active runtime. Activation first moves the existing runtime to a uniquely named backup, then renames the staged directory into place. If activation fails, the previous runtime is restored. A backup is removed only after successful activation.

## Verification limits

Automated tests cover Java version parsing and runtime-directory replacement/rollback. The actual Adoptium download, archive extraction and Java process startup still require platform-specific CI or desktop execution. This installer targets Java 21; it is not a universal runtime selector for every Minecraft release.
