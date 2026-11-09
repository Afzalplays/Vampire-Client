# Changelog

All notable Vampire Client changes are recorded here.

## Unreleased — Manual release update checker

- Added an official GitHub Releases check in Settings, semantic version comparison, and allowlisted release/download URLs. The launcher opens the selected official release page; it does not silently install or execute updates.

## Unreleased — Launcher loader selection

- Added a loader selector directly to the Versions screen so users can choose Vanilla, Fabric or Quilt before installation. CI cache keys now follow package.json because the repository does not contain a package-lock.json.

## Unreleased — Quilt loader support

- Added official Quilt loader installation for supported Minecraft versions, per-instance install/launch status, Modrinth Quilt mod discovery and install/update, and Fabric/Quilt modpack import/export. Fabric-only renderer tooling remains restricted to Fabric profiles.
- Added validation tests for Quilt loader metadata selection.

## Unreleased — Java archive regression coverage

- Added malformed PAX record, link metadata, global path override and dangling-header rejection tests for Java runtime TAR.GZ extraction.

## Unreleased — CI packaging reliability

- Cache electron-builder downloads between CI runs and extend packaging retries to five attempts with a 45-second delay to tolerate transient upstream HTTP 5xx/504 failures.

## Unreleased — Resource pack management

- Fixed resource-pack inspection filename validation so ordinary `.zip` files can be inspected; shared the strict filename check between inspect and remove handlers.
- Added filename traversal regression tests and documented resource-pack ZIP validation limits.

## Unreleased — Java runtime reliability

- Hardened the Temurin Java 21 download path with manual HTTPS redirect validation, a five-redirect ceiling, streamed package-size enforcement and strict Adoptium metadata validation.
- Verify the extracted runtime by launching `java -version` and requiring Java 21 before activation.
- Stage runtime updates separately and preserve/restore the previous runtime if activation fails.
- Added regression tests for runtime replacement, rollback and Java version parsing. See [Java runtime installation](docs/JAVA_RUNTIME_INSTALLATION.md).
- Added safe POSIX PAX extended-path support for TAR.GZ runtimes and tests for long paths, directory entries and traversal rejection.
- Corrected PAX record-length parsing and TAR directory path normalization after CI exposed escaped-regex syntax errors.

## Unreleased — Vampire Client Studio foundation

- Added automatic Eclipse Temurin Java 21 JRE installation for supported Windows, Linux and macOS architectures. Downloads are SHA-256 verified and archives are safely extracted with traversal/link/size checks; installed Java is selected and saved for the active instance.

- Added local Skin & Cape Studio with validated PNG uploads/previews, three Vampire cape themes, centered emblem/glitter/sparkle controls, local persistence and 64×32 cape texture export. Cloud upload, multiplayer rendering and purchases remain pending.
- Latest CI run for commit `0cca75c3` passed all five build jobs ([Actions run](https://github.com/Afzalplays/Vampire-Client/actions/runs/42179876795)).

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
- Forge, NeoForge and Quilt are not yet supported by the launcher runtime.
- Mod updates, dependency resolution, conflict detection and modpacks are not implemented.
- Sodium/VulkanMod profile switching and full HUD editing are not implemented.
- Android is a separate future project.
- No final public installer release has been published.
