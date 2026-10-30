const CACHE_NAME = "cloudio-v9";

const VAULT_SALT = 0x5a;

function unmaskStreamUrl(token) {
  if (!token) return null;
  const raw = token.startsWith("vlt_") ? token.slice(4) : token;
  try {
    const pad = raw.length % 4;
    const base64 = (raw + (pad ? "=".repeat(4 - pad) : "")).replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) ^ (VAULT_SALT + (i % 37));
    }
    const url = new TextDecoder().decode(bytes);
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
  } catch {}
  return null;
}

const PRECACHE_ASSETS = [
  "/",
  "/library",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/logo-horizontal.png",
  "/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {
        // Pre-caching error handled gracefully
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Virtual stream interceptor: proxies masked stream requests directly to upstream resolver
  if (url.pathname.startsWith("/stream-vault/")) {
    let vault = url.searchParams.get("vault");
    if (!vault && url.pathname.startsWith("/stream-vault/media/")) {
      vault = url.pathname.slice("/stream-vault/media/".length).replace(/\.m4a$/, "");
    }
    const targetUrl = vault ? unmaskStreamUrl(vault) : null;
    if (targetUrl) {
      const headers = new Headers();
      const range = request.headers.get("Range");
      if (range) headers.set("Range", range);
      event.respondWith(
        fetch(targetUrl, {
          headers,
          cache: "no-store",
        })
      );
      return;
    }
  }

  // Do not cache API routes or stream endpoints (handled via IndexedDB)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Handle page navigations (HTML) -> Network first, fallback to cached page or home
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const cachedLibrary = await caches.match("/library");
          if (url.pathname.startsWith("/library") && cachedLibrary) return cachedLibrary;
          const cachedHome = await caches.match("/");
          if (cachedHome) return cachedHome;
          return new Response("Offline - Cloudio", {
            status: 503,
            headers: { "Content-Type": "text/plain" }
          });
        })
    );
    return;
  }

  // Handle static assets (_next/static, icons, styles) -> Cache first, background refresh
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch update in background to keep cache fresh
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
              }
            })
            .catch(() => {
              // Ignore background fetch failure when offline
            });
          return cachedResponse;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response("", { status: 404 });
          });
      })
    );
    return;
  }

  // Default fetch behavior
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
