# Payments and billing security

## Billing source of truth

Vampire Client uses the existing Vampire Nodes billing panel:

**https://billing.vampirenodes.in/**

The billing panel owns the product catalogue, prices, customer orders, payment status, FamGateway checkout, webhook verification, refunds, and account entitlements. Vampire Client must not duplicate those systems or maintain a second payment database.

## Desktop launcher boundary

- The launcher opens the fixed HTTPS billing-panel URL through Electron's main process.
- Payment credentials, gateway API keys, webhook secrets, database credentials, and owner/admin credentials must never be bundled in the launcher.
- The launcher must not accept a browser redirect as proof of payment or unlock paid features based only on client-side state.
- Future entitlement display or account linking must use the billing panel's documented, authenticated API contract. Do not guess route names, request fields, authentication schemes, or response formats.
- Until the billing panel API contract is supplied and verified, checkout and account management remain on the billing website; no payment integration is claimed inside the launcher.

## Operational requirements

Before adding in-launcher entitlement synchronization, obtain the billing panel's official API documentation and confirm:
1. Customer authentication and secure account-linking flow.
2. Product and entitlement identifiers returned by the billing service.
3. Order lookup and authoritative paid-status semantics.
4. Rate limits, error responses, and token expiry/revocation behavior.
5. Server-side verification rules and support contact for integration testing.

Never place a billing-panel session cookie, API secret, FamGateway key, or privileged token in renderer storage or source code. Do not trust user-editable local files or client-supplied prices when deciding whether an account owns a paid entitlement.
