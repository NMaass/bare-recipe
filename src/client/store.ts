import { create } from "zustand";
import type { Recipe, ConsolidatedGroceryItem } from "../shared/types";
import { api } from "./api";

// Visible state during extract so the UI can show progressive feedback
// instead of a single opaque spinner.
export type ExtractPhase = "idle" | "fetching" | "saved" | "cached";

interface Store {
  currentRecipe: Recipe | null;
  savedRecipes: Recipe[];
  groceryItems: ConsolidatedGroceryItem[];
  extracting: boolean;
  extractPhase: ExtractPhase;
  loading: boolean;
  prefetched: boolean;

  extractAndSave: (url: string) => Promise<Recipe>;
  createManualRecipe: (data: {
    title: string;
    ingredients: string[];
    instructions: string[];
    servings?: string;
    prepTime?: string;
    cookTime?: string;
  }) => Promise<Recipe>;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  loadSavedRecipes: (query?: string) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  loadGroceryList: () => Promise<void>;
  addToGrocery: (recipeId: string, recipeTitle: string, items: string[]) => Promise<void>;
  toggleGroceryGroup: (key: string) => Promise<void>;
  toggleGroceryItem: (itemId: number) => Promise<void>;
  removeGroceryItem: (itemId: number) => Promise<void>;
  removeRecipeFromGrocery: (recipeId: string) => Promise<void>;
  updateGroceryItemText: (itemId: number, text: string) => Promise<void>;
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
      set({
        currentRecipe: result.recipe,
        extractPhase: result.cacheHit ? "cached" : "saved",
      });
      await get().loadSavedRecipes();
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

  createManualRecipe: async (data) => {
    set({ extracting: true, extractPhase: "fetching" });
    try {
      const recipe = await api.createManualRecipe(data);
      set({ currentRecipe: recipe, extractPhase: "saved" });
      await get().loadSavedRecipes();
      setTimeout(() => {
        if (get().extractPhase === "saved" || get().extractPhase === "cached") {
          set({ extractPhase: "idle" });
        }
      }, 1500);
      return recipe;
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

  toggleGroceryGroup: async (key) => {
    const group = get().groceryItems.find((g) => g.key === key);
    if (!group) return;
    const targetChecked = !group.checked;
    set((state) => ({
      groceryItems: state.groceryItems.map((g) =>
        g.key === key
          ? {
              ...g,
              checked: targetChecked,
              sources: g.sources.map((s) => ({ ...s, checked: targetChecked })),
            }
          : g
      ),
    }));
    try {
      const toToggle = group.sources.filter((s) => s.checked !== targetChecked);
      await Promise.all(
        toToggle.map((s) => api.toggleGroceryItem(s.itemId))
      );
    } catch {
      await get().loadGroceryList();
    }
  },

  toggleGroceryItem: async (itemId) => {
    set((state) => ({
      groceryItems: state.groceryItems.map((g) => {
        const sourceIdx = g.sources.findIndex((s) => s.itemId === itemId);
        if (sourceIdx === -1) return g;
        const newSources = g.sources.map((s, i) =>
          i === sourceIdx ? { ...s, checked: !s.checked } : s
        );
        return {
          ...g,
          sources: newSources,
          checked: newSources.every((s) => s.checked),
        };
      }),
    }));
    try {
      await api.toggleGroceryItem(itemId);
    } catch {
      await get().loadGroceryList();
    }
  },

  removeGroceryItem: async (itemId) => {
    set((state) => ({
      groceryItems: state.groceryItems
        .map((g) => {
          const newSources = g.sources.filter((s) => s.itemId !== itemId);
          if (newSources.length === 0) return null;
          const totalQuantity = newSources.reduce(
            (sum, s) => sum + (s.quantity ?? 0),
            0
          );
          const hasAnyQuantity = newSources.some((s) => s.quantity !== null);
          return {
            ...g,
            sources: newSources,
            quantity: hasAnyQuantity ? totalQuantity : null,
            checked: newSources.every((s) => s.checked),
          };
        })
        .filter((g): g is ConsolidatedGroceryItem => g !== null),
    }));
    try {
      await api.deleteGroceryItem(itemId);
    } catch {
      await get().loadGroceryList();
    }
  },

  removeRecipeFromGrocery: async (recipeId) => {
    set((state) => ({
      groceryItems: state.groceryItems
        .map((g) => {
          const newSources = g.sources.filter((s) => s.recipeId !== recipeId);
          if (newSources.length === 0) return null;
          const totalQuantity = newSources.reduce(
            (sum, s) => sum + (s.quantity ?? 0),
            0
          );
          const hasAnyQuantity = newSources.some((s) => s.quantity !== null);
          return {
            ...g,
            sources: newSources,
            quantity: hasAnyQuantity ? totalQuantity : null,
            checked: newSources.every((s) => s.checked),
          };
        })
        .filter((g): g is ConsolidatedGroceryItem => g !== null),
    }));
    try {
      await api.removeRecipeFromGrocery(recipeId);
    } catch {
      await get().loadGroceryList();
    }
  },

  updateGroceryItemText: async (itemId, text) => {
    set((state) => ({
      groceryItems: state.groceryItems.map((g) => ({
        ...g,
        sources: g.sources.map((s) =>
          s.itemId === itemId ? { ...s, originalText: text } : s
        ),
      })),
    }));
    try {
      await api.updateGroceryItemText(itemId, text);
      await get().loadGroceryList();
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
