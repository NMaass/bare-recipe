import type { Ingredient } from "../../shared/types";

interface Props {
  ingredients: Ingredient[];
}

export default function IngredientList({ ingredients }: Props) {
  return (
    <ul className="space-y-0 divide-y divide-warm-border/60">
      {ingredients.map((ing, i) => (
        <li
          key={ing.id ?? i}
          className="py-2.5 text-[15px] text-ink leading-relaxed animate-slide-in"
          style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
        >
          {ing.text}
        </li>
      ))}
    </ul>
  );
}
