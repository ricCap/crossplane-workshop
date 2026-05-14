import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';
import ValidateCheck from './ValidateCheck';

const PAIR_ID_CHANGE_EVENT = 'workshop:pair-id-changed';

const originalFetch = globalThis.fetch;

function mockFetchOk(body = { pass: true, details: '' }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

describe('ValidateCheck', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reads pairId from localStorage on mount', async () => {
    window.localStorage.setItem('pairId', 'fancy-lemon');
    const fetchMock = mockFetchOk();

    render(<ValidateCheck check="provider-helm-installed" />);
    await userEvent.click(screen.getByRole('button', { name: /run check/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/checks/fancy-lemon/provider-helm-installed',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('errors when no pairId is available anywhere', async () => {
    const fetchMock = mockFetchOk();

    render(<ValidateCheck check="provider-helm-installed" />);
    await userEvent.click(screen.getByRole('button', { name: /run check/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/could not determine pair id/i)).toBeInTheDocument();
  });

  // Regression test for the "click twice on first run" bug.
  //
  // Before the fix, ValidateCheck computed pairId inline on every render but
  // didn't subscribe to the workshop:pair-id-changed event that PairId
  // dispatches when it writes localStorage. So the first click after saving
  // a pair ID would run with a stale null pairId, error out, and only the
  // re-render triggered by setState would pick up the new value — making the
  // second click work. After the fix, the first click should already hit
  // the validator with the right pair ID.
  it('picks up a pairId saved after mount on the first click (regression)', async () => {
    const fetchMock = mockFetchOk();

    render(<ValidateCheck check="provider-helm-installed" />);

    // Simulate PairId saving a pair ID on the same page: write localStorage
    // and broadcast the custom event the writer uses.
    act(() => {
      window.localStorage.setItem('pairId', 'fancy-lemon');
      window.dispatchEvent(new CustomEvent(PAIR_ID_CHANGE_EVENT));
    });

    await userEvent.click(screen.getByRole('button', { name: /run check/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/checks/fancy-lemon/provider-helm-installed',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      screen.queryByText(/could not determine pair id/i),
    ).not.toBeInTheDocument();
  });

  it('prefers the explicit pairId prop over localStorage', async () => {
    window.localStorage.setItem('pairId', 'from-storage');
    const fetchMock = mockFetchOk();

    render(<ValidateCheck check="x" pairId="from-prop" />);
    await userEvent.click(screen.getByRole('button', { name: /run check/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/checks/from-prop/x',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
