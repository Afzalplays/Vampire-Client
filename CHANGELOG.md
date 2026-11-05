# Changelog

All notable Vampire Client changes are recorded here.

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

- Microsoft sign-in has not yet been tested with the project owner's registered Client ID.
- Game installation and launch code compiles but still requires testing on a real Windows PC and Minecraft account.
- Forge, NeoForge and Quilt are not yet supported by the launcher runtime.
- Mod updates, dependency resolution, conflict detection and modpacks are not implemented.
- Sodium/VulkanMod profile switching and full HUD editing are not implemented.
- Android is a separate future project.
- No final public installer release has been published.
