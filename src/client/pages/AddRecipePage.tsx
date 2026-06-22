import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStore } from "../store";
import { ApiError } from "../api";
import { usePageTitle } from "../utils";

export default function AddRecipePage() {
  const navigate = useNavigate();
  const { createManualRecipe, extracting } = useStore();
  const [title, setTitle] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [servings, setServings] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  usePageTitle("Add Recipe");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    const ingredientLines = ingredients
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const instructionLines = instructions
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!trimmedTitle) {
      setError("A title is required.");
      return;
    }
    if (ingredientLines.length === 0) {
      setError("At least one ingredient is required.");
      return;
    }

    try {
      const recipe = await createManualRecipe({
        title: trimmedTitle,
        ingredients: ingredientLines,
        instructions: instructionLines,
        servings: servings.trim() || undefined,
        prepTime: prepTime.trim() || undefined,
        cookTime: cookTime.trim() || undefined,
      });
      navigate(`/recipe/${recipe.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't save that recipe");
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto px-5 pt-6 pb-6 animate-page">
      <Link
        to="/saved"
        className="inline-flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase text-ink-faint hover:text-ink-muted transition-colors mb-3"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Saved
      </Link>

      <h1 className="font-serif text-3xl text-ink leading-snug mb-6">Add a Recipe</h1>

      <form onSubmit={handleSubmit} className="space-y-5 stagger">
        <div>
          <label htmlFor="recipe-title" className="block text-xs font-medium tracking-widest uppercase text-ink-muted mb-2">
            Title
          </label>
          <input
            id="recipe-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Recipe name"
            className="w-full px-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-[15px] focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="recipe-servings" className="block text-xs font-medium tracking-widest uppercase text-ink-muted mb-2">
              Serves
            </label>
            <input
              id="recipe-servings"
              type="text"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              placeholder="4"
              className="w-full px-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="recipe-prep" className="block text-xs font-medium tracking-widest uppercase text-ink-muted mb-2">
              Prep
            </label>
            <input
              id="recipe-prep"
              type="text"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              placeholder="20 min"
              className="w-full px-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="recipe-cook" className="block text-xs font-medium tracking-widest uppercase text-ink-muted mb-2">
              Cook
            </label>
            <input
              id="recipe-cook"
              type="text"
              value={cookTime}
              onChange={(e) => setCookTime(e.target.value)}
              placeholder="45 min"
              className="w-full px-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg"
            />
          </div>
        </div>

        <div>
          <label htmlFor="recipe-ingredients" className="block text-xs font-medium tracking-widest uppercase text-ink-muted mb-2">
            Ingredients
          </label>
          <textarea
            id="recipe-ingredients"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder={"One per line\n½ cup sugar\n1 cup flour"}
            rows={6}
            className="w-full px-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-[15px] leading-relaxed focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg resize-y"
          />
        </div>

        <div>
          <label htmlFor="recipe-instructions" className="block text-xs font-medium tracking-widest uppercase text-ink-muted mb-2">
            Instructions
          </label>
          <textarea
            id="recipe-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={"One step per line\nMix the dry ingredients\nBake at 350°F for 30 minutes"}
            rows={6}
            className="w-full px-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-[15px] leading-relaxed focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg resize-y"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-terracotta">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={extracting}
            className="flex-1 py-3 bg-olive text-cream font-medium text-sm tracking-wide hover:bg-olive-light active:scale-[0.98] disabled:bg-sage disabled:cursor-not-allowed transition-all rounded-lg flex items-center justify-center gap-2"
          >
            {extracting ? (
              <>
                <span className="h-4 w-4 border-2 border-cream/30 border-t-cream rounded-full animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save Recipe"
            )}
          </button>
          <Link
            to="/saved"
            className="px-5 py-3 border border-warm-border text-ink-muted font-medium text-sm tracking-wide hover:text-ink hover:border-ink-faint transition-colors rounded-lg flex items-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
