/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {useElementRect} from '@/ui/hooks/useElementRect';
import {fireEvent, render, screen} from '@testing-library/react';

// jsdom has no real layout, so getBoundingClientRect() returns zeros. We drive
// it from a mutable rect to simulate the element moving without a resize event.
let currentRect: { left: number; top: number; width: number; height: number };

function Harness() {
  const [ref, rect, measure] = useElementRect({useViewportRect: true});
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
    currentRect = {left: 100, top: 0, width: 40, height: 20};
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return {
          ...currentRect,
          right: 0,
          bottom: 0,
          x: currentRect.left,
          y: currentRect.top,
          toJSON: () => ({})
        } as DOMRect;
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('measures the element position on mount', () => {
    render(<Harness/>);
    expect(screen.getByTestId('x')).toHaveTextContent(/^100$/);
  });

  it('re-measures via the returned callback when the element shifts without a resize', () => {
    // This is the Top Bar popup bug: deleting a sibling tab moves this element
    // horizontally without changing its size, so a ResizeObserver never fires.
    render(<Harness/>);
    expect(screen.getByTestId('x')).toHaveTextContent(/^100$/);

    currentRect = {...currentRect, left: 40};
    fireEvent.click(screen.getByTestId('remeasure'));

    expect(screen.getByTestId('x')).toHaveTextContent(/^40$/);
  });

  describe('ResizeObserver', () => {
    let observed: Element[];
    let disconnects: number;
    const origResizeObserver = (global as { ResizeObserver?: unknown }).ResizeObserver;

    beforeEach(() => {
      observed = [];
      disconnects = 0;
      (global as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe(el: Element) {
          observed.push(el);
        }

        disconnect() {
          disconnects++;
        }
      };
    });

    afterEach(() => {
      (global as { ResizeObserver?: unknown }).ResizeObserver = origResizeObserver;
    });

    // The ref'd element can be replaced by React (e.g. WidgetLayout renders a
    // placeholder <div> first, then a different <div> once mounted). The observer
    // must follow the live element, or worktable size changes go unnoticed.
    function SwappingHarness({swapped}: { swapped: boolean }) {
      const [ref] = useElementRect();
      return swapped
        ? <section ref={ref as React.RefObject<HTMLElement | null>} data-testid="live"/>
        : <div ref={ref as React.RefObject<HTMLDivElement | null>} data-testid="placeholder"/>;
    }

    it('re-observes when the ref\'d element is replaced', () => {
      const {rerender} = render(<SwappingHarness swapped={false}/>);
      rerender(<SwappingHarness swapped={true}/>);

      expect(observed[observed.length - 1]).toBe(screen.getByTestId('live'));
      expect(observed[observed.length - 1].isConnected).toBe(true);
    });

    it('does not re-observe on re-renders that keep the same element', () => {
      const {rerender, unmount} = render(<SwappingHarness swapped={true}/>);
      rerender(<SwappingHarness swapped={true}/>);
      expect(observed).toHaveLength(1);

      unmount();
      expect(disconnects).toBe(1);
    });
  });
});
