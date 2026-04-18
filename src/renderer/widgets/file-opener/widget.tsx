/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { openFileSvg, openFolderSvg } from '@/widgets/file-opener/icons';
import * as styles from './widget.module.scss';
import { SettingsType, settingsTypeNamesCapital } from '@/widgets/file-opener/settingsType';
import { useCallback } from 'react';
import { useDynamicIcon } from '@/widgets/useDynamicIcon';

function WidgetComp({settings, widgetApi, sharedState}: WidgetReactComponentProps<Settings>) {
  const { shell, icon } = widgetApi;
  const { files, folders, type, openIn } = settings;
  const {apps} = sharedState.apps;
  const openInApp = openIn !== '' ? apps[openIn] : undefined;

  const paths = (type === SettingsType.Folder ? folders : files).filter(path=>path!=='');
  const fallbackIconSvg = type === SettingsType.Folder ? openFolderSvg : openFileSvg;
  const { icon: osIcon, retryIfMissing } = useDynamicIcon(icon.getFileIcon, paths[0] ?? '');

  const onBtnClick: React.MouseEventHandler<HTMLButtonElement> = useCallback(_ => {
    if (openInApp) {
      const { execPath, cmdArgs} = openInApp.settings;
      shell.openApp( execPath, [...cmdArgs ? [cmdArgs] : [], ...paths])
    } else {
      paths.forEach(path => shell.openPath(path))
    }
    retryIfMissing();
  }, [openInApp, paths, shell, retryIfMissing])

  return paths.length>0
    ? <Button
        onClick={onBtnClick}
        iconSvg={fallbackIconSvg}
        iconImgSrc={osIcon ?? undefined}
        title={`Open ${settingsTypeNamesCapital[settings.type]}${paths.length>1 ? 's' : ''}`}
        size='Fill'
      />
    : <div className={styles['not-configured']}>
      {`${settingsTypeNamesCapital[settings.type]}s not specified`}
    </div>
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
