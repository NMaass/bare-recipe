import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { usePageTitle } from "../utils";

export default function GroceryPage() {
  const {
    groceryItems,
    loadGroceryList,
    toggleGroceryItem,
    removeGroceryItem,
    clearCheckedGrocery,
    clearAllGrocery,
  } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { usePageTitle("Grocery"); }, []);

  useEffect(() => {
    loadGroceryList();
  }, [loadGroceryList]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmingClearAll(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const uncheckedCount = groceryItems.filter((i) => !i.checked).length;
  const hasChecked = groceryItems.some((item) => item.checked);

  const groups = groceryItems.reduce<Record<string, typeof groceryItems>>((acc, item) => {
    const key = item.recipeTitle || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  if (groceryItems.length === 0) {
    return (
      <div className="flex flex-col items-start justify-center min-h-[60vh] px-6 animate-page">
        <p className="text-ink-muted text-sm font-medium tracking-wide uppercase mb-3">
          Grocery list
        </p>
        <h2 className="font-serif text-3xl text-ink mb-2">All clear</h2>
        <p className="text-ink-light text-base mb-6">
          Add ingredients from any recipe to build your shopping list.
        </p>
        <Link
          to="/"
          className="text-olive font-medium text-sm underline underline-offset-4 hover:text-olive-light transition-colors"
        >
          Add a recipe
        </Link>
      </div>
    );
  }

  const handleClearAll = async () => {
    if (!confirmingClearAll) {
      setConfirmingClearAll(true);
      return;
    }
    await clearAllGrocery();
    setConfirmingClearAll(false);
    setMenuOpen(false);
  };

  const handleClearChecked = async () => {
    await clearCheckedGrocery();
    setMenuOpen(false);
  };

  return (
    <div className="px-5 pt-6 pb-6 animate-page">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <p className="text-ink-muted text-xs font-medium tracking-widest uppercase mb-1">
            Grocery
          </p>
          <h1 className="font-serif text-2xl text-ink">
            {uncheckedCount} item{uncheckedCount !== 1 ? "s" : ""}
          </h1>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => {
              setMenuOpen((v) => !v);
              setConfirmingClearAll(false);
            }}
            aria-label="List options"
            aria-expanded={menuOpen}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink transition-colors rounded-md"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 min-w-[180px] bg-cream border border-warm-border rounded-lg shadow-sm py-1 z-10 animate-slide-in"
            >
              {hasChecked && (
                <button
                  role="menuitem"
                  onClick={handleClearChecked}
                  className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-cream-dark transition-colors"
                >
                  Clear checked
                </button>
              )}
              <button
                role="menuitem"
                onClick={handleClearAll}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  confirmingClearAll
                    ? "text-terracotta bg-terracotta/10"
                    : "text-terracotta hover:bg-terracotta/5"
                }`}
              >
                {confirmingClearAll ? "Tap again to confirm" : "Clear all"}
              </button>
            </div>
          )}
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true">
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
                      aria-label={item.text}
                      onClick={() => toggleGroceryItem(item.id)}
                      className="flex-1 flex items-center gap-3 py-3 px-3 min-h-[44px] text-left transition-colors"
                    >
                      <span
                        aria-hidden="true"
                        className={`grocery-check flex items-center justify-center h-[18px] w-[18px] rounded border-[1.5px] shrink-0 ${
                          item.checked
                            ? "bg-olive border-olive"
                            : "border-ink-muted/30"
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
                        {item.text}
                      </span>
                    </button>
                    <button
                      onClick={() => removeGroceryItem(item.id)}
                      aria-label={`Remove ${item.text}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted/40 hover:text-terracotta transition-colors"
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
