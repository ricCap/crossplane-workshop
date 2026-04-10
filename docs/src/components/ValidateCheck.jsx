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

const colors = {
  [STATUS.IDLE]:    { bg: '#e5e7eb', fg: '#374151' },
  [STATUS.LOADING]: { bg: '#dbeafe', fg: '#1e40af' },
  [STATUS.PASS]:    { bg: '#d1fae5', fg: '#065f46' },
  [STATUS.FAIL]:    { bg: '#fee2e2', fg: '#991b1b' },
  [STATUS.ERROR]:   { bg: '#fef3c7', fg: '#92400e' },
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

  const pairId = resolvePairId(propPairId);

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
      const data = await res.json();
      setStatus(data.pass ? STATUS.PASS : STATUS.FAIL);
      setDetails(data.details ?? '');
    } catch (err) {
      setStatus(STATUS.ERROR);
      setDetails(String(err));
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
          background: '#f9fafb',
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
