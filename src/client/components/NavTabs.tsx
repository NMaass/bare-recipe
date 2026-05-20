import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/saved", label: "Saved" },
  { to: "/grocery", label: "Grocery" },
];

export default function NavTabs() {
  return (
    <nav aria-label="Sections" className="flex items-center gap-3 text-xs font-medium tracking-widest uppercase mb-1">
      {tabs.map((tab, i) => (
        <span key={tab.to} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden="true" className="text-ink-faint">·</span>}
          <NavLink
            to={tab.to}
            className={({ isActive }) =>
              isActive
                ? "text-ink"
                : "text-ink-faint hover:text-ink-muted transition-colors"
            }
          >
            {tab.label}
          </NavLink>
        </span>
      ))}
    </nav>
  );
}
