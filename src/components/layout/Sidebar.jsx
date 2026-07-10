import { Archive, BarChart2, Bell, BookOpen, Briefcase, Compass, GitBranch, Home, Map, Menu as MenuIcon, Rocket, Save, ScrollText, Settings2, Sparkles, Store, Users } from "lucide-react";
import { MENU_ITEMS } from "../../data/constants";
import { useExplorationStore } from "../../stores/explorationStore";
import { useNavStore } from "../../stores/navStore";
import { getUnreadCount, useReportStore } from "../../stores/reportStore";

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
  { id: "reports", label: "보고서", icon: Bell },
  { id: "save", label: "저장", icon: Save },
  { id: "policies", label: "정책", icon: Settings2 },
];

export default function Sidebar({ activePanel, onChange, onOpenModal }) {
  const activeTravel = useNavStore((state) => state.travel);
  const pendingBlockedEncounter = useExplorationStore((state) => state.pendingCombatEncounter);
  const pendingTravelEvent = useExplorationStore((state) => state.pendingTravelEvent);
  const navPendingEncounter = useNavStore((state) => state.pendingEncounter);
  const reports = useReportStore((state) => state.reports);
  const unreadReportCount = getUnreadCount(reports);

  const handlePanel = (item) => {
    if (item.id === "menu") {
      onOpenModal("command");
      return;
    }
    if (item.id === blockedPanelId && activeTravel && !pendingBlockedEncounter) return;
    onChange(item.id);
  };

  return (
    <aside className="app-sidebar">
      <div className="sidebar-section-label">운항</div>
      <nav className="sidebar-nav min-h-0 flex-1 overflow-y-auto pr-1" aria-label="주요 화면">
        {MENU_ITEMS.map((item) => {
          const Icon = icons[item.id] ?? MenuIcon;
          const active = activePanel === item.id;
          const locked = item.id === blockedPanelId && activeTravel && !pendingBlockedEncounter;
          const urgent = item.id === blockedPanelId && Boolean(pendingBlockedEncounter);
          const menuAlert = item.id === "menu" && Boolean(pendingTravelEvent || navPendingEncounter);
          return (
            <button
              key={item.id}
              className={`nav-button ${active ? "nav-button-active" : ""} ${locked ? "opacity-45" : ""}`}
              onClick={() => handlePanel(item)}
              disabled={locked}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative shrink-0">
                <Icon size={18} />
                {menuAlert && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{urgent ? "긴급 교전" : menuAlert ? "대응 필요" : item.label}</span>
                <span className="hud-label mt-0.5 block truncate">{locked ? "항해 중 잠김" : urgent ? "즉시 대응" : item.id === "menu" ? "함장 도구" : item.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 shrink-0 border-t border-white/[0.07] pt-3">
        <div className="sidebar-section-label">도구</div>
        <div className="sidebar-quick-actions">
          {quickActions.map((item) => {
            const Icon = item.icon;
            const showUnreadDot = item.id === "reports" && unreadReportCount > 0;
            return (
              <button key={item.id} className="dock-button" onClick={() => onOpenModal(item.id)} title={item.label}>
                <span className="relative inline-flex">
                  <Icon size={16} />
                  {showUnreadDot && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-blue-300" />}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
