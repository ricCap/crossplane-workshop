import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  fillPlaceholders,
  resolveRegistry,
  useWorkshopValues,
  PAIR_ID_CHANGE_EVENT,
} from './workshopValues';

const CMD =
  'crossplane xpkg install configuration <your registry>/<your pair ID>/my-platform:v0.1.0 --wait 180s';

describe('fillPlaceholders', () => {
  it('fills both placeholders, every occurrence', () => {
    expect(
      fillPlaceholders(`${CMD}\n<your pair ID>-my-platform`, {
        pairId: 'bold-kiwi',
        registry: 'registry.workshop.example.com',
      }),
    ).toBe(
      'crossplane xpkg install configuration registry.workshop.example.com/bold-kiwi/my-platform:v0.1.0 --wait 180s\nbold-kiwi-my-platform',
    );
  });

  it('leaves placeholders when values are unknown', () => {
    expect(fillPlaceholders(CMD, {})).toBe(CMD);
  });

  it('refuses pair IDs that are not Kubernetes names', () => {
    for (const bad of ['Bold Kiwi', 'kiwi;rm -rf ~', '-kiwi', '$(id)']) {
      expect(fillPlaceholders(CMD, { pairId: bad })).toBe(CMD);
    }
  });

  it('passes non-strings through', () => {
    const el = <span />;
    expect(fillPlaceholders(el, { pairId: 'bold-kiwi' })).toBe(el);
  });
});

describe('resolveRegistry', () => {
  it('maps the Aruba docs host to the registry host', () => {
    expect(resolveRegistry('crossplane.workshop.riccardocapraro.com')).toBe(
      'registry.workshop.riccardocapraro.com',
    );
  });

  it('maps localhost to the solo registry', () => {
    expect(resolveRegistry('localhost')).toBe('127.0.0.1:5111');
    expect(resolveRegistry('127.0.0.1')).toBe('127.0.0.1:5111');
  });

  it('returns null for unknown hosts', () => {
    expect(resolveRegistry('example.com')).toBeNull();
  });
});

function Probe() {
  const { pairId, registry } = useWorkshopValues();
  return <div data-testid="v">{`${pairId}|${registry}`}</div>;
}

describe('useWorkshopValues', () => {
  it('reads the stored pair ID and updates when <PairId /> saves', () => {
    window.localStorage.setItem('pairId', 'bold-kiwi');
    render(<Probe />);
    expect(screen.getByTestId('v')).toHaveTextContent('bold-kiwi|127.0.0.1:5111');

    act(() => {
      window.localStorage.setItem('pairId', 'merry-cherry');
      window.dispatchEvent(new CustomEvent(PAIR_ID_CHANGE_EVENT));
    });
    expect(screen.getByTestId('v')).toHaveTextContent('merry-cherry|127.0.0.1:5111');
  });
});
