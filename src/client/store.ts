import { create } from "zustand";
import type { Recipe, GroceryItem } from "../shared/types";
import { api } from "./api";

// Visible state during extract so the UI can show progressive feedback
// instead of a single opaque spinner.
export type ExtractPhase = "idle" | "fetching" | "saved" | "cached";

interface Store {
  currentRecipe: Recipe | null;
  savedRecipes: Recipe[];
  groceryItems: GroceryItem[];
  extracting: boolean;
  extractPhase: ExtractPhase;
  loading: boolean;
  prefetched: boolean;

  extractAndSave: (url: string) => Promise<Recipe>;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  loadSavedRecipes: (query?: string) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  loadGroceryList: () => Promise<void>;
  addToGrocery: (recipeId: string, recipeTitle: string, items: string[]) => Promise<void>;
  toggleGroceryItem: (id: number) => Promise<void>;
  removeGroceryItem: (id: number) => Promise<void>;
  clearCheckedGrocery: () => Promise<void>;
  clearAllGrocery: () => Promise<void>;
  prefetch: () => Promise<void>;
}

export const useStore = create<Store>((set, get) => ({
  currentRecipe: null,
  savedRecipes: [],
  groceryItems: [],
  extracting: false,
  extractPhase: "idle",
  loading: false,
  prefetched: false,

  extractAndSave: async (url) => {
    set({ extracting: true, extractPhase: "fetching" });
    try {
      const result = await api.extractRecipe(url);
      // /api/extract now auto-bookmarks server-side. The extra POST /api/recipes
      // is a back-compat idempotent no-op, so we just refresh the saved list.
      set({
        currentRecipe: result.recipe,
        extractPhase: result.cacheHit ? "cached" : "saved",
      });
      await get().loadSavedRecipes();
      // Briefly hold the success phase so the UI can flash a confirmation
      // before resetting. The phase auto-clears so the caller doesn't have to.
      setTimeout(() => {
        if (get().extractPhase === "saved" || get().extractPhase === "cached") {
          set({ extractPhase: "idle" });
        }
      }, 1500);
      return result.recipe;
    } catch (err) {
      set({ extractPhase: "idle" });
      throw err;
    } finally {
      set({ extracting: false });
    }
  },

  setCurrentRecipe: (recipe) => set({ currentRecipe: recipe }),

  loadSavedRecipes: async (query) => {
    const hadData = get().savedRecipes.length > 0;
    if (!hadData) set({ loading: true });
    try {
      const recipes = await api.getRecipes(query);
      set({ savedRecipes: recipes });
    } finally {
      set({ loading: false });
    }
  },

  deleteRecipe: async (id) => {
    set((state) => ({
      savedRecipes: state.savedRecipes.filter((r) => r.id !== id),
    }));
    try {
      await api.deleteRecipe(id);
    } catch {
      await get().loadSavedRecipes();
    }
  },

  loadGroceryList: async () => {
    const hadData = get().groceryItems.length > 0;
    if (!hadData) set({ loading: true });
    try {
      const items = await api.getGroceryList();
      set({ groceryItems: items });
    } finally {
      set({ loading: false });
    }
  },

  addToGrocery: async (recipeId, recipeTitle, items) => {
    await api.addToGrocery(recipeId, recipeTitle, items);
    await get().loadGroceryList();
  },

  toggleGroceryItem: async (id) => {
    set((state) => ({
      groceryItems: state.groceryItems.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      ),
    }));
    try {
      await api.toggleGroceryItem(id);
    } catch {
      await get().loadGroceryList();
    }
  },

  removeGroceryItem: async (id) => {
    set((state) => ({
      groceryItems: state.groceryItems.filter((item) => item.id !== id),
    }));
    try {
      await api.deleteGroceryItem(id);
    } catch {
      await get().loadGroceryList();
    }
  },

  clearCheckedGrocery: async () => {
    set((state) => ({
      groceryItems: state.groceryItems.filter((item) => !item.checked),
    }));
    try {
      await api.clearCheckedGrocery();
    } catch {
      await get().loadGroceryList();
    }
  },

  clearAllGrocery: async () => {
    set({ groceryItems: [] });
    try {
      await api.clearAllGrocery();
    } catch {
      await get().loadGroceryList();
    }
  },

  prefetch: async () => {
    if (get().prefetched) return;
    set({ prefetched: true });
    await Promise.all([get().loadSavedRecipes(), get().loadGroceryList()]);
  },
}));
