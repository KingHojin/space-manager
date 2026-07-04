import { BarChart3, Compass, Rocket, Users, Sparkles, Store } from "lucide-react";
import { MENU_ITEMS } from "../../data/constants";

const icons = {
  overview: BarChart3,
  exploration: Compass,
  ship: Rocket,
  crew: Users,
  collector: Sparkles,
  market: Store,
};

export default function Sidebar({ activePanel, onChange }) {
  return (
    <aside className="border-b border-slate-700/80 bg-slate-950/80 p-2 lg:border-b-0 lg:border-r lg:p-3">
      <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {MENU_ITEMS.map((item) => {
          const Icon = icons[item.id];
          const active = activePanel === item.id;
          return (
            <button key={item.id} className={`nav-button ${active ? "nav-button-active" : ""}`} onClick={() => onChange(item.id)}>
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
