/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createTranslateTextsUseCase } from '@/application/useCases/translate/translateTexts';
import { TranslateProvider } from '@/application/interfaces/translateProvider';
import { translateMaxChars, translateMaxItems, translateMaxTextChars } from '@common/base/translate';

function setup() {
  const translateProvider: jest.MockedObject<TranslateProvider> = {
    translate: jest.fn().mockImplementation(async (texts: string[]) => texts.map(t => `KO:${t}`))
  };
  const useCase = createTranslateTextsUseCase({ translateProvider });
  return { translateProvider, useCase };
}

describe('translateTextsUseCase', () => {
  it('translates into Korean through the provider', async () => {
    const { translateProvider, useCase } = setup();

    await expect(useCase(['a', 'b'])).resolves.toEqual(['KO:a', 'KO:b']);
    expect(translateProvider.translate).toHaveBeenCalledWith(['a', 'b'], 'ko');
  });

  it('returns an empty list without a request', async () => {
    const { translateProvider, useCase } = setup();

    await expect(useCase([])).resolves.toEqual([]);
    expect(translateProvider.translate).not.toHaveBeenCalled();
  });

  it.each([
    ['not an array', 'abc'],
    ['a non-string item', ['a', 1]],
    ['too many items', Array.from({ length: translateMaxItems + 1 }, () => 'a')],
    ['too many characters', Array.from({ length: translateMaxChars / translateMaxTextChars + 1 }, () => 'a'.repeat(translateMaxTextChars))],
    ['a text over the per-text cap', ['a'.repeat(translateMaxTextChars + 1)]],
    // eslint-disable-next-line no-sparse-arrays
    ['a sparse array', [, 'a']],
  ])('rejects %s without a request', async (_name, input) => {
    const { translateProvider, useCase } = setup();

    await expect(useCase(input)).rejects.toThrow();
    expect(translateProvider.translate).not.toHaveBeenCalled();
  });

  it('accepts input exactly at the caps', async () => {
    const { useCase } = setup();
    const texts = Array.from({ length: translateMaxItems }, () => 'a'.repeat(translateMaxChars / translateMaxItems));

    await expect(useCase(texts)).resolves.toHaveLength(translateMaxItems);
  });
});
