import { Compass, Crosshair, Home, Menu as MenuIcon, Rocket } from "lucide-react";
import { getAllZones } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";

const tabItems = [
  { id: "overview", label: "홈", icon: Home, type: "panel" },
  { id: "exploration", label: "탐사", icon: Compass, type: "panel" },
  { id: "combat", label: "전투", icon: Crosshair, type: "panel" },
  { id: "ship", label: "함선", icon: Rocket, type: "panel" },
  { id: "menu", label: "메뉴", icon: MenuIcon, type: "panel" },
];

export default function BottomDock({ activePanel, onChangePanel, onOpenModal }) {
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const hasHighDangerZone = getAllZones().some(
    (zone) => discoveredZoneIds.includes(zone.id) && zone.danger >= 4,
  );

  const handleTab = (item) => {
    if (item.type === "modal") {
      onOpenModal(item.id);
      return;
    }
    onChangePanel(item.id);
  };

  return (
    <div
      className="grid grid-cols-5 gap-1 border-t border-slate-700/80 bg-slate-950 px-2 pt-1.5 lg:hidden"
      style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
    >
      {tabItems.map((item) => {
        const Icon = item.icon;
        const active = activePanel === item.id;
        return (
          <button
            key={item.id}
            className={`hud-tab-button ${active ? "hud-tab-button-active" : ""}`}
            onClick={() => handleTab(item)}
          >
            <span className="relative inline-flex">
              <Icon size={18} />
              {item.id === "combat" && hasHighDangerZone && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
