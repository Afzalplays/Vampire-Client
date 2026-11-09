# Vampire Client: Hosting and Cosmetics Architecture

This document records implemented behavior and remaining work. The Studio page stores a network-access preference for guidance only; the local vanilla server manager currently binds using Minecraft default network behavior. The app never changes firewall/router rules or creates UPnP mappings.

## World hosting: LAN + Internet

### User-facing behavior
- The user must explicitly accept the Minecraft server EULA before the first server start.
- The user chooses a server version and memory limit. The launcher reserves at least 2 GiB for the OS/apps and 512 MiB of currently free memory; the backend enforces the calculated cap again immediately before server start.
- Provide Start, Stop, live console output, process exit status, and a clear server directory.
- Persist the selected mode and server settings, but never persist a public IP address or router credentials.

### Network safety
- LAN mode should bind only to the local network interface where practical.
- The server currently binds using Minecraft defaults (all local interfaces). Explain that remote access requires a router port-forward or a trusted tunnel; do not silently edit router/firewall rules or create UPnP mappings.
- Do not present LAN-only or Internet-only mode selectors until the launcher can enforce them safely.
- Before Internet mode starts, show the exact listening port (default Minecraft Java TCP 25565), explain exposure risks, and require confirmation.
- Never expose RCON by default. If RCON is later supported, generate a strong local password, store it securely, and bind it to loopback unless the user explicitly configures otherwise.
- Include a Stop control that terminates the child process and a recovery path for a stale process.
- Keep server files isolated under the app's user-data directory. Validate paths and server download checksums before execution.
- Do not run downloaded server JARs until the user has reviewed and accepted the EULA and confirmed the server version.

### Implemented sequence
1. Download official vanilla server artifacts from Mojang metadata and verify the published SHA-1 before writing the JAR.
2. Create isolated server folders and generate a default `server.properties` with online-mode enabled and RCON disabled.
3. Require explicit EULA acceptance and enforce a conservative Java heap cap based on total and currently free system memory.
4. Stream stdout/stderr through a narrow preload IPC API; renderer commands are single-line and bounded, with `stop` reserved for the Stop button.
5. Display local IPv4 addresses and the configured TCP port for LAN connection instructions.
6. Provide manual Internet port-forward/tunnel guidance; network preference is not enforced by the server process and no router/firewall changes are automated.
7. Support graceful stop with timed termination fallback, server logs, up to 10 stopped-server backups, rollback-safe restore, backup deletion and per-server ports.
8. Optional per-server crash recovery: restart after an unexpected non-zero exit, with a maximum of three attempts per ten-minute window; manual stops, normal exits and launcher shutdown do not trigger recovery.

### Remaining work
- Strict per-interface network policies remain unsupported; the UI no longer offers non-enforced LAN-only/Internet-only selectors. Users must configure OS firewall rules manually when isolation is required.
- Test install/start/stop/backup/restore/delete on a physical desktop across Windows, macOS and Linux.

## Cosmetics: Vampire account sync

### User-facing behavior
- Default visibility selection: **Vampire account sync across devices**.
- Cosmetics are tied to the authenticated Vampire account, not the local Minecraft username.
- A signed-in user can upload/select an HD cape, preview it, and sync the selected cosmetic to other signed-in devices.
- Only clients with the compatible Vampire companion mod can render Vampire-only cape/nameplate effects. Vanilla clients and unrelated clients will not automatically display them.

### Required service boundaries
- Use a dedicated HTTPS cosmetics API with short-lived access tokens.
- Reuse the Vampire account identity provider; do not store Microsoft passwords or Minecraft access tokens in the cosmetics service.
- Store cape assets in object storage with strict file-size, dimensions, MIME and decoded-image validation. Reject SVG and executable formats; re-encode accepted raster images.
- Use signed, expiring asset URLs and per-account upload quotas.
- Support delete/revoke, abuse reporting, rate limiting and account logout/token revocation.
- Keep the local preview available if the cosmetics API is offline; clearly label sync status.

### Planned implementation sequence
1. Define Vampire account authentication and device-session contract.
2. Implement profile/cosmetic read and write endpoints with authorization tests.
3. Add secure upload validation and object storage.
4. Add companion-mod rendering for capes and client-side name/chat decorations.
5. Add cross-device sync, cache invalidation and offline fallback.
6. Add privacy controls and deletion behavior.

## Current status

The local vanilla server manager is implemented in code: verified official JAR download, isolated server folders, explicit EULA acceptance, conservative memory limits, start/stop/delete lifecycle, file-based stdout/stderr logging, live console UI, LAN IPv4 display, single-line command input, graceful shutdown fallback, up to 10 backups, rollback-safe restore, per-server ports and log diagnostics for common port, Java, EULA and memory failures. **Not yet verified in a real desktop run.** Network preferences remain informational only; automatic crash recovery is now opt-in and bounded; physical desktop testing remains pending. Vampire-account cosmetics backend, asset storage, cross-device sync and in-game cape renderer are not implemented. Do not represent these remaining items as working features.
