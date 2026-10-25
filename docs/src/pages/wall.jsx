// ai_edit: locked
// ai_edit_reviewed: 2026-04-27
// ai_edit_reviewer: ricCap

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Layout from '@theme/Layout';
import { useLocation } from '@docusaurus/router';

/**
 * The workshop "wall": one tile per participant pair.
 *
 * Each pair's Crossplane Composition produces a `frontend` (nginx
 * serving a ConfigMap-mounted index.html) and a `backend` (nginx
 * serving a ConfigMap-mounted JSON file). The per-pair HTTPRoute maps
 * `/team/<pair>/` to the frontend and `/team/<pair>/api/` to the
 * backend.
 *
 * Each tile embeds the pair's own page. That page is served by their
 * frontend nginx and fetches its content from their backend, so the
 * frontend/backend split the Composition builds is literally what you
 * are looking at — which rendering the JSON ourselves would bypass.
 *
 * The iframe src MUST include the trailing slash. Without it,
 * `./api/message` inside the iframe resolves to `/team/api/message`
 * and 404s.
 *
 * Three fetches per cycle:
 *   - `/api/tiles`     — the roster, whether each pair is serving yet,
 *                        and first-live timestamps.
 *   - `/api/dashboard` — the check matrix, polled more slowly, used to
 *                        label pairs who have not shipped yet.
 *   - `/team/<p>/api/message` per pair — fetched only to notice when it
 *                        changes. We do not render it; see the pulse
 *                        below.
 *
 * Arrivals and changes are animated, because the payoff of the whole
 * hour used to require someone pressing Refresh.
 *
 * Tile sizing: tiles are user-resizable (CSS `resize: both`) and a
 * global S/M/L preset sets the default for tiles the user hasn't
 * touched. Both per-tile sizes and the preset are persisted in
 * localStorage so a refresh keeps the layout. Presentation mode
 * (`/wall?present=1`) ignores both and fits the grid to the viewport.
 */

const PRESETS = {
  S: { w: 280, h: 220 },
  M: { w: 380, h: 320 },
  L: { w: 520, h: 440 },
};
const DEFAULT_PRESET = 'S';
const LS_DEFAULT = 'wall:tileSize:default';
const LS_TILE = (pair) => `wall:tileSize:${pair}`;

// Tile state and payloads are cheap to fetch, so they poll fast enough
// that an arrival lands while the room is still looking. The check
// matrix behind /api/dashboard is 16 checks per pair, so it polls at
// its own cache TTL instead.
const TILE_POLL_MS = 4000;
const STAGE_POLL_MS = 12000;
// How long an arrival stays in the banner.
const ARRIVAL_TOAST_MS = 6000;
// Spotlight dwell time in presentation mode.
const SPOTLIGHT_MS = 8000;

// Animations live in a stylesheet rather than inline styles because
// keyframes cannot be expressed inline, and because `prefers-reduced-
// motion` is the right place to switch them off wholesale.
const CSS = `
@keyframes wallArrive {
  from { opacity: 0; transform: scale(0.88); }
  60%  { opacity: 1; transform: scale(1.04); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes wallPulse {
  0%   { box-shadow: 0 0 0 0 var(--wall-pulse, rgba(37,99,235,0.55)); }
  100% { box-shadow: 0 0 0 18px rgba(0,0,0,0); }
}
@keyframes wallToast {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.wall-arrive { animation: wallArrive 520ms cubic-bezier(0.22, 1, 0.36, 1); }
.wall-pulse  { animation: wallPulse 900ms ease-out; }
.wall-toast  { animation: wallToast 240ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .wall-arrive, .wall-pulse, .wall-toast { animation: none; }
}
`;

const page = { padding: '1.5rem 2rem' };
const presentPage = { padding: '1rem 1.25rem', height: '100vh', display: 'flex', flexDirection: 'column' };

const header = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
  gap: '1rem',
  flexWrap: 'wrap',
};

const toolbar = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' };

const button = {
  padding: '6px 14px',
  border: 'none',
  borderRadius: '6px',
  background: 'var(--ifm-color-primary)',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
};

const presetButton = (active) => ({
  padding: '6px 12px',
  border: '1px solid var(--ifm-color-emphasis-300)',
  borderRadius: '6px',
  background: active ? 'var(--ifm-color-emphasis-800)' : 'var(--ifm-background-surface-color)',
  color: active ? 'var(--ifm-background-surface-color)' : 'var(--ifm-color-emphasis-800)',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
  minWidth: '38px',
});

const resetLink = {
  padding: '6px 10px',
  border: 'none',
  background: 'transparent',
  color: 'var(--ifm-link-color)',
  cursor: 'pointer',
  font: 'inherit',
  textDecoration: 'underline',
};

const tileWrap = { display: 'flex', flexWrap: 'wrap', gap: '1rem' };

const empty = {
  padding: '2rem',
  textAlign: 'center',
  color: 'var(--ifm-color-emphasis-700)',
  border: '1px dashed var(--ifm-color-emphasis-300)',
  borderRadius: '8px',
};

const errorBox = {
  padding: '1rem',
  color: 'var(--ifm-color-danger-contrast-foreground)',
  background: 'var(--ifm-color-danger-contrast-background)',
  border: '1px solid var(--ifm-color-danger)',
  borderRadius: '8px',
  marginBottom: '1rem',
};

function readJSON(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled — ignore */
  }
}

function Tile({
  pair,
  size,
  onResize,
  state,
  stageLabel,
  arrivalPosition,
  pulseKey,
  justArrived,
  present,
}) {
  const ref = useRef(null);
  const timer = useRef(null);
  const lastSize = useRef(size);

  useEffect(() => {
    lastSize.current = size;
  }, [size]);

  useEffect(() => {
    const el = ref.current;
    // Presentation mode sizes tiles from the grid, so there is nothing
    // to observe or persist.
    if (present || !el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const w = Math.round(box ? box.inlineSize : el.offsetWidth);
      const h = Math.round(box ? box.blockSize : el.offsetHeight);
      if (w === lastSize.current.w && h === lastSize.current.h) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onResize(pair, { w, h }), 150);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pair, onResize, present]);

  const live = state?.live;

  const frame = {
    boxSizing: 'border-box',
    // A dashed edge says "nothing here yet" without dimming the whole
    // tile, which used to make the pair's own name hard to read.
    border: live ? '1px solid var(--ifm-color-emphasis-300)' : '1px dashed var(--ifm-color-emphasis-400)',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'var(--ifm-background-surface-color)',
    boxShadow: live ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    ...(present
      ? { width: '100%', height: '100%', minWidth: 0, minHeight: 0 }
      : { width: `${size.w}px`, height: `${size.h}px`, minWidth: '200px', minHeight: '140px', resize: 'both' }),
  };

  const label = {
    padding: present ? '8px 12px' : '6px 10px',
    fontSize: present ? '1.05rem' : '0.82rem',
    fontWeight: 700,
    borderBottom: '1px solid var(--ifm-color-emphasis-300)',
    background: 'var(--ifm-color-emphasis-100)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
    flex: '0 0 auto',
  };

  const body = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: live ? 'transparent' : 'var(--ifm-color-emphasis-100)',
    color: 'var(--ifm-color-emphasis-700)',
  };

  const placeholderArea = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: present ? '1.2rem' : '0.85rem',
    minHeight: 0,
    overflow: 'hidden',
  };

  const rankPill = {
    fontSize: present ? '0.8rem' : '0.64rem',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '999px',
    background: 'var(--ifm-color-emphasis-200)',
    color: 'var(--ifm-color-emphasis-700)',
    flex: '0 0 auto',
  };

  return (
    <div
      ref={ref}
      style={frame}
      className={justArrived ? 'wall-arrive' : undefined}
    >
      <div style={label}>
        <a
          href={`/team/${pair}/`}
          target="_blank"
          rel="noreferrer"
          style={{
            color: 'inherit',
            textDecoration: 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`Open ${pair}'s own page`}
        >
          {pair}
        </a>
        {arrivalPosition ? (
          <span style={rankPill} title="Order this pair first went live">
            #{arrivalPosition}
          </span>
        ) : null}
      </div>

      {/* Remounting on pulseKey does double duty: it replays the pulse
          animation, and it reloads the iframe. The pair's page fetches
          its content once on load, so without the remount a tile would
          sit on stale content after module 6's change until somebody
          refreshed the whole wall. */}
      <div
        key={pulseKey}
        className={pulseKey ? 'wall-pulse' : undefined}
        style={body}
      >
        {live ? (
          <iframe
            title={pair}
            src={`/team/${pair}/`}
            style={{ width: '100%', flex: 1, border: 'none', background: 'transparent' }}
            loading="lazy"
          />
        ) : (
          <div style={{ ...placeholderArea, flexDirection: 'column', gap: '0.3rem' }}>
            <div style={{ fontWeight: 700, fontSize: present ? '1.2rem' : '0.95rem' }}>Not live yet</div>
            <div style={{ fontSize: present ? '1rem' : '0.8rem', opacity: 0.8 }}>
              {stageLabel || state?.details || 'waiting for this pair'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Derives a human stage label per pair from the dashboard's check
 * matrix. `stageReached` is the count of contiguous passing checks from
 * the start, so the label of the last passed check is where the pair
 * actually is. Reusing the dashboard means the wall needs no second
 * notion of progress.
 */
function stageLabels(dashboard) {
  if (!dashboard?.pairs || !dashboard?.checks) return {};
  const out = {};
  for (const row of dashboard.pairs) {
    const reached = row.stageReached || 0;
    out[row.id] = reached > 0 ? dashboard.checks[reached - 1]?.label : 'not started';
  }
  return out;
}

export default function Wall() {
  const location = useLocation();
  const present = useMemo(
    () => new URLSearchParams(location.search || '').get('present') === '1',
    [location.search],
  );

  const [tiles, setTiles] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [err, setErr] = useState(null);
  const [paused, setPaused] = useState(false);
  const [presetName, setPresetName] = useState(DEFAULT_PRESET);
  const [sizes, setSizes] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [arrivals, setArrivals] = useState([]);
  const [pulses, setPulses] = useState({});
  const [spotlight, setSpotlight] = useState(false);
  const [spotIndex, setSpotIndex] = useState(0);

  // Previous-poll bookkeeping. `seeded` keeps the first successful poll
  // quiet: pairs that were already live when the page opened are not
  // arrivals, and announcing them all would bury the real ones.
  const prevLive = useRef(new Set());
  const prevPayloads = useRef({});
  const seeded = useRef(false);

  useEffect(() => {
    const storedPreset = readJSON(LS_DEFAULT, null);
    if (storedPreset && PRESETS[storedPreset]) setPresetName(storedPreset);
    setHydrated(true);
  }, []);

  const loadTiles = useCallback(async () => {
    try {
      const res = await fetch('/api/tiles');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.tiles) ? data.tiles : [];
      setErr(null);
      setTiles(rows);

      const liveNow = new Set(rows.filter((r) => r.live).map((r) => r.id));
      if (seeded.current) {
        const fresh = [...liveNow].filter((id) => !prevLive.current.has(id));
        if (fresh.length) {
          const stamped = fresh.map((id) => ({ id, at: Date.now() }));
          setArrivals((prev) => [...prev, ...stamped]);
        }
      }
      prevLive.current = liveNow;
      seeded.current = true;

      // Fetch each live pair's payload straight from their own backend.
      // Not-live pairs are skipped: their Service has no endpoints, so
      // the request would just wait for the gateway to give up.
      const results = await Promise.all(
        rows
          .filter((r) => r.live)
          .map(async (r) => {
            try {
              const pr = await fetch(`/team/${r.id}/api/message`, { cache: 'no-store' });
              if (!pr.ok) return [r.id, null];
              return [r.id, JSON.parse(await pr.text())];
            } catch {
              return [r.id, null];
            }
          }),
      );

      const next = {};
      for (const [id, payload] of results) if (payload) next[id] = payload;

      // Pulse any tile whose payload actually changed since last poll.
      const changed = [];
      for (const [id, payload] of Object.entries(next)) {
        const before = prevPayloads.current[id];
        if (before && JSON.stringify(before) !== JSON.stringify(payload)) changed.push(id);
      }
      if (changed.length) {
        setPulses((prev) => {
          const bumped = { ...prev };
          for (const id of changed) bumped[id] = (bumped[id] || 0) + 1;
          return bumped;
        });
      }
      prevPayloads.current = next;
    } catch (e) {
      setErr(e.message || String(e));
      setTiles((prev) => prev ?? []);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) return;
      setDashboard(await res.json());
    } catch {
      /* ghost-tile labels are a nicety; a failure here is not an error */
    }
  }, []);

  useEffect(() => {
    loadTiles();
    loadDashboard();
  }, [loadTiles, loadDashboard]);

  useEffect(() => {
    if (paused) return undefined;
    const a = setInterval(loadTiles, TILE_POLL_MS);
    const b = setInterval(loadDashboard, STAGE_POLL_MS);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [paused, loadTiles, loadDashboard]);

  // Expire arrival toasts.
  useEffect(() => {
    if (!arrivals.length) return undefined;
    const id = setTimeout(() => {
      setArrivals((prev) => prev.filter((a) => Date.now() - a.at < ARRIVAL_TOAST_MS));
    }, 1000);
    return () => clearTimeout(id);
  }, [arrivals]);

  useEffect(() => {
    if (!tiles) return;
    const next = {};
    for (const row of tiles) {
      const stored = readJSON(LS_TILE(row.id), null);
      if (stored && Number.isFinite(stored.w) && Number.isFinite(stored.h)) next[row.id] = stored;
    }
    setSizes((prev) => ({ ...next, ...prev }));
  }, [tiles]);

  const handleResize = useCallback((pair, size) => {
    setSizes((prev) => ({ ...prev, [pair]: size }));
    writeJSON(LS_TILE(pair), size);
  }, []);

  const choosePreset = useCallback((name) => {
    setPresetName(name);
    writeJSON(LS_DEFAULT, name);
  }, []);

  const resetAll = useCallback(() => {
    if (typeof window !== 'undefined' && tiles) {
      for (const row of tiles) window.localStorage.removeItem(LS_TILE(row.id));
    }
    setSizes({});
  }, [tiles]);

  const labels = useMemo(() => stageLabels(dashboard), [dashboard]);

  // Arrival order, derived from the validator's first-live timestamps.
  const positions = useMemo(() => {
    const withTimes = (tiles || [])
      .filter((r) => r.firstSeenAt)
      .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
    const out = {};
    withTimes.forEach((r, i) => {
      out[r.id] = i + 1;
    });
    return out;
  }, [tiles]);

  const liveCount = (tiles || []).filter((r) => r.live).length;

  // Spotlight cycles through live tiles in presentation mode.
  useEffect(() => {
    if (!present || !spotlight || liveCount === 0) return undefined;
    const id = setInterval(() => setSpotIndex((i) => i + 1), SPOTLIGHT_MS);
    return () => clearInterval(id);
  }, [present, spotlight, liveCount]);

  const defaultSize = PRESETS[presetName] || PRESETS[DEFAULT_PRESET];

  const liveTiles = (tiles || []).filter((r) => r.live);
  const spotPair = spotlight && liveTiles.length ? liveTiles[spotIndex % liveTiles.length] : null;
  const shown = spotPair ? [spotPair] : tiles || [];

  // Presentation mode fits the grid to the tile count so N tiles fill
  // the projector exactly, instead of leaving a ragged last row.
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(shown.length, 1))));
  const gridStyle = present
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(0, 1fr)',
        gap: '0.75rem',
        flex: 1,
        minHeight: 0,
      }
    : tileWrap;

  const recentArrivals = arrivals.filter((a) => Date.now() - a.at < ARRIVAL_TOAST_MS);

  return (
    <Layout title="Wall" description="All participant tiles, one grid.">
      <style>{CSS}</style>
      {present && (
        <style>{`.navbar { display: none !important; } footer { display: none !important; }`}</style>
      )}
      <main style={present ? presentPage : page}>
        <div style={header}>
          <h1 style={{ margin: 0, fontSize: present ? '1.4rem' : undefined }}>
            Workshop wall{' '}
            <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--ifm-color-emphasis-600)' }}>
              {liveCount}/{(tiles || []).length} live
            </span>
          </h1>
          <div style={toolbar}>
            {!present &&
              Object.keys(PRESETS).map((name) => (
                <button
                  key={name}
                  style={presetButton(name === presetName)}
                  onClick={() => choosePreset(name)}
                  title={`${PRESETS[name].w} × ${PRESETS[name].h}`}
                >
                  {name}
                </button>
              ))}
            {!present && (
              <button style={resetLink} onClick={resetAll}>
                Reset sizes
              </button>
            )}
            {present && (
              <button style={presetButton(spotlight)} onClick={() => setSpotlight((s) => !s)} title="Cycle one tile at a time">
                Spotlight
              </button>
            )}
            <button style={presetButton(paused)} onClick={() => setPaused((p) => !p)} title="Freeze the wall mid-explanation">
              {paused ? 'Paused' : 'Live'}
            </button>
            <button style={button} onClick={loadTiles}>
              Refresh
            </button>
          </div>
        </div>

        {recentArrivals.length > 0 && (
          <div
            className="wall-toast"
            style={{
              marginBottom: '1rem',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              background: 'var(--ifm-color-success-contrast-background)',
              color: 'var(--ifm-color-success-contrast-foreground)',
              border: '1px solid var(--ifm-color-success)',
              fontWeight: 600,
            }}
          >
            {recentArrivals.map((a) => a.id).join(', ')} just went live 🎉
          </div>
        )}

        {err && <div style={errorBox}>Could not load tiles: {err}</div>}

        {tiles === null && <div style={empty}>Loading pairs…</div>}

        {tiles !== null && tiles.length === 0 && !err && (
          <div style={empty}>
            No pairs registered yet. Once someone's vcluster is up, their tile will show up here.
          </div>
        )}

        {tiles !== null && tiles.length > 0 && hydrated && (
          <div style={gridStyle}>
            {shown.map((row) => (
              <Tile
                key={row.id}
                pair={row.id}
                size={sizes[row.id] || defaultSize}
                onResize={handleResize}
                state={row}
                stageLabel={labels[row.id]}
                arrivalPosition={positions[row.id]}
                pulseKey={pulses[row.id] || 0}
                justArrived={recentArrivals.some((a) => a.id === row.id)}
                present={present}
              />
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}
