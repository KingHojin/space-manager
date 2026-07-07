import { getAllZones } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";
import PlanetCanvas from "../three/LazyPlanetCanvas";

export default function MapModal() {
  const zones = getAllZones();
  const { currentZoneId, discoveredZoneIds } = useExplorationStore();
  return (
    <div className="map-grid">
      {zones.map((zone) => {
        const visible = discoveredZoneIds.includes(zone.id);
        const active = currentZoneId === zone.id;
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
