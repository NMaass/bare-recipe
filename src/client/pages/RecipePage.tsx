import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import IngredientList from "../components/IngredientList";
import InstructionList from "../components/InstructionList";
import { formatDuration, safeHostname, usePageTitle } from "../utils";
import type { Recipe } from "../../shared/types";

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentRecipe, setCurrentRecipe, savedRecipes, loadSavedRecipes, addToGrocery, deleteRecipe } = useStore();
  const [addedToGrocery, setAddedToGrocery] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (addedTimer.current) clearTimeout(addedTimer.current);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  useEffect(() => {
    if (id && (!currentRecipe || currentRecipe.id !== id)) {
      const found = savedRecipes.find((r) => r.id === id);
      if (found) {
        setCurrentRecipe(found);
      } else if (savedRecipes.length === 0) {
        loadSavedRecipes();
      }
    }
  }, [id, currentRecipe, savedRecipes, setCurrentRecipe, loadSavedRecipes]);

  const recipe: Recipe | null = currentRecipe;

  usePageTitle(recipe?.title || "Recipe");

  if (!recipe) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-start justify-center min-h-[60vh] px-6 animate-page">
        <h1 className="font-serif text-3xl text-ink mb-2">No recipe loaded</h1>
        <p className="text-ink-light text-base mb-6">Paste a link above to add one.</p>
        <Link
          to="/saved"
          className="text-olive font-medium text-sm underline underline-offset-4 hover:text-olive-light transition-colors"
        >
          Browse saved recipes
        </Link>
      </div>
    );
  }

  const handleAddToGrocery = async () => {
    const items = recipe.ingredients.map((i) => i.text);
    await addToGrocery(recipe.id, recipe.title, items);
    setAddedToGrocery(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedToGrocery(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    await deleteRecipe(recipe.id);
    navigate("/saved");
  };

  const meta = [
    recipe.prepTime && `Prep ${formatDuration(recipe.prepTime)}`,
    recipe.cookTime && `Cook ${formatDuration(recipe.cookTime)}`,
    recipe.servings && `Serves ${recipe.servings}`,
  ].filter(Boolean);

  const hostname = recipe.url ? safeHostname(recipe.url) : null;

  return (
    <div className="max-w-xl mx-auto animate-page pb-6">
      {recipe.image && (
        <img
          src={recipe.image}
          alt={recipe.title}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="w-full aspect-[16/9] object-cover"
        />
      )}

      <div className="px-5 pt-6 stagger">
        <Link
          to="/saved"
          className="inline-flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase text-ink-faint hover:text-ink-muted transition-colors mb-3"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Saved
        </Link>
        <h1 className="font-serif text-3xl text-ink leading-snug">{recipe.title}</h1>

        {meta.length > 0 && (
          <p className="text-sm text-ink-muted mt-2">
            {meta.join(" · ")}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleAddToGrocery}
            aria-live="polite"
            className={`flex-1 py-3 font-medium text-sm tracking-wide transition-all rounded-lg ${
              addedToGrocery
                ? "bg-olive-bg text-olive border border-olive/20"
                : "bg-olive text-cream hover:bg-olive-light active:scale-[0.98]"
            }`}
          >
            {addedToGrocery ? "Added to list" : "Add to Grocery"}
          </button>
          <button
            onClick={handleDelete}
            aria-live="polite"
            className={`px-4 py-3 font-medium text-sm tracking-wide transition-all rounded-lg border ${
              confirmingDelete
                ? "border-terracotta text-terracotta bg-terracotta/10"
                : "border-warm-border text-ink-muted hover:text-terracotta hover:border-terracotta/40"
            }`}
          >
            {confirmingDelete ? "Delete?" : "Delete"}
          </button>
        </div>

        <hr className="border-warm-border mt-8 mb-6" />

        <section aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading" className="text-xs font-medium tracking-widest uppercase text-ink-muted mb-4">
            Ingredients
          </h2>
          <IngredientList ingredients={recipe.ingredients} />
        </section>

        <hr className="border-warm-border mt-8 mb-6" />

        <section aria-labelledby="instructions-heading">
          <h2 id="instructions-heading" className="text-xs font-medium tracking-widest uppercase text-ink-muted mb-4">
            Instructions
          </h2>
          <InstructionList instructions={recipe.instructions} />
        </section>

        {hostname && (
          <p className="mt-10 text-xs text-ink-muted">
            Source:{" "}
            <a href={recipe.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-olive transition-colors">
              {hostname}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
