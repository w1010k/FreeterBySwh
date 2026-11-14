/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import clsx from 'clsx';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { appTitleBarHeight } from '@common/base/titleBar';
import styles from './titleBar.module.scss';
import { TitleBarViewModelHook } from './titleBarViewModel';

type Deps = {
  useTitleBarViewModel: TitleBarViewModelHook;
}

/** '&File' -> 'f': the letter after '&', which Alt+letter opens. */
export function mnemonicOf(label: string): string {
  const i = label.indexOf('&');
  return i >= 0 && i + 1 < label.length ? label[i + 1].toLowerCase() : '';
}

function MenuLabel({ label }: { label: string }) {
  const i = label.indexOf('&');
  if (i < 0 || i + 1 >= label.length) {
    return <>{label}</>;
  }
  return <>{label.slice(0, i)}<span className={styles['mnemonic']}>{label[i + 1]}</span>{label.slice(i + 2)}</>;
}

/**
 * The window's title bar on Windows and Linux (the window has no OS title bar, so it takes the theme colors). It shows
 * the app menu names; a click, Alt+letter, or Alt then the arrow keys and Enter open the menu, which main draws
 * (`popup-app-menu`). The OS draws the window buttons on the right (titleBarOverlay), over this bar.
 */
export function createTitleBarComponent({
  useTitleBarViewModel,
}: Deps) {
  function TitleBar() {
    const { visible, labels, menuBar, windowTitle, popupMenu } = useTitleBarViewModel();
    const barRef = useRef<HTMLDivElement>(null);
    // Focus before the menu bar took it, given back when the user leaves the menu bar.
    const prevFocusRef = useRef<HTMLElement | null>(null);
    // Alt went down with no other key since: its release moves focus to the menu bar (or out of it).
    const altAloneRef = useRef(false);
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    // The same as openIndex !== null, for `open` without re-creating it (and the window listeners) on every open.
    const isOpenRef = useRef(false);

    // The app's layout (main screen, modal screens, shelf) sits under the title bar by this variable. Layout effect: set
    // before the first paint, so the app does not first draw under the bar and then jump down.
    useLayoutEffect(() => {
      if (!visible) {
        return undefined;
      }
      document.documentElement.style.setProperty('--app-title-bar-height', `${appTitleBarHeight}px`);
      return () => {
        document.documentElement.style.removeProperty('--app-title-bar-height');
      };
    }, [visible]);

    const buttons = useCallback(() => [...(barRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])], []);

    const enterBar = useCallback((index: number) => {
      const active = document.activeElement;
      if (!barRef.current?.contains(active)) {
        prevFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      }
      buttons()[index]?.focus();
    }, [buttons]);

    const leaveBar = useCallback(() => {
      const prev = prevFocusRef.current;
      prevFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      } else if (document.activeElement instanceof HTMLElement && barRef.current?.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }, []);

    const open = useCallback(async (index: number) => {
      const button = buttons()[index];
      if (!button || isOpenRef.current) {
        return;
      }
      enterBar(index);
      const rect = button.getBoundingClientRect();
      isOpenRef.current = true;
      setOpenIndex(index);
      try {
        await popupMenu(index, rect.left, rect.bottom);
      } finally {
        isOpenRef.current = false;
        setOpenIndex(null);
        leaveBar();
      }
    }, [buttons, enterBar, leaveBar, popupMenu]);

    useEffect(() => {
      if (!visible) {
        return undefined;
      }
      // Capture phase: every key and mouse press tells whether Alt is used alone, also those a focused element stops
      // (xterm stops Alt+F). Alt alone, as with the OS menu bar: no other key or mouse button while it is down; held
      // long (auto-repeat) still counts.
      const onKeyDownCapture = (e: KeyboardEvent) => {
        if (e.key !== 'Alt') {
          altAloneRef.current = false;
        } else if (!e.repeat) {
          altAloneRef.current = !e.ctrlKey && !e.shiftKey && !e.metaKey;
        }
      };
      const onMouseDownCapture = () => {
        altAloneRef.current = false;
      };
      // Bubble phase and defaultPrevented: Alt+letter reaches the menu only when the focused element did not use it
      // (Terminal sends Alt+F and the like to the shell), as with the OS menu bar.
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Alt' || e.defaultPrevented) {
          return;
        }
        // `.code`, not `.key`: the letter key whatever the layout or IME (Korean input gives a jamo or 'Process').
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code.startsWith('Key')) {
          const letter = e.code.slice(3).toLowerCase();
          const index = labels.findIndex(label => mnemonicOf(label) === letter);
          if (index >= 0) {
            e.preventDefault();
            open(index);
          }
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.key !== 'Alt' || !altAloneRef.current || e.defaultPrevented) {
          return;
        }
        altAloneRef.current = false;
        e.preventDefault();
        if (barRef.current?.contains(document.activeElement)) {
          leaveBar();
        } else {
          enterBar(0);
        }
      };
      const onBlur = () => {
        altAloneRef.current = false;
      };
      window.addEventListener('keydown', onKeyDownCapture, true);
      window.addEventListener('mousedown', onMouseDownCapture, true);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      return () => {
        window.removeEventListener('keydown', onKeyDownCapture, true);
        window.removeEventListener('mousedown', onMouseDownCapture, true);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
      };
    }, [visible, labels, open, enterBar, leaveBar]);

    const onMenuKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const count = labels.length;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          buttons()[(index + 1) % count]?.focus();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          buttons()[(index - 1 + count) % count]?.focus();
          break;
        case 'ArrowDown':
        case 'Enter':
        case ' ':
          e.preventDefault();
          open(index);
          break;
        case 'Escape':
          e.preventDefault();
          leaveBar();
          break;
      }
    };

    if (!visible) {
      return null;
    }
    return (
      <div className={styles['title-bar']} data-testid="title-bar">
        <div
          ref={barRef}
          role="menubar"
          aria-label="Application menu"
          className={clsx(styles['menu-bar'], !menuBar && styles['is-auto-hidden'])}
        >
          {labels.map((label, index) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              aria-label={label.replace('&', '')}
              aria-haspopup="menu"
              aria-expanded={openIndex === index}
              tabIndex={-1}
              className={clsx(styles['menu'], openIndex === index && styles['is-open'])}
              onClick={() => open(index)}
              onKeyDown={e => onMenuKeyDown(e, index)}
            >
              <MenuLabel label={label}/>
            </button>
          ))}
        </div>
        <div className={styles['title']}>{windowTitle}</div>
      </div>
    );
  }

  return TitleBar;
}
