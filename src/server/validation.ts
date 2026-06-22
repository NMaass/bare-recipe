import type { Ingredient, Instruction } from "../shared/types";

export const LIMITS = {
  manualRecipeBodyBytes: 100 * 1024,
  defaultJsonBodyBytes: 100 * 1024,
  submittedUrl: 2_000,
  title: 200,
  shortText: 100,
  ingredient: 500,
  instruction: 2_000,
  groceryItem: 500,
  recipeId: 2_000,
  ingredients: 100,
  instructions: 100,
  groceryItems: 100,
};

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationFailure {
  error: string;
  reason: "invalid_input";
  issues: ValidationIssue[];
}

export class InputValidationError extends Error {
  issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues[0]?.message || "Invalid input");
    this.name = "InputValidationError";
    this.issues = issues;
  }
}

export interface ManualRecipeInput {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: string | null;
  prepTime: string | null;
  cookTime: string | null;
}

export interface GroceryInputItem {
  text: string;
  recipeId: string;
  recipeTitle?: string;
}

export async function readJsonBody(
  request: Request,
  maxBytes = LIMITS.defaultJsonBodyBytes
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    throw new InputValidationError([
      { field: "body", message: `Request body must be ${maxBytes} bytes or less` },
    ]);
  }

  const text = await request.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    throw new InputValidationError([
      { field: "body", message: `Request body must be ${maxBytes} bytes or less` },
    ]);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new InputValidationError([
      { field: "body", message: "Request body must be valid JSON" },
    ]);
  }
}

export function validationFailure(issues: ValidationIssue[]): ValidationFailure {
  return {
    error: issues[0]?.message || "Invalid input",
    reason: "invalid_input",
    issues,
  };
}

export function validateExtractUrlBody(input: unknown): string {
  if (!isRecord(input)) {
    throw new InputValidationError([{ field: "body", message: "Body must be an object" }]);
  }
  return cleanString(input.url, {
    field: "url",
    max: LIMITS.submittedUrl,
    required: true,
  });
}

export function validateManualRecipe(input: unknown): ManualRecipeInput {
  if (!isRecord(input)) {
    throw new InputValidationError([{ field: "body", message: "Body must be an object" }]);
  }

  const issues: ValidationIssue[] = [];
  const title = collectString(issues, input.title, {
    field: "title",
    max: LIMITS.title,
    required: true,
  });
  const servings = collectString(issues, input.servings, {
    field: "servings",
    max: LIMITS.shortText,
    required: false,
  });
  const prepTime = collectString(issues, input.prepTime, {
    field: "prepTime",
    max: LIMITS.shortText,
    required: false,
  });
  const cookTime = collectString(issues, input.cookTime, {
    field: "cookTime",
    max: LIMITS.shortText,
    required: false,
  });

  const ingredientTexts = collectStringArray(issues, input.ingredients, {
    field: "ingredients",
    maxItems: LIMITS.ingredients,
    maxText: LIMITS.ingredient,
    required: true,
  });
  const instructionTexts = collectStringArray(issues, input.instructions, {
    field: "instructions",
    maxItems: LIMITS.instructions,
    maxText: LIMITS.instruction,
    required: false,
  });

  if (issues.length > 0) throw new InputValidationError(issues);

  return {
    title,
    servings,
    prepTime,
    cookTime,
    ingredients: ingredientTexts.map((text, sortOrder) => ({ text, sortOrder })),
    instructions: instructionTexts.map((text, index) => ({ step: index + 1, text })),
  };
}

export function validateRecipeId(input: unknown, field = "id"): string {
  return cleanString(input, {
    field,
    max: LIMITS.recipeId,
    required: true,
  });
}

export function validateGroceryItems(input: unknown): GroceryInputItem[] {
  if (!isRecord(input)) {
    throw new InputValidationError([{ field: "body", message: "Body must be an object" }]);
  }
  if (!Array.isArray(input.items)) {
    throw new InputValidationError([{ field: "items", message: "Items must be an array" }]);
  }
  if (input.items.length > LIMITS.groceryItems) {
    throw new InputValidationError([
      { field: "items", message: `Items must include ${LIMITS.groceryItems} entries or fewer` },
    ]);
  }

  const issues: ValidationIssue[] = [];
  const items: (GroceryInputItem | null)[] = input.items.map((item, index) => {
    if (!isRecord(item)) {
      issues.push({ field: `items.${index}`, message: "Item must be an object" });
      return null;
    }
    const recipeTitle = collectString(issues, item.recipeTitle, {
      field: `items.${index}.recipeTitle`,
      max: LIMITS.title,
      required: false,
    });
    return {
      text: collectString(issues, item.text, {
        field: `items.${index}.text`,
        max: LIMITS.groceryItem,
        required: true,
      }),
      recipeId: collectString(issues, item.recipeId, {
        field: `items.${index}.recipeId`,
        max: LIMITS.recipeId,
        required: false,
      }),
      ...(recipeTitle ? { recipeTitle } : {}),
    };
  });

  if (issues.length > 0) throw new InputValidationError(issues);
  return items.filter((item): item is GroceryInputItem => item !== null);
}

export function validateGroceryTextPatch(input: unknown): string | null {
  if (input === null) return null;
  if (!isRecord(input)) {
    throw new InputValidationError([{ field: "body", message: "Body must be an object" }]);
  }
  if (input.text === undefined) return null;
  return cleanString(input.text, {
    field: "text",
    max: LIMITS.groceryItem,
    required: true,
  });
}

export function validateMultiplier(input: unknown): number | null {
  if (!isRecord(input)) {
    throw new InputValidationError([{ field: "body", message: "Body must be an object" }]);
  }
  if (input.multiplier === undefined) return null;
  if (typeof input.multiplier !== "number" || !Number.isFinite(input.multiplier)) {
    throw new InputValidationError([
      { field: "multiplier", message: "Multiplier must be a number" },
    ]);
  }
  if (input.multiplier <= 0 || input.multiplier > 99) {
    throw new InputValidationError([
      { field: "multiplier", message: "Multiplier must be greater than 0 and no more than 99" },
    ]);
  }
  return input.multiplier;
}

export function cleanString(
  value: unknown,
  options: { field: string; max: number; required: boolean }
): string {
  if (value === undefined || value === null) {
    if (options.required) {
      throw new InputValidationError([
        { field: options.field, message: `${options.field} is required` },
      ]);
    }
    return "";
  }
  if (typeof value !== "string") {
    throw new InputValidationError([
      { field: options.field, message: `${options.field} must be a string` },
    ]);
  }
  const cleaned = value.replace(/\r\n?/g, "\n").replace(/\0/g, "").trim();
  if (options.required && cleaned.length === 0) {
    throw new InputValidationError([
      { field: options.field, message: `${options.field} is required` },
    ]);
  }
  if (cleaned.length > options.max) {
    throw new InputValidationError([
      { field: options.field, message: `${options.field} must be ${options.max} characters or fewer` },
    ]);
  }
  return cleaned;
}

function collectString(
  issues: ValidationIssue[],
  value: unknown,
  options: { field: string; max: number; required: boolean }
): string {
  try {
    return cleanString(value, options);
  } catch (err) {
    if (err instanceof InputValidationError) issues.push(...err.issues);
    else throw err;
    return "";
  }
}

function collectStringArray(
  issues: ValidationIssue[],
  value: unknown,
  options: {
    field: string;
    maxItems: number;
    maxText: number;
    required: boolean;
  }
): string[] {
  if (value === undefined || value === null) {
    if (options.required) {
      issues.push({ field: options.field, message: `${options.field} is required` });
    }
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push({ field: options.field, message: `${options.field} must be an array` });
    return [];
  }
  if (value.length > options.maxItems) {
    issues.push({
      field: options.field,
      message: `${options.field} must include ${options.maxItems} entries or fewer`,
    });
  }

  const out: string[] = [];
  value.forEach((item, index) => {
    const text = collectString(issues, item, {
      field: `${options.field}.${index}`,
      max: options.maxText,
      required: false,
    });
    if (text) out.push(text);
  });

  if (options.required && out.length === 0) {
    issues.push({
      field: options.field,
      message: `${options.field} must include at least one non-empty entry`,
    });
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
