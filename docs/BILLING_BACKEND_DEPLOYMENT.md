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
- `FAMGATEWAY_API_KEY` (also FamGateway webhook HMAC secret)

## 3. Service layer

`server/payment-service.mjs` validates Supabase access tokens by calling Supabase Auth, derives the user UUID from the verified identity, loads product prices from the database, creates FamGateway orders, stores them against the authenticated user, returns only checkout data, exposes a user's own order/entitlement reads, enforces owner UUID checks for product management, and fulfils payments only after HMAC plus FamGateway server-to-server verification and an atomic database RPC.

## 4. Still required before accepting money

The HTTP router, TLS/reverse-proxy deployment, CORS allowlist, per-user/IP rate limiting, login UI/API token handoff, payment-return page, operational monitoring, key rotation and end-to-end sandbox/live tests still need implementation. Do not expose this service layer directly as a public endpoint until the router enforces request-size limits, origin policy, auth, rate limits and webhook raw-body handling. Seed products only after confirming prices and entitlement names. Verify FamGateway's terms, legal entity, settlement and refund procedures independently.
