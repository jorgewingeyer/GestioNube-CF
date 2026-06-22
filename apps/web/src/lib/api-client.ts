import { hc } from "hono/client";
import type { AppType } from "@repo/api/src/routers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifySession } from "@/lib/session";

/**
 * Hono RPC fetcher that injects Cloudflare Service Bindings and Auth headers.
 * This runs on every request made through the 'api' client.
 */
const customFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { env } = await getCloudflareContext({ async: true });

  // Service Binding "API" defined in wrangler.jsonc / wrangler.toml
  const bindings = env as {
    API?: {
      fetch: (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>;
    };
  };

  // 1. Prepare absolute URL for parsing
  let url: URL;
  const inputStr = input.toString();

  if (inputStr.startsWith("http")) {
    url = new URL(inputStr);
  } else {
    // Fallback for relative paths in some environments
    url = new URL(inputStr, "http://api.local");
  }

  // 2. Get current session and inject headers for authentication
  const session = await verifySession();
  const headers = new Headers(init?.headers);

  if (session && session.isAuth && session.userId) {
    headers.set("x-user-id", session.userId.toString());
    if (session.role) {
      headers.set("x-user-role", session.role);
    }
  }

  const newInit = { ...init, headers };

  // Helper to perform fetch against localhost (Fallback for local dev)
  const fetchLocal = async () => {
    // In local dev, Hono typically runs on 8787
    const localUrl = `http://127.0.0.1:8787${url.pathname}${url.search}`;
    return fetch(localUrl, newInit);
  };

  if (bindings?.API) {
    try {
      // Service Bindings expect a full valid URL
      const response = await bindings.API.fetch(url.toString(), newInit);

      // Handle cases where binding is defined but not active (Miniflare/Wrangler edge cases)
      if (!response.ok) {
        const clone = response.clone();
        const text = await clone.text();
        if (
          text.includes("Couldn't find") ||
          text.includes("Worker not found")
        ) {
          return fetchLocal();
        }
      }
      return response;
    } catch (e) {
      console.error("[Hono RPC] API binding fetch error:", e);
      return fetchLocal();
    }
  }

  // If no binding (typical in some dev setups), try localhost
  if (process.env.NODE_ENV === "development") {
    return fetchLocal();
  }

  throw new Error("API binding is missing");
};

/**
 * Static Hono RPC client.
 * Usage: import { api } from "@/lib/api-client";
 */
export const api = hc<AppType>("http://api.local/api", {
  fetch: customFetcher,
});

// Types for responses
export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};
