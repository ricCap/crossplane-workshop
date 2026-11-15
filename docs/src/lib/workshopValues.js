import { useEffect, useState } from 'react';

/**
 * Per-participant values the docs can fill into code blocks.
 *
 * The pair ID comes from the same sources <ValidateCheck /> uses, in order:
 *   1. a `/p/<pairId>/` URL segment
 *   2. localStorage key `pairId` (written by <PairId />)
 *
 * The registry is derived from the host serving the docs:
 *   - crossplane.<domain>   → registry.<domain>  (Aruba; same Gateway)
 *   - localhost / 127.0.0.1 → 127.0.0.1:5111     (solo, k3d default port)
 * Anything else leaves the placeholder alone.
 */

// Must match the event name <PairId /> dispatches when it writes localStorage.
export const PAIR_ID_CHANGE_EVENT = 'workshop:pair-id-changed';

export const PAIR_PLACEHOLDER = '<your pair ID>';
export const REGISTRY_PLACEHOLDER = '<your registry>';

export const SOLO_REGISTRY = '127.0.0.1:5111';

// Pair IDs are Kubernetes names (`bold-kiwi`). Anything else is a typo in the
// <PairId /> box and must not be pasted into a participant's shell.
const PAIR_ID_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function resolvePairId() {
  if (typeof window === 'undefined') return null;

  const match = window.location.pathname.match(/\/p\/([^/]+)/);
  if (match) return match[1];

  try {
    const stored = window.localStorage.getItem('pairId');
    if (stored) return stored;
  } catch {
    // Storage blocked (private mode, policy): fall through to null.
  }
  return null;
}

export function resolveRegistry(hostname) {
  if (!hostname) return null;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return SOLO_REGISTRY;
  if (hostname.startsWith('crossplane.')) {
    return `registry.${hostname.slice('crossplane.'.length)}`;
  }
  return null;
}

/** Replace the placeholders in `text` with whatever values are known. */
export function fillPlaceholders(text, { pairId, registry } = {}) {
  if (typeof text !== 'string') return text;
  let out = text;
  if (pairId && PAIR_ID_PATTERN.test(pairId)) {
    out = out.split(PAIR_PLACEHOLDER).join(pairId);
  }
  if (registry) {
    out = out.split(REGISTRY_PLACEHOLDER).join(registry);
  }
  return out;
}

/**
 * Current values, read after mount so the server-rendered HTML (which has the
 * placeholders) matches the first client render. Re-reads when <PairId />
 * saves a new value on this page or in another tab.
 */
export function useWorkshopValues() {
  const [values, setValues] = useState({ pairId: null, registry: null });

  useEffect(() => {
    const read = () =>
      setValues({
        pairId: resolvePairId(),
        registry: resolveRegistry(window.location.hostname),
      });
    read();
    window.addEventListener(PAIR_ID_CHANGE_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(PAIR_ID_CHANGE_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  return values;
}
