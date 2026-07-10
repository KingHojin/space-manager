import { Compass, Crosshair, Home, Menu as MenuIcon, Rocket } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import { useNavStore } from "../../stores/navStore";
import { getUnreadCount, useReportStore } from "../../stores/reportStore";

const tabItems = [
  { id: "overview", label: "홈", icon: Home, type: "panel" },
  { id: "exploration", label: "탐사", icon: Compass, type: "panel" },
  { id: "combat", label: "전투", icon: Crosshair, type: "panel" },
  { id: "ship", label: "함선", icon: Rocket, type: "panel" },
  { id: "command", label: "메뉴", icon: MenuIcon, type: "modal" },
];

export default function BottomDock({ activePanel, onChangePanel, onOpenModal }) {
  const activeTravel = useNavStore((state) => state.travel);
  const pendingCombatEncounter = useExplorationStore((state) => state.pendingCombatEncounter);
  const pendingTravelEvent = useExplorationStore((state) => state.pendingTravelEvent);
  const navPendingEncounter = useNavStore((state) => state.pendingEncounter);
  const sector = useNavStore((state) => state.sector);
  const discovered = useNavStore((state) => state.discovered ?? []);
  const reports = useReportStore((state) => state.reports);
  const unreadReportCount = getUnreadCount(reports);
  const hasHighDangerZone = (sector?.nodes ?? []).some((node) => discovered.includes(node.id) && node.danger >= 4);

  const handleTab = (item) => {
    if (item.id === "combat" && activeTravel && !pendingCombatEncounter) return;
    if (item.type === "modal") {
      onOpenModal(item.id);
      return;
    }
    onChangePanel(item.id);
  };

  return (
    <div className="mobile-dock-shell lg:hidden">
      <nav className="mobile-dock" aria-label="모바일 주요 화면">
        {tabItems.map((item) => {
          const Icon = item.icon;
          const active = activePanel === item.id;
          const locked = item.id === "combat" && activeTravel && !pendingCombatEncounter;
          const urgent = item.id === "combat" && Boolean(pendingCombatEncounter);
          const menuAlert = item.id === "command" && Boolean(pendingTravelEvent || navPendingEncounter || unreadReportCount > 0);
          return (
            <button
              key={item.id}
              className={`hud-tab-button ${active ? "hud-tab-button-active" : ""} ${locked ? "opacity-45" : ""}`}
              onClick={() => handleTab(item)}
              disabled={locked}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative inline-flex">
                <Icon size={19} />
                {item.id === "combat" && (urgent || hasHighDangerZone) && <span className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${urgent ? "animate-pulse bg-red-400" : "bg-red-500"}`} />}
                {menuAlert && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />}
              </span>
              <span>{locked ? "잠김" : urgent ? "긴급" : menuAlert ? "대응" : item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
