import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InfographicEvent, MapData } from "../types";
import { ConflictMap } from "./ConflictMap";
import { TimelineInfographic } from "./TimelineInfographic";

const PLAYBACK_START = new Date("2023-10-01T00:00:00Z").getTime();
const PLAYBACK_END = new Date("2026-05-24T00:00:00Z").getTime();
const DAY_MS = 86_400_000;

function sortKeyToMs(sortKey: string): number {
  const iso = sortKey.length >= 10 ? sortKey.slice(0, 10) : sortKey;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? PLAYBACK_START : t;
}

function formatPlayhead(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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
  const [asOfMs, setAsOfMs] = useState(PLAYBACK_START);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
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
        .slice(0, 4),
    [visibleEvents],
  );

  const tick = useCallback(
    (now: number) => {
      if (!lastTickRef.current) lastTickRef.current = now;
      const elapsed = now - lastTickRef.current;
      if (elapsed >= 120) {
        lastTickRef.current = now;
        setAsOfMs((prev) => {
          const next = prev + DAY_MS * speed;
          if (next >= PLAYBACK_END) {
            setPlaying(false);
            return PLAYBACK_END;
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

  const progress = ((asOfMs - PLAYBACK_START) / (PLAYBACK_END - PLAYBACK_START)) * 100;

  return (
    <div className="playback-section">
      <div className="playback-controls">
        <button type="button" className="export-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="export-btn playback-secondary"
          onClick={() => {
            setPlaying(false);
            setAsOfMs(PLAYBACK_START);
          }}
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
          </select>
        </label>
        <div className="playback-scrubber">
          <input
            type="range"
            min={PLAYBACK_START}
            max={PLAYBACK_END}
            step={DAY_MS}
            value={asOfMs}
            onChange={(e) => {
              setPlaying(false);
              setAsOfMs(Number(e.target.value));
            }}
            aria-label="Timeline scrubber"
          />
          <div className="playback-meta">
            <strong>{formatPlayhead(asOfMs)}</strong>
            <span>
              {visibleEvents.length} events visible · {Math.round(progress)}% through conflict
            </span>
          </div>
        </div>
      </div>

      {latestEvents.length > 0 && (
        <div className="playback-ticker">
          {latestEvents.map((e) => (
            <div className={`playback-ticker-item kind-${e.kind}`} key={e.id}>
              <time>{e.dateLabel}</time>
              <span>{e.title}</span>
            </div>
          ))}
        </div>
      )}

      <ConflictMap mapData={mapData} asOfDate={asOfDate} playbackMode />

      <TimelineInfographic
        events={events}
        showWaves={showWaves}
        showCoalition={showCoalition}
        showNarrative={showNarrative}
        asOfDate={asOfDate}
        playheadPercent={progress}
      />
    </div>
  );
}
