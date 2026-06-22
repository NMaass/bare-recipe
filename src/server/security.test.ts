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
