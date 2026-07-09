import {
  AlertTriangle,
  Archive,
  BarChart2,
  Bell,
  BookOpen,
  Briefcase,
  ChevronRight,
  GitBranch,
  Map,
  Rocket,
  Save,
  ScrollText,
  Settings2,
  Sparkles,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import { contracts } from "../../data/contracts";
import { useContractStore } from "../../stores/contractStore";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useRecruitStore } from "../../stores/recruitStore";
import { getUnreadCount, useReportStore } from "../../stores/reportStore";
import { useShipStore } from "../../stores/shipStore";
import { useSkillStore } from "../../stores/skillStore";
import { number } from "../../utils/format";

const STORAGE_KEY_PREFIX = "space-manager";
// Architecture rule 5 (docs/NEXT_CHAT_HANDOFF.md): every persist store's
// storage key must be listed here AND in SaveLoadModal.jsx's knownSaveKeys.
// Pinned by stores/__tests__/persistKnownKeys.test.js.
const KNOWN_STORAGE_KEYS = [
  "space-manager-game",
  "space-manager-crew",
  "space-manager-ship",
  "space-manager-inventory",
  "space-manager-exploration",
  "space-manager-factions",
  "space-manager-combat",
  "space-manager-jobs",
  "space-manager-nav",
  "space-manager-ship-interior",
  "space-manager-recruit",
  "space-manager-contracts",
  "space-manager-missions",
  "space-manager-skills",
  "space-manager-policies",
  "space-manager-reports",
];

const primaryMenus = [
  { id: "missions", label: "임무", desc: "계약 임무 선택, 위험도·보상 확인, 출항 동기 설정", icon: Briefcase, tone: "border-sky-400/45 bg-sky-400/10 text-sky-100", modal: true },
  { id: "skilltree", label: "스킬트리", desc: "탐사·전투·공학·과학·외교 성장 빌드 관리", icon: GitBranch, tone: "border-violet-400/45 bg-violet-400/10 text-violet-100" },
  { id: "crew", label: "승무원", desc: "훈련, 휴식, 치료, 역할별 능력 관리", icon: Users, tone: "border-cyan-400/45 bg-cyan-400/10 text-cyan-100" },
  { id: "market", label: "시장", desc: "계약 수락, 보급, 정비, 신규 모듈 구매, 승무원 영입", icon: Store, tone: "border-emerald-400/45 bg-emerald-400/10 text-emerald-100" },
  { id: "collector", label: "컬렉션", desc: "카드와 유물 수집 상태 확인", icon: Sparkles, tone: "border-amber-400/45 bg-amber-400/10 text-amber-100" },
];

const utilityMenus = [
  { id: "stats", label: "스탯", icon: BarChart2 },
  { id: "inventory", label: "인벤토리", icon: Archive },
  { id: "cards", label: "카드", icon: BookOpen },
  { id: "map", label: "성계 지도", icon: Map },
  { id: "log", label: "로그", icon: ScrollText },
  { id: "reports", label: "함장 보고서", icon: Bell },
  { id: "save", label: "저장", icon: Save },
  { id: "policies", label: "정책 설정", icon: Settings2 },
];

function storageKeysForGame() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const keys = new Set(KNOWN_STORAGE_KEYS);
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) keys.add(key);
  }
  return [...keys].filter((key) => window.localStorage.getItem(key) !== null);
}

function wipeSavedGameAndReload() {
  if (typeof window === "undefined" || !window.localStorage) return;
  const keys = storageKeysForGame();
  keys.forEach((key) => window.localStorage.removeItem(key));
  window.location.reload();
}

export default function Menu({ onNavigate, onOpenModal }) {
  const availablePoints = useSkillStore((state) => state.availablePoints);
  const crew = useCrewStore((state) => state.crew);
  const resources = useGameStore((state) => state.resources);
  const logs = useGameStore((state) => state.logs);
  const cards = useInventoryStore((state) => state.cards);
  const items = useInventoryStore((state) => state.items);
  const candidatePool = useRecruitStore((state) => state.candidatePool ?? []);
  const acceptedIds = useContractStore((state) => state.acceptedIds);
  const completedIds = useContractStore((state) => state.completedIds);
  const activeVesselId = useShipStore((state) => state.activeVesselId);
  const activeMission = useMissionStore((state) => state.activeByVesselId?.[activeVesselId]);
  const boardsByScopeId = useMissionStore((state) => state.boardsByScopeId);
  // Live navigation stats — see docs/NEXT_CHAT_HANDOFF.md "알려진 지뢰": the
  // old explorationStore.discoveredZoneIds/scannedZoneIds are dead fields
  // frozen at their initial values (never updated after Phase 18-C). navStore's
  // sector/discovered/visited are the real, currently-updating navigation state.
  const sector = useNavStore((state) => state.sector);
  const discovered = useNavStore((state) => state.discovered ?? []);
  const visited = useNavStore((state) => state.visited ?? []);
  const reports = useReportStore((state) => state.reports);
  const unreadReportCount = getUnreadCount(reports);
  const itemCount = items.filter((item) => item.qty > 0).length;
  const activeContracts = contracts.filter((contract) => acceptedIds.includes(contract.id));
  const nextContracts = contracts.filter((contract) => !completedIds.includes(contract.id) && !acceptedIds.includes(contract.id));
  const totalZones = sector?.nodes?.length ?? 0;
  const exploredPercent = Math.round((discovered.length / Math.max(1, totalZones)) * 100);
  const offeredMissionCount = Object.values(boardsByScopeId ?? {}).reduce((sum, board) => sum + (board.missions?.length ?? 0), 0);
  const menuBadges = {
    missions: activeMission ? "진행 중" : offeredMissionCount > 0 ? `임무 ${offeredMissionCount}` : "신규",
    skilltree: availablePoints > 0 ? `포인트 ${availablePoints}` : "빌드",
    crew: `${crew.length}명`,
    market: candidatePool.length > 0 ? `영입 ${candidatePool.length}` : activeContracts.length > 0 ? `의뢰 ${activeContracts.length}` : `신규 ${nextContracts.length}`,
    collector: `카드 ${cards.length}`,
  };

  const handlePrimary = (menu) => {
    if (menu.modal) {
      onOpenModal?.(menu.id);
      return;
    }
    onNavigate?.(menu.id);
  };

  const handleWipe = () => {
    const ok = window.confirm("현재 브라우저에 저장된 Space Manager 진행 상태를 전부 초기화할까요? 승무원, 작업 큐, 항해, 함선, 인벤토리 진행 상태가 새 게임 상태로 돌아갑니다.");
    if (!ok) return;
    wipeSavedGameAndReload();
  };

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-title text-lg"><Rocket size={20} />함장 메뉴</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">모바일에서는 핵심 진행 탭만 하단에 두고, 성장·관리·보조 기능은 여기서 크게 열 수 있습니다.</p>
          </div>
          <span className="hud-chip hud-chip-accent shrink-0">탐사율 {exploredPercent}%</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <Status label="크레딧" value={`₢ ${number(resources.credits)}`} />
          <Status label="구역" value={`${discovered.length}/${totalZones}`} />
          <Status label="스캔" value={visited.length} />
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between gap-2">
          <div className="section-title"><GitBranch size={18} />주요 메뉴</div>
          {availablePoints > 0 && <span className="hud-chip hud-chip-accent">스킬 포인트 {availablePoints}</span>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {primaryMenus.map((menu) => {
            const Icon = menu.icon;
            return (
              <button key={menu.id} className={`group rounded border p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 ${menu.tone}`} onClick={() => handlePrimary(menu)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded border border-current/30 bg-slate-950/40"><Icon size={21} /></div>
                  <span className="hud-chip bg-slate-950/40">{menuBadges[menu.id]}</span>
                </div>
                <div className="mt-4 text-lg font-bold text-slate-50">{menu.label}</div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-slate-300">{menu.desc}</p>
                <div className="secondary-button mt-4 w-full justify-between bg-slate-950/50">열기 <ChevronRight size={15} /></div>
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <div className="section-title"><Archive size={18} />보조 메뉴</div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {utilityMenus.map((menu) => {
            const Icon = menu.icon;
            const badge =
              menu.id === "inventory"
                ? itemCount
                : menu.id === "cards"
                  ? cards.length
                  : menu.id === "log"
                    ? logs.length
                    : menu.id === "reports" && unreadReportCount > 0
                      ? unreadReportCount
                      : null;
            return <button key={menu.id} className="dock-button justify-between px-3" style={{ height: "3.5rem" }} onClick={() => onOpenModal?.(menu.id)}><span className="flex min-w-0 items-center gap-2"><Icon size={16} /><span className="truncate">{menu.label}</span></span>{badge !== null && <span className="hud-chip px-1.5 py-0.5 text-[0.6rem]">{badge}</span>}</button>;
          })}
        </div>
      </section>
      <section className="rounded-2xl border border-red-400/35 bg-red-400/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-title text-red-100"><AlertTriangle size={18} />진행 상태 초기화</div>
            <p className="mt-2 text-sm leading-6 text-red-100/80">회복/작업 큐가 꼬였거나 테스트 상태를 새로 시작해야 할 때 현재 브라우저의 저장된 진행 상태를 전부 지웁니다.</p>
          </div>
          <button className="secondary-button border-red-300/50 bg-red-950/50 text-red-100 hover:border-red-200" onClick={handleWipe}>
            <Trash2 size={16} />전체 초기화
          </button>
        </div>
      </section>
      <section>
        <div className="section-title"><Briefcase size={18} />최근 상황</div>
        <div className="mt-3 grid gap-2">{logs.slice(0, 4).map((log, index) => <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm leading-6 text-slate-300">{log}</div>)}</div>
      </section>
    </div>
  );
}

function Status({ label, value }) {
  return <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2"><div className="hud-label">{label}</div><div className="hud-value mt-1 truncate">{value}</div></div>;
}
