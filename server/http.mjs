import { createServer } from "node:http";

const MAX_BODY_BYTES = 16 * 1024;
const WINDOW_MS = 60_000;
const RATE_LIMIT = 30;

function send(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body too large."), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function bearer(request) {
  const header = request.headers.authorization || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{20,8192})$/.exec(header);
  if (!match) throw Object.assign(new Error("Sign-in is required."), { statusCode: 401 });
  return match[1];
}

function jsonBody(raw) {
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error("A valid JSON object is required."), { statusCode: 400 });
  }
}

export function createBillingHttpServer({ service, allowedOrigins = [], clock = () => Date.now() }) {
  if (!service) throw new TypeError("Billing service is required.");
  const origins = new Set(allowedOrigins);
  const hits = new Map();

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const cors = {};
    if (origin) {
      if (!origins.has(origin)) return send(response, 403, { error: "origin_not_allowed" });
      cors["Access-Control-Allow-Origin"] = origin;
      cors["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-FamGateway-Signature";
      cors["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS";
      cors.Vary = "Origin";
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...cors, "Cache-Control": "no-store" });
      return response.end();
    }

    const ip = request.socket.remoteAddress || "unknown";
    const now = clock();
    const prior = hits.get(ip) || [];
    const recent = prior.filter(time => now - time < WINDOW_MS);
    if (recent.length >= RATE_LIMIT) return send(response, 429, { error: "rate_limited" }, cors);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) {
      for (const [key, times] of hits) if (!times.some(time => now - time < WINDOW_MS)) hits.delete(key);
    }

    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { status: "ok" }, cors);
      if (request.method === "GET" && url.pathname === "/payment-return") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
        return response.end("<!doctype html><meta charset=utf-8><title>Vampire Client payment</title><meta name=viewport content='width=device-width,initial-scale=1'><main style='font:16px system-ui;max-width:32rem;margin:15vh auto;padding:2rem;color:#eee;background:#17131a;border-radius:16px'><h1>Payment submitted</h1><p>Return to Vampire Client and check your order status. Access is granted only after server verification.</p></main>");
      }
      if (request.method === "GET" && url.pathname === "/v1/products") {
        return send(response, 200, { products: await service.listProducts() }, cors);
      }
      if (request.method === "POST" && url.pathname === "/webhooks/famgateway") {
        const raw = await readBody(request);
        const result = await service.handleWebhook(raw, request.headers["x-famgateway-signature"]);
        return send(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/orders") {
        const raw = await readBody(request);
        const body = jsonBody(raw);
        const order = await service.createOrder(bearer(request), body.productId);
        return send(response, 201, { order });
      }
      if (request.method === "GET" && url.pathname === "/v1/orders") {
        return send(response, 200, { orders: await service.getMyOrders(bearer(request)) }, cors);
      }
      if (request.method === "GET" && url.pathname === "/v1/entitlements") {
        return send(response, 200, { entitlements: await service.getEntitlements(bearer(request)) }, cors);
      }
      if (url.pathname === "/v1/admin/products" && request.method === "GET") {
        const user = await service.authenticate(bearer(request));
        return send(response, 200, { products: await service.listProducts({ includeInactive: true, user }) }, cors);
      }
      if (url.pathname === "/v1/admin/products" && request.method === "PUT") {
        const user = await service.authenticate(bearer(request));
        const body = jsonBody(await readBody(request));
        return send(response, 200, await service.saveProduct(user, body), cors);
      }
      return send(response, 404, { error: "not_found" }, cors);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : /Sign-in/.test(error?.message || "") ? 401 : /Owner permission/.test(error?.message || "") ? 403 : 400;
      return send(response, status, { error: status === 500 ? "internal_error" : "request_rejected", message: status >= 500 ? "Request failed." : error.message }, cors);
    }
  });
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const { VampireBillingService } = await import("./payment-service.mjs");
  const service = new VampireBillingService();
  const allowedOrigins = (process.env.VAMPIRE_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
  createBillingHttpServer({ service, allowedOrigins }).listen(port, "127.0.0.1", () => {
    process.stdout.write("Vampire billing API listening on 127.0.0.1:" + port + "\n");
  });
}
