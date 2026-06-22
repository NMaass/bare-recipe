import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/saved", label: "Saved" },
  { to: "/grocery", label: "Grocery" },
];

export default function NavTabs() {
  return (
    <nav aria-label="Sections" className="flex items-center gap-1 text-sm font-semibold">
      {tabs.map((tab, i) => (
        <span key={tab.to} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="text-ink-faint mx-1">|</span>}
          <NavLink
            to={tab.to}
            className={({ isActive }) =>
              isActive
                ? "text-olive border-b-2 border-olive pb-0.5"
                : "text-ink-faint hover:text-ink-muted border-b-2 border-transparent pb-0.5 transition-colors"
            }
          >
            {tab.label}
          </NavLink>
        </span>
      ))}
    </nav>
  );
}
