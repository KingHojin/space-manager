import { GitBranch, Lock, Sparkles } from "lucide-react";

const skillBranches = [
  {
    id: "command",
    name: "지휘",
    summary: "항해 속도와 이벤트 대응력을 높입니다.",
    nodes: ["항로 계산", "긴급 명령", "함대 전술"],
  },
  {
    id: "science",
    name: "과학",
    summary: "탐험 스캔과 행성 관측 보상을 강화합니다.",
    nodes: ["분광 분석", "행성학", "심우주 관측"],
  },
  {
    id: "engineering",
    name: "공학",
    summary: "자원 효율과 함선 모듈 성능을 개선합니다.",
    nodes: ["연료 최적화", "장갑 보수", "자동 정비"],
  },
];

export default function SkillTreeModal() {
  return (
    <div className="space-y-4">
      <div className="rounded border border-cyan-400/30 bg-cyan-400/10 p-4">
        <div className="flex items-center gap-2 font-bold text-cyan-100">
          <Sparkles size={18} />
          스킬 포인트 0
        </div>
        <p className="mt-2 text-sm text-slate-400">탐험, 관측, 정거장 의뢰 보상으로 스킬 포인트를 획득하면 노드를 해금할 수 있습니다.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {skillBranches.map((branch) => (
          <section key={branch.id} className="overflow-visible">
            <div className="section-title">
              <GitBranch size={18} />
              {branch.name}
            </div>
            <p className="mt-2 text-sm text-slate-400">{branch.summary}</p>
            <div className="mt-4 space-y-3">
              {branch.nodes.map((node, index) => (
                <div key={node} className={`skill-node ${index === 0 ? "skill-node-ready" : ""}`}>
                  <span>{node}</span>
                  {index === 0 ? <span className="text-xs text-cyan-200">준비됨</span> : <Lock size={14} />}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
