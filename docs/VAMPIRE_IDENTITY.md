# Vampire Identity & Chat Styling

## Implemented behavior

Vampire Identity is a client-side cosmetic system. It stores local preferences in `config/vampire-identity.properties`:

- Chat-name gradient toggle and two validated six-digit HEX gradient endpoints.
- Overhead nametag gradient preference (the renderer hook is not implemented yet).
- Local chat badge visibility preference.
- Built-in font presets: Minecraft Default, Minecraft Uniform and Minecraft Alt.

The Fabric companion mod now hooks both unsigned and signed `ChatHud.addMessage` entry points. When an incoming chat line begins with the exact local player's username in the standard `<username> message` or `username: message` format, the client styles that local username with the selected gradient/font and optional badge. Other players' messages are left unchanged. Chat body text is retained as plain text when the local prefix is rebuilt, so any original rich formatting within that message body is not preserved by this local prefix transformation.

## Visibility and compatibility

These are local rendering preferences. The current chat hook recognizes only the local account name; it does not detect other people running Vampire Client. It does not send cosmetics to servers or other players, and it cannot force unmodified clients to render a gradient. Displaying another Vampire user's cosmetics requires a compatible client handshake or a trusted cosmetics service, and may require server-side metadata.

## Remaining implementation

- Player overhead nametag renderer hook and in-game controls for its appearance.
- Detection/handshake for other Vampire Client users and cross-client cosmetics synchronization.
- Arbitrary TTF/OTF font loading and custom font management.

The chat mixin is version-specific to Minecraft 1.21.1 and must pass the Fabric build and in-game smoke tests before being treated as verified at runtime.
