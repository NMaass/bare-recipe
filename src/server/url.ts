// URL canonicalization + safety guards.
//
// The catalog is keyed by a hash of the canonical URL, so dedup quality is
// only as good as canonicalization. We aim to be aggressive about removing
// tracking params and noise while preserving anything that could change the
// page content (path, meaningful query params, locale-bearing subdomains).

const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gclsrc$/i,
  /^dclid$/i,
  /^msclkid$/i,
  /^mc_eid$/i,
  /^mc_cid$/i,
  /^_ga$/i,
  /^_gl$/i,
  /^ref$/i,
  /^ref_$/i,
  /^source$/i,
  /^src$/i,
  /^pinned$/i,
  /^share$/i,
  /^igshid$/i,
  /^ck_subscriber_id$/i,
];

const PRIVATE_IPV4_PREFIXES = [
  "10.",
  "127.",
  "169.254.",
  "192.168.",
  "0.",
];

// 172.16.0.0/12
function isPrivate172(host: string): boolean {
  const match = host.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}

export interface CanonicalUrl {
  canonical: string;
  host: string;
}

export function isSafeUrl(input: string, options: { allowHttp?: boolean } = {}): boolean {
  try {
    const parsed = new URL(input);
    if (parsed.protocol === "https:") return true;
    if (options.allowHttp && parsed.protocol === "http:") return true;
    return false;
  } catch {
    return false;
  }
}

export function safeAbsoluteUrl(
  input: string | null | undefined,
  base?: string,
  options: { allowHttp?: boolean } = {}
): string | null {
  if (!input) return null;
  try {
    const parsed = base ? new URL(input, base) : new URL(input);
    const href = parsed.toString();
    return isSafeUrl(href, options) ? href : null;
  } catch {
    return null;
  }
}

export function canonicalizeUrl(input: string): CanonicalUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  // Always prefer https for the canonical key — most recipe sites redirect anyway.
  parsed.protocol = "https:";

  // Lowercase host. Leave the path case-sensitive (some CMSes care).
  parsed.hostname = parsed.hostname.toLowerCase();

  // Strip default ports.
  if (parsed.port === "443" || parsed.port === "80") parsed.port = "";

  // Drop fragment — never affects content.
  parsed.hash = "";

  // Filter tracking params, preserving the rest in sorted order so equivalent
  // URLs hash identically regardless of original ordering.
  const kept: [string, string][] = [];
  for (const [key, value] of parsed.searchParams) {
    if (TRACKING_PARAM_PATTERNS.some((re) => re.test(key))) continue;
    kept.push([key, value]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  parsed.search = "";
  for (const [k, v] of kept) parsed.searchParams.append(k, v);

  // Strip trailing slash from path (but not for the root "/").
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  // Drop "www." in front — `www.foo.com/x` and `foo.com/x` are the same page
  // 99% of the time, and the few sites where they differ aren't worth a cache miss.
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.slice(4);
  }

  return { canonical: parsed.toString(), host: parsed.hostname };
}

// Block SSRF targets. We're a public scraper running on Cloudflare's network,
// so private ranges and link-local addresses should never be the target.
// IPv6 ULA/loopback are also blocked. Hostnames that don't resolve to literal
// IPs pass — Cloudflare's network won't reach internal infra from a Worker.
export function isSafeHost(host: string): boolean {
  if (!host) return false;
  if (host === "localhost") return false;

  // Strip an IPv6 bracket if present.
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  // IPv6 — block loopback, unique-local (fc00::/7), and link-local (fe80::/10).
  if (bare.includes(":")) {
    const lower = bare.toLowerCase();
    if (lower === "::1") return false;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
    if (lower.startsWith("fe80:")) return false;
    return true;
  }

  // IPv4 literal check.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare)) {
    if (PRIVATE_IPV4_PREFIXES.some((p) => bare.startsWith(p))) return false;
    if (isPrivate172(bare)) return false;
  }

  return true;
}

// Stable identifier for a canonical URL. Uses SHA-256 truncated to 24 hex
// chars (~96 bits) — collision-resistant for any realistic scale, short
// enough to keep URLs in routes readable.
export async function urlHash(canonical: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex: string[] = [];
  const view = new Uint8Array(digest);
  for (let i = 0; i < 12; i++) {
    hex.push(view[i].toString(16).padStart(2, "0"));
  }
  return hex.join("");
}
