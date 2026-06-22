import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { formatIngredientText, usePageTitle } from "../utils";
import NavTabs from "../components/NavTabs";

export default function GroceryPage() {
  const {
    groceryItems,
    loadGroceryList,
    toggleGroceryItem,
    removeGroceryItem,
    clearCheckedGrocery,
    clearAllGrocery,
  } = useStore();
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  usePageTitle("Grocery");

  useEffect(() => {
    loadGroceryList();
  }, [loadGroceryList]);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  const uncheckedCount = groceryItems.filter((i) => !i.checked).length;
  const totalCount = groceryItems.length;
  const hasChecked = groceryItems.some((item) => item.checked);

  const groups = groceryItems.reduce<Record<string, typeof groceryItems>>((acc, item) => {
    const key = item.recipeTitle || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  if (groceryItems.length === 0) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-start justify-center min-h-[60vh] px-6 animate-page">
        <NavTabs />
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
  };

  const handleClearChecked = async () => {
    await clearCheckedGrocery();
  };

  return (
    <div className="max-w-xl mx-auto px-5 pt-6 pb-6 animate-page">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <NavTabs />
          <h1 className="font-serif text-2xl text-ink">
            {uncheckedCount === 0
              ? `All ${totalCount} checked`
              : `${uncheckedCount} to buy`}
          </h1>
        </div>

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

      <div className="space-y-2 stagger">
        {Object.entries(groups).map(([title, items]) => {
          const unchecked = items.filter((i) => !i.checked).length;
          return (
            <details key={title} open className="group border border-warm-border rounded-lg">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none min-h-[44px] hover:bg-cream-dark transition-colors rounded-lg">
                <span className="font-medium text-sm text-ink">{title}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted">
                    {unchecked}/{items.length}
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-ink-soft transition-transform group-open:rotate-180" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </summary>
              <ul className="divide-y divide-warm-border/60 px-1">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center">
                    <button
                      role="checkbox"
                      aria-checked={item.checked}
                      onClick={() => toggleGroceryItem(item.id)}
                      className="flex-1 flex items-center gap-3 py-3 px-3 min-h-[44px] text-left transition-colors"
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
                        className={`text-[15px] transition-colors ${
                          item.checked ? "text-ink-muted line-through" : "text-ink"
                        }`}
                      >
                        {formatIngredientText(item.text)}
                      </span>
                    </button>
                    <button
                      onClick={() => removeGroceryItem(item.id)}
                      aria-label={`Remove ${formatIngredientText(item.text)}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-faint hover:text-terracotta transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
