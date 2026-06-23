import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { ApiError } from "../api";

function looksLikeUrl(input: string): boolean {
  try {
    const parsed = new URL(input.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parsePastedRecipe(text: string): {
  title: string;
  ingredients: string[];
  instructions: string[];
} | null {
  const lines = text.split("\n").map((l) => l.trim());
  const title = lines[0] || "";
  if (!title) return null;

  const ingredients: string[] = [];
  const instructions: string[] = [];

  let mode: "none" | "ingredients" | "instructions" = "none";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower === "ingredients" || lower.startsWith("ingredients:")) {
      mode = "ingredients";
      continue;
    }
    if (lower === "instructions" || lower.startsWith("instructions:") || lower === "directions" || lower.startsWith("directions:") || lower === "method" || lower.startsWith("method:")) {
      mode = "instructions";
      continue;
    }
    if (mode === "ingredients") ingredients.push(line);
    else if (mode === "instructions") instructions.push(line);
  }

  if (ingredients.length === 0 && instructions.length === 0) return null;

  return { title, ingredients, instructions };
}

export default function ExtractBar() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { extractAndSave, createManualRecipe, extracting, extractPhase } = useStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || extracting) return;

    if (looksLikeUrl(trimmed)) {
      try {
        const recipe = await extractAndSave(trimmed);
        setValue("");
        inputRef.current?.blur();
        navigate(`/recipe/${recipe.id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(messageForReason(err.reason, err.message));
        } else {
          setError(err instanceof Error ? err.message : "Couldn't save that recipe");
        }
      }
    } else {
      const parsed = parsePastedRecipe(trimmed);
      if (!parsed) {
        setError("Paste a recipe URL, or paste a recipe with a title, Ingredients, and Instructions.");
        return;
      }
      if (parsed.ingredients.length === 0) {
        setError("Couldn't find an ingredients section. Start it with a line that says \"Ingredients\".");
        return;
      }
      try {
        const recipe = await createManualRecipe({
          title: parsed.title,
          ingredients: parsed.ingredients,
          instructions: parsed.instructions,
        });
        setValue("");
        inputRef.current?.blur();
        navigate(`/recipe/${recipe.id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Couldn't save that recipe");
        }
      }
    }
  };

  const statusLabel =
    extractPhase === "fetching"
      ? "Fetching recipe…"
      : extractPhase === "cached"
        ? "Already in your library — pulled from cache."
        : extractPhase === "saved"
          ? "Saved."
          : null;

  const isMultiLine = value.includes("\n");

  return (
    <div className="sticky top-0 z-40 bg-cream/90 backdrop-blur-md border-b border-warm-border pt-[env(safe-area-inset-top)]">
      <div className="max-w-xl mx-auto px-4 py-2.5">
        <form onSubmit={handleSubmit}>
          <div className="relative flex-1">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 text-ink-soft absolute left-3 top-3"
            >
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
              <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
            </svg>
            {isMultiLine ? (
              <textarea
                ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={"Paste a recipe URL or paste recipe text\n(Title on first line, then Ingredients: and Instructions:)"}
                disabled={extracting}
                rows={4}
                className="w-full pl-9 pr-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-[15px] leading-relaxed focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg disabled:bg-cream-dark disabled:text-ink-soft resize-y"
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Paste a recipe URL or recipe text"
                disabled={extracting}
                className="w-full pl-9 pr-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-[15px] focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg disabled:bg-cream-dark disabled:text-ink-soft"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={!value.trim() || extracting}
            aria-label="Save recipe"
            className="w-full mt-2 h-11 bg-olive text-cream font-medium text-sm tracking-wide hover:bg-olive-light active:scale-[0.98] disabled:bg-sage disabled:text-cream disabled:cursor-not-allowed transition-all rounded-lg flex items-center justify-center gap-2"
          >
            {extracting ? (
              <>
                <span className="h-4 w-4 border-2 border-cream/30 border-t-cream rounded-full animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
                Save Recipe
              </>
            )}
          </button>
        </form>
        {statusLabel && !error && (
          <p
            role="status"
            className={`mt-2 text-xs ${
              extractPhase === "cached" ? "text-olive" : "text-ink-muted"
            }`}
          >
            {statusLabel}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-terracotta">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function messageForReason(reason: string, fallback: string): string {
  switch (reason) {
    case "invalid_url":
      return "That URL doesn't look right.";
    case "unreachable":
      return "Couldn't reach the site. Check the link and try again.";
    case "blocked":
      return "That site is blocking us. Try a different source.";
    case "no_recipe":
      return "We loaded the page but couldn't find recipe data.";
    case "too_large":
      return "That page is too large to process.";
    default:
      return fallback || "Couldn't save that recipe.";
  }
}
