/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createTranslateProvider, decodeHtmlEntities, FetchFn } from '@/infra/translateProvider/translateProvider';

function reply(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

// Echo service: answers each `q` with "KO:" + the decoded text, in the `[text, lang]` shape.
function echoFetch(): jest.MockedFunction<FetchFn> {
  return jest.fn(async (_url, init) => {
    const qs = new URLSearchParams(init.body).getAll('q');
    return reply(qs.map(q => [`KO:${q}`, 'en']));
  });
}

describe('translateProvider', () => {
  it('sends escaped texts to Google with the target language and decodes the reply', async () => {
    const fetchFn = echoFetch();
    const provider = createTranslateProvider(fetchFn);

    const res = await provider.translate(['Tom & Jerry <b>', 'Hello'], 'ko');

    expect(res).toEqual(['KO:Tom & Jerry <b>', 'KO:Hello']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('tl=ko');
    expect(url).toContain('format=html');
    expect(init.method).toBe('POST');
    expect(new URLSearchParams(init.body).getAll('q')).toEqual(['Tom &amp; Jerry &lt;b&gt;', 'Hello']);
  });

  it('gives every request a timeout signal', async () => {
    const fetchFn = echoFetch();

    await createTranslateProvider(fetchFn).translate(['x'], 'ko');

    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('answers repeated texts from its cache and sends each new text once', async () => {
    const fetchFn = echoFetch();
    const provider = createTranslateProvider(fetchFn);

    await expect(provider.translate(['a', 'a', 'b'], 'ko')).resolves.toEqual(['KO:a', 'KO:a', 'KO:b']);
    expect(new URLSearchParams(fetchFn.mock.calls[0][1].body).getAll('q')).toEqual(['a', 'b']);

    await expect(provider.translate(['b', 'a'], 'ko')).resolves.toEqual(['KO:b', 'KO:a']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed request', async () => {
    const fetchFn = jest.fn<ReturnType<FetchFn>, Parameters<FetchFn>>()
      .mockResolvedValueOnce(reply('', 503))
      .mockImplementation(async (_url, init) => reply(new URLSearchParams(init.body).getAll('q').map(q => `KO:${q}`)));
    const provider = createTranslateProvider(fetchFn);

    await expect(provider.translate(['a'], 'ko')).rejects.toThrow('503');
    await expect(provider.translate(['a'], 'ko')).resolves.toEqual(['KO:a']);
  });

  it('accepts bare strings in the reply', async () => {
    const provider = createTranslateProvider(jest.fn(async () => reply(['a', 'b'])));

    await expect(provider.translate(['x', 'y'], 'ko')).resolves.toEqual(['a', 'b']);
  });

  it('accepts the flat reply shape for a single text', async () => {
    const provider = createTranslateProvider(jest.fn(async () => reply(['안녕', 'en'])));

    await expect(provider.translate(['Hi'], 'ko')).resolves.toEqual(['안녕']);
  });

  it('sends the chunks in parallel and keeps the order of the replies', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFn: FetchFn = async (_url, init) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const qs = new URLSearchParams(init.body).getAll('q');
      // The first chunk answers last.
      await new Promise(res => setTimeout(res, qs[0] === 't0' ? 5 : 1));
      inFlight--;
      return reply(qs.map(q => `KO:${q}`));
    };
    const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);

    const res = await createTranslateProvider(fetchFn).translate(texts, 'ko');

    expect(maxInFlight).toBe(3);
    expect(res).toEqual(texts.map(t => `KO:${t}`));
  });

  it('fails the whole call when one chunk fails', async () => {
    const fetchFn: FetchFn = async (_url, init) => {
      const qs = new URLSearchParams(init.body).getAll('q');
      return qs[0] === 't100' ? reply('', 500) : reply(qs);
    };

    await expect(createTranslateProvider(fetchFn).translate(Array.from({ length: 250 }, (_, i) => `t${i}`), 'ko')).rejects.toThrow('500');
  });

  it('splits large inputs into chunks and keeps the order', async () => {
    const fetchFn = echoFetch();
    const provider = createTranslateProvider(fetchFn);
    const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);

    const res = await provider.translate(texts, 'ko');

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(res).toEqual(texts.map(t => `KO:${t}`));
  });

  it('starts a new chunk when the encoded body would exceed the byte limit', async () => {
    const fetchFn = echoFetch();
    const provider = createTranslateProvider(fetchFn);

    // 2500 Korean characters encode to 22500 bytes each: two would pass 40000.
    await provider.translate(['가'.repeat(2500), '나'.repeat(2500)], 'ko');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects on a non-OK status', async () => {
    const provider = createTranslateProvider(jest.fn(async () => reply('', 429)));

    await expect(provider.translate(['x'], 'ko')).rejects.toThrow('429');
  });

  it('rejects when the reply length does not match', async () => {
    const provider = createTranslateProvider(jest.fn(async () => reply([['only one', 'en']])));

    await expect(provider.translate(['x', 'y'], 'ko')).rejects.toThrow();
  });

  it('rejects when a reply item is not text', async () => {
    const provider = createTranslateProvider(jest.fn(async () => reply([[1, 'en']])));

    await expect(provider.translate(['x'], 'ko')).rejects.toThrow();
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;&apos;&#39;&#x41;&#66;')).toBe('&<>"\'\'AB');
  });

  it('leaves unknown and invalid entities as they are', () => {
    expect(decodeHtmlEntities('&foo; &#0; &#x110000; a & b')).toBe('&foo; &#0; &#x110000; a & b');
  });

  it('decodes an escaped entity only once', () => {
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;');
  });
});
