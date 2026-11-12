/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TranslateProvider } from '@/application/interfaces/translateProvider';

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

// ponytail: the same free Google endpoint browser translate extensions use. It is not an official API, has no key and
// no SLA; if Google changes or rate-limits it, translation fails and the page stays as it was. Switch to the paid Cloud
// Translation API if that becomes a problem.
const endpoint = 'https://translate.googleapis.com/translate_a/t';

// Measured 2026-11-12 with 500 sentences of ~60 characters (a full widget round): 5 parallel requests of 100 took
// 120-190 ms, 5 requests one after another 510-750 ms, one request of 500 170 ms to 3.3 s. So chunks go in parallel: a full
// round of short sentences is 5 requests, more when the byte limit splits long non-Latin text. A 52 KB body worked; the
// limit counts the encoded body, where one Korean character takes 9 bytes.
const maxChunkItems = 100;
const maxChunkBodyBytes = 40000;
// A request that hangs (a proxy dropping packets) must not keep the widget waiting; the widget then shows the failure.
const requestTimeoutMs = 15000;
// About 10 full widget rounds of answers, kept for the app's lifetime (a few MB at most).
const maxCacheEntries = 5000;

// `format=html` makes the service keep `<`, `>` and `&` that we escape, instead of dropping text that looks like tags.
// The reply then comes back HTML-escaped, so it is decoded before it goes to the page as plain text.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return namedEntities[ent.toLowerCase()] ?? whole;
  });
}

// Splits the encoded `q=` params into request bodies. A single param over the byte limit still goes alone; the widget
// keeps each text short enough (`translateMaxTextChars`) for that to stay near the tested sizes.
function chunkParams(texts: string[]): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let curBytes = 0;
  for (const t of texts) {
    const param = `q=${encodeURIComponent(escapeHtml(t))}`;
    if (cur.length > 0 && (cur.length >= maxChunkItems || curBytes + param.length + 1 > maxChunkBodyBytes)) {
      chunks.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(param);
    curBytes += param.length + 1;
  }
  if (cur.length > 0) {
    chunks.push(cur);
  }
  return chunks;
}

// Reply shape: one entry per `q`, either `[translated, detectedLang]` or a bare string. Checked 2026-11-12: one `q`
// also comes back as `[[translated, lang]]`; the flat `[translated, lang]` some clients report is accepted too.
function parseReply(body: string, expected: number): string[] {
  let data: unknown = JSON.parse(body);
  if (expected === 1 && Array.isArray(data) && data.length === 2 && typeof data[0] === 'string' && typeof data[1] === 'string') {
    data = [data[0]];
  }
  if (!Array.isArray(data) || data.length !== expected) {
    throw new Error('Unexpected translation reply');
  }
  return data.map(item => {
    const t = Array.isArray(item) ? item[0] : item;
    if (typeof t !== 'string') {
      throw new Error('Unexpected translation reply');
    }
    return decodeHtmlEntities(t);
  });
}

export function createTranslateProvider(fetchFn: FetchFn): TranslateProvider {
  async function translateChunk(params: string[], targetLang: string): Promise<string[]> {
    const url = `${endpoint}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&format=html`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.join('&'),
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
    if (!res.ok) {
      throw new Error(`Translation request failed: ${res.status}`);
    }
    return parseReply(await res.text(), params.length);
  }

  // Pages that rewrite the same text (a framework resetting a node, a ticker cycling) ask for it again and again; a
  // cached answer sends nothing. Map keeps insertion order, so the oldest entry goes first when full.
  const cache = new Map<string, string>();
  const key = (lang: string, text: string) => `${lang}\u0000${text}`;

  return {
    async translate(texts, targetLang) {
      const misses = [...new Set(texts.filter(t => !cache.has(key(targetLang, t))))];
      if (misses.length > 0) {
        // One failed chunk fails the call; the widget then puts the page back as it was.
        const results = (await Promise.all(chunkParams(misses).map(params => translateChunk(params, targetLang)))).flat();
        misses.forEach((t, i) => cache.set(key(targetLang, t), results[i]));
      }
      // Read the answers before trimming, so an old entry this call still needs is not dropped first.
      const out = texts.map(t => cache.get(key(targetLang, t)) as string);
      while (cache.size > maxCacheEntries) {
        cache.delete(cache.keys().next().value as string);
      }
      return out;
    }
  };
}
