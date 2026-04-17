/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Entity } from '@/base/entity';

/**
 * A user-defined bucket of widget data shared between multiple widgets of the
 * same type. The `widgetType` field creates an isolated namespace per type
 * (e.g. a note key and a to-do-list key can share the same name but are
 * independent).
 */
export interface SharedDataKey extends Entity {
  widgetType: string;
  name: string;
}
