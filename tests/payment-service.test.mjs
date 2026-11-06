import test from "node:test";
import assert from "node:assert/strict";
import { VampireBillingService } from "../server/payment-service.mjs";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "private-service-role-key",
  FAMGATEWAY_API_KEY: "test_famgateway_key_123456789",
  VAMPIRE_BACKEND_PUBLIC_URL: "https://billing.example.com",
  VAMPIRE_OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
};

test("billing service refuses insecure or missing server configuration", () => {
  assert.throws(() => new VampireBillingService({ env: { ...env, VAMPIRE_BACKEND_PUBLIC_URL: "http://billing.example.com" } }), /HTTPS/);
  assert.throws(() => new VampireBillingService({ env: { ...env, SUPABASE_SERVICE_ROLE_KEY: "" } }), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("owner check is server-side and denies ordinary accounts", async () => {
  const service = new VampireBillingService({ env, gateway: {} });
  await assert.rejects(service.requireOwner({ id: "00000000-0000-4000-8000-000000000002" }), /Owner permission/);
  await service.requireOwner({ id: env.VAMPIRE_OWNER_USER_ID });
});

test("product validation rejects client-controlled invalid price and entitlement", async () => {
  const service = new VampireBillingService({ env, gateway: {} });
  const owner = { id: env.VAMPIRE_OWNER_USER_ID };
  await assert.rejects(service.saveProduct(owner, { id: "cape", title: "Cape", pricePaise: 1, entitlementKey: "cape.premium" }), /INR price/);
  await assert.rejects(service.saveProduct(owner, { id: "cape", title: "Cape", pricePaise: 10000, entitlementKey: "../admin" }), /entitlement/);
});

test("normal account cannot request inactive product catalogue", async () => {
  const service = new VampireBillingService({ env, gateway: {} });
  await assert.rejects(service.listProducts({ includeInactive: true, user: { id: "00000000-0000-4000-8000-000000000002" } }), /Owner permission/);
});
