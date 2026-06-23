import { describe, expect, test } from "bun:test";
import { extractFromHtml } from "./extractor";
import { canonicalizeUrl, isSafeHost, safeAbsoluteUrl } from "./url";
import {
  InputValidationError,
  validateExtractUrlBody,
  validateGroceryTextPatch,
  validateManualRecipe,
} from "./validation";

describe("input validation", () => {
  test("keeps SQL-looking and script-looking recipe text as bounded data", () => {
    const recipe = validateManualRecipe({
      id: "user-chosen-id",
      title: "Robert'); DROP TABLE recipes;--",
      ingredients: ["<script>window.__xss = true</script>", "1 cup flour"],
      instructions: ["Bake until done"],
    });

    expect(recipe.title).toBe("Robert'); DROP TABLE recipes;--");
    expect(recipe.ingredients[0].text).toBe("<script>window.__xss = true</script>");
    expect("id" in recipe).toBe(false);
  });

  test("rejects invalid types, empty required fields, and overlong fields", () => {
    expect(() => validateManualRecipe({ title: "", ingredients: ["flour"] })).toThrow(
      InputValidationError
    );
    expect(() => validateManualRecipe({ title: "Cake", ingredients: "flour" })).toThrow(
      InputValidationError
    );
    expect(() =>
      validateManualRecipe({
        title: "x".repeat(201),
        ingredients: ["flour"],
      })
    ).toThrow(InputValidationError);
  });

  test("rejects overlarge manual recipe arrays", () => {
    expect(() =>
      validateManualRecipe({
        title: "Cake",
        ingredients: Array.from({ length: 101 }, (_, index) => `item ${index}`),
      })
    ).toThrow(InputValidationError);
  });

  test("rejects submitted URL fields longer than the ingestion limit", () => {
    expect(() => validateExtractUrlBody({ url: `https://example.com/${"x".repeat(2_001)}` }))
      .toThrow(InputValidationError);
  });

  test("allows empty grocery toggle PATCH bodies but validates text edits", () => {
    expect(validateGroceryTextPatch(null)).toBeNull();
    expect(validateGroceryTextPatch({ text: "  milk \r\n" })).toBe("milk");
    expect(() => validateGroceryTextPatch({ text: "x".repeat(501) })).toThrow(
      InputValidationError
    );
  });
});

describe("URL safety", () => {
  test("rejects unsafe outbound URL schemes", () => {
    expect(safeAbsoluteUrl("javascript:alert(1)", "https://example.com")).toBeNull();
    expect(safeAbsoluteUrl("data:text/html,<script></script>", "https://example.com")).toBeNull();
    expect(safeAbsoluteUrl("file:///etc/passwd", "https://example.com")).toBeNull();
    expect(safeAbsoluteUrl("https://cdn.example.com/photo.jpg")).toBe(
      "https://cdn.example.com/photo.jpg"
    );
  });

  test("re-checks a redirected final URL for unsafe hosts", () => {
    const finalUrl = canonicalizeUrl("http://127.0.0.1/admin");
    expect(finalUrl).not.toBeNull();
    expect(isSafeHost(finalUrl?.host || "")).toBe(false);
  });

  test("routes equipment/notes out of a polluted recipeIngredient list", () => {
    // Mirrors a real site (The Berger Feed) that stuffs an affiliate equipment
    // list and prose tips into recipeIngredient, and glues two ingredients onto
    // one line. JSON-LD locates the list; the extractor cleans what's inside it.
    const recipe = extractFromHtml({
      url: "https://example.com/strawberry-rhubarb-cookies",
      html: `
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Strawberry Rhubarb Cookies",
            "recipeIngredient": [
              "Sheet Trays Shop on Amazon",
              "Whisk",
              "1 Large Cookie Scoop",
              "2 cups all-purpose flour",
              "3/4 teaspoon baking soda",
              "1/2 cup granulated sugar",
              "\\u00bd cup diced rhubarb (70 g) 1 tbsp granulated sugar (12 g)",
              "Chilling the dough is important for these cookies to keep their shape.",
              "I tested these with store-bought jam."
            ],
            "recipeInstructions": ["Mix", "Bake"]
          }
        </script>
      `,
    });

    const kinds = (recipe?.ingredients ?? []).map((i) => ({ text: i.text, kind: i.kind }));

    // Merged line was split into two real ingredients.
    expect(kinds.filter((k) => k.kind === "ingredient").map((k) => k.text)).toEqual([
      "2 cups all-purpose flour",
      "3/4 teaspoon baking soda",
      "1/2 cup granulated sugar",
      "½ cup diced rhubarb (70 g)",
      "1 tbsp granulated sugar (12 g)",
    ]);
    // Equipment/affiliate rows and prose tips routed out (kept, not dropped).
    expect(kinds.filter((k) => k.kind === "equipment").map((k) => k.text)).toEqual([
      "Sheet Trays Shop on Amazon",
      "Whisk",
      "1 Large Cookie Scoop",
    ]);
    expect(kinds.filter((k) => k.kind === "note")).toHaveLength(2);
    // Nothing lost.
    expect(kinds).toHaveLength(10);
  });

  test("drops unsafe scraped image URLs during extraction", () => {
    const recipe = extractFromHtml({
      url: "https://example.com/recipe",
      html: `
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Test",
            "image": "javascript:alert(1)",
            "recipeIngredient": ["1 cup flour"],
            "recipeInstructions": ["Mix"]
          }
        </script>
      `,
    });

    expect(recipe?.image).toBeNull();
  });
});
