import { useMemo, useState } from "react";
import { Crosshair, FlaskConical, Flag, Handshake, Lock, Radar, RotateCcw, Sparkles, Wrench } from "lucide-react";
import { getSkillById, getSkillsByBranch, skillBranches, skills } from "../../data/skills";
import { useGameStore } from "../../stores/gameStore";
import { useSkillStore } from "../../stores/skillStore";

const branchIcons = {
  command: Flag,
  exploration: Radar,
  combat: Crosshair,
  engineering: Wrench,
  science: FlaskConical,
  diplomacy: Handshake,
};

const branchTone = {
  command: {
    text: "text-sky-300",
    border: "border-sky-400/45",
    active: "border-sky-300 bg-sky-400/15 text-sky-100 shadow-[0_0_18px_rgb(56_189_248_/_0.2)]",
    line: "bg-sky-400/50",
  },
  exploration: {
    text: "text-emerald-300",
    border: "border-emerald-400/45",
    active: "border-emerald-300 bg-emerald-400/15 text-emerald-100 shadow-[0_0_18px_rgb(52_211_153_/_0.2)]",
    line: "bg-emerald-400/50",
  },
  combat: {
    text: "text-red-300",
    border: "border-red-400/45",
    active: "border-red-300 bg-red-400/15 text-red-100 shadow-[0_0_18px_rgb(248_113_113_/_0.2)]",
    line: "bg-red-400/50",
  },
  engineering: {
    text: "text-amber-300",
    border: "border-amber-400/45",
    active: "border-amber-300 bg-amber-400/15 text-amber-100 shadow-[0_0_18px_rgb(251_191_36_/_0.2)]",
    line: "bg-amber-400/50",
  },
  science: {
    text: "text-violet-300",
    border: "border-violet-400/45",
    active: "border-violet-300 bg-violet-400/15 text-violet-100 shadow-[0_0_18px_rgb(168_85_247_/_0.2)]",
    line: "bg-violet-400/50",
  },
  diplomacy: {
    text: "text-cyan-300",
    border: "border-cyan-400/45",
    active: "border-cyan-300 bg-cyan-400/15 text-cyan-100 shadow-[0_0_18px_rgb(34_211_238_/_0.2)]",
    line: "bg-cyan-400/50",
  },
};

const synergyCards = [
  { label: "탐사 전문가", value: "탐사 속도 +15%", progress: "2 / 4", branch: "exploration" },
  { label: "연료 효율", value: "연료 소비 -10%", progress: "2 / 4", branch: "engineering" },
  { label: "전투 준비", value: "전투력 +12%", progress: "3 / 5", branch: "combat" },
  { label: "연구 집중", value: "연구 속도 +10%", progress: "2 / 4", branch: "science" },
  { label: "계약 평판", value: "계약 보상 +10%", progress: "2 / 4", branch: "diplomacy" },
];

const buildPresets = [
  { title: "탐사 특화 빌드", desc: "미지 영역 탐사와 자원 수집 최적화", branch: "exploration" },
  { title: "전투 지휘 빌드", desc: "전투 성능과 생존력 강화", branch: "combat" },
  { title: "연구 전문가 빌드", desc: "연구 속도와 유물 보상 집중", branch: "science" },
];

export default function SkillTree() {
  const [filter, setFilter] = useState("all");
  const { availablePoints, levels, selectedSkillId, selectSkill, upgradeSkill, resetSkills } = useSkillStore();
  const addLog = useGameStore((state) => state.addLog);
  const selected = getSkillById(selectedSkillId) ?? skills[0];
  const selectedLevel = levels[selected.id] ?? 0;
  const selectedReady = canUpgrade(selected, levels, availablePoints);
  const visibleBranches = filter === "all" ? skillBranches : skillBranches.filter((branch) => branch.id === filter);
  const mobileBranch = skillBranches.find((branch) => branch.id === (filter === "all" ? selected.branch : filter)) ?? skillBranches[0];
  const mobileBranchSkills = getSkillsByBranch(mobileBranch.id);
  const MobileBranchIcon = branchIcons[mobileBranch.id];
  const mobileTone = branchTone[mobileBranch.id];

  const totals = useMemo(() => {
    return skillBranches.map((branch) => {
      const branchSkills = getSkillsByBranch(branch.id);
      const used = branchSkills.reduce((sum, skill) => sum + (levels[skill.id] ?? 0), 0);
      const max = branchSkills.reduce((sum, skill) => sum + skill.maxLevel, 0);
      return { ...branch, used, max };
    });
  }, [levels]);

  const handleUpgrade = () => {
    const ok = upgradeSkill(selected.id);
    addLog(ok ? `스킬 강화: ${selected.name} Lv.${selectedLevel + 1}` : `${selected.name} 강화 실패: 조건 또는 포인트가 부족합니다.`);
  };

  const handleReset = () => {
    resetSkills();
    addLog("스킬트리를 초기화했습니다.");
  };

  return (
    <div className="grid gap-4">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-title text-lg"><Sparkles size={20} />스킬트리</div>
          <div className="flex items-center gap-2">
            <span className="hud-chip hud-chip-accent">사용 가능 포인트: {availablePoints}</span>
            <button className="secondary-button gap-2" onClick={handleReset}><RotateCcw size={16} />초기화</button>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button className={`hud-chip ${filter === "all" ? "hud-chip-accent" : ""}`} onClick={() => setFilter("all")}>전체</button>
          {skillBranches.map((branch) => {
            const Icon = branchIcons[branch.id];
            return (
              <button key={branch.id} className={`hud-chip ${filter === branch.id ? "hud-chip-accent" : ""}`} onClick={() => setFilter(branch.id)}>
                <Icon size={13} />{branch.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 md:hidden">
        <section>
          <div className="flex items-center justify-between gap-3">
            <div className="section-title">
              <MobileBranchIcon size={18} />
              모바일 트리 · {mobileBranch.label}
            </div>
            <span className="hud-chip hud-chip-accent">탭 선택</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            모바일에서는 한 계열씩 세로로 보여줍니다. 위 필터에서 계열을 고르면 해당 트리만 크게 확인할 수 있습니다.
          </p>
          <div className="mt-4 grid gap-3">
            {mobileBranchSkills.map((skill, index) => {
              const level = levels[skill.id] ?? 0;
              const locked = skill.requires && (levels[skill.requires] ?? 0) <= 0;
              const active = skill.id === selected.id;
              const maxed = level >= skill.maxLevel;
              return (
                <button
                  key={skill.id}
                  className={`relative rounded border p-3 text-left transition ${active ? mobileTone.active : locked ? "border-slate-700 bg-slate-950 text-slate-600" : level > 0 ? `${mobileTone.border} bg-slate-900/80 ${mobileTone.text}` : "border-slate-600 bg-slate-900/70 text-slate-300"}`}
                  onClick={() => selectSkill(skill.id)}
                >
                  {index > 0 && <span className={`absolute -top-3 left-7 h-3 w-px ${locked ? "bg-slate-700" : mobileTone.line}`} />}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${active ? "border-current" : mobileTone.border} bg-slate-950/50`}>
                        {locked ? <Lock size={17} /> : <span className="text-xs font-bold">{level}/{skill.maxLevel}</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-50">{skill.name}</div>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{skill.desc}</p>
                      </div>
                    </div>
                    {maxed && <span className="hud-chip hud-chip-success shrink-0">완성</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="hidden gap-4 md:grid xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <section>
          <div className="grid min-w-[46rem] grid-cols-6 gap-3 xl:min-w-0">
            {visibleBranches.map((branch) => {
              const tone = branchTone[branch.id];
              const Icon = branchIcons[branch.id];
              const branchSkills = getSkillsByBranch(branch.id);
              const total = totals.find((item) => item.id === branch.id);
              return (
                <div key={branch.id} className="relative rounded border border-slate-700/70 bg-slate-950/60 p-3">
                  <div className="mb-4 text-center">
                    <div className={`mx-auto mb-1 grid h-9 w-9 place-items-center rounded border ${tone.border} ${tone.text}`}><Icon size={17} /></div>
                    <div className={`font-bold ${tone.text}`}>{branch.label}</div>
                    <div className="hud-chip mt-1">{total?.used ?? 0} / {total?.max ?? 0}</div>
                  </div>
                  <div className="grid gap-4">
                    {branchSkills.map((skill, index) => {
                      const level = levels[skill.id] ?? 0;
                      const locked = skill.requires && (levels[skill.requires] ?? 0) <= 0;
                      const active = skill.id === selected.id;
                      const maxed = level >= skill.maxLevel;
                      return (
                        <div key={skill.id} className="relative grid place-items-center">
                          {index > 0 && <span className={`absolute -top-4 h-4 w-px ${locked ? "bg-slate-700" : tone.line}`} />}
                          <button
                            className={`grid h-16 w-16 place-items-center rounded-xl border text-center text-xs font-bold transition ${active ? tone.active : locked ? "border-slate-700 bg-slate-950 text-slate-600" : level > 0 ? `${tone.border} bg-slate-900/80 ${tone.text}` : "border-slate-600 bg-slate-900/70 text-slate-400"}`}
                            onClick={() => selectSkill(skill.id)}
                          >
                            {locked ? <Lock size={18} /> : <span>{level}/{skill.maxLevel}</span>}
                          </button>
                          <div className="mt-1 max-w-20 truncate text-center text-[0.64rem] text-slate-400">{skill.name}</div>
                          {maxed && <span className="hud-chip hud-chip-success mt-1">완성</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <SkillDetail
            selected={selected}
            selectedLevel={selectedLevel}
            selectedReady={selectedReady}
            handleUpgrade={handleUpgrade}
            addLog={addLog}
          />
        </section>
      </div>

      <section className="md:hidden">
        <SkillDetail
          selected={selected}
          selectedLevel={selectedLevel}
          selectedReady={selectedReady}
          handleUpgrade={handleUpgrade}
          addLog={addLog}
        />
      </section>

      <section>
        <div className="section-title">함선 & 승무원 시너지</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {synergyCards.map((card) => {
            const tone = branchTone[card.branch];
            return (
              <div key={card.label} className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
                <div className={`font-semibold ${tone.text}`}>{card.label}</div>
                <div className="mt-2 text-lg font-bold text-slate-50">{card.value}</div>
                <div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: "55%" }} /></div>
                <div className="mt-1 text-xs text-slate-500">{card.progress}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="section-title">스킬 요약</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {totals.map((item) => (
                <div key={item.id} className="flex justify-between rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2">
                  <span>{item.label}</span><span className="hud-value">{item.used} / {item.max}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title">추천 빌드</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {buildPresets.map((build) => {
                const tone = branchTone[build.branch];
                return (
                  <button key={build.title} className={`rounded border ${tone.border} bg-slate-950/60 p-3 text-left`} onClick={() => addLog(`추천 빌드 적용 후보: ${build.title}`)}>
                    <div className={`font-bold ${tone.text}`}>{build.title}</div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{build.desc}</p>
                    <div className="secondary-button mt-3 w-full">적용</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SkillDetail({ selected, selectedLevel, selectedReady, handleUpgrade, addLog }) {
  return (
    <>
      <div className="section-title">선택된 스킬</div>
      <div className="mt-4 rounded border border-emerald-400/30 bg-emerald-400/10 p-4">
        <div className="grid h-20 w-20 place-items-center rounded-full border border-emerald-300/60 bg-emerald-400/10 text-emerald-200">
          <Radar size={36} />
        </div>
        <div className="mt-4 text-2xl font-bold text-slate-50">{selected.name}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          <span className="hud-chip hud-chip-success">Lv {selectedLevel} / {selected.maxLevel}</span>
          <span className="hud-chip">{skillBranches.find((branch) => branch.id === selected.branch)?.label}</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-300">{selected.desc}</p>
      </div>

      <div className="mt-4 space-y-3">
        <DetailBlock title="현재 효과" items={selected.bonus.map((bonus) => `${bonus} · Lv ${selectedLevel}`)} />
        <DetailBlock title="필요 조건" items={[`사용 포인트 ${selected.cost}`, selected.requires ? `선행 스킬: ${getSkillById(selected.requires)?.name ?? selected.requires}` : "선행 스킬 없음"]} />
      </div>

      <button className="primary-button mt-4 w-full" disabled={!selectedReady} onClick={handleUpgrade}>강화</button>
      <button className="secondary-button mt-2 w-full" onClick={() => addLog(`${selected.name} 상세 효과를 확인했습니다.`)}>효과 확인</button>
    </>
  );
}

function canUpgrade(skill, levels, availablePoints) {
  const level = levels[skill.id] ?? 0;
  if (level >= skill.maxLevel) return false;
  if (availablePoints < skill.cost) return false;
  if (skill.requires && (levels[skill.requires] ?? 0) <= 0) return false;
  return true;
}

function DetailBlock({ title, items }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
      <div className="hud-label">{title}</div>
      <div className="mt-2 space-y-1">
        {items.map((item) => <div key={item} className="text-sm text-slate-300">• {item}</div>)}
      </div>
    </div>
  );
}
