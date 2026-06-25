// Throwaway harness: drives the real scraper + presentation modules against a
// set of URLs and prints what the app would store/show. Not committed as part
// of the app.
import { fetchPage } from "../src/server/fetch-page";
import { extractFromHtml } from "../src/server/extractor";
import { parseIngredient, buildDisplayText } from "../src/shared/ingredient-parser";
import { formatIngredientText } from "../src/client/utils";

const URLS = [
  "https://www.modernhoney.com/salted-caramel-cookies/",
  "https://www.seriouseats.com/double-caramel-flan-recipe",
  "https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe",
  "https://www.thebergerfeed.com/strawberryrhubarbcookies",
];

function hr() {
  console.log("\n" + "=".repeat(78) + "\n");
}

for (const url of URLS) {
  hr();
  console.log("URL:", url);
  const fetched = await fetchPage(url);
  if ("reason" in fetched) {
    console.log("  FETCH ERROR:", fetched.reason, "-", fetched.message);
    continue;
  }
  console.log("  fetched bytes:", fetched.html.length, "finalUrl:", fetched.finalUrl);

  const parsed = extractFromHtml({ html: fetched.html, url: fetched.finalUrl });
  if (!parsed) {
    console.log("  EXTRACT: null (no_recipe)");
    continue;
  }

  console.log("  title:", JSON.stringify(parsed.title));
  console.log("  image:", parsed.image);
  console.log("  prepTime:", parsed.prepTime, "cookTime:", parsed.cookTime,
    "servings:", JSON.stringify(parsed.servings));
  console.log("  prepMin:", parsed.prepMinutes, "cookMin:", parsed.cookMinutes,
    "totalMin:", parsed.totalMinutes);
  console.log("  ingredients:", parsed.ingredients.length,
    "instructions:", parsed.instructions.length);

  console.log("\n  --- INGREDIENTS (raw text -> presentation parse) ---");
  for (const ing of parsed.ingredients) {
    const p = parseIngredient(ing.text);
    const display = formatIngredientText(ing.text);
    console.log(`   [${ing.sortOrder}] ${JSON.stringify(ing.text)}`);
    console.log(`        display: ${JSON.stringify(display)}`);
    console.log(`        parsed : qty=${p.quantity} unit=${JSON.stringify(p.unit)} name=${JSON.stringify(p.name)} key=${JSON.stringify(p.key)}`);
  }

  console.log("\n  --- INSTRUCTIONS ---");
  for (const ins of parsed.instructions) {
    const t = ins.text.length > 120 ? ins.text.slice(0, 120) + "…" : ins.text;
    console.log(`   ${ins.step}. ${JSON.stringify(t)}`);
  }

  // Consolidation view: group by parse key the way the grocery list does.
  const groups = new Map<string, { qty: number | null; unit: string; name: string; texts: string[] }>();
  for (const ing of parsed.ingredients) {
    const p = parseIngredient(ing.text);
    const g = groups.get(p.key);
    if (g) {
      g.texts.push(ing.text);
      if (p.quantity !== null) g.qty = (g.qty ?? 0) + p.quantity;
    } else {
      groups.set(p.key, { qty: p.quantity, unit: p.unit, name: p.name, texts: [ing.text] });
    }
  }
  const dupes = [...groups.values()].filter((g) => g.texts.length > 1);
  if (dupes.length) {
    console.log("\n  --- CONSOLIDATION (same key collapses on grocery list) ---");
    for (const g of dupes) {
      console.log(`   key collapses ${g.texts.length}: ${JSON.stringify(g.texts)}`);
      console.log(`     -> ${JSON.stringify(buildDisplayText(g.qty, g.unit, g.name))}`);
    }
  }
}

hr();
