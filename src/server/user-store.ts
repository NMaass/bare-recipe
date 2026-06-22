import { DurableObject } from "cloudflare:workers";
import type { Recipe, Ingredient, Instruction, GroceryItem, ConsolidatedGroceryItem, GroceryItemSource, GroceryRecipe } from "../shared/types";
import { parseIngredient, buildDisplayText } from "../shared/ingredient-parser";

// Per-device data isolation. This DO owns the user's bookmarks (pointers
// into the shared D1 catalog) and grocery list. Recipe *content* lives in
// the shared catalog — never in here — so the same URL extracted by two
// devices doesn't waste storage and parser improvements roll out to everyone.
export class UserStore extends DurableObject {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.migrate();
  }

  private migrate() {
    // Drop obsolete normalized tables from earlier prototypes. Manual recipe
    // content now lives in manual_recipes and remains scoped to this DO.
    this.sql.exec(`DROP TABLE IF EXISTS ingredients;`);
    this.sql.exec(`DROP TABLE IF EXISTS instructions;`);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        url_hash  TEXT PRIMARY KEY,
        saved_at  INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS manual_recipes (
        id                TEXT PRIMARY KEY,
        title             TEXT NOT NULL,
        image             TEXT,
        prep_time         TEXT,
        cook_time         TEXT,
        servings          TEXT,
        ingredients_json  TEXT NOT NULL,
        instructions_json TEXT NOT NULL,
        created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS grocery_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT,
        recipe_id TEXT,
        recipe_title TEXT,
        checked INTEGER DEFAULT 0,
        added_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS grocery_recipes (
        recipe_id TEXT PRIMARY KEY,
        recipe_title TEXT,
        multiplier REAL DEFAULT 1,
        added_at INTEGER DEFAULT (unixepoch())
      );
    `);

    this.sql.exec(
      `INSERT OR IGNORE INTO grocery_recipes (recipe_id, recipe_title, multiplier)
       SELECT recipe_id, recipe_title, 1
       FROM grocery_items
       WHERE recipe_id IS NOT NULL AND recipe_id != ''
       GROUP BY recipe_id`
    );
  }

  // ---------- Bookmarks ----------

  // Idempotent: re-bookmarking an existing URL preserves the original
  // saved_at so the list order doesn't jump around when a user re-extracts.
  async addBookmark(urlHash: string): Promise<void> {
    this.sql.exec(
      "INSERT OR REPLACE INTO bookmarks (url_hash, saved_at) VALUES (?, COALESCE((SELECT saved_at FROM bookmarks WHERE url_hash = ?), unixepoch()))",
      urlHash,
      urlHash
    );
  }

  async removeBookmark(urlHash: string): Promise<void> {
    this.sql.exec("DELETE FROM bookmarks WHERE url_hash = ?", urlHash);
  }

  async removeSavedRecipe(id: string): Promise<void> {
    this.sql.exec("DELETE FROM bookmarks WHERE url_hash = ?", id);
    this.sql.exec("DELETE FROM manual_recipes WHERE id = ?", id);
  }

  // Newest-first. Returns just the keys — the Worker hydrates content from
  // the D1 catalog and combines upstream.
  async listBookmarks(): Promise<{ urlHash: string; savedAt: number }[]> {
    const rows = this.sql
      .exec("SELECT url_hash, saved_at FROM bookmarks ORDER BY saved_at DESC")
      .toArray();
    return rows.map((row) => ({
      urlHash: row.url_hash as string,
      savedAt: row.saved_at as number,
    }));
  }

  // ---------- Private manual recipes ----------

  async putManualRecipe(input: {
    title: string;
    servings: string | null;
    prepTime: string | null;
    cookTime: string | null;
    ingredients: Ingredient[];
    instructions: Instruction[];
  }): Promise<Recipe> {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.sql.exec(
      `INSERT INTO manual_recipes (
         id, title, image, prep_time, cook_time, servings,
         ingredients_json, instructions_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.title,
      null,
      input.prepTime,
      input.cookTime,
      input.servings,
      JSON.stringify(input.ingredients),
      JSON.stringify(input.instructions),
      now,
      now
    );
    await this.addBookmark(id);
    return {
      id,
      url: "",
      title: input.title,
      image: null,
      prepTime: input.prepTime,
      cookTime: input.cookTime,
      servings: input.servings,
      ingredients: input.ingredients,
      instructions: input.instructions,
      createdAt: now,
    };
  }

  async getManualRecipe(id: string): Promise<Recipe | null> {
    const rows = this.sql
      .exec(
        `SELECT id, title, image, prep_time, cook_time, servings,
                ingredients_json, instructions_json, created_at
         FROM manual_recipes
         WHERE id = ?`,
        id
      )
      .toArray() as {
      id: string;
      title: string;
      image: string | null;
      prep_time: string | null;
      cook_time: string | null;
      servings: string | null;
      ingredients_json: string;
      instructions_json: string;
      created_at: number;
    }[];
    const row = rows[0];

    if (!row) return null;
    return {
      id: row.id,
      url: "",
      title: row.title,
      image: row.image,
      prepTime: row.prep_time,
      cookTime: row.cook_time,
      servings: row.servings,
      ingredients: JSON.parse(row.ingredients_json) as Ingredient[],
      instructions: JSON.parse(row.instructions_json) as Instruction[],
      createdAt: row.created_at,
    };
  }

  async getManualRecipes(ids: string[]): Promise<Map<string, Recipe>> {
    const out = new Map<string, Recipe>();
    if (ids.length === 0) return out;

    for (const id of ids) {
      const recipe = await this.getManualRecipe(id);
      if (recipe) out.set(id, recipe);
    }
    return out;
  }

  // ---------- Grocery list ----------

  async getGroceryList(): Promise<GroceryItem[]> {
    const rows = this.sql
      .exec(
        `SELECT id, text, recipe_id, recipe_title, checked, added_at
         FROM grocery_items
         ORDER BY added_at DESC`
      )
      .toArray();

    return rows.map((row) => ({
      id: row.id as number,
      text: row.text as string,
      recipeId: (row.recipe_id as string) || null,
      recipeTitle: (row.recipe_title as string) || undefined,
      checked: Boolean(row.checked),
      addedAt: row.added_at as number,
    }));
  }

  async getConsolidatedGroceryList(): Promise<ConsolidatedGroceryItem[]> {
    const items = await this.getGroceryList();
    const recipeRows = this.sql
      .exec("SELECT recipe_id, multiplier FROM grocery_recipes")
      .toArray();
    const multipliers = new Map<string, number>();
    for (const row of recipeRows) {
      multipliers.set(row.recipe_id as string, row.multiplier as number);
    }

    const groups = new Map<string, GroceryItemSource[]>();

    for (const item of items) {
      const parsed = parseIngredient(item.text);
      const multiplier = item.recipeId ? (multipliers.get(item.recipeId) ?? 1) : 1;
      const adjustedQuantity =
        parsed.quantity !== null ? parsed.quantity * multiplier : null;

      const existing = groups.get(parsed.key) || [];
      existing.push({
        itemId: item.id,
        recipeId: item.recipeId,
        recipeTitle: item.recipeTitle,
        originalText: item.text,
        quantity: adjustedQuantity,
        unit: parsed.unit,
        name: parsed.name,
        checked: item.checked,
        multiplier,
      });
      groups.set(parsed.key, existing);
    }

    const out: ConsolidatedGroceryItem[] = [];
    for (const [key, sources] of groups) {
      const totalQuantity = sources.reduce(
        (sum, s) => sum + (s.quantity ?? 0),
        0
      );
      const hasAnyQuantity = sources.some((s) => s.quantity !== null);
      const quantity = hasAnyQuantity ? totalQuantity : null;
      const unit = sources[0]?.unit || "";
      const name = sources[0]?.name || sources[0]?.originalText || "";
      const allChecked = sources.every((s) => s.checked);

      out.push({
        key,
        displayText: buildDisplayText(quantity, unit, name),
        quantity,
        unit,
        name,
        checked: allChecked,
        sources,
      });
    }

    return out;
  }

  async getGroceryRecipes(): Promise<GroceryRecipe[]> {
    const rows = this.sql
      .exec(
        "SELECT recipe_id, recipe_title, multiplier FROM grocery_recipes ORDER BY added_at DESC"
      )
      .toArray();
    return rows.map((row) => ({
      recipeId: row.recipe_id as string,
      recipeTitle: (row.recipe_title as string) || "",
      multiplier: row.multiplier as number,
    }));
  }

  async addToGrocery(
    items: { text: string; recipeId: string; recipeTitle?: string }[]
  ): Promise<void> {
    const recipeIds = [...new Set(items.map((i) => i.recipeId).filter(Boolean))];

    for (const recipeId of recipeIds) {
      const existing = this.sql
        .exec("SELECT multiplier FROM grocery_recipes WHERE recipe_id = ?", recipeId)
        .toArray();

      if (existing.length > 0) {
        this.sql.exec(
          "UPDATE grocery_recipes SET multiplier = multiplier + 1 WHERE recipe_id = ?",
          recipeId
        );
      } else {
        const title = items.find((i) => i.recipeId === recipeId)?.recipeTitle || null;
        this.sql.exec(
          "INSERT INTO grocery_recipes (recipe_id, recipe_title, multiplier) VALUES (?, ?, 1)",
          recipeId,
          title
        );
        for (const item of items.filter((i) => i.recipeId === recipeId)) {
          this.sql.exec(
            "INSERT INTO grocery_items (text, recipe_id, recipe_title) VALUES (?, ?, ?)",
            item.text,
            item.recipeId,
            item.recipeTitle || null
          );
        }
      }
    }
  }

  async updateRecipeMultiplier(recipeId: string, multiplier: number): Promise<void> {
    if (multiplier <= 0) {
      await this.removeRecipeFromGrocery(recipeId);
      return;
    }
    this.sql.exec(
      "UPDATE grocery_recipes SET multiplier = ? WHERE recipe_id = ?",
      multiplier,
      recipeId
    );
  }

  async toggleGroceryItem(id: number): Promise<void> {
    this.sql.exec(
      "UPDATE grocery_items SET checked = CASE WHEN checked = 0 THEN 1 ELSE 0 END WHERE id = ?",
      id
    );
  }

  async deleteGroceryItem(id: number): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items WHERE id = ?", id);
  }

  async removeRecipeFromGrocery(recipeId: string): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items WHERE recipe_id = ?", recipeId);
    this.sql.exec("DELETE FROM grocery_recipes WHERE recipe_id = ?", recipeId);
  }

  async updateGroceryItemText(id: number, text: string): Promise<void> {
    this.sql.exec("UPDATE grocery_items SET text = ? WHERE id = ?", text, id);
  }

  async clearCheckedGrocery(): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items WHERE checked = 1");
    this.sql.exec(
      "DELETE FROM grocery_recipes WHERE recipe_id NOT IN (SELECT DISTINCT recipe_id FROM grocery_items WHERE recipe_id IS NOT NULL AND recipe_id != '')"
    );
  }

  async clearAllGrocery(): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items");
    this.sql.exec("DELETE FROM grocery_recipes");
  }
}
