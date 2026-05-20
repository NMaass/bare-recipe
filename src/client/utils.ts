import { useEffect } from "react";

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
    const host = new URL(url).hostname;
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — Bare Recipe` : "Bare Recipe";
  }, [title]);
}
