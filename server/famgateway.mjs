import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_URL = "https://famgateway.in";
const MAX_AMOUNT_PAISE = 10_000_000;

function normalizeAmount(amountPaise) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 100 || amountPaise > MAX_AMOUNT_PAISE) {
    throw new TypeError("Amount must be an integer number of paise between ₹1 and ₹100,000.");
  }
  return (amountPaise / 100).toFixed(2);
}

function safeOrderId(value) {
  const id = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new TypeError("Invalid FamGateway order ID.");
  return id;
}

export class FamGatewayClient {
  constructor({ apiKey = process.env.FAMGATEWAY_API_KEY, fetchImpl = fetch } = {}) {
    if (typeof apiKey !== "string" || apiKey.length < 16 || /\s/.test(apiKey)) {
      throw new Error("FAMGATEWAY_API_KEY is missing or malformed; configure it only on the private backend.");
    }
    if (typeof fetchImpl !== "function") throw new TypeError("A Fetch-compatible implementation is required.");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async request(path, options = {}) {
    const response = await this.fetchImpl(new URL(path, BASE_URL), {
      ...options,
      redirect: "error",
      signal: options.signal ?? AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/json",
        "X-Api-Key": this.apiKey,
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error("FamGateway request failed with HTTP " + response.status + ".");
    const body = await response.json();
    if (!body || typeof body !== "object") throw new Error("FamGateway returned an invalid response.");
    return body;
  }

  async createOrder({ amountPaise, customerName, customerEmail, customerPhone, redirectUrl, webhookUrl }) {
    const amount = normalizeAmount(amountPaise);
    const payload = { amount };
    if (customerName) payload.customer_name = String(customerName).slice(0, 80);
    if (customerEmail) payload.customer_email = String(customerEmail).slice(0, 254);
    if (customerPhone) payload.customer_phone = String(customerPhone).replace(/\D/g, "").slice(0, 10);
    for (const [key, value] of [["redirect_url", redirectUrl], ["webhook_url", webhookUrl]]) {
      if (value) {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) throw new TypeError(key + " must be an HTTPS URL without embedded credentials.");
        payload[key] = url.toString();
      }
    }
    const result = await this.request("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = result?.data;
    if (result?.status !== "success" || !data || typeof data.order_id !== "string" || typeof data.checkout_url !== "string") {
      throw new Error("FamGateway did not return a valid checkout order.");
    }
    const checkout = new URL(data.checkout_url);
    if (checkout.protocol !== "https:" || checkout.hostname !== "famgateway.in" || !checkout.pathname.startsWith("/pay.php")) {
      throw new Error("FamGateway returned an unexpected checkout URL; order was not exposed to the client.");
    }
    if (Number(data.amount) !== Number(amount)) throw new Error("FamGateway returned an amount that does not match the server order.");
    return {
      orderId: safeOrderId(data.order_id),
      checkoutUrl: checkout.toString(),
      amountPaise,
      payableAmount: typeof data.payable_amount === "string" ? data.payable_amount : amount,
      payableAmountPaise: Math.round(Number(data.payable_amount ?? amount) * 100),
      expiresAt: typeof data.expires_at_ist === "string" ? data.expires_at_ist : null,
    };
  }

  async verifyOrder(orderId) {
    const id = safeOrderId(orderId);
    const result = await this.request("/api/verify-order.php?order_id=" + encodeURIComponent(id));
    if (String(result?.order_id ?? id) !== id) throw new Error("FamGateway verification returned a mismatched order ID.");
    const status = String(result?.status ?? "").toLowerCase();
    if (!["success", "pending", "expired"].includes(status)) throw new Error("FamGateway returned an unknown payment status.");
    return {
      orderId: id,
      status,
      amountPaise: Number.isFinite(Number(result.amount)) ? Math.round(Number(result.amount) * 100) : null,
      utr: typeof result.utr === "string" ? result.utr : null,
      transactionId: typeof result.transaction_id === "string" ? result.transaction_id : null,
    };
  }
}

export function verifyFamGatewaySignature(rawBody, signature, apiKey) {
  if (!(typeof rawBody === "string" || Buffer.isBuffer(rawBody))) return false;
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (typeof apiKey !== "string" || !apiKey) return false;
  const expected = createHmac("sha256", apiKey).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function validateSuccessfulPayment(payload, expectedOrder) {
  if (!payload || payload.event !== "payment.success" || String(payload.status).toLowerCase() !== "success") {
    throw new Error("Webhook is not a successful payment event.");
  }
  const orderId = safeOrderId(payload.order_id);
  if (orderId !== expectedOrder.orderId) throw new Error("Webhook order ID does not match the pending order.");
  const amountPaise = Math.round(Number(payload.amount) * 100);
  const payablePaise = Math.round(Number(payload.payable_amount ?? payload.amount) * 100);
  const expectedPayablePaise = expectedOrder.payableAmountPaise ?? expectedOrder.amountPaise;
  if (!Number.isSafeInteger(amountPaise) || amountPaise !== expectedOrder.amountPaise || payablePaise !== expectedPayablePaise) {
    throw new Error("Webhook amount does not match the server-side order amount.");
  }
  const utr = String(payload.utr ?? "");
  if (!/^\d{8,24}$/.test(utr)) throw new Error("Webhook is missing a valid UTR.");
  return {
    orderId,
    amountPaise,
    utr,
    transactionId: typeof payload.transaction_id === "string" ? payload.transaction_id : null,
  };
}
