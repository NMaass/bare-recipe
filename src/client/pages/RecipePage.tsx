import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

  useEffect(() => {
    usePageTitle(recipe?.title || "Recipe");
  }, [recipe?.title]);

  if (!recipe) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-ink-muted px-6">
        <p className="text-lg">No recipe loaded</p>
        <p className="text-sm mt-1">Paste a link above to add one.</p>
      </div>
    );
  }

  const handleAddToGrocery = async () => {
    const items = recipe.ingredients.map((i) => i.text);
    await addToGrocery(recipe.id, recipe.title, items);
    setAddedToGrocery(true);
    setTimeout(() => setAddedToGrocery(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
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
          loading="lazy"
          className="w-full aspect-[16/9] object-cover"
        />
      )}

      <div className="px-5 pt-6 stagger">
        <h1 className="font-serif text-3xl text-ink leading-snug">{recipe.title}</h1>

        {meta.length > 0 && (
          <p className="text-sm text-ink-muted mt-2">
            {meta.join(" · ")}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleAddToGrocery}
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
