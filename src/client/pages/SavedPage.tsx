import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { formatDuration, safeHostname, safeImageUrl, safeOutboundUrl, usePageTitle } from "../utils";
import { isShoppableIngredient } from "../../shared/ingredient-parser";

export default function SavedPage() {
  const { savedRecipes, loadSavedRecipes, deleteRecipe, setCurrentRecipe, addToGrocery } = useStore();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  usePageTitle("Saved");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    loadSavedRecipes(debouncedQuery || undefined);
  }, [loadSavedRecipes, debouncedQuery]);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (addedTimer.current) clearTimeout(addedTimer.current);
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirmingId !== id) {
      setConfirmingId(id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => {
        setConfirmingId((cur) => (cur === id ? null : cur));
      }, 3000);
      return;
    }

    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingId(null);
    await deleteRecipe(id);
  };

  const handleAddToGrocery = async (recipeId: string, title: string, ingredients: string[], e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await addToGrocery(recipeId, title, ingredients);
    setAddedId(recipeId);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedId(null), 2000);
  };

  const searching = debouncedQuery.trim().length > 0;

  if (savedRecipes.length === 0 && !searching) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-start justify-center min-h-[60vh] px-6 animate-page">
        <h1 className="font-serif text-3xl text-ink mt-2 mb-2">Nothing yet</h1>
        <p className="text-ink-light text-base">
          Paste a recipe link above to save your first.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-5 pt-6 pb-6 animate-page">
      <h1 className="font-serif text-2xl text-ink mb-4">
        {searching
          ? `${savedRecipes.length} result${savedRecipes.length !== 1 ? "s" : ""}`
          : `${savedRecipes.length} recipe${savedRecipes.length !== 1 ? "s" : ""}`}
      </h1>

      <div className="relative mb-5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-4 h-4 text-ink-soft absolute left-3 top-1/2 -translate-y-1/2"
        >
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m20 20-3-3" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search saved recipes"
          aria-label="Search saved recipes"
          className="w-full pl-9 pr-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-[14px] focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg"
        />
      </div>

      {savedRecipes.length === 0 && searching && (
        <p className="text-ink-muted text-sm">No matches for "{debouncedQuery}".</p>
      )}

      <div className="space-y-3 stagger">
        {savedRecipes.map((recipe) => {
          const imageUrl = safeImageUrl(recipe.image);
          const isConfirming = confirmingId === recipe.id;
          const isAdded = addedId === recipe.id;
          const sourceUrl = safeOutboundUrl(recipe.url);
          const hostname = sourceUrl ? safeHostname(sourceUrl) : null;
          return (
            <Link
              key={recipe.id}
              to={`/recipe/${recipe.id}`}
              onClick={() => setCurrentRecipe(recipe)}
              className="flex gap-4 items-center p-3 -mx-3 rounded-lg hover:bg-cream-dark active:bg-cream-dark transition-colors group"
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  className="w-16 h-16 rounded-md object-cover shrink-0"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-md bg-cream-dark shrink-0 flex items-center justify-center text-olive/60 font-serif text-3xl leading-none"
                  aria-hidden="true"
                >
                  {recipe.title?.trim().charAt(0).toUpperCase() || "·"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-ink text-[15px] leading-snug line-clamp-2">
                  {recipe.title}
                </h3>
                {(recipe.prepTime || recipe.cookTime) && (
                  <p className="text-xs text-ink-muted mt-0.5">
                    {[
                      recipe.prepTime && `Prep ${formatDuration(recipe.prepTime)}`,
                      recipe.cookTime && `Cook ${formatDuration(recipe.cookTime)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {sourceUrl && hostname && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Open ${recipe.title} on ${hostname}`}
                    className="w-9 h-9 flex items-center justify-center rounded-md text-ink-faint hover:text-olive transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                  </a>
                )}
                <button
                  onClick={(e) => handleAddToGrocery(recipe.id, recipe.title, recipe.ingredients.filter((i) => isShoppableIngredient(i.kind)).map((i) => i.text), e)}
                  aria-label={`Add ${recipe.title} to grocery list`}
                  className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
                    isAdded
                      ? "text-olive bg-olive-bg"
                      : "text-ink-faint hover:text-olive hover:bg-olive-bg"
                  }`}
                >
                  {isAdded ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-4 h-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 10a4 4 0 0 1-8 0" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={(e) => handleDelete(recipe.id, e)}
                  aria-label={isConfirming ? `Confirm delete ${recipe.title}` : `Delete ${recipe.title}`}
                  aria-live="polite"
                  className={`flex items-center justify-center rounded-md transition-colors ${
                    isConfirming
                      ? "text-terracotta bg-terracotta/10 px-2.5 h-9 text-xs font-medium"
                      : "text-ink-faint hover:text-terracotta w-9 h-9"
                  }`}
                >
                  {isConfirming ? (
                    "Delete?"
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  )}
                </button>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
