## 설계 결정 기록

코드가 지금 모양인 이유와 버린 대안을 모았다. 대체된 결정도 지우지 않고 상태로 표시한다.

- 출처 표시: `[upstream]` upstream v2.8.0-beta에 있던 것, `[fork #N]` `docs/CHANGES.md` 섹션 N, `[fork]` 대응 섹션이 없는 포크 결정.
- 이유가 코드 주석, 커밋 메시지, CHANGES 어디에도 없으면 "(기록 없음)"으로 적는다. "버린 대안"은 기록이 있을 때만 적는다.
- 상태: `유효`, `대체됨: Dn`, `일부 대체: Dn`.

### upstream 구조

#### D1. 세 surface와 레이어 구조

- 상태: 유효
- 출처: `[upstream]`
- 결정: 코드를 `src/main`, `src/renderer`, `src/common` 세 surface로 나누고, 각 surface를 `base`/`application`/`infra`/`data`(+
  renderer `ui`)로 나눈다. use case는 `create<Name>UseCase(deps)` 팩토리이고 조립은 `src/main/index.ts`, `src/renderer/init.ts`에서 한다.
- 이유: (기록 없음)
- 근거: `CLAUDE.md` Architecture 절, `src/renderer/init.ts`, `src/main/index.ts`

#### D2. 컴포넌트 팩토리 주입

- 상태: 유효
- 출처: `[upstream]`
- 결정: UI 컴포넌트를 `createXComponent({deps})` 팩토리로 만들고 view-model hook을 주입한다.
- 이유: (upstream 기록 없음) `CLAUDE.md`는 "DI-friendly and testable"이라고 적지만, 이 문장은 포크가 쓴 해석이다.
- 근거: `CLAUDE.md`, `src/renderer/ui/components/widget/widgetViewModel.ts`

#### D3. Zustand vanilla store 래퍼

- 상태: 유효 (포크가 확장)
- 출처: `[upstream, fork #30 #49 변경]`
- 결정: `src/common/data/store.ts`가 Zustand vanilla store를 감싸 `isLoading`, `prepareState`, `mergeState`, 매 `set` 자동 저장을
  붙인다. 영속 상태는 런타임 상태의 subset이다. 포크는 `flush()`(#30), no-op `set`의 저장 생략 (#30), 로드 검증기 (#49)를 더했다.
- 이유: upstream 구조는 (기록 없음). 포크 확장의 이유는 종료 직전 변경 손실 방지 (#30), 손상 데이터가 자동 저장으로 굳는 것 방지 (#49)다.
- 근거: CHANGES #30, #49, `src/common/data/store.ts` `createStore`, `src/common/data/stateStorage.ts` `createStateStorage`

#### D4. preload API의 1회 전달

- 상태: 유효
- 출처: `[upstream]`
- 결정: preload는 `MainApi`를 `window`에 두지 않고 `getMainApiOnce()`로 한 번만 넘긴다. IPC 리스너에는 Electron `Event`를 빼고 인자만 넘긴다.
- 이유: 코드 주석 기록. "renderer의 아무 코드나 접근할 수 있는 global window에 두지 않고, 격리된 의존성으로 만들기 위해 한 번만 반환한다." Event 제거는 "ipcRenderer에
  접근할 수 없게 하기 위한 보안상 이유"다.
- 근거: `src/renderer/preload/index.ts` `getMainApiOnce`

#### D5. IPC 발신자 검증

- 상태: 유효
- 출처: `[upstream]`
- 결정: main의 IPC 래퍼는 채널 접두사 `freeter:`, 발신 프레임 host `freeter-app`, 메인 프레임 여부를 모두 통과한 요청만 처리한다.
- 이유: (기록 없음)
- 근거: `src/main/infra/ipcMain/ipcMainEventValidator.ts` `createIpcMainEventValidator`

#### D6. 위젯 capability 선언

- 상태: 유효
- 출처: `[upstream]`
- 결정: 위젯 타입은 `requiresApi`(필요한 `WidgetApi` 모듈)와 `requiresState`(필요한 공유 상태 slice)를 선언하고, 런타임 `WidgetApi`는 선언된 모듈만으로 만든다.
- 이유: (기록 없음)
- 근거: `src/renderer/base/widgetType.ts`, `src/renderer/base/widgetApi.ts` `createWidgetApiFactory`

#### D7. Memory Saver

- 상태: 유효
- 출처: `[upstream]`
- 결정: 현재 화면이 아닌 워크플로우를 설정 `workflowInactiveAfter`에 따라 비활성화 (언마운트)한다. `-1`은 프로젝트 전환 때, `0`은 프로젝트나 워크플로우 전환 때, 양수 N은 전환 N분
  뒤다. 아직 활성인 워크플로우는 `visibility: hidden`으로 숨긴 채 마운트를 유지한다.
- 이유: 설정 화면 문구 기록. 비활성 워크플로우의 메모리를 풀어 활성 워크플로우에 자원을 더 주고 앱을 빠르게 유지한다.
- 근거: `src/renderer/ui/components/applicationSettings/applicationSettings.tsx` (Memory Saver `moreInfo`),
  `src/renderer/base/memSaver.ts` (옵션 이름), `src/renderer/application/useCases/memSaver/`

#### D8. 앱 번들용 커스텀 프로토콜

- 상태: 유효
- 출처: `[upstream]`
- 결정: renderer 번들을 `freeter-file://freeter-app` 커스텀 프로토콜로 서빙한다. 개발 모드는 `http://localhost:4000`을 프록시한다. 이 프로토콜은 번들 파일만
  서빙한다.
- 이유: (기록 없음)
- 근거: `src/main/infra/protocolHandler/registerAppFileProtocol.ts`, `src/common/infra/network.ts`

#### D9. 버전 래퍼와 마이그레이션

- 상태: 유효
- 출처: `[upstream]`
- 결정: 영속 상태를 버전 래퍼 (`createVersionedObject`)로 저장하고 로드 때 `migrate`로 올린다. 앱 상태 현재 버전은 2다.
- 이유: (기록 없음)
- 근거: `src/common/data/stateStorage.ts`, `src/renderer/base/state/app.ts` `migrateAppState`, `currentAppStateVersion`

### 포크 운영

#### D10. 앱 아이덴티티 분리

- 상태: 유효
- 출처: `[fork #1]`
- 결정: `appId`(`io.freeter.app.swh`), productName (`Freeter-SWH`), `package.json` `name`(`freeter-swh`), 데이터 폴더,
  창·트레이·메뉴·다이얼로그 라벨을 원본과 다르게 한다. 설정 화면의 제품 설명 문구 (`moreInfo`)는 원본 그대로 둔다.
- 이유: 원본 앱과 동시에 설치·실행하고, 원본 설정을 덮어쓰거나 공유하지 않기 위해서다. `appId`가 다르면 단일 인스턴스 잠금도 분리된다. 제품 설명은 오픈소스 프로젝트를 서술하는 산문이라 원본 이름을
  유지한다.
- 근거: CHANGES #1, `electron-builder.config.js`, `package.json`, `src/main/index.ts`

#### D11. 개발 실행과 설치판의 분리

- 상태: 유효
- 출처: `[fork #80]`
- 결정: 저장소에서 띄운 실행 (`app.isPackaged`가 거짓)은 `freeter-swh-dev` 폴더, 별도 세션, 별도 잠금을 쓰고 창 제목에 `(dev)`를 붙인다. 설치판 경로는 바꾸지 않는다.
- 이유: 개발 중 조작이 실제 데이터에 닿지 않게 하고, 설치판이 떠 있어도 개발판을 띄우기 위해서다.
- 버린 대안: `NODE_ENV` 판별 (`yarn prod:run`은 프로덕션 빌드지만 설치판이 아님). 양쪽 모두 명시 경로로 통일 (대소문자를 구분하는 macOS·Linux에서 기존 설치판의 세션·캐시 위치가
  바뀜).
- 근거: CHANGES #80, `src/main/index.ts` `dataDirName`

#### D12. Yarn 1 유지

- 상태: 유효
- 출처: `[fork]`
- 결정: upstream v2.8.0-beta가 npm으로 전환했지만 포크는 Yarn 1 Classic을 유지한다.
- 이유: (기록 없음) `CLAUDE.md`는 규칙 ("do not use npm")만 적는다.
- 근거: `CLAUDE.md`, 커밋 0ebf9ac 메시지

#### D13. 포크 버전 형식

- 상태: 유효
- 출처: `[fork]`
- 결정: 버전은 `<upstream-base>-swh.N`이다. 2.8 병합 뒤 `2.8.0-swh.1`부터 시작했고 현재 `2.8.0-swh.17`이다.
- 이유: (기록 없음)
- 근거: 커밋 0ebf9ac 메시지 ("버전: 2.8.0-swh.1"), git 태그 `v2.8.0-swh.*`, `package.json` `version`

#### D14. Electron 36 → 41 업그레이드

- 상태: 대체됨: D15 (upstream 2.8 병합으로 Electron `^42.1.0`)
- 출처: `[fork #2]`
- 결정: Electron을 36.4.0에서 41.2.1로 올렸다.
- 이유: Webpage 위젯이 Electron 내장 Chromium을 쓰므로 Chromium을 올리려면 Electron 메이저 업이 필요하다. 최신 사이트 호환성과 보안 개선.
- 근거: CHANGES #2, `package.json`

#### D15. upstream 2.8 병합 방식

- 상태: 유효
- 출처: `[fork]`
- 결정: upstream의 의존성 버전 업 (Electron 42, React 19.2, Zustand 5, Jest 30, TypeScript 6 등)과 코드 규약 (SCSS default import)은 받고,
  npm 전환 (`package-lock.json`, npm 스크립트·CI)은 받지 않는다. `react-hooks/set-state-in-effect`, `react-hooks/refs` 규칙은 warn으로
  낮춘다.
- 이유: lint 규칙 완화는 코드 주석 기록. "새로 켜진 두 규칙이 포크 위젯의 의도된 패턴을 잡아서, 병합이 막히지 않도록 경고로 낮춘다. 나중에 재검토한다."
- 근거: 커밋 0ebf9ac 메시지, `src/renderer/eslint.config.mjs`

#### D16. 기본 글로벌 단축키 변경

- 상태: 유효
- 출처: `[fork #20]`
- 결정: 기본 메인 단축키를 `CmdOrCtrl+Shift+F`에서 `CmdOrCtrl+Shift+Space`로 바꾼다. 저장된 설정이 있는 사용자는 그대로다.
- 이유: 원본과 동시에 실행하면 같은 단축키를 OS가 한쪽에만 등록한다.
- 근거: CHANGES #20, `src/renderer/base/state/ui.ts` `createUiState`

#### D59. macOS 배포 중단

- 상태: 유효
- 출처: `[fork #89]`
- 결정: CD에서 macOS job을 빼고, `electron-builder.config.js`의 `mac`, `dmg` 설정과 `resources/darwin/`을 지운다. 소스의 macOS 분기
  (`process.platform === 'darwin'` 등)는 그대로 둔다.
- 이유: 포크 사용자는 Windows만 쓴다. CD 작업은 직렬이라 macOS job 시간만큼 릴리스가 늦어졌다. 소스 분기는 짧은 조건문이라 지워도 얻는 것이 적고, upstream 병합 때
  충돌만 늘린다.
- 버린 대안: 소스의 macOS 분기까지 제거 (병합 충돌 증가, 다른 조건과 섞인 분기를 지울 때 Windows 동작이 바뀔 위험).
- 근거: CHANGES #89, `.github/workflows/cd.yml`, `electron-builder.config.js`

### Webpage 위젯과 webview

#### D17. 새 창 요청의 현재 webview 열기

- 상태: 대체됨: D18
- 출처: `[fork #3]`
- 결정: `target="_blank"`와 `window.open(url)`은 현재 webview에서 열고, 진짜 팝업만 내부 팝업 창으로 연다.
- 이유: 단일 탭 브라우저처럼 쓰려는 사용자에게 매번 뜨는 팝업 창이 번거로웠다.
- 근거: CHANGES #3

#### D18. 새 탭과 팝업의 열기 위치 분리

- 상태: 유효
- 출처: `[fork #13]`
- 결정: `setWindowOpenHandler`에서 새 탭 성격의 요청은 기본 브라우저로 보내고, 팝업 성격 (`disposition === 'new-window'` 또는 features에 `popup`)은 내부
  `BrowserWindow`로 연다.
- 이유: 새 탭 링크는 "위젯 밖에서 보고 싶다"는 신호다. OAuth 팝업은 `window.opener.postMessage`로 결과를 돌려주고, opener 참조는 같은 Electron 프로세스 안에서만
  유효하다.
- 버린 대안: 모든 요청을 외부로 보내기 (초기 구현, OAuth가 깨져 되돌림). webview에 preload를 주입해 `<a>` 클릭 가로채기 (Chromium이 같은 프레임 이동과 새 창 요청을 이미
  분리하므로 과함).
- 보완: D58 (외부로 보내는 URL의 스킴 제한)
- 근거: CHANGES #13, `src/main/infra/browserWindow/browserWindow.ts`

#### D58. 게스트 URL 외부 열기의 스킴 허용 목록

- 상태: 유효
- 출처: `[fork #88]`
- 결정: Webpage 위젯의 게스트 페이지에서 온 URL은 스킴이 `http:`, `https:`, `mailto:`일 때만 OS로 넘긴다. 검사 함수는 `isAllowedExternalUrl`이다. 적용 위치는 앱 코드의
  4곳 (새 탭 분기, `Ctrl+T` 분기, `openCurrentInBrowser`, `openLinkInBrowser`)과, 같은 프레임 이동을 받는 세션 권한 처리기 (`registerPermissionHandler`의
  `openExternal` 판정)다. 허용되지 않은 스킴은 알림 없이 무시한다.
- 이유: `sanitizeUrl`은 스킴을 거르지 않아서 `file:` URL과 앱 프로토콜 URL이 OS에 닿는 코드 경로가 있었다. 같은 프레임 이동은 세션 권한 요청으로 처리되는데, Electron은
  처리기가 없으면 모든 권한 요청을 자동 승인한다. `mailto:`는 메일 앱만 열고 코드를 실행하지 않으며, 막으면 지금 되는 메일 링크가 사라진다.
- 버린 대안: `sanitizeUrl`이나 main `openExternalUrlUseCase`에서 제한 (Link Opener의 앱 딥링크처럼 사용자가 등록한 주소까지 막힘). `http`, `https`만 허용 (메일 링크
  회귀). 막는 대신 확인 대화상자 표시 (코드가 늘고 경로마다 정책이 달라짐).
- 근거: CHANGES #88, `src/common/helpers/isAllowedExternalUrl.ts`, `src/main/infra/permissions/permissionHandler.ts`

#### D19. 마우스 사이드 버튼의 대상

- 상태: 유효
- 출처: `[fork #4]`
- 결정: 앞/뒤 버튼은 커서 아래 webview에 적용한다. 이벤트는 `app-command`와 Windows `WM_XBUTTONUP` 훅 두 경로로 받는다.
- 이유: 커서 위치가 사용자의 현재 의도를 가장 잘 반영한다. 일부 Windows 드라이버는 `WM_APPCOMMAND`로 번역하지 않는다.
- 버린 대안: 키보드 포커스 기준 (위젯을 옮긴 뒤에도 포커스가 이전 webview에 남아 엉뚱한 위젯이 뒤로 감).
- 근거: CHANGES #4

#### D20. User Agent 재작성

- 상태: 유효
- 출처: `[fork #7]`
- 결정: `app.userAgentFallback`을 현재 Chromium 메이저로 만든 순수 Chrome UA로 바꾸고, Google 도메인에는 원본 Electron UA를 유지한다.
- 이유: 앱 이름 토큰이 남은 UA를 일부 사이트가 "알 수 없는 브라우저"로 분류해 영구 세션을 주지 않았다. Google은 이미 잘 되고 있어 회귀를 막으려고 예외를 유지했다.
- 근거: CHANGES #7, `src/main/index.ts`, `src/main/infra/browserWindow/browserWindow.ts` `reUrlsRequiringOriginalUA`

#### D21. webview 단축키의 처리 위치

- 상태: 유효
- 출처: `[fork #6 #24 #25 #27 #29]`
- 결정: 위젯 단축키는 main의 게스트 webContents `before-input-event`에서 가로챈다. `WebContents` API로 끝나는 동작 (`Ctrl+T`, `Alt+←/→`, `F5`,
  `Ctrl+R`)은 main에서 바로 처리한다. DOM API나 renderer 쪽 설정이 필요한 동작 (줌, `Alt+Home`, 워크플로우 전환)은 IPC → `window` CustomEvent → 위젯
  경로로 보낸다.
- 이유: 게스트에 포커스가 있으면 메뉴 accelerator가 닿지 않는다. 줌은 `webviewEl.setZoomFactor`가 필요하고, 시작 URL은 renderer 위젯 설정에 있다.
- 근거: CHANGES #6, #24, #25, #27, #29, `src/main/infra/browserWindow/browserWindow.ts`

#### D22. 게스트 → 호스트 신호에 console-message 마커

- 상태: 유효
- 출처: `[fork #24 #36 #71]`
- 결정: 게스트 안에서 잡아야 하는 입력 (`Ctrl+휠`, `Ctrl+F`)과 HTTP 인증 창의 결과는 magic prefix `console.log`로 보내고 호스트의 `console-message`에서
  받는다.
- 이유: `before-input-event`는 휠을 지원하지 않는다. preload 번들 없이 게스트에서 호스트로 신호를 보내는 가장 가벼운 방법이다.
- 버린 대안: webview 전용 preload 번들 + `ipcRenderer.sendToHost`(빌드·설정 배선 비용이 큼, 필요해지면 후속 과제).
- 근거: CHANGES #24, #36, #71, `src/renderer/widgets/webpage/widget.tsx`

#### D23. 단축키 키 선택

- 상태: 유효
- 출처: `[fork #25 #27 #29]`
- 결정: 외부 브라우저로 열기 `Ctrl/Cmd+T`, 뒤로/앞으로 `Alt+←/→`, 시작 페이지 `Alt+Home`, 새로고침 `F5`/`Ctrl/Cmd+R`(`Shift` 제외).
- 이유: `Ctrl+T`는 브라우저 "새 탭" 니모닉이고, 생산성 앱들이 비워 두는 키라 가로채도 비용이 없다. `Alt+←/→`, `Alt+Home`은 브라우저 관용이다. `Ctrl+Shift+R`은 하드 리로드
  여지로 남긴다.
- 버린 대안: `Ctrl+B`(Notion·Slack·Docs의 굵게와 충돌). `Ctrl+Home`(페이지 맨 위 스크롤과 충돌). `Home` 단독 (입력 커서 이동·스크롤과 충돌).
- 근거: CHANGES #25, #27, #29

#### D24. 새로고침과 줌

- 상태: 유효
- 출처: `[fork #24 #29]`
- 결정: 액션바 Reload 버튼은 줌을 100%로 되돌린 뒤 새로고침한다. 키보드 새로고침, 컨텍스트 메뉴 Reload, 자동 리로드는 줌을 유지한다.
- 이유: 버튼은 "다 원래대로 시작" 기대에 맞추고 (특정 페이지에 임시로 줌하는 용도가 많음), 키보드는 일상 사용 중 줌이 갑자기 리셋되는 것이 더 거슬린다는 판단이다.
- 근거: CHANGES #24, #29

#### D25. 액션바 툴팁의 단축키 표기

- 상태: 유효 (이전 컨벤션을 대체)
- 출처: `[fork #28]`
- 결정: 단축키가 실제로 바인딩된 액션바 버튼의 `title`에 키 조합을 붙인다. 수정자는 OS를 따른다. #27까지는 라벨에 키를 노출하지 않는 것이 컨벤션이었다.
- 이유: 단축키를 계속 추가했지만 사용자가 존재를 알기 어려웠다. 액션바를 단축키 치트시트로 쓰게 한다.
- 근거: CHANGES #28, `src/renderer/widgets/webpage/actionBar.ts` `withKeys`

#### D26. 기존 Webpage 위젯의 탭 확장

- 상태: 유효
- 출처: `[fork #67 #69]`
- 결정: 새 위젯을 만들지 않고 Webpage 위젯에 탭을 더한다. 탭들은 세션을 공유하고, 위젯 단위 표면 (액션바, 컨텍스트 메뉴, 헤더 타이틀, `exposeApi`)은 활성 탭이 소유한다. 중복 URL
  탭에만 파티션 접미사를 붙인다. 탭 이름은 구조화 설정 (`tabs: {url, name}[]`, `urlName`)으로 저장한다.
- 이유: 기존 위젯이 설정 그대로 동작한다. 같은 URL을 두 번 등록한 것은 따로 보겠다는 뜻으로 보고 세션을 나눈다 (대가: 로그인을 따로 해야 함).
- 버린 대안: `URL | 이름` 파이프 문법 (URL에 리터럴 `|`가 있으면 잘림, 지금은 1회성 레거시 변환에만 남음).
- 근거: CHANGES #67, #69, `src/renderer/widgets/webpage/settings.tsx`, `src/renderer/widgets/webpage/widget.tsx`

#### D27. 자동 리로드의 포커스 정지

- 상태: 유효
- 출처: `[fork #53]`
- 결정: webview에 포커스가 있는 동안 자동 리로드를 멈추고 초기화하며, 포커스가 빠지는 순간부터 간격을 다시 센다.
- 이유: 폼 입력 중 강제 새로고침으로 입력이 날아갔다. 게스트를 클릭하면 호스트 `<webview>` 요소가 `focus`/`blur`를 받으므로 이 신호를 쓴다.
- 근거: CHANGES #53, `src/renderer/widgets/webpage/widget.tsx`

#### D28. 다운로드 폴더 전역 설정

- 상태: 유효
- 출처: `[fork #41]`
- 결정: webview 다운로드는 대화상자 없이 지정 폴더 (기본 OS Downloads)에 저장하고, 폴더는 앱 전역 설정 (`AppConfig.downloadDir`)이다.
- 이유: 다운로드는 파티션 (세션) 단위로 일어나고 여러 위젯이 세션을 공유할 수 있어, 위젯별 폴더는 충돌과 복잡도가 크다.
- 근거: CHANGES #41, `src/main/infra/downloads/downloadManager.ts`

#### D29. HTTP 인증 프롬프트

- 상태: 유효
- 출처: `[fork #71]`
- 결정: `app.on('login')`에서 부모 창 모달로 작은 로그인 창을 띄운다. 창은 preload 없이 data URL로 만들고 결과는 `console-message` 마커로 회수한다.
- 이유: 핸들러가 없으면 Electron이 인증 요청을 취소해, 사내 툴·NAS 관리 페이지 등이 입력 기회 없이 401로 끝났다.
- 근거: CHANGES #71, `src/main/infra/httpAuth/httpAuth.ts`

#### D30. 콘텐츠 기반 아이콘과 캐시 정책

- 상태: 유효
- 출처: `[fork #21]`
- 결정: Link Opener는 대상 origin에서 favicon을 직접 받고 (`/favicon.ico` → HTML `<link>` 폴백), File Opener는 OS 파일 아이콘을 쓴다. main이 세션
  동안 성공·실패를 모두 `Map`에 기억하고, 사용자가 버튼을 누를 때만 `bypassCache`로 재시도한다.
- 이유: 같은 대상의 네트워크 호출을 한 번으로 줄이고, 재시도 비용은 사용자 의도가 있는 순간에만 낸다.
- 버린 대안: Google s2 같은 서드파티 favicon 서비스 (모든 URL을 외부에 보내는 프라이버시 리스크). 디스크 영속화·LRU·negative TTL (단순함 우선). "N분마다 자동 재시도"(클릭
  시점 재시도가 더 예측 가능).
- 근거: CHANGES #21, `src/main/infra/iconProvider/iconProvider.ts`

### 저장과 동기화

#### D31. Note 공유 데이터 키

- 상태: 유효
- 출처: `[fork #8]`
- 결정: Note는 사용자가 만든 공유 키를 선택할 때만 `shared/<widgetType>/<keyId>/` 저장소를 쓴다. 키를 지우면 그 키를 쓰던 위젯의 자체 저장소도 비운다.
- 이유: 키 삭제 시 이전 로컬 데이터가 되살아나지 않게 한다 ("키를 지우면 노트도 사라진다"는 사용자 의도).
- 버린 대안: "위젯 내용이 비어 있어야 공유 허용"(설정 화면에서 위젯 데이터 사전 읽기가 까다로워 `moreInfo` 경고로 대체).
- 근거: CHANGES #8, `src/renderer/application/useCases/sharedDataKey/deleteSharedDataKey.ts`

#### D32. To-Do 프로젝트 단위 자동 동기화

- 상태: 유효
- 출처: `[fork #9]`
- 결정: To-Do는 설정 없이 같은 프로젝트 (셸프는 `app`)의 모든 위젯이 하나의 저장소를 공유한다. 라우팅은 `getWidgetApi`의 `dataStorage` 분기에서 한다.
- 이유: Note의 세밀한 제어와 To-Do의 단순함을 각각 살리도록 독립 설계했다. 공유 인프라는 재사용한다.
- 근거: CHANGES #9, `src/renderer/application/useCases/widget/getWidgetApi.ts`

#### D33. IPC broadcast 기반 라이브 동기화

- 상태: 일부 대체: D34 (Note는 계속 사용, To-Do는 D34로 이동)
- 출처: `[fork #8 #10]`
- 결정: 공유 저장소 쓰기 뒤 main이 모든 창에 broadcast하고, renderer가 `window` CustomEvent로 재발행하며, 위젯은 `useSharedDataChangedEffect`로
  구독한다.
- 이유: memSaver로 위젯이 계속 마운트되어 있어 remount에 기대어 다시 읽을 수 없다. 두 위젯의 같은 구독 코드를 hook 하나로 모았다.
- 근거: CHANGES #8, #10, `src/renderer/widgets/sharedDataSync.ts`

#### D34. To-Do의 in-memory store

- 상태: 유효
- 출처: `[fork #26]`
- 결정: To-Do의 라이브 동기화를 renderer 안 모듈 스코프 store (`useSyncExternalStore`)로 바꾸고, 디스크 저장만 IPC를 쓴다. 디바운스 saver는 스코프마다 하나다.
- 이유: IPC 체인의 7~8단계 중 어디서든 끊기면 조용히 동기화가 멈췄다. 스코프가 한정적이라 `Map`이 잘 맞고, 한 메커니즘이 깨져도 Note에 영향이 없게 격리한다. 단일 메인 창이라
  cross-window 범위 축소는 영향이 거의 없다.
- 근거: CHANGES #26, `src/renderer/widgets/to-do-list/todoStore.ts`

#### D35. 종료 시 best-effort flush

- 상태: 유효
- 출처: `[fork #30]`
- 결정: 앱 종료 (`will-quit`)와 창 unload (`beforeunload`)에서 대기 중인 저장을 즉시 발사한다. 완료는 기다리지 않는다.
- 이유: 손실 구간을 약 5초에서 종료 순간 수준으로 줄이면서 범위를 키우지 않는다.
- 버린 대안: `before-quit` `preventDefault` + IPC 왕복 + 저장 완료 ack (범위가 커짐).
- 근거: CHANGES #30, `src/main/index.ts`, `src/renderer/init.ts`

#### D36. 영속 상태 검증기 주입

- 상태: 유효
- 출처: `[fork #49]`
- 결정: `createStateStorage`에 선택적 검증기를 주입하고, 검증 실패나 마이그레이션 예외면 `null`을 돌려 기본값으로 시작한다. 검증기는 마이그레이션 후 형태만 본다.
- 이유: `createStateStorage`는 제네릭이라 형태를 모른다. 구조는 정상이지만 내용이 깨진 데이터가 통과하던 빈틈을 메운다.
- 근거: CHANGES #49, `src/common/data/stateStorage.ts`, `src/renderer/base/state/app.ts` `isPersistentAppState`,
  `src/main/base/state/window.ts` `isPersistentWindowState`

#### D37. 앱 설정 필드 추가의 무마이그레이션

- 상태: 유효
- 출처: `[fork #41 #42 #45]`
- 결정: `AppConfig` 최상위에 필드를 더할 때 (`downloadDir`, 배경 설정, `workflowBarPos` 등) 마이그레이션을 쓰지 않는다.
- 이유: 병합 때 기본값이 빈 자리를 채운다 (`mergeAppStateWithPersistentAppState`의 `appConfig` 1단계 병합).
- 근거: CHANGES #41, #42, `src/renderer/base/state/app.ts`

### 레이아웃과 화면

#### D38. 격자 32×16과 무마이그레이션

- 상태: 유효
- 출처: `[fork #34]`
- 결정: 격자를 16×8에서 32×16으로 바꾸고 위젯 `minSize`를 2배로 맞춘다. 저장 좌표는 변환하지 않는다. 가로만 격자 안으로 클램프하고 세로는 무제한으로 둔다. 여백은 6px에서 4px로 줄인다.
- 이유: 반 칸 단위의 정밀한 배치. 세로는 worktable 세로 스크롤과 collision-stacking에 의존한다.
- 버린 대안: 기존 좌표에 2를 곱하는 무손실 마이그레이션 (사용자 요청으로 적용하지 않음, 기존 레이아웃은 수동 재조정 전제).
- 근거: CHANGES #34, `src/renderer/base/widgetLayout.ts`

#### D39. 워크플로우 배경 커스텀

- 상태: 유효
- 출처: `[fork #42]`
- 결정: 배경색·이미지·투명도는 앱 전역 설정이고, worktable 안 위젯 뒤의 전용 레이어에 적용한다. 로컬 이미지는 main이 data URL로 넘긴다.
- 이유: 워크플로우별 배경의 실익이 적고 설정만 흩어진다. worktable 루트에 `opacity`를 주면 위젯까지 흐려진다.
- 버린 대안: `file://` 직접 표시 (커스텀 프로토콜 오리진의 CSP에 막힘). 앱 커스텀 프로토콜 서빙 (번들 파일만 서빙).
- 근거: CHANGES #42, `src/main/application/useCases/fs/getImageDataUrl.ts`

#### D40. 워크플로우 바 위치와 단일 트리

- 상태: 유효
- 출처: `[fork #45]`
- 결정: 바 위치 (위/아래/좌/우)와 상관없이 `[바, 리사이저, 본문]`을 같은 순서로 하나의 `.body-layout`에 두고 CSS `flex-direction`만 바꾼다. 사이드 바 너비는 편집 모드에서만
  드래그로 바꾸고, store가 단일 진실 소스다.
- 이유: 위치를 바꿀 때 Worktable이 다시 만들어지면 webview 위젯이 모두 새로고침된다. 일반 모드 드래그 금지는 실수 방지다.
- 버린 대안: 위/아래는 Fragment, 좌/우는 가로 행으로 따로 렌더 (위치 변경 시 Worktable 재생성).
- 근거: CHANGES #45, `src/renderer/ui/components/app/app.tsx`

#### D41. 셸프 팝업 크기의 위젯별 저장

- 상태: 유효
- 출처: `[fork #48]`
- 결정: 셸프 항목에 팝업 크기 (`w`, `h` px)를 저장하고, worktable에서 끌어올 때 그 시점의 픽셀 크기로 시작하며, 편집 모드에서만 드래그로 바꾼다.
- 이유: 모든 위젯이 300×150으로 고정돼 키워 둔 위젯도 작게 보였다. 편집 모드 한정은 워크플로우 바 리사이저 (D40)와 일관성을 맞춘 것이다.
- 근거: CHANGES #48, `src/renderer/application/useCases/shelf/setShelfItemSize.ts`

#### D42. 새 위젯 기본 이름 공란

- 상태: 유효
- 출처: `[fork #16]`
- 결정: 새 위젯을 만드는 네 경로에서 이름을 빈 문자열로 둔다. 붙여넣기는 기존 이름 기반 중복 방지 이름을 유지한다.
- 이유: 사용자는 대부분 자동 이름을 곧바로 바꾸거나 비운다. 헤더는 이름이 비면 타입 이름이나 동적 타이틀을 보여준다.
- 근거: CHANGES #16

### 위젯

#### D43. File Explorer 트리 구현

- 상태: 유효
- 출처: `[fork #31 #32]`
- 결정: `@pierre/trees`(beta)로 트리를 그리고, 폴더는 펼칠 때만 읽으며 (lazy), 루트 (즐겨찾기)는 `preparePresortedFileTreeInput`으로 등록 순서를 유지한다. 폴더
  더블클릭은 열지 않고 펼침만 한다. 숨김 판정은 이름의 `.` 접두사뿐이다.
- 이유: 거대 트리에서도 가볍게. 더블클릭은 결국 클릭 두 번이라 폴더 열기와 펼침이 충돌한다.
- 버린 대안: 커스텀 comparator로 루트만 무정렬 (자식의 natural 정렬을 재구현해야 해 회귀 위험). Windows 숨김 속성 읽기 (네이티브 바인딩 의존성 추가).
- 근거: CHANGES #31, #32, `src/renderer/widgets/file-explorer/widget.tsx`

#### D44. System Monitor의 main IPC

- 상태: 유효
- 출처: `[fork #60]`
- 결정: CPU·RAM은 main의 `node:os`로 읽고 새 위젯 capability `systemStats`로 넘긴다. CPU%는 직전 샘플과의 누적 cpu times 차이다.
- 이유: renderer (샌드박스)에서는 시스템 메트릭을 읽을 수 없다.
- 근거: CHANGES #60, `src/main/infra/systemStatsProvider/`

#### D45. 타이머 계열 실행 상태 영속화

- 상태: 유효
- 출처: `[fork #73]`
- 결정: Timer·Stopwatch·Pomodoro는 실행 상태를 위젯 dataStorage (`state` 키)에 절대 타임스탬프로 저장한다. 앱이 꺼진 사이 만료된 페이즈는 재생하지 않고 대기 상태로
  복원한다.
- 이유: remount와 재시작에서 타이머가 리셋됐다. 놓친 전환 재생은 한계로 남긴다 (`ponytail:` 주석).
- 근거: CHANGES #73, `src/renderer/widgets/pomodoro/widget.tsx`

#### D46. Calculator의 reducer 구현

- 상태: 유효
- 출처: `[fork #57]`
- 결정: `eval` 없이 순수 상태머신 (reducer)으로 계산한다.
- 이유: 안전성과 테스트 용이성.
- 근거: CHANGES #57, `src/renderer/widgets/calculator/calc.ts`

#### D47. Web Query 다중 엔트리와 로드 시 정규화

- 상태: 유효
- 출처: `[fork #47]`
- 결정: 설정을 `{mode, entries[]}`로 바꾸고, 옛 단일 형태는 `createSettingsState`가 로드 때 `entries`로 감싼다. 별도 마이그레이션 코드와 버전 업은 없다.
- 이유: 기존 위젯과 데이터 손실 없이 무중단 전환.
- 근거: CHANGES #47, `src/renderer/widgets/web-query/settings.tsx` `createSettingsState`

#### D48. Spreadsheet 자체 수식 엔진

- 상태: 유효
- 출처: `[fork #79]`
- 결정: 토크나이저 + 재귀하강 파서를 직접 구현하고, 셀 참조는 lazy 평가 + 캐시, 순환은 `#CIRC`로 처리한다.
- 이유: 수식 라이브러리는 함수 수백 개와 수 MB를 끌고 오는데 실제로 쓰는 함수는 몇 개다.
- 근거: CHANGES #79, `src/renderer/widgets/spreadsheet/formula.ts`

#### D49. Spreadsheet 그리드 라이브러리 채택

- 상태: 대체됨: D50
- 출처: `[fork #79 #81]`
- 결정: 그리드를 `react-datasheet-grid`로 만들었다.
- 이유: 가상화, 키보드 이동, 엑셀 복붙, 컨텍스트 메뉴를 라이브러리에서 받기 위해서다.
- 근거: CHANGES #79, #81

#### D50. Spreadsheet 자체 `<table>` 구현

- 상태: 유효
- 출처: `[fork #82 #86]`
- 결정: 그리드를 `<table>` 기반으로 직접 구현한다. 열 너비는 `<colgroup>`, 행 높이는 `<tr>`가 갖고, 편집 중인 셀에만 `<input>`을 두며, 키보드는 스크롤 컨테이너 한 곳에서
  받는다. 행이 많아지자 `<tbody>` 윈도잉과 행 `memo`를 더했다 (#86).
- 이유: 라이브러리의 낡은 `columnData` 때문에 입력값이 사라졌다. 열 너비와 행 높이는 마운트 때만 반영됐다. 가상화 때문에 jsdom에서 셀이 그려지지 않았다. 끌고 오는
  `react-resize-detector@7.1.2`의 peer가 React 16~18이다.
- 버린 대안: 드래그 종료 시 `key`로 그리드 리마운트 (컨테이너 폭 측정을 잃고 모든 열이 100px로 무너짐).
- 근거: CHANGES #81, #82, #86, `src/renderer/widgets/spreadsheet/widget.tsx`, `src/renderer/widgets/spreadsheet/grid.ts`

#### D51. Spreadsheet의 Excel 의미론

- 상태: 유효
- 출처: `[fork #79 #83 #85]`
- 결정: 단항 마이너스를 거듭제곱보다 강하게 묶고 (`-2^2 = 4`), 내림차순 정렬은 전체 순서를 뒤집되 빈칸만 항상 마지막에 둔다. 참조로도 읽히는 이름 (`LOG10` 등)은 뒤에 `(`가 오면 함수로
  판정한다.
- 이유: 비교 대상이 Excel·구글시트다.
- 근거: CHANGES #79, #83, #85, `src/renderer/widgets/spreadsheet/formula.ts`

#### D52. Spreadsheet 설정 버전 스탬프

- 상태: 유효
- 출처: `[fork #86]`
- 결정: 설정에 `v`(`SETTINGS_VERSION`, 현재 2)를 넣고, 스탬프가 없거나 다르면 현재 기본 크기 (A~Z, 100행)를 한 번 적용한다.
- 이유: 기본값만 올리면 인스턴스별로 저장된 기존 위젯이 그대로였다.
- 버린 대안: "`rows` 키가 없으면 옛 위젯"이라는 추론 (새 키 추가 직후 자동 저장으로 옛 `cols`와 새 `rows`가 같이 굳어 신호가 무효가 됨).
- 근거: CHANGES #86, `src/renderer/widgets/spreadsheet/settings.tsx` `SETTINGS_VERSION`

### 텔레메트리와 Analytics

#### D53. 로컬 전용 opt-in 텔레메트리

- 상태: 유효
- 출처: `[fork #62]`
- 결정: 사용 통계는 기본 꺼짐이고 동의 시에만 로컬 (`freeter-data/telemetry/`, 별도 저장소)에 기록한다. 키 입력은 횟수만 센다. 집계는 읽을 때 계산한다.
- 이유: 콘텐츠 미저장은 설계 불변식이다. 앱·위젯 데이터와 분리해 파일째 지울 수 있게 한다. 읽을 때 계산하면 항상 정확하고 데이터량이 작다.
- 근거: CHANGES #62, `src/common/base/telemetry.ts`, `src/renderer/application/telemetry/telemetryCollector.ts`

#### D54. 활동 타임라인의 의미 단위 기록

- 상태: 유효
- 출처: `[fork #63]`
- 결정: 위젯의 의미 있는 행동 (검색어, 방문 페이지, 연 파일, 완료 할 일)만 `widgetApi.logActivity`로 기록하고, 저장은 id만 하며 이름은 내보낼 때 스냅샷으로 붙인다.
- 이유: "무엇을 했나"를 남기되 키로깅을 피한다. 노트 본문은 본인이 쓴 것이라 제외한다. 개명·삭제 뒤에도 의미를 복원한다.
- 버린 대안: 키 입력 통째 수집 (키로깅).
- 근거: CHANGES #63, `src/renderer/application/useCases/telemetry/logTelemetryActivity.ts`

#### D55. OS 전역 활동 모니터

- 상태: 유효
- 출처: `[fork #64]`
- 결정: main이 장수 PowerShell 1개 (user32 P/Invoke 루프)로 포그라운드 앱·창을 읽고, 신호만 renderer로 보내 collector가 동의를 확인한 뒤 기록한다. 시작·정지는
  renderer가 동의 변경을 구독해 주도한다.
- 이유: 네이티브 의존성 0으로 패키징이 안전하다. 기존 동의 게이트·버퍼·flush·export를 그대로 탄다.
- 버린 대안: Freeter가 blur되면 모니터 정지 (다른 앱 추적이 이 기능의 핵심이라 검토 중 기각).
- 근거: CHANGES #64, `src/main/infra/osActivity/foregroundWindow.ts`,
  `src/main/application/osActivity/osActivityMonitor.ts`

#### D56. 앱 안 Analytics 모달

- 상태: 대체됨: D57
- 출처: `[fork #62 #65 #78]`
- 결정: Analytics를 앱 안 모달 화면 (`modalScreens`의 `analytics`)으로 보여주고, 열 때 flush해 방금 활동을 반영하며 (#65), 기간 필터는 읽기 단계에서 적용했다
  (#78).
- 이유: 기존 modalScreens 시스템에 한 칸만 더하면 됐다 (#62).
- 근거: CHANGES #62, #65, #78

#### D57. 브라우저 리포트와 루프백 서버

- 상태: 유효
- 출처: `[fork #87]`
- 결정: View → Analytics는 기본 브라우저에 리포트를 연다. main은 `127.0.0.1` 랜덤 포트 HTTP 서버로 페이지 번들과 텔레메트리 원본 (일자 파일을 파싱 없이 이어 붙임)을 읽기
  전용으로 내준다. 계산은 모두 브라우저에서 한다. 저장 형식은 바꾸지 않는다. 동의가 꺼져 있어도 열린다.
- 이유: 앱 안 모달은 실제 데이터 (105일, 39MB, 21만 7천 건)에서 느리고 원시 나열이라 해석이 어려웠다. `file://`로 연 페이지는 로컬 파일을 `fetch`할 수 없다. 동의는 수집을 막는
  것이고, 동의를 끈 사람도 쌓인 데이터를 보고 지울 수 있어야 한다.
- 근거: CHANGES #87, `src/main/infra/analyticsServer/analyticsServer.ts`, `src/renderer/analyticsPage/`,
  `src/renderer/base/telemetryInsights.ts`
