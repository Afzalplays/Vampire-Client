# 🧛 Vampire Client

**A cross-platform Minecraft Java launcher in development by Vampire Studios.**

Vampire Client is being built with a red-and-black glassmorphism interface, account management, Minecraft version installation, Modrinth mod discovery and a Feather-inspired in-game Right Shift menu.

## Current implementation (v0.3.0 preview)

- Electron + React + TypeScript desktop launcher.
- Glass UI, Vampire Studios splash screen, Home, Versions, Mods, Accounts and Settings pages.
- Official Minecraft version manifest and vanilla game installation through XMCL.
- Fabric loader installation for supported Minecraft versions.
- Minecraft process launch integration with configurable Java path and RAM allocation.
- Offline local profiles for single-player and servers that explicitly allow offline-mode connections.
- Microsoft device-code authentication flow, Xbox/Minecraft token exchange and Java entitlement check. Requires your own public Microsoft app Client ID; see [Microsoft login setup](docs/MICROSOFT_LOGIN_SETUP.md). End-to-end account sign-in still needs a real account test.
- Modrinth project search and compatible Fabric JAR download.
- Per-version mod folders, installed-mod list, enable/disable and remove actions.
- One-click Sodium/VulkanMod renderer switching for Fabric instances; the two renderer mods are kept mutually exclusive.
- Modrinth downloads are restricted to the official HTTPS CDN, checksum-verified, and limited to 150 MB per file.
- Electron renderer isolation, sandboxing, restricted external navigation and encrypted Microsoft token storage when OS secure storage is available.
- Desktop Right Shift quick menu.
- Companion Fabric client mod for Minecraft 1.21.1: in-game Right Shift menu, loaded-mod list, FPS/heap readout and FPS HUD toggle.

## Not implemented / still in development

- Microsoft token refresh and a complete multi-account profile manager.
- Forge, NeoForge and Quilt loader installation.
- Mod updates, dependency resolution, conflict detection and modpack import/export.
- Full live mod configuration and HUD editor.
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

Windows setup assets use the name format `VampireClient-Setup-<version>-<arch>.exe`. Builds must pass and be tested before a release is considered ready. No verified public installer release has been published yet.

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
