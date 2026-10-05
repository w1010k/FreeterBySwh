/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Component, ReactNode } from 'react';
import styles from './widget.module.scss';

interface Props {
  /** Changing this value (e.g. the widget's settings object) clears a caught error. */
  resetKey: unknown;
  children: ReactNode;
}

interface State {
  error: string | null;
  resetKey: unknown;
}

/**
 * Keeps one widget's render or effect error inside that widget. Without it the
 * error reaches the React root, which then unmounts every widget on screen.
 * The widget can be retried, and new settings retry it automatically.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(err: unknown): Partial<State> {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <div className={styles['widget-error']} role='alert'>
        <p>This widget stopped because of an error.</p>
        <p className={styles['widget-error-message']}>{this.state.error}</p>
        <button onClick={() => this.setState({ error: null })}>Retry</button>
      </div>
    );
  }
}
