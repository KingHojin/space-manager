import { BarChart3, Compass, Crosshair, PawPrint, Rocket, Users, Sparkles, Store } from "lucide-react";
import { MENU_ITEMS } from "../../data/constants";

const icons = {
  overview: BarChart3,
  exploration: Compass,
  combat: Crosshair,
  hunting: PawPrint,
  ship: Rocket,
  crew: Users,
  collector: Sparkles,
  market: Store,
};

export default function Sidebar({ activePanel, onChange }) {
  return (
    <aside className="border-r border-slate-700/80 bg-slate-950/80 p-3">
      <nav className="space-y-1">
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
