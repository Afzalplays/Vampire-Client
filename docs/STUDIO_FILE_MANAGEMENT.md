# Studio file management

Vampire Client's Studio page includes per-instance file libraries for Replay Mod recordings and Minecraft schematics.

## Replay recordings

- Supported extension: `.mcpr`
- Maximum import size: 2 GB per file
- Instance directory: `replay_recordings/`
- Actions: import, list, remove and open folder

Replay Mod must be installed in the selected Minecraft profile to record or play these files. Vampire Client does not implement the Replay Mod recording engine.

## Schematics

- Supported extensions: `.litematic`, `.schem`, `.schematic`, `.nbt`
- Maximum import size: 128 MB per file
- Instance directory: `schematics/`
- Actions: import, list, remove and open folder

Install a compatible schematic mod such as Litematica or WorldEdit to preview or place the files in-game. Importing a file does not place it into a world.

## Safety and isolation

- Every library is stored under the selected Minecraft instance, not in a shared global directory.
- The launcher copies the selected file; it does not extract archives or execute imported content.
- Only the extensions listed above are accepted. Filenames are sanitized and duplicate names receive a numeric suffix.
- Symbolic links are rejected. Oversized files and unsupported file types are refused.
- Removing a library entry deletes only that copied file from the selected instance.

These controls are file-management helpers, not a substitute for the file-format validation performed by the compatible Minecraft mod that opens the content.
