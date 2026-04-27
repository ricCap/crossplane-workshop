import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';

/**
 * The workshop "wall": one iframe per participant pair, each pointing at
 * `/team/<pair>/`. Inside the iframe, the pair's frontend (an nginx
 * serving a ConfigMap-mounted index.html produced by their Crossplane
 * Composition) does a relative `fetch('./api/message')` which resolves
 * to `/team/<pair>/api/message` — same origin, no CORS.
 *
 * The pair list comes from `GET /api/pairs`, which the validator
 * exposes by listing `participant-*` namespaces on the management
 * cluster. We don't poll — a manual refresh button is enough for
 * workshop pacing (new tiles appear when people apply their claim).
 *
 * The iframe src MUST include the trailing slash. Without it,
 * `./api/message` inside the iframe resolves to `/team/api/message`
 * and 404s — see PLAN.md §Risks #2.
 *
 * Tile sizing: tiles are user-resizable (CSS `resize: both`) and a
 * global S/M/L preset sets the default for tiles the user hasn't
 * touched. Both per-tile sizes and the preset are persisted in
 * localStorage so a refresh keeps the layout.
 */

const PRESETS = {
  S: { w: 280, h: 220 },
  M: { w: 380, h: 320 },
  L: { w: 520, h: 440 },
};
const DEFAULT_PRESET = 'S';
const LS_DEFAULT = 'wall:tileSize:default';
const LS_TILE = (pair) => `wall:tileSize:${pair}`;

const page = {
  padding: '1.5rem 2rem',
};

const header = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
  gap: '1rem',
  flexWrap: 'wrap',
};

const toolbar = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const button = {
  padding: '6px 14px',
  border: 'none',
  borderRadius: '6px',
  background: '#2563eb',
  color: 'white',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
};

const presetButton = (active) => ({
  padding: '6px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  background: active ? '#1f2937' : '#fff',
  color: active ? '#fff' : '#1f2937',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
  minWidth: '38px',
});

const resetLink = {
  padding: '6px 10px',
  border: 'none',
  background: 'transparent',
  color: '#2563eb',
  cursor: 'pointer',
  font: 'inherit',
  textDecoration: 'underline',
};

const tileWrap = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1rem',
};

const tileStyle = ({ w, h }) => ({
  boxSizing: 'border-box',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden',
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  width: `${w}px`,
  height: `${h}px`,
  minWidth: '200px',
  minHeight: '140px',
  resize: 'both',
});

const tileLabel = {
  padding: '6px 10px',
  fontSize: '0.85rem',
  fontWeight: 600,
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
};

const tileFrame = {
  width: '100%',
  flex: 1,
  border: 'none',
  background: '#fff',
};

const empty = {
  padding: '2rem',
  textAlign: 'center',
  color: '#6b7280',
  border: '1px dashed #d1d5db',
  borderRadius: '8px',
};

const error = {
  padding: '1rem',
  color: '#991b1b',
  background: '#fee2e2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
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

function Tile({ pair, size, onResize }) {
  const ref = useRef(null);
  const timer = useRef(null);
  const lastSize = useRef(size);

  useEffect(() => {
    lastSize.current = size;
  }, [size]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
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
  }, [pair, onResize]);

  return (
    <div ref={ref} style={tileStyle(size)}>
      <div style={tileLabel}>{pair}</div>
      <iframe
        title={pair}
        src={`/team/${pair}/`}
        style={tileFrame}
        loading="lazy"
      />
    </div>
  );
}

export default function Wall() {
  const [pairs, setPairs] = useState(null);
  const [err, setErr] = useState(null);
  const [presetName, setPresetName] = useState(DEFAULT_PRESET);
  const [sizes, setSizes] = useState({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedPreset = readJSON(LS_DEFAULT, null);
    if (storedPreset && PRESETS[storedPreset]) setPresetName(storedPreset);
    setHydrated(true);
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch('/api/pairs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPairs(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || String(e));
      setPairs([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!pairs) return;
    const next = {};
    for (const pair of pairs) {
      const stored = readJSON(LS_TILE(pair), null);
      if (stored && Number.isFinite(stored.w) && Number.isFinite(stored.h)) {
        next[pair] = stored;
      }
    }
    setSizes((prev) => ({ ...next, ...prev }));
  }, [pairs]);

  const handleResize = useCallback((pair, size) => {
    setSizes((prev) => ({ ...prev, [pair]: size }));
    writeJSON(LS_TILE(pair), size);
  }, []);

  const choosePreset = useCallback((name) => {
    setPresetName(name);
    writeJSON(LS_DEFAULT, name);
  }, []);

  const resetAll = useCallback(() => {
    if (typeof window !== 'undefined' && pairs) {
      for (const pair of pairs) window.localStorage.removeItem(LS_TILE(pair));
    }
    setSizes({});
  }, [pairs]);

  const defaultSize = PRESETS[presetName] || PRESETS[DEFAULT_PRESET];

  return (
    <Layout title="Wall" description="All participant tiles, one grid.">
      <main style={page}>
        <div style={header}>
          <h1 style={{ margin: 0 }}>Workshop wall</h1>
          <div style={toolbar}>
            {Object.keys(PRESETS).map((name) => (
              <button
                key={name}
                style={presetButton(name === presetName)}
                onClick={() => choosePreset(name)}
                title={`${PRESETS[name].w} × ${PRESETS[name].h}`}
              >
                {name}
              </button>
            ))}
            <button style={resetLink} onClick={resetAll}>Reset sizes</button>
            <button style={button} onClick={load}>Refresh</button>
          </div>
        </div>

        {err && <div style={error}>Could not load pairs: {err}</div>}

        {pairs === null && <div style={empty}>Loading pairs…</div>}

        {pairs !== null && pairs.length === 0 && !err && (
          <div style={empty}>
            No pairs registered yet. Once someone's vcluster is up,
            their tile will show up here after a refresh.
          </div>
        )}

        {pairs !== null && pairs.length > 0 && hydrated && (
          <div style={tileWrap}>
            {pairs.map((pair) => (
              <Tile
                key={pair}
                pair={pair}
                size={sizes[pair] || defaultSize}
                onResize={handleResize}
              />
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}
