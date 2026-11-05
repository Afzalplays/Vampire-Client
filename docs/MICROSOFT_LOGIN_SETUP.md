# Microsoft sign-in setup

Vampire Client uses Microsoft's public-client device-code flow. The launcher does not ask for or store your Microsoft password.

## 1. Create a public client app

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/) or [Azure portal](https://portal.azure.com/).
2. Create a new App registration named **Vampire Client**.
3. For supported account types, select **Personal Microsoft accounts only** (the launcher uses the `consumers` authority).
4. Open **Authentication** and enable **Allow public client flows**.
5. Copy the **Application (client) ID**. Do not create or distribute a client secret for this desktop public-client flow.

## 2. Add the client ID

1. Open Vampire Client → Accounts.
2. Paste the Application (client) ID into **Microsoft App Client ID**.
3. Click **Sign in with Microsoft**.
4. Follow the device-code message shown in the launcher status line and finish sign-in in your browser.

The launcher exchanges the Microsoft token for Xbox and Minecraft tokens, checks Minecraft Java entitlement, and reads the Minecraft profile before allowing official-account launch.

## 3. Security notes

- Never share Microsoft passwords, device codes, access tokens or refresh tokens.
- The app stores its Minecraft session using Electron `safeStorage` when the operating system provides secure credential storage. If secure storage is unavailable, the session remains in memory only and you will need to sign in again after restarting.
- Offline profiles are separate local identities and only work in single-player or on servers that explicitly allow offline-mode connections. They do not unlock premium online servers.
- If Microsoft sign-in returns an API permission/403 error, review the app registration and Minecraft API access requirements. Do not work around entitlement checks.
