import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { formatIngredientText, usePageTitle } from "../utils";
import { formatQuantity, formatUnit } from "../../shared/ingredient-parser";

export default function GroceryPage() {
  const navigate = useNavigate();
  const {
    groceryItems,
    groceryRecipes,
    loadGroceryList,
    toggleGroceryGroup,
    toggleGroceryItem,
    removeGroceryItem,
    removeRecipeFromGrocery,
    updateGroceryItemText,
    updateRecipeMultiplier,
    clearCheckedGrocery,
    clearAllGrocery,
  } = useStore();
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [filterRecipeId, setFilterRecipeId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  usePageTitle("Grocery");

  useEffect(() => {
    loadGroceryList();
  }, [loadGroceryList]);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  const visibleItems = filterRecipeId
    ? groceryItems.filter((item) =>
        item.sources.some((s) => s.recipeId === filterRecipeId)
      )
    : groceryItems;

  const uncheckedCount = visibleItems.filter((i) => !i.checked).length;
  const totalCount = visibleItems.length;
  const hasChecked = visibleItems.some((item) => item.checked);

  const handleChipClick = (recipeId: string) => {
    if (filterRecipeId === recipeId) {
      navigate(`/recipe/${recipeId}`);
    } else {
      setFilterRecipeId(recipeId);
    }
  };

  const handleChipDelete = (e: React.MouseEvent, recipeId: string) => {
    e.stopPropagation();
    removeRecipeFromGrocery(recipeId);
    if (filterRecipeId === recipeId) setFilterRecipeId(null);
  };

  if (groceryItems.length === 0) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-start justify-center min-h-[60vh] px-6 animate-page">
        <h1 className="font-serif text-3xl text-ink mt-2 mb-2">All clear</h1>
        <p className="text-ink-light text-base mb-6">
          Add ingredients from any recipe to build your shopping list.
        </p>
        <Link
          to="/saved"
          className="text-olive font-medium text-sm underline underline-offset-4 hover:text-olive-light transition-colors"
        >
          Browse saved recipes
        </Link>
      </div>
    );
  }

  const handleClearAll = async () => {
    if (!confirmingClearAll) {
      setConfirmingClearAll(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => {
        setConfirmingClearAll((cur) => (cur ? false : cur));
      }, 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    await clearAllGrocery();
    setConfirmingClearAll(false);
    setFilterRecipeId(null);
  };

  const handleClearChecked = async () => {
    await clearCheckedGrocery();
  };

  const startEdit = (itemId: number, currentText: string) => {
    setEditingId(itemId);
    setEditText(currentText);
  };

  const saveEdit = async () => {
    if (editingId !== null && editText.trim()) {
      await updateGroceryItemText(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const adjustMultiplier = async (recipeId: string, current: number, delta: number) => {
    const next = Math.round((current + delta) * 2) / 2;
    if (next > 0) {
      await updateRecipeMultiplier(recipeId, next);
    }
  };

  const filteredRecipe = groceryRecipes.find((r) => r.recipeId === filterRecipeId);

  return (
    <div className="max-w-xl mx-auto px-5 pt-6 pb-6 animate-page">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="font-serif text-2xl text-ink">
          {filterRecipeId
            ? filteredRecipe?.recipeTitle || "Filtered"
            : uncheckedCount === 0
              ? `All ${totalCount} checked`
              : `${uncheckedCount} to buy`}
        </h1>

        <div className="flex items-center gap-2">
          {hasChecked && (
            <button
              onClick={handleClearChecked}
              className="text-xs font-medium tracking-wide text-ink-muted hover:text-ink uppercase px-2.5 py-2 rounded-md transition-colors"
            >
              Clear checked
            </button>
          )}
          <button
            onClick={handleClearAll}
            aria-live="polite"
            className={`text-xs font-medium tracking-wide uppercase px-2.5 py-2 rounded-md transition-colors ${
              confirmingClearAll
                ? "text-terracotta bg-terracotta/10"
                : "text-terracotta hover:bg-terracotta/5"
            }`}
          >
            {confirmingClearAll ? "Tap again" : "Clear all"}
          </button>
        </div>
      </div>

      {groceryRecipes.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 mb-2">
            {groceryRecipes.map((recipe) => (
              <button
                key={recipe.recipeId}
                onClick={() => handleChipClick(recipe.recipeId)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  filterRecipeId === recipe.recipeId
                    ? "bg-olive text-cream"
                    : "bg-cream-dark text-ink-muted hover:bg-cream-dark/70"
                }`}
              >
                {recipe.multiplier > 1 && (
                  <span className="font-semibold tabular-nums">
                    {formatQuantity(recipe.multiplier)}×
                  </span>
                )}
                <span className="max-w-[160px] truncate">{recipe.recipeTitle}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleChipDelete(e, recipe.recipeId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleChipDelete(e as unknown as React.MouseEvent, recipe.recipeId);
                    }
                  }}
                  className={`shrink-0 ml-0.5 -mr-1 w-4 h-4 flex items-center justify-center rounded-full transition-colors ${
                    filterRecipeId === recipe.recipeId
                      ? "hover:bg-cream/20"
                      : "hover:bg-terracotta/15 hover:text-terracotta"
                  }`}
                  aria-label={`Remove ${recipe.recipeTitle} from grocery list`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </span>
              </button>
            ))}
          </div>

          {filterRecipeId && filteredRecipe && (
            <div className="flex items-center gap-3 px-3 py-2 bg-cream-dark rounded-lg animate-page">
              <button
                onClick={() => setFilterRecipeId(null)}
                className="text-xs font-medium text-ink-muted hover:text-ink transition-colors flex items-center gap-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
                </svg>
                All
              </button>
              <span className="text-xs text-ink-faint">·</span>
              <span className="text-xs text-ink-muted">Multiplier</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => adjustMultiplier(filteredRecipe.recipeId, filteredRecipe.multiplier, -0.5)}
                  disabled={filteredRecipe.multiplier <= 0.5}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-cream border border-warm-border text-ink-muted hover:text-ink hover:border-ink-faint disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease multiplier"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5" aria-hidden="true">
                    <path strokeLinecap="round" d="M5 12h14" />
                  </svg>
                </button>
                <span className="text-sm font-semibold tabular-nums text-ink min-w-[2.5rem] text-center">
                  {formatQuantity(filteredRecipe.multiplier)}×
                </span>
                <button
                  onClick={() => adjustMultiplier(filteredRecipe.recipeId, filteredRecipe.multiplier, 0.5)}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-cream border border-warm-border text-ink-muted hover:text-ink hover:border-ink-faint transition-colors"
                  aria-label="Increase multiplier"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5" aria-hidden="true">
                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              <span className="flex-1" />
              <Link
                to={`/recipe/${filteredRecipe.recipeId}`}
                className="text-xs font-medium text-olive hover:text-olive-light transition-colors"
              >
                View recipe
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 stagger">
        {visibleItems.map((item) => {
          const hasMultipleSources = item.sources.length > 1;
          return (
            <details
              key={item.key}
              open={hasMultipleSources}
              className="group border border-warm-border rounded-lg"
            >
              <summary className="flex items-center cursor-pointer select-none min-h-[44px] hover:bg-cream-dark transition-colors rounded-lg">
                <button
                  role="checkbox"
                  aria-checked={item.checked}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleGroceryGroup(item.key);
                  }}
                  className="flex items-center gap-3 py-3 px-4 flex-1 text-left transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className={`grocery-check flex items-center justify-center h-[18px] w-[18px] rounded border-[1.5px] shrink-0 ${
                      item.checked
                        ? "bg-olive border-olive"
                        : "border-ink-faint"
                    }`}
                  >
                    {item.checked && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-2.5 h-2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span
                    className={`text-[15px] transition-colors flex-1 ${
                      item.checked ? "text-ink-muted line-through" : "text-ink"
                    }`}
                  >
                    {formatIngredientText(item.displayText)}
                  </span>
                </button>
                {hasMultipleSources && (
                  <span className="flex items-center gap-2 pr-4">
                    <span className="text-xs text-ink-muted">
                      {item.sources.length} {item.sources.length === 1 ? "recipe" : "recipes"}
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-ink-soft transition-transform group-open:rotate-180" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                )}
              </summary>
              {hasMultipleSources && (
                <ul className="divide-y divide-warm-border/60 px-1 pb-1">
                  {item.sources.map((source) => (
                    <li key={source.itemId} className="flex items-center px-3">
                      {editingId === source.itemId ? (
                        <div className="flex-1 flex items-center gap-2 py-2">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            onBlur={saveEdit}
                            autoFocus
                            className="flex-1 px-2 py-1.5 text-sm bg-cream border border-olive/30 rounded focus:outline-none focus:border-olive focus:ring-2 focus:ring-olive/20"
                          />
                          <button
                            onClick={saveEdit}
                            className="text-xs font-medium text-olive px-2 py-1"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          role="checkbox"
                          aria-checked={source.checked}
                          onClick={() => toggleGroceryItem(source.itemId)}
                          className="flex-1 flex items-center gap-2 py-2.5 px-2 min-h-[40px] text-left transition-colors"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex items-center justify-center h-[14px] w-[14px] rounded border shrink-0 ${
                              source.checked
                                ? "bg-olive border-olive"
                                : "border-ink-faint"
                            }`}
                          >
                            {source.checked && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-2 h-2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                          </span>
                          <span className={`text-xs flex-1 ${
                            source.checked ? "text-ink-muted line-through" : "text-ink-light"
                          }`}>
                            {source.quantity !== null && source.quantity > 0
                              ? `${formatQuantity(source.quantity)} ${formatUnit(source.unit, source.quantity)}`
                              : formatIngredientText(source.originalText)}
                          </span>
                          {source.multiplier > 1 && (
                            <span className="text-xs text-olive font-medium shrink-0">
                              {formatQuantity(source.multiplier)}×
                            </span>
                          )}
                          {source.recipeTitle && (
                            <span className="text-xs text-ink-faint shrink-0 max-w-[100px] truncate">
                              {source.recipeTitle}
                            </span>
                          )}
                        </button>
                      )}
                      <div className="flex items-center shrink-0">
                        {editingId !== source.itemId && (
                          <button
                            onClick={() => startEdit(source.itemId, source.originalText)}
                            aria-label="Edit"
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-ink-faint hover:text-olive transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => removeGroceryItem(source.itemId)}
                          aria-label="Remove"
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-ink-faint hover:text-terracotta transition-colors"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
