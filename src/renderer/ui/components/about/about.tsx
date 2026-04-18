/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AboutViewModelHook } from '@/ui/components/about/aboutViewModel';
import { ModalScreen } from '@/ui/components/basic/modalScreen';
import * as styles from '@/ui/components/about/about.module.scss'
import { SvgIcon } from '@/ui/components/basic/svgIcon';
import { logo150Svg } from '@/ui/assets/images/appIcons';

type Deps = {
  useAboutViewModel: AboutViewModelHook;
}

export function createAboutComponent({
  useAboutViewModel,
}: Deps) {
  function Component() {
    const {
      onCloseClick,
      onSponsorshipClick,
      aboutInfo,
    } = useAboutViewModel();

    return (
      <ModalScreen
        buttons={[
          {id: 'close', caption: 'Close', primary: true, onClick: onCloseClick},
        ]}
        title="About Freeter-SWH"
      >
        <div className={styles['about-left']}>
          <div className={styles['app-logo']}>
            <SvgIcon svg={logo150Svg} className={styles['app-logo-svg']}></SvgIcon>
          </div>
          <div className={styles['app-name']}>Freeter-SWH</div>
          <div className={styles['app-about']}>
            <span><b>Version:</b> {aboutInfo.productInfo.version}</span>
            <span><b>Date:</b> {aboutInfo.productInfo.builtAt}</span>
            <span><b>Commit:</b> {aboutInfo.productInfo.commitHash}</span>
            <span><b>Chromium:</b> {aboutInfo.browser.ver}</span>
          </div>
        </div>
        <div className={styles['about-right']}>
          <h2>포크 정보</h2>
          <p>
            이 앱은 <b>swh</b>가 개인적으로 포크·유지관리하는 <b>Freeter-SWH</b>입니다. 원본 Freeter(Alex Kaul)의 기반 위에
            사용성과 커스터마이징을 꾸준히 다듬고 있어요. 포크에서 추가·변경된 내역은 저장소의 <code>docs/CHANGES.md</code>
            또는 <code>README.md</code>에 정리되어 있습니다.
          </p>

          <h3>원본 Freeter 후원자</h3>
          <p>
            이 코드의 기반이 된 원본 Freeter는 아래 후원자 분들의 지원으로 개발·유지되어 왔습니다. 원본 프로젝트를
            응원하고 싶다면 <a href='#' onClick={onSponsorshipClick}>이 링크</a>에서 후원할 수 있습니다.
          </p>

          {
            aboutInfo.productInfo.backers.bronzeSponsors.length>0 &&
            <>
              <h3>Bronze Sponsors</h3>
              <ul className={styles['list-sponsors']}>
                {aboutInfo.productInfo.backers.bronzeSponsors.map((item, idx) => (
                  <li key={idx}>{item[0]}</li>
                ))}
              </ul>
            </>
          }

          {
            (aboutInfo.productInfo.backers.backersPlus.length>0 || aboutInfo.productInfo.backers.backers.length>0) &&
            <>
              <h3>Backers</h3>
              <ul className={styles['list-backers']}>
                {aboutInfo.productInfo.backers.backersPlus.map((item, idx) => (
                  <li key={idx}><b>{item[0]}</b></li>
                ))}
                {aboutInfo.productInfo.backers.backers.map((item, idx) => (
                  <li key={idx}>{item[0]}</li>
                ))}
              </ul>
            </>
          }

        </div>
      </ModalScreen>
    )
  }

  return Component;
}

export type AboutComponent = ReturnType<typeof createAboutComponent>;
