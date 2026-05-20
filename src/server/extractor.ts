import type { Recipe, Ingredient, Instruction } from "../shared/types";

export async function extractRecipe(url: string): Promise<Recipe | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await response.text();

  // Find all ld+json script blocks
  const ldJsonRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  const blocks: string[] = [];

  while ((match = ldJsonRegex.exec(html)) !== null) {
    blocks.push(match[1]);
  }

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    const recipe = findRecipe(parsed);
    if (recipe) {
      return mapToRecipe(recipe, url);
    }
  }

  return null;
}

function findRecipe(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipe(item);
      if (found) return found;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check @graph
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const found = findRecipe(item);
      if (found) return found;
    }
  }

  // Check @type
  const type = obj["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    return obj;
  }

  return null;
}

function mapToRecipe(data: Record<string, unknown>, url: string): Recipe {
  const ingredients: Ingredient[] = [];
  // Some sites publish `recipeIngredient`; a few use `ingredients` or object-form items.
  const rawIngredients = data.recipeIngredient ?? data.ingredients;
  if (Array.isArray(rawIngredients)) {
    rawIngredients.forEach((item, i) => {
      const text = ingredientText(item);
      if (text) ingredients.push({ text, sortOrder: i });
    });
  } else if (typeof rawIngredients === "string") {
    rawIngredients
      .split(/\r?\n|;|·/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text, i) => ingredients.push({ text, sortOrder: i }));
  }

  const instructions: Instruction[] = [];
  const rawInstructions = data.recipeInstructions;
  if (Array.isArray(rawInstructions)) {
    let stepNum = 1;
    for (const item of rawInstructions) {
      if (typeof item === "string") {
        instructions.push({ step: stepNum++, text: item });
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        // HowToSection contains nested steps in itemListElement
        if (obj["@type"] === "HowToSection" && Array.isArray(obj.itemListElement)) {
          for (const subItem of obj.itemListElement as Record<string, unknown>[]) {
            const text = (subItem.text || subItem.name || "") as string;
            if (text) instructions.push({ step: stepNum++, text: String(text) });
          }
        } else {
          const text = (obj.text || obj.name || "") as string;
          if (text) instructions.push({ step: stepNum++, text: String(text) });
        }
      }
    }
  } else if (typeof rawInstructions === "string") {
    instructions.push({ step: 1, text: rawInstructions });
  }

  return {
    id: crypto.randomUUID(),
    url,
    title: String(data.name || "Untitled Recipe"),
    image: extractImage(data.image),
    prepTime: data.prepTime ? String(data.prepTime) : null,
    cookTime: data.cookTime ? String(data.cookTime) : null,
    servings: data.recipeYield
      ? String(Array.isArray(data.recipeYield) ? data.recipeYield[0] : data.recipeYield)
      : null,
    ingredients,
    instructions,
  };
}

// Coerce a recipeIngredient entry into a clean "qty unit name" string.
// Sites often publish object-form items (e.g. { name, quantity, unitText })
// instead of plain strings — without this they fell through as "[object Object]"
// and the weight/unit got dropped.
function ingredientText(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (typeof item === "number") return String(item);
  if (!item || typeof item !== "object") return "";

  const obj = item as Record<string, unknown>;

  // Prefer a pre-formatted string the publisher already built.
  for (const key of ["text", "description"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const name = pickString(obj, ["name", "ingredient", "item", "label"]);

  // Quantity + unit often live together in a QuantitativeValue
  // (e.g. amount: { value: 2, unitText: "tbsp" }). Resolve them as a pair so
  // we don't pull "2" from `amount.value` and then miss "tbsp" because the
  // top-level object has no `unitText`.
  let qty = "";
  let unit = "";
  for (const key of ["quantity", "amount", "value", "weight"]) {
    const v = obj[key];
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) { qty = v.trim(); break; }
    if (typeof v === "number") { qty = String(v); break; }
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

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function extractImage(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    const first = image[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return (first as Record<string, unknown>).url as string || null;
    return null;
  }
  if (typeof image === "object") {
    return (image as Record<string, unknown>).url as string || null;
  }
  return null;
}
