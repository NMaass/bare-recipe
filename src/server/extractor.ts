import type { Recipe, Ingredient, Instruction } from "../shared/types";

// Bump when the parser changes in a way that should re-extract previously
// cached rows. Stored in catalog.recipes.extractor_version; the route reads
// the row's version on every request and treats a mismatch as a cache miss
// (refetch + reparse). This is how "improve the parser, all old data gets
// the fix for free" works.
export const EXTRACTOR_VERSION = 3;

export type ExtractedRecipe = Omit<Recipe, "id"> & {
  // Parsed durations in minutes when we can, for indexing/sorting. Kept
  // alongside the ISO strings the client already renders.
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
};

interface ExtractInput {
  html: string;
  url: string;
}

// Public entrypoint. Returns the recipe or null when nothing parseable was
// found. `url` should be the canonical URL — we record it on the row and
// resolve relative image paths against it.
export function extractFromHtml({ html, url }: ExtractInput): ExtractedRecipe | null {
  // Primary: JSON-LD. ~95% of recipe sites publish it for SEO.
  const fromJsonLd = extractJsonLd(html, url);
  if (fromJsonLd) return fromJsonLd;

  // Fallback: OpenGraph + heuristics. We can't recover ingredients from OG,
  // but we can return *something* for the title/image so the UI doesn't
  // dead-end. Callers can decide whether to accept an OG-only recipe.
  const fromOg = extractOpenGraph(html, url);
  if (fromOg && fromOg.ingredients.length > 0) return fromOg;

  const fromHtml = extractHtmlHeuristic(html, url);
  if (fromHtml) return fromHtml;

  return null;
}

// ---------- JSON-LD path ----------

function extractJsonLd(html: string, url: string): ExtractedRecipe | null {
  const ldJsonRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  // Collect all top-level objects so we can resolve @id cross-references that
  // span blocks (NYT, BA, etc. split Recipe and AggregateRating into separate
  // graph entries).
  const all: Record<string, unknown>[] = [];
  let match: RegExpExecArray | null;
  while ((match = ldJsonRegex.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    collectObjects(parsed, all);
  }

  // Index by @id so resolveRef can chase pointers.
  const byId = new Map<string, Record<string, unknown>>();
  for (const obj of all) {
    const id = obj["@id"];
    if (typeof id === "string") byId.set(id, obj);
  }

  const recipe = all.find((obj) => isRecipeNode(obj));
  if (!recipe) return null;

  return mapToRecipe(recipe, url, byId);
}

function collectObjects(data: unknown, out: Record<string, unknown>[]): void {
  if (!data || typeof data !== "object") return;
  if (Array.isArray(data)) {
    for (const item of data) collectObjects(item, out);
    return;
  }
  const obj = data as Record<string, unknown>;
  out.push(obj);
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) collectObjects(item, out);
  }
}

function isRecipeNode(obj: Record<string, unknown>): boolean {
  const type = obj["@type"];
  if (type === "Recipe") return true;
  if (Array.isArray(type) && type.includes("Recipe")) return true;
  return false;
}

// Resolve a value that may be a direct object or a `{ "@id": "..." }` ref.
function resolveRef(
  value: unknown,
  byId: Map<string, Record<string, unknown>>
): unknown {
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const ref = obj["@id"];
  if (typeof ref === "string" && Object.keys(obj).length === 1) {
    return byId.get(ref) ?? value;
  }
  return value;
}

function mapToRecipe(
  data: Record<string, unknown>,
  url: string,
  byId: Map<string, Record<string, unknown>>
): ExtractedRecipe {
  const ingredients = parseIngredients(data.recipeIngredient ?? data.ingredients);
  const instructions = parseInstructions(data.recipeInstructions);

  const prepIso = isoDuration(data.prepTime);
  const cookIso = isoDuration(data.cookTime);

  const prepMinutes = parseDurationToMinutes(data.prepTime);
  const cookMinutes = parseDurationToMinutes(data.cookTime);
  let totalMinutes = parseDurationToMinutes(data.totalTime);
  if (totalMinutes === null && (prepMinutes !== null || cookMinutes !== null)) {
    totalMinutes = (prepMinutes ?? 0) + (cookMinutes ?? 0);
  }

  const image = pickBestImage(resolveRef(data.image, byId), url);
  const yields = parseYield(data.recipeYield ?? data.yield);

  return {
    url,
    title: normalizeString(String(data.name || "Untitled Recipe")) || "Untitled Recipe",
    image,
    prepTime: prepIso,
    cookTime: cookIso,
    servings: yields,
    ingredients,
    instructions,
    prepMinutes,
    cookMinutes,
    totalMinutes,
  };
}

// ---------- Ingredient parsing ----------

function parseIngredients(raw: unknown): Ingredient[] {
  const out: Ingredient[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      let text = normalizeString(ingredientText(item));
      text = text.replace(/\s*\(\(.*?\)\)\s*/g, " ").trim();
      if (text) out.push({ text, sortOrder: i });
    });
  } else if (typeof raw === "string") {
    normalizeString(raw)
      .replace(/\s*\(\(.*?\)\)\s*/g, " ")
      .split(/\r?\n|;|·/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text, i) => out.push({ text, sortOrder: i }));
  }
  return out;
}

// Coerce a recipeIngredient entry into a clean "qty unit name" string.
// Object-form ingredients (QuantitativeValue with nested value/unitText) used
// to fall through as "[object Object]" — this is the fix that prompted the
// whole conversation. Keeping the resolver tight: prefer pre-formatted strings
// when the publisher already built one.
function ingredientText(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (typeof item === "number") return String(item);
  if (!item || typeof item !== "object") return "";

  const obj = item as Record<string, unknown>;
  for (const key of ["text", "description"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const name = pickString(obj, ["name", "ingredient", "item", "label"]);

  let qty = "";
  let unit = "";
  for (const key of ["quantity", "amount", "value", "weight"]) {
    const v = obj[key];
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) {
      qty = v.trim();
      break;
    }
    if (typeof v === "number") {
      qty = String(v);
      break;
    }
    if (typeof v === "object") {
      const inner = v as Record<string, unknown>;
      const innerVal = inner.value ?? inner.name;
      if (typeof innerVal === "string" && innerVal.trim()) qty = innerVal.trim();
      else if (typeof innerVal === "number") qty = String(innerVal);
      unit = pickString(inner, ["unitText", "unit", "unitCode"]);
      if (qty || unit) break;
    }
  }
  if (!unit) unit = pickString(obj, ["unitText", "unit", "unitCode"]);

  const parts = [qty, unit, name].filter(Boolean);
  if (parts.length) return parts.join(" ").replace(/\s+/g, " ").trim();
  return "";
}

// ---------- Instruction parsing ----------

function parseInstructions(raw: unknown): Instruction[] {
  const out: Instruction[] = [];
  let step = 1;

  const pushFromObject = (obj: Record<string, unknown>): void => {
    if (obj["@type"] === "HowToSection") {
      // Sections can carry their nested steps as an array OR a single object.
      let items = obj.itemListElement;
      if (items && !Array.isArray(items)) items = [items];
      if (Array.isArray(items)) {
        for (const sub of items as unknown[]) {
          if (typeof sub === "string") {
            const t = normalizeString(sub);
            if (t) out.push({ step: step++, text: t });
          } else if (sub && typeof sub === "object") {
            const t = mergedInstructionText(sub as Record<string, unknown>);
            if (t) out.push({ step: step++, text: t });
          }
        }
      }
      return;
    }
    const t = mergedInstructionText(obj);
    if (t) out.push({ step: step++, text: t });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") {
        const t = normalizeString(item);
        if (t) out.push({ step: step++, text: t });
      } else if (item && typeof item === "object") {
        pushFromObject(item as Record<string, unknown>);
      }
    }
  } else if (typeof raw === "string") {
    // Some sites give one giant string of newline-separated steps.
    normalizeString(raw)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text) => out.push({ step: step++, text }));
  }
  return out;
}

// A HowToStep often carries both `name` (short label) and `text` (full prose).
// Most of the time `name` is a truncation of `text` — concatenating them
// produces "Mix dough. Mix the flour, water, and salt..." duplication. Prefer
// `text` when present; only use `name` as a fallback or when `text` doesn't
// already start with `name`.
function mergedInstructionText(obj: Record<string, unknown>): string {
  const name = typeof obj.name === "string" ? normalizeString(obj.name) : "";
  const text = typeof obj.text === "string" ? normalizeString(obj.text) : "";
  if (text) return text;
  return name;
}

// ---------- Duration parsing ----------

function isoDuration(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const v = obj.maxValue ?? obj.value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// Convert a duration value (ISO-8601, free text, or QuantitativeValue) to
// minutes. Returns null when nothing parseable is found. Stored on the row
// so we can sort/filter and compute totalTime when sites omit it.
export function parseDurationToMinutes(value: unknown): number | null {
  const str = isoDuration(value);
  if (!str) return null;

  // ISO 8601 "PT1H30M" / "PT45M" / "PT30S".
  const iso = str.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/i);
  if (iso) {
    const h = Number(iso[1] || 0);
    const m = Number(iso[2] || 0);
    const s = Number(iso[3] || 0);
    return h * 60 + m + Math.round(s / 60);
  }

  // Free text fallback: "1 hr 30 min", "45 minutes", "2 hours".
  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit.startsWith("h")) total += n * 60;
    else total += n;
    matched = true;
  }
  return matched ? Math.round(total) : null;
}

// ---------- Yield parsing ----------

function parseYield(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") return `${value}`;
  if (typeof value === "string") {
    const s = normalizeString(value);
    return s || null;
  }
  if (Array.isArray(value)) {
    // Publishers sometimes emit ["4", "4 servings"] — the longer string is
    // usually the more informative one.
    let best = "";
    for (const item of value) {
      if (typeof item === "string") {
        const s = normalizeString(item);
        if (s.length > best.length) best = s;
      } else if (typeof item === "number") {
        const s = String(item);
        if (s.length > best.length) best = s;
      }
    }
    return best || null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const v = obj.value ?? obj.name;
    if (typeof v === "string") return normalizeString(v) || null;
    if (typeof v === "number") return String(v);
  }
  return null;
}

// ---------- Image picking ----------

// Schema.org allows image as a string, array of strings, ImageObject, or array
// of ImageObjects with width/height. Prefer the largest. Resolve relative URLs
// against the page URL.
function pickBestImage(value: unknown, base: string): string | null {
  const candidates = collectImages(value);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.area - a.area);
  return absolutize(candidates[0].url, base);
}

interface ImageCandidate {
  url: string;
  area: number;
}

function collectImages(value: unknown): ImageCandidate[] {
  if (!value) return [];
  if (typeof value === "string") return value ? [{ url: value, area: 0 }] : [];
  if (Array.isArray(value)) {
    const out: ImageCandidate[] = [];
    for (const item of value) out.push(...collectImages(item));
    return out;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const url = typeof obj.url === "string" ? obj.url : "";
    if (!url) return [];
    const w = Number(obj.width) || 0;
    const h = Number(obj.height) || 0;
    return [{ url, area: w * h }];
  }
  return [];
}

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

// ---------- OpenGraph fallback ----------

// When JSON-LD is missing, OG tags at least give us a title and image so we
// can render a stub. We don't try to recover ingredients heuristically — that
// path has too many false positives. Callers should reject the result if
// `ingredients.length === 0`, which we do in `extractFromHtml`.
function extractOpenGraph(html: string, url: string): ExtractedRecipe | null {
  const og = readOgTags(html);
  if (!og.title && !og.image) return null;

  return {
    url,
    title: normalizeString(og.title || "Untitled Recipe"),
    image: og.image ? absolutize(og.image, url) : null,
    prepTime: null,
    cookTime: null,
    servings: null,
    ingredients: [],
    instructions: [],
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
  };
}

function readOgTags(html: string): { title?: string; image?: string } {
  const out: { title?: string; image?: string } = {};
  const re =
    /<meta\s+[^>]*property=["']og:(title|image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].toLowerCase() as "title" | "image";
    if (!out[key]) out[key] = m[2];
  }
  // Try the reverse attribute order too: content=… property=…
  const reAlt =
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:(title|image)["'][^>]*>/gi;
  while ((m = reAlt.exec(html)) !== null) {
    const key = m[2].toLowerCase() as "title" | "image";
    if (!out[key]) out[key] = m[1];
  }
  return out;
}

// ---------- HTML heuristic fallback ----------

function extractHtmlHeuristic(html: string, url: string): ExtractedRecipe | null {
  const title = heuristicTitle(html);
  const image = heuristicImage(html, url);
  const { ingredients, instructions } = heuristicBody(html);

  if (ingredients.length === 0 || instructions.length === 0) return null;

  return {
    url,
    title: title || "Untitled Recipe",
    image,
    prepTime: null,
    cookTime: null,
    servings: null,
    ingredients,
    instructions,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
  };
}

function heuristicTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = stripTags(h1[1]);
    const n = normalizeString(t);
    if (n) return n;
  }
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) {
    let t = normalizeString(stripTags(titleTag[1]));
    t = t.replace(/\s+[—–-]\s+.+$/, "").trim();
    if (t) return t;
  }
  return "";
}

function heuristicImage(html: string, url: string): string | null {
  const og = readOgTags(html);
  if (og.image) return absolutize(og.image, url);
  const img = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
  if (img) return absolutize(img[1], url);
  return null;
}

function heuristicBody(
  html: string
): { ingredients: Ingredient[]; instructions: Instruction[] } {
  const ingredientsMarkerIdx = findIngredientsMarker(html);
  const ingredients: Ingredient[] = [];
  const instructions: Instruction[] = [];
  let sortOrder = 0;
  let step = 1;

  const ulBlocks = collectListBlocks(html, "ul");
  const olBlocks = collectListBlocks(html, "ol");

  if (ingredientsMarkerIdx !== -1) {
    for (const block of ulBlocks) {
      if (block.start < ingredientsMarkerIdx) continue;
      if (olBlocks.some((o) => o.start > ingredientsMarkerIdx && o.start < block.start)) {
        continue;
      }
      for (const text of listItemsText(block.inner)) {
        const n = normalizeString(text);
        if (n) ingredients.push({ text: n, sortOrder: sortOrder++ });
      }
    }
  }

  if (ingredients.length === 0 && ulBlocks.length > 0) {
    for (const block of ulBlocks) {
      for (const text of listItemsText(block.inner)) {
        const n = normalizeString(text);
        if (n) ingredients.push({ text: n, sortOrder: sortOrder++ });
      }
    }
  }

  for (const block of olBlocks) {
    for (const text of listItemsText(block.inner)) {
      const n = normalizeString(text);
      if (n) instructions.push({ step: step++, text: n });
    }
  }

  return { ingredients, instructions };
}

interface ListBlock {
  start: number;
  inner: string;
}

function collectListBlocks(html: string, tag: string): ListBlock[] {
  const out: ListBlock[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ start: m.index, inner: m[1] });
  }
  return out;
}

function listItemsText(inner: string): string[] {
  const out: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(inner)) !== null) {
    const liInner = m[1];
    const pTexts = collectParagraphTexts(liInner);
    if (pTexts.length > 0) {
      out.push(pTexts.join(" "));
    } else {
      const t = stripTags(liInner);
      if (t.trim()) out.push(t);
    }
  }
  return out;
}

function collectParagraphTexts(inner: string): string[] {
  const out: string[] = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(inner)) !== null) {
    const t = stripTags(m[1]);
    if (t.trim()) out.push(t);
  }
  return out;
}

function findIngredientsMarker(html: string): number {
  const re = /<(?:p|strong|b|h2|h3)[^>]*>([\s\S]*?)<\/(?:p|strong|b|h2|h3)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1]).trim().toLowerCase();
    if (text === "ingredients" || text.startsWith("ingredients")) {
      return m.index;
    }
  }
  return -1;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

// ---------- Small helpers ----------

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

// Decode the handful of HTML entities that actually show up inside JSON-LD
// string literals on real sites, and collapse runaway whitespace. We don't
// strip tags — JSON-LD shouldn't contain them, and if it does we'd rather see
// the bug than silently mangle content.
const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  frac12: "½",
  frac13: "⅓",
  frac14: "¼",
  frac23: "⅔",
  frac34: "¾",
  deg: "°",
};

// Unicode whitespace publishers love (NBSP, en/em spaces, hair/thin/ZW
// spaces, ideographic space). Listed by explicit codepoint so the regex is
// robust to editor copy/paste.
const UNICODE_SPACE_RE =
  /[   -​  　﻿]/g;

export function normalizeString(input: string): string {
  if (!input) return "";
  let s = input;
  // Numeric entities (decimal + hex).
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, n) =>
    String.fromCodePoint(parseInt(n, 16))
  );
  // Named entities.
  s = s.replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name.toLowerCase()] ?? m);
  // Normalize whitespace, collapse runs, but keep newlines so multi-paragraph
  // instructions don't smash into one line.
  s = s.replace(UNICODE_SPACE_RE, " ");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  return s.trim();
}
