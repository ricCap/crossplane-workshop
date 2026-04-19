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
  overflow: 'auto',
  background: '#fff',
};

const table = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

const thBase = {
  padding: '10px 12px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const thStepCol = {
  ...thBase,
  textAlign: 'left',
  position: 'sticky',
  left: 0,
  zIndex: 2,
  background: '#f9fafb',
  minWidth: '260px',
};

const thPair = {
  ...thBase,
  textAlign: 'center',
  minWidth: '96px',
};

const tdBase = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'middle',
};

const stepCell = {
  ...tdBase,
  textAlign: 'left',
  position: 'sticky',
  left: 0,
  background: '#fff',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const stepCellActive = {
  ...stepCell,
  background: '#eff6ff',
};

const stepNumber = {
  display: 'inline-block',
  width: '26px',
  height: '26px',
  lineHeight: '26px',
  textAlign: 'center',
  borderRadius: '999px',
  background: '#2563eb',
  color: 'white',
  fontWeight: 700,
  fontSize: '0.8rem',
  marginRight: '10px',
  verticalAlign: 'middle',
};

const cellBase = {
  ...tdBase,
  textAlign: 'center',
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
  cursor: 'help',
};

const chipPass = { ...chipBase, background: '#16a34a' };
const chipFail = { ...chipBase, background: '#dc2626' };
const chipUnknown = { ...chipBase, background: '#9ca3af' };

const pairHeader = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
};

const pairName = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontWeight: 700,
  fontSize: '0.92rem',
};

const progressTrack = {
  width: '72px',
  height: '6px',
  borderRadius: '3px',
  background: '#e5e7eb',
  position: 'relative',
  overflow: 'hidden',
};

const progressFill = (pct, done) => ({
  width: `${pct}%`,
  height: '100%',
  background: done ? '#16a34a' : '#2563eb',
  borderRadius: '3px',
  transition: 'width 300ms ease',
});

const stageLabel = {
  fontSize: '0.75rem',
  color: '#6b7280',
  fontWeight: 600,
};

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
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
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
  const [expandedStep, setExpandedStep] = useState(null);
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

  // Index each pair's results by check id so we can look them up while
  // walking rows (check-major) instead of columns (pair-major).
  const resultsByPair = pairs.map((p) => ({
    pair: p,
    byID: Object.fromEntries(p.results.map((r) => [r.id, r])),
  }));

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
          No pairs registered yet. Once someone's vcluster is up, a column
          will appear here automatically.
        </div>
      )}

      {data !== null && pairs.length > 0 && (
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={thStepCol}>Step</th>
                {pairs.map((pair) => {
                  const pct = stageTotal === 0 ? 0 : Math.round((pair.stageReached / stageTotal) * 100);
                  const done = pair.stageReached === stageTotal && stageTotal > 0;
                  return (
                    <th key={pair.id} style={thPair}>
                      <div style={pairHeader}>
                        <span style={pairName}>{pair.id}</span>
                        <div style={progressTrack}>
                          <div style={progressFill(pct, done)} />
                        </div>
                        <span style={stageLabel}>{pair.stageReached}/{stageTotal}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {checks.map((check, idx) => {
                const isExpanded = expandedStep === check.id;
                return (
                  <React.Fragment key={check.id}>
                    <tr
                      onClick={() => setExpandedStep(isExpanded ? null : check.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={isExpanded ? stepCellActive : stepCell} title={check.id}>
                        <span style={stepNumber}>{idx + 1}</span>
                        {check.label}
                      </td>
                      {resultsByPair.map(({ pair, byID }) => {
                        const r = byID[check.id];
                        return (
                          <td key={pair.id} style={cellBase}>
                            <span
                              style={chipStyle(r)}
                              title={r?.details ?? 'no result'}
                            >
                              {chipLabel(r)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td style={detailsPanel} colSpan={pairs.length + 1}>
                          <ul style={detailsList}>
                            {resultsByPair.map(({ pair, byID }) => {
                              const r = byID[check.id];
                              return (
                                <React.Fragment key={pair.id}>
                                  <li style={detailsLabel}>{pair.id}</li>
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
