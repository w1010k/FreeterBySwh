/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { openLinkSvg } from '@/widgets/link-opener/icons';
import * as styles from './widget.module.scss';
import { useCallback, useEffect, useMemo } from 'react';
import { useDynamicIcon } from '@/widgets/useDynamicIcon';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';

function hostFromUrl(raw: string): string {
  try {
    const u = new URL(sanitizeUrl(raw));
    return u.host || raw;
  } catch {
    return raw;
  }
}

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const { shell, icon, setDynamicTitle } = widgetApi;

  const urls = useMemo(() => settings.urls.filter(url => url !== ''), [settings.urls]);
  const { icon: favicon, retryIfMissing } = useDynamicIcon(icon.getFavicon, urls[0] ?? '');

  useEffect(() => {
    const first = urls[0];
    if (!first) {
      setDynamicTitle(null);
      return undefined;
    }
    const base = hostFromUrl(first);
    const label = urls.length > 1 ? `${base} (+${urls.length - 1})` : base;
    setDynamicTitle(label);
    return () => setDynamicTitle(null);
  }, [urls, setDynamicTitle]);

  const onClick = useCallback(() => {
    urls.forEach(url => shell.openExternalUrl(url));
    retryIfMissing();
  }, [urls, shell, retryIfMissing]);

  return urls.length>0
    ? <Button
        onClick={onClick}
        iconSvg={openLinkSvg}
        iconImgSrc={favicon ?? undefined}
        title={`Open Link${urls.length>1 ? 's' : ''}`}
        size='Fill'
      />
    : <div className={styles['not-configured']}>
      {'URLs not specified'}
    </div>
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
