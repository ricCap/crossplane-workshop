import React, { useState, useEffect, useCallback } from 'react';
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
 */

const page = {
  padding: '1.5rem 2rem',
};

const header = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
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

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '1rem',
};

const tile = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden',
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
};

const tileLabel = {
  padding: '6px 10px',
  fontSize: '0.85rem',
  fontWeight: 600,
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
};

const tileFrame = {
  width: '100%',
  height: '220px',
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

export default function Wall() {
  const [pairs, setPairs] = useState(null);
  const [err, setErr] = useState(null);

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

  return (
    <Layout title="Wall" description="All participant tiles, one grid.">
      <main style={page}>
        <div style={header}>
          <h1 style={{ margin: 0 }}>Workshop wall</h1>
          <button style={button} onClick={load}>Refresh</button>
        </div>

        {err && <div style={error}>Could not load pairs: {err}</div>}

        {pairs === null && <div style={empty}>Loading pairs…</div>}

        {pairs !== null && pairs.length === 0 && !err && (
          <div style={empty}>
            No pairs registered yet. Once someone's vcluster is up,
            their tile will show up here after a refresh.
          </div>
        )}

        {pairs !== null && pairs.length > 0 && (
          <div style={grid}>
            {pairs.map((pair) => (
              <div key={pair} style={tile}>
                <div style={tileLabel}>{pair}</div>
                <iframe
                  title={pair}
                  src={`/team/${pair}/`}
                  style={tileFrame}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}
