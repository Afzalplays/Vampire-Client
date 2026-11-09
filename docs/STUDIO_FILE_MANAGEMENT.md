# Studio file management

Vampire Client's Studio page includes per-instance file libraries for Replay Mod recordings and Minecraft schematics.

## Replay recordings

- Supported extension: `.mcpr`
- Maximum import size: 2 GB per file
- Instance directory: `replay_recordings/`
- Actions: import, list, remove and open folder

Use the Studio **Install Replay Mod** action on a compatible Fabric or Forge profile to resolve and install a Modrinth build plus required dependencies. Replay Mod itself performs recording and playback; Vampire Client manages the files but does not implement the recording engine.

## Schematics

- Supported extensions: `.litematic`, `.schem`, `.schematic`, `.nbt`
- Maximum import size: 128 MB per file
- Instance directory: `schematics/`
- Actions: import, list, remove and open folder

Use the Studio **Install Litematica** action on a Fabric profile to resolve and install Litematica plus required dependencies, or install another compatible schematic mod such as WorldEdit. The compatible mod performs preview and placement; importing a file does not place it into a world.

## Safety and isolation

- Every library is stored under the selected Minecraft instance, not in a shared global directory.
- The launcher copies the selected file; it does not extract archives or execute imported content.
- Only the extensions listed above are accepted. Filenames are sanitized and duplicate names receive a numeric suffix.
- Symbolic links are rejected. Oversized files and unsupported file types are refused.
- Removing a library entry deletes only that copied file from the selected instance.

These controls are file-management helpers, not a substitute for the file-format validation performed by the compatible Minecraft mod that opens the content.
