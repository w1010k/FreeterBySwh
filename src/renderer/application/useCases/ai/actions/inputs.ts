/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcResult } from '@common/ai/protocol';

/** Shared input checks for AI actions (the input comes from outside the app). */

export const asRecord = (input: unknown): Record<string, unknown> | undefined =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : undefined;

/**
 * A value (at any depth) that names a path on another computer: a UNC path (two leading slashes of
 * either kind; Windows reads '/\host' and '\/host' as UNC too) or a file: URL.
 * Windows opens such a path with the user's login (it sends the NTLM hash to that computer).
 */
export function pointsToAnotherComputer(v: unknown): boolean {
  if (typeof v === 'string') {
    // Two or more slashes and a host right after them (a code comment '// x' has a space there), the NT form '\\??\\',
    // or a file: URL (file:/... or file:\..., not text such as "File: budget.xlsx").
    return /^([\\/]{2,}[^\s\\/]|\\\?\?\\|file:[\\/])/i.test(v.trim());
  }
  if (typeof v === 'object' && v !== null) {
    return Object.values(v).some(pointsToAnotherComputer);
  }
  return false;
}

export const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Optional string field: absent is fine, present must be a string. */
export const isOptionalString = (v: unknown): v is string | undefined => v === undefined || typeof v === 'string';

export const idSchema = { type: 'string', minLength: 1 };

export const okNull: AiRpcResult = { ok: true, value: null };

export const notFound = (what: string, id: string): AiRpcResult => ({ ok: false, code: 'not_found', message: `No ${what} with id "${id}"` });
