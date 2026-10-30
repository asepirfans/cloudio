const VAULT_SALT = 0x5a;

export function maskStreamUrl(url: string): string {
  if (!url) return "";
  try {
    const bytes = new TextEncoder().encode(url);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] ^= (VAULT_SALT + (i % 37));
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return "vlt_" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return "";
  }
}

export function unmaskStreamUrl(token: string): string | null {
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
