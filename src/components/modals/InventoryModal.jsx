import Badge from "../common/Badge";
import { useInventoryStore } from "../../stores/inventoryStore";

export default function InventoryModal() {
  const items = useInventoryStore((state) => state.items);
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <Badge rarity={item.rarity}>{item.rarity}</Badge>
            <span className="font-mono text-sm text-slate-300">x{item.qty}</span>
          </div>
          <div className="font-semibold text-slate-50">{item.name}</div>
        </div>
      ))}
    </div>
  );
}
