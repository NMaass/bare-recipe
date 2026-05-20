import { DurableObject } from "cloudflare:workers";
import type { Recipe, Ingredient, Instruction, GroceryItem } from "../shared/types";

export class UserStore extends DurableObject {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.migrate();
    this.migrateV2();
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        url TEXT,
        title TEXT,
        image TEXT,
        prep_time TEXT,
        cook_time TEXT,
        servings TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id TEXT REFERENCES recipes(id) ON DELETE CASCADE,
        text TEXT,
        sort_order INTEGER
      );
      CREATE TABLE IF NOT EXISTS instructions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id TEXT REFERENCES recipes(id) ON DELETE CASCADE,
        step INTEGER,
        text TEXT
      );
      CREATE TABLE IF NOT EXISTS grocery_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT,
        recipe_id TEXT,
        recipe_title TEXT,
        checked INTEGER DEFAULT 0,
        added_at INTEGER DEFAULT (unixepoch())
      );
    `);
  }

  private migrateV2() {
    // Add recipe_title column if missing (for existing DOs)
    const cols = this.sql.exec("PRAGMA table_info(grocery_items)").toArray();
    const hasTitle = cols.some((c) => c.name === "recipe_title");
    if (!hasTitle) {
      this.sql.exec("ALTER TABLE grocery_items ADD COLUMN recipe_title TEXT");
    }
  }

  async listRecipes(query?: string): Promise<Recipe[]> {
    const q = query?.trim();
    if (!q) {
      const rows = this.sql
        .exec("SELECT id, url, title, image, prep_time, cook_time, servings, created_at FROM recipes ORDER BY created_at DESC")
        .toArray();
      return rows.map((row) => this.buildRecipe(row));
    }

    // Match against title and any ingredient text. Escape LIKE wildcards so a
    // literal "%" in the query doesn't blow up the search.
    const pattern = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    const rows = this.sql
      .exec(
        `SELECT DISTINCT r.id, r.url, r.title, r.image, r.prep_time, r.cook_time, r.servings, r.created_at
         FROM recipes r
         LEFT JOIN ingredients i ON i.recipe_id = r.id
         WHERE r.title LIKE ? ESCAPE '\\' OR i.text LIKE ? ESCAPE '\\'
         ORDER BY r.created_at DESC`,
        pattern,
        pattern
      )
      .toArray();
    return rows.map((row) => this.buildRecipe(row));
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    const rows = this.sql
      .exec("SELECT id, url, title, image, prep_time, cook_time, servings, created_at FROM recipes WHERE id = ?", id)
      .toArray();

    if (rows.length === 0) return null;
    return this.buildRecipe(rows[0]);
  }

  private buildRecipe(row: Record<string, SqlStorageValue>): Recipe {
    const id = row.id as string;

    const ingredientRows = this.sql
      .exec("SELECT id, text, sort_order FROM ingredients WHERE recipe_id = ? ORDER BY sort_order", id)
      .toArray();

    const instructionRows = this.sql
      .exec("SELECT id, step, text FROM instructions WHERE recipe_id = ? ORDER BY step", id)
      .toArray();

    return {
      id,
      url: row.url as string,
      title: row.title as string,
      image: (row.image as string) || null,
      prepTime: (row.prep_time as string) || null,
      cookTime: (row.cook_time as string) || null,
      servings: (row.servings as string) || null,
      createdAt: row.created_at as number,
      ingredients: ingredientRows.map((r) => ({
        id: r.id as number,
        text: r.text as string,
        sortOrder: r.sort_order as number,
      })),
      instructions: instructionRows.map((r) => ({
        id: r.id as number,
        step: r.step as number,
        text: r.text as string,
      })),
    };
  }

  async saveRecipe(recipe: Recipe): Promise<Recipe> {
    this.sql.exec(
      "INSERT OR REPLACE INTO recipes (id, url, title, image, prep_time, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)",
      recipe.id,
      recipe.url,
      recipe.title,
      recipe.image,
      recipe.prepTime,
      recipe.cookTime,
      recipe.servings
    );

    // Clear existing related rows in case of replace
    this.sql.exec("DELETE FROM ingredients WHERE recipe_id = ?", recipe.id);
    this.sql.exec("DELETE FROM instructions WHERE recipe_id = ?", recipe.id);

    for (const ing of recipe.ingredients) {
      this.sql.exec(
        "INSERT INTO ingredients (recipe_id, text, sort_order) VALUES (?, ?, ?)",
        recipe.id,
        ing.text,
        ing.sortOrder
      );
    }

    for (const inst of recipe.instructions) {
      this.sql.exec(
        "INSERT INTO instructions (recipe_id, step, text) VALUES (?, ?, ?)",
        recipe.id,
        inst.step,
        inst.text
      );
    }

    return (await this.getRecipe(recipe.id))!;
  }

  async deleteRecipe(id: string): Promise<void> {
    this.sql.exec("DELETE FROM recipes WHERE id = ?", id);
  }

  async getGroceryList(): Promise<GroceryItem[]> {
    const rows = this.sql
      .exec(
        `SELECT g.id, g.text, g.recipe_id, g.checked, g.added_at,
                COALESCE(g.recipe_title, r.title) as recipe_title
         FROM grocery_items g
         LEFT JOIN recipes r ON g.recipe_id = r.id
         ORDER BY g.added_at DESC`
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

  async addToGrocery(items: { text: string; recipeId: string; recipeTitle?: string }[]): Promise<GroceryItem[]> {
    for (const item of items) {
      this.sql.exec(
        "INSERT INTO grocery_items (text, recipe_id, recipe_title) VALUES (?, ?, ?)",
        item.text,
        item.recipeId,
        item.recipeTitle || null
      );
    }
    return this.getGroceryList();
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

  async clearCheckedGrocery(): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items WHERE checked = 1");
  }

  async clearAllGrocery(): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items");
  }
}
