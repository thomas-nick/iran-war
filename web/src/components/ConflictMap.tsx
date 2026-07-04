import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapArc, MapData } from "../types";

const CENTER: LatLngExpression = [31.5, 48];

const ARC_COLORS: Record<string, string> = {
  israel_targeted: "#c0392b",
  us_targeted: "#3498db",
};

const MARKER_COLORS: Record<string, string> = {
  us_base: "#3498db",
  israeli_target: "#2980b9",
  coalition_strike: "#e67e22",
  isw_strike: "#27ae60",
};

const ISW_CONFIDENCE_COLORS: Record<string, string> = {
  confirmed: "#27ae60",
  reported: "#2980b9",
  partial: "#f1c40f",
  unverified: "#e74c3c",
  unknown: "#95a5a6",
};

interface ConflictMapProps {
  mapData: MapData;
  asOfDate?: string;
  playbackMode?: boolean;
}

function isOnOrBefore(date: string | undefined, asOf: string | undefined): boolean {
  if (!asOf) return true;
  if (!date) return true;
  return date.slice(0, 10) <= asOf.slice(0, 10);
}

export function ConflictMap({ mapData, asOfDate, playbackMode }: ConflictMapProps) {
  const [showArcs, setShowArcs] = useState(true);
  const [showBases, setShowBases] = useState(true);
  const [showCoalition, setShowCoalition] = useState(true);
  const [showIsw, setShowIsw] = useState(true);
  const [iswConfirmedOnly, setIswConfirmedOnly] = useState(true);
  const [usArcsOnly, setUsArcsOnly] = useState(false);

  const filteredArcs = useMemo(() => {
    return mapData.arcs.filter((a) => {
      if (usArcsOnly && !a.usBasesTargeted) return false;
      if (asOfDate && a.launchTimeUtc && !isOnOrBefore(a.launchTimeUtc, asOfDate)) return false;
      return true;
    });
  }, [mapData.arcs, usArcsOnly, asOfDate]);

  const filteredMarkers = useMemo(() => {
    return mapData.markers.filter((m) => {
      if (m.type === "us_base" || m.type === "israeli_target") return showBases;
      if (m.type === "coalition_strike") {
        if (!showCoalition) return false;
        if (asOfDate && m.date && !isOnOrBefore(m.date, asOfDate)) return false;
        return true;
      }
      if (m.type === "isw_strike") {
        if (!showIsw) return false;
        if (iswConfirmedOnly && m.confidence !== "confirmed") return false;
        if (asOfDate && m.date && !isOnOrBefore(m.date, asOfDate)) return false;
        return true;
      }
      return true;
    });
  }, [mapData.markers, showBases, showCoalition, showIsw, iswConfirmedOnly, asOfDate]);

  const iswCount = mapData.markers.filter((m) => m.type === "isw_strike").length;
  const iswVisibleCount = filteredMarkers.filter((m) => m.type === "isw_strike").length;

  return (
    <div className={`map-section${playbackMode ? " map-section-playback" : ""}`}>
      {playbackMode && asOfDate && (
        <div className="playback-map-badge">Showing events through {asOfDate}</div>
      )}
      <div className="map-legend">
        <label><input type="checkbox" checked={showArcs} onChange={(e) => setShowArcs(e.target.checked)} /> Iran attack arcs ({filteredArcs.length})</label>
        <label><input type="checkbox" checked={usArcsOnly} onChange={(e) => setUsArcsOnly(e.target.checked)} /> US-targeted arcs only</label>
        <label><input type="checkbox" checked={showBases} onChange={(e) => setShowBases(e.target.checked)} /> Bases & Israeli targets</label>
        <label><input type="checkbox" checked={showCoalition} onChange={(e) => setShowCoalition(e.target.checked)} /> Curated campaign strikes</label>
        <label><input type="checkbox" checked={showIsw} onChange={(e) => setShowIsw(e.target.checked)} /> ISW/CTP points ({iswVisibleCount}{iswConfirmedOnly ? " confirmed" : ""})</label>
        {showIsw && (
          <label><input type="checkbox" checked={iswConfirmedOnly} onChange={(e) => setIswConfirmedOnly(e.target.checked)} /> Confirmed only ({iswCount} total)</label>
        )}
        <span className="legend-swatch" style={{ background: ARC_COLORS.israel_targeted }} /> → Israel
        <span className="legend-swatch" style={{ background: ARC_COLORS.us_targeted }} /> → US/Gulf
        <span className="legend-swatch legend-coalition" /> Campaign strike
        <span className="legend-swatch" style={{ background: ISW_CONFIDENCE_COLORS.confirmed }} /> ISW confirmed
      </div>
      <div className="map-container">
        <MapContainer center={CENTER} zoom={5} scrollWheelZoom className="leaflet-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {showArcs &&
            filteredArcs.map((arc: MapArc) => (
              <Polyline
                key={arc.id}
                positions={[
                  [arc.from.lat, arc.from.lon],
                  [arc.to.lat, arc.to.lon],
                ]}
                pathOptions={{
                  color: arc.usBasesTargeted ? ARC_COLORS.us_targeted : ARC_COLORS.israel_targeted,
                  weight: arc.usBasesTargeted ? 2.5 : 1.5,
                  opacity: 0.55,
                }}
              >
                <Popup>
                  <strong>{arc.operation?.toUpperCase()} Wave {arc.waveNumber}</strong>
                  <br />
                  {arc.payload || "Iran → target"}
                  {arc.usBasesTargeted && <><br /><em>US bases targeted</em></>}
                </Popup>
              </Polyline>
            ))}
          {filteredMarkers.map((m) => {
            const isIsw = m.type === "isw_strike";
            const color = isIsw
              ? ISW_CONFIDENCE_COLORS[m.confidence || "unknown"] || MARKER_COLORS.isw_strike
              : MARKER_COLORS[m.type] || "#fff";
            return (
            <CircleMarker
              key={m.id}
              center={[m.lat, m.lon]}
              radius={m.type === "coalition_strike" ? 9 : isIsw ? 4 : 6}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isIsw ? 0.7 : 0.85,
                weight: isIsw ? 1 : 2,
              }}
            >
              <Popup>
                <strong>{m.label}</strong>
                {m.actor && <><br />{m.actor}</>}
                {m.date && <><br />{m.date}</>}
                {m.eventType && <><br /><em>{m.eventType}</em></>}
                {m.description && <><br />{m.description.slice(0, 200)}</>}
                {m.weapons && m.weapons.length > 0 && (
                  <><br /><em>{m.weapons.slice(0, 2).join("; ")}</em></>
                )}
              </Popup>
            </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
