import React, { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_MS = 5000;

const page = {
  padding: '1.5rem 2rem',
};

const header = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
  flexWrap: 'wrap',
  gap: '0.75rem',
};

const headerLeft = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '1rem',
};

const lastUpdated = {
  color: '#6b7280',
  fontSize: '0.9rem',
};

const controls = {
  display: 'flex',
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

const buttonSecondary = {
  ...button,
  background: '#e5e7eb',
  color: '#111827',
};

const tableWrap = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden',
  background: '#fff',
};

const table = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

const th = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const td = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'middle',
};

const pairCell = {
  ...td,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontWeight: 600,
};

const rowClickable = {
  cursor: 'pointer',
};

const rowExpanded = {
  background: '#f9fafb',
};

const chipBase = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '999px',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'white',
  minWidth: '48px',
  textAlign: 'center',
};

const chipPass = { ...chipBase, background: '#16a34a' };
const chipFail = { ...chipBase, background: '#dc2626' };
const chipUnknown = { ...chipBase, background: '#9ca3af' };

const stageCell = {
  ...td,
  whiteSpace: 'nowrap',
  minWidth: '120px',
};

const progressTrack = {
  display: 'inline-block',
  width: '72px',
  height: '6px',
  borderRadius: '3px',
  background: '#e5e7eb',
  marginLeft: '8px',
  verticalAlign: 'middle',
};

const progressFill = (pct) => ({
  width: `${pct}%`,
  height: '100%',
  background: '#16a34a',
  borderRadius: '3px',
});

const detailsPanel = {
  padding: '12px 16px',
  background: '#f9fafb',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.86rem',
};

const detailsList = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '6px 16px',
};

const detailsLabel = {
  fontWeight: 600,
  color: '#374151',
};

const detailsText = {
  color: '#4b5563',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const empty = {
  padding: '2rem',
  textAlign: 'center',
  color: '#6b7280',
  border: '1px dashed #d1d5db',
  borderRadius: '8px',
};

const errorBox = {
  padding: '0.75rem 1rem',
  color: '#991b1b',
  background: '#fee2e2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
  marginBottom: '1rem',
};

function formatTime(date) {
  return date.toTimeString().slice(0, 8);
}

function chipStyle(result) {
  if (!result) return chipUnknown;
  return result.pass ? chipPass : chipFail;
}

function chipLabel(result) {
  if (!result) return '–';
  return result.pass ? 'pass' : 'fail';
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [paused, setPaused] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [expandedPair, setExpandedPair] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      setData(payload);
      setLastUpdatedAt(new Date());
      setErr(null);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [paused, load]);

  const checks = data?.checks ?? [];
  const pairs = data?.pairs ?? [];
  const stageTotal = checks.length;

  return (
    <main style={page}>
      <div style={header}>
        <div style={headerLeft}>
          <h1 style={{ margin: 0 }}>Workshop dashboard</h1>
          {lastUpdatedAt && (
            <span style={lastUpdated}>Last updated {formatTime(lastUpdatedAt)}</span>
          )}
        </div>
        <div style={controls}>
          <button
            type="button"
            style={buttonSecondary}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" style={button} onClick={load}>Refresh</button>
        </div>
      </div>

      {err && <div style={errorBox}>Could not load dashboard: {err}</div>}

      {data === null && !err && <div style={empty}>Loading dashboard…</div>}

      {data !== null && pairs.length === 0 && !err && (
        <div style={empty}>
          No pairs registered yet. Once someone's vcluster is up, their row
          will appear here automatically.
        </div>
      )}

      {data !== null && pairs.length > 0 && (
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Pair</th>
                {checks.map((c) => (
                  <th key={c.id} style={th} title={c.id}>{c.label}</th>
                ))}
                <th style={th}>Stage</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => {
                const resultsByID = Object.fromEntries(
                  pair.results.map((r) => [r.id, r]),
                );
                const isExpanded = expandedPair === pair.id;
                const pct = stageTotal === 0 ? 0 : Math.round((pair.stageReached / stageTotal) * 100);
                return (
                  <React.Fragment key={pair.id}>
                    <tr
                      style={{ ...rowClickable, ...(isExpanded ? rowExpanded : null) }}
                      onClick={() => setExpandedPair(isExpanded ? null : pair.id)}
                    >
                      <td style={pairCell}>{pair.id}</td>
                      {checks.map((c) => {
                        const r = resultsByID[c.id];
                        return (
                          <td key={c.id} style={td}>
                            <span
                              style={chipStyle(r)}
                              title={r?.details ?? 'no result'}
                            >
                              {chipLabel(r)}
                            </span>
                          </td>
                        );
                      })}
                      <td style={stageCell}>
                        {pair.stageReached}/{stageTotal}
                        <span style={progressTrack}>
                          <span style={progressFill(pct)} />
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td style={detailsPanel} colSpan={checks.length + 2}>
                          <ul style={detailsList}>
                            {checks.map((c) => {
                              const r = resultsByID[c.id];
                              return (
                                <React.Fragment key={c.id}>
                                  <li style={detailsLabel}>{c.label}</li>
                                  <li style={detailsText}>
                                    {r?.details ?? 'no result'}
                                  </li>
                                </React.Fragment>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
