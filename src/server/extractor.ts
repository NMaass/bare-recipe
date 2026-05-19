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
  const rawIngredients = data.recipeIngredient;
  if (Array.isArray(rawIngredients)) {
    rawIngredients.forEach((item, i) => {
      ingredients.push({ text: String(item), sortOrder: i });
    });
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
