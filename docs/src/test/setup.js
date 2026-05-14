import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest's jsdom environment copies dom.window properties onto globalThis,
// but `localStorage` is a WebIDL getter and lands as an empty plain object on
// `window`. The real Storage is still on `window.jsdom.window.localStorage`,
// but it's simpler to redefine `window.localStorage` (and `globalThis`) with
// a minimal in-memory polyfill — it's what every component reaches for, and
// it gives `storage` events for free if we ever need them.
function installLocalStoragePolyfill() {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

installLocalStoragePolyfill();

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
