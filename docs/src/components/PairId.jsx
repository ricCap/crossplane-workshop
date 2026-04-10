import React, { useState, useEffect, useCallback } from 'react';

/**
 * Pair ID UI.
 *
 * The workshop's validator resolves a pair ID from three sources, in order:
 *   1. an explicit `pairId` prop on <ValidateCheck />
 *   2. a `/p/<pair-id>/` URL segment
 *   3. `localStorage.getItem('pairId')`
 *
 * This component is the writer for source (3). It is a read+edit control:
 * - With no pair ID set, it shows an input and a Save button.
 * - Once set, it shows "Your pair: <name>" with a Change link that drops
 *   back to edit mode.
 *
 * Drop `<PairId />` once on the intro page so participants set it during
 * setup, and optionally on every module page so they can always see (and
 * correct) which pair they're working as.
 */

const STORAGE_KEY = 'pairId';

// Broadcast changes to other PairId instances on the same page so the
// "change" flow feels instant even when multiple copies are rendered
// (intro + navbar, etc). localStorage 'storage' events only fire
// cross-tab, not same-tab, so we use a CustomEvent for same-tab sync.
const CHANGE_EVENT = 'workshop:pair-id-changed';

function readPairId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function writePairId(value) {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

const box = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  background: '#f9fafb',
  fontSize: '0.9rem',
  margin: '0.75rem 0',
};

const input = {
  padding: '4px 8px',
  border: '1px solid #9ca3af',
  borderRadius: '4px',
  font: 'inherit',
  minWidth: '160px',
};

const button = {
  padding: '4px 12px',
  border: 'none',
  borderRadius: '4px',
  background: '#2563eb',
  color: 'white',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
};

const link = {
  marginLeft: '6px',
  background: 'none',
  border: 'none',
  color: '#2563eb',
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
  font: 'inherit',
};

export default function PairId() {
  const [current, setCurrent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // Hydrate after mount so SSR output stays stable.
  useEffect(() => {
    const v = readPairId();
    setCurrent(v);
    setEditing(!v);
    setDraft(v ?? '');

    const refresh = () => {
      const v = readPairId();
      setCurrent(v);
      if (v) setEditing(false);
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    writePairId(trimmed);
    setCurrent(trimmed);
    setEditing(false);
  }, [draft]);

  const onKey = useCallback((e) => {
    if (e.key === 'Enter') save();
  }, [save]);

  if (editing) {
    return (
      <div style={box}>
        <label htmlFor="pair-id-input">Your pair ID:</label>
        <input
          id="pair-id-input"
          style={input}
          value={draft}
          placeholder="e.g. fancy-lemon"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          autoFocus
        />
        <button style={button} onClick={save} disabled={!draft.trim()}>
          Save
        </button>
      </div>
    );
  }

  return (
    <div style={box}>
      <span>
        Your pair: <strong>{current}</strong>
      </span>
      <button style={link} onClick={() => { setDraft(current ?? ''); setEditing(true); }}>
        change
      </button>
    </div>
  );
}
