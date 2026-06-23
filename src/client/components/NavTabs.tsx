import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/saved", label: "Saved", icon: SavedIcon },
  { to: "/grocery", label: "Grocery", icon: GroceryIcon },
];

function SavedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function GroceryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

export default function NavTabs() {
  return (
    <nav
      aria-label="Sections"
      className="fixed bottom-0 left-0 right-0 z-50 bg-cream/95 backdrop-blur-md border-t border-warm-border pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-xl mx-auto flex items-stretch">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
                isActive
                  ? "text-olive"
                  : "text-ink-faint hover:text-ink-muted"
              }`
            }
          >
            <tab.icon className="w-5 h-5" />
            <span className="text-[11px] font-semibold tracking-wide">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
