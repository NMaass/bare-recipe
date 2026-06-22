import { UserStore } from "./user-store";
import { extractFromHtml, EXTRACTOR_VERSION } from "./extractor";
import { fetchPage } from "./fetch-page";
import { canonicalizeUrl, isSafeHost, urlHash } from "./url";
import { getRecipe, getRecipes, putRecipe, searchRecipes } from "./catalog";
import {
  InputValidationError,
  LIMITS,
  cleanString,
  readJsonBody,
  validateExtractUrlBody,
  validateGroceryItems,
  validateGroceryTextPatch,
  validateManualRecipe,
  validateMultiplier,
  validateRecipeId,
  validationFailure,
} from "./validation";
import type {
  ExtractResult,
  ExtractError,
  ExtractErrorReason,
} from "../shared/types";

export { UserStore };

interface Env {
  ASSETS: Fetcher;
  USER_STORE: DurableObjectNamespace<UserStore>;
  CATALOG: D1Database;
  APP_ORIGIN?: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const allowedOrigin = origin && isAllowedOrigin(origin, requestOrigin, env)
    ? origin
    : env.APP_ORIGIN || requestOrigin;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-ID",
  };
}

function json(request: Request, env: Env, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request, env) },
  });
}

function extractError(
  request: Request,
  env: Env,
  reason: ExtractErrorReason,
  message: string,
  status = 400
): Response {
  const body: ExtractError = { reason, error: message };
  return json(request, env, body, status);
}

async function getUserStore(request: Request, env: Env): Promise<DurableObjectStub<UserStore>> {
  const userKey = await userStoreKey(request);
  const id = env.USER_STORE.idFromName(userKey);
  return env.USER_STORE.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (isUnsafeMethod(request.method) && !originAllowedForRequest(request, env)) {
      return json(request, env, { error: "Invalid request origin", reason: "invalid_input" }, 403);
    }

    try {
      const store = await getUserStore(request, env);

      // ---------- Extract ----------
      // POST /api/extract { url }
      // Cache-first: canonicalize → D1 lookup → on miss fetch+parse+write.
      // Auto-bookmarks for the current device so pasting a link is also "save."
      if (url.pathname === "/api/extract" && request.method === "POST") {
        const submittedUrl = validateExtractUrlBody(await readJsonBody(request));

        const canonical = canonicalizeUrl(submittedUrl);
        if (!canonical) {
          return extractError(request, env, "invalid_url", "That doesn't look like a recipe URL");
        }
        if (!isSafeHost(canonical.host)) {
          return extractError(request, env, "invalid_url", "That host isn't allowed");
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
          return json(request, env, result);
        }

        // Cache miss — fetch the origin.
        const fetched = await fetchPage(canonical.canonical);
        if ("reason" in fetched) {
          return extractError(request, env, fetched.reason, friendlyMessage(fetched.reason, fetched.message), 502);
        }

        const finalCanonical = canonicalizeUrl(fetched.finalUrl);
        if (!finalCanonical || !isSafeHost(finalCanonical.host)) {
          return extractError(request, env, "invalid_url", "The page redirected to an unsafe URL");
        }

        const finalHash = await urlHash(finalCanonical.canonical);
        if (finalHash !== hash) {
          const redirectedHit = await getRecipe(env.CATALOG, finalHash);
          if (redirectedHit) {
            await store.addBookmark(finalHash);
            const result: ExtractResult = {
              recipe: redirectedHit.recipe,
              cacheHit: true,
              extractorVersion: redirectedHit.extractorVersion,
            };
            return json(request, env, result);
          }
        }

        const parsed = extractFromHtml({ html: fetched.html, url: finalCanonical.canonical });
        if (!parsed) {
          return extractError(
            request,
            env,
            "no_recipe",
            "Couldn't find recipe data on that page",
            422
          );
        }

        const recipe = await putRecipe(env.CATALOG, finalHash, finalCanonical.host, parsed);
        await store.addBookmark(finalHash);

        const result: ExtractResult = {
          recipe,
          cacheHit: false,
          extractorVersion: EXTRACTOR_VERSION,
        };
        return json(request, env, result, 201);
      }

      // ---------- List recipes ----------
      // GET /api/recipes?q=
      // Returns the device's bookmarks, hydrated from the shared catalog.
      // `q` does a LIKE search over title + ingredients_json, scoped to
      // this device's bookmark set.
      if (url.pathname === "/api/recipes" && request.method === "GET") {
        const query = cleanOptionalQuery(url.searchParams.get("q"));
        const bookmarks = await store.listBookmarks();
        const hashes = bookmarks.map((b) => b.urlHash);

        const catalogPromise = query?.trim()
          ? searchRecipes(env.CATALOG, hashes, query)
          : getRecipes(env.CATALOG, hashes).then((recipes) => [...recipes.values()]);
        const [manualRecipes, catalogRecipes] = await Promise.all([
          store.getManualRecipes(hashes),
          catalogPromise,
        ]);

        let recipes = [...catalogRecipes, ...manualRecipes.values()];
        if (query?.trim()) {
          const normalizedQuery = query.trim().toLowerCase();
          const manualMatches = [...manualRecipes.values()].filter((recipe) =>
            recipe.title.toLowerCase().includes(normalizedQuery) ||
            recipe.ingredients.some((ingredient) =>
              ingredient.text.toLowerCase().includes(normalizedQuery)
            )
          );
          recipes = [...catalogRecipes, ...manualMatches];
        }

        // Sort by *bookmark time* so the user sees newly-saved recipes at the
        // top — not by when the catalog row was first extracted, which could
        // be much earlier for cache hits.
        const savedAtByHash = new Map(bookmarks.map((b) => [b.urlHash, b.savedAt]));
        recipes.sort(
          (a, b) =>
            (savedAtByHash.get(b.id) ?? 0) - (savedAtByHash.get(a.id) ?? 0)
        );

        return json(request, env, recipes);
      }

      // ---------- Bookmark an already-extracted recipe ----------
      // POST /api/recipes { ...Recipe }
      // Idempotent. The client typically doesn't need this anymore — extract
      // auto-bookmarks — but it remains the explicit "save this URL I have
      // in hand" affordance.
      if (url.pathname === "/api/recipes" && request.method === "POST") {
        const body = await readJsonBody(request);
        const id = validateRecipeId(
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>).id
            : undefined,
          "id"
        );
        const hit = await getRecipe(env.CATALOG, id);
        if (!hit) {
          return extractError(request, env, "no_recipe", "That recipe isn't in the catalog yet", 404);
        }
        await store.addBookmark(id);
        return json(request, env, hit.recipe, 201);
      }

      // ---------- Manual recipe entry ----------
      // POST /api/recipes/manual { title, ingredients[], instructions[], ... }
      if (url.pathname === "/api/recipes/manual" && request.method === "POST") {
        const body = validateManualRecipe(
          await readJsonBody(request, LIMITS.manualRecipeBodyBytes)
        );
        const recipe = await store.putManualRecipe(body);

        return json(request, env, recipe, 201);
      }

      // DELETE /api/recipes/:id  (id is the url_hash)
      const recipeDeleteMatch = url.pathname.match(/^\/api\/recipes\/(.+)$/);
      if (recipeDeleteMatch && request.method === "DELETE") {
        await store.removeSavedRecipe(validateRecipeId(decodeURIComponent(recipeDeleteMatch[1])));
        return json(request, env, { ok: true });
      }

      // ---------- Grocery ----------
      if (url.pathname === "/api/grocery" && request.method === "GET") {
        const [items, recipes] = await Promise.all([
          store.getConsolidatedGroceryList(),
          store.getGroceryRecipes(),
        ]);
        return json(request, env, { items, recipes });
      }

      if (url.pathname === "/api/grocery" && request.method === "POST") {
        const items = validateGroceryItems(await readJsonBody(request));
        await store.addToGrocery(items);
        const [consolidated, recipes] = await Promise.all([
          store.getConsolidatedGroceryList(),
          store.getGroceryRecipes(),
        ]);
        return json(request, env, { items: consolidated, recipes }, 201);
      }

      if (url.pathname === "/api/grocery" && request.method === "DELETE") {
        if (url.searchParams.get("all") === "1") {
          await store.clearAllGrocery();
        } else {
          await store.clearCheckedGrocery();
        }
        return json(request, env, { ok: true });
      }

      const groceryPatchMatch = url.pathname.match(/^\/api\/grocery\/(\d+)$/);
      if (groceryPatchMatch && request.method === "PATCH") {
        const text = validateGroceryTextPatch(await readJsonBody(request));
        if (text !== null) {
          await store.updateGroceryItemText(Number(groceryPatchMatch[1]), text);
        } else {
          await store.toggleGroceryItem(Number(groceryPatchMatch[1]));
        }
        return json(request, env, { ok: true });
      }

      const groceryDeleteMatch = url.pathname.match(/^\/api\/grocery\/(\d+)$/);
      if (groceryDeleteMatch && request.method === "DELETE") {
        await store.deleteGroceryItem(Number(groceryDeleteMatch[1]));
        return json(request, env, { ok: true });
      }

      const groceryRecipeMatch = url.pathname.match(
        /^\/api\/grocery\/recipe\/(.+)$/
      );
      if (groceryRecipeMatch && request.method === "DELETE") {
        await store.removeRecipeFromGrocery(
          validateRecipeId(decodeURIComponent(groceryRecipeMatch[1]), "recipeId")
        );
        return json(request, env, { ok: true });
      }

      if (groceryRecipeMatch && request.method === "PATCH") {
        const multiplier = validateMultiplier(await readJsonBody(request));
        if (multiplier !== null) {
          await store.updateRecipeMultiplier(
            validateRecipeId(decodeURIComponent(groceryRecipeMatch[1]), "recipeId"),
            multiplier
          );
        }
        return json(request, env, { ok: true });
      }

      return json(request, env, { error: "Not found" }, 404);
    } catch (err) {
      if (err instanceof InputValidationError) {
        return json(request, env, validationFailure(err.issues), 400);
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      return json(request, env, { error: message, reason: "internal" satisfies ExtractErrorReason }, 500);
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

function isUnsafeMethod(method: string): boolean {
  return method === "POST" || method === "PATCH" || method === "DELETE";
}

function originAllowedForRequest(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return isAllowedOrigin(origin, new URL(request.url).origin, env);
}

function isAllowedOrigin(origin: string, requestOrigin: string, env: Env): boolean {
  return origin === requestOrigin || (Boolean(env.APP_ORIGIN) && origin === env.APP_ORIGIN);
}

async function userStoreKey(request: Request): Promise<string> {
  const accessEmail =
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    request.headers.get("CF-Access-Authenticated-User-Email");
  if (accessEmail) return `access:${await stableKey(accessEmail.trim().toLowerCase())}`;

  const deviceId = request.headers.get("X-Device-ID");
  if (deviceId) {
    const cleaned = deviceId.trim();
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(cleaned) || /^[0-9a-fA-F-]{36}$/.test(cleaned)) {
      return `device:${cleaned}`;
    }
  }

  return "anonymous";
}

async function stableKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cleanOptionalQuery(value: string | null): string | undefined {
  if (value === null) return undefined;
  const cleaned = cleanString(value, {
    field: "q",
    max: 200,
    required: false,
  });
  return cleaned || undefined;
}
