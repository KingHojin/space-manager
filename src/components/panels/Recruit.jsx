import { Sparkles, Ticket, Users } from "lucide-react";
import { CREW_CAPACITY_FALLBACK, RECRUIT_COST, RECRUIT_PITY, RECRUIT_RATES, getCrewTemplate } from "../../data/recruitment";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useRecruitStore } from "../../stores/recruitStore";

const rarityTone = {
  common: "border-slate-500/40 bg-slate-500/10 text-slate-100",
  rare: "border-sky-400/40 bg-sky-400/10 text-sky-100",
  epic: "border-violet-400/40 bg-violet-400/10 text-violet-100",
  legendary: "border-amber-300/50 bg-amber-300/10 text-amber-100",
};

function CrewCard({ result, compact = false }) {
  const template = result.templateId ? getCrewTemplate(result.templateId) : null;
  const rarity = result.rarity ?? template?.rarity ?? "common";
  return (
    <div className={`rounded border p-3 ${rarityTone[rarity] ?? rarityTone.common}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded border border-white/15 bg-slate-950/50 text-xl">{result.portrait ?? template?.portrait ?? "👤"}</span>
          <div className="min-w-0">
            <div className="truncate font-black text-slate-50">{result.name ?? template?.name}</div>
            <div className="mt-0.5 text-xs text-slate-300">{result.role ?? template?.role} · {result.trait ?? template?.trait}</div>
          </div>
        </div>
        <span className="hud-chip">{rarity}</span>
      </div>
      {!compact && <div className="mt-3 flex flex-wrap gap-1.5 text-xs">{Object.entries(result.stats ?? template?.baseStats ?? {}).map(([key, value]) => <span key={key} className="hud-chip">{key} {value}</span>)}</div>}
      {result.duplicate && <div className="mt-2 text-xs font-bold text-amber-100">중복/정원 초과 보상 ₢{result.duplicateRefund}</div>}
      {result.pityTriggered && <div className="mt-2 text-xs font-bold text-violet-100">천장 보장 발동</div>}
    </div>
  );
}

export default function Recruit() {
  const crew = useCrewStore((state) => state.crew);
  const resources = useGameStore((state) => state.resources);
  const addLog = useGameStore((state) => state.addLog);
  const pity = useRecruitStore((state) => state.pity);
  const candidatePool = useRecruitStore((state) => state.candidatePool ?? []);
  const lastResults = useRecruitStore((state) => state.lastResults ?? []);
  const pullHistory = useRecruitStore((state) => state.pullHistory ?? []);
  const pull = useRecruitStore((state) => state.pull);
  const recruitFromCandidate = useRecruitStore((state) => state.recruitFromCandidate);
  const capacity = CREW_CAPACITY_FALLBACK;

  const doPull = (count) => {
    const result = pull(count);
    if (!result.ok) return addLog(`영입 실패: ${result.reason === "credits" ? "크레딧 부족" : result.reason}`);
    addLog(`영입 ${count}회 완료: 비용 ₢${result.cost}, 환급 ₢${result.refund}.`);
  };

  const acceptCandidate = (candidateId) => {
    const result = recruitFromCandidate(candidateId);
    if (!result.ok) return addLog(`후보 영입 실패: ${result.reason}`);
    return addLog(`후보 영입 완료: ${result.member.name}.`);
  };

  return (
    <div className="grid gap-4 xl:h-full xl:grid-cols-[0.85fr_1.15fr]">
      <section>
        <div className="section-title"><Sparkles size={18} />승무원 영입</div>
        <div className="mt-4 rounded border border-cyan-400/30 bg-cyan-400/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="hud-label">RECRUITMENT</div>
              <div className="mt-2 text-3xl font-black text-slate-50">₢ {resources.credits}</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">1회/10회 영입으로 역할 공백을 메우고, 항해 조우 후보를 편입합니다.</p>
            </div>
            <span className="hud-chip hud-chip-accent">{crew.length}/{capacity}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="primary-button" disabled={resources.credits < RECRUIT_COST.single || crew.length >= capacity} onClick={() => doPull(1)}><Ticket size={16} />1회 ₢{RECRUIT_COST.single}</button>
            <button className="primary-button" disabled={resources.credits < RECRUIT_COST.ten || crew.length >= capacity} onClick={() => doPull(10)}><Ticket size={16} />10회 ₢{RECRUIT_COST.ten}</button>
          </div>
        </div>

        <section className="mt-4 rounded border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="section-title">확률 & 천장</div>
          <div className="mt-3 grid gap-2">
            {RECRUIT_RATES.map((entry) => <div key={entry.rarity} className="flex items-center justify-between rounded border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-sm"><span>{entry.label}</span><strong>{Math.round(entry.rate * 100)}%</strong></div>)}
          </div>
          <div className="mt-3 rounded border border-violet-400/30 bg-violet-400/10 p-3 text-sm leading-6 text-violet-100">천장: {RECRUIT_PITY.threshold}회 내 {RECRUIT_PITY.guaranteedRarity} 이상 보장 · 현재 {pity}/{RECRUIT_PITY.threshold}</div>
        </section>

        <section className="mt-4 rounded border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="section-title"><Users size={18} />항해 조우 후보</div>
          <div className="mt-3 grid gap-2">
            {candidatePool.length === 0 && <div className="rounded border border-slate-700/70 bg-slate-900/70 p-3 text-sm text-slate-400">아직 후보가 없습니다. 정거장/조난 조우에서 후보를 확보하세요.</div>}
            {candidatePool.map((candidate) => {
              const template = getCrewTemplate(candidate.templateId);
              return <div key={candidate.id} className="rounded border border-slate-700/70 bg-slate-900/70 p-3"><CrewCard result={{ ...template, templateId: candidate.templateId, stats: template?.baseStats }} compact /><button className="secondary-button mt-3 w-full" disabled={crew.length >= capacity} onClick={() => acceptCandidate(candidate.id)}>후보 편입</button></div>;
            })}
          </div>
        </section>
      </section>

      <section className="space-y-4">
        <section>
          <div className="section-title">최근 영입 결과</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {lastResults.length === 0 && <div className="rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-400">아직 영입 결과가 없습니다.</div>}
            {lastResults.map((result) => <CrewCard key={result.id} result={result} />)}
          </div>
        </section>
        <section>
          <div className="section-title">영입 기록</div>
          <div className="mt-3 grid gap-2">
            {pullHistory.slice(0, 8).map((result) => <div key={result.id} className="flex items-center justify-between rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm"><span>{result.portrait} {result.name} · {result.role}</span><span className="hud-chip">{result.rarity}</span></div>)}
          </div>
        </section>
      </section>
    </div>
  );
}
