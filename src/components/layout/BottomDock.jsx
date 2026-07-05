import { Archive, BookOpen, Compass, Crosshair, GitBranch, Home, Map, PawPrint, Rocket, Save, ScrollText, Sparkles, Store, Users } from "lucide-react";
import { getAllZones } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";
import { useInventoryStore } from "../../stores/inventoryStore";

const tabItems = [
  { id: "overview", label: "홈", icon: Home, type: "panel" },
  { id: "exploration", label: "지도", icon: Compass, type: "panel" },
  { id: "combat", label: "전투", icon: Crosshair, type: "panel" },
  { id: "inventory", label: "인벤토리", icon: Archive, type: "modal" },
  { id: "ship", label: "함선", icon: Rocket, type: "panel" },
];

const morePanels = [
  { id: "skilltree", label: "스킬트리", icon: GitBranch },
  { id: "hunting", label: "사냥", icon: PawPrint },
  { id: "crew", label: "승무원", icon: Users },
  { id: "collector", label: "컬렉션", icon: Sparkles },
  { id: "market", label: "시장", icon: Store },
];

const moreModals = [
  { id: "map", label: "성계 지도", icon: Map },
  { id: "cards", label: "카드", icon: BookOpen },
  { id: "log", label: "로그", icon: ScrollText },
  { id: "save", label: "저장", icon: Save },
];

export default function BottomDock({ activePanel, onChangePanel, onOpenModal }) {
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const itemCount = useInventoryStore((state) => state.items.filter((item) => item.qty > 0).length);
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
              {item.id === "inventory" && itemCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[0.55rem] font-bold text-white">
                  {itemCount}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
      <div className="fixed right-2 bottom-[4.65rem] z-30 flex flex-col gap-1 lg:hidden">
        {morePanels.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className="hidden rounded border border-slate-700 bg-slate-950/90 p-2 text-cyan-100 shadow-lg first:block" onClick={() => onChangePanel(item.id)} title={item.label}>
              <Icon size={15} />
            </button>
          );
        })}
        {moreModals.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className="hidden rounded border border-slate-700 bg-slate-950/90 p-2 text-slate-300 shadow-lg" onClick={() => onOpenModal(item.id)} title={item.label}>
              <Icon size={15} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
