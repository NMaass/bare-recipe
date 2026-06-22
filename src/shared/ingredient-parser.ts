import Fraction from "fraction.js";

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

export function parseIngredient(text: string): ParsedIngredient {
  let s = text.trim();

  for (const [unicode, ascii] of Object.entries(UNICODE_TO_ASCII)) {
    s = s.replace(unicode, ascii);
  }

  const qtyMatch = s.match(/^(\d+(?:\s+\d+\/\d+)?|\d+\/\d+|\d*\.\d+)\s*/);
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

  name = name.replace(/\s*\([^)]*\)/g, "").trim();

  const key = unit ? `${unit}:${name.toLowerCase()}` : name.toLowerCase();

  return { quantity, unit, name: name || text.trim(), key };
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
