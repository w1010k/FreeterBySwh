/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { SvgIcon } from '@/ui/components/basic/svgIcon';
import styles from './moreInfo.module.scss';
import clsx from 'clsx';
import { circleQuestion16Svg } from '@/ui/assets/images/appIcons';

export interface MoreInfoProps {
  info: string;
  className?: string;
  /** false: the help is read with what holds it (aria-description there), so the icon is no Tab stop. */
  focusable?: boolean;
}

export const MoreInfo = ({
  info,
  className,
  focusable = true
}: MoreInfoProps) => (
  // A Tab stop that reads out (aria-label) and shows (data-info, CSS) the help: a title tooltip alone needs a mouse.
  <span title={info} className={clsx(styles['more-info'], className)}
    {...(focusable ? { tabIndex: 0, role: 'img', 'aria-label': info, 'data-info': info } : { 'aria-hidden': true })}>
    <SvgIcon svg={circleQuestion16Svg} className={styles['more-info-icon']}/>
  </span>
)
