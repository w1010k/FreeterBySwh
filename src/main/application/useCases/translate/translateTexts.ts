/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TranslateProvider } from '@/application/interfaces/translateProvider';
import { translateMaxChars, translateMaxItems, translateMaxTextChars } from '@common/base/translate';

interface Deps {
  translateProvider: TranslateProvider;
}

// ponytail: Korean only, the language this fork's users read. Add a widget setting if another target is needed.
const targetLang = 'ko';

export function createTranslateTextsUseCase({ translateProvider }: Deps) {
  return async function translateTextsUseCase(texts: unknown): Promise<string[]> {
    if (!Array.isArray(texts)) {
      throw new Error('texts must be an array of strings');
    }
    if (texts.length > translateMaxItems) {
      throw new Error(`Too many texts: ${texts.length}`);
    }
    // An index loop, not every(): every() skips holes in a sparse array.
    let chars = 0;
    for (let i = 0; i < texts.length; i++) {
      const t: unknown = texts[i];
      if (typeof t !== 'string') {
        throw new Error('texts must be an array of strings');
      }
      if (t.length > translateMaxTextChars) {
        throw new Error('A text is too long');
      }
      chars += t.length;
    }
    if (chars > translateMaxChars) {
      throw new Error('Texts are too long');
    }
    if (texts.length === 0) {
      return [];
    }
    return translateProvider.translate(texts, targetLang);
  };
}

export type TranslateTextsUseCase = ReturnType<typeof createTranslateTextsUseCase>;
