/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetApiPty } from '@/base/widgetApi';

/** Shells in pseudo-terminals run by the main process (in-app terminals); the shape widgets get. */
export type PtyProvider = WidgetApiPty;
