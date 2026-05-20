import type { Recipe, Ingredient, Instruction } from "../shared/types";
import { EXTRACTOR_VERSION, type ExtractedRecipe } from "./extractor";

// Shared recipe catalog backed by D1. Keyed by `url_hash` so equivalent URLs
// dedupe and any device can pull a recipe extracted by anyone else without
// re-fetching the origin.
//
// Schema migrations live here intentionally — `ensureSchema()` runs once per
// Worker isolate (cached via the module-level flag) and is idempotent.
// D1 doesn't have first-class migration tooling at deploy time the way you'd
// expect from a Rails app, but `CREATE TABLE IF NOT EXISTS` is well-supported
// and avoids the dev/prod skew of remembering to run migrations.

let schemaReady = false;

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS recipes (
        url_hash          TEXT PRIMARY KEY,
        canonical_url     TEXT NOT NULL,
        source_host       TEXT NOT NULL,
        title             TEXT NOT NULL,
        image             TEXT,
        prep_time         TEXT,
        cook_time         TEXT,
        prep_minutes      INTEGER,
        cook_minutes      INTEGER,
        total_minutes     INTEGER,
        servings          TEXT,
        ingredients_json  TEXT NOT NULL,
        instructions_json TEXT NOT NULL,
        extractor_version INTEGER NOT NULL,
        extracted_at      INTEGER NOT NULL,
        last_verified_at  INTEGER NOT NULL
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS recipes_host ON recipes(source_host)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS recipes_extracted_at ON recipes(extracted_at)`),
  ]);
  schemaReady = true;
}

export interface CatalogHit {
  recipe: Recipe;
  extractorVersion: number;
  extractedAt: number;
}

// Read a recipe by url_hash. Returns null when no row exists OR when the
// stored row was produced by an older extractor — callers treat that as a
// cache miss and re-extract.
export async function getRecipe(
  db: D1Database,
  urlHash: string
): Promise<CatalogHit | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT url_hash, canonical_url, title, image, prep_time, cook_time, servings,
              ingredients_json, instructions_json, extractor_version, extracted_at
       FROM recipes WHERE url_hash = ?`
    )
    .bind(urlHash)
    .first<{
      url_hash: string;
      canonical_url: string;
      title: string;
      image: string | null;
      prep_time: string | null;
      cook_time: string | null;
      servings: string | null;
      ingredients_json: string;
      instructions_json: string;
      extractor_version: number;
      extracted_at: number;
    }>();

  if (!row) return null;
  if (row.extractor_version < EXTRACTOR_VERSION) return null;

  return {
    extractorVersion: row.extractor_version,
    extractedAt: row.extracted_at,
    recipe: {
      id: row.url_hash,
      url: row.canonical_url,
      title: row.title,
      image: row.image,
      prepTime: row.prep_time,
      cookTime: row.cook_time,
      servings: row.servings,
      ingredients: JSON.parse(row.ingredients_json) as Ingredient[],
      instructions: JSON.parse(row.instructions_json) as Instruction[],
      createdAt: row.extracted_at,
    },
  };
}

// Read multiple recipes in a single roundtrip. Used by listRecipes() to hydrate
// the user's bookmark list. Preserves the input order so callers can sort by
// "saved at" upstream.
export async function getRecipes(
  db: D1Database,
  urlHashes: string[]
): Promise<Map<string, Recipe>> {
  if (urlHashes.length === 0) return new Map();
  await ensureSchema(db);

  // D1 expression cap is generous but build a stable IN clause regardless.
  const placeholders = urlHashes.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT url_hash, canonical_url, title, image, prep_time, cook_time, servings,
            ingredients_json, instructions_json, extracted_at
     FROM recipes WHERE url_hash IN (${placeholders})`
  );
  const { results } = await stmt.bind(...urlHashes).all<{
    url_hash: string;
    canonical_url: string;
    title: string;
    image: string | null;
    prep_time: string | null;
    cook_time: string | null;
    servings: string | null;
    ingredients_json: string;
    instructions_json: string;
    extracted_at: number;
  }>();

  const out = new Map<string, Recipe>();
  for (const row of results || []) {
    out.set(row.url_hash, {
      id: row.url_hash,
      url: row.canonical_url,
      title: row.title,
      image: row.image,
      prepTime: row.prep_time,
      cookTime: row.cook_time,
      servings: row.servings,
      ingredients: JSON.parse(row.ingredients_json) as Ingredient[],
      instructions: JSON.parse(row.instructions_json) as Instruction[],
      createdAt: row.extracted_at,
    });
  }
  return out;
}

// Upsert a freshly-extracted recipe. `INSERT OR REPLACE` is used because the
// content is immutable from the user's perspective — only the extractor
// itself rewrites rows, and only when the version bumps.
export async function putRecipe(
  db: D1Database,
  urlHash: string,
  host: string,
  parsed: ExtractedRecipe
): Promise<Recipe> {
  await ensureSchema(db);
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT OR REPLACE INTO recipes (
         url_hash, canonical_url, source_host, title, image,
         prep_time, cook_time, prep_minutes, cook_minutes, total_minutes,
         servings, ingredients_json, instructions_json,
         extractor_version, extracted_at, last_verified_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      urlHash,
      parsed.url,
      host,
      parsed.title,
      parsed.image,
      parsed.prepTime,
      parsed.cookTime,
      parsed.prepMinutes,
      parsed.cookMinutes,
      parsed.totalMinutes,
      parsed.servings,
      JSON.stringify(parsed.ingredients),
      JSON.stringify(parsed.instructions),
      EXTRACTOR_VERSION,
      now,
      now
    )
    .run();

  return {
    id: urlHash,
    url: parsed.url,
    title: parsed.title,
    image: parsed.image,
    prepTime: parsed.prepTime,
    cookTime: parsed.cookTime,
    servings: parsed.servings,
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    createdAt: now,
  };
}

// Full-text-ish search over title + ingredients. SQLite LIKE is sufficient at
// this scale; we'll move to FTS5 when there are tens of thousands of rows.
// Restricted to a set of url_hashes (the caller's bookmarks) so the user
// can't search the global catalog directly.
export async function searchRecipes(
  db: D1Database,
  urlHashes: string[],
  query: string
): Promise<Recipe[]> {
  if (urlHashes.length === 0) return [];
  await ensureSchema(db);

  const q = query.trim();
  if (!q) {
    const map = await getRecipes(db, urlHashes);
    return urlHashes.map((h) => map.get(h)).filter((r): r is Recipe => Boolean(r));
  }

  const placeholders = urlHashes.map(() => "?").join(",");
  // Escape LIKE wildcards so a literal "%" in the query doesn't blow up.
  const pattern = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;

  const { results } = await db
    .prepare(
      `SELECT url_hash, canonical_url, title, image, prep_time, cook_time, servings,
              ingredients_json, instructions_json, extracted_at
       FROM recipes
       WHERE url_hash IN (${placeholders})
         AND (title LIKE ? ESCAPE '\\' OR ingredients_json LIKE ? ESCAPE '\\')`
    )
    .bind(...urlHashes, pattern, pattern)
    .all<{
      url_hash: string;
      canonical_url: string;
      title: string;
      image: string | null;
      prep_time: string | null;
      cook_time: string | null;
      servings: string | null;
      ingredients_json: string;
      instructions_json: string;
      extracted_at: number;
    }>();

  return (results || []).map((row) => ({
    id: row.url_hash,
    url: row.canonical_url,
    title: row.title,
    image: row.image,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    servings: row.servings,
    ingredients: JSON.parse(row.ingredients_json) as Ingredient[],
    instructions: JSON.parse(row.instructions_json) as Instruction[],
    createdAt: row.extracted_at,
  }));
}
