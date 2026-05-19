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
