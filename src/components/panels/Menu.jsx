import {
  Archive,
  BarChart2,
  BookOpen,
  Briefcase,
  ChevronRight,
  GitBranch,
  Map,
  PawPrint,
  Rocket,
  Save,
  ScrollText,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { contracts } from "../../data/contracts";
import { getAllZones } from "../../data/sectors";
import { useContractStore } from "../../stores/contractStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useSkillStore } from "../../stores/skillStore";
import { number } from "../../utils/format";

const primaryMenus = [
  {
    id: "skilltree",
    label: "스킬트리",
    desc: "탐사·전투·공학·과학·외교 성장 빌드 관리",
    icon: GitBranch,
    tone: "border-violet-400/45 bg-violet-400/10 text-violet-100",
  },
  {
    id: "crew",
    label: "승무원",
    desc: "훈련, 휴식, 치료, 역할별 능력 관리",
    icon: Users,
    tone: "border-cyan-400/45 bg-cyan-400/10 text-cyan-100",
  },
  {
    id: "market",
    label: "시장",
    desc: "계약 수락, 보급, 정비, 신규 모듈 구매",
    icon: Store,
    tone: "border-emerald-400/45 bg-emerald-400/10 text-emerald-100",
  },
  {
    id: "collector",
    label: "컬렉션",
    desc: "카드와 유물 수집 상태 확인",
    icon: Sparkles,
    tone: "border-amber-400/45 bg-amber-400/10 text-amber-100",
  },
  {
    id: "hunting",
    label: "사냥",
    desc: "외계 생물 추적과 특수 보상 획득",
    icon: PawPrint,
    tone: "border-red-400/45 bg-red-400/10 text-red-100",
  },
];

const utilityMenus = [
  { id: "stats", label: "스탯", icon: BarChart2 },
  { id: "inventory", label: "인벤토리", icon: Archive },
  { id: "cards", label: "카드", icon: BookOpen },
  { id: "map", label: "성계 지도", icon: Map },
  { id: "log", label: "로그", icon: ScrollText },
  { id: "save", label: "저장", icon: Save },
];

export default function Menu({ onNavigate, onOpenModal }) {
  const availablePoints = useSkillStore((state) => state.availablePoints);
  const crew = useCrewStore((state) => state.crew);
  const resources = useGameStore((state) => state.resources);
  const logs = useGameStore((state) => state.logs);
  const cards = useInventoryStore((state) => state.cards);
  const items = useInventoryStore((state) => state.items);
  const acceptedIds = useContractStore((state) => state.acceptedIds);
  const completedIds = useContractStore((state) => state.completedIds);
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const scannedZoneIds = useExplorationStore((state) => state.scannedZoneIds);
  const itemCount = items.filter((item) => item.qty > 0).length;
  const activeContracts = contracts.filter((contract) => acceptedIds.includes(contract.id));
  const nextContracts = contracts.filter((contract) => !completedIds.includes(contract.id) && !acceptedIds.includes(contract.id));
  const totalZones = getAllZones().length;
  const exploredPercent = Math.round((discoveredZoneIds.length / Math.max(1, totalZones)) * 100);

  const menuBadges = {
    skilltree: availablePoints > 0 ? `포인트 ${availablePoints}` : "빌드",
    crew: `${crew.length}명`,
    market: activeContracts.length > 0 ? `의뢰 ${activeContracts.length}` : `신규 ${nextContracts.length}`,
    collector: `카드 ${cards.length}`,
    hunting: "보상",
  };

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-title text-lg"><Rocket size={20} />함장 메뉴</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              모바일에서는 핵심 진행 탭만 하단에 두고, 성장·관리·보조 기능은 여기서 크게 열 수 있습니다.
            </p>
          </div>
          <span className="hud-chip hud-chip-accent shrink-0">탐사율 {exploredPercent}%</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <Status label="크레딧" value={`₢ ${number(resources.credits)}`} />
          <Status label="구역" value={`${discoveredZoneIds.length}/${totalZones}`} />
          <Status label="스캔" value={scannedZoneIds.length} />
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
              <button
                key={menu.id}
                className={`group rounded border p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 ${menu.tone}`}
                onClick={() => onNavigate?.(menu.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded border border-current/30 bg-slate-950/40">
                    <Icon size={21} />
                  </div>
                  <span className="hud-chip bg-slate-950/40">{menuBadges[menu.id]}</span>
                </div>
                <div className="mt-4 text-lg font-bold text-slate-50">{menu.label}</div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-slate-300">{menu.desc}</p>
                <div className="secondary-button mt-4 w-full justify-between bg-slate-950/50">
                  열기 <ChevronRight size={15} />
                </div>
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
            const badge = menu.id === "inventory" ? itemCount : menu.id === "cards" ? cards.length : menu.id === "log" ? logs.length : null;
            return (
              <button key={menu.id} className="dock-button h-14 justify-between px-3" onClick={() => onOpenModal?.(menu.id)}>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={16} />
                  <span className="truncate">{menu.label}</span>
                </span>
                {badge !== null && <span className="hud-chip px-1.5 py-0.5 text-[0.6rem]">{badge}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="section-title"><Briefcase size={18} />최근 상황</div>
        <div className="mt-3 grid gap-2">
          {logs.slice(0, 4).map((log, index) => (
            <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm leading-6 text-slate-300">
              {log}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Status({ label, value }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2">
      <div className="hud-label">{label}</div>
      <div className="hud-value mt-1 truncate">{value}</div>
    </div>
  );
}
