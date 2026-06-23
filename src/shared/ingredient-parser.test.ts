import { describe, expect, test } from "bun:test";
import {
  parseIngredient,
  classifyIngredientLine,
  splitMergedIngredientLine,
  isShoppableIngredient,
} from "./ingredient-parser";

describe("parseIngredient — leading fractions", () => {
  test("simple leading fraction parses to its real value, not the integer head", () => {
    const p = parseIngredient("1/2 cup Sugar");
    expect(p.quantity).toBe(0.5);
    expect(p.unit).toBe("cup");
    expect(p.key).toBe("cup:sugar");
  });

  test("3/4 teaspoon → 0.75 tsp (was parsing as 3)", () => {
    const p = parseIngredient("3/4 teaspoon baking soda");
    expect(p.quantity).toBe(0.75);
    expect(p.unit).toBe("tsp");
    expect(p.key).toBe("tsp:baking soda");
  });

  test("mixed numbers still work", () => {
    expect(parseIngredient("1 1/2 cups flour").quantity).toBe(1.5);
  });

  test("decimals and unicode fractions still work", () => {
    expect(parseIngredient("0.5 cup milk").quantity).toBe(0.5);
    expect(parseIngredient("½ cup sugar").quantity).toBe(0.5);
  });

  test("two ½-cup sugars consolidate to one cup under a stable key", () => {
    const a = parseIngredient("1/2 cup sugar");
    const b = parseIngredient("½ cup sugar");
    expect(a.key).toBe(b.key);
    expect((a.quantity ?? 0) + (b.quantity ?? 0)).toBe(1);
  });
});

describe("classifyIngredientLine", () => {
  test("measured lines are ingredients", () => {
    expect(classifyIngredientLine("1 cup flour")).toBe("ingredient");
    expect(classifyIngredientLine("3/4 teaspoon baking soda")).toBe("ingredient");
  });

  test("bare ingredients without a measurement stay ingredients", () => {
    expect(classifyIngredientLine("Salt")).toBe("ingredient");
    expect(classifyIngredientLine("Flaky sea salt, for topping")).toBe("ingredient");
  });

  test("equipment and affiliate rows route to equipment", () => {
    expect(classifyIngredientLine("Sheet Trays Shop on Amazon")).toBe("equipment");
    expect(classifyIngredientLine("Whisk")).toBe("equipment");
    expect(classifyIngredientLine("1 Large Cookie Scoop")).toBe("equipment");
  });

  test("equipment lexicon uses word boundaries (does not eat 'whisked')", () => {
    expect(classifyIngredientLine("2 cups whisked eggs")).toBe("ingredient");
  });

  test("prose tips route to note", () => {
    expect(
      classifyIngredientLine("Chilling the dough is important for these cookies to keep their shape.")
    ).toBe("note");
    expect(classifyIngredientLine("For perfectly round cookies, re-roll while warm.")).toBe("note");
    expect(classifyIngredientLine("I tested these with store-bought jam.")).toBe("note");
  });
});

describe("splitMergedIngredientLine", () => {
  test("splits two ingredients glued by a metric parenthetical", () => {
    const parts = splitMergedIngredientLine(
      "½ cup diced rhubarb (70 g) 1 tbsp granulated sugar (12 g)"
    );
    expect(parts).toEqual([
      "½ cup diced rhubarb (70 g)",
      "1 tbsp granulated sugar (12 g)",
    ]);
  });

  test("leaves a single ingredient untouched", () => {
    expect(splitMergedIngredientLine("1 cup flour")).toEqual(["1 cup flour"]);
    expect(splitMergedIngredientLine("1 (14.5 oz) can diced tomatoes")).toEqual([
      "1 (14.5 oz) can diced tomatoes",
    ]);
  });

  test("does not split prose with a second quantity but no parenthetical", () => {
    expect(splitMergedIngredientLine("1 cup flour plus 2 tbsp for dusting")).toEqual([
      "1 cup flour plus 2 tbsp for dusting",
    ]);
  });
});

describe("isShoppableIngredient", () => {
  test("absent kind is treated as a real ingredient", () => {
    expect(isShoppableIngredient(undefined)).toBe(true);
    expect(isShoppableIngredient("ingredient")).toBe(true);
    expect(isShoppableIngredient("equipment")).toBe(false);
    expect(isShoppableIngredient("note")).toBe(false);
  });
});
