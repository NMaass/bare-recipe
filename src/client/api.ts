import type { Recipe, GroceryItem } from "../shared/types";

function getDeviceId(): string {
  const key = "bare-recipe-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Device-ID": getDeviceId(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json();
}

export const api = {
  extractRecipe(url: string) {
    return request<Recipe>("/extract", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  getRecipes() {
    return request<Recipe[]>("/recipes");
  },

  saveRecipe(recipe: Recipe) {
    return request<Recipe>("/recipes", {
      method: "POST",
      body: JSON.stringify(recipe),
    });
  },

  deleteRecipe(id: string) {
    return request<void>(`/recipes/${id}`, { method: "DELETE" });
  },

  getGroceryList() {
    return request<GroceryItem[]>("/grocery");
  },

  addToGrocery(recipeId: string, recipeTitle: string, ingredientTexts: string[]) {
    return request<GroceryItem[]>("/grocery", {
      method: "POST",
      body: JSON.stringify({
        items: ingredientTexts.map((text) => ({ text, recipeId, recipeTitle })),
      }),
    });
  },

  toggleGroceryItem(id: number) {
    return request<void>(`/grocery/${id}`, { method: "PATCH" });
  },

  deleteGroceryItem(id: number) {
    return request<void>(`/grocery/${id}`, { method: "DELETE" });
  },

  clearCheckedGrocery() {
    return request<void>("/grocery", { method: "DELETE" });
  },

  clearAllGrocery() {
    return request<void>("/grocery?all=1", { method: "DELETE" });
  },
};
