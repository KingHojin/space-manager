import { useState } from "react";
import {
  Archive,
  BarChart2,
  BarChart3,
  BookOpen,
  Compass,
  Crosshair,
  Map,
  MoreHorizontal,
  PawPrint,
  Rocket,
  Save,
  ScrollText,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

const tabItems = [
  { id: "overview", label: "개요", icon: BarChart3 },
  { id: "exploration", label: "탐험", icon: Compass },
  { id: "combat", label: "전투", icon: Crosshair },
  { id: "ship", label: "함선", icon: Rocket },
];

const morePanels = [
  { id: "hunting", label: "사냥", icon: PawPrint },
  { id: "crew", label: "승무원", icon: Users },
  { id: "collector", label: "우주 집진기", icon: Sparkles },
  { id: "market", label: "시장", icon: Store },
];

const moreModals = [
  { id: "stats", label: "스탯", icon: BarChart2 },
  { id: "inventory", label: "아이템", icon: Archive },
  { id: "map", label: "지도", icon: Map },
  { id: "cards", label: "카드", icon: BookOpen },
  { id: "log", label: "로그", icon: ScrollText },
  { id: "save", label: "저장", icon: Save },
];

const morePanelIds = morePanels.map((item) => item.id);

export default function BottomDock({ activePanel, onChangePanel, onOpenModal }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreActive = morePanelIds.includes(activePanel);

  const selectPanel = (id) => {
    onChangePanel(id);
    setSheetOpen(false);
  };

  const openModal = (id) => {
    onOpenModal(id);
    setSheetOpen(false);
  };

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="hud-sheet modal-panel absolute inset-x-2 bottom-[4.75rem] max-h-[70dvh] w-auto overflow-auto p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="hud-label mb-2">메뉴</div>
            <div className="grid grid-cols-2 gap-2">
              {morePanels.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className="dock-button justify-start" onClick={() => selectPanel(item.id)}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="hud-label mb-2 mt-4">도구</div>
            <div className="grid grid-cols-3 gap-2">
              {moreModals.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className="dock-button" onClick={() => openModal(item.id)}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
              onClick={() => onChangePanel(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          className={`hud-tab-button ${moreActive || sheetOpen ? "hud-tab-button-active" : ""}`}
          onClick={() => setSheetOpen((value) => !value)}
        >
          <MoreHorizontal size={18} />
          <span>더보기</span>
        </button>
      </div>
    </>
  );
}
