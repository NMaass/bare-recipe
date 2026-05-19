import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { usePageTitle } from "../utils";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const { extractAndSave, extracting } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { usePageTitle(""); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || extracting) return;
    setError(null);
    try {
      const recipe = await extractAndSave(url.trim());
      setUrl("");
      navigate(`/recipe/${recipe.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that recipe");
    }
  };

  return (
    <div className="flex flex-col items-start justify-center min-h-[85vh] px-6 animate-page">
      <div className="w-full">
        <h1 className="font-serif text-5xl text-ink leading-[1.1] mb-3">
          Bare<br />Recipe
        </h1>
        <p className="text-ink-light text-base leading-relaxed mb-10 max-w-[28ch]">
          Paste a link, save the recipe.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="recipe-url" className="sr-only">Recipe URL</label>
          <input
            id="recipe-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/recipe..."
            className="w-full px-4 py-3.5 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-muted/60 text-base focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg"
            disabled={extracting}
          />

          <button
            type="submit"
            disabled={!url.trim() || extracting}
            className="w-full py-3.5 bg-olive text-cream font-medium text-[15px] tracking-wide hover:bg-olive-light active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-lg"
          >
            {extracting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-cream/30 border-t-cream rounded-full animate-spin" aria-hidden="true" />
                Saving...
              </span>
            ) : (
              "Save Recipe"
            )}
          </button>
        </form>

        {error && (
          <div role="alert" className="mt-4 text-sm text-terracotta bg-terracotta/10 border border-terracotta/15 rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
