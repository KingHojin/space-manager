import { Archive, BarChart2, BookOpen, GitBranch, Map, Save, ScrollText } from "lucide-react";

const dockItems = [
  { id: "stats", label: "스탯", icon: BarChart2 },
  { id: "inventory", label: "아이템", icon: Archive },
  { id: "map", label: "지도", icon: Map },
  { id: "cards", label: "카드", icon: BookOpen },
  { id: "log", label: "로그", icon: ScrollText },
  { id: "save", label: "저장", icon: Save },
  { id: "skills", label: "스킬트리", icon: GitBranch },
];

export default function BottomDock({ onOpen }) {
  return (
    <div className="border-t border-slate-700/80 bg-slate-950 px-3 py-2 sm:h-16 sm:px-5 sm:py-0">
      <div className="mx-auto grid max-w-4xl grid-cols-4 gap-2 sm:flex sm:h-full sm:items-center sm:justify-center">
        {dockItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className="dock-button" onClick={() => onOpen(item.id)} title={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
