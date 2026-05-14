import React, { useState, useEffect, useCallback } from 'react';

/**
 * Resolves the participant pair ID by checking, in order:
 *  1. The `pairId` prop (explicit override).
 *  2. The URL path segment matching `/p/<pairId>/`.
 *  3. localStorage key `pairId`.
 *
 * Returns null if none of the above yields a value.
 */
function resolvePairId(propPairId) {
  if (propPairId) return propPairId;

  if (typeof window !== 'undefined') {
    const match = window.location.pathname.match(/\/p\/([^/]+)/);
    if (match) return match[1];

    const stored = window.localStorage.getItem('pairId');
    if (stored) return stored;
  }

  return null;
}

// Must match the event name PairId dispatches when it writes localStorage,
// so this component re-renders after the user saves a pair ID on the same page.
const PAIR_ID_CHANGE_EVENT = 'workshop:pair-id-changed';

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  PASS: 'pass',
  FAIL: 'fail',
  ERROR: 'error',
};

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 12px',
  borderRadius: '999px',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  border: 'none',
  userSelect: 'none',
};

// Use Infima's per-status contrast palette: --ifm-color-{x}-contrast-background
// and -contrast-foreground are defined for both light and dark themes by
// Docusaurus, so the chip stays legible in either mode without us reasoning
// about it. IDLE falls back to neutral emphasis tokens.
const colors = {
  [STATUS.IDLE]:    { bg: 'var(--ifm-color-emphasis-200)', fg: 'var(--ifm-color-emphasis-800)' },
  [STATUS.LOADING]: { bg: 'var(--ifm-color-info-contrast-background)',    fg: 'var(--ifm-color-info-contrast-foreground)' },
  [STATUS.PASS]:    { bg: 'var(--ifm-color-success-contrast-background)', fg: 'var(--ifm-color-success-contrast-foreground)' },
  [STATUS.FAIL]:    { bg: 'var(--ifm-color-danger-contrast-background)',  fg: 'var(--ifm-color-danger-contrast-foreground)' },
  [STATUS.ERROR]:   { bg: 'var(--ifm-color-warning-contrast-background)', fg: 'var(--ifm-color-warning-contrast-foreground)' },
};

const labels = {
  [STATUS.IDLE]:    '▶ Run check',
  [STATUS.LOADING]: '⏳ Checking…',
  [STATUS.PASS]:    '✅ Pass',
  [STATUS.FAIL]:    '❌ Fail',
  [STATUS.ERROR]:   '⚠ Error',
};

/**
 * Props:
 *  - check    {string}  required — check ID to run (e.g. "provider-helm-installed")
 *  - pairId   {string}  optional — explicit pair ID; falls back to URL / localStorage
 */
export default function ValidateCheck({ check, pairId: propPairId }) {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [details, setDetails] = useState('');
  const [pairId, setPairId] = useState(() => resolvePairId(propPairId));

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

  const runCheck = useCallback(async () => {
    if (!pairId) {
      setStatus(STATUS.ERROR);
      setDetails('Could not determine pair ID. Navigate to /p/<pair-id>/... or set pairId in localStorage.');
      return;
    }

    setStatus(STATUS.LOADING);
    setDetails('');

    try {
      const res = await fetch(`/api/checks/${encodeURIComponent(pairId)}/${encodeURIComponent(check)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        setStatus(STATUS.ERROR);
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          setDetails(
            `Validator service unreachable (HTTP ${res.status}). ` +
            `In dev, start it with \`task dev:validator\` and click again. ` +
            `In the workshop cluster, the validator may be restarting — wait ~30s and retry.`
          );
        } else {
          setDetails(`Validator returned HTTP ${res.status}. Try again, or check the validator logs.`);
        }
        return;
      }
      const data = await res.json();
      setStatus(data.pass ? STATUS.PASS : STATUS.FAIL);
      setDetails(data.details ?? '');
    } catch (err) {
      setStatus(STATUS.ERROR);
      if (err instanceof TypeError) {
        setDetails(
          'Cannot reach validator. ' +
          'In dev, start it with `task dev:validator` and click again. ' +
          'In the workshop cluster, the validator may be temporarily down — retry in a moment.'
        );
      } else {
        setDetails(String(err));
      }
    }
  }, [pairId, check]);

  const { bg, fg } = colors[status];

  return (
    <div style={{ margin: '0.75rem 0' }}>
      <button
        style={{ ...chipStyle, backgroundColor: bg, color: fg }}
        onClick={runCheck}
        disabled={status === STATUS.LOADING}
        aria-label={`Run check: ${check}`}
      >
        {labels[status]}
        <span style={{ fontWeight: 400, fontSize: '0.8rem' }}>{check}</span>
      </button>
      {details && (
        <pre style={{
          marginTop: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'var(--ifm-color-emphasis-100)',
          color: 'var(--ifm-font-color-base)',
          borderLeft: `4px solid ${fg}`,
          borderRadius: '4px',
          fontSize: '0.8rem',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {details}
        </pre>
      )}
    </div>
  );
}
