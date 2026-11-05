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
- Per-version mod folders, installed-mod list, individual and bulk enable/disable, remove actions, Modrinth update checks and one-click updates for mods installed through Vampire Client (legacy/manual JARs need reinstalling through the launcher to register).
- Vampire modpack JSON manifest import/export for tracked Modrinth projects; import re-resolves compatible builds and required dependencies for the exact Minecraft/Fabric profile.
- Resource pack ZIP import/list/remove manager for each Minecraft instance; packs are copied into the standard `resourcepacks` folder and are enabled in-game through Minecraft Options.
- One-click Sodium/VulkanMod renderer switching for Fabric instances; the two renderer mods are kept mutually exclusive.
- One-click low-end optimization packs that attempt compatible Fabric API, Lithium, FerriteCore, ImmediatelyFast, EntityCulling, Dynamic FPS and More Culling versions from Modrinth.
- Real per-instance Celeron/4 GB low-end and i3-balanced graphics presets that write Minecraft options such as render distance, simulation distance, particles, clouds and entity shadows.
- Companion-mod 30-second in-game FPS benchmark reporting sampled average, minimum and maximum FPS, plus current Java memory usage.
- One-click Sodium + low-end and VulkanMod + low-end optimization pack installers. Each pack attempts Fabric API, Lithium, FerriteCore, ImmediatelyFast, EntityCulling, Dynamic FPS and More Culling, selecting Modrinth builds compatible with the chosen Minecraft version and reporting skipped mods.
- Modrinth downloads are restricted to the official HTTPS CDN, checksum-verified, and limited to 150 MB per file.
- Electron renderer isolation, sandboxing, restricted external navigation and encrypted Microsoft token storage when OS secure storage is available.
- Desktop Right Shift quick menu.
- Vampire Studio feature hub with cape/name-gradient previews, HUD controls, shader/replay/schematic/world-hosting controls.
- Per-instance shader ZIP import/list/remove manager. ZIPs are copied into the selected instance's `shaderpacks` directory; Iris or another compatible shader loader must be installed separately.
- Locally saved Studio preferences, including account-synced cape visibility selection and LAN + Internet world-hosting mode selection.
- World-hosting and cosmetics architecture documented with explicit security boundaries; actual server runtime and remote cosmetics service remain pending.
- Companion Fabric client mod for Minecraft 1.21.1: in-game Right Shift menu, loaded-mod list, FPS/heap readout and FPS HUD toggle.

## Not implemented / still in development

- Microsoft token refresh and a complete multi-account profile manager.
- Forge, NeoForge and Quilt loader installation.
- Broader cross-mod conflict analysis and modpack import/export.
- Curated 100+ mod catalogue with categorized profiles, dependency/conflict resolution and full automated compatibility testing; the new low-end packs are an initial curated batch and may skip unavailable versions.
- HD cape upload, rendering and account-backed cosmetics sync service; account sync is selected in the UI, but the authenticated cosmetics API/storage service and companion-mod rendering are not implemented.
- Full live mod configuration, draggable HUD editor, HUD persistence and nametag/chat rendering; current Studio switches are preference scaffolding.
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

No project license has been selected or added. The repository is public for source visibility, but do not assume permission to reuse, redistribute or publish modified copies until a license is chosen.

## Disclaimer

Minecraft is a trademark of Mojang Studios. Vampire Client is an independent community project and is not affiliated with, endorsed by, or sponsored by Mojang Studios or Microsoft.

**Vampire Studios** ❤️
