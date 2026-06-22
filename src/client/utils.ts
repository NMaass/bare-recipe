import { useEffect } from "react";
import Fraction from "fraction.js";

export function formatDuration(iso: string): string {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return iso;
  const parts: string[] = [];
  if (match[1]) parts.push(`${match[1]}h`);
  if (match[2]) parts.push(`${match[2]}m`);
  if (match[3]) parts.push(`${match[3]}s`);
  return parts.join(" ") || iso;
}

export function safeHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isSafeHttpUrl(parsed)) return null;
    const host = parsed.hostname;
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return isSafeHttpUrl(parsed) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function safeOutboundUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return isSafeHttpUrl(parsed) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isSafeHttpUrl(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — Bare Recipe` : "Bare Recipe";
  }, [title]);
}

// Schema.org recipes often store quantities as decimals ("0.5 teaspoon"),
// but cooks read fractions. Rewrite standalone decimals to Unicode fraction
// glyphs (½, ⅓, ¼ …). fraction.js does the decimal→fraction math: its
// .simplify() snaps noisy values like 0.333 to the nearest tidy cooking
// fraction (⅓) rather than an exact-but-useless 333/1000.
const UNICODE_FRACTIONS: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
  "1/5": "⅕",
  "2/5": "⅖",
  "3/5": "⅗",
  "4/5": "⅘",
  "1/6": "⅙",
  "5/6": "⅚",
  "1/8": "⅛",
  "3/8": "⅜",
  "5/8": "⅝",
  "7/8": "⅞",
};

export function formatIngredientText(text: string): string {
  // Match "0.5", "1.25", ".5" — bounded so we don't touch URLs, versions,
  // or measurements like "350F" that happen to have a digit beside text.
  return text.replace(/(^|[\s(])(\d*\.\d+)(?=\s|$|[a-zA-Z])/g, (match, lead, num) => {
    const value = parseFloat(num);
    if (!Number.isFinite(value)) return match;

    let mixed: string;
    try {
      // toFraction(true) yields a mixed number like "1 1/4"; simplify() first
      // collapses repeating decimals to the closest simple fraction.
      mixed = new Fraction(value).simplify(0.02).toFraction(true);
    } catch {
      return match;
    }
    if (!mixed.includes("/")) return match; // resolved to a whole number

    const [whole, frac] = mixed.includes(" ")
      ? (mixed.split(" ") as [string, string])
      : ["", mixed];
    const glyph = UNICODE_FRACTIONS[frac] ?? frac;
    return `${lead}${whole ? `${whole} ` : ""}${glyph}`;
  });
}
