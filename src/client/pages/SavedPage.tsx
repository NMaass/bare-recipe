import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { formatDuration, usePageTitle } from "../utils";

export default function SavedPage() {
  const { savedRecipes, loadSavedRecipes, deleteRecipe, setCurrentRecipe } = useStore();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => { usePageTitle("Saved"); }, []);

  useEffect(() => {
    loadSavedRecipes();
  }, [loadSavedRecipes]);

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

  if (savedRecipes.length === 0) {
    return (
      <div className="flex flex-col items-start justify-center min-h-[60vh] px-6 animate-page">
        <p className="text-ink-muted text-sm font-medium tracking-wide uppercase mb-3">
          Saved recipes
        </p>
        <h2 className="font-serif text-3xl text-ink mb-2">Nothing yet</h2>
        <p className="text-ink-light text-base mb-6">
          Recipes you save will appear here for quick access.
        </p>
        <Link
          to="/"
          className="text-olive font-medium text-sm underline underline-offset-4 hover:text-olive-light transition-colors"
        >
          Add your first recipe
        </Link>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-6 animate-page">
      <p className="text-ink-muted text-xs font-medium tracking-widest uppercase mb-1">
        Saved
      </p>
      <h1 className="font-serif text-2xl text-ink mb-5">
        {savedRecipes.length} recipe{savedRecipes.length !== 1 ? "s" : ""}
      </h1>

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
