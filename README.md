# 🧛 Vampire Client

**A cross-platform Minecraft Java launcher in development by Vampire Studios.**

Vampire Client is being built with a red-and-black glassmorphism interface, account management, Minecraft version installation, Modrinth mod discovery and a Feather-inspired in-game Right Shift menu.

## Current implementation (v0.3.0 preview)

- Skin & Cape Studio: local PNG signature/header and dimension validation before image decoding, preview for classic/slim skin textures and HD cape textures, original uploaded skin/cape PNG downloads, and IndexedDB-backed local texture storage with one-time migration from the previous localStorage format and a request for persistent browser storage where supported. Export/import a versioned JSON backup containing both uploaded textures and designer preferences for manual transfer between devices; imports validate both textures before replacing local data. Preferences remain in localStorage. Includes a red/black Vampire cape designer, centered emblem, sparkle/glitter preview toggles and a clearly labeled future premium collection. Uploads are local previews only; account skin changes, cloud sync, purchases and multiplayer cape delivery are not implemented yet.

- Electron + React + TypeScript desktop launcher.
- Glass UI, Vampire Studios splash screen, Home, Versions, Mods, Accounts and Settings pages.
- Official Minecraft version manifest and vanilla game installation through XMCL.
- Official Minecraft version browser for stable releases, snapshots, old beta and old alpha metadata; fresh installs default to the latest official stable release, with a one-click latest-release selector.
- Vanilla, Fabric, Quilt, Forge and NeoForge installation is available for compatible Minecraft releases; NeoForge auto-install currently targets 1.20.2 and newer.
- Fabric and Quilt loader installation, plus automatic latest-stable Forge and NeoForge installation using official HTTPS Maven metadata. Forge installer downloads are SHA-1 verified; NeoForge version resolution follows the official Minecraft/NeoForge version scheme.
- Minecraft process launch integration with configurable Java path and RAM allocation.
- Offline local profiles for single-player and servers that explicitly allow offline-mode connections.
- Microsoft device-code authentication flow, Xbox/Minecraft token exchange, Java entitlement check, encrypted MSAL token cache, silent session refresh and saved multi-account switching. Requires your own public Microsoft app Client ID; see [Microsoft login setup](docs/MICROSOFT_LOGIN_SETUP.md). End-to-end account sign-in still needs a real account test.
- Modrinth project search and compatible Fabric, Quilt, Forge and NeoForge JAR downloads, including automatic installation of required Modrinth dependencies and rejection of declared incompatible dependencies.
- Named Minecraft instance manager: create, select and delete separate profiles with isolated game folders, mods, resource packs, shader packs and `options.txt`; active instance selection is persisted. The legacy Default instance keeps the previous version-based folder layout. RAM allocation and Java executable path are saved independently per instance.
- Vampire modpack JSON manifest import/export for tracked Modrinth projects; import re-resolves compatible builds and required dependencies for the exact Minecraft and mod-loader profile.
- Per-instance mod folders with installed-mod list, individual and bulk enable/disable, remove actions, Modrinth update checks and one-click updates for mods installed through Vampire Client (legacy/manual JARs need reinstalling through the launcher to register). The manager now supports enabled/disabled/all filters, live enabled/disabled counts, manual list refresh and confirmation before removing a mod; shader and resource-pack removals also require confirmation.
- Replay and schematic file libraries: import/list/remove `.mcpr`, `.litematic`, `.schem`, `.schematic` and `.nbt` files in isolated per-instance folders. Recording/playback and in-game placement still require compatible mods; see [Studio file management](docs/STUDIO_FILE_MANAGEMENT.md).
- Resource pack ZIP import/list/inspect/remove manager for each Minecraft instance, with a refresh action, filename filter and removal confirmation. Inspect reports the declared pack format, description, archive file count, texture path count, compressed and expanded sizes, and whether a root pack icon exists without extracting archive contents. Resource-pack imports validate the ZIP end record, central-directory boundaries, local file headers, duplicate/path traversal entries, symlinks, encryption flags, compression methods and expansion limits before copying; ZIP64 and multi-disk archives are rejected. The built-in 128×128 pixel Texture Pack Editor includes pencil, eraser, connected-region bucket fill, eyedropper, continuous brush strokes, optional horizontal/vertical mirrored drawing, a quick color palette, brush sizing, PNG import, checker/stripe/frame/blank starter templates, image transforms, undo/redo, editable project JSON and resource-pack ZIP export. The editor exports a starter block texture pack with a user-selected `pack.mcmeta` format value (set it to the format required by your Minecraft version); imported images are limited to 8,192 px per side and 40 megapixels. Custom model/block references may still be needed to display the texture in-game.
- One-click Sodium/VulkanMod renderer switching for Fabric instances; the two renderer mods are kept mutually exclusive.
- Real per-instance Celeron/4 GB low-end and i3-balanced graphics presets that write Minecraft options such as render distance, simulation distance, particles, clouds and entity shadows.
- Companion-mod 30-second in-game FPS benchmark reporting sampled average, minimum and maximum FPS, plus current Java memory usage.
- One-click low-end optimization packs, including Sodium or VulkanMod renderer profiles, that resolve compatible Fabric API, Lithium, FerriteCore, ImmediatelyFast, EntityCulling, Dynamic FPS and More Culling builds from Modrinth and report skipped mods.
- Modrinth downloads are restricted to the official HTTPS CDN, checksum-verified, and limited to 150 MB per file.
- Electron renderer isolation, sandboxing, restricted external navigation and encrypted Microsoft token storage when OS secure storage is available.
- Desktop Right Shift quick menu.
- Vampire Studio feature hub with cape/name-gradient previews, HUD controls, shader/replay/schematic/world-hosting controls.
- Per-instance shader ZIP import/list/remove manager plus a curated 10-entry Shader Library page with creator-page links and installed-pack management. Download shader ZIPs from their creator pages and import them into the selected instance; Iris or another compatible shader loader must be installed separately.
- Installed-mod diagnostics now flag common renderer, shader-loader and lighting-engine conflicts (Sodium + VulkanMod, OptiFine + Iris/Sodium, Sodium + Rubidium/Embeddium, Lithium + Canary, Starlight + Phosphor, Iris + Oculus), loader mismatches such as Fabric API in Forge/NeoForge profiles, and a missing Fabric API filename. These are filename heuristics, not complete dependency or runtime validation.
- Launcher log viewer includes a one-click redacted-copy action that masks common credentials, emails, UUIDs, IPv4 addresses and local home-directory names before sharing (best-effort; review output manually). It can filter lines containing error/exception/fatal/failed/crash keywords to help triage. Keyword matches can include handled errors; inspect surrounding log context before acting. It also offers a bounded surrounding-context view (up to 120 lines) with line numbers, so nearby stack-trace and cause messages remain visible. The viewer also summarizes keyword matches by error, exception, fatal, crash and failed categories; categories can overlap on a single line.
- Locally saved Studio preferences, including account-synced cape visibility selection and LAN + Internet world-hosting mode selection.
- World-hosting and cosmetics architecture documented with explicit security boundaries; actual server runtime and remote cosmetics service remain pending.
- Companion Fabric client mod for Minecraft 1.21.1: in-game Right Shift menu, loaded-mod list, FPS/heap readout, FPS HUD toggle and Vampire Identity settings. The local player's own chat-name prefix now has a client-side gradient/badge renderer, with saved gradient presets and built-in Minecraft Default/Uniform/Alt font presets. This does not detect or style other Vampire Client users; overhead nametag rendering and remote cosmetics remain pending.

## Remaining work

The following items are not yet complete or have not been verified on a physical desktop:

### Release blockers
- Install and launch the Windows x64 NSIS installer and portable EXE on a real Windows PC; verify first-run setup, upgrade behavior, uninstall behavior and clean launch.
- Test Microsoft sign-in, Java entitlement, token refresh, account switching and logout with a real Minecraft Java account. The code paths exist, but README claims must not be treated as end-to-end account test evidence.
- Test the Minecraft 1.21.1 Fabric companion mod in a real game: Right Shift open/close, keyboard focus, multiplayer chat behavior, HUD toggle and crash-free shutdown.
- Test vanilla/Fabric install, repair, launch, stop and per-instance isolation on a clean Windows installation.
- Fix any issues found by the physical-device test pass before publishing a public release.

### Core feature development
- Broader Forge/NeoForge compatibility and installation testing across legacy and current Minecraft releases.
- Broader mod dependency/conflict analysis, support for additional modpack formats and a larger curated catalogue with compatibility testing.
- Draggable and resizable in-game HUD positioning with saved coordinates and width is implemented in the Fabric companion mod; FPS and memory HUD toggles, 75–150% HUD scale (25% steps), and 4–12 px vertical padding (2 px steps) are persisted locally. The position editor preview follows the selected scale and spacing. **Needs real Minecraft testing.** A full visual editor and independent height controls remain future work.
- Cosmetics service: Vampire account authentication, secure cape upload/storage, cross-device sync and companion-mod cape rendering. Current cape designer is a local preview only.
- Remote Vampire-client detection and overhead nametag/cosmetic rendering. The companion mod now applies the local gradient preference to visible player nameplates and the local player's own chat-name prefix on this client; it does not detect Vampire Client identities or sync cosmetics to other players.
- Full Replay Mod recording/playback integration, in-game schematic preview/placement and support for additional modpack formats; a production-ready world-hosting workflow with enforced network policies. The local vanilla server manager now supports up to 10 stopped-server backups per world, SHA-verified server JAR setup, rollback-safe backup restore, backup deletion (including when deleting a server), per-server configurable TCP ports with duplicate-port checks, actionable server-log diagnostics and opt-in bounded crash recovery (up to three automatic restarts in ten minutes; manual stops and clean exits are never restarted). Server heap allocation reserves at least 2 GB for the OS and 512 MB of currently free memory, with the same limit enforced in the UI and main process. LAN/Internet exposure is still guidance-only; real desktop testing remains pending.
- Official Vampire billing entitlement synchronization. The launcher opens the existing billing portal; account linking and paid-entitlement checks require the billing panel's documented API contract. No payment credentials belong in the launcher.

### Distribution and platform work
- Branded app icons and installer polish.
- Windows code signing; macOS signing and notarization.
- Linux ARM64 packages and Android application (separate future platform effort).

Offline profiles do not authenticate Minecraft ownership or grant access to online-mode/premium servers. Microsoft sign-in verifies Minecraft Java entitlement before official-account launch.

## Build verification

GitHub Actions runs on `main` validate Windows x64, Windows x86, Linux x64, macOS universal and the Fabric companion mod. A successful workflow run must complete both regression tests and packaging on every platform. A branch build does not publish a GitHub Release; publishing is reserved for version tags. CI success confirms automated checks, not physical-device testing, code signing/notarization or real Microsoft account verification.

## Billing

Vampire Client links to the existing [Vampire Nodes billing panel](https://billing.vampirenodes.in/). The panel remains the source of truth for products, prices, orders, FamGateway checkout, payment verification and entitlements. No Supabase billing database or second payment backend is used by the launcher. In-launcher entitlement synchronization is pending the panel's official API contract; see [payment security notes](docs/PAYMENTS_SECURITY.md).

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

## Diagnostics regression tests

Run `npm test` to execute Node's built-in test runner against crash classification, log summaries/context, mod conflict warnings and best-effort diagnostic redaction. The tests use Node 22's built-in TypeScript stripping and require no extra test dependency.

## Replay recordings and schematic files

The Studio page can import and manage files for the selected Minecraft instance:

- Replay Mod recordings: `.mcpr` files, up to 2 GB each, stored in `replay_recordings/`.
- Schematics: `.litematic`, `.schem`, `.schematic` and `.nbt` files, up to 128 MB each, stored in `schematics/`.

Files are copied as-is, names are sanitized, and the launcher rejects unsupported extensions, oversized files and symbolic links. These are file-management tools only: recording/playback requires a compatible Replay Mod build, while schematic preview/placement requires Litematica, WorldEdit or another compatible mod. The launcher does not parse, execute or automatically place these files. See [Studio file management](docs/STUDIO_FILE_MANAGEMENT.md).

## Resource pack import validation

Resource pack ZIP imports are checked without extracting archive contents. The importer rejects unsafe paths, duplicate names, encrypted or unsupported entries, symbolic links, malformed local headers, ZIP64/multi-disk archives, excessive expansion ratios and oversized archives. The root `pack.mcmeta` must also be valid JSON with `pack.pack_format` represented as a JSON number (not a numeric string), and that number must be a positive integer from 1 through 10,000; this is structural validation, not a full Minecraft compatibility test.

## Resource pack inspection

Use Inspect beside an imported pack to read its root `pack.mcmeta` summary and archive statistics. Inspection uses the same ZIP boundary, path, symlink, encryption, compression and expansion checks as import; it does not extract files or guarantee that every texture/model is valid in Minecraft.

## Java runtime detection

The Settings page detects an existing Java runtime and can install Eclipse Temurin Java 8, 17, 21 or 25 automatically. It selects Java 8 for Minecraft versions before 1.17, Java 17 for 1.17–1.20.4, Java 21 for 1.20.5–1.21.x, and Java 25 for Minecraft 26.1 and newer. Runtime metadata comes from Adoptium; downloads are SHA-256 verified before extraction. ZIP/TAR entries are checked for path traversal, links, unsupported entry types, oversized files and excessive expansion. Each Java major is stored in its own user-data folder and selected for the active instance. Minecraft launch also checks the installed version metadata and refuses a Java runtime that is too old.

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


## Quilt loader

Quilt profiles are installed from the official Quilt metadata service and the selected loader version is resolved per Minecraft version. Modrinth search, compatible mod installation, updates and Vampire modpack import/export support Fabric, Quilt, Forge and NeoForge profiles. Renderer-specific controls such as Sodium/VulkanMod switching remain Fabric-only until their compatibility with other loaders is independently verified.

## Forge and NeoForge loaders

Forge builds are selected from the official Forge Maven metadata for the chosen Minecraft version. The installer is downloaded over HTTPS from `maven.minecraftforge.net` and its SHA-1 is checked before the XMCL installer processes it with the Java executable selected in Settings. NeoForge builds are selected from `maven.neoforged.net` using the Minecraft-to-NeoForge version mapping and are currently supported automatically for Minecraft 1.20.2 and newer. Both loaders use isolated per-instance directories and support Modrinth-compatible mods, update checks and Vampire modpack import/export. Full compatibility across all legacy versions and real desktop launch tests remain release validation tasks.


## Manual update checks

The Settings page can query the official GitHub Releases API, compare the latest stable release with the installed launcher version, and download the platform-matched installer when GitHub publishes a SHA-256 asset digest. The launcher verifies the download digest and size, then reveals the file in the system file manager for the user to run manually. It never silently replaces or executes the running launcher. Release pages and assets are accepted only from the Vampire Client GitHub repository. No public release is currently guaranteed to exist.
