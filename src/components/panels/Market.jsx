import { Store, UserPlus } from "lucide-react";
import { marketSupplies, recruitCandidates } from "../../data/market";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { number, statLabel } from "../../utils/format";

const resourceLabels = {
  fuel: "연료",
  oxygen: "산소",
  hull: "선체",
};

export default function Market() {
  const currentZoneId = useExplorationStore((state) => state.currentZoneId);
  const resources = useGameStore((state) => state.resources);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addResource = useGameStore((state) => state.addResource);
  const addLog = useGameStore((state) => state.addLog);
  const crew = useCrewStore((state) => state.crew);
  const recruitCrew = useCrewStore((state) => state.recruitCrew);
  const docked = currentZoneId === "anchor-station";

  const buySupply = (offer) => {
    if (!docked) return addLog("시장 이용 실패: 앵커 정거장 도킹이 필요합니다.");
    if (!spendCredits(offer.price)) return addLog(`${offer.name} 구매 실패: 크레딧이 부족합니다.`);
    addResource(offer.resource, offer.amount, offer.cap);
    addLog(`${offer.name} 구매 완료. ${resourceLabels[offer.resource]} +${offer.amount}`);
  };

  const hireCandidate = (candidate) => {
    if (!docked) return addLog("승무원 영입 실패: 앵커 정거장 도킹이 필요합니다.");
    if (crew.some((member) => member.id === candidate.id)) return addLog(`${candidate.name}은 이미 승선 중입니다.`);
    if (!spendCredits(candidate.fee)) return addLog(`${candidate.name} 영입 실패: 크레딧이 부족합니다.`);
    recruitCrew(candidate);
    addLog(`${candidate.name} 승무원 영입 완료.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <section>
        <div className="section-title">
          <Store size={18} />
          정거장 시장
        </div>
        <div className="mt-5 rounded border border-slate-700/70 bg-slate-950/60 p-5">
          <div className="text-xl font-bold text-slate-50">{docked ? "앵커 정거장 거래 가능" : "정거장 도킹 필요"}</div>
          <p className="mt-2 text-sm text-slate-400">
            {docked ? "보급품을 구매하거나 정거장 대기 승무원을 영입할 수 있습니다." : "앵커 정거장으로 이동하면 시장 기능이 활성화됩니다."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Resource label="크레딧" value={number(resources.credits, 0)} />
            <Resource label="연료" value={number(resources.fuel, 0)} />
            <Resource label="산소" value={number(resources.oxygen, 0)} />
            <Resource label="선체" value={number(resources.hull, 0)} />
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">보급 계약</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {marketSupplies.map((offer) => (
            <article key={offer.id} className="flex flex-col rounded border border-slate-700/70 bg-slate-950/60 p-4">
              <div className="font-bold text-slate-50">{offer.name}</div>
              <p className="mt-2 flex-1 text-sm text-slate-400">{offer.description}</p>
              <div className="mt-4 text-sm text-cyan-100">{resourceLabels[offer.resource]} +{offer.amount}</div>
              <button className="primary-button mt-3" disabled={!docked} onClick={() => buySupply(offer)}>
                {offer.price} 크레딧
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="xl:col-span-2">
        <div className="section-title">
          <UserPlus size={18} />
          승무원 영입
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recruitCandidates.map((candidate) => {
            const hired = crew.some((member) => member.id === candidate.id);
            return (
              <article key={candidate.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-50">{candidate.name}</div>
                    <div className="text-sm text-slate-400">{candidate.role} · {candidate.pitch}</div>
                  </div>
                  <button className="secondary-button" disabled={!docked || hired} onClick={() => hireCandidate(candidate)}>
                    {hired ? "승선 중" : `${candidate.fee} 크레딧`}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  {Object.entries(candidate.stats).map(([key, value]) => (
                    <div key={key} className="rounded border border-slate-800 bg-slate-900 px-2 py-2">
                      <div className="text-slate-500">{statLabel[key]}</div>
                      <div className="font-mono text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Resource({ label, value }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-mono font-bold text-slate-100">{value}</div>
    </div>
  );
}
