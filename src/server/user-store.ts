import { DurableObject } from "cloudflare:workers";
import type { GroceryItem, ConsolidatedGroceryItem, GroceryItemSource } from "../shared/types";
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
    // Drop any pre-launch tables from earlier prototypes so we start clean.
    // Safe because we're pre-launch; remove these DROPs once shipped.
    this.sql.exec(`DROP TABLE IF EXISTS ingredients;`);
    this.sql.exec(`DROP TABLE IF EXISTS instructions;`);
    this.sql.exec(`DROP TABLE IF EXISTS recipes;`);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        url_hash  TEXT PRIMARY KEY,
        saved_at  INTEGER NOT NULL DEFAULT (unixepoch())
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
    const groups = new Map<string, GroceryItemSource[]>();

    for (const item of items) {
      const parsed = parseIngredient(item.text);
      const existing = groups.get(parsed.key) || [];
      existing.push({
        itemId: item.id,
        recipeId: item.recipeId,
        recipeTitle: item.recipeTitle,
        originalText: item.text,
        quantity: parsed.quantity,
        unit: parsed.unit,
        name: parsed.name,
        checked: item.checked,
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

  async addToGrocery(
    items: { text: string; recipeId: string; recipeTitle?: string }[]
  ): Promise<GroceryItem[]> {
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

  async removeRecipeFromGrocery(recipeId: string): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items WHERE recipe_id = ?", recipeId);
  }

  async updateGroceryItemText(id: number, text: string): Promise<void> {
    this.sql.exec("UPDATE grocery_items SET text = ? WHERE id = ?", text, id);
  }

  async clearCheckedGrocery(): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items WHERE checked = 1");
  }

  async clearAllGrocery(): Promise<void> {
    this.sql.exec("DELETE FROM grocery_items");
  }
}
