import React, { useState, useEffect, useCallback } from 'react';
import Link from '@docusaurus/Link';

/**
 * Per-page progress strip.
 *
 * Reads the aggregate `/api/dashboard` (cached server-side for 10s — see
 * validator/dashboard.go) once on mount, picks out the row for the
 * current pair, and shows a compact "stage X/N · next: <label>" strip
 * at the top of every workshop page. It complements the inline
 * <ValidateCheck /> chips — those are still the "verify now" action,
 * this is the "where am I" indicator.
 *
 * The pair ID is resolved with the same precedence as ValidateCheck
 * (prop → /p/<pair>/ URL segment → localStorage). With no pair set the
 * strip stays out of the way so non-workshop pages and pre-setup
 * navigation aren't cluttered.
 */

const PAIR_ID_CHANGE_EVENT = 'workshop:pair-id-changed';

function resolvePairId(propPairId) {
  if (propPairId) return propPairId;
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/p\/([^/]+)/);
  if (match) return match[1];
  const stored = window.localStorage.getItem('pairId');
  if (stored) return stored;
  return null;
}

const stripStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 14px',
  margin: '0 0 1rem 0',
  borderRadius: '8px',
  fontSize: '0.85rem',
  background: 'var(--ifm-color-emphasis-100)',
  border: '1px solid var(--ifm-color-emphasis-200)',
  flexWrap: 'wrap',
};

const barTrack = {
  flex: '1 1 120px',
  minWidth: '80px',
  maxWidth: '220px',
  height: '6px',
  borderRadius: '999px',
  background: 'var(--ifm-color-emphasis-300)',
  overflow: 'hidden',
};

const barFill = (ratio, done) => ({
  width: `${Math.round(ratio * 100)}%`,
  height: '100%',
  background: done
    ? 'var(--ifm-color-success)'
    : 'var(--ifm-color-primary)',
  transition: 'width 200ms ease',
});

const linkStyle = {
  marginLeft: 'auto',
  color: 'var(--ifm-link-color)',
  textDecoration: 'none',
  fontWeight: 600,
};

export default function ModuleProgress({ pairId: propPairId }) {
  const [pairId, setPairId] = useState(() => resolvePairId(propPairId));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setPairId(resolvePairId(propPairId));
    const refresh = () => setPairId(resolvePairId(propPairId));
    window.addEventListener(PAIR_ID_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PAIR_ID_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [propPairId]);

  const load = useCallback(async () => {
    if (!pairId) return;
    setErr(null);
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [pairId]);

  useEffect(() => { load(); }, [load]);

  if (!pairId) return null;
  if (err) return null;
  if (!data || !Array.isArray(data.checks) || !Array.isArray(data.pairs)) return null;

  const row = data.pairs.find((p) => p.id === pairId);
  if (!row) return null;

  const total = data.checks.length;
  const reached = Math.min(row.stageReached ?? 0, total);
  const done = reached >= total;
  const nextCheck = done ? null : data.checks[reached];

  return (
    <div style={stripStyle} aria-label={`Progress for pair ${pairId}: stage ${reached} of ${total}`}>
      <strong>Pair {pairId}</strong>
      <span>Stage {reached}/{total}</span>
      <div style={barTrack} aria-hidden="true">
        <div style={barFill(total ? reached / total : 0, done)} />
      </div>
      {done ? (
        <span>All checks passing 🎉</span>
      ) : (
        <span>Next: {nextCheck?.label || nextCheck?.id}</span>
      )}
      <Link to="/wall" style={linkStyle}>Wall →</Link>
    </div>
  );
}
