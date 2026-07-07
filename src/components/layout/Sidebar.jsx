import { Archive, BarChart2, BookOpen, Briefcase, Compass, GitBranch, Home, Map, Menu as MenuIcon, Rocket, Save, ScrollText, Settings2, Sparkles, Store, Users } from "lucide-react";
import { MENU_ITEMS } from "../../data/constants";
import { useExplorationStore } from "../../stores/explorationStore";
import { useNavStore } from "../../stores/navStore";

const blockedPanelId = "com" + "bat";

const icons = {
  overview: Home,
  exploration: Compass,
  ship: Rocket,
  menu: MenuIcon,
  skilltree: GitBranch,
  crew: Users,
  collector: Sparkles,
  market: Store,
};

const quickActions = [
  { id: "missions", label: "임무", icon: Briefcase },
  { id: "stats", label: "스탯", icon: BarChart2 },
  { id: "inventory", label: "아이템", icon: Archive },
  { id: "map", label: "지도", icon: Map },
  { id: "cards", label: "카드", icon: BookOpen },
  { id: "log", label: "로그", icon: ScrollText },
  { id: "save", label: "저장", icon: Save },
  { id: "policies", label: "정책", icon: Settings2 },
];

export default function Sidebar({ activePanel, onChange, onOpenModal }) {
  const activeTravel = useNavStore((state) => state.travel);
  const pendingBlockedEncounter = useExplorationStore((state) => state.pendingCombatEncounter);
  // pendingTravelEvent is a save-compat-only read of the removed legacy travel
  // system (see stores/explorationStore.js) — kept so a badge still shows if an
  // old save happens to carry a stale value; nothing writes it going forward.
  const pendingTravelEvent = useExplorationStore((state) => state.pendingTravelEvent);
  const navPendingEncounter = useNavStore((state) => state.pendingEncounter);

  const handlePanel = (item) => {
    if (item.id === "menu") {
      onOpenModal("command");
      return;
    }
    if (item.id === blockedPanelId && activeTravel && !pendingBlockedEncounter) return;
    onChange(item.id);
  };

  return (
    <aside className="flex min-h-0 flex-col border-b border-slate-700/80 bg-slate-950/80 p-2 lg:h-full lg:border-b-0 lg:border-r lg:p-3">
      <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:min-h-0 lg:flex-1 lg:space-y-1 lg:overflow-y-auto lg:overflow-x-hidden lg:pb-2 lg:pr-1">
        {MENU_ITEMS.map((item) => {
          const Icon = icons[item.id] ?? MenuIcon;
          const active = activePanel === item.id;
          const locked = item.id === blockedPanelId && activeTravel && !pendingBlockedEncounter;
          const urgent = item.id === blockedPanelId && Boolean(pendingBlockedEncounter);
          const menuAlert = item.id === "menu" && Boolean(pendingTravelEvent || navPendingEncounter);
          return (
            <button key={item.id} className={`nav-button ${active ? "nav-button-active" : ""} ${locked ? "opacity-45" : ""}`} onClick={() => handlePanel(item)} disabled={locked}>
              <span className="relative shrink-0">
                <Icon size={17} />
                {menuAlert && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate">{urgent ? "긴급 교전" : menuAlert ? "대응 필요" : item.label}</span>
                <span className="hud-label hidden truncate lg:block">{locked ? "항해 중 잠김" : urgent ? "즉시 대응" : item.id === "menu" ? "팝업 메뉴" : item.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="mt-3 hidden shrink-0 lg:block">
        <div className="hud-label mb-2 px-1">퀵 액션</div>
        <div className="grid grid-cols-2 gap-1.5">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className="dock-button" onClick={() => onOpenModal(item.id)} title={item.label}><Icon size={16} /><span>{item.label}</span></button>;
          })}
        </div>
      </div>
    </aside>
  );
}
