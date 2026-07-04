import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InfographicEvent, MapData } from "../types";
import {
  DAY_MS,
  PLAYBACK_JUMPS,
  TIMELINE_END,
  TIMELINE_START,
  formatTimelineDate,
  sortKeyToMs,
} from "../lib/timelineUtils";
import { ConflictMap } from "./ConflictMap";
import { EventDetailPanel } from "./EventDetailPanel";
import { TimelineInfographic } from "./TimelineInfographic";

interface ConflictPlaybackProps {
  mapData: MapData;
  events: InfographicEvent[];
  showWaves: boolean;
  showCoalition: boolean;
  showNarrative: boolean;
}

export function ConflictPlayback({
  mapData,
  events,
  showWaves,
  showCoalition,
  showNarrative,
}: ConflictPlaybackProps) {
  const [asOfMs, setAsOfMs] = useState(TIMELINE_END);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(7);
  const [selectedEvent, setSelectedEvent] = useState<InfographicEvent | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const asOfDate = useMemo(() => new Date(asOfMs).toISOString().slice(0, 10), [asOfMs]);

  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.kind === "iran_wave" && !showWaves) return false;
      if (e.kind === "coalition_strike" && !showCoalition) return false;
      if (e.kind === "narrative" && !showNarrative) return false;
      return sortKeyToMs(e.sortKey) <= asOfMs;
    });
  }, [events, asOfMs, showWaves, showCoalition, showNarrative]);

  const latestEvents = useMemo(
    () =>
      [...visibleEvents]
        .sort((a, b) => sortKeyToMs(b.sortKey) - sortKeyToMs(a.sortKey))
        .slice(0, 5),
    [visibleEvents],
  );

  const jumpTo = useCallback((ms: number) => {
    setPlaying(false);
    setAsOfMs(Math.min(TIMELINE_END, Math.max(TIMELINE_START, ms)));
    setSelectedEvent(null);
  }, []);

  const tick = useCallback(
    (now: number) => {
      if (!lastTickRef.current) lastTickRef.current = now;
      const elapsed = now - lastTickRef.current;
      if (elapsed >= 120) {
        lastTickRef.current = now;
        setAsOfMs((prev) => {
          const next = prev + DAY_MS * speed;
          if (next >= TIMELINE_END) {
            setPlaying(false);
            return TIMELINE_END;
          }
          return next;
        });
      }
      if (playing) {
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    [playing, speed],
  );

  useEffect(() => {
    if (playing) {
      lastTickRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, tick]);

  const progress = ((asOfMs - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;

  const handleSelectEvent = (event: InfographicEvent | null) => {
    setSelectedEvent(event);
    if (event) {
      setPlaying(false);
      setAsOfMs(sortKeyToMs(event.sortKey));
    }
  };

  return (
    <div className="playback-section">
      <div className="playback-controls">
        <button type="button" className="export-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="export-btn playback-secondary"
          onClick={() => jumpTo(TIMELINE_START)}
        >
          Reset
        </button>
        <label className="playback-speed">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={1}>1 day / tick</option>
            <option value={3}>3 days / tick</option>
            <option value={7}>1 week / tick</option>
            <option value={14}>2 weeks / tick</option>
            <option value={30}>1 month / tick</option>
          </select>
        </label>
        <div className="playback-scrubber">
          <input
            type="range"
            min={TIMELINE_START}
            max={TIMELINE_END}
            step={DAY_MS}
            value={asOfMs}
            onChange={(e) => {
              setPlaying(false);
              setAsOfMs(Number(e.target.value));
              setSelectedEvent(null);
            }}
            aria-label="Timeline scrubber"
          />
          <div className="playback-meta">
            <strong>{formatTimelineDate(asOfMs)}</strong>
            <span>
              {visibleEvents.length} events visible · {Math.round(progress)}% through conflict
            </span>
          </div>
        </div>
      </div>

      <div className="playback-jumps">
        <span className="playback-jumps-label">Jump to:</span>
        {PLAYBACK_JUMPS.map((jump) => (
          <button
            key={jump.label}
            type="button"
            className={`phase-chip compact${Math.abs(asOfMs - jump.ms) < DAY_MS ? " active" : ""}`}
            onClick={() => jumpTo(jump.ms)}
          >
            {jump.label}
          </button>
        ))}
      </div>

      {latestEvents.length > 0 && (
        <div className="playback-ticker">
          {latestEvents.map((e) => (
            <button
              type="button"
              className={`playback-ticker-item kind-${e.kind}${selectedEvent?.id === e.id ? " selected" : ""}`}
              key={e.id}
              onClick={() => handleSelectEvent(e)}
            >
              <time>{e.dateLabel}</time>
              <span>{e.title}</span>
            </button>
          ))}
        </div>
      )}

      {selectedEvent && (
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      <ConflictMap mapData={mapData} asOfDate={asOfDate} playbackMode />

      <TimelineInfographic
        events={events}
        showWaves={showWaves}
        showCoalition={showCoalition}
        showNarrative={showNarrative}
        asOfDate={asOfDate}
        playheadPercent={progress}
        selectedEventId={selectedEvent?.id ?? null}
        onSelectEvent={handleSelectEvent}
      />
    </div>
  );
}
