/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';
import styles from './settings.module.scss';

export enum SettingsMode {
  Browser = 1,
  Webpages = 2,
}
const settingsModes = [SettingsMode.Browser, SettingsMode.Webpages] as const;
function isSettingsMode(val: unknown): val is SettingsMode {
  if (settingsModes.indexOf(val as SettingsMode)>-1) {
    return true;
  }

  return false;
}


export interface SettingsEngine {
  id: string;
  name: string;
  descr: string;
  url: string;
}

const engineDdgo: SettingsEngine = {id: 'ddgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=QUERY', descr: 'Search'};
const engines: SettingsEngine[] = [
  {id: 'aladin', name: 'Aladin', url: 'https://www.aladin.co.kr/search/wsearchresult.aspx?SearchWord=QUERY', descr: 'Search for books'},
  {id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=QUERY', descr: 'Search'},
  {id: 'bing-imgs', name: 'Bing (Images)', url: 'https://www.bing.com/images/search?q=QUERY', descr: 'Search for images'},
  {id: 'bing-maps', name: 'Bing (Maps)', url: 'https://www.bing.com/maps/search?q=QUERY', descr: 'Search for maps'},
  {id: 'bing-news', name: 'Bing (News)', url: 'https://www.bing.com/news/search?q=QUERY', descr: 'Search for news'},
  {id: 'bing-vids', name: 'Bing (Videos)', url: 'https://www.bing.com/videos/search?q=QUERY', descr: 'Search for videos'},
  {id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/?q=QUERY', descr: 'Ask AI'},
  {id: 'claude', name: 'Claude', url: 'https://claude.ai/new?q=QUERY', descr: 'Ask AI'},
  {id: 'daum', name: 'Daum', url: 'https://search.daum.net/search?q=QUERY', descr: 'Search'},
  engineDdgo,
  {id: 'ddgo-lite', name: 'DuckDuckGo (Lite)', url: 'https://lite.duckduckgo.com/lite/?q=QUERY', descr: 'Search'},
  {id: 'ddgo-imgs', name: 'DuckDuckGo (Images)', url: 'https://duckduckgo.com/?q=QUERY&iax=images&ia=images', descr: 'Search for images'},
  {id: 'ddgo-maps', name: 'DuckDuckGo (Maps)', url: 'https://duckduckgo.com/?q=QUERY&iax=maps&ia=maps', descr: 'Search for maps'},
  {id: 'ddgo-news', name: 'DuckDuckGo (News)', url: 'https://duckduckgo.com/?q=QUERY&iar=news&ia=news', descr: 'Search for news'},
  {id: 'ddgo-vids', name: 'DuckDuckGo (Videos)', url: 'https://duckduckgo.com/?q=QUERY&iax=videos&ia=videos', descr: 'Search for videos'},
  {id: 'goog', name: 'Google', url: 'https://www.google.com/search?q=QUERY', descr: 'Search'},
  {id: 'goog-imgs', name: 'Google (Images)', url: 'https://www.google.com/search?q=QUERY&tbm=isch', descr: 'Search for images'},
  {id: 'goog-maps', name: 'Google (Maps)', url: 'https://www.google.com/maps/search/QUERY', descr: 'Search for maps'},
  {id: 'goog-news', name: 'Google (News)', url: 'https://www.google.com/search?q=QUERY&tbm=nws', descr: 'Search for news'},
  {id: 'goog-vids', name: 'Google (Videos)', url: 'https://www.google.com/search?q=QUERY&tbm=vid', descr: 'Search for videos'},
  {id: 'goog-trans', name: 'Google Translate', url: 'https://translate.google.com/?sl=auto&tl=ko&text=QUERY&op=translate', descr: 'Translate'},
  {id: 'gscholar', name: 'Google Scholar', url: 'https://scholar.google.com/scholar?q=QUERY', descr: 'Search papers'},
  {id: 'kakao-maps', name: 'Kakao Map', url: 'https://map.kakao.com/?q=QUERY', descr: 'Search for maps'},
  {id: 'kyobo', name: 'Kyobo Book', url: 'https://search.kyobobook.co.kr/search?keyword=QUERY', descr: 'Search for books'},
  {id: 'namu', name: 'Namuwiki', url: 'https://namu.wiki/Search?q=QUERY', descr: 'Search Namuwiki'},
  {id: 'nvr', name: 'Naver', url: 'https://search.naver.com/search.naver?query=QUERY', descr: 'Search'},
  {id: 'nvr-maps', name: 'Naver (Maps)', url: 'https://map.naver.com/p/search/QUERY', descr: 'Search for maps'},
  {id: 'nvr-shop', name: 'Naver (Shopping)', url: 'https://search.shopping.naver.com/ns/search?query=QUERY', descr: 'Search for products'},
  {id: 'nvr-stock', name: 'Naver (Stock)', url: 'https://stock.naver.com/domestic/stock/QUERY/price', descr: 'Stock code, e.g. 005930'},
  {id: 'nvr-dict', name: 'Naver (Dictionary)', url: 'https://dict.naver.com/#/search?query=QUERY', descr: 'Look up words'},
  {id: 'nvr-news', name: 'Naver (News)', url: 'https://search.naver.com/search.naver?where=news&query=QUERY', descr: 'Search for news'},
  {id: 'ovrs', name: 'Openverse (All Content)', url: 'https://openverse.org/search/?q=QUERY', descr: 'Search for content'},
  {id: 'ovrs-auds', name: 'Openverse (Audio)', url: 'https://openverse.org/search/audio?q=QUERY', descr: 'Search for audio'},
  {id: 'ovrs-imgs', name: 'Openverse (Images)', url: 'https://openverse.org/search/image?q=QUERY', descr: 'Search for images'},
  {id: 'papago', name: 'Papago', url: 'https://papago.naver.com/?sk=auto&tk=ko&st=QUERY', descr: 'Translate'},
  {id: 'plx', name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=QUERY', descr: 'Ask AI'},
  {id: 'wkpd', name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=QUERY', descr: 'Search Wikipedia'},
  {id: 'wfal', name: 'Wolfram|Alpha', url: 'https://www.wolframalpha.com/input?i=QUERY', descr: 'Calculate / Know about'},
  {id: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=QUERY', descr: 'Search for videos'},
]
export const defaultEngine = engineDdgo;

export const enginesById = Object.fromEntries(engines.map(item => [item.id, item]));

/**
 * A specific placeholder/description for a built-in engine, e.g. "Search Google"
 * instead of just "Search" — so multiple query boxes are distinguishable. Avoids
 * duplication when the action phrase already names the engine (e.g. "Search Wikipedia").
 */
export function enginePlaceholder(engine: SettingsEngine): string {
  return engine.descr.toLowerCase().includes(engine.name.toLowerCase())
    ? engine.descr
    : `${engine.descr} ${engine.name}`;
}

/** A single query box within the widget. The widget holds a list of these. */
export interface QueryEntry {
  id: string;
  engine: string;
  descr: string;
  query: string;
  url: string;
}

export interface Settings {
  mode: SettingsMode;
  entries: QueryEntry[];
}

let entryIdCounter = 0;
function genEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  entryIdCounter += 1;
  return `e${Date.now()}-${entryIdCounter}`;
}

type RawEntry = Partial<QueryEntry> & Record<string, unknown>;

// Normalize a single (possibly legacy/partial) entry, applying the same
// engine/descr/url rules the widget used to apply to its single config.
function normalizeEntry(raw: RawEntry | undefined, mode: SettingsMode): QueryEntry {
  const src: RawEntry = raw || {};
  const id = typeof src.id === 'string' && src.id !== '' ? src.id : genEntryId();
  const query = typeof src.query === 'string' ? src.query : '';

  if (mode === SettingsMode.Browser) {
    if (typeof src.engine === 'string') {
      if (src.engine !== '') {
        const engineObj = enginesById[src.engine] || defaultEngine;
        return { id, engine: engineObj.id, descr: '', url: '', query };
      }
      // custom engine
      return {
        id,
        engine: '',
        descr: typeof src.descr === 'string' ? src.descr : '',
        url: typeof src.url === 'string' ? src.url : '',
        query
      };
    }
    // engine missing / non-string -> fall back to the default engine
    return { id, engine: defaultEngine.id, descr: '', url: '', query };
  }

  // Webpages mode
  return {
    id,
    engine: '',
    descr: typeof src.descr === 'string' ? src.descr : 'Search',
    url: '',
    query
  };
}

export function makeNewEntry(mode: SettingsMode): QueryEntry {
  return normalizeEntry({ engine: mode === SettingsMode.Browser ? defaultEngine.id : '' }, mode);
}

export const createSettingsState: CreateSettingsState<Settings> = (settings) => {
  const mode = isSettingsMode(settings.mode) ? settings.mode : SettingsMode.Browser;

  let rawEntries: unknown[] | undefined;
  if (Array.isArray(settings.entries)) {
    rawEntries = settings.entries;
  } else if (
    typeof settings.engine === 'string' ||
    typeof settings.descr === 'string' ||
    typeof settings.url === 'string' ||
    typeof settings.query === 'string'
  ) {
    // Legacy single-config shape — wrap it as the first (and only) entry.
    rawEntries = [{
      engine: settings.engine,
      descr: settings.descr,
      url: settings.url,
      query: settings.query
    }];
  }

  let entries = (rawEntries || []).map(e => normalizeEntry(e as RawEntry, mode));
  if (entries.length === 0) {
    entries = [makeNewEntry(mode)];
  }

  return { mode, entries };
}

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;

  function updMode(newModeId: string) {
    const val = Number.parseInt(newModeId);
    const mode = isSettingsMode(val) ? val : SettingsMode.Browser;
    // When switching to Webpages mode, carry each entry's engine description so
    // the query field still shows a meaningful placeholder (mirrors old behavior).
    const entries = mode === SettingsMode.Webpages
      ? settings.entries.map(e => ({
          ...e,
          engine: '',
          url: '',
          descr: (e.engine !== '' && enginesById[e.engine]?.descr) || e.descr
        }))
      : settings.entries;
    updateSettings({ ...settings, mode, entries });
  }

  function updEntry(id: string, patch: Partial<QueryEntry>) {
    updateSettings({
      ...settings,
      entries: settings.entries.map(e => (e.id === id ? { ...e, ...patch } : e))
    });
  }

  function updEntryEngine(id: string, newEngineId: string) {
    const entry = settings.entries.find(e => e.id === id);
    if (!entry) {
      return;
    }
    if (newEngineId === '') {
      // Switching to Custom: seed descr/url from the engine being left behind.
      const curEngineObj = enginesById[entry.engine];
      updEntry(id, curEngineObj
        ? { engine: '', descr: curEngineObj.descr, url: curEngineObj.url }
        : { engine: '' });
    } else {
      updEntry(id, { engine: newEngineId });
    }
  }

  function addEntry() {
    updateSettings({ ...settings, entries: [...settings.entries, makeNewEntry(settings.mode)] });
  }

  function removeEntry(id: string) {
    const entries = settings.entries.filter(e => e.id !== id);
    updateSettings({ ...settings, entries: entries.length > 0 ? entries : [makeNewEntry(settings.mode)] });
  }

  function moveEntry(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= settings.entries.length) {
      return;
    }
    const entries = [...settings.entries];
    [entries[idx], entries[target]] = [entries[target], entries[idx]];
    updateSettings({ ...settings, entries });
  }

  return (
    <>
      <SettingBlock
        titleForId='web-query-mode'
        title='Mode'
        moreInfo={`By default, the widget performs queries using a Browser app.
To run queries within webpage widgets in the same workflow, switch to Webpages mode.

Make sure that any Webpage widget you want to use for queries includes the capitalized word QUERY in its URL setting. This acts as a placeholder and will be automatically replaced with the actual query entered in the Web Query widget.`}
      >
        <select id="web-query-mode" value={settings.mode} onChange={e => {
          updMode(e.target.value)
        }}>
          <option value={SettingsMode.Browser}>Browser App</option>
          <option value={SettingsMode.Webpages}>Webpage Widgets</option>
        </select>
      </SettingBlock>

      <SettingBlock
        title='Queries'
        moreInfo='Each row below becomes its own query input in the widget. The placeholder shows which engine it queries. For Custom Engine, put the capitalized word QUERY in the URL/Query template — it is replaced with what you type.'
      >
        <div className={styles['entries']}>
          {settings.entries.map((entry, idx) => {
            const showDescr = settings.mode !== SettingsMode.Browser || entry.engine === '';
            const showUrl = settings.mode === SettingsMode.Browser && entry.engine === '';
            return (
              <div key={entry.id} className={styles['entry']} data-testid={`entry-${idx}`}>
                <span className={styles['num']}>#{idx + 1}</span>
                <button type="button" aria-label={`Move query #${idx + 1} up`} disabled={idx === 0} onClick={() => moveEntry(idx, -1)}>↑</button>
                <button type="button" aria-label={`Move query #${idx + 1} down`} disabled={idx === settings.entries.length - 1} onClick={() => moveEntry(idx, 1)}>↓</button>
                {settings.mode === SettingsMode.Browser && <select
                  aria-label="Query Engine"
                  value={entry.engine}
                  onChange={e => updEntryEngine(entry.id, e.target.value)}
                >
                  <option key='' value=''>Custom Engine</option>
                  {engines.map(engine => (
                    <option key={engine.id} value={engine.id}>{engine.name}</option>
                  ))}
                </select>}
                {showDescr && <input
                  aria-label="Description"
                  className={styles['descr']}
                  type="text"
                  value={entry.descr}
                  maxLength={100}
                  onChange={e => updEntry(entry.id, { descr: e.target.value })}
                  placeholder="Description"
                />}
                {showUrl && <input
                  aria-label="URL Template"
                  className={styles['url']}
                  type="text"
                  value={entry.url}
                  maxLength={2000}
                  onChange={e => updEntry(entry.id, { url: e.target.value })}
                  placeholder="URL template (with QUERY)"
                />}
                <input
                  aria-label="Query Template"
                  className={styles['query']}
                  type="text"
                  value={entry.query}
                  onChange={e => updEntry(entry.id, { query: e.target.value })}
                  placeholder="Query template (optional)"
                />
                <button type="button" aria-label={`Remove query #${idx + 1}`} onClick={() => removeEntry(entry.id)}>✕</button>
              </div>
            );
          })}
        </div>
        <button type="button" className={styles['add']} onClick={addEntry}>+ Add query</button>
      </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
