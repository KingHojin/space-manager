import { useMemo, useState } from "react";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import NewsTicker from "./components/layout/NewsTicker";
import BottomDock from "./components/layout/BottomDock";
import Overview from "./components/panels/Overview";
import Exploration from "./components/panels/Exploration";
import Combat from "./components/panels/Combat";
import Hunting from "./components/panels/Hunting";
import Ship from "./components/panels/Ship";
import Crew from "./components/panels/Crew";
import Recruit from "./components/panels/Recruit";
import Collector from "./components/panels/Collector";
import Market from "./components/panels/Market";
import SkillTree from "./components/panels/SkillTree";
import MenuPanel from "./components/panels/Menu";
import OverlayModal from "./components/modals/OverlayModal";
import StatsModal from "./components/modals/StatsModal";
import InventoryModal from "./components/modals/InventoryModal";
import MapModal from "./components/modals/MapModal";
import MissionBoardModal from "./components/modals/MissionBoardModal";
import CardsModal from "./components/modals/CardsModal";
import LogModal from "./components/modals/LogModal";
import SaveLoadModal from "./components/modals/SaveLoadModal";
import { useGameClock } from "./systems/gameClock";

const panels = {
  overview: { title: "홈", component: Overview },
  exploration: { title: "지도", component: Exploration },
  combat: { title: "전투", component: Combat },
  hunting: { title: "사냥", component: Hunting },
  ship: { title: "함선", component: Ship },
  menu: { title: "메뉴", component: MenuPanel },
  crew: { title: "승무원", component: Crew },
  recruit: { title: "영입", component: Recruit },
  collector: { title: "컬렉션", component: Collector },
  market: { title: "시장", component: Market },
  skilltree: { title: "스킬트리", component: SkillTree },
};

const modals = {
  command: { title: "함장 메뉴", component: MenuPanel },
  missions: { title: "임무 게시판", component: MissionBoardModal },
  stats: { title: "스탯", component: StatsModal },
  inventory: { title: "인벤토리", component: InventoryModal },
  map: { title: "성계 지도", component: MapModal },
  cards: { title: "카드", component: CardsModal },
  log: { title: "로그", component: LogModal },
  save: { title: "저장", component: SaveLoadModal },
};

export default function App() {
  useGameClock();
  const [activePanel, setActivePanel] = useState("overview");
  const [activeModal, setActiveModal] = useState(null);
  const Panel = panels[activePanel].component;
  const modal = useMemo(() => (activeModal ? modals[activeModal] : null), [activeModal]);
  const ModalContent = modal?.component;
  const showPanelTitle = activePanel !== "overview";

  const navigateFromModal = (panelId) => {
    if (!panels[panelId]) return;
    setActivePanel(panelId);
    setActiveModal(null);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-100">
      <Header />
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <Sidebar activePanel={activePanel} onChange={setActivePanel} onOpenModal={setActiveModal} />
        </div>
        <main className={`grid min-h-0 grid-cols-1 bg-slate-900 ${showPanelTitle ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[minmax(0,1fr)_auto]"}`}>
          {showPanelTitle && (
            <div className="border-b border-slate-700/80 bg-slate-900 px-4 py-3 sm:px-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Space Manager</div>
              <h2 className="mt-1 text-xl font-bold text-slate-50 sm:text-2xl">{panels[activePanel].title}</h2>
            </div>
          )}
          <div className="min-h-0 overflow-auto p-3 sm:p-4">
            <Panel onNavigate={setActivePanel} onOpenModal={setActiveModal} />
          </div>
          <NewsTicker onOpenLog={() => setActiveModal("log")} />
        </main>
      </div>
      <BottomDock activePanel={activePanel} onChangePanel={setActivePanel} onOpenModal={setActiveModal} />
      {modal && (
        <OverlayModal title={modal.title} onClose={() => setActiveModal(null)}>
          <ModalContent onNavigate={navigateFromModal} onOpenModal={setActiveModal} />
        </OverlayModal>
      )}
    </div>
  );
}
