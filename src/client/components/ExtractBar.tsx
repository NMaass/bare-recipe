import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";

export default function ExtractBar() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { extractAndSave, extracting } = useStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear error when user starts typing again.
  useEffect(() => {
    if (error) setError(null);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || extracting) return;
    try {
      const recipe = await extractAndSave(trimmed);
      setUrl("");
      inputRef.current?.blur();
      navigate(`/recipe/${recipe.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that recipe");
    }
  };

  return (
    <div className="sticky top-0 z-40 bg-cream/90 backdrop-blur-md border-b border-warm-border pt-[env(safe-area-inset-top)]">
      <div className="max-w-xl mx-auto px-4 py-2.5">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label htmlFor="extract-url" className="sr-only">Paste a recipe URL</label>
          <div className="relative flex-1">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2"
            >
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
              <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
            </svg>
            <input
              ref={inputRef}
              id="extract-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a recipe link"
              disabled={extracting}
              className="w-full pl-9 pr-3 py-2.5 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-muted/70 text-[15px] focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || extracting}
            aria-label="Save recipe"
            className="shrink-0 h-10 px-3.5 bg-olive text-cream font-medium text-sm tracking-wide hover:bg-olive-light active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-lg flex items-center"
          >
            {extracting ? (
              <span className="h-4 w-4 border-2 border-cream/30 border-t-cream rounded-full animate-spin" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-xs text-terracotta">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
