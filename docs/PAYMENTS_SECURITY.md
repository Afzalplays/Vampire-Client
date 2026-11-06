# FamGateway payment integration — security boundary

Vampire Client is a public desktop application. **It must never contain the FamGateway API key, webhook signing secret, owner credential, database credential, or a privileged admin token.** The launcher can be reverse-engineered; obfuscation and hidden UI controls are not security boundaries.

## Implemented backend primitives

`server/famgateway.mjs` is a server-only adapter for the confirmed `https://famgateway.in` API. It:
- Requires `FAMGATEWAY_API_KEY` at server startup/use and sends it in the `X-Api-Key` header, never in a URL.
- Accepts amounts as integer paise, formats INR server-side, and validates the returned checkout URL host.
- Uses HTTPS-only redirect/webhook URLs and rejects redirects from the gateway API request.
- Verifies webhook HMAC-SHA256 over the exact raw request body with constant-time comparison.
- Validates successful webhook event, order ID, exact amount and UTR before the caller may fulfil an order.
- Exposes an authoritative server-to-server verification method.

## Required production architecture — not yet deployed

1. Deploy a separate HTTPS backend and database. Keep secrets in the host's secret manager/environment, not this repository.
2. Add real account authentication. Every order must be tied to an authenticated Minecraft account UUID or Vampire account ID. Never accept the buyer identity, product price, owner role or entitlement from the desktop client.
3. Store immutable server-side product IDs, INR prices in paise, order ID, user ID, status, expected amount, expiry, UTR and provider transaction ID. Enforce unique constraints on provider order ID, UTR and transaction ID.
4. Create orders only from a server-side product catalogue. The client receives only the order ID, checkout URL and display amount.
5. On webhook receipt, capture the raw body before JSON parsing, verify `X-FamGateway-Signature`, look up the pending order, verify event/order/amount, and call `verifyOrder(orderId)` server-to-server before granting anything. Use a database transaction and unique UTR constraint for idempotent fulfilment.
6. Add a reconciliation worker for missed webhooks. Re-check pending orders server-to-server; never grant from a browser redirect or client-side polling result alone.
7. Admin actions require a separate owner identity and server-side role check (prefer MFA/passkeys), audit logs, CSRF protection for browser sessions, rate limits and key rotation. Normal launcher users must not have admin endpoints or product/config editing permissions.
8. Collect only data needed for account ownership, order reconciliation and support. Never log API keys, raw payment payloads, UPI identifiers or access tokens. Define retention/deletion and incident-response procedures.

## Environment

Copy `.env.example` to a private deployment environment and set the real key there. Do not commit the real `.env`. Rotate the key immediately if it has ever been pasted into chat, an issue, logs, or a public repository.

## Current scope / important limitation

This commit adds and tests the provider adapter and validation primitives only. It does **not** create a live checkout UI, persistent order database, authenticated customer API, owner dashboard, entitlement service, webhook HTTP route, or deployed backend. Those require a chosen hosting/database and real account-authentication design. Do not accept real payments until those pieces and the provider's legal/operational suitability have been reviewed and tested.
