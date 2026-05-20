import { UserStore } from "./user-store";
import { extractRecipe } from "./extractor";

export { UserStore };

interface Env {
  ASSETS: Fetcher;
  USER_STORE: DurableObjectNamespace<UserStore>;
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

// Per-device data isolation without login:
// The client mints a random UUID on first load (stored in localStorage) and
// sends it as `X-Device-ID`. Each value maps to its own Durable Object, which
// owns its own SQLite — so users never see each other's recipes or grocery
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

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      const store = getUserStore(request, env);

      // POST /api/extract
      if (url.pathname === "/api/extract" && request.method === "POST") {
        const body = (await request.json()) as { url: string };
        if (!body.url) {
          return json({ error: "URL is required" }, 400);
        }
        const recipe = await extractRecipe(body.url);
        if (!recipe) {
          return json({ error: "No recipe found at that URL" }, 404);
        }
        return json(recipe);
      }

      // GET /api/recipes  (optional ?q=)
      if (url.pathname === "/api/recipes" && request.method === "GET") {
        const recipes = await store.listRecipes(url.searchParams.get("q") || undefined);
        return json(recipes);
      }

      // POST /api/recipes
      if (url.pathname === "/api/recipes" && request.method === "POST") {
        const recipe = await request.json();
        const saved = await store.saveRecipe(recipe);
        return json(saved, 201);
      }

      // DELETE /api/recipes/:id
      const recipeDeleteMatch = url.pathname.match(/^\/api\/recipes\/(.+)$/);
      if (recipeDeleteMatch && request.method === "DELETE") {
        await store.deleteRecipe(decodeURIComponent(recipeDeleteMatch[1]));
        return json({ ok: true });
      }

      // GET /api/grocery
      if (url.pathname === "/api/grocery" && request.method === "GET") {
        const items = await store.getGroceryList();
        return json(items);
      }

      // POST /api/grocery
      if (url.pathname === "/api/grocery" && request.method === "POST") {
        const body = (await request.json()) as { items: { text: string; recipeId: string; recipeTitle?: string }[] };
        const items = await store.addToGrocery(body.items);
        return json(items, 201);
      }

      // DELETE /api/grocery (clear all or checked) — must be before /:id match
      if (url.pathname === "/api/grocery" && request.method === "DELETE") {
        if (url.searchParams.get("all") === "1") {
          await store.clearAllGrocery();
        } else {
          await store.clearCheckedGrocery();
        }
        return json({ ok: true });
      }

      // PATCH /api/grocery/:id
      const groceryPatchMatch = url.pathname.match(/^\/api\/grocery\/(\d+)$/);
      if (groceryPatchMatch && request.method === "PATCH") {
        await store.toggleGroceryItem(Number(groceryPatchMatch[1]));
        return json({ ok: true });
      }

      // DELETE /api/grocery/:id
      const groceryDeleteMatch = url.pathname.match(/^\/api\/grocery\/(\d+)$/);
      if (groceryDeleteMatch && request.method === "DELETE") {
        await store.deleteGroceryItem(Number(groceryDeleteMatch[1]));
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
