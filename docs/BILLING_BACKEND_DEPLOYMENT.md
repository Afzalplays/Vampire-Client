# Private billing backend deployment

This repository contains backend code and SQL only. The desktop app must call a separately deployed HTTPS API; it must never receive a Supabase service-role key, FamGateway key, database password, or owner secret.

## 1. Supabase database

Create a private Supabase project and run `supabase/migrations/202611060001_vampire_billing.sql` in its SQL editor. The migration creates a server-owned product catalogue, pending orders, entitlements, audit records, unique provider-order/UTR/transaction constraints, and an atomic payment fulfilment RPC. RLS is enabled without client policies: only the private service-role backend accesses billing tables.

Create the owner account through Supabase Auth, then set its UUID as `VAMPIRE_OWNER_USER_ID` in the backend environment. Do not identify the owner by email supplied by the client.

## 2. Private backend environment

Set these variables only in the backend host's secret manager:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (high privilege; never ship to clients)
- `VAMPIRE_OWNER_USER_ID` (Supabase Auth UUID)
- `VAMPIRE_BACKEND_PUBLIC_URL` (public HTTPS base URL)
- `VAMPIRE_ALLOWED_ORIGINS` (comma-separated exact HTTPS origins permitted to call the browser API)
- `FAMGATEWAY_API_KEY` (also FamGateway webhook HMAC secret)
- `PORT` (optional; defaults to 8787)

## 3. Service and HTTP API

`server/payment-service.mjs` validates Supabase access tokens by calling Supabase Auth, derives the user UUID from the verified identity, loads product prices from the database, creates FamGateway orders, stores them against the authenticated user, returns only checkout data, exposes a user's own order/entitlement reads, enforces owner UUID checks for product management, and fulfils payments only after HMAC plus FamGateway server-to-server verification and an atomic database RPC.

`node server/http.mjs` starts the HTTP router on loopback port 8787. Put it behind a TLS reverse proxy and firewall. Routes:
- `GET /health`, `GET /v1/products`
- `POST /v1/orders`, `GET /v1/orders`, `GET /v1/entitlements`
- `GET /v1/admin/products`, `PUT /v1/admin/products` (owner UUID required)
- `POST /webhooks/famgateway` (raw-body HMAC verification)

The router limits JSON bodies to 16 KiB, applies a basic per-process IP request limit, requires exact CORS origins when browser Origin headers are present, uses no-store/security headers, and never trusts client-supplied prices or roles. For production, also configure a distributed rate limiter/WAF at the reverse proxy and set a narrow CORS allowlist. The per-process limiter is not a substitute for edge protection.

## 4. Still required before accepting money

The desktop login-token handoff and checkout UI, owner dashboard UI, payment reconciliation worker, operational monitoring, key rotation and end-to-end sandbox/live tests still need implementation. Do not expose the service-role key or FamGateway key to the launcher. Do not accept live payments until the database migration is applied, an owner account is configured, TLS and edge protection are deployed, and real end-to-end tests pass. Verify FamGateway's terms, legal entity, settlement and refund procedures independently.
