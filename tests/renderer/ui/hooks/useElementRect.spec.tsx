/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { useElementRect } from '@/ui/hooks/useElementRect';

// jsdom has no real layout, so getBoundingClientRect() returns zeros. We drive
// it from a mutable rect to simulate the element moving without a resize event.
let currentRect: { left: number; top: number; width: number; height: number };

function Harness() {
  const [ref, rect, measure] = useElementRect({ useViewportRect: true });
  return (
    <div>
      <div
        ref={ref as React.RefObject<HTMLDivElement | null>}
        data-testid="el"
      />
      <span data-testid="x">{rect.xPx}</span>
      <button data-testid="remeasure" onClick={measure}>remeasure</button>
    </div>
  );
}

describe('useElementRect', () => {
  beforeEach(() => {
    currentRect = { left: 100, top: 0, width: 40, height: 20 };
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return { ...currentRect, right: 0, bottom: 0, x: currentRect.left, y: currentRect.top, toJSON: () => ({}) } as DOMRect;
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('measures the element position on mount', () => {
    render(<Harness />);
    expect(screen.getByTestId('x')).toHaveTextContent(/^100$/);
  });

  it('re-measures via the returned callback when the element shifts without a resize', () => {
    // This is the Top Bar popup bug: deleting a sibling tab moves this element
    // horizontally without changing its size, so a ResizeObserver never fires.
    render(<Harness />);
    expect(screen.getByTestId('x')).toHaveTextContent(/^100$/);

    currentRect = { ...currentRect, left: 40 };
    fireEvent.click(screen.getByTestId('remeasure'));

    expect(screen.getByTestId('x')).toHaveTextContent(/^40$/);
  });
});
