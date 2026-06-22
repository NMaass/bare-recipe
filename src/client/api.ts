import type {
  Recipe,
  ConsolidatedGroceryItem,
  GroceryRecipe,
  ExtractResult,
  ExtractError,
  ExtractErrorReason,
} from "../shared/types";

function getDeviceId(): string {
  const key = "bare-recipe-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// Lets callers display the typed reason without parsing the message string.
export class ApiError extends Error {
  reason: ExtractErrorReason | "unknown";
  status: number;
  constructor(message: string, reason: ExtractErrorReason | "unknown", status: number) {
    super(message);
    this.name = "ApiError";
    this.reason = reason;
    this.status = status;
  }
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
    const text = await res.text();
    let reason: ExtractErrorReason | "unknown" = "unknown";
    let message = res.statusText || "Request failed";
    try {
      const parsed = JSON.parse(text) as Partial<ExtractError>;
      if (parsed && typeof parsed === "object") {
        if (parsed.reason) reason = parsed.reason;
        if (typeof parsed.error === "string" && parsed.error) message = parsed.error;
      }
    } catch {
      // Not JSON. If the raw response looks like text the user could read
      // (short, no markup), surface it; otherwise keep the statusText so we
      // never paint a JSON blob or an HTML error page into the UI.
      if (text && text.length < 200 && !/[<{]/.test(text)) message = text;
    }
    throw new ApiError(message, reason, res.status);
  }
  return res.json();
}

export interface GroceryListResponse {
  items: ConsolidatedGroceryItem[];
  recipes: GroceryRecipe[];
}

export const api = {
  extractRecipe(url: string) {
    return request<ExtractResult>("/extract", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  getRecipes(query?: string) {
    const qs = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return request<Recipe[]>(`/recipes${qs}`);
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

  createManualRecipe(data: {
    title: string;
    ingredients: string[];
    instructions: string[];
    servings?: string;
    prepTime?: string;
    cookTime?: string;
  }) {
    return request<Recipe>("/recipes/manual", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getGroceryList() {
    return request<GroceryListResponse>("/grocery");
  },

  addToGrocery(recipeId: string, recipeTitle: string, ingredientTexts: string[]) {
    return request<GroceryListResponse>("/grocery", {
      method: "POST",
      body: JSON.stringify({
        items: ingredientTexts.map((text) => ({ text, recipeId, recipeTitle })),
      }),
    });
  },

  toggleGroceryItem(id: number) {
    return request<void>(`/grocery/${id}`, { method: "PATCH" });
  },

  updateGroceryItemText(id: number, text: string) {
    return request<void>(`/grocery/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    });
  },

  deleteGroceryItem(id: number) {
    return request<void>(`/grocery/${id}`, { method: "DELETE" });
  },

  removeRecipeFromGrocery(recipeId: string) {
    return request<void>(`/grocery/recipe/${encodeURIComponent(recipeId)}`, {
      method: "DELETE",
    });
  },

  updateRecipeMultiplier(recipeId: string, multiplier: number) {
    return request<void>(`/grocery/recipe/${encodeURIComponent(recipeId)}`, {
      method: "PATCH",
      body: JSON.stringify({ multiplier }),
    });
  },

  clearCheckedGrocery() {
    return request<void>("/grocery", { method: "DELETE" });
  },

  clearAllGrocery() {
    return request<void>("/grocery?all=1", { method: "DELETE" });
  },
};
