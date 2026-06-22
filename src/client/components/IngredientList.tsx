import type { Ingredient } from "../../shared/types";
import { formatIngredientText } from "../utils";
import { scaleIngredientText } from "../../shared/ingredient-parser";

interface Props {
  ingredients: Ingredient[];
  scaleFactor?: number;
}

export default function IngredientList({ ingredients, scaleFactor = 1 }: Props) {
  return (
    <ul className="space-y-0 divide-y divide-warm-border/60">
      {ingredients.map((ing, i) => (
        <li
          key={ing.id ?? i}
          className="py-2.5 text-[15px] text-ink leading-relaxed animate-slide-in"
          style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
        >
          {formatIngredientText(scaleIngredientText(ing.text, scaleFactor))}
        </li>
      ))}
    </ul>
  );
}
