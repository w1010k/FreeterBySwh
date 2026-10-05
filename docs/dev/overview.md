## 앱 구조 개요

앱 전체 구조, main 프로세스, IPC, 상태 저장, 빌드, 테스트 구성을 다룬다. renderer 화면 기능은 [features-core.md](features-core.md), 위젯
내부는 [features-widgets.md](features-widgets.md), 함정은 [pitfalls.md](pitfalls.md), 작업 절차는 [procedures.md](procedures.md)에
있다.

출처 표시: `[upstream]`은 upstream `v2.8.0-beta`에 이미 있던 것, `[fork #N]`은 포크가 추가한 것 (N은 `docs/CHANGES.md` 섹션 번호),
`[upstream, fork #N 변경]`은 upstream 것을 포크가 바꾼 것이다.

### 앱 개요와 포크 이력

Freeter는 Electron 데스크톱 앱이다. 프로젝트, 워크플로우 (탭), 위젯 계층으로 작업 화면을 구성한다. 이 저장소는 upstream을 이어받아 기능을 추가하는 포크이고, upstream 릴리스를 병합해
따라간다.

| 항목              | 값                                                                                            | 근거                                              |
|-------------------|-----------------------------------------------------------------------------------------------|---------------------------------------------------|
| upstream          | FreeterApp/Freeter (Alex Kaul)                                                                | `package.json` `author`, `docs/CHANGES.md` 머리말 |
| upstream 기준     | `v2.8.0-beta` (be70035, 2026-05-19)                                                           | git tag                                           |
| 포크 시작점       | 68afd73 (`v2.7.1-beta` + upstream README 커밋 2개). 첫 포크 커밋은 3e7fa6c (2026-04-17)       | git log                                           |
| upstream 2.8 병합 | 0ebf9ac (2026-06-05) "Merge upstream Freeter v2.8.0-beta (Yarn 유지 전략)"                    | 커밋 메시지                                       |
| 현재 버전         | `2.8.0-swh.17`                                                                                | `package.json` `version`                          |
| 버전 형식         | `<upstream 기준>-swh.N`. 2.8 병합 때 `2.8.0-swh.1`부터 시작                                   | 병합 커밋 메시지                                  |
| 포크 저장소       | `w1010k/FreeterBySwh`                                                                         | `package.json` `repository`                       |
| 앱 식별자         | appId `io.freeter.app.swh`, productName `Freeter-SWH`, package `name` `freeter-swh` [fork #1] | `electron-builder.config.js`, `package.json`      |
| 배포 | GitHub Releases. Windows `msi`, `zip` (x64), Linux `tar.xz` (x64). macOS `dmg`는 `2.8.0-swh.17`까지만 있다 [fork #89] | `electron-builder.config.js`, `.github/workflows/cd.yml` |

#### upstream 2.8과 병합 방침

- upstream `v2.7.1-beta..v2.8.0-beta` 구간은 의존성 업데이트와 npm 전환 (9a3f215 "Update deps, switch to npm"), README 수정, 릴리스 명령
  수정뿐이다. 기능 추가는 없다.
- 2.8에서 올라간 주요 버전: Electron 36 → 42, Jest 29 → 30, TypeScript 5.5 → 6.0, Zustand 4 → 5, uuid 10 → 14
  (`git show v2.7.1-beta:package.json`과 `v2.8.0-beta` 비교).
- 포크의 병합 방침 (0ebf9ac 커밋 메시지):
  - 의존성 버전은 2.8을 채택하고 `yarn.lock`을 재생성했다. `package-lock.json`은 삭제했다. CI/CD와 스크립트는 Yarn을 유지한다.
  - scss import를 upstream 방식 `import styles from '...module.scss'`로 통일했다.
  - jest 30에서 사라진 `toBeCalled*` 별칭을 `toHaveBeenCalled*`로 바꿨다.
  - react-hooks@7의 새 규칙 `react-hooks/set-state-in-effect`, `react-hooks/refs`를 `warn`으로 낮췄다
    (`src/renderer/eslint.config.mjs`). 커밋 메시지는 후속 정리 대상이라고 적는다.
- CHANGES #2의 "Electron 36 → 41"은 2.8 병합 전 기록이다. 현재 Electron은 2.8을 따른 `^42.1.0`이다.

### 기술 스택

| 구성 요소                             | 버전 (`package.json`) | 용도와 비고                                                                                        |
|---------------------------------------|-----------------------|----------------------------------------------------------------------------------------------------|
| Electron                              | ^42.1.0               | upstream 2.8에서 36 → 42                                                                           |
| React, react-dom                      | ^19.2.6               | renderer UI, Analytics 페이지                                                                      |
| TypeScript                            | ^6.0.3                | 루트 `tsconfig.json`: `moduleResolution: bundler`, `strict`                                        |
| Zustand                               | ^5.0.13               | `zustand/vanilla` store, UI 훅은 `zustand/traditional` `useStoreWithEqualityFn`                    |
| webpack                               | ^5.106.2              | 번들 4종. TS 변환은 `swc-loader`, tsc는 타입 검사 전용                                             |
| Jest                                  | ^30.4.2               | `@swc/jest` 변환. renderer 프로젝트는 `jest-environment-jsdom`                                     |
| @testing-library/react                | ^16.3.2               | renderer 컴포넌트 테스트. `jest-dom` matcher                                                       |
| electron-builder                      | ^26.8.1               | 설치 파일 생성과 GitHub 릴리스 게시                                                                |
| ESLint                                | ^9.39.1               | flat config. `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks` ^7.1.1        |
| sass-loader, css-loader, style-loader |                       | `*.module.scss`는 CSS Modules (`namedExport: false`)                                               |
| svg-sprite-loader, svgo-loader        |                       | 앱 아이콘 sprite `appIcons.svg`, 위젯별 sprite `widgets/<name>/wgtIcons.svg`                       |
| uuid                                  | ^14.0.0               | `uuidv4IdGenerator` (`src/renderer/infra/idGenerator/uuidv4IdGenerator.ts`)                        |
| tiny-markdown-editor                  | ^0.2.28               | Note 위젯 편집기 (`src/renderer/widgets/note/widget.tsx`)                                          |
| @pierre/trees                         | ^1.0.0-beta.4         | File Explorer 트리 [fork #31]. ESM 전용이라 jest에서 수동 mock (`tests/__mocks__/pierreTrees*.js`) |
| 패키지 매니저                         | Yarn 1 Classic        | upstream 2.8은 npm으로 전환했고 포크는 Yarn을 유지한다 [fork]                                      |
| Node (CI)                             | 22                    | `.github/workflows/*.yml`. upstream은 20 [fork]                                                    |

### 디렉터리 지도

#### 최상위

| 경로                                                   | 역할                                                                                         |
|--------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `src/main/`                                            | main 프로세스 (Node, Electron API)                                                           |
| `src/renderer/`                                        | renderer (React), preload, Analytics 페이지, 위젯                                            |
| `src/common/`                                          | 양쪽이 공유하는 타입, store 래퍼, IPC 채널 정의                                              |
| `src/assets/app-icons/`                                | 트레이 아이콘 (`16.png`)과 리눅스 창 아이콘 (`256.png`). 빌드 때 `build/assets/`로 복사      |
| `tests/`                                               | jest 프로젝트별 폴더 (`main`, `renderer`, `common`, `utils`)와 `__mocks__`                   |
| `resources/`                                           | 설치 패키지 아이콘 (`win32`, `linux`)                                                        |
| `build/`                                               | webpack 출력. 앱 실행과 패키징의 입력 (gitignore)                                            |
| `dist/`                                                | electron-builder 출력 (gitignore)                                                            |
| `docs/`                                                | `CHANGES.md` (포크 변경 기록), `GUIDE.md` (사용자 가이드), `BACKLOGS.md`, `dev/` (개발 문서) |
| `backers.json`                                         | About 화면 후원자 목록. renderer 빌드 때 `BACKERS` 상수로 주입                               |
| `webpack.{main,preload,renderer,analytics}.config.js`  | 번들 설정                                                                                    |
| `electron-builder.config.js`                           | 패키징 설정                                                                                  |
| `jest.config.js`, `eslint.config.mjs`, `tsconfig.json` | 테스트, lint, TS 공통 설정. surface별 `tsconfig.json`과 `eslint.config.mjs`가 이것을 확장    |

#### src/main

| 경로                           | 역할                                                                                                               |
|--------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `index.ts`                     | composition root. 데이터 경로, 단일 인스턴스 잠금, UA, provider와 use case 생성, controller 등록, 창 생성          |
| `controllers/`                 | IPC 채널과 use case 연결. `controller.ts`의 `Controller`, `registerControllers`                                    |
| `application/interfaces/`      | 포트 (provider 인터페이스)                                                                                         |
| `application/useCases/<그룹>/` | use case 팩토리                                                                                                    |
| `application/osActivity/`      | OS 활동 모니터 `createOsActivityMonitor` [fork #64]                                                                |
| `base/`                        | 순수 타입. 창 상태 (`state/window.ts`), 터미널 정의 (`apps/terminal.ts`)                                           |
| `data/`                        | 창 상태 store (`windowStore.ts`, `windowStateStorage.ts`)                                                          |
| `infra/`                       | Electron, Node 어댑터 (창, 메뉴, 트레이, 파일 저장, IPC, 프로토콜, 다운로드, 아이콘, HTTP 인증, Analytics 서버 등) |

#### src/renderer

| 경로                           | 역할                                                                                                 |
|--------------------------------|------------------------------------------------------------------------------------------------------|
| `index.tsx`                    | `init()` 결과의 `<App />`를 `#app`에 렌더                                                            |
| `init.ts`                      | composition root (store, use case, UI 조립)                                                          |
| `index.ejs`                    | HTML 템플릿과 CSP                                                                                    |
| `base/`                        | 도메인 타입과 순수 함수 (entity, 위젯 레이아웃, `appConfig.ts`, 상태 형태 `state/`, 텔레메트리 계산) |
| `application/interfaces/`      | 포트 (store, provider, registry, idGenerator)                                                        |
| `application/useCases/<기능>/` | use case. 하위 use case는 `subs/`                                                                    |
| `application/telemetry/`       | 사용 통계 수집기 (`telemetryCollector.ts`, `startTelemetry.ts`) [fork #62 #64]                       |
| `infra/`                       | IPC 어댑터 (`electronIpcRenderer.invoke`), `mainApi/`, id 생성기                                     |
| `data/`                        | `appStore.ts`, `appStateStorage.ts`                                                                  |
| `registry/registry.ts`         | 위젯 타입 목록 (`@/widgets`의 default export)을 제공                                                 |
| `ui/`                          | 컴포넌트 팩토리, view-model 훅, 공용 훅 (`ui/hooks/`), 에셋                                          |
| `widgets/`                     | 위젯 16종과 `_template` ([features-widgets.md](features-widgets.md))                                 |
| `helpers/`                     | 리스너 목록 클래스 `Event` (`helpers/event.ts`)                                                      |
| `preload/`                     | preload 스크립트 (별도 번들, 별도 `tsconfig.json`)                                                   |
| `analyticsPage/`               | 기본 브라우저에서 여는 Analytics 리포트 페이지 (별도 번들) [fork #87]                                |

#### src/common

| 경로                      | 역할                                                                                                                                                                                                              |
|---------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ipc/`                    | `ipc.ts` (접두사 `freeter:`, `makeIpcChannelName`), `channels.ts` (모든 채널과 인자, 반환 타입)                                                                                                                   |
| `data/`                   | `store.ts` (`createStore`), `stateStorage.ts` (`createStateStorage`)                                                                                                                                              |
| `application/interfaces/` | `DataStorage`, `DataStorageJson`, `Store`                                                                                                                                                                         |
| `base/`                   | IPC로 오가는 공용 타입 (menu, dialog, fs, process, systemStats, telemetry), `objectManager.ts`, `versionedObject.ts`, `sharedStorageId.ts`. `userAgent.ts`의 `createUserAgent`는 src에서 참조처가 없다 [upstream] |
| `infra/`                  | `network.ts` (스킴 `freeter-file`, 호스트 `freeter-app`), `dataStorage/` 래퍼 (`withJson`, `setTextOnlyIfChanged`, `createInMemoryDataStorage`)                                                                   |
| `helpers/`                | `debounce` (`flush`, `cancel` 포함), `deepFreeze`, `sanitizeUrl`, `isAllowedExternalUrl` [fork #88]                                                                                                               |

### 레이어와 의존성 주입

main과 renderer는 같은 레이어 규칙을 따른다 [upstream].

| 레이어                  | 위치                                    | 규칙                                                                                                                                |
|-------------------------|-----------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| base                    | `base/`                                 | 순수 타입과 함수. I/O 없음                                                                                                          |
| application 포트        | `application/interfaces/`               | provider, store 인터페이스                                                                                                          |
| use case                | `application/useCases/<그룹>/<동작>.ts` | `create<Name>UseCase(deps)`가 함수를 반환한다. 타입은 `export type <Name>UseCase = ReturnType<typeof create<Name>UseCase>`          |
| sub use case (renderer) | `useCases/<그룹>/subs/`                 | `create<Name>SubCase(deps)`. 여러 use case가 공유하는 단계 (예: `useCases/widget/subs/cloneWidget.ts`의 `createCloneWidgetSubCase`) |
| infra                   | `infra/`                                | 포트 구현. main은 Electron, Node API. renderer는 IPC invoke                                                                         |
| data                    | `data/`                                 | store 생성 (`createAppStore`, `createWindowStore`)                                                                                  |
| controllers (main)      | `controllers/`                          | `create<Group>Controllers(deps)`가 `Controller[]` (`{channel, handle}`)를 반환                                                      |
| ui (renderer)           | `ui/components/`, `ui/hooks/`           | 컴포넌트는 `create<X>Component(deps)` 팩토리, 상태와 동작은 `create<X>ViewModelHook(deps)`                                          |

예시: `createToggleEditModeUseCase` (`src/renderer/application/useCases/toggleEditMode.ts`)는 `{appStore}`를 받아
`appStore.get()`으로 읽고 불변 갱신한 상태를 `appStore.set()`한다.

#### main composition root

`src/main/index.ts` 실행 순서:

1. `dataDirName` 결정. 저장소 실행이면 `app.setPath('userData', ...)`, `app.setName('Freeter-SWH (dev)')` [fork #80]
2. `app.requestSingleInstanceLock()`. 실패하면 종료. `second-instance`에서 기존 창을 표시, 복원, 포커스 [upstream]
3. `registerAppFileProtocol(isDevMode)` (app ready 전에 호출해야 한다) [upstream]
4. `app.userAgentFallback`을 Chrome UA로 재작성 [fork #7]
5. `will-quit`: 창 상태 flush [fork #30], OS 모니터 종료 [fork #64], Analytics 서버 종료 [fork #87], 전역 단축키 해제 [upstream]
6. `app.whenReady()` 안에서 `createIpcMain(createIpcMainEventValidator(...))`, 다운로드 관리자, HTTP 인증 핸들러, 세션 권한 처리기 [fork #88], 저장소들, provider, use
   case 생성
7. `registerControllers(ipcMain, [...])`로 모든 controller 등록
8. `createWindowStore(...)`의 로드 완료 콜백에서 `createRendererWindow(...)`로 창 생성, 자식 창 메뉴 제거, `initTrayUseCase(appWindow)`

#### renderer composition root

`src/renderer/init.ts`의 `init()` 순서:

1. `createStore()`: 첫 실행 상태 `createAppState()`에 `entityStateActions.widgetTypes.setAll(..., registry.getWidgetTypes())`로
   위젯 타입을 넣고 `createAppStore`를 만든다. `beforeunload`에서 `appStore.flush()` [fork #30]
2. `createUseCases(store)` (async): 공통 deps는 `{appStore, idGenerator: uuidv4IdGenerator}`. provider (IPC 어댑터)와 모든 use
   case를 만든다. `createProcessProvider()`는 await한다 (main에 프로세스 정보를 묻는다)
3. `store.appStoreReady` 이후: `initMainShortcutUseCase`, `initDownloadDirUseCase` [fork #41], `initAppMenuUseCase`,
   `initTrayMenuUseCase`, `initMemSaverUseCase`, `startTelemetry` [fork #62]
4. main → renderer 알림 리스너 등록 (아래 IPC 절)
5. `createUiHooks` (`useAppState`) → `createUI`: `{...stateHooks, ...useCases}`를 deps로 view-model 훅을 만들고 컴포넌트 팩토리에 넣어
   `App`을 조립

renderer 기능을 추가할 때: use case 파일 작성 → `createUseCases`에서 생성하고 반환 객체에 추가 → 해당 view-model 훅 팩토리가 deps에서 꺼내 쓴다. 화면 기능
지도는 [features-core.md](features-core.md)에 있다.

### 프로세스와 창

#### main 창

`createRendererWindow` (`src/main/infra/browserWindow/browserWindow.ts`):

- 최소 1200×600, 기본 1200×700. 저장된 크기가 최소보다 작으면 기본값을 쓴다. 최대화, 전체 화면, 최소화 상태를 복원한다 [upstream]
- `webPreferences`: `nodeIntegration: false`, `contextIsolation: true`, `webSecurity: true`, `webviewTag: true`,
  `preload: build/preload.js` [upstream]
- 로드 URL: `freeter-file://freeter-app/index.html` [upstream]
- 닫기 버튼은 창을 숨긴다. `before-quit` 이후에만 실제로 닫힌다 [upstream]
- `will-navigate`를 막아 앱 페이지를 벗어나지 않게 한다 (이미지 드래그 등) [upstream]
- 창 이동, 크기, 상태 변경마다 `setWindowStateUseCase` 호출 (5초 debounce 저장) [upstream]
- `focus`, `blur` 때 `app-focus-changed` 전송 [fork #62]
- 저장소 실행에서는 `page-title-updated`를 막아 제목 `Freeter-SWH (dev)`를 고정 [fork #80]
- 개발 빌드 (`isDevMode`)면 DevTools를 연다 [upstream]

#### webview (Webpage 위젯)

Webpage 위젯이 `<webview>`를 띄운다. partition은 위젯 쪽 `createPartition` (`src/renderer/widgets/webpage/partition.ts`)이 정한다.
main은 `did-attach-webview`에서 guest마다 아래를 건다.

- `will-attach-webview`: Google 도메인 (`reUrlsRequiringOriginalUA`)은 원래 Electron UA를 쓴다 [upstream]
- `setWindowOpenHandler`: upstream은 모든 새 창을 앱 내부 자식 창으로 열었다. 포크는 진짜 팝업 (`disposition === 'new-window'` 또는 features에
  `popup`)만 자식 창 (`parent: win`, 같은 session, `outlivesOpener: false`)으로 열고, 나머지 새 탭 요청은 `sanitizeUrl` 후
  `shell.openExternal`로 기본 브라우저에 넘긴다 [upstream, fork #3 #13 변경]. 넘기는 URL은 `isAllowedExternalUrl` (http, https, mailto만)을 통과해야 한다 [fork #88].
  이 판정은 `attachWindowOpenHandler`에 있고, 내부 팝업이 여는 창에도 붙는다. 내부 팝업은 게스트마다 동시에 5개까지, 제목은 origin 고정, webPreferences 명시다.
  앱 창 자신은 모든 새 창을 거부한다 [fork #90]
- `before-input-event` 키 가로채기:

| 키                                             | 동작                            | 처리 위치                                                         | 출처       |
|------------------------------------------------|---------------------------------|-------------------------------------------------------------------|------------|
| Ctrl+Tab, Ctrl+Shift+Tab                       | 워크플로우 전환                 | IPC `switch-workflow-by-offset` → `switchWorkflowByOffsetUseCase` | [fork #6]  |
| Alt+←, Alt+→                                   | webview 뒤로, 앞으로            | main `navigateHistory`                                            | [fork #25] |
| Alt+Home                                       | 시작 페이지로 이동              | IPC `go-home-webpage` → window 이벤트 `WEBPAGE_GO_HOME_EVENT`     | [fork #27] |
| F5, Ctrl/Cmd+R                                 | 새로고침 (확대 비율 유지)       | main `wc.reload()`                                                | [fork #29] |
| Ctrl/Cmd+T                                     | 현재 URL을 기본 브라우저로 열기 | main `shell.openExternal` (`isAllowedExternalUrl` 통과 시)        | [fork #25 #88] |
| Ctrl/Cmd+Shift+= (`+`), Ctrl/Cmd+-, Ctrl/Cmd+0 | 확대, 축소, 원래대로            | IPC `zoom-webpage` → window 이벤트 `WEBPAGE_ZOOM_EVENT`           | [fork #24] |

- 마우스 뒤로/앞으로 버튼: `app-command` (`browser-backward`, `browser-forward`)와 Windows `hookWindowMessage(WM_XBUTTONUP)`를 받아,
  커서 아래 webview (`executeJavaScript`의 `elementFromPoint`)를 이동시킨다 [fork #4]

#### 그 밖의 창과 프로세스

| 대상             | 내용                                                                                                        | 위치                                                                                | 출처                      |
|------------------|-------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|---------------------------|
| 자식 창 메뉴     | `browser-window-created`에서 main 창이 아니면 `removeMenu()`                                                | `src/main/index.ts`                                                                 | [upstream]                |
| HTTP 인증 창     | `app.on('login')` → data: URL 모달 창 (`sandbox`, `contextIsolation`). 결과는 console-message 마커로 받는다 | `src/main/infra/httpAuth/httpAuth.ts` `registerHttpAuthHandler`                     | [fork #71]                |
| Analytics 페이지 | main의 루프백 HTTP 서버가 페이지와 데이터를 제공하고, 사용자의 기본 브라우저가 연다                         | `src/main/infra/analyticsServer/analyticsServer.ts`                                 | [fork #87]                |
| 전경 창 리더     | Windows에서 PowerShell 프로세스 1개가 5초마다 전경 창을 출력. 부모 프로세스가 사라지면 스스로 종료          | `src/main/infra/osActivity/foregroundWindow.ts`                                     | [fork #64]                |
| 앱, 터미널 실행  | `spawnDetached`로 분리 실행 (OS별 인자 생성)                                                                | `useCases/shell/openApp.ts`, `useCases/terminal/execCmdLinesInTerminal.ts`          | [upstream]                |
| 트레이           | 아이콘 `assets/app-icons/16.png`. 기본 동작은 창 표시                                                       | `useCases/tray/initTray.ts`, `infra/trayProvider/`                                  | [upstream, fork #1 변경]  |
| 전역 단축키      | 창이 포커스 없거나 숨겨져 있으면 표시, 아니면 숨김. 기본값 `CmdOrCtrl+Shift+Space`                          | `infra/globalShortcut/globalShortcutProvider.ts`, 기본값은 renderer `createUiState` | [upstream, fork #20 변경] |

### IPC

#### 채널 정의와 방향

- 채널은 `src/common/ipc/channels.ts`에 모은다. 이름은 `makeIpcChannelName`이 `freeter:` 접두사를 붙인다 (`src/common/ipc/ipc.ts`). 채널마다
  상수, `Ipc<Name>Args` 튜플 타입, `Ipc<Name>Res` 타입을 둔다 [upstream]
- renderer → main 요청은 모두 `invoke` ↔ `handle`이다. `registerControllers`는 `ipcMain.handle`만 쓴다 [upstream]
- main → renderer 알림은 `webContents.send`다. renderer 쪽 리스너는 앱 수명 동안 한 번 등록하고 해제하지 않는다.

| 알림 채널                                         | 보내는 곳                                                                    | 받는 곳                                                                             | 출처           |
|---------------------------------------------------|------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|----------------|
| `click-app-menu-action`, `click-tray-menu-action` | `infra/appMenuProvider`, `infra/trayProvider`                                | renderer `infra/appMenuProvider`, `infra/trayMenuProvider`                          | [upstream]     |
| `shared-data-changed`                             | `controllers/sharedDataStorage.ts` (쓰기 성공 후 `sendToAppWindow`로 앱 창에만) | `init.ts` → window 이벤트 `SHARED_DATA_CHANGED_EVENT` → `widgets/sharedDataSync.ts` | [fork #8]      |
| `switch-workflow-by-offset`                       | webview 키 가로채기                                                          | `init.ts` → `switchWorkflowByOffsetUseCase`                                         | [fork #6]      |
| `zoom-webpage`, `go-home-webpage`                 | webview 키 가로채기                                                          | `init.ts` → window CustomEvent                                                      | [fork #24 #27] |
| `app-focus-changed`                               | main 창 `focus`, `blur`                                                      | `application/telemetry/startTelemetry.ts`                                           | [fork #62]     |
| `os-activity-event`                               | `osActivityMonitor`의 `emit` (`sendToAppWindow`로 앱 창에만)                 | `startTelemetry.ts`                                                                 | [fork #64]     |

- 메뉴는 renderer가 정의한다. renderer는 `doAction`을 숫자 `actionId`로 바꿔 보내고 (`src/renderer/infra/ipc/prepareMenuItemsForIpc.ts`),
  main이 Electron 메뉴를 만든 뒤 클릭 시 `actionId`를 돌려보낸다 (`src/main/infra/utils/menu.ts`) [upstream]

#### 검증과 preload

- `createIpcMainEventValidator(channelPrefix, hostFreeterApp, schemeFreeterFile)` (`src/main/infra/ipcMain/ipcMainEventValidator.ts`): 채널
  접두사, `senderFrame` 존재, URL scheme이 `freeter-file:`이고 호스트가 `freeter-app`인지, 메인 프레임인지 검사한다 (scheme 검사는 2026-10-05 추가). 실패하면 `handle`은 reject한다 [upstream]. webview guest와 팝업
  창에는 preload가 없고 (Webpage 위젯은 webview preload 대신 `console-message`로 신호를 받는다), 검증기도 이들의 요청을 거부한다
- preload (`src/renderer/preload/index.ts`)는 `contextBridge.exposeInMainWorld('freeter', { getMainApiOnce })`만 노출한다.
  `getMainApiOnce`는 첫 호출에만 `MainApi`를 돌려준다. `src/renderer/infra/mainApi/mainApi.ts`가 모듈 로드 때 한 번 받아
  `electronIpcRenderer`로 export하고, 못 받으면 throw한다 [upstream]
- preload의 리스너는 Electron event 객체를 빼고 인자만 넘긴다 [upstream]
- preload `removeListener`는 실제로 해제하지 못한다. `on`이 등록하는 함수와 WeakMap에 저장하는 래퍼가 서로 다른 함수다. 현재 renderer에 `removeListener` 호출처는
  없다 [upstream]

#### 등록되지 않은 채널

- app 데이터 저장소는 main에 `get-text`, `set-text`만 등록돼 있다 (`src/main/controllers/appDataStorage.ts`).
  `app-data-storage-delete`, `-clear`, `-get-keys` 채널 상수와 renderer 어댑터 메서드는 있지만 main 핸들러가 없어 호출하면 reject된다.
  `useCases/appDataStorage/deleteInAppDataStorage.ts`도 연결되지 않았다 [upstream]
- 위젯 데이터 복사 채널 문자열은 `copt-widget-data-storage`다 (오타, 상수명은 `ipcCopyWidgetDataStorageChannel`) [upstream]

#### 새 IPC 기능 추가 경로

System Monitor (#60)의 `get-system-stats`를 예로 든 파일 순서:

1. `src/common/base/<x>.ts`: 주고받을 타입 (필요할 때)
2. `src/common/ipc/channels.ts`: 채널 상수와 Args, Res 타입
3. `src/main/application/interfaces/<x>Provider.ts`: main 포트
4. `src/main/infra/<x>Provider/<x>Provider.ts`: Electron, Node 구현
5. `src/main/application/useCases/<x>/<동작>.ts`: use case
6. `src/main/controllers/<x>.ts`: `create<X>Controllers`
7. `src/main/index.ts`: provider, use case 생성 후 `registerControllers` 배열에 추가
8. `src/renderer/application/interfaces/<x>Provider.ts`: renderer 포트
9. `src/renderer/infra/<x>Provider/<x>Provider.ts`: `electronIpcRenderer.invoke` 구현
10. `src/renderer/init.ts`: provider 생성 후 use case나 `createGetWidgetApiUseCase` deps로 전달
11. 위젯이 쓰면 `src/renderer/base/widgetApi.ts` 타입, `getWidgetApi.ts` 모듈, 위젯 `requiresApi`
    ([features-widgets.md](features-widgets.md))
12. 테스트: `tests/main/controllers/`, `tests/main/application/useCases/`, mock은 `tests/main/infra/mocks/`, renderer IPC는
    `jest.mock('@/infra/mainApi/mainApi')` (`src/renderer/infra/mainApi/__mocks__/mainApi.ts`)

### 상태 관리와 저장

#### store 래퍼

`createStore` (`src/common/data/store.ts`)는 main 창 상태와 renderer 앱 상태가 함께 쓴다.

- zustand vanilla + `subscribeWithSelector`. 반환값은 `[store, zustandStore]`. use case는 `store` (`Store` 인터페이스: `get`,
  `set`, `flush`, `subscribe` (shallow 비교), `subscribeWithStrictEq`, `subscribeWithCustomEq`)를, UI 훅은 `zustandStore`를
  쓴다 [upstream]
- 로드 순서: `{...initialState, isLoading: true}`로 시작 → `stateStorage.loadState()` → 값이 있으면
  `mergeState(initialState, loaded)` → `prepareState` → `isLoading` 없는 상태로 교체 → `onStoreReady` [upstream]
- 로드가 reject되면 기본 상태로 시작한다 [fork #30]
- 로드 완료 전 `set`은 무시된다 (`isLoaded` 가드) [upstream]
- `set` 전후 상태가 shallow 비교로 같으면 저장 (debounce 타이머 재설정 포함)을 건너뛴다 [fork #30]
- renderer UI 훅 `createAppStateHook` (`src/renderer/ui/hooks/appState.ts`): 기본은 shallow 비교, `useWithStrictEq`,
  `useWithCustomEq`, `useEntityList` 변형이 있다 [upstream]

#### 영구 저장 (stateStorage)

`createStateStorage` (`src/common/data/stateStorage.ts`):

- `{ver, obj}` 래퍼 (`src/common/base/versionedObject.ts`)로 저장한다. 버전이 다르면 `migrate`를 거친다 [upstream]
- 저장은 debounce된다. 앱 상태와 창 상태 모두 5000ms (`createAppStateStorage`, `createWindowStateStorage`) [upstream, fork #30 변경]
- `flush()`: main은 `will-quit`에서 창 상태를, renderer는 `beforeunload`에서 앱 상태를 즉시 저장한다. 디스크 쓰기는 await하지 않는
  best-effort다 [fork #30]
- 로드 검증: 래퍼가 아니면 `null`, migrate나 unwrap이 throw하면 `null`, 검증기 (`isPersistentAppState`, `isPersistentWindowState`)가 거부하면
  `null` → store는 기본값으로 시작 [fork #49]. 이때 비어 있지 않은 원본 텍스트를 `<키>-corrupt-<밀리초 시각>` 키로 먼저 저장한다 [fork #30 후속]
- 저장 생략: `saveState`는 저장할 JSON이 마지막으로 넘긴 JSON과 같으면 debounce를 건드리지 않는다. 저장 대상이 아닌 필드 (예: `ui.widgetDynamicTitles`)만
  바뀐 `set`이 저장을 계속 미루지 않게 한다 [fork #30 후속]

#### 앱 상태의 영구 범위

`src/renderer/base/state/app.ts`:

- `currentAppStateVersion = 2`. `migrateAppState`는 버전 1 데이터에 memSaver 설정을 추가한다 [upstream]
- `createPersistentAppState`가 저장에서 빼는 것: `ui`의 `copy`, `dragDrop`, `editMode`, `palette`, `memSaver`, `modalScreens`,
  `worktable`, `entities.widgetTypes`, 위젯의 `exposedApi` [upstream]. `ui.widgetDynamicTitles` (위젯 동적 제목) [fork #11]
- `palette`가 저장되지 않으므로 팔레트 목록은 항상 `createUiState`의 `palette.widgetTypeIds` 값이다 (`src/renderer/base/state/ui.ts`)
- `mergeAppStateWithPersistentAppState`: `entities`와 `ui`는 1단계 병합이고, `ui.appConfig`, `ui.apps`, `ui.projectSwitcher`,
  `ui.shelf`만 한 단계 더 병합한다. 그래서 `appConfig`에 새 최상위 필드를 추가하면 기존 사용자도 기본값을 받는다. `appConfig.telemetry`, `appConfig.memSaver`
  처럼 중첩 객체 안에 필드를 추가하면 저장된 객체가 통째로 덮어써서 새 필드의 기본값이 빠진다 [upstream]
- `prepareState`는 `initAppStateWidgets`다. 위젯마다 `widgetType.createSettingsState(settings)`로 설정을 다시 만들어 새 설정 필드의 기본값을
  채운다 [upstream]
- 창 상태 (`src/main/base/state/window.ts`)는 `currentWindowStateVersion = 1`이고 7개 필드 전체를 저장한다 [upstream]

#### AppConfig 필드

타입은 `src/renderer/base/appConfig.ts`, 기본값은 `createUiState` (`src/renderer/base/state/ui.ts`)에 있다.

| 필드                                             | 기본값                                                                | 출처                      |
|--------------------------------------------------|-----------------------------------------------------------------------|---------------------------|
| `mainHotkey`                                     | `'CmdOrCtrl+Shift+Space'`                                             | [upstream, fork #20 변경] |
| `memSaver`                                       | `{activateWorkflowsOnProjectSwitch: true, workflowInactiveAfter: -1}` | [upstream]                |
| `uiTheme`                                        | `defaultUiThemeId`                                                    | [upstream]                |
| `downloadDir`                                    | `''` (OS Downloads)                                                   | [fork #41]                |
| `bgColor`, `bgImage`, `bgImageMode`, `bgOpacity` | `''`, `''`, `'cover'`, `100`                                          | [fork #42]                |
| `workflowBarPos`, `workflowBarWidth`             | `'left'`, `200`                                                       | [fork #45]                |
| `telemetry`                                      | `{enabled: false, idleTimeoutMs: 300000}`                             | [fork #62]                |

#### 저장소 계층

| 계층                  | 위치                                                                      | 동작                                                                                                                                                                                                    |
|-----------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 파일 저장소 (main)    | `createFileDataStorage` (`src/main/infra/dataStorage/fileDataStorage.ts`) | 폴더 하나에 키당 파일 하나. 키의 `[^A-Za-z0-9_\-()\s]` 문자는 `_`로 바꾼다. `setText`는 `<파일>.tmp`에 쓰고 `sync`한 뒤 `rename`으로 바꾼다 (원자적 쓰기). `rename`이 실패하면 (Windows에서 대상 파일이 다른 프로세스나 대기열 밖의 `copyFileDataStorage`에 열려 있을 때) 대상 파일에 직접 쓴다. `getKeys`, `clear`, `copyFileDataStorage`는 `.tmp`를 제외한다 [fork #30 후속]. 같은 파일의 `getText`, `setText`, `deleteItem`은 파일 경로별 대기열로 호출 순서대로 실행한다 [fork #30 후속]. 읽기, 쓰기 오류는 삼키고 `undefined` 반환 [upstream, fork #30 변경] |
| 저장소 캐시           | `createObjectManager` (`src/common/base/objectManager.ts`)                | id별 저장소 인스턴스를 Promise로 캐시하고 복사 함수를 함께 둔다. main (위젯, 공유)과 renderer 양쪽에서 쓴다 [upstream]                                                                                  |
| IPC 어댑터 (renderer) | `src/renderer/infra/dataStorage/*.ts`                                     | `DataStorage` 메서드를 IPC invoke로 옮긴다                                                                                                                                                              |
| JSON, 중복 쓰기 생략  | `withJson`, `setTextOnlyIfChanged` (`src/common/infra/dataStorage/`)      | renderer `prepareDataStorageForRenderer`가 app, 위젯, 공유 저장소에 둘 다 적용한다. telemetry는 `withJson`만 쓴다                                                                                       |

#### 디스크 경로

`<appData>`는 `app.getPath('appData')`다.

| 실행 형태                                 | 판별                       | Electron `userData` (세션, 캐시, 단일 인스턴스 잠금)                       | 앱 데이터 `appDataDir`                   |
|-------------------------------------------|----------------------------|----------------------------------------------------------------------------|------------------------------------------|
| 설치본                                    | `app.isPackaged === true`  | Electron 기본값 (productName `Freeter-SWH` 기준, `src/main/index.ts` 주석) | `<appData>/freeter-swh/freeter-data`     |
| 저장소 실행 (`yarn dev`, `yarn prod:run`) | `app.isPackaged === false` | `<appData>/freeter-swh-dev`                                                | `<appData>/freeter-swh-dev/freeter-data` |
| upstream (참고)                           |                            |                                                                            | `<appData>/freeter2/freeter-data`        |

`appDataDir` 아래 구성:

| 경로                                      | 내용                                                                                                                    | 출처         |
|-------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|--------------|
| `app`                                     | 앱 상태 (키 `appStateDataStoragKey = 'app'`)                                                                            | [upstream]   |
| `window`                                  | main 창 상태 (키 `windowStateDataStoragKey = 'window'`)                                                                 | [upstream]   |
| `widgets/<widgetId>/<key>`                | 위젯별 데이터                                                                                                           | [upstream]   |
| `shared/<widgetType>/<sharedKeyId>/<key>` | 공유 데이터 키 버킷. `sharedKeyId`는 idGenerator가 만든 id다. To-Do List 프로젝트 동기화는 `shared/to-do-list/<scope>/` | [fork #8 #9] |
| `telemetry/events-YYYY-MM-DD`             | 사용 통계 일자 파일                                                                                                     | [fork #62]   |

- `isDevMode` (`process.env.NODE_ENV !== 'production'`, `src/main/infra/processProvider/processProvider.ts`)는 renderer
  출처 (개발 서버 또는 빌드 파일)와 DevTools를 정한다. `app.isPackaged`는 데이터 폴더, 앱 이름, 창 제목 고정을 정한다. `yarn prod:run`은 production 빌드지만
  데이터는 `freeter-swh-dev`를 쓴다 [fork #80]
- 메뉴 "Open Data Folder"는 `appDataDir`을 연다 (`useCases/shell/openAppDataDir.ts`) [fork #5]

### main 프로세스 기능 지도

경로는 `src/main/` 기준이다. 각 그룹은 `application/useCases/<그룹>/`, `controllers/<그룹>.ts`, 해당 `infra/` provider로 구성된다.

| 그룹                 | 역할                                                                                                                                                                        | 주요 파일                                                                                                                                      | 출처                            |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------|
| appDataStorage       | 앱 상태 파일 읽기, 쓰기 (get, set만 등록)                                                                                                                                   | `controllers/appDataStorage.ts`, `infra/dataStorage/fileDataStorage.ts`                                                                        | [upstream, fork #30 변경]       |
| widgetDataStorage    | 위젯별 저장소 CRUD, 위젯 복제 시 폴더 복사                                                                                                                                  | `controllers/widgetDataStorage.ts`, `copyFileDataStorage`                                                                                      | [upstream]                      |
| sharedDataStorage    | 공유 키 저장소 CRUD, 쓰기 후 `shared-data-changed` 전송. `useCases/sharedDataStorage/sharedStorageId.ts`는 참조처가 없다 (실제 사용은 `src/common/base/sharedStorageId.ts`) | `controllers/sharedDataStorage.ts`                                                                                                             | [fork #8]                       |
| telemetryDataStorage | 사용 통계 파일 CRUD                                                                                                                                                         | `controllers/telemetryDataStorage.ts`                                                                                                          | [fork #62]                      |
| analytics            | 루프백 서버를 띄우고 기본 브라우저로 리포트 열기                                                                                                                            | `useCases/analytics/openAnalyticsInBrowser.ts`, `infra/analyticsServer/analyticsServer.ts` (`handleAnalyticsRequest`, `createAnalyticsServer`) | [fork #87]                      |
| osActivity           | 동의 시 OS 전경 앱, 창 제목, 잠금, 절전 기록. 입력 없음 180초 이상이면 구간 종료. 전경 창 샘플은 Windows만 (다른 OS는 `powerMonitor` 이벤트만)                              | `application/osActivity/osActivityMonitor.ts`, `infra/osActivity/foregroundWindow.ts`, `useCases/osActivity/setOsMonitoring.ts`                | [fork #64]                      |
| appMenu              | renderer가 보낸 메뉴로 앱 메뉴 구성, 메뉴 막대 자동 숨김                                                                                                                    | `useCases/appMenu/`, `infra/appMenuProvider/`, `infra/utils/menu.ts`                                                                           | [upstream]                      |
| tray                 | 트레이 아이콘과 메뉴                                                                                                                                                        | `useCases/tray/`, `infra/trayProvider/`                                                                                                        | [upstream, fork #1 변경]        |
| contextMenu          | OS 컨텍스트 메뉴 표시, 선택 `actionId` 반환                                                                                                                                 | `useCases/contextMenu/popupContextMenu.ts`                                                                                                     | [upstream]                      |
| browserWindow        | 창 상태 읽기, 쓰기 (windowStore), 창 표시                                                                                                                                   | `useCases/browserWindow/`, `infra/browserWindow/browserWindow.ts`                                                                              | [upstream, fork 여러 섹션 변경] |
| clipboard            | 텍스트, 북마크 쓰기                                                                                                                                                         | `useCases/clipboard/`                                                                                                                          | [upstream]                      |
| dialog               | 메시지 상자, 파일 열기, 저장, 폴더 선택                                                                                                                                     | `useCases/dialog/`, `infra/dialogProvider/`                                                                                                    | [upstream, fork #1 변경]        |
| globalShortcut       | 메인 단축키 등록                                                                                                                                                            | `useCases/globalShortcut/setMainShortcut.ts`                                                                                                   | [upstream]                      |
| process              | OS, Chrome 버전, `isDevMode` 정보                                                                                                                                           | `infra/processProvider/processProvider.ts`                                                                                                     | [upstream]                      |
| shell                | 외부 URL, 경로, 앱 실행 [upstream]. 데이터 폴더 열기 [fork #5]                                                                                                              | `useCases/shell/`                                                                                                                              | [upstream, fork #5 변경]        |
| terminal             | OS 기본 터미널에서 명령 실행 (Commander 위젯)                                                                                                                               | `useCases/terminal/execCmdLinesInTerminal.ts`, `base/apps/terminal.ts`, `infra/appsProvider/detectDefaultTerminal.ts`                          | [upstream]                      |
| fs                   | 폴더 읽기, 홈 경로 [fork #31 #32], 이미지 data URL (20MB 이하) [fork #42]                                                                                                   | `useCases/fs/`, `infra/fsProvider/fsProvider.ts`                                                                                               | [fork #31 #32 #42]              |
| icon                 | 파일 아이콘, 파비콘 (MIME 바이트 검사, 진행 중 요청 공유)                                                                                                                   | `useCases/icon/`, `infra/iconProvider/iconProvider.ts`                                                                                         | [fork #21]                      |
| systemStats          | CPU 사용률 (직전 호출 대비), 메모리                                                                                                                                         | `infra/systemStatsProvider/systemStatsProvider.ts`                                                                                             | [fork #60]                      |
| download             | 모든 session의 다운로드를 지정 폴더로 저장, 이름 충돌 시 ` (n)`                                                                                                             | `infra/downloads/downloadManager.ts` (`resolveUniqueSavePath`)                                                                                 | [fork #41]                      |

infra 전용 구성: `infra/protocolHandler/` (`freeter-file` 스킴 등록) [upstream], `infra/ipcMain/` [upstream],
`infra/httpAuth/` [fork #71], `infra/permissions/` (세션 권한 처리기) [fork #88].

### 빌드, 실행, 패키징 구성

#### 번들

| 스크립트                          | 설정                          | 엔트리                                 | 출력                                                | target             |
|-----------------------------------|-------------------------------|----------------------------------------|-----------------------------------------------------|--------------------|
| `dev:main`, `prod:main`           | `webpack.main.config.js`      | `src/main/index.ts`                    | `build/main.js`                                     | `electron-main`    |
| `dev:preload`, `prod:preload`     | `webpack.preload.config.js`   | `src/renderer/preload/index.ts`        | `build/preload.js`                                  | `electron-preload` |
| `dev:renderer`, `prod:renderer`   | `webpack.renderer.config.js`  | `src/renderer/index.tsx`               | `build/renderer.js`, `build/index.html`, sprite SVG | `web`              |
| `dev:analytics`, `prod:analytics` | `webpack.analytics.config.js` | `src/renderer/analyticsPage/index.tsx` | `build/analytics/`                                  | `web` [fork #87]   |
| `dev:assets`, `prod:assets`       | copyfiles                     | `src/assets/**`                        | `build/assets/**`                                   |                    |

- 모든 TS는 `swc-loader`로 변환한다. 개발 빌드의 main, preload, renderer는 `ForkTsCheckerWebpackPlugin`으로 타입 검사를 병행한다 (analytics 설정에는
  없다)
- renderer `DefinePlugin`: `VERSION` (package.json), `BUILT_AT`, `COMMIT_HASH` (`git rev-parse HEAD`), `BACKERS`
  (`backers.json`)
- 모든 설정이 `EnvironmentPlugin({NODE_ENV: 'development'})`을 쓴다. 스크립트가 `cross-env NODE_ENV=...`로 값을 정한다
- Analytics 번들은 페이지 CSP에 `'unsafe-eval'`이 없어서 개발 빌드도 eval 기반 devtool 대신 `source-map`을 쓴다 (`webpack.analytics.config.js`
  주석)

#### 개발 실행

`yarn dev` = `react-devtools` + `dev:no-react-devtools`. 후자의 순서:

1. `rimraf build`
2. `dev:assets`, `dev:preload` (preload는 watch 없이 한 번만 빌드)
3. 병렬: `dev:renderer` (webpack-dev-server 포트 4000), `dev:main` (watch), `dev:analytics` (watch), `dev:run`
4. `dev:run`: nodemon이 `build/main.js` 변경을 감시해 `electron ./build/main.js`를 재시작한다. `--delay 3`은 Windows에 없는 `sleep`을 대체한
   것이다 [fork #2]

- 개발 모드 renderer는 `freeter-file` 프로토콜 핸들러가 `http://localhost:4000`에서 가져온다 (`registerAppFileProtocol`). production은
  `main.js` 옆 파일을 읽는다 [upstream]
- dev server는 `hot: false`, `liveReload: false`이고 swc `refresh: false`다. renderer 코드를 바꾸면 창을 직접 새로고침해야 한다 (추정: 자동 반영 경로가
  설정에 없다)
- preload를 바꾸면 `yarn dev`를 다시 시작해야 한다 (preload는 시작할 때 한 번만 빌드된다)
- `yarn prod`는 4개 번들과 assets를 production으로 빌드하고, `yarn prod:run`은 그 결과를 Electron으로 띄운다

#### 패키징과 CI/CD

- `yarn package` = `electron-builder --config electron-builder.config.js`. 입력은 `build/` 전체와 `package.json`. 대상: Windows
  msi와 zip (x64), Linux tar.xz (x64). macOS 대상은 없다 (decisions.md D59). `publish: ['github']`
- CI (`.github/workflows/ci.yml`): master push, PR, 수동 실행. Node 22, `yarn install` (git ssh URL을 https로 바꾸는 설정 포함) →
  `yarn run test` → `yarn run prod` → `yarn run lint` → `yarn run test:typecheck` [upstream, fork 변경]
- CD (`.github/workflows/cd.yml`): `v*.*.*` 태그 push. Linux → Windows 순서로 `needs:` 직렬 실행하고 각각 `yarn run prod`,
  `yarn run cd:package-draft` (`--publish always`)로 GitHub draft 릴리스에 올린다. 병렬 실행하면 같은 태그의 draft가 여러 개 생겼기 때문이다 (cd.yml
  주석, swh.10에서 발생) [upstream, fork 변경]
- `draft-release` 스크립트: `yarn version && git push && git push --tags`
- 릴리스 절차는 [procedures.md](procedures.md)에 있다

### 테스트 구조

- `jest.config.js`의 프로젝트 4개: Main (node), Renderer (jsdom, `tests/renderer/setupTests.ts`에서 `@testing-library/jest-dom`
  로드), Common (node), Test Utils (node). `testMatch`는 `**/*.spec.(js|jsx|ts|tsx)`, 변환은 `@swc/jest` [upstream]
- 별칭: `@/` (해당 surface), `@common/`, `@tests/` (`tests/<surface>/`), `@testscommon/` (`tests/common/`), `@utils/`
  (`tests/utils/`)
- renderer 전용 매핑: 이미지, 폰트, 오디오 → `tests/__mocks__/fileMock.js`, scss → `tests/__mocks__/identity-obj-proxy.js`,
  `@pierre/trees` → 수동 mock [fork #31]
- 위치: spec은 `tests/<surface>/` 아래에 두고 대부분 src 경로를 그대로 따른다. UI 컴포넌트 spec은 한 단계 위 폴더에 있다 (예: `tests/renderer/ui/components/palette.spec.tsx`).
  src 안에 있는 spec은 `src/renderer/widgets/spreadsheet/formula.spec.ts` 1개다
- fixture: 범용 팩토리 `makeFixture` (`tests/utils/makeFixture/makeFixture.ts`, 결과를 `deepFreeze`)와 도메인 fixture
  `tests/<surface>/**/fixtures/` (예: `tests/renderer/base/fixtures/widget.ts`)
- mock: `tests/main/infra/mocks/` (ipcMain, provider들), `tests/renderer/infra/mocks/`, renderer IPC는
  `src/renderer/infra/mainApi/__mocks__/mainApi.ts`
- 타입 검사: `yarn test:typecheck`가 `tests/renderer/tsconfig.json`, `tests/main/tsconfig.json`, `tests/common/tsconfig.json`
  으로 `tsc --noEmit`을 실행한다
- Electron 전용 모듈 `node:original-fs`는 jest에서 `jest.mock(..., () => jest.requireActual('node:fs'), { virtual: true })`로
  대체한다 [fork #30]

### 보안 경계

| 항목              | 내용                                                                                                                                                                                          | 위치                                                                             | 출처                      |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|---------------------------|
| renderer 격리     | `nodeIntegration: false`, `contextIsolation: true`, `webSecurity: true`                                                                                                                       | `infra/browserWindow/browserWindow.ts`                                           | [upstream]                |
| 앱 페이지 출처    | privileged 스킴 `freeter-file` (`standard`, `secure`, `supportFetchAPI`, `stream`). 호스트가 `freeter-app`이 아니면 404                                                                       | `infra/protocolHandler/`                                                         | [upstream]                |
| CSP               | `default-src 'none'`, `script-src 'self'` (개발 빌드는 `'unsafe-eval'` 추가), `img-src * data:` (`data:`는 포크가 추가)                                                                       | `src/renderer/index.ejs`                                                         | [upstream, fork #21 변경] |
| IPC 발신자 검증   | `freeter-file://freeter-app`의 메인 프레임만 허용. webview, 팝업은 IPC 불가                                                                                                                  | `infra/ipcMain/ipcMainEventValidator.ts`                                         | [upstream]                |
| MainApi 1회 전달  | `getMainApiOnce`. window 전역에 IPC 객체를 남기지 않는다                                                                                                                                      | `src/renderer/preload/index.ts`                                                  | [upstream]                |
| 페이지 이탈 차단  | main 창 `will-navigate` 차단                                                                                                                                                                  | `infra/browserWindow/browserWindow.ts`                                           | [upstream]                |
| 게스트 URL 외부 열기 | 새 탭 요청, Ctrl/Cmd+T, "Open in web browser", "Open link in web browser"는 `isAllowedExternalUrl` (http, https, mailto만)을 통과한 URL만 `shell.openExternal`로 넘긴다. `sanitizeUrl`은 파싱 여부만 보고 스킴은 거르지 않는다 | `infra/browserWindow/browserWindow.ts`, `src/renderer/widgets/webpage/actions.ts`, `src/common/helpers/isAllowedExternalUrl.ts` | [fork #13 #25 #88] |
| 세션 권한 요청 | `registerPermissionHandler`가 기본 세션과 이후의 모든 세션 (webview 파티션 포함)에 처리기를 건다. `openExternal` (같은 프레임 이동으로 여는 앱 프로토콜)은 `isAllowedExternalUrl`을 통과할 때만 승인한다. 다른 권한 (알림, 카메라, 마이크 등)은 Electron 기본값처럼 모두 승인한다. 상세: [pitfalls.md](pitfalls.md)의 "세션 권한 요청 처리기" | `infra/permissions/permissionHandler.ts` | [fork #88] |
| HTTP 인증 창      | data: URL, `sandbox: true`, `contextIsolation: true`. realm, host는 `escapeHtml` 처리. 페이지 이동과 proxy 인증에만, webContents마다 하나씩 [fork #90]                                       | `infra/httpAuth/httpAuth.ts`                                                     | [fork #71]                |
| Analytics 서버    | `127.0.0.1` 랜덤 포트. Host 헤더 정확히 일치 (DNS rebinding 차단), 실행마다 바뀌는 토큰 경로, CORS 없음, 페이지 CSP, `Referrer-Policy: no-referrer`, 정적 파일 이름 정규식. 상세: CHANGES #87 | `infra/analyticsServer/analyticsServer.ts`                                       | [fork #87]                |
| 파일 시스템 IPC   | `fs-read-dir`, `fs-get-image-data-url`, 공유 저장소 경로 (`widgetType`, `sharedKeyId` 인자로 경로 조립)는 main에서 경로 제한을 두지 않는다. 신뢰 경계는 IPC 발신자 검증이다                   | `infra/fsProvider/fsProvider.ts`, `src/main/index.ts` `getSharedDataStoragePath` | [fork #8 #31 #42]         |
| 다운로드          | 저장 대화상자 없이 지정 폴더에 저장 (webview partition 포함 모든 session)                                                                                                                     | `infra/downloads/downloadManager.ts`                                             | [fork #41]                |
