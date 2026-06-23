import type { Ingredient } from "../../shared/types";
import { formatIngredientText } from "../utils";
import { scaleIngredientText, isShoppableIngredient } from "../../shared/ingredient-parser";

interface Props {
  ingredients: Ingredient[];
  scaleFactor?: number;
}

export default function IngredientList({ ingredients, scaleFactor = 1 }: Props) {
  // Equipment/notes lines the extractor routed out of the shopping list. We keep
  // them visible (route-don't-delete) but set apart so they don't read as things
  // to buy or scale.
  const shoppable = ingredients.filter((i) => isShoppableIngredient(i.kind));
  const extras = ingredients.filter((i) => !isShoppableIngredient(i.kind));

  return (
    <>
      <ul className="space-y-0 divide-y divide-warm-border/60">
        {shoppable.map((ing, i) => (
          <li
            key={ing.id ?? i}
            className="py-2.5 text-[15px] text-ink leading-relaxed animate-slide-in"
            style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
          >
            {formatIngredientText(scaleIngredientText(ing.text, scaleFactor))}
          </li>
        ))}
      </ul>

      {extras.length > 0 && (
        <div className="mt-4 pt-3 border-t border-warm-border/60">
          <p className="text-xs font-medium tracking-widest uppercase text-ink-muted mb-1.5">
            Equipment &amp; notes
          </p>
          <ul className="space-y-1">
            {extras.map((ing, i) => (
              <li key={ing.id ?? `x${i}`} className="text-[13px] text-ink-muted leading-relaxed">
                {formatIngredientText(ing.text)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
