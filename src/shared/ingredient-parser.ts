import Fraction from "fraction.js";
import type { IngredientKind } from "./types";

export type { IngredientKind };

const UNICODE_TO_ASCII: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const UNIT_NORMALIZE: Record<string, string> = {
  cup: "cup", cups: "cup", c: "cup",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  pound: "pound", pounds: "pound", lb: "pound", lbs: "pound",
  ounce: "oz", ounces: "oz", oz: "oz",
  gram: "g", grams: "g", g: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  stick: "stick", sticks: "stick",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  package: "package", packages: "package", pkg: "package",
  bunch: "bunch", bunches: "bunch",
  pinch: "pinch", dash: "pinch",
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece",
  pint: "pint", pints: "pint",
  quart: "quart", quarts: "quart", qt: "quart",
  gallon: "gallon", gallons: "gallon",
  ml: "ml", milliliter: "ml", milliliters: "ml",
  liter: "liter", liters: "liter", l: "liter",
  bag: "bag", bags: "bag",
  box: "box", boxes: "box",
  bottle: "bottle", bottles: "bottle",
  container: "container", containers: "container",
  head: "head", heads: "head",
  ear: "ear", ears: "ear",
  stalk: "stalk", stalks: "stalk",
  sprig: "sprig", sprigs: "sprig",
  leaf: "leaf", leaves: "leaf",
  drop: "drop", drops: "drop",
  handful: "handful", handfuls: "handful",
  bar: "bar", bars: "bar",
  sheet: "sheet", sheets: "sheet",
  slab: "slab", slabs: "slab",
  cube: "cube", cubes: "cube",
  strip: "strip", strips: "strip",
  rack: "rack", racks: "rack",
  loaf: "loaf", loaves: "loaf",
  roll: "roll", rolls: "roll",
  ball: "ball", balls: "ball",
  dozen: "dozen",
};

const PLURAL_UNITS: Record<string, string> = {
  cup: "cups",
  pound: "pounds",
  ounce: "ounces",
  oz: "oz",
  gram: "grams",
  g: "g",
  kg: "kg",
  stick: "sticks",
  clove: "cloves",
  can: "cans",
  package: "packages",
  bunch: "bunches",
  pinch: "pinches",
  slice: "slices",
  piece: "pieces",
  pint: "pints",
  quart: "quarts",
  gallon: "gallons",
  liter: "liters",
  bag: "bags",
  box: "boxes",
  bottle: "bottles",
  container: "containers",
  head: "heads",
  ear: "ears",
  stalk: "stalks",
  sprig: "sprigs",
  leaf: "leaves",
  drop: "drops",
  handful: "handfuls",
  bar: "bars",
  sheet: "sheets",
  slab: "slabs",
  cube: "cubes",
  strip: "strips",
  rack: "racks",
  loaf: "loaves",
  roll: "rolls",
  ball: "balls",
  tbsp: "tbsp",
  tsp: "tsp",
  ml: "ml",
  dozen: "dozen",
};

export interface ParsedIngredient {
  quantity: number | null;
  unit: string;
  name: string;
  key: string;
}

// Leading-quantity matcher. Alternatives are ordered longest-first because JS
// regex alternation is greedy-by-position: a bare `\d+` would otherwise swallow
// the "1" of "1/2" and leave "/2 cup sugar", corrupting both the consolidation
// key and the running total. Mixed number → simple fraction → decimal → integer.
const LEADING_QTY = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*/;

export function parseIngredient(text: string): ParsedIngredient {
  let s = text.trim();

  for (const [unicode, ascii] of Object.entries(UNICODE_TO_ASCII)) {
    s = s.replace(unicode, ascii);
  }

  const qtyMatch = s.match(LEADING_QTY);
  let quantity: number | null = null;
  if (qtyMatch) {
    try {
      quantity = new Fraction(qtyMatch[1].trim()).valueOf();
    } catch {
      quantity = parseFloat(qtyMatch[1]);
    }
    s = s.slice(qtyMatch[0].length);
  }

  const unitMatch = s.match(/^([a-zA-Z]+)\.?\s+/);
  let unit = "";
  let name = s;
  if (unitMatch) {
    const unitLower = unitMatch[1].toLowerCase();
    if (UNIT_NORMALIZE[unitLower]) {
      unit = UNIT_NORMALIZE[unitLower];
      name = s.slice(unitMatch[0].length);
    }
  }

  name = name.replace(/\s*\(\(.*?\)\)\s*/g, " ").replace(/\s*\([^)]*\)/g, "").trim();

  const key = unit ? `${unit}:${name.toLowerCase()}` : name.toLowerCase();

  return { quantity, unit, name: name || text.trim(), key };
}

// ---------- Line classification (Problem B: junk in recipeIngredient) ----------

// A `recipeIngredient` array from JSON-LD is trusted to *locate* the list but
// not to be clean — some sites stuff equipment/affiliate rows and prose notes
// in there. We don't try to re-solve general recipe extraction; we just route
// each already-located line. The contract is route-don't-delete: a
// misclassification lands a line in the wrong bucket, never drops it.

// Whether a routed line belongs on a shopping list. Absent kind (manual recipes,
// pre-routing cached rows) is treated as a real ingredient.
export function isShoppableIngredient(kind?: IngredientKind): boolean {
  return (kind ?? "ingredient") === "ingredient";
}

// Intentionally tight. Multi-word phrases match as substrings; single words get
// word boundaries below so "whisk" doesn't trip on "whisked". We'd rather miss a
// junk line (it stays a harmless ingredient) than eat a real one.
const EQUIPMENT_TERMS = [
  "shop on amazon",
  "sheet tray", "sheet pan", "baking sheet", "cookie sheet",
  "mixing bowl", "stand mixer", "hand mixer", "rolling pin",
  "cookie scoop", "ice cream scoop", "wire rack", "cooling rack",
  "measuring cup", "measuring spoon", "food processor", "dutch oven",
  "parchment", "ramekin", "thermometer", "saucepan", "skillet",
  "spatula", "whisk", "sifter", "colander", "tongs", "ladle",
];
const EQUIPMENT_RE = new RegExp(
  `(?:^|\\b)(?:${EQUIPMENT_TERMS.map((t) => t.replace(/\s+/g, "\\s+")).join("|")})(?:\\b|$)`,
  "i"
);

// Prose cues that mark a tip/note rather than an ingredient. Paired with a
// length check so short bare ingredients ("Flaky salt, for topping") stay put.
const NOTE_CUES = [
  "important", "make sure", "be sure", "keep in mind", "feel free",
  "i tested", "i used", "i recommend", "if you", "if making", "if your",
  "note:", "tip:", "pro tip", "for best", "for perfectly", "for perfect",
  "to be precise", "is essential", "is key", "store-bought", "you can",
  "you'll", "don't ", "tested these",
];

export function classifyIngredientLine(text: string): IngredientKind {
  const trimmed = text.trim();
  if (!trimmed) return "ingredient";
  const lower = trimmed.toLowerCase();

  // Equipment is checked first, before measurement: "1 Large Cookie Scoop"
  // parses a quantity but is still equipment.
  if (EQUIPMENT_RE.test(lower)) return "equipment";

  const parsed = parseIngredient(trimmed);
  if (parsed.quantity !== null || parsed.unit !== "") return "ingredient";

  // No measurement → could be a bare ingredient ("Salt") or a prose note.
  const wordCount = lower.split(/\s+/).length;
  const looksLikeProse =
    wordCount >= 8 ||
    NOTE_CUES.some((c) => lower.includes(c)) ||
    (wordCount >= 5 && /[.!?]$/.test(trimmed));
  return looksLikeProse ? "note" : "ingredient";
}

// Two ingredients glued onto one JSON-LD line, e.g.
//   "½ cup diced rhubarb (70 g) 1 tbsp granulated sugar (12 g)".
// Conservative on purpose: only split when a closing ")" (a metric/parenthetical
// annotation) is immediately followed by another "<qty> <unit>" token. That
// high-precision shape avoids splitting prose like "1 cup flour plus 2 tbsp for
// dusting", which has no paren before the second quantity.
const QTY_TOKEN =
  "(?:[\\u00BC-\\u00BE\\u2150-\\u215E]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.\\d+|\\d+)";

export function splitMergedIngredientLine(text: string): string[] {
  const units = Object.keys(UNIT_NORMALIZE)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const re = new RegExp(
    `(?<=\\))\\s+(?=${QTY_TOKEN}\\s*(?:${units})\\b)`,
    "gi"
  );
  const parts = text
    .split(re)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

const FRACTION_GLYPHS: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
  "1/5": "⅕",
  "2/5": "⅖",
  "3/5": "⅗",
  "4/5": "⅘",
  "1/6": "⅙",
  "5/6": "⅚",
  "1/8": "⅛",
  "3/8": "⅜",
  "5/8": "⅝",
  "7/8": "⅞",
};

export function formatQuantity(value: number): string {
  if (value === Math.floor(value)) return String(value);
  try {
    const frac = new Fraction(value).simplify(0.02).toFraction(true);
    if (frac.includes("/")) {
      const [whole, fracPart] = frac.includes(" ")
        ? frac.split(" ")
        : ["", frac];
      const glyph = FRACTION_GLYPHS[fracPart] ?? fracPart;
      return whole ? `${whole} ${glyph}` : glyph;
    }
    return frac;
  } catch {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }
}

export function formatUnit(unit: string, quantity: number): string {
  if (!unit) return "";
  if (quantity > 1 && PLURAL_UNITS[unit]) return PLURAL_UNITS[unit];
  return unit;
}

export function buildDisplayText(
  quantity: number | null,
  unit: string,
  name: string
): string {
  const parts: string[] = [];
  if (quantity !== null && quantity > 0) {
    parts.push(formatQuantity(quantity));
  }
  if (unit) {
    parts.push(formatUnit(unit, quantity ?? 1));
  }
  parts.push(name);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function scaleIngredientText(text: string, factor: number): string {
  if (factor === 1) return text;

  let s = text.trim();
  for (const [unicode, ascii] of Object.entries(UNICODE_TO_ASCII)) {
    s = s.replace(unicode, ascii);
  }

  const qtyMatch = s.match(LEADING_QTY);
  if (!qtyMatch) return text;

  let quantity: number;
  try {
    quantity = new Fraction(qtyMatch[1].trim()).valueOf();
  } catch {
    return text;
  }

  const scaled = quantity * factor;
  if (scaled <= 0) return text;

  const scaledStr = formatQuantity(scaled);
  const remainder = s.slice(qtyMatch[0].length);
  return `${scaledStr} ${remainder}`.replace(/\s+/g, " ").trim();
}

export function parseServings(servings: string | null): number {
  if (!servings) return 4;
  const match = servings.match(/\d+/);
  return match ? parseInt(match[0], 10) : 4;
}
