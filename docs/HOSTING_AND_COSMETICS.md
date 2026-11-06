# Vampire Client: Hosting and Cosmetics Architecture

This document records implemented behavior and remaining work. The Studio page stores the user's network-mode preference locally; that preference is not yet enforced by the server runtime.

## World hosting: LAN + Internet

### User-facing behavior
- Default mode: **Both LAN and Internet**.
- Also offer LAN-only and Internet-only modes.
- The user must explicitly accept the Minecraft server EULA before the first server start.
- The user chooses a server version and a memory limit. Enforce a conservative configurable cap and never allocate all detected system RAM.
- Provide Start, Stop, live console output, process exit status, and a clear server directory.
- Persist the selected mode and server settings, but never persist a public IP address or router credentials.

### Network safety
- LAN mode should bind only to the local network interface where practical.
- Internet mode must be a separate, explicit action. Explain that remote access requires a router port-forward or a trusted tunnel; do not silently edit router/firewall rules or create UPnP mappings.
- Before Internet mode starts, show the exact listening port (default Minecraft Java TCP 25565), explain exposure risks, and require confirmation.
- Never expose RCON by default. If RCON is later supported, generate a strong local password, store it securely, and bind it to loopback unless the user explicitly configures otherwise.
- Include a Stop control that terminates the child process and a recovery path for a stale process.
- Keep server files isolated under the app's user-data directory. Validate paths and server download checksums before execution.
- Do not run downloaded server JARs until the user has reviewed and accepted the EULA and confirmed the server version.

### Planned implementation sequence
1. Download official vanilla server artifacts using version metadata and verify SHA-1/SHA-256 where published.
2. Create an isolated server instance and generate a minimal `server.properties`.
3. Add explicit EULA consent, RAM bounds, Java executable selection, and start/stop process lifecycle.
4. Stream console output through a narrow preload IPC API; never expose arbitrary shell execution to the renderer.
5. Implement LAN address discovery and show connection instructions.
6. Add Internet mode as a guided manual port-forward/tunnel workflow with a persistent warning; do not automate router changes.
7. Add world backup, graceful shutdown, and crash recovery before calling the feature production-ready.

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

The local vanilla server manager is implemented in code: verified official JAR download, isolated server folders, explicit EULA acceptance, bounded heap argument, start/stop/delete lifecycle, and file-based stdout/stderr logging. **Not yet verified in a real desktop run.** Live console UI, basic LAN IPv4 display, and single-line server command input are now implemented in code. Enforced network modes, process exit/error UI, Internet port-forward guidance, backups, crash recovery, and production hardening remain pending. Vampire-account cosmetics backend, asset storage, cross-device sync, and in-game cape renderer are not implemented. Do not represent these remaining items as working features.
