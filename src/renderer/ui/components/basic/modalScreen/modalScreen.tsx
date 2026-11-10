/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ButtonProps } from '@/ui/components/basic/button';
import styles from './modalScreen.module.scss';
import clsx from 'clsx';
import { useEffect, useEffectEvent, useId, useRef } from 'react';

export interface ModalScreenProps extends React.PropsWithChildren<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>> {
  buttons: Array<ButtonProps & {id: string}>;
  title: string;
  /** Escape does this. Only for a screen with nothing to lose (About's Close): a settings screen's Cancel drops its edits. */
  onEscape?: () => void;
}

/**
 * A full-window dialog. The app stacks them, makes all but the top one inert, moves the focus into the top one when it
 * changes, and gives the focus back to what opened a screen when it closes (ModalLayer in app.tsx).
 */
export const ModalScreen = ({
  buttons,
  title,
  onEscape,
  className,
  children,
  ...restProps
}: ModalScreenProps) => {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // The screen's content can mount a render after its layer (it waits for its data), so it takes the focus itself too.
  useEffect(() => {
    const el = ref.current;
    if (el && !el.closest('[inert]') && !el.contains(document.activeElement)) {
      el.focus();
    }
  }, []);

  // On the window, not this element: Escape works even when the focus fell to the body (a focused field unmounted).
  // Only the top screen answers (the others are inside an inert wrapper). A field that handles Escape itself calls
  // preventDefault; Escape that ends an IME composition is not for the dialog; a held key (auto-repeat) does not go on
  // to close the screen below. Not inside a <webview> (a widget preview): its keys do not reach this window.
  const escape = useEffectEvent((e: KeyboardEvent) => {
    if (onEscape) {
      e.preventDefault();
      onEscape();
    }
  });
  const hasEscape = !!onEscape;
  useEffect(() => {
    if (!hasEscape) {
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key === 'Escape' && !e.defaultPrevented && !e.isComposing && !e.repeat && el && !el.closest('[inert]')) {
        escape(e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasEscape]);

  return (
    <div
      {...restProps}
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={clsx(className, styles['modal-screen'])}
    >
      <header className={styles['modal-screen-header']}>
        <h2 id={titleId}>{title}</h2>
        <div>{buttons.map(({id, ...btnProps})=><Button key={id} size="L" {...btnProps}></Button>)}</div>
      </header>
      <section className={styles['modal-screen-body']}>
        {children}
      </section>
    </div>
  )
}
