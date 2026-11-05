# In-game Right Shift menu

The companion mod is a Fabric client mod for Minecraft Java 1.21.1.

## Build

Requirements: Java 21 and Gradle 8.12 or later.

From the repository root:

```bash
cd game-mod
gradle build
```

The output JAR is created in `game-mod/build/libs/`.

## Install for testing

1. Install Minecraft Java 1.21.1.
2. Install Fabric Loader for Minecraft 1.21.1.
3. Install Fabric API for Minecraft 1.21.1.
4. Copy the Vampire Client JAR into that instance's `mods` folder.
5. Start the Fabric profile and press **Right Shift** in-game.

## Current menu

- Right Shift opens/closes the Vampire Quick Menu.
- Mods screen lists loaded Fabric mods and versions.
- Performance screen shows current FPS and Java heap usage.
- HUD settings can toggle a small Vampire FPS overlay.

The companion mod does not yet implement live mod configuration screens, arbitrary mod enable/disable while Minecraft is running, a full HUD editor, or Sodium/VulkanMod switching. Those features require their own safe integration and restart handling.
