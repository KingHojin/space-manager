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
import Collector from "./components/panels/Collector";
import Market from "./components/panels/Market";
import OverlayModal from "./components/modals/OverlayModal";
import StatsModal from "./components/modals/StatsModal";
import InventoryModal from "./components/modals/InventoryModal";
import MapModal from "./components/modals/MapModal";
import CardsModal from "./components/modals/CardsModal";
import LogModal from "./components/modals/LogModal";
import SaveLoadModal from "./components/modals/SaveLoadModal";
import { useGameClock } from "./systems/gameClock";

const panels = {
  overview: { title: "작전 개요", component: Overview },
  exploration: { title: "탐험", component: Exploration },
  combat: { title: "전투", component: Combat },
  hunting: { title: "사냥", component: Hunting },
  ship: { title: "함선", component: Ship },
  crew: { title: "승무원", component: Crew },
  collector: { title: "우주 집진기", component: Collector },
  market: { title: "시장", component: Market },
};

const modals = {
  stats: { title: "스탯", component: StatsModal },
  inventory: { title: "아이템", component: InventoryModal },
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

  return (
    <div className="h-screen min-w-[1180px] overflow-hidden bg-slate-950 text-slate-100">
      <Header />
      <div className="grid h-[calc(100vh-8rem)] grid-cols-[14rem_minmax(0,1fr)]">
        <Sidebar activePanel={activePanel} onChange={setActivePanel} />
        <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-slate-900">
          <div className="border-b border-slate-700/80 bg-slate-900 px-5 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Space Manager</div>
            <h2 className="mt-1 text-2xl font-bold text-slate-50">{panels[activePanel].title}</h2>
          </div>
          <div className="min-h-0 overflow-auto p-4">
            <Panel />
          </div>
          <NewsTicker onOpenLog={() => setActiveModal("log")} />
        </main>
      </div>
      <BottomDock onOpen={setActiveModal} />
      {modal && (
        <OverlayModal title={modal.title} onClose={() => setActiveModal(null)}>
          <ModalContent />
        </OverlayModal>
      )}
    </div>
  );
}
