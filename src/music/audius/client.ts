/**
 * Audius API client — uses public discovery nodes, no API key required.
 * Discovery node list fetched dynamically from https://api.audius.co
 */

const AUDIUS_REGISTRY = "https://api.audius.co";
const APP_NAME = "Cloudio"; // app name for Audius API identification

let cachedNode: string | null = null;
let nodeExpiry = 0;

export async function getDiscoveryNode(): Promise<string> {
  if (cachedNode && Date.now() < nodeExpiry) return cachedNode;

  try {
    const res = await fetch(AUDIUS_REGISTRY, {
      next: { revalidate: 3600 },
    });
    const data = await res.json();
    const nodes: string[] = data.data;
    if (!nodes || nodes.length === 0) throw new Error("No nodes available");
    // Pick a random node for basic load distribution
    cachedNode = nodes[Math.floor(Math.random() * nodes.length)];
    nodeExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
    return cachedNode;
  } catch {
    // Fallback to known public node
    return "https://discoveryprovider.audius.co";
  }
}

export async function audiusFetch<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const node = await getDiscoveryNode();
  const url = new URL(`${node}${path}`);
  url.searchParams.set("app_name", APP_NAME);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Audius API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data as T;
}
