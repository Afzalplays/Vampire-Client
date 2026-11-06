import { FamGatewayClient, validateSuccessfulPayment, verifyFamGatewaySignature } from "./famgateway.mjs";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.length < 8) throw new Error(name + " is not configured on the private backend.");
  return value;
}

export class VampireBillingService {
  constructor({ fetchImpl = fetch, gateway, env = process.env } = {}) {
    this.fetchImpl = fetchImpl;
    this.env = env;
    this.base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    this.anonKey = requiredEnv("SUPABASE_ANON_KEY");
    this.serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    this.ownerId = env.VAMPIRE_OWNER_USER_ID || "";
    this.gateway = gateway || new FamGatewayClient({ apiKey: requiredEnv("FAMGATEWAY_API_KEY"), fetchImpl });
    this.publicBackendUrl = requiredEnv("VAMPIRE_BACKEND_PUBLIC_URL");
    const publicUrl = new URL(this.publicBackendUrl);
    if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password) throw new Error("VAMPIRE_BACKEND_PUBLIC_URL must be HTTPS.");
  }

  async db(path, { method = "GET", body, prefer, query = "" } = {}) {
    const response = await this.fetchImpl(this.base + "/rest/v1/" + path + query, {
      method,
      redirect: "error",
      headers: {
        apikey: this.serviceKey,
        Authorization: "Bearer " + this.serviceKey,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("Billing database request failed (" + response.status + ").");
    if (response.status === 204) return null;
    return response.json();
  }

  async authenticate(accessToken) {
    if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192) throw new Error("Sign-in is required.");
    const response = await this.fetchImpl(this.base + "/auth/v1/user", {
      headers: { apikey: this.anonKey, Authorization: "Bearer " + accessToken },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Your sign-in session is invalid or expired.");
    const user = await response.json();
    if (typeof user?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error("The identity provider returned an invalid account.");
    return { id: user.id, email: typeof user.email === "string" ? user.email : null };
  }

  async requireOwner(user) {
    if (!this.ownerId || user.id.toLowerCase() !== this.ownerId.toLowerCase()) throw new Error("Owner permission required.");
  }

  async listProducts({ includeInactive = false, user } = {}) {
    if (includeInactive) await this.requireOwner(user);
    const rows = await this.db("vampire_products", { query: "?select=product_key,title,description,price_paise,active&order=title.asc" });
    return rows.filter(row => includeInactive || row.active).map(row => ({
      id: row.product_key, title: row.title, description: row.description,
      pricePaise: Number(row.price_paise), active: row.active,
    }));
  }

  async saveProduct(user, product) {
    await this.requireOwner(user);
    const id = String(product?.id || "");
    const title = String(product?.title || "").trim();
    const description = String(product?.description || "");
    const entitlement = String(product?.entitlementKey || "");
    const pricePaise = Number(product?.pricePaise);
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)) throw new Error("Invalid product ID.");
    if (!title || title.length > 100 || description.length > 500) throw new Error("Invalid product text.");
    if (!/^[a-z0-9][a-z0-9_.:-]{1,95}$/.test(entitlement)) throw new Error("Invalid entitlement key.");
    if (!Number.isSafeInteger(pricePaise) || pricePaise < 100 || pricePaise > 10_000_000) throw new Error("Invalid INR price.");
    await this.db("vampire_products", { method: "POST", query: "?on_conflict=product_key", prefer: "resolution=merge-duplicates,return=minimal",
      body: { product_key: id, title, description, entitlement_key: entitlement, price_paise: pricePaise, active: product.active === true, updated_at: new Date().toISOString() } });
    await this.db("vampire_billing_audit", { method: "POST", prefer: "return=minimal",
      body: { actor_user_id: user.id, action: "product.upsert", target: id } });
    return { success: true };
  }

  async createOrder(accessToken, productId) {
    const user = await this.authenticate(accessToken);
    if (typeof productId !== "string" || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(productId)) throw new Error("Invalid product.");
    const products = await this.db("vampire_products", { query: "?select=product_key,title,price_paise,active&product_key=eq." + encodeURIComponent(productId) + "&limit=1" });
    const product = products[0];
    if (!product || !product.active) throw new Error("This product is unavailable.");
    const amountPaise = Number(product.price_paise);
    const order = await this.gateway.createOrder({
      amountPaise,
      customerName: user.email || "Vampire Client user",
      customerEmail: user.email || undefined,
      redirectUrl: this.publicBackendUrl + "/payment-return",
      webhookUrl: this.publicBackendUrl + "/webhooks/famgateway",
    });
    if (order.payableAmountPaise < amountPaise || order.payableAmountPaise > amountPaise + 100) throw new Error("Gateway payable amount is outside the permitted adaptive amount range.");
    await this.db("vampire_payment_orders", { method: "POST", prefer: "return=minimal", body: {
      user_id: user.id, product_key: product.product_key, provider: "famgateway",
      provider_order_id: order.orderId, amount_paise: amountPaise,
      payable_amount_paise: order.payableAmountPaise, status: "pending",
    } });
    return { orderId: order.orderId, checkoutUrl: order.checkoutUrl, amountPaise, payableAmountPaise: order.payableAmountPaise, expiresAt: order.expiresAt };
  }

  async getMyOrders(accessToken) {
    const user = await this.authenticate(accessToken);
    const rows = await this.db("vampire_payment_orders", { query: "?select=provider_order_id,product_key,amount_paise,payable_amount_paise,status,created_at,paid_at&user_id=eq." + encodeURIComponent(user.id) + "&order=created_at.desc&limit=50" });
    return rows.map(row => ({ orderId: row.provider_order_id, productId: row.product_key, amountPaise: Number(row.amount_paise),
      payableAmountPaise: Number(row.payable_amount_paise), status: row.status, createdAt: row.created_at, paidAt: row.paid_at }));
  }

  async getEntitlements(accessToken) {
    const user = await this.authenticate(accessToken);
    const rows = await this.db("vampire_entitlements", { query: "?select=entitlement_key,granted_at&user_id=eq." + encodeURIComponent(user.id) });
    return rows.map(row => ({ key: row.entitlement_key, grantedAt: row.granted_at }));
  }

  async handleWebhook(rawBody, signature) {
    const key = requiredEnv("FAMGATEWAY_API_KEY");
    if (!verifyFamGatewaySignature(rawBody, signature, key)) throw new Error("Invalid webhook signature.");
    let payload;
    try { payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody); }
    catch { throw new Error("Invalid webhook JSON."); }
    const event = validateSuccessfulPayment(payload, {
      orderId: payload.order_id,
      amountPaise: Math.round(Number(payload.amount) * 100),
      payableAmountPaise: Math.round(Number(payload.payable_amount ?? payload.amount) * 100),
    });
    const verified = await this.gateway.verifyOrder(event.orderId);
    if (verified.status !== "success") throw new Error("FamGateway server-side verification is not successful.");
    if (verified.amountPaise !== event.payableAmountPaise) throw new Error("Verified settlement amount does not match the signed webhook.");
    if (verified.utr && verified.utr !== event.utr) throw new Error("Verified UTR does not match the signed webhook.");
    const result = await this.db("rpc/vampire_complete_payment", { method: "POST", body: {
      p_provider_order_id: event.orderId,
      p_amount_paise: event.amountPaise,
      p_payable_amount_paise: event.payableAmountPaise,
      p_utr: event.utr,
      p_transaction_id: event.transactionId || "",
    } });
    return { success: true, result };
  }
}
