import React, { useState, useEffect, useCallback } from 'react';

/**
 * Navbar progress pill.
 *
 * Reads the aggregate `/api/dashboard` (cached server-side for 10s — see
 * validator/dashboard.go) once on mount, picks out the row for the
 * current pair, and renders a compact "X/N · Next: <label>" pill in
 * the navbar's right-item cluster (injected by the ejected
 * theme/Navbar/Content swizzle). Always-visible, never below the fold,
 * never competes with the page heading.
 *
 * Scope: the bar tracks only the 101 path (modules 00 → 04-crossplane-101).
 * Beyond that, the workshop branches across provider tracks (AWS, GCP,
 * Azure, Aruba) and a linear "stage X/N" stops making sense. The
 * `hello-pod` smoke test from module 02 and the `hello-xr-ready` check
 * from module 04 are both treated as optional — neither is part of the
 * denominator and neither gates "Next". Both back short-lived artifacts
 * that the module's own cleanup step deletes (the `hello` pod in 02, the
 * `hello-world` Hello XR in 04), so keeping them in the denominator
 * would flip the pill backwards as soon as a participant followed the
 * instructions.
 *
 * The pair ID is resolved with the same precedence as ValidateCheck
 * (prop → /p/<pair>/ URL segment → localStorage). With no pair set the
 * pill stays hidden so non-workshop pages and pre-setup navigation
 * aren't cluttered. Rendered after results land — no loading skeleton
 * in the navbar (a flash of grey there is more distracting than a brief
 * absence).
 */

// The 101 path in module order — the only checks the strip counts.
// `hello-pod` and `hello-xr-ready` are intentionally absent (treated as
// optional, see comment above): both back short-lived artifacts that
// the module's own cleanup step deletes, so including them would flip
// the pill backwards as soon as a participant followed the
// instructions. Update this list when the 101 modules change shape.
const CORE_CHECK_IDS = [
  'cluster-reachable',
  'crossplane-installed',
  'application-ready',
  'helm-release-ready',
];

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

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  padding: '4px 12px',
  margin: '0 8px',
  borderRadius: '999px',
  fontSize: '0.8rem',
  fontWeight: 600,
  lineHeight: 1.2,
  background: 'var(--ifm-color-emphasis-100)',
  border: '1px solid var(--ifm-color-emphasis-300)',
  color: 'var(--ifm-color-emphasis-800)',
  whiteSpace: 'nowrap',
};

const barTrack = {
  width: '64px',
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

const nextStyle = {
  fontWeight: 500,
  color: 'var(--ifm-color-emphasis-700)',
  maxWidth: '220px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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

  const labelById = new Map(data.checks.map((c) => [c.id, c.label || c.id]));
  const resultById = new Map((row.results || []).map((r) => [r.id, r]));

  const total = CORE_CHECK_IDS.length;
  let passing = 0;
  let nextId = null;
  for (const id of CORE_CHECK_IDS) {
    const result = resultById.get(id);
    if (result && result.pass) {
      passing += 1;
    } else if (nextId === null) {
      nextId = id;
    }
  }
  const done = passing >= total;

  const title = done
    ? `Pair ${pairId}: all ${total} 101 checks passing`
    : `Pair ${pairId}: ${passing}/${total} 101 checks · next ${labelById.get(nextId) || nextId}`;

  return (
    <div style={pillStyle} aria-label={title} title={title}>
      <span>101 · {passing}/{total}</span>
      <div style={barTrack} aria-hidden="true">
        <div style={barFill(total ? passing / total : 0, done)} />
      </div>
      {done ? (
        <span>🎉 complete</span>
      ) : (
        <span style={nextStyle}>Next: {labelById.get(nextId) || nextId}</span>
      )}
    </div>
  );
}
