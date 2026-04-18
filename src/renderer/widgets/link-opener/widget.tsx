/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { openLinkSvg } from '@/widgets/link-opener/icons';
import * as styles from './widget.module.scss';
import { useCallback } from 'react';
import { useDynamicIcon } from '@/widgets/useDynamicIcon';

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const { shell, icon } = widgetApi;

  const urls = settings.urls.filter(url=>url!=='');
  const { icon: favicon, retryIfMissing } = useDynamicIcon(icon.getFavicon, urls[0] ?? '');

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
