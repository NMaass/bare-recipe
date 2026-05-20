import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { formatDuration, usePageTitle } from "../utils";

export default function SavedPage() {
  const { savedRecipes, loadSavedRecipes, deleteRecipe, setCurrentRecipe } = useStore();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => { usePageTitle("Saved"); }, []);

  // Debounce search input → server query.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    loadSavedRecipes(debouncedQuery || undefined);
  }, [loadSavedRecipes, debouncedQuery]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirmingId !== id) {
      setConfirmingId(id);
      setTimeout(() => setConfirmingId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }

    setConfirmingId(null);
    await deleteRecipe(id);
  };

  const searching = debouncedQuery.trim().length > 0;

  if (savedRecipes.length === 0 && !searching) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-start justify-center min-h-[60vh] px-6 animate-page">
        <p className="text-ink-muted text-sm font-medium tracking-wide uppercase mb-3">
          Saved recipes
        </p>
        <h2 className="font-serif text-3xl text-ink mb-2">Nothing yet</h2>
        <p className="text-ink-light text-base">
          Paste a recipe link above to save your first.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-5 pt-6 pb-6 animate-page">
      <p className="text-ink-muted text-xs font-medium tracking-widest uppercase mb-1">
        Saved
      </p>
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
          className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2"
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
          className="w-full pl-9 pr-3 py-2.5 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-muted/70 text-[14px] focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg"
        />
      </div>

      {savedRecipes.length === 0 && searching && (
        <p className="text-ink-muted text-sm">No matches for "{debouncedQuery}".</p>
      )}

      <div className="space-y-3 stagger">
        {savedRecipes.map((recipe) => (
          <Link
            key={recipe.id}
            to={`/recipe/${recipe.id}`}
            onClick={() => setCurrentRecipe(recipe)}
            className="flex gap-4 items-center p-3 -mx-3 rounded-lg hover:bg-cream-dark active:bg-cream-dark transition-colors group"
          >
            {recipe.image ? (
              <img
                src={recipe.image}
                alt=""
                loading="lazy"
                className="w-16 h-16 rounded-md object-cover shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-md bg-cream-dark shrink-0 flex items-center justify-center text-ink-muted/40 text-2xl" aria-hidden="true">
                ~
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
                    .join(" \u00b7 ")}
                </p>
              )}
            </div>
            <button
              onClick={(e) => handleDelete(recipe.id, e)}
              aria-label={confirmingId === recipe.id ? `Confirm delete ${recipe.title}` : `Delete ${recipe.title}`}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 transition-colors rounded-md ${
                confirmingId === recipe.id
                  ? "text-terracotta bg-terracotta/10"
                  : "text-ink-muted/40 hover:text-terracotta"
              }`}
            >
              {confirmingId === recipe.id ? (
                <span className="text-xs font-medium">Delete?</span>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
                </svg>
              )}
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
