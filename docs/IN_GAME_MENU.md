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
- The Mods screen lists loaded Fabric mods and their versions. It displays up to nine entries at a time; use the mouse wheel over the list to browse longer lists. A range indicator shows which entries are currently visible.
- The Performance screen displays current FPS and Java heap usage, with a short sampling-based performance view.
- HUD settings provide an FPS/heap overlay with configurable visibility, scale, padding and screen position.
- Vampire Identity settings include local chat-prefix styling options such as a badge, gradient colors and font preset.
- The saved gradient preference also styles visible player nameplates locally while preserving their text styles.

## Current limitations

- Identity styling is local; it is not a server-wide or account-synced cosmetic system.
- Remote Vampire Client identity detection, account-synced cosmetics and per-player remote cosmetic selection are not implemented. The current gradient is a local display effect applied to all visible player nameplates.
- The companion mod does not yet implement live mod configuration screens, arbitrary mod enable/disable while Minecraft is running, a full drag-and-drop HUD editor, or Sodium/VulkanMod switching. Those features require their own safe integration and restart handling.
