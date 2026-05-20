import type { ExtractErrorReason } from "../shared/types";

// 5 MB cap on response body — recipe pages are usually 100-500 KB, anything
// significantly larger is either a long-form article we don't want or a
// pathological response. The fetch itself can pull more, but we bail before
// reading more than this into memory.
const MAX_BYTES = 5 * 1024 * 1024;

// 8 second timeout — long enough for slow shared hosts, short enough that the
// user doesn't sit through a tarpit.
const TIMEOUT_MS = 8_000;

// Identifying ourselves honestly. Site operators who care can contact via the
// URL in the UA string; in practice we get fewer captcha pages than spoofing
// Chrome from a Cloudflare IP space anyway.
const USER_AGENT =
  "BareRecipe/1.0 (+https://recipes.nmaass.dev; recipe-scraper-bot)";

export interface FetchedPage {
  html: string;
  finalUrl: string;
}

export interface FetchError {
  reason: ExtractErrorReason;
  message: string;
}

export async function fetchPage(url: string): Promise<FetchedPage | FetchError> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : "fetch failed";
    return { reason: "unreachable", message: msg };
  } finally {
    clearTimeout(timer);
  }

  // 403/429 and similar = site is actively blocking us (or a CDN is).
  // The user can act on this differently than "page has no recipe."
  if (response.status === 403 || response.status === 429) {
    return { reason: "blocked", message: `Site returned ${response.status}` };
  }
  if (!response.ok) {
    return { reason: "unreachable", message: `Site returned ${response.status}` };
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("html") && !contentType.includes("xml")) {
    return { reason: "no_recipe", message: `Not an HTML page (${contentType})` };
  }

  // Stream the body so an oversize response doesn't blow up memory before we
  // notice. arrayBuffer() would buffer the whole thing.
  if (!response.body) {
    return { reason: "unreachable", message: "Empty response body" };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return { reason: "too_large", message: "Page exceeded 5 MB cap" };
      }
      chunks.push(value);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "read failed";
    return { reason: "unreachable", message: msg };
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const html = new TextDecoder("utf-8").decode(merged);

  return { html, finalUrl: response.url };
}
