import { LINKS } from "../links";

export default function Footer() {
  return (
    <footer className="px-6 pb-6 pt-10 text-center">
      <div className="flex items-center justify-center gap-5 text-ink-muted">
        <a
          href={LINKS.website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Website"
          className="hover:text-olive transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
        </a>
        <a
          href={LINKS.github}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="hover:text-olive transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
            <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2.1.1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.5C20.2 21.4 23.5 17.1 23.5 12 23.5 5.7 18.3.5 12 .5z" />
          </svg>
        </a>
        <a
          href={LINKS.kofi}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ko-fi"
          className="hover:text-olive transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5" aria-hidden="true">
            <path d="M4 8h13a4 4 0 0 1 0 8h-1a5 5 0 0 1-5 5H8a4 4 0 0 1-4-4V8z" />
            <path d="M17 12h.5a2 2 0 0 0 0-4H17" strokeWidth={0} />
            <path d="M8 3v2M11 3v2M14 3v2" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
