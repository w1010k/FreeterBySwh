/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings, SettingsMode, QueryEntry, defaultEngine, enginesById } from './settings';
import styles from './widget.module.scss';
import { SubmitEvent, useMemo, useState } from 'react';
import { querySvg } from '@/widgets/web-query/icons';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';
import { WebpageExposedApi } from '@/widgets/interfaces';

const queryPlaceholder = 'QUERY';

const replaceQueryPlaceholder = (strWithQuery: string, queryVal: string) => strWithQuery.replaceAll(queryPlaceholder, queryVal);

type WidgetApi = WidgetReactComponentProps<Settings>['widgetApi'];

function computeEntry(entry: QueryEntry, mode: SettingsMode) {
  let descr = '';
  let urlTpl = '';
  const notConfigNotes: string[] = [];

  if (mode === SettingsMode.Browser) {
    if (entry.engine !== '') {
      const engineObj = enginesById[entry.engine];
      if (engineObj) {
        descr = engineObj.descr;
        urlTpl = engineObj.url;
      } else {
        descr = defaultEngine.descr;
        urlTpl = defaultEngine.url;
      }
    } else {
      descr = entry.descr;
      urlTpl = sanitizeUrl(entry.url);
      if (urlTpl === '') {
        notConfigNotes.push('Invalid URL template')
      } else if (urlTpl.indexOf(queryPlaceholder) < 0) {
        notConfigNotes.push('Missing QUERY in URL template')
      }
    }
  } else {
    descr = entry.descr;
  }

  const queryTpl = entry.query.trim();
  if (queryTpl !== '' && queryTpl.indexOf(queryPlaceholder) < 0) {
    notConfigNotes.push('Missing QUERY in Query template')
  }

  return { descr, urlTpl, queryTpl, notConfigNotes };
}

function QueryRow({ entry, mode, widgetApi }: { entry: QueryEntry; mode: SettingsMode; widgetApi: WidgetApi }) {
  const [typedQuery, setTypedQuery] = useState('');
  const { descr, urlTpl, queryTpl, notConfigNotes } = useMemo(() => computeEntry(entry, mode), [entry, mode]);

  if (notConfigNotes.length > 0) {
    return <div className={styles['not-configured']}>{notConfigNotes[0]}</div>;
  }

  const onQuerySubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const finalQuery = queryTpl === '' ? typedQuery : replaceQueryPlaceholder(queryTpl, typedQuery);
    const queryForUrl = encodeURIComponent(finalQuery);
    setTypedQuery('');
    switch (mode) {
      case SettingsMode.Browser: {
        widgetApi.shell.openExternalUrl(replaceQueryPlaceholder(urlTpl, queryForUrl));
        break;
      }
      case SettingsMode.Webpages: {
        const webpageWidgets = widgetApi.widgets.getWidgetsInCurrentWorkflow<WebpageExposedApi>('webpage');
        for (const { api } of webpageWidgets) {
          if (api.getUrl && api.openUrl) {
            const tplUrl = api.getUrl();
            const finalUrl = replaceQueryPlaceholder(tplUrl, queryForUrl);
            if (tplUrl !== finalUrl) {
              api.openUrl(finalUrl);
            }
          }
        }
        break;
      }
    }
  };

  return (
    <form onSubmit={onQuerySubmit} className={styles['web-query-row']}>
      <input className={styles['web-query-input']} type='text' placeholder={descr} value={typedQuery} onChange={(e) => setTypedQuery(e.target.value)} />
      <Button type='submit' iconSvg={querySvg} title='Query' />
    </form>
  );
}

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  return (
    <div className={styles['web-query']}>
      {settings.entries.map(entry => (
        <QueryRow key={entry.id} entry={entry} mode={settings.mode} widgetApi={widgetApi} />
      ))}
    </div>
  )
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
