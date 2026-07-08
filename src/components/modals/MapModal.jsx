import { nodeToZone } from "../../systems/navigationSystem";
import { useNavStore } from "../../stores/navStore";
import PlanetCanvas from "../three/LazyPlanetCanvas";

// Data source: navStore's live sector/currentNodeId/discovered — NOT
// explorationStore's currentZoneId/discoveredZoneIds, which are dead fields
// frozen at their initial values since Phase 18-C (see explorationStore.js
// and Market.jsx for the same note). Using the dead fields here always drew
// the ship at "anchor-station" regardless of actual position. See
// Overview.jsx / Exploration.jsx for the same sector.nodes.map(nodeToZone)
// pattern already used elsewhere in the app.
export default function MapModal() {
  const sector = useNavStore((state) => state.sector);
  const currentNodeId = useNavStore((state) => state.currentNodeId);
  const discovered = useNavStore((state) => state.discovered ?? []);
  const zones = sector.nodes.map(nodeToZone);
  const discoveredSet = new Set(discovered);
  return (
    <div className="map-grid">
      {zones.map((zone) => {
        const visible = discoveredSet.has(zone.id);
        const active = currentNodeId === zone.id;
        return (
          <div key={zone.id} className={`zone-node ${active ? "zone-node-active" : ""} ${!visible ? "zone-node-hidden" : ""}`}>
            {visible && (
              <div className="mb-2 h-20 w-full overflow-hidden rounded">
                <PlanetCanvas zone={zone} interactive={false} />
              </div>
            )}
            <span className="font-semibold">{visible ? zone.name : "미발견"}</span>
            <span className="text-xs text-slate-400">{visible ? `거리 ${zone.distance}` : "안개"}</span>
          </div>
        );
      })}
    </div>
  );
}
