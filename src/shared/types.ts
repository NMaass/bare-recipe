export interface Recipe {
  id: string;
  url: string;
  title: string;
  image: string | null;
  prepTime: string | null;
  cookTime: string | null;
  servings: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
  createdAt?: number;
}

export interface Ingredient {
  id?: number;
  text: string;
  sortOrder: number;
}

export interface Instruction {
  id?: number;
  step: number;
  text: string;
}

export interface GroceryItem {
  id: number;
  text: string;
  recipeId: string | null;
  recipeTitle?: string;
  checked: boolean;
  addedAt: number;
}

export interface GroceryItemSource {
  itemId: number;
  recipeId: string | null;
  recipeTitle?: string;
  originalText: string;
  quantity: number | null;
  unit: string;
  name: string;
  checked: boolean;
}

export interface ConsolidatedGroceryItem {
  key: string;
  displayText: string;
  quantity: number | null;
  unit: string;
  name: string;
  checked: boolean;
  sources: GroceryItemSource[];
}

// Returned from POST /api/extract.
// `cacheHit` lets the UI show a subtle "already in the catalog" affordance and
// distinguishes a paid-for fetch from a free lookup. `extractorVersion` is the
// version that produced this row — the catalog reads it on every request and
// re-parses on a bump.
export interface ExtractResult {
  recipe: Recipe;
  cacheHit: boolean;
  extractorVersion: number;
}

// Distinct failure modes the client should surface differently. A "blocked"
// response (the site returned a captcha/challenge page) is recoverable by the
// user with a different source; "no_recipe" means we reached the page but it
// has no machine-readable recipe data; "unreachable" is a network failure.
export type ExtractErrorReason =
  | "invalid_url"
  | "unreachable"
  | "blocked"
  | "no_recipe"
  | "too_large"
  | "internal";

export interface ExtractError {
  error: string;
  reason: ExtractErrorReason;
}
