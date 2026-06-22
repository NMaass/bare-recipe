import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStore } from "../store";
import { ApiError } from "../api";

export default function ExtractBar() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { extractAndSave, extracting, extractPhase } = useStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || extracting) return;

    // Cheap client-side reject for obviously-bad inputs so we don't round-trip
    // a clearly invalid URL through the Worker. The server validates again.
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("Only http and https links are supported.");
        return;
      }
    } catch {
      setError("That doesn't look like a URL.");
      return;
    }

    try {
      const recipe = await extractAndSave(trimmed);
      setUrl("");
      inputRef.current?.blur();
      navigate(`/recipe/${recipe.id}`);
    } catch (err) {
      // Prefer the typed reason from the server when present — different
      // failure modes get different copy. Fall back to whatever message came
      // through for unexpected errors.
      if (err instanceof ApiError) {
        setError(messageForReason(err.reason, err.message));
      } else {
        setError(err instanceof Error ? err.message : "Couldn't save that recipe");
      }
    }
  };

  // One-word status under the input during extract. Keeps the user oriented
  // without committing screen real estate to a full progress bar.
  const statusLabel =
    extractPhase === "fetching"
      ? "Fetching recipe…"
      : extractPhase === "cached"
        ? "Already in your library — pulled from cache."
        : extractPhase === "saved"
          ? "Saved."
          : null;

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
              className="w-4 h-4 text-ink-soft absolute left-3 top-1/2 -translate-y-1/2"
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
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Paste a recipe link"
              disabled={extracting}
              className="w-full pl-9 pr-3 py-3 bg-cream-dark border border-warm-border text-ink placeholder:text-ink-soft text-[15px] focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/30 transition-colors rounded-lg disabled:bg-cream-dark disabled:text-ink-soft"
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || extracting}
            aria-label="Save recipe"
            className="shrink-0 h-11 px-4 bg-olive text-cream font-medium text-sm tracking-wide hover:bg-olive-light active:scale-[0.98] disabled:bg-sage disabled:text-cream disabled:cursor-not-allowed transition-all rounded-lg flex items-center"
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
        {!statusLabel && !error && !extracting && (
          <p className="mt-1.5 text-xs text-ink-faint">
            or{" "}
            <Link to="/add" className="underline hover:text-olive transition-colors">
              type a recipe manually
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

// User-facing copy for each failure mode. The server already has friendly
// messages, but we mirror them here so we control wording in one place when
// we want to iterate.
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
