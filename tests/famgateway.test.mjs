import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { FamGatewayClient, validateSuccessfulPayment, verifyFamGatewaySignature } from "../server/famgateway.mjs";

const key = "test_only_secret_key_1234567890";

test("FamGateway API key is required by the backend client", () => {
  assert.throws(() => new FamGatewayClient({ apiKey: "" }), /FAMGATEWAY_API_KEY/);
});

test("creates orders with integer paise and validates checkout origin", async () => {
  let request;
  const client = new FamGatewayClient({
    apiKey: key,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ status: "success", data: {
        order_id: "fg_ABC12345", amount: "149.00", payable_amount: "149.00",
        checkout_url: "https://famgateway.in/pay.php?order_id=fg_ABC12345"
      }}), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const order = await client.createOrder({ amountPaise: 14900, customerName: "Vampire user" });
  assert.equal(order.orderId, "fg_ABC12345");
  assert.equal(order.amountPaise, 14900);
  assert.equal(JSON.parse(request.options.body).amount, "149.00");
  assert.equal(request.options.headers["X-Api-Key"], key);
  assert.equal(new URL(request.url).origin, "https://famgateway.in");
});

test("rejects malformed amount, redirect and unexpected checkout host", async () => {
  const client = new FamGatewayClient({ apiKey: key, fetchImpl: async () => new Response(JSON.stringify({
    status: "success", data: { order_id: "fg_ABC12345", amount: "1.00", checkout_url: "https://evil.example/pay.php" }
  }), { status: 200 }) });
  await assert.rejects(client.createOrder({ amountPaise: 0 }), /Amount/);
  await assert.rejects(client.createOrder({ amountPaise: 100, redirectUrl: "http://localhost" }), /HTTPS/);
  await assert.rejects(client.createOrder({ amountPaise: 100 }), /unexpected checkout URL/);
});

test("verifies raw-body HMAC using constant-time comparison", () => {
  const raw = Buffer.from('{"event":"payment.success"}');
  const signature = createHmac("sha256", key).update(raw).digest("hex");
  assert.equal(verifyFamGatewaySignature(raw, signature, key), true);
  assert.equal(verifyFamGatewaySignature(raw, signature.toUpperCase(), key), true);
  assert.equal(verifyFamGatewaySignature(raw, "0".repeat(64), key), false);
  assert.equal(verifyFamGatewaySignature(Buffer.from("{}"), signature, key), false);
});

test("fulfilment validation rejects wrong order, wrong amount and invalid UTR", () => {
  const expected = { orderId: "fg_ABC12345", amountPaise: 14900 };
  const good = { event: "payment.success", status: "success", order_id: "fg_ABC12345", amount: 149, payable_amount: 149, utr: "123456789012" };
  assert.deepEqual(validateSuccessfulPayment(good, expected), {
    orderId: "fg_ABC12345", amountPaise: 14900, utr: "123456789012", transactionId: null
  });
  assert.throws(() => validateSuccessfulPayment({ ...good, order_id: "fg_OTHER123" }, expected), /order ID/);
  assert.throws(() => validateSuccessfulPayment({ ...good, amount: 99 }, expected), /amount/);
  assert.throws(() => validateSuccessfulPayment({ ...good, utr: "bad" }, expected), /UTR/);
});
