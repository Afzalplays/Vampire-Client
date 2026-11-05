# 🧛 Vampire Client

**An open-source-in-development Minecraft Java launcher by Vampire Studios.**

Vampire Client is being built around a modern glassmorphism interface, performance-focused profiles and a convenient mod discovery experience.

## Current preview
- React + TypeScript + Electron desktop shell.
- Red-and-black glass UI with Home, Versions, Mods, Accounts and Settings pages.
- Modrinth project search through its public API.
- Right Shift launcher quick menu.
- Local offline profile name and RAM/version preview controls.
- Companion Fabric client mod source in `game-mod/` for an in-game Right Shift quick menu (Minecraft 1.21.1).

## Development status
This is an early preview, not a complete Minecraft launcher. The following are **not implemented yet**:
- Microsoft device-code login and Minecraft Java entitlement verification (requires your own public app Client ID; see `docs/MICROSOFT_LOGIN_SETUP.md`).
- Downloading Minecraft assets/libraries and launching the game.
- Installing, updating, enabling or removing mod files from the game directory.
- A fully featured mod configuration/HUD editor.
- Sodium/VulkanMod profile installation and switching.
- Android application.

Offline profile names are for servers that explicitly permit offline-mode connections. They do not authenticate Minecraft ownership or grant access to online-mode/premium servers.

## Desktop platforms
Packaging workflow is provided for Windows x64 and x86, Linux x64 (AppImage/DEB), and macOS. Builds must complete in GitHub Actions before installers can be considered available. macOS signing/notarization and Linux ARM64 packaging are not configured yet.

## Run locally
Requirements: Node.js 22 or later and npm.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
```

Package on the matching operating system:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

The GitHub Actions workflow can be started manually from the Actions tab or by pushing a version tag beginning with `v`. Tag pushes build platform artifacts and publish a GitHub Release. Windows setup packages are named `VampireClient-Setup-<version>-<arch>.exe`; portable packages are separate.

## In-game Right Shift menu (Fabric)
The companion module source targets Minecraft 1.21.1 and Java 21. Open `game-mod/` with a compatible Gradle installation and run:

```bash
gradle build
```

The initial companion menu is a functional screen/shortcut shell; Mods, Performance and HUD subpages are placeholders until their integrations are implemented. Install Fabric Loader and Fabric API for the matching Minecraft version before testing the mod.

See [docs/IN_GAME_MENU.md](docs/IN_GAME_MENU.md) for building and testing the in-game Right Shift menu.\n\n## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md). Please report bugs through GitHub Issues and never commit secrets, account tokens or session files.

## Project license
No open-source license has been selected or added yet. Until a license is added, do not assume permission to redistribute or publish modified copies.

## Disclaimer
Minecraft is a trademark of Mojang Studios. Vampire Client is an independent community project and is not affiliated with, endorsed by, or sponsored by Mojang Studios or Microsoft.

**Vampire Studios** ❤️


## Official project website

The website source is in [website/](website/). GitHub Pages deployment is automated with [pages.yml](.github/workflows/pages.yml). After enabling **Settings → Pages → Build and deployment → GitHub Actions**, the site is published at:

https://afzalplays.github.io/Vampire-Client/

The website intentionally links to GitHub Releases and does not claim that installers exist until a verified release is published.
