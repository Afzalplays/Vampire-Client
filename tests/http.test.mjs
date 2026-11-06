import test from "node:test";
import assert from "node:assert/strict";
import { createBillingHttpServer } from "../server/http.mjs";

async function withServer(run) {
  const calls = [];
  const service = {
    listProducts: async options => [{ id: "cape", active: true, owner: Boolean(options?.includeInactive) }],
    authenticate: async token => ({ id: token === "owner-token-123456789012" ? "owner" : "customer" }),
    createOrder: async (token, productId) => { calls.push(["createOrder", token, productId]); return { orderId: "fg_ABC12345", checkoutUrl: "https://famgateway.in/pay.php?order_id=fg_ABC12345" }; },
    getMyOrders: async token => [{ token }],
    getEntitlements: async token => [{ key: "cape.premium", token }],
    saveProduct: async (user, body) => { if (user.id !== "owner") throw new Error("Owner permission required."); return { success: true }; },
    handleWebhook: async (raw, signature) => { calls.push(["webhook", raw.toString(), signature]); return { success: true }; },
  };
  const server = createBillingHttpServer({ service, allowedOrigins: ["https://vampire.example"] });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run("http://127.0.0.1:" + server.address().port, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("billing router exposes public catalogue and authenticated order reads", async () => {
  await withServer(async (base) => {
    const products = await fetch(base + "/v1/products");
    assert.equal(products.status, 200);
    assert.equal((await products.json()).products[0].id, "cape");
    const denied = await fetch(base + "/v1/orders");
    assert.equal(denied.status, 401);
    const orders = await fetch(base + "/v1/orders", { headers: { Authorization: "Bearer customer-token-123456789012" } });
    assert.equal(orders.status, 200);
    assert.equal((await orders.json()).orders[0].token, "customer-token-123456789012");
  });
});

test("billing router enforces CORS and owner-only admin writes", async () => {
  await withServer(async (base) => {
    const blocked = await fetch(base + "/v1/products", { headers: { Origin: "https://evil.example" } });
    assert.equal(blocked.status, 403);
    const allowed = await fetch(base + "/v1/products", { headers: { Origin: "https://vampire.example" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://vampire.example");
    const denied = await fetch(base + "/v1/admin/products", { method: "PUT", headers: { Authorization: "Bearer customer-token-123456789012", "Content-Type": "application/json" }, body: JSON.stringify({ id: "cape" }) });
    assert.equal(denied.status, 403);
    const allowedAdmin = await fetch(base + "/v1/admin/products", { method: "PUT", headers: { Authorization: "Bearer owner-token-123456789012", "Content-Type": "application/json" }, body: JSON.stringify({ id: "cape" }) });
    assert.equal(allowedAdmin.status, 200);
  });
});

test("billing router passes raw webhook body to signature validator without parsing", async () => {
  await withServer(async (base, calls) => {
    const raw = '{"signed":"body"}';
    const response = await fetch(base + "/webhooks/famgateway", { method: "POST", headers: { "Content-Type": "application/json", "X-FamGateway-Signature": "a".repeat(64) }, body: raw });
    assert.equal(response.status, 200);
    assert.deepEqual(calls[0], ["webhook", raw, "a".repeat(64)]);
  });
});

test("billing router rejects oversized JSON bodies", async () => {
  await withServer(async (base) => {
    const response = await fetch(base + "/v1/orders", { method: "POST", headers: { Authorization: "Bearer customer-token-123456789012", "Content-Type": "application/json" }, body: JSON.stringify({ productId: "x".repeat(20_000) }) });
    assert.equal(response.status, 413);
  });
});
