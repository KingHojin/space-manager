import { Archive, BarChart2, BookOpen, Compass, Crosshair, GitBranch, Home, Map, PawPrint, Rocket, Save, ScrollText, Sparkles, Store, Users } from "lucide-react";
import { MENU_ITEMS } from "../../data/constants";

const icons = {
  overview: Home,
  exploration: Compass,
  combat: Crosshair,
  hunting: PawPrint,
  ship: Rocket,
  skilltree: GitBranch,
  crew: Users,
  collector: Sparkles,
  market: Store,
};

const quickActions = [
  { id: "stats", label: "스탯", icon: BarChart2 },
  { id: "inventory", label: "아이템", icon: Archive },
  { id: "map", label: "지도", icon: Map },
  { id: "cards", label: "카드", icon: BookOpen },
  { id: "log", label: "로그", icon: ScrollText },
  { id: "save", label: "저장", icon: Save },
];

export default function Sidebar({ activePanel, onChange, onOpenModal }) {
  return (
    <aside className="flex flex-col border-b border-slate-700/80 bg-slate-950/80 p-2 lg:border-b-0 lg:border-r lg:p-3">
      <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {MENU_ITEMS.map((item) => {
          const Icon = icons[item.id];
          const active = activePanel === item.id;
          return (
            <button key={item.id} className={`nav-button ${active ? "nav-button-active" : ""}`} onClick={() => onChange(item.id)}>
              <Icon size={17} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                <span className="hud-label hidden truncate lg:block">{item.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto hidden lg:block">
        <div className="hud-label mb-2 mt-4 px-1">퀵 액션</div>
        <div className="grid grid-cols-2 gap-1.5">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className="dock-button" onClick={() => onOpenModal(item.id)} title={item.label}>
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
