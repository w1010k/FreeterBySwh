/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface TranslateProvider {
  /** Translates each text into `targetLang`. Resolves with the same order and length; rejects on any failure. */
  translate(texts: string[], targetLang: string): Promise<string[]>;
}
