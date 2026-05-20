import { UserStore } from "./user-store";
import { extractFromHtml, EXTRACTOR_VERSION } from "./extractor";
import { fetchPage } from "./fetch-page";
import { canonicalizeUrl, isSafeHost, urlHash } from "./url";
import { getRecipe, getRecipes, putRecipe, searchRecipes } from "./catalog";
import type {
  Recipe,
  ExtractResult,
  ExtractError,
  ExtractErrorReason,
} from "../shared/types";

export { UserStore };

interface Env {
  ASSETS: Fetcher;
  USER_STORE: DurableObjectNamespace<UserStore>;
  CATALOG: D1Database;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-ID",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function extractError(reason: ExtractErrorReason, message: string, status = 400): Response {
  const body: ExtractError = { reason, error: message };
  return json(body, status);
}

// Per-device data isolation without login:
// The client mints a random UUID on first load (stored in localStorage) and
// sends it as `X-Device-ID`. Each value maps to its own Durable Object, which
// owns its own SQLite — so users never see each other's bookmarks or grocery
// items. Anyone who clears storage or switches devices effectively becomes a
// new user. If we ever need real auth, wrap the worker in Cloudflare Access
// and key off the verified email instead of the header.
function getUserStore(request: Request, env: Env): DurableObjectStub<UserStore> {
  const deviceId = request.headers.get("X-Device-ID") || "anonymous";
  const id = env.USER_STORE.idFromName(deviceId);
  return env.USER_STORE.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      const store = getUserStore(request, env);

      // ---------- Extract ----------
      // POST /api/extract { url }
      // Cache-first: canonicalize → D1 lookup → on miss fetch+parse+write.
      // Auto-bookmarks for the current device so pasting a link is also "save."
      if (url.pathname === "/api/extract" && request.method === "POST") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return extractError("invalid_url", "URL is required");
        }

        const canonical = canonicalizeUrl(body.url);
        if (!canonical) {
          return extractError("invalid_url", "That doesn't look like a recipe URL");
        }
        if (!isSafeHost(canonical.host)) {
          return extractError("invalid_url", "That host isn't allowed");
        }

        const hash = await urlHash(canonical.canonical);

        // Cache check.
        const hit = await getRecipe(env.CATALOG, hash);
        if (hit) {
          await store.addBookmark(hash);
          const result: ExtractResult = {
            recipe: hit.recipe,
            cacheHit: true,
            extractorVersion: hit.extractorVersion,
          };
          return json(result);
        }

        // Cache miss — fetch the origin.
        const fetched = await fetchPage(canonical.canonical);
        if ("reason" in fetched) {
          return extractError(fetched.reason, friendlyMessage(fetched.reason, fetched.message), 502);
        }

        const parsed = extractFromHtml({ html: fetched.html, url: canonical.canonical });
        if (!parsed) {
          return extractError(
            "no_recipe",
            "Couldn't find recipe data on that page",
            422
          );
        }

        const recipe = await putRecipe(env.CATALOG, hash, canonical.host, parsed);
        await store.addBookmark(hash);

        const result: ExtractResult = {
          recipe,
          cacheHit: false,
          extractorVersion: EXTRACTOR_VERSION,
        };
        return json(result, 201);
      }

      // ---------- List recipes ----------
      // GET /api/recipes?q=
      // Returns the device's bookmarks, hydrated from the shared catalog.
      // `q` does a LIKE search over title + ingredients_json, scoped to
      // this device's bookmark set.
      if (url.pathname === "/api/recipes" && request.method === "GET") {
        const query = url.searchParams.get("q") || undefined;
        const bookmarks = await store.listBookmarks();
        const hashes = bookmarks.map((b) => b.urlHash);

        const recipes = query?.trim()
          ? await searchRecipes(env.CATALOG, hashes, query)
          : Array.from((await getRecipes(env.CATALOG, hashes)).values());

        // Sort by *bookmark time* so the user sees newly-saved recipes at the
        // top — not by when the catalog row was first extracted, which could
        // be much earlier for cache hits.
        const savedAtByHash = new Map(bookmarks.map((b) => [b.urlHash, b.savedAt]));
        recipes.sort(
          (a, b) =>
            (savedAtByHash.get(b.id) ?? 0) - (savedAtByHash.get(a.id) ?? 0)
        );

        return json(recipes);
      }

      // ---------- Bookmark an already-extracted recipe ----------
      // POST /api/recipes { ...Recipe }
      // Idempotent. The client typically doesn't need this anymore — extract
      // auto-bookmarks — but it remains the explicit "save this URL I have
      // in hand" affordance.
      if (url.pathname === "/api/recipes" && request.method === "POST") {
        const recipe = (await request.json()) as Recipe;
        const hit = await getRecipe(env.CATALOG, recipe.id);
        if (!hit) {
          return extractError("no_recipe", "That recipe isn't in the catalog yet", 404);
        }
        await store.addBookmark(recipe.id);
        return json(hit.recipe, 201);
      }

      // DELETE /api/recipes/:id  (id is the url_hash)
      const recipeDeleteMatch = url.pathname.match(/^\/api\/recipes\/(.+)$/);
      if (recipeDeleteMatch && request.method === "DELETE") {
        await store.removeBookmark(decodeURIComponent(recipeDeleteMatch[1]));
        return json({ ok: true });
      }

      // ---------- Grocery ----------
      if (url.pathname === "/api/grocery" && request.method === "GET") {
        const items = await store.getGroceryList();
        return json(items);
      }

      if (url.pathname === "/api/grocery" && request.method === "POST") {
        const body = (await request.json()) as {
          items: { text: string; recipeId: string; recipeTitle?: string }[];
        };
        const items = await store.addToGrocery(body.items);
        return json(items, 201);
      }

      if (url.pathname === "/api/grocery" && request.method === "DELETE") {
        if (url.searchParams.get("all") === "1") {
          await store.clearAllGrocery();
        } else {
          await store.clearCheckedGrocery();
        }
        return json({ ok: true });
      }

      const groceryPatchMatch = url.pathname.match(/^\/api\/grocery\/(\d+)$/);
      if (groceryPatchMatch && request.method === "PATCH") {
        await store.toggleGroceryItem(Number(groceryPatchMatch[1]));
        return json({ ok: true });
      }

      const groceryDeleteMatch = url.pathname.match(/^\/api\/grocery\/(\d+)$/);
      if (groceryDeleteMatch && request.method === "DELETE") {
        await store.deleteGroceryItem(Number(groceryDeleteMatch[1]));
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      return json({ error: message, reason: "internal" satisfies ExtractErrorReason }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

// Map extractor error reasons to user-facing copy. Keeping these out of the
// route handler so we can iterate on wording without touching the routing.
function friendlyMessage(reason: ExtractErrorReason, detail: string): string {
  switch (reason) {
    case "blocked":
      return "That site is blocking us. Try saving the recipe from a different source.";
    case "unreachable":
      return "Couldn't reach that site — check the link and try again.";
    case "too_large":
      return "That page is unusually large; we couldn't process it.";
    case "no_recipe":
      return "We reached the page, but it doesn't have recipe data we can read.";
    case "invalid_url":
      return "That doesn't look like a valid URL.";
    default:
      return detail;
  }
}
