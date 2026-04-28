export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(request) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const pathStart = request.url.indexOf("/", 8);
    const targetUrl =
      pathStart === -1 ? TARGET_BASE + "/" : TARGET_BASE + request.url.slice(pathStart);

    const outgoingHeaders = new Headers();
    let clientIpAddress = null;
    for (const [key, value] of request.headers) {
      if (STRIP_HEADERS.has(key)) continue;
      if (key.startsWith("x-vercel-")) continue;
      if (key === "x-real-ip") {
        clientIpAddress = value;
        continue;
      }
      if (key === "x-forwarded-for") {
        if (!clientIpAddress) clientIpAddress = value;
        continue;
      }
      outgoingHeaders.set(key, value);
    }
    if (clientIpAddress) outgoingHeaders.set("x-forwarded-for", clientIpAddress);

    const requestMethod = request.method;
    const hasRequestBody = requestMethod !== "GET" && requestMethod !== "HEAD";

    return await fetch(targetUrl, {
      method: requestMethod,
      headers: outgoingHeaders,
      body: hasRequestBody ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (error) {
    console.error("relay error:", error);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
