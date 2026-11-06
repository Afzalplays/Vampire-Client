# Vampire Identity & Chat Styling

## Feature behavior

Vampire Identity is a client-side cosmetic system. It stores the local player's identity preferences in `config/vampire-identity.properties`:

- Gradient enablement for chat names and overhead nametags.
- Two validated six-digit HEX gradient endpoints.
- Client badge visibility preference.
- A font preset identifier.

The companion mod also provides `VampireIdentity.gradientText(String)`, which builds per-character Minecraft text styles using linear RGB interpolation. This is the shared rendering primitive intended for the chat and nametag hooks.

## Visibility and compatibility

These are local rendering preferences. They do not prove that another player is running Vampire Client, and they do not force other clients to render a gradient. To display a Vampire badge or a player's selected style to other Vampire users, a future compatible client handshake or trusted cosmetics service is required. A server plugin may be needed for server-authoritative identity metadata.

## Remaining implementation

The current commit adds the persistent preference model and gradient text renderer utility. It does not yet hook Minecraft's chat-line and entity-label render paths, expose the full in-game editor, or load arbitrary TTF/OTF files. Those require version-specific mixins and renderer testing. Until those hooks are added, existing vanilla chat and nametags remain unchanged.
