# Changelog

## Unreleased — Modrinth API reliability

- Moved mod search into the Electron main process and added an explicit Vampire Client User-Agent to Modrinth API and CDN requests.
- Kept renderer search results typed and normalized nullable project icons before display.

## Unreleased — Studio mod setup shortcuts

- Added one-click Modrinth installation for Replay Mod on Fabric/Forge profiles and Litematica on Fabric profiles from the Studio replay and schematic libraries.
- Installation reuses the launcher's compatibility resolution, required-dependency installation and tracked-mod update workflow.

## Unreleased — Local player nameplate gradients

- Added a client-side player-nameplate mixin that applies the saved gradient while preserving each text segment's existing style metadata.
- The setting is local-only and does not identify remote Vampire Client users or synchronize cosmetics.

## Unreleased — Launcher reliability and loader safety

- Added opt-in per-server world crash recovery with a three-restart/ten-minute limit; manual stops, clean exits and launcher shutdown never trigger it, and memory is revalidated before restart.
- Hardened Quilt, Forge and NeoForge metadata retrieval with HTTPS host allowlists, redirect validation and strict response-size limits.
- Corrected numeric Maven version ordering so Forge/NeoForge versions such as `47.10` sort newer than `47.9`, and fixed Forge SHA-1 sidecar whitespace parsing.
- Expanded mod conflict heuristics for shader loaders, lighting engines and cross-loader files.

## Unreleased — World server crash recovery

- Added an opt-in per-server automatic restart setting for unexpected non-zero exits, capped at three attempts within ten minutes.
- Manual stops, normal exits and launcher shutdown suppress automatic restarts; disabling the setting cancels a pending restart.
- Added regression coverage for restart policy limits.

All notable Vampire Client changes are recorded here.

## Unreleased — Java 25 support

- Added automatic Eclipse Temurin Java 25 installation for Minecraft 26.1+ and expanded Minecraft version parsing to the new year-based release format.
- Added Java 25 mapping regression tests and updated runtime documentation.

## Unreleased — World server diagnostics

- Added local log analysis for common server failures, including occupied ports, insufficient heap, incompatible Java versions and EULA rejection.
- The world-hosting console now displays actionable findings based on the server's saved output.

## Unreleased — Replay and schematic file management

- Added isolated per-instance Replay Mod recording (`.mcpr`) and schematic (`.litematic`, `.schem`, `.schematic`, `.nbt`) libraries with import, list, remove and folder-open actions.
- Added strict extension, filename, symbolic-link and file-size checks; files are copied as-is and never extracted or executed.
- Documented that recording/playback and schematic placement still require compatible Minecraft mods.

## Unreleased — world server download hardening

- Stream official Minecraft server metadata and JAR downloads with strict size limits and 30-second timeouts.
- Validate both original and final redirect URLs against exact HTTPS Mojang host allowlists before accepting response bytes.
- Preserve the published SHA-1 check before the server JAR is written to disk.

## Unreleased — World server network port controls

- Added per-server TCP port selection and stopped-server port changes, with 1024–65535 validation and duplicate-port prevention across local servers.
- The chosen port is persisted to `server.properties` and shown with each server's LAN connection details. Online-mode remains enabled and RCON remains disabled by default.

## Unreleased — Local world server backups

- Added up to 10 per-server snapshots, with a 20 GB safety limit and symlink rejection.
- Added stopped-server-only restore using a temporary copy and rollback to the previous server directory if activation fails.
- Added backup listing and deletion controls to the World Hosting panel.

## Unreleased — Verified manual installer downloads

- Added platform-specific Windows, Linux and macOS release asset selection.
- Added an explicit download action that streams the selected installer to the launcher data directory, enforces a 2 GB ceiling, checks declared size and SHA-256 digest, and only reveals the file in the system file manager. It never silently executes or replaces the running launcher.
- Release assets without a published SHA-256 digest remain available through the official manual release links but are not eligible for verified in-app downloads.

## Unreleased — Forge and NeoForge support

- Added automatic stable Forge and NeoForge loader installation from official HTTPS Maven metadata, per-instance install tracking, and loader-aware launch validation.
- Forge installer downloads use the official HTTPS Maven endpoint and SHA-1 sidecar verification; both installers use the Java executable selected in Settings and validate the recommended Java major before processor execution.
- Enabled Modrinth search, compatible mod installation, updates and modpack import/export for Forge and NeoForge. Fabric-only renderer profiles remain Fabric-specific.
- Added regression tests for Maven version selection, NeoForge version mapping (including Minecraft 1.21), and unsupported legacy NeoForge versions.

## Unreleased — Minecraft-aware Java runtimes

- Generalized the verified Temurin installer to Java 8, 17 and 21 with separate runtime directories and exact major-version startup verification.
- Settings now selects the recommended Java major for the chosen Minecraft version, and launch rejects runtimes below the Minecraft metadata requirement.

## Unreleased — Privacy-safe diagnostics

- Exported launcher logs now redact common credentials, OAuth tokens, email addresses, UUIDs, IP/MAC addresses and home-directory usernames before writing the exported copy.
- Made mod-conflict diagnostics loader-aware so Forge and NeoForge instances are not incorrectly warned about missing Fabric API; added duplicate renderer-fork detection.

## Unreleased — Crash diagnostics

- Record fatal Electron/Node exception stacks and runtime warnings without suppressing the normal crash behavior.
- Mark non-zero or signal-terminated Minecraft sessions as crash candidates and direct users to the launcher log viewer for preceding game stdout/stderr context.

## Unreleased — CI packaging retry hardening

- Increased electron-builder transient-download retries from five to eight attempts.
- Added a progressive 30–210 second backoff so temporary upstream gateway failures have more time to recover while retaining downloaded tools in the job cache.

## Unreleased — Manual release update checker

- Added an official GitHub Releases check in Settings, semantic version comparison, and allowlisted release/download URLs. The launcher opens the selected official release page; it does not silently install or execute updates.
- Corrected strict semantic-version parsing and distinguished missing stable releases from malformed release metadata in the update status.

## Unreleased — Launcher loader selection

- Added a loader selector directly to the Versions screen so users can choose Vanilla, Fabric or Quilt before installation. CI cache keys now follow package.json because the repository does not contain a package-lock.json.

## Unreleased — Quilt loader support

- Added official Quilt loader installation for supported Minecraft versions, per-instance install/launch status, Modrinth Quilt mod discovery and install/update, and Fabric/Quilt modpack import/export. Fabric-only renderer tooling remains restricted to Fabric profiles.
- Added validation tests for Quilt loader metadata selection.

## Unreleased — Java archive regression coverage

- Added malformed PAX record, link metadata, global path override and dangling-header rejection tests for Java runtime TAR.GZ extraction.

## Unreleased — Resource pack management

- Fixed resource-pack inspection filename validation so ordinary .zip files can be inspected; shared the strict filename check between inspect and remove handlers.
- Added filename traversal regression tests and documented resource-pack ZIP validation limits.

## Unreleased — Java runtime reliability

- Hardened the Temurin Java 21 download path with manual HTTPS redirect validation, a five-redirect ceiling, streamed package-size enforcement and strict Adoptium metadata validation.
- Verify the extracted runtime by launching java -version and requiring the requested Java major before activation.
- Stage runtime updates separately and preserve/restore the previous runtime if activation fails.
- Added regression tests for runtime replacement, rollback and Java version parsing. See Java runtime installation docs.
- Added safe POSIX PAX extended-path support for TAR.GZ runtimes and tests for long paths, directory entries and traversal rejection.
- Corrected PAX record-length parsing and TAR directory path normalization after CI exposed escaped-regex syntax errors.

## Unreleased — Vampire Client Studio foundation

- Added automatic Eclipse Temurin Java 8, 17 and 21 JRE installation for supported Windows, Linux and macOS architectures, selected according to the Minecraft version. Downloads are SHA-256 verified and archives are safely extracted with traversal/link/size checks; installed Java is selected and saved for the active instance.
- Added local Skin & Cape Studio with validated PNG uploads/previews, three Vampire cape themes, centered emblem/glitter/sparkle controls, local persistence and 64×32 cape texture export. Cloud upload, multiplayer rendering and purchases remain pending.
- Added a Studio hub UI with HD cape design previews and selectable cape themes.
- Added local gradient name/chat identity and nametag mark preference controls.
- Added HUD, shader, Replay Mod, schematic and local world-hosting feature panels with explicit preview-state messaging.
- Added locally persisted Studio preferences and a curated mod-category discovery surface.
- Clarified that online cosmetics sync, shader ZIP management, replay/schematic integrations and world-host runtime are not yet implemented.

## 0.3.0 — Development preview

- Added the Vampire Studios glassmorphism desktop launcher interface.
- Added official Minecraft version manifest loading and vanilla installation.
- Added Fabric loader installation for version instances.
- Added game launch integration with configurable Java path and RAM allocation.
- Added offline profiles for offline-mode servers.
- Added Microsoft device-code authentication flow and Minecraft Java entitlement validation (requires a developer-provided public Client ID; end-to-end sign-in still needs testing).
- Added Modrinth search, Fabric mod JAR download, per-version mod folders, enable/disable and removal.
- Added companion Fabric mod with Right Shift quick menu, loaded mod list, performance readout and FPS HUD toggle.
- Added Windows x64/x86, Linux x64 and macOS universal packaging workflows.
- Added static website source and GitHub Pages/Vercel deployment configuration.

### Known limitations

- Microsoft sign-in has not yet been tested with the project's registered Client ID.
- Game installation and launch code compiles but still requires testing on a real Windows PC and Minecraft account.
- Forge, NeoForge and Quilt installation is implemented; broad version coverage and real desktop launch testing remain pending.
- Modrinth updates, required-dependency resolution, basic filename-based conflict diagnostics and Vampire modpack import/export are implemented; broader dependency/conflict analysis remains pending.
- Sodium/VulkanMod profile switching is implemented for Fabric; full visual HUD editing and real in-game behavior testing remain pending.
- Android is a separate future project.
- No final public installer release has been published.
