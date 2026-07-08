import { Compass, Crosshair, Home, Menu as MenuIcon, Rocket } from "lucide-react";
import { getAllZones } from "../../data/sectors";
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
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const activeTravel = useNavStore((state) => state.travel);
  const pendingCombatEncounter = useExplorationStore((state) => state.pendingCombatEncounter);
  // pendingTravelEvent is a save-compat-only read of the removed legacy travel
  // system (see stores/explorationStore.js) — kept so a badge still shows if an
  // old save happens to carry a stale value; nothing writes it going forward.
  const pendingTravelEvent = useExplorationStore((state) => state.pendingTravelEvent);
  const navPendingEncounter = useNavStore((state) => state.pendingEncounter);
  const reports = useReportStore((state) => state.reports);
  const unreadReportCount = getUnreadCount(reports);
  const hasHighDangerZone = getAllZones().some((zone) => discoveredZoneIds.includes(zone.id) && zone.danger >= 4);

  const handleTab = (item) => {
    if (item.id === "combat" && activeTravel && !pendingCombatEncounter) return;
    if (item.type === "modal") {
      onOpenModal(item.id);
      return;
    }
    onChangePanel(item.id);
  };

  return (
    <div className="grid grid-cols-5 gap-1 border-t border-slate-700/80 bg-slate-950 px-2 pt-1.5 lg:hidden" style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}>
      {tabItems.map((item) => {
        const Icon = item.icon;
        const active = activePanel === item.id;
        const locked = item.id === "combat" && activeTravel && !pendingCombatEncounter;
        const urgent = item.id === "combat" && Boolean(pendingCombatEncounter);
        // Phase 20-C: an unread report also lights up the same "메뉴" tab dot
        // as a pending travel event/encounter — both mean "something needs
        // your attention in the menu" rather than being a distinct signal
        // worth its own indicator, so this reuses the existing dot instead of
        // adding a second one that would fight for the same corner.
        const menuAlert = item.id === "command" && Boolean(pendingTravelEvent || navPendingEncounter || unreadReportCount > 0);
        return (
          <button key={item.id} className={`hud-tab-button ${active ? "hud-tab-button-active" : ""} ${locked ? "opacity-45" : ""}`} onClick={() => handleTab(item)} disabled={locked}>
            <span className="relative inline-flex">
              <Icon size={18} />
              {item.id === "combat" && (urgent || hasHighDangerZone) && <span className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${urgent ? "bg-red-400 animate-pulse" : "bg-red-500"}`} />}
              {menuAlert && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />}
            </span>
            <span>{locked ? "잠김" : urgent ? "긴급" : menuAlert ? "대응" : item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
