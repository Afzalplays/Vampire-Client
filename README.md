# 🧛 Vampire Client

**A cross-platform Minecraft Java launcher in development by Vampire Studios.**

Vampire Client is being built with a red-and-black glassmorphism interface, account management, Minecraft version installation, Modrinth mod discovery and a Feather-inspired in-game Right Shift menu.

## Current implementation (v0.3.0 preview)

- Electron + React + TypeScript desktop launcher.
- Glass UI, Vampire Studios splash screen, Home, Versions, Mods, Accounts and Settings pages.
- Official Minecraft version manifest and vanilla game installation through XMCL.
- Official Minecraft version browser for stable releases, snapshots, old beta and old alpha metadata; fresh installs default to the latest official stable release, with a one-click latest-release selector.
- Vanilla installation is available for versions in the official manifest; Fabric installation depends on a compatible Fabric loader build being published for that Minecraft version.
- Fabric loader installation for supported Minecraft versions.
- Minecraft process launch integration with configurable Java path and RAM allocation.
- Offline local profiles for single-player and servers that explicitly allow offline-mode connections.
- Microsoft device-code authentication flow, Xbox/Minecraft token exchange and Java entitlement check. Requires your own public Microsoft app Client ID; see [Microsoft login setup](docs/MICROSOFT_LOGIN_SETUP.md). End-to-end account sign-in still needs a real account test.
- Modrinth project search and compatible Fabric JAR download, including automatic installation of required Modrinth dependencies and rejection of declared incompatible dependencies.
- Named Minecraft instance manager: create, select and delete separate profiles with isolated game folders, mods, resource packs, shader packs and `options.txt`; active instance selection is persisted. The legacy Default instance keeps the previous version-based folder layout. RAM allocation and Java executable path are saved independently per instance.
- Vampire modpack JSON manifest import/export for tracked Modrinth projects; import re-resolves compatible builds and required dependencies for the exact Minecraft/Fabric profile.
- Per-instance mod folders with installed-mod list, individual and bulk enable/disable, remove actions, Modrinth update checks and one-click updates for mods installed through Vampire Client (legacy/manual JARs need reinstalling through the launcher to register). The manager now supports enabled/disabled/all filters, live enabled/disabled counts, manual list refresh and confirmation before removing a mod; shader and resource-pack removals also require confirmation.
- Resource pack ZIP import/list/remove manager for each Minecraft instance, with a refresh action, filename filter and removal confirmation. The built-in 128×128 pixel Texture Pack Editor includes pencil, eraser, connected-region bucket fill, eyedropper, continuous brush strokes, optional horizontal/vertical mirrored drawing, a quick color palette, brush sizing, PNG import, image transforms, undo/redo, editable project JSON and resource-pack ZIP export. The editor exports a starter block texture pack with a user-selected `pack.mcmeta` format value (set it to the format required by your Minecraft version); imported images are limited to 8,192 px per side and 40 megapixels. Custom model/block references may still be needed to display the texture in-game.
- One-click Sodium/VulkanMod renderer switching for Fabric instances; the two renderer mods are kept mutually exclusive.
- Real per-instance Celeron/4 GB low-end and i3-balanced graphics presets that write Minecraft options such as render distance, simulation distance, particles, clouds and entity shadows.
- Companion-mod 30-second in-game FPS benchmark reporting sampled average, minimum and maximum FPS, plus current Java memory usage.
- One-click low-end optimization packs, including Sodium or VulkanMod renderer profiles, that resolve compatible Fabric API, Lithium, FerriteCore, ImmediatelyFast, EntityCulling, Dynamic FPS and More Culling builds from Modrinth and report skipped mods.
- Modrinth downloads are restricted to the official HTTPS CDN, checksum-verified, and limited to 150 MB per file.
- Electron renderer isolation, sandboxing, restricted external navigation and encrypted Microsoft token storage when OS secure storage is available.
- Desktop Right Shift quick menu.
- Vampire Studio feature hub with cape/name-gradient previews, HUD controls, shader/replay/schematic/world-hosting controls.
- Per-instance shader ZIP import/list/remove manager plus a curated 10-entry Shader Library page with creator-page links and installed-pack management. Download shader ZIPs from their creator pages and import them into the selected instance; Iris or another compatible shader loader must be installed separately.
- Installed-mod diagnostics now flag common renderer/optimization combinations (Sodium + VulkanMod, OptiFine + Iris, Sodium + Rubidium/Embeddium, Lithium + Canary) and a missing Fabric API filename. These are filename heuristics, not complete dependency or runtime validation.
- Launcher log viewer can filter lines containing error/exception/fatal/failed/crash keywords to help triage. Keyword matches can include handled errors; inspect surrounding log context before acting. It also offers a bounded surrounding-context view (up to 120 lines) with line numbers, so nearby stack-trace and cause messages remain visible. The viewer also summarizes keyword matches by error, exception, fatal, crash and failed categories; categories can overlap on a single line.
- Locally saved Studio preferences, including account-synced cape visibility selection and LAN + Internet world-hosting mode selection.
- World-hosting and cosmetics architecture documented with explicit security boundaries; actual server runtime and remote cosmetics service remain pending.
- Companion Fabric client mod for Minecraft 1.21.1: in-game Right Shift menu, loaded-mod list, FPS/heap readout, FPS HUD toggle and Vampire Identity settings. The local player's own chat-name prefix now has a client-side gradient/badge renderer, with saved gradient presets and built-in Minecraft Default/Uniform/Alt font presets. This does not detect or style other Vampire Client users; overhead nametag rendering and remote cosmetics remain pending.

## Not implemented / still in development

- Microsoft token refresh and a complete multi-account profile manager.
- Forge, NeoForge and Quilt loader installation.
- Broader cross-mod conflict analysis and support for modpack formats beyond Vampire Client’s Modrinth-based JSON manifest.
- Curated 100+ mod catalogue with categorized profiles, dependency/conflict resolution and full automated compatibility testing; the new low-end packs are an initial curated batch and may skip unavailable versions.
- HD cape upload, rendering and account-backed cosmetics sync service; account sync is selected in the UI, but the authenticated cosmetics API/storage service and companion-mod rendering are not implemented.
- Full live mod configuration and draggable HUD editor. Vampire Identity currently styles only the local player's own chat-name prefix; remote Vampire-client detection, overhead nametag rendering, cross-client cosmetics sync and arbitrary TTF/OTF font loading are not implemented. Shader Library currently links to creator downloads rather than silently installing third-party files.
- Replay Mod integration, schematic file tools and local dedicated-world hosting runtime (LAN + Internet mode is selected in the UI; no server is launched or ports opened yet).
- Java runtime auto-download and installation.
- Android application.
- Branded application icons, Windows code signing and macOS notarization.
- macOS code signing/notarization and Linux ARM64 packages.

Offline profiles do not authenticate Minecraft ownership or grant access to online-mode/premium servers. Microsoft sign-in verifies Minecraft Java entitlement before official-account launch.

## Desktop platforms

The GitHub Actions workflow builds:

- Windows x64 and x86 NSIS setup installers plus portable executables.
- Linux x64 AppImage and DEB packages.
- macOS universal DMG and ZIP packages.

Windows setup assets use the name format `VampireClient-Setup-<version>-<arch>.exe`. Builds must pass and be tested before a release is considered ready. FPS targets such as 150–200 on low-end Celeron systems or 400–500 on i3 systems are goals only, never guaranteed performance claims; actual results depend on hardware, Minecraft version, resolution, world and settings. The in-game benchmark measures real results instead of claiming a target was achieved. No verified public installer release has been published yet.

## Run locally

Requirements: Node.js 22+, npm, and (for Minecraft 1.21.1) Java 21 available on PATH or selected in Settings.

```bash
git clone https://github.com/Afzalplays/Vampire-Client.git
cd Vampire-Client
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Package on the matching operating system:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

## In-game Right Shift menu (Fabric)

The companion module source targets Minecraft 1.21.1 and Java 21. See [docs/IN_GAME_MENU.md](docs/IN_GAME_MENU.md) for build and installation instructions.

```bash
cd game-mod
gradle build
```

## Downloads

Verified build artifacts are attached to successful [GitHub Actions build runs](https://github.com/Afzalplays/Vampire-Client/actions/workflows/build.yml). No public GitHub Release has been published yet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report bugs through GitHub Issues. Never commit passwords, access tokens, refresh tokens, private keys or local account/session files.

## Project license

Vampire Client is distributed under the [MIT License](LICENSE). Third-party libraries, Minecraft assets, Modrinth projects and other community content remain subject to their own licenses and terms; this project does not grant rights to redistribute them.

## Disclaimer

Minecraft is a trademark of Mojang Studios. Vampire Client is an independent community project and is not affiliated with, endorsed by, or sponsored by Mojang Studios or Microsoft.

**Vampire Studios** ❤️
