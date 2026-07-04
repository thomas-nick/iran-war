import type { InfographicEvent } from "../types";
import { infographicKindLabel } from "../lib/timelineUtils";

interface EventDetailPanelProps {
  event: InfographicEvent;
  onClose: () => void;
}

export function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
  return (
    <div className="event-detail-panel">
      <div className="event-detail-header">
        <span className={`event-detail-kind kind-${event.kind}`}>{infographicKindLabel(event.kind)}</span>
        <button type="button" className="event-detail-close" onClick={onClose} aria-label="Close event detail">
          ×
        </button>
      </div>
      <time className="event-detail-date">{event.dateLabel}</time>
      <h3>{event.title}</h3>
      <p className="event-detail-subtitle">{event.subtitle}</p>
      {event.weapons && event.weapons.length > 0 && (
        <p className="event-detail-weapons">
          <strong>Weapons reported:</strong> {event.weapons.join(" · ")}
        </p>
      )}
      {event.confidence && (
        <p className="event-detail-confidence">
          <strong>Confidence:</strong> {event.confidence}
        </p>
      )}
      {event.usTargeted && <p className="event-detail-tag">US bases targeted</p>}
      {event.isUsStrike && <p className="event-detail-tag">US strike event</p>}
    </div>
  );
}
