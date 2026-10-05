## 위젯 기능 지도

위젯 16종과 위젯 시스템 기반 코드의 위치, 데이터 흐름, 저장 방식, 주의점을 담은 문서다.

- 기준 시점: 2026-10-05. upstream 기준: `v2.8.0-beta`.
- 출처 표기: `[upstream]`(upstream v2.8.0-beta에 있던 것), `[fork #N]`(포크 추가, N은 `docs/CHANGES.md` 섹션 번호),
  `[upstream, fork #N 변경]`, `[fork]`(대응 CHANGES 섹션 없음).
- 관련 문서: 앱 전체 구조 [overview.md](overview.md), 워크플로우·레이아웃·팔레트·셸프 등 앱 기능 [features-core.md](features-core.md), 주제별
  함정 [pitfalls.md](pitfalls.md), 설계 결정 [decisions.md](decisions.md), 작업 절차 [procedures.md](procedures.md).

### 위젯 시스템 구조

#### 구성 요소

| 구성 요소             | 위치와 심볼                                                                                                                                | 역할                                                        | 출처                                                     |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------|----------------------------------------------------------|
| 위젯 타입 계약        | `src/renderer/base/widgetType.ts` `WidgetType`                                                                                             | 위젯 타입가 갖춰야 할 필드                                  | [upstream]                                               |
| 위젯 인스턴스         | `src/renderer/base/widget.ts` `Widget`, `WidgetEnv`, `createWidget`, `getWidgetDisplayName`, `resolveWidgetSharedKeyId`                    | 엔티티, 배치 환경, 헬퍼                                     | [upstream, fork #8 변경]                                 |
| 위젯 목록             | `src/renderer/widgets/index.ts` 기본 export 배열                                                                                           | 등록된 위젯 타입 16개                                       | [upstream, fork 신규 위젯 추가]                          |
| 레지스트리            | `src/renderer/registry/registry.ts` `registry.getWidgetTypes`                                                                              | 위 배열을 그대로 반환                                       | [upstream]                                               |
| 팔레트 목록           | `src/renderer/base/state/ui.ts` `palette.widgetTypeIds`                                                                                    | "Add Widget"에 보이는 위젯 타입 목록. 하드코딩 배열, 비영속 | [upstream, fork 위젯마다 추가]                           |
| 위젯 API 정의         | `src/renderer/base/widgetApi.ts` `WidgetApi`, `WidgetSettingsApi`, `WidgetHeaderTabs`, `createWidgetApiFactory`                            | 위젯이 받는 API의 타입과 조립 함수                          | [upstream, fork #8 #11 #21 #31 #32 #60 #63 #67 #69 변경] |
| 위젯 API 생성         | `src/renderer/application/useCases/widget/getWidgetApi.ts` `createGetWidgetApiUseCase`                                                     | 위젯별 API 객체 생성, 저장소 라우팅                         | [upstream, fork #8 #9 #11 #21 #31 #60 #63 #67 변경]      |
| 설정 API 생성         | `src/renderer/application/useCases/widgetSettings/getWidgetSettingsApi.ts` `createGetWidgetSettingsApiUseCase`                             | 설정 편집기용 API                                           | [upstream, fork #8 변경]                                 |
| 위젯 셸               | `src/renderer/ui/components/widget/widget.tsx` `createWidgetComponent`, `widgetViewModel.ts` `createWidgetViewModelHook`                   | 헤더(이름 또는 탭), 액션바, 컨텍스트 메뉴, 본문             | [upstream, fork #11 #12 #58 #63 #67 #69 변경]            |
| 컴포넌트 props 타입   | `src/renderer/ui/types/widgetType.ts` `WidgetReactComponentProps`, `SettingsEditorReactComponentProps`                                     | `widgetComp`·`settingsEditorComp`가 받는 props              | [upstream]                                               |
| 위젯용 공용 export    | `src/renderer/widgets/appModules.ts`                                                                                                       | 위젯 코드가 import하는 타입·UI 부품·헬퍼의 창구             | [upstream, fork #75 변경]                                |
| 공유 상태             | `src/renderer/base/state/shared.ts` `SharedState`, `createSharedState`, `sharedStateEquals`                                                | `requiresState`로 받는 앱 상태 조각                         | [upstream, fork #8 #33 변경]                             |
| 공유 키 엔티티        | `src/renderer/base/sharedDataKey.ts` `SharedDataKey`                                                                                       | 위젯 타입별 공유 데이터 버킷                                | [fork #8]                                                |
| 공유 변경 이벤트      | `src/renderer/base/sharedDataEvents.ts` `SHARED_DATA_CHANGED_EVENT`, `src/renderer/widgets/sharedDataSync.ts` `useSharedDataChangedEffect` | 공유 키 쓰기 브로드캐스트 구독                              | [fork #10]                                               |
| 동적 아이콘 훅        | `src/renderer/widgets/useDynamicIcon.ts` `useDynamicIcon`                                                                                  | 파비콘·파일 아이콘 조회와 클릭 시 재시도                    | [fork #21]                                               |
| 위젯 간 공개 API 타입 | `src/renderer/widgets/interfaces.ts` `WebpageExposedApi`                                                                                   | Web Query가 Webpage를 조종할 때 쓰는 계약                   | [upstream]                                               |
| 디바운스 재export     | `src/renderer/widgets/helpers.ts`                                                                                                          | `@common/helpers/debounce` 재export                         | [upstream]                                               |

#### 시작과 렌더링 흐름

1. `src/renderer/init.ts`의 `createStore`가 `registry.getWidgetTypes()` 결과를 `entityStateActions.widgetTypes.setAll`로
   `entities.widgetTypes`에 넣는다.
2. 영구 상태 병합 뒤 `prepareState`로 `initAppStateWidgets`(`src/renderer/base/state/app.ts`)가 실행된다. 위젯마다
   `type.createSettingsState(widget.settings)`를 다시 돌리므로, 저장된 설정의 검증과 마이그레이션은 매 시작마다 이 지점에서 일어난다. 타입을 찾지 못한 위젯은 설정을 그대로
   둔다.
3. 워크플로우 레이아웃이나 셸프가 위젯 셸을 렌더한다.
4. 셸의 `useViewModel`이 `getWidgetApiUseCase(widgetId, isPreview, 핸들러 6종, requiresApi)`로 위젯 API를 만들고 `useMemo`로 고정한다.
5. 셸이 위젯 타입의 `widgetComp.Comp`에 `id`, `env`, `settings`, `widgetApi`, `sharedState`를 넘긴다.

#### WidgetType 계약

| 필드                               | 의미                                | 비고                                                                                                                                                    |
|------------------------------------|-------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                               | 위젯 타입 id                        | 저장된 위젯의 `type`, 공유 저장소 경로(`shared/<widgetType>/...`), 팔레트 목록이 이 값을 쓴다. 맞는 타입이 없으면 셸이 `Unknown widget type`을 표시한다 |
| `name`, `description`, `icon`      | 팔레트와 헤더 표시                  | 인스턴스 이름이 비면 헤더에 `name`이 나온다                                                                                                             |
| `minSize`                          | 격자 단위 최소 크기                 | 새로 추가할 때 기본 크기도 된다. 아래 "minSize와 기본 크기" 참조                                                                                        |
| `maximizable`                      | 보기 모드 액션바에 최대화 버튼 추가 | Note, Webpage만 true                                                                                                                                    |
| `widgetComp`, `settingsEditorComp` | `{ type: 'react', Comp }`           | `ReactComponent` 타입                                                                                                                                   |
| `createSettingsState`              | 부분 설정을 받아 완전한 설정 반환   | 생성 시 `{}`, 로드 시 저장값으로 호출. 타입 검증, 기본값, 마이그레이션 담당                                                                             |
| `requiresApi`                      | 받을 `WidgetApi` 모듈 이름 목록     | 선언하지 않은 모듈은 `widgetApi`에 속성 자체가 없다 (`createWidgetApiFactory`가 `availableModules`만 조립)                                              |
| `requiresState`                    | 받을 공유 상태 슬라이스             | `apps`(File Opener), `sharedDataKeys`(Note)                                                                                                             |

#### 위젯 인스턴스와 설정

- **엔티티 형태**: `Widget = { id, type, coreSettings: { name }, settings, exposedApi? }` (`src/renderer/base/widget.ts`).
- **새 위젯 이름**: `coreSettings.name`은 `''`로 생성된다 [fork #16]. 생성 경로는 `addWidgetToWorkflow`, `addWidgetToShelf`,
  `dropOnWorktableLayout`, `dropOnTopBarList` 4곳이다. 붙여넣기 (clone)는 원래 이름을 이어받고 `generateWidgetName`으로 중복을 피한다.
- **헤더 이름 우선순위**: `coreSettings.name` → `ui.widgetDynamicTitles[widgetId]` → `WidgetType.name` (`widgetViewModel.ts`의
  `widgetName`) [fork #11].
- **비영속 필드**: `exposedApi`와 `ui.widgetDynamicTitles`는 `createPersistentAppState`(`src/renderer/base/state/app.ts`)에서
  빠진다. 동적 타이틀은 위젯 삭제 시 `deleteWidget`이 함께 지운다 [fork #11].
- **배치 환경**: `WidgetEnv`는 `{ area: 'workflow', projectId, workflowId }` 또는 `{ area: 'shelf' }`이고, 선택 필드 `isPreview`가 있다.
  `createWidgetEnv`가 객체를 freeze한다.
- **설정 마이그레이션 사례** (모두 `createSettingsState` 안에서 처리):

| 위젯        | 옛 형태                              | 현재 형태                                                                      | 출처       |
|-------------|--------------------------------------|--------------------------------------------------------------------------------|------------|
| Web Query   | 단일 `{engine, descr, query, url}`   | `entries: QueryEntry[]`                                                        | [fork #47] |
| Webpage     | `url` 안의 `URL \| 이름` 파이프 문법 | `urlName`, `tabs: {url, name}[]`. `urlName`이 저장된 뒤에는 재파싱하지 않는다  | [fork #67] |
| Spreadsheet | 버전 없는 설정                       | 버전 스탬프 `v`. 스탬프가 다르면 `cols`, `rows`를 현재 기본값으로 한 번 덮는다 | [fork #86] |
| D-Day       | 형식만 맞는 날짜                     | `parseLocalDate`로 실제 유효성까지 검사해 불량 항목 제거                       | [fork #51] |

#### 위젯 셸

- **보기 모드 액션바**: 위젯이 `updateActionBar`로 넘긴 항목 뒤에, `maximizable`이면 최대화 버튼이 붙는다.
- **편집 모드 액션바**: `WIDGET-SETTINGS`, `DELETE-WIDGET`, `MORE-ACTIONS`. More 메뉴에도 Widget Settings, Copy Widget, Delete
  Widget이 있다. 위젯이 작아 액션바가 잘려도 설정과 삭제에 접근하기 위한 장치다 [upstream, fork #58 변경].
- **컨텍스트 메뉴**: 편집 모드는 셸의 고정 메뉴, 보기 모드는 위젯이 `setContextMenuFactory`로 등록한 팩토리를 쓴다. 팩토리의 `contextId` 인자는 이벤트 대상에서 가장 가까운
  조상의 `data-widget-context` 값이다 (`getContextId`). 위젯 본문 div가 `data-widget-context=""`를 갖는다.
- **편집 모드 본문**: `inert`로 상호작용을 막는다 [upstream]. 리사이즈나 드래그 중에는 액션바를 숨긴다 (`dontShowActionBar`).
- **헤더 탭**: 위젯이 `setHeaderTabs`로 탭을 넘기고 편집 모드가 아니면, 헤더가 이름 대신 탭 바를 그린다. 숨은 스크롤바 대신 세로 휠을 가로 스크롤로 바꾸고, 활성 탭을
  `scrollIntoView`로 보이게 한다 [fork #67 #69].
- **`data-widget-type` 속성**: 루트 div에 위젯 타입를 노출한다. `widget.module.scss`가 이 속성으로 Webpage 헤더 이름만 텍스트 선택을 허용한다 [fork #12].
- **미리보기**: 위젯 설정 화면 (`openWidgetSettings`)이 `env.isPreview = true`로 위젯을 그린다. 미리보기는 셸 없이 `WidgetComp`만 렌더한다. 공통 함수
  (`updateActionBar` 등)는 no-op이고, 모듈 (`dataStorage` 등)은 실제로 동작한다. 저장소 라우팅은 store에 저장된 위젯 엔티티의 설정을 읽으므로, 설정 화면에서 바꾼
  `sharedKeyId`는 저장 후에 반영된다.
- **숨은 워크플로우의 위젯**: `src/renderer/ui/components/worktable/worktable.tsx`는 memSaver가 활성으로 유지하는 워크플로우를 모두 렌더하고, 현재 워크플로우가
  아닌 레이아웃은 `inert`와 CSS로 숨긴다. 그래서 다른 워크플로우의 위젯도 마운트된 채 타이머·폴링·webview가 계속 돈다. 기본 설정 (`workflowInactiveAfter = -1`)에서는 같은
  프로젝트의 워크플로우가 프로젝트를 바꿀 때까지 마운트된 채 남는다. 비활성화되면 언마운트된다. 상세는 [features-core.md](features-core.md).

#### 위젯 API 공통 함수

모든 위젯이 `requiresApi`와 무관하게 받는다. 미리보기 (`forPreview`)에서는 전부 no-op이다.

| 함수                             | 용도                         | 받는 쪽                                                                                                              | 출처           |
|----------------------------------|------------------------------|----------------------------------------------------------------------------------------------------------------------|----------------|
| `updateActionBar(items)`         | 보기 모드 액션바 항목 교체   | 셸 로컬 state                                                                                                        | [upstream]     |
| `setContextMenuFactory(factory)` | 보기 모드 컨텍스트 메뉴 등록 | 셸 로컬 state                                                                                                        | [upstream]     |
| `exposeApi(api)`                 | 다른 위젯이 쓸 API 공개      | `setExposedApiUseCase` → `entities.widgets[id].exposedApi`                                                           | [upstream]     |
| `setDynamicTitle(title \| null)` | 이름이 빈 위젯의 헤더 제목   | `setWidgetDynamicTitleUseCase` → `ui.widgetDynamicTitles`. 공백·빈 문자열은 null로 정규화, 같은 값은 재기록하지 않음 | [fork #11]     |
| `setHeaderTabs(tabs \| null)`    | 헤더를 탭 바로 교체          | 셸 로컬 state                                                                                                        | [fork #67 #69] |
| `logActivity(type, payload)`     | 활동 타임라인 기록           | `logTelemetryActivityUseCase`. 셸이 `widgetId`를 붙인다. 동의가 꺼져 있으면 collector에서 무시                       | [fork #63]     |

#### 위젯 API 모듈

`requiresApi`에 이름을 넣은 위젯만 받는다.

| 모듈          | 함수                                                                     | 구현 경로                                                                   | 출처                        |
|---------------|--------------------------------------------------------------------------|-----------------------------------------------------------------------------|-----------------------------|
| `clipboard`   | `writeText`, `writeBookmark`                                             | renderer `clipboardProvider` → IPC → main                                   | [upstream]                  |
| `dataStorage` | `getText`, `setText`, `getJson`, `setJson`, `remove`, `clear`, `getKeys` | 아래 "데이터 저장" 참조                                                     | [upstream, fork #8 #9 변경] |
| `process`     | `getProcessInfo()` (동기, `isMac` 등)                                    | 시작 시 1회 로드한 값                                                       | [upstream]                  |
| `shell`       | `openApp`, `openExternalUrl`, `openPath`                                 | main `shell`                                                                | [upstream]                  |
| `terminal`    | `execCmdLines(cmdLines, cwd?)`                                           | main `execCmdLinesInTerminal`이 OS별 기본 터미널을 분리 프로세스로 실행     | [upstream]                  |
| `widgets`     | `getWidgetsInCurrentWorkflow(typeId)`                                    | 현재 프로젝트의 현재 워크플로우에 있는 해당 타입 위젯의 `{id, name, api}`   | [upstream]                  |
| `icon`        | `getFileIcon(path, bypassCache?)`, `getFavicon(url, bypassCache?)`       | main `iconProvider`. 세션 동안 성공·실패 결과를 Map에 캐시, 동시 요청 공유  | [fork #21]                  |
| `fs`          | `readDir(dirPath, opts?)`, `getHomeDir()`                                | main `fsProvider`. `includeHidden`, `includeSizes` 옵션                     | [fork #31 #32]              |
| `systemStats` | `getStats()`                                                             | main `systemStatsProvider` (`node:os`). CPU%는 직전 호출과의 누적 시간 차이 | [fork #60]                  |

모듈별 배선 위치 (IPC 채널은 모두 `src/common/ipc/channels.ts`):

| 모듈                   | renderer infra                                        | main controller                             | main infra                                                             |
|------------------------|-------------------------------------------------------|---------------------------------------------|------------------------------------------------------------------------|
| `clipboard`            | `src/renderer/infra/clipboardProvider/`               | `src/main/controllers/clipboard.ts`         | `src/main/infra/clipboardProvider/`                                    |
| `dataStorage` (위젯별) | `src/renderer/infra/dataStorage/widgetDataStorage.ts` | `src/main/controllers/widgetDataStorage.ts` | `src/main/infra/dataStorage/fileDataStorage.ts`                        |
| `dataStorage` (공유)   | `src/renderer/infra/dataStorage/sharedDataStorage.ts` | `src/main/controllers/sharedDataStorage.ts` | 같은 `fileDataStorage.ts`                                              |
| `process`              | `src/renderer/infra/processProvider/`                 | `src/main/controllers/process.ts`           | `src/main/infra/processProvider/`                                      |
| `shell`                | `src/renderer/infra/shellProvider/`                   | `src/main/controllers/shell.ts`             | `src/main/infra/shellProvider/`                                        |
| `terminal`             | `src/renderer/infra/terminalProvider/`                | `src/main/controllers/terminal.ts`          | `src/main/infra/appsProvider/`, `src/main/infra/childProcessProvider/` |
| `icon`                 | `src/renderer/infra/iconProvider/`                    | `src/main/controllers/icon.ts`              | `src/main/infra/iconProvider/`                                         |
| `fs`                   | `src/renderer/infra/fsProvider/`                      | `src/main/controllers/fs.ts`                | `src/main/infra/fsProvider/`                                           |
| `systemStats`          | `src/renderer/infra/systemStatsProvider/`             | `src/main/controllers/systemStats.ts`       | `src/main/infra/systemStatsProvider/`                                  |
| `widgets`              | 없음 (renderer store만 읽음)                          | 없음                                        | 없음                                                                   |

#### 설정 편집기와 설정 API

- **props**: `{ settings, settingsApi, sharedState }` (`SettingsEditorReactComponentProps`).
- **`settingsApi.updateSettings(newSettings)`**: 모달 상태 `ui.modalScreens.data.widgetSettings.widgetInEnv`의 위젯 설정에 병합한다.
  엔티티에는 OK 시 `saveWidgetSettings`가 `coreSettings`와 `settings`를 함께 반영한다. 취소하면 버려진다.
- **`settingsApi.dialog`**: `showAppManager`, `showOpenFileDialog`, `showOpenDirDialog` [upstream].
- **`settingsApi.sharedDataKey`** [fork #8]:
  - `create(widgetType, name)`: id를 만들어 `entities.sharedDataKeys`에 즉시 추가하고 id를 반환한다. 설정 화면을 취소해도 키는 남는다.
  - `delete(keyId)`: `deleteSharedDataKeyUseCase`가 확인 다이얼로그 뒤 즉시 실행한다. 공유 폴더를 비우고, 그 키를 쓰던 모든 위젯의 개별 저장소도 비우고, 위젯 설정의
    `sharedKeyId`를 `null`로 바꾸고, 키 엔티티를 지운다. 설정 화면의 OK와 무관하다.
- **편집기 공통 패턴**: 텍스트 입력은 로컬 state + 디바운스로 `updateSettings`를 부른다 (예: Webpage `settings.tsx`의 `DebouncedTextField`). 목록형
  설정의 ↑/↓ 순서 변경은 `moveItemInList`와 `arrUp14Svg`/`arrDown14Svg`를 쓴다 [fork #75].

#### 데이터 저장

**저장 위치** (`src/main/index.ts`, `<appData>/<dataDirName>/freeter-data/` 아래):

| 저장소              | 경로                                          | 만드는 곳                                              | 출처       |
|---------------------|-----------------------------------------------|--------------------------------------------------------|------------|
| 위젯별              | `widgets/<widgetId>/<key>`                    | `getWidgetDataStoragePath`, `widgetDataStorageManager` | [upstream] |
| 공유 키             | `shared/<widgetType>/<sharedKeyId>/<key>`     | `getSharedDataStoragePath`, `sharedDataStorageManager` | [fork #8]  |
| To-Do 프로젝트 공유 | `shared/to-do-list/<projectId 또는 app>/todo` | 같은 공유 관리자                                       | [fork #9]  |

- 키 하나가 파일 하나다. 파일 이름은 키의 `[A-Za-z0-9_\-()\s]` 밖 문자를 `_`로 바꾼 값이다 (`src/main/infra/dataStorage/fileDataStorage.ts`
  `storageKeyToFilePath`). 읽기·쓰기·삭제가 같은 치환 경로를 쓴다 [fork #30 수정].
- 공유 저장소 id는 `"<widgetType>:<sharedKeyId>"` 합성 문자열이다 (`src/common/base/sharedStorageId.ts` `sharedStorageId`,
  `parseSharedStorageId`).
- renderer 쪽 저장소는 `prepareDataStorageForRenderer`(`src/renderer/init.ts`)가 `withJson`(JSON 헬퍼)과 `setTextOnlyIfChanged`
  (직전에 읽거나 쓴 값과 같으면 쓰기 생략)로 감싼다 [upstream].

**`dataStorage` 라우팅 순서** (`getWidgetApi.ts`의 `getStorage`, 호출마다 다시 판정):

1. 엔티티에 위젯이 없으면 위젯별 저장소.
2. `settings.sharedKeyId`가 비어 있지 않은 문자열이면 `shared/<type>/<sharedKeyId>` [fork #8].
3. 타입이 `to-do-list`면 `findWidgetProjectId`가 찾은 프로젝트 id (없으면 `'app'`)로 `shared/to-do-list/<scope>` [fork #9].
4. 그 밖에는 위젯별 저장소.

매 호출 판정이 필요한 이유: `widgetApi`는 `widget.id` 기준으로 메모이즈되므로, 설정에서 `sharedKeyId`를 바꿔도 객체가 다시 만들어지지 않는다 (상세: CHANGES #8).

**복제와 삭제**:

- 위젯 복제 (`cloneWidgetSubCase`)는 `widgetDataStorageManager.copyObjectData`로 위젯별 저장소만 새 id로 복사한다. 공유 버킷은 복사하지 않는다
  (renderer `sharedDataStorageManager`의 복사 함수도 `false`를 반환하는 no-op). 복제본은 같은 `sharedKeyId`로 같은 공유 버킷을 본다.
- 위젯 삭제 (`deleteWidget`)는 엔티티와 레이아웃·셸프 목록, 동적 타이틀만 지운다. 위젯별 저장 폴더를 지우는 코드는 없다 (이유 기록 없음).
- To-Do의 저장 위치는 위젯이 속한 프로젝트로 정해진다. 그래서 다른 프로젝트로 옮기거나 복제한 To-Do 위젯은 그 프로젝트의 목록을 보여 준다.

#### 공유 동기화

| 대상                  | 경로                                                                                                                                                                                                                                                                      | 출처              |
|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------|
| Note (공유 키)        | 쓰기 → main `broadcastChanged`(`src/main/controllers/sharedDataStorage.ts`)가 모든 창에 `ipcSharedDataChangedChannel` 전송 → `src/renderer/init.ts`가 `window`에 `SHARED_DATA_CHANGED_EVENT` 재발행 → `useSharedDataChangedEffect`가 같은 `widgetType`·`scope`면 `reload` | [fork #8 #10 #39] |
| To-Do (프로젝트 공유) | renderer 모듈 스코프 store(`todoStore.ts`)의 구독자에게 동기 통지. 디스크 쓰기만 IPC                                                                                                                                                                                      | [fork #26]        |

- `useSharedDataChangedEffect(widgetType, scope, shouldSkip, reload)`: `scope`가 nullish면 구독하지 않는다. `shouldSkip`·`reload`
  는 ref로 보관해 호출부가 memoize하지 않아도 된다.
- 같은 창의 위젯끼리는 sender로 자기 쓰기를 구분할 수 없다. Note는 포커스 중 도착한 변경을 보류했다가 blur 때 반영한다 (CHANGES #8, #39).
- To-Do가 브로드캐스트 경로를 버린 이유: 7~8단계 체인 어딘가에서 알림이 조용히 유실되는 사례가 있었다 (상세: CHANGES #26).

#### 위젯 간 연동

- 공개: 위젯이 `exposeApi(api)`를 부르면 엔티티의 `exposedApi`에 저장된다 (`setExposedApi.ts`).
- 조회: 다른 위젯이 `widgets.getWidgetsInCurrentWorkflow<T>(typeId)`로 현재 워크플로우의 같은 타입 위젯 목록과 각 `api`를 받는다
  (`widgetApiWidgets/getWidgetsInCurrentWorkflow.ts`). 셸프 위젯과 다른 워크플로우의 위젯은 결과에서 빠진다.
- 현재 유일한 사용처: Web Query의 Webpages 모드가 Webpage 위젯의 `WebpageExposedApi { openUrl, getUrl }`을 쓴다 [upstream].

#### minSize와 기본 크기

- 격자는 가로 32칸 × 세로 16칸이다 (`src/renderer/base/widgetLayout.ts`의 `widgetLayoutVisibleCols`,
  `widgetLayoutVisibleRows`) [fork #34]. upstream은 16×8이다.
- `minSize`는 리사이즈 하한이면서, `addWidgetToWorkflow`, `pasteWidgetToWorkflow`, `dropOnWorktableLayout`에서 새 레이아웃 항목의 기본 크기로
  쓰인다.
- 값의 이력: 세로 최소를 1칸으로 낮춤 [fork #17] → 격자 2배에 맞춰 ×2 [fork #34] → 버튼형 4종 (link-opener, file-opener, commander, timer)은 1×1로
  되돌림 [fork #34 후속] → #34 이후 추가된 6종을 실제 화면 기준으로 상향 [fork #34 후속, 2026-10-05].
- minSize를 올려도 이미 배치된 위젯 크기는 바뀌지 않고, 다음 리사이즈부터 새 하한이 적용된다.

#### 동적 아이콘과 동적 타이틀

- **`useDynamicIcon(fetchFn, key)`**: `key`가 바뀔 때마다 아이콘을 비우고 다시 조회한다. `retryIfMissing()`은 아이콘이 없을 때만 `bypassCache=true`로
  재조회하고, 응답이 늦게 와서 키가 이미 바뀌었으면 버린다. `fetchFn`은 렌더마다 같은 참조여야 한다 [fork #21].
- **재시도 정책**: main 캐시는 실패도 세션 동안 기억한다. 그래서 Link/File Opener는 사용자가 버튼을 누를 때 `retryIfMissing()`을 함께 부른다 (상세: CHANGES #21).
- **아이콘 렌더**: `Button`(`src/renderer/ui/components/basic/button/button.tsx`)의 `iconImgSrc`가 있으면 `<img>`로 그린다. 렌더러 CSP
  (`src/renderer/index.ejs`)의 `img-src`에 `data:`가 필요하다 [fork #21].
- **`setDynamicTitle` 사용처**: Webpage (페이지 제목 + URL), Link Opener (첫 URL host, `(+N)`), File Opener (첫 경로 basename,
  `(+N)`), Timer와 Pomodoro (실행·일시정지 중 남은 시간). 사용자가 이름을 지정하면 표시되지 않는다.
- **정리 규칙**: 동적 타이틀을 쓰는 위젯은 언마운트·조건 변경 시 `setDynamicTitle(null)`을 부른다 (예: `file-opener/widget.tsx`, `timer/widget.tsx`의
  effect cleanup).

#### 활동 기록

- 타입: `web_search`, `page_visit`, `file_open`, `todo_done` (`src/common/base/telemetry.ts` `TelemetryActivityType`).
  payload는 `{ text, detail }`이다 [fork #63].
- 기록 위치: Web Query 검색 제출, Webpage 이동 (URL이 바뀔 때만, `lastLoggedUrlRef`로 중복 제거), File Explorer 파일 열기, File Opener 열기, Link
  Opener 열기 (`page_visit`, [fork #72]), To-Do 완료.
- Note 본문은 의도적으로 기록하지 않는다 (CHANGES #63). 텍스트는 로컬 디스크에 그대로 저장되므로 비밀값을 넘기지 않는다 (`widgetApi.ts`의 `logActivity` 주석).

#### 새 위젯 추가

절차는 [procedures.md](procedures.md)의 "새 위젯 추가"에 있다.

#### 새 위젯 API 모듈 추가 체크리스트

`systemStats`(CHANGES #60) 배선을 기준으로 한 순서다.

1. `src/common/ipc/channels.ts`에 채널과 args/res 타입을 추가한다 (main 접근이 필요할 때).
2. main: `application/interfaces`, `infra`, `application/useCases`, `controllers`를 만들고 `src/main/index.ts`에 연결한다.
3. renderer: `application/interfaces`와 `infra`에 provider를 만든다.
4. `src/renderer/base/widgetApi.ts`의 `WidgetApiModules`에 모듈을 추가한다. `WidgetApiModuleName`은 자동으로 늘어난다.
5. `src/renderer/application/useCases/widget/getWidgetApi.ts`의 `Deps`와 모듈 팩토리에 추가하고, `src/renderer/init.ts`에서 provider를
   주입한다.
6. 위젯 `requiresApi`에 이름을 넣는다.
7. `tests/renderer/widgets/setupSut.tsx`와 `getWidgetApi.spec.ts`의 mock에 모듈을 추가한다. `WidgetApi`의 필수 필드가 되므로 빠지면 타입체크가
   실패한다.

### 위젯 요약표

| id               | 이름           | minSize | requiresApi                            | requiresState  | 저장 키 (dataStorage)                                                  | 출처                                         |
|------------------|----------------|---------|----------------------------------------|----------------|------------------------------------------------------------------------|----------------------------------------------|
| `calculator`     | Calculator     | 3×5     | clipboard                              |                | 없음                                                                   | [fork #57 #77]                               |
| `clock`          | Clock          | 3×2     | 없음                                   |                | 없음                                                                   | [fork #56]                                   |
| `commander`      | Commander      | 1×1     | terminal                               |                | 없음                                                                   | [upstream, fork #75 변경]                    |
| `d-day`          | D-Day          | 3×2     | 없음                                   |                | 없음                                                                   | [fork #51]                                   |
| `file-explorer`  | File Explorer  | 2×2     | fs, shell, clipboard                   |                | 없음                                                                   | [fork #31 #32 #37 #61 #75]                   |
| `file-opener`    | File Opener    | 1×1     | shell, icon                            | apps           | 없음                                                                   | [upstream, fork #21 #22 #63 #75 변경]        |
| `link-opener`    | Link Opener    | 1×1     | shell, icon                            |                | 없음                                                                   | [upstream, fork #21 #22 #72 #75 변경]        |
| `note`           | Note           | 2×2     | clipboard, dataStorage                 | sharedDataKeys | `note`                                                                 | [upstream, fork #8 #10 #39 #40 #50 #72 변경] |
| `pomodoro`       | Pomodoro       | 3×3     | dataStorage                            |                | `state`                                                                | [fork #55 #73 #77]                           |
| `spreadsheet`    | Spreadsheet    | 4×3     | dataStorage                            |                | `sheet`, `colWidths`, `rowHeights`, `colDelta`, `headerRow`, `filters` | [fork #79 #81~#86]                           |
| `stopwatch`      | Stopwatch      | 3×3     | dataStorage                            |                | `state`                                                                | [fork #52 #73 #77]                           |
| `system-monitor` | System Monitor | 3×3     | systemStats                            |                | 없음                                                                   | [fork #60]                                   |
| `timer`          | Timer          | 1×1     | dataStorage                            |                | `state`                                                                | [upstream, fork #54 #72 #73 변경]            |
| `to-do-list`     | To-Do List     | 4×2     | dataStorage                            |                | `todo` (프로젝트 공유)                                                 | [upstream, fork #9 #18 #26 #40 #50 #63 변경] |
| `web-query`      | Web Query      | 4×2     | shell, widgets, dataStorage            |                | `history`                                                              | [upstream, fork #46 #47 #59 #66 변경]        |
| `webpage`        | Webpage        | 4×2     | clipboard, shell, process, dataStorage |                | `activeTab` (멀티탭일 때)                                              | [upstream, fork 다수 변경]                   |

- 모든 위젯 폴더에는 `index.ts`, `settings.tsx`, `widget.tsx`, `icons/`가 있다.
- upstream 위젯 8종의 upstream 시점 minSize (16×8 격자): Commander·File Opener·Link Opener 1×1, Timer 1×2, Web Query 2×1,
  Note·To-Do List·Webpage 2×2.

### 위젯별 상세

#### Webpage (`webpage`)

- **역할**: `<webview>`로 웹 페이지를 위젯 안에 띄운다. 포크 변경이 가장 많은 위젯이다.
- **파일**: `widget.tsx`(`Webview` 컴포넌트, 멀티탭 래퍼 `WidgetComp`), `settings.tsx`, `actionBar.ts`(`createActionBarItems`),
  `contextMenu.ts`(`createContextMenuFactory`), `actions.ts`(라벨 상수와 동작 함수), `partition.ts`(`createPartition`),
  `zoomEvents.ts`, `homeEvents.ts`.
- **설정**: `url`, `urlName`, `tabs: {url, name}[]`, `customActions: {name, js}[]`, `sessionScope`(`app`/`prj`/`wfl`/
  `wgt`, 기본 `prj`), `sessionPersist`(`persist`/`temp`, 기본 `persist`), `autoReload`(초, 0이면 끔), `injectedCSS`,
  `injectedJS`, `userAgent`.
- **세션 파티션**: `createPartition`이 `persist:` 접두사 + 범위 + id로 만든다. 셸프에서는 `prj`/`wfl`이 `shlf`로 합쳐진다 [upstream]. 멀티탭에서 같은
  URL이 두 번 이상 나오면 두 번째부터 `:dup1`, `:dup2` 접미사로 세션을 분리한다 [fork #67 후속].
- **재시작 조건**: 파티션, `injectedJS`, `userAgent`가 바뀌면 `onRequireRestart`가 `requireRestart` 카운터를 올려 webview를 key로 다시 마운트한다.
  `injectedCSS`는 `insertCSS`/`removeInsertedCSS`로 즉시 바꾼다.
- **dom-ready 주입**: `injectedCSS`, `injectedJS`, Ctrl/Cmd+휠 가로채기 (`zoomWheelInjectionJs`), Ctrl/Cmd+F 가로채기
  (`findKeyInjectionJs`). guest는 `console.log(마커, 값)`으로 신호를 보내고 호스트가 `console-message`에서 마커
  (`__FREETER_WEBPAGE_ZOOM_WHEEL__`, `__FREETER_WEBPAGE_FIND_KEY__`)를 확인한다 [fork #24 #36].
- **액션바 순서** (`createActionBarItems`의 반환 배열): `HOME`, `BACK`, `FORWARD`, `AUTO-RELOAD`(`autoReload > 0`일 때), `RELOAD`,
  `ZOOM-OUT`, `ZOOM-IN`, `FIND`, `CUSTOM-ACTION-<i>`(JS가 빈 항목 제외), `MUTE`, `COPY-URL`, `OPEN-IN-BROWSER`. webview가 없거나
  시작 URL이 비면 빈 배열이다. `FIND`와 `MUTE`는 콜백 (`onFind`, `onToggleMute`)이 주어질 때만 생긴다. 툴팁에 단축키를 붙이고 수정자 표기는
  `process.getProcessInfo().isMac`으로 고른다 [fork #23 #24 #28 #29 #35 #36 #70].
- **줌**: 프리셋 사다리 `zoomLevels`(25%~500%)와 `zoomStepIn`/`zoomStepOut`/`zoomReset`. 액션바 RELOAD만 줌을 100%로 되돌린 뒤 새로고침하고,
  F5·Ctrl/Cmd+R·컨텍스트 메뉴 새로고침은 줌을 유지한다 [fork #24 #29].
- **키보드 단축키** (webview 포커스 시, `src/main/infra/browserWindow/browserWindow.ts`의 `did-attach-webview` →
  `before-input-event`):

| 키                                             | 처리 위치                                                                                                                             | 출처       |
|------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|------------|
| Ctrl+Tab / Ctrl+Shift+Tab                      | main → IPC → 워크플로우 전환                                                                                                          | [fork #6]  |
| Alt+← / Alt+→                                  | main에서 `navigationHistory` 직접 처리                                                                                                | [fork #25] |
| Alt+Home                                       | main → `ipcGoHomeWebpageChannel` → `init.ts`가 `WEBPAGE_GO_HOME_EVENT` 발행 → `webContentsId`가 같은 위젯이 `canGoHome`일 때 `goHome` | [fork #27] |
| F5, Ctrl/Cmd+R                                 | main `wc.reload()` (Shift 조합 제외)                                                                                                  | [fork #29] |
| Ctrl/Cmd+T                                     | main이 현재 URL을 `sanitizeUrl`과 `isAllowedExternalUrl` 검사 후 기본 브라우저로 연다                                                 | [fork #25 #88] |
| Ctrl/Cmd+Shift+= (`+`), Ctrl/Cmd+-, Ctrl/Cmd+0 | main → `ipcZoomWebpageChannel` → `WEBPAGE_ZOOM_EVENT` → 위젯                                                                          | [fork #24] |
| Ctrl/Cmd+F                                     | guest 주입 스크립트 → `console-message` → 찾기 바                                                                                     | [fork #36] |

- **링크와 팝업**: `setWindowOpenHandler`가 새 탭 성격 요청 (`target="_blank"`, 기능 문자열 없는 `window.open`)은 기본 브라우저로, 팝업 성격 요청은 앱 내부
  창으로 보낸다. 팝업 판정식은 `disposition === 'new-window'` 또는 features 문자열의 `popup` 단어 (`rePopupFeatures`)다. OAuth 팝업의
  `window.opener` 통신을 살리기 위해서다 [fork #3 #13]. 외부로 보내는 URL은 스킴이 `http`, `https`, `mailto`일 때만 넘긴다. 이 검사는 액션바와 우클릭 메뉴의
  "Open in web browser", "Open link in web browser" (`actions.ts`)에도 있다. 같은 프레임 이동으로 여는 앱 프로토콜은 main의 세션 권한 처리기가 같은 규칙으로 막는다 [fork #88] ([pitfalls.md](pitfalls.md)의 "게스트 URL의 스킴 검사"). 마우스 X1/X2 버튼은 커서 아래 webview를 대상으로 뒤로/앞으로 이동한다 [fork #4]. 모두 main 코드다.
- **멀티탭** [fork #67 #69]: `url`과 `tabs`를 합친 항목이 2개 이상이면 탭마다 `Webview`를 마운트하고, 비활성 탭은 `visibility: hidden` + `inert`로 숨겨
  살려 둔다. 활성 탭만 실제 API를 받고 비활성 탭은 `updateActionBar`·`setContextMenuFactory`·`exposeApi`가 no-op인 API를 받는다. 동적 타이틀은 모든 탭에서
  no-op으로 막고 부모가 활성 탭 것을 단독 발행한다. 탭 라벨은 사용자 이름 → 페이지 제목 → 호스트명 순이다. 탭 정보 (제목, 파비콘, 로딩, 오디오)는 `onTabInfo`로 부모의 `tabInfos`
  (탭 키 기준)에 모인다. 마지막 활성 탭은 `activeTab` 키에 저장하고, 비동기 복원 전에 사용자가 탭을 고르면 사용자 선택이 이긴다.
- **기타 동작**: 페이지 제목과 URL을 이은 동적 타이틀 [fork #11], 로드 실패 오버레이 (메인 프레임이고 code ≠ -3일 때만) [fork #38], 자동 새로고침은 webview에 포커스가
  있으면 멈추고 blur부터 다시 센다 [fork #53], 음소거는 세션 한정 [fork #35], 커스텀 액션은 활성 탭에서 `executeJavaScript` [fork #70], 이동 시
  `page_visit` 기록 [fork #63], `exposeApi`로 `{ openUrl, getUrl }` 공개 [upstream].
- **컨텍스트 메뉴** (`contextMenu.ts`): 새로고침, 강제 새로고침, 자동 새로고침 토글, 줌 배율 하위 메뉴, 시작 페이지·뒤로·앞으로, 브라우저로 열기, 다른 이름으로 저장, 주소 복사, 인쇄,
  개발자 도구. 링크·이미지·편집 가능 영역 위에서는 해당 항목 (링크 열기·저장·주소 복사, 이미지 저장·주소 복사, 실행 취소·잘라내기·붙여넣기 등)이 추가된다 [upstream]. "Copy image"는
  `<webview>`에 `copyImageAt`이 없어 주석 처리돼 있다 (CHANGES #38).
- **main 쪽 연관 기능**: 다운로드 폴더 지정 [fork #41], HTTP Basic/Digest 인증 창 [fork #71], Chrome 형식 User-Agent [fork #7].
  상세는 [features-core.md](features-core.md)와 [overview.md](overview.md).
- **주의점**:
  - `display: none`은 webview를 언로드시킨다. 숨길 때는 `visibility: hidden`을 쓴다 (CHANGES #67).
  - `getWebContentsId()`는 attach 전에 호출하면 예외가 난다. ready 이후 한 번 읽어 보관한다 (CHANGES #24).
  - `actions.ts`의 라벨 상수는 액션바와 컨텍스트 메뉴가 공유한다. 단축키 표기는 액션바의 `title` 조립에서만 붙인다 (CHANGES #28).
  - main의 `before-input-event`는 webview에 포커스가 있을 때만 발화한다. 포커스 없는 webview에는 단축키가 닿지 않는다 (CHANGES #25).

#### Spreadsheet (`spreadsheet`)

- **역할**: 수식이 있는 작은 표. `<table>` 기반 자체 구현이다 [fork #82]. 처음에는 `react-datasheet-grid`를 썼다가 교체했다 [fork #79 #81].
- **파일**: `widget.tsx`(시트 컴포넌트, 행 컴포넌트, 키보드·마우스·클립보드 처리), `grid.ts`(DOM 없는 순수 로직), `formula.ts`(토크나이저 + 재귀하강 파서 + 평가기),
  `filterMenu.tsx`(필터 드롭다운), `settings.tsx`, `formula.spec.ts`(소스 폴더에 함께 있는 테스트).
- **설정**: `v`(버전 스탬프, 현재 `SETTINGS_VERSION = 2`), `cols`(기본 26, 상한 `MAX_COLS = 256`), `rows`(기본 100, 상한 100,000),
  `decimals`(`DECIMALS_AUTO = -1` 또는 0 ~6), `thousands`, `formulaBar`, `rowHeight`(18~60, 기본 24).
- **저장 데이터** (모두 `dataStorage` 텍스트, 800ms 디바운스): `sheet`(행 배열 JSON, 저장 직전 `trimSheet`로 뒤쪽 빈 행·칸 제거), `colWidths`,
  `rowHeights`, `colDelta`, `headerRow`, `filters`.
- **열 개수**: 실제 열 수 = 설정 `cols` + `colDelta`. 위젯은 설정을 직접 바꾸지 못하므로 행/열 삽입·삭제는 `colDelta`만 움직인다 [fork #84].
- **수식**: 사칙연산, `^`(우결합, 단항 마이너스가 더 강하게 묶임: `-2^2 = 4`), 비교, `&`, 셀 참조와 범위, `$` 절대 참조, 함수 `SUM`, `AVERAGE`(=`AVG`),
  `MIN`, `MAX`, `COUNT`, `ABS`, `ROUND`, `IF`. 오류 코드 `#VALUE`, `#DIV/0`, `#NAME`, `#REF`, `#CIRC`, `#ERROR`, `#NUM`(표시).
  `evaluateGrid`는 lazy 평가 + 캐시, `visiting` 집합으로 순환 참조 감지. 열 상한 16384 [fork #79 #83].
- **참조 이동**: `translateRefs`(복사·채우기), `adjustRefs`(행/열 삽입·삭제, 삭제된 줄 참조는 `#REF`). 앱 내부 복사는 클립보드에 `text/x-freeter-sheet`
  타입으로 출처 좌표를 싣는다 [fork #83 #84].
- **편집 기능**: 수식 입력줄, 방향키 참조 선택 (점선 강조), 함수명 자동완성 (`FUNCTION_NAMES`), 채우기 핸들과 연속 데이터 인식, Ctrl+D/R, 실행 취소 100단계 (값·열 너비·행
  높이·열 수·선택·필터 스냅샷), 엑셀식 탐색 (Ctrl+방향키, Home/End, PageUp/Down), 열 경계 더블클릭 자동 맞춤, 텍스트 넘침 [fork #81~#86].
- **데이터 기능**: 정렬 (연속 데이터 블록, 머리글 자동 감지 `looksLikeHeader`), 필터 (`hiddenRows`, 행 번호 유지), 2칸 이상 선택 시 하단 집계 바 [fork #85]. 필터
  상태는 실행 취소·정렬·붙여넣기·열 삽입/삭제와 맞물린다 [fork #86].
- **컨텍스트 메뉴**: 앱 네이티브 메뉴 (`setContextMenuFactory`). Cut/Copy/Paste는 네이티브 role이라 키보드 단축키와 같은 클립보드 이벤트로 수렴한다 [fork #84].
- **렌더 성능**: 보이는 행 ±8줄만 렌더하는 행 윈도잉 (누적 오프셋 + 이진 탐색), 행 단위 `memo`, 필터가 켜졌을 때만 전체 표시 문자열 계산 [fork #86].
- **주의점**:
  - 이벤트 핸들러에서 렌더된 state를 읽지 않는다. draft, 선택, 채우기 범위, 수식 입력줄 대상은 ref 미러를 읽는다. 같은 원인의 버그가 다섯 번 반복됐다 (CHANGES #83).
  - jsdom에서 통과해도 실제 브라우저에서 깨지는 레이아웃·마우스 버그가 많다. `fireEvent`가 `act()`로 상태를 매번 flush하기 때문이다 (CHANGES #81~#86).
  - `table-layout: fixed`라도 테이블 `width`가 없으면 Chrome이 열 폭을 무시한다. 테이블 폭을 열 폭 합으로 명시한다 (CHANGES #84).
  - mousedown에서 `preventDefault()`를 부르면 Chrome이 `dblclick`을 만들지 않는다 (CHANGES #84).
  - `.sheet td { overflow: hidden }`의 특이성이 높아 같은 셀의 다른 클래스 규칙을 덮는다 (CHANGES #85).
  - `tests/renderer/widgets/spreadsheet/theme.spec.ts`는 이 위젯의 SCSS만 검사한다.
  - 저장은 800ms 디바운스인데, Note·To-Do와 달리 `beforeunload`·언마운트 flush가 코드에 없다 (`widget.tsx`에 `flush`, `beforeunload` 사용 없음).
    마지막 편집 직후 종료하면 그 편집이 저장되지 않을 수 있다 (추정, 코드 관찰 기준).
  - CHANGES #86의 제목과 "수정 파일"은 "A~AZ · 1,000행", "열 52·행 1000"으로 적혀 있지만 현재 코드 기본값은 26열 × 100행이다 (본문은 26×100으로 줄였다고 적음).

#### Note (`note`)

- **역할**: 메모장. plain textarea 또는 마크다운 편집기 (`tiny-markdown-editor`) [upstream].
- **파일**: `widget.tsx`(`NoteInner`, 바깥 `WidgetComp`), `settings.tsx`, `actionBar.ts`(`COPY-FULL-TEXT`),
  `contextMenu.ts`, `actions.ts`.
- **설정**: `spellCheck`, `markdown`, `sharedKeyId: EntityId | null` [fork #8].
- **저장 데이터**: 키 `note`. 저장은 800ms 디바운스, blur 시 즉시 flush, `beforeunload`·언마운트 시 flush [fork #39 #40].
- **공유 키** [fork #8]: 설정 "Shared Data" 드롭다운에서 키를 고르거나 "+ Create new key…"로 만든다. "Delete key"는 위 `sharedDataKey.delete`
  동작을 따른다. 같은 키를 쓰는 Note들은 브로드캐스트 경로로 동기화된다.
- **remount 장치**: 바깥 `WidgetComp`가 `<NoteInner key={sharedKeyId ?? '__self__'}>`로 키가 바뀔 때 다시 마운트해 새 데이터를 읽는다 [fork #8].
- **하단 카운트**: 단어 수·글자 수를 250ms 디바운스한 로컬 state로 표시한다. 한자·가나는 글자당 1단어로 센다 [fork #50 #72].
- **주의점**:
  - textarea가 uncontrolled (`defaultValue` + ref)다. 외부 변경은 `textAreaRef.current.value`나 마크다운 편집기의 `setContent()`로 직접 넣는다
    (CHANGES #8, #39).
  - 포커스 중 도착한 공유 변경은 버리지 않고 보류했다가 blur 때 반영한다. 마크다운 모드의 포커스 대상은 편집기 요소 (`editor.e`)다 (CHANGES #39).
  - 글자 수를 `setDynamicTitle`로 내보내면 키 입력마다 앱 store에 쓰게 된다. 그래서 위젯 내부 state로 표시한다 (CHANGES #50).

#### To-Do List (`to-do-list`)

- **역할**: 체크리스트. 항목 추가 (위/아래), 편집, 드래그 재정렬, 전체 미완료/완료 처리 [upstream].
- **파일**: `widget.tsx`(`ToDoInner`, 바깥 `WidgetComp`), `todoStore.ts`, `state.ts`(`ToDoListState`,
  `sanitizeLoadedToDoListState`, `maxTextLength = 1000`), `actionBar.ts`, `contextMenu.ts`, `actions.ts`, `dom.ts`,
  `settings.tsx`.
- **설정**: `doneToBottom`(기본 true).
- **액션바와 메뉴**: 액션바 `ADD-ITEM-AT-TOP`, `MARK-ALL-INCOMPLETE`. 컨텍스트 메뉴는 위/아래에 추가, 전체 미완료/완료, 완료 항목 삭제, 항목 위에서는 완료
  토글·편집·삭제 [upstream].
- **저장 데이터**: 키 `todo`. 위치는 프로젝트 단위 `shared/to-do-list/<projectId 또는 app>/` [fork #9].
- **스코프**: 위젯 쪽 `scopeForEnv(env)`는 `env.projectId`(셸프면 `'app'`)를 쓰고, 저장소 라우팅 쪽 `findWidgetProjectId`는 store의 프로젝트 →
  워크플로우 → 레이아웃을 뒤져 같은 값을 얻는다. 두 계산이 일치해야 화면과 디스크가 같은 버킷을 가리킨다.
- **in-memory store** [fork #26]: `todoStore.ts`의 모듈 스코프 `Map`(스코프별 상태, 구독자, 디바운스 saver)과 `useSyncExternalStore` 기반
  `useTodoListState`. 같은 스코프의 형제 위젯이 즉시 같은 상태를 본다. 디스크 저장은 스코프당 하나인 500ms 디바운스 saver (`getOrCreateTodoListSaver`)가 한다. 첫
  마운트만 디스크에서 읽고, 읽기 완료 시 store가 이미 채워졌으면 디스크 값을 버린다.
- **remount 장치**: `<ToDoInner key={scope}>`로 스코프가 바뀌면 편집 상태까지 리셋한다.
- **기타**: 항목 텍스트 줄바꿈 표시 [fork #18], 하단 `완료 / 전체` 카운트 [fork #50], 완료 시 `todo_done` 기록 [fork #63], 종료·언마운트
  flush [fork #40].
- **주의점**:
  - store가 모듈 스코프라 테스트 간 상태가 샌다. 스펙의 `beforeEach`에서 `resetTodoListStore()`를 부른다 (CHANGES #26).
  - 동기화 범위는 단일 renderer다. 창이 여럿이면 창끼리 동기화되지 않는다 (CHANGES #26).

#### Web Query (`web-query`)

- **역할**: 템플릿 URL에 입력어를 넣어 검색한다. 한 위젯에 검색창 여러 줄 [fork #47].
- **파일**: `widget.tsx`(`QueryRow`, `computeEntry`), `settings.tsx`(`engines` 배열, `normalizeEntry`, `makeNewEntry`),
  `contextMenu.ts`.
- **설정**: `mode`(`SettingsMode.Browser = 1`, `SettingsMode.Webpages = 2`, 위젯 단위),
  `entries: { id, engine, descr, query, url }[]`.
- **치환**: 자리표시자는 `QUERY`. 입력어는 `encodeURIComponent` 후 엔진 URL에 들어간다. 항목의 `query` 템플릿에도 `QUERY`를 쓸 수 있다.
- **모드별 동작**: Browser 모드는 `shell.openExternalUrl`. Webpages 모드는 현재 워크플로우의 Webpage 위젯마다 `getUrl()`(그 위젯의 시작 URL)에서
  `QUERY`를 치환하고, 결과가 달라진 위젯만 `openUrl`로 이동시킨다 [upstream].
- **저장 데이터**: 키 `history`. 최근 검색어 최대 15개 (중복 제거, 최신 우선)를 `<datalist>`로 제안한다. 컨텍스트 메뉴 "Clear recent searches"로
  비운다 [fork #59 #66].
- **기타**: 기본 엔진 확충 (Naver, YouTube, Namuwiki, Perplexity 등) [fork #46], 검색 제출 시 `web_search` 기록 [fork #63].
- **주의점**: 입력에 `list`(datalist)를 달면 ARIA role이 `combobox`가 된다. 테스트 role 단언도 그에 맞춘다 (CHANGES #59).

#### File Explorer (`file-explorer`)

- **역할**: 등록한 즐겨찾기 폴더들을 트리로 탐색하고, 파일을 더블클릭하면 OS 기본 앱으로 연다 [fork #31].
- **파일**: `widget.tsx`, `treeModel.ts`(`buildRootEntries`, `buildEntryPaths`, `basenameOf`, `dirnameOf`,
  `humanFileSize`, `toTreePath`, `toMapKey`), `settings.tsx`.
- **설정**: `paths: List<string>`, `showFileSize`(기본 켬), `showHiddenFiles`(기본 끔) [fork #31 #32].
- **트리 라이브러리**: `@pierre/trees`(beta, ESM 전용). 경로 문자열로 행을 식별하고 후행 `/`로 디렉터리를 표시한다. 트리 키는 이름 기반 상대 POSIX 경로이고,
  `key → 절대 경로` Map을 따로 둔다.
- **동작**: 폴더는 펼칠 때만 `fs.readDir`로 읽는다 (lazy). 루트는 등록 순서를 유지하고 (`preparePresortedFileTreeInput`), 자식은 라이브러리 기본 정렬을 따른다.
  읽기 실패 폴더는 다음 펼침에서 재시도한다. 숨김 판정은 이름이 `.`으로 시작하는지만 본다.
- **액션바와 메뉴**: `REFRESH`(캐시 비우고 다시 읽기), `COLLAPSE-ALL`(캐시 유지, 접기만) [fork #61]. 우클릭 메뉴는 라이브러리 `renderContextMenu`를
  `document.body` 포털로 그린다: Open / Open in File Explorer, Open containing folder (파일), Copy Path, Copy
  name [fork #31 #37].
- **기타**: 파일 열기 시 `file_open` 기록 [fork #63], 설정의 경로 순서 변경 [fork #75].
- **주의점**:
  - Jest는 `@pierre/trees`를 읽지 못한다. Renderer jest 프로젝트의 `moduleNameMapper`가 `tests/__mocks__/pierreTrees*.js`로 매핑한다.
    스펙에서는 `jest.requireMock` 대신 일반 import로 같은 mock 인스턴스를 받는다 (CHANGES #31).
  - 위젯 타일이 `transform`으로 배치되므로 `position: fixed` 메뉴는 타일 기준으로 어긋난다. 포털로 빼고 `data-file-tree-context-menu-root="true"`를 붙인다
    (CHANGES #31).
  - 즐겨찾기 재빌드 중 늦게 끝난 lazy 읽기는 `loadEpoch`로 버린다. 재빌드 effect는 배열 identity 대신 문자열 `pathsKey`에 의존한다 (CHANGES #31).
  - 검색은 펼친 노드만 대상이고, 라이브러리 입력이 IME 조합을 가드하지 않아 한글 입력이 깨질 수 있다 (CHANGES #31).

#### File Opener (`file-opener`)

- **역할**: 지정한 파일들 또는 폴더들을 한 번에 연다 [upstream].
- **파일**: `widget.tsx`, `settings.tsx`, `settingsType.ts`(`SettingsType`).
- **설정**: `type`(파일/폴더), `files`, `folders`, `openIn`(App Manager의 앱 id. 비면 OS 기본 연결).
- **동작**: `openIn` 앱이 있으면 `shell.openApp(execPath, [cmdArgs, ...paths])`, 없으면 경로마다 `shell.openPath`. 열 때 경로마다
  `file_open` 기록 [fork #63].
- **아이콘과 제목**: 첫 경로의 OS 아이콘 (`icon.getFileIcon`, `useDynamicIcon`) [fork #21], 동적 타이틀은 첫 경로 basename과 `(+N)` [fork #22].
  활성 `type`의 목록만 본다.
- **공유 상태**: `requiresState: ['apps']`로 App Manager 목록을 받는다. `sharedStateEquals` 덕분에 무관한 상태 변경에는 다시 렌더되지 않는다 [fork #33].

#### Link Opener (`link-opener`)

- **역할**: 지정한 URL들을 기본 브라우저로 한 번에 연다 [upstream].
- **설정**: `urls: List<string>`.
- **동작**: URL마다 `shell.openExternalUrl`, URL마다 `page_visit` 기록 (text = 호스트) [fork #72].
- **아이콘과 제목**: 첫 URL의 파비콘 (`icon.getFavicon`: `/favicon.ico` 시도 후 HTML `<link rel>` 파싱) [fork #21], 동적 타이틀은 첫 URL 호스트와
  `(+N)` [fork #22].

#### Commander (`commander`)

- **역할**: 등록한 명령줄들을 버튼 한 번으로 OS 터미널에서 실행한다 [upstream].
- **설정**: `cmds: List<string>`, `cwd`(빈 값이면 미지정).
- **동작**: `terminal.execCmdLines(cmds, cwd)`. main의 `execCmdLinesInTerminal`이 OS (linux, win32, darwin)별 인자 생성기로 기본 터미널을
  분리 프로세스로 띄운다.
- **포크 변경**: 설정 행 순서 변경 [fork #75].

#### Timer (`timer`)

- **역할**: 카운트다운 타이머 [upstream].
- **파일**: `widget.tsx`, `settings.tsx`, `useAudioFile.ts`, `audio/timer-end/`(종료 사운드 파일과 `timerEndSoundFilesById`).
- **설정**: `mins`, `endDesktop`(데스크톱 알림, 기본 켬) [fork #72], `endSound`, `endSoundVol`.
- **저장 데이터**: 키 `state` = `{ endMsecs, pausedLeft }`. 실행 중이면 절대 종료 시각을 저장해 재시작 후 남은 시간으로 이어간다. 꺼진 사이 만료되면 소리·알림 없이 대기
  상태로 복원한다 [fork #73].
- **동작**: 일시정지/재개 [fork #54], 실행·일시정지 중 헤더에 `mm:ss` 동적 타이틀 [fork #54], 종료 시 사운드와 `new Notification` [fork #72].
- **주의점**: Pomodoro가 `timer/settings.tsx`(`endSoundOptions`), `timer/audio/timer-end`, `timer/useAudioFile.ts`,
  `timer/icons`를 import한다. 이 모듈들을 바꾸면 Pomodoro도 영향을 받는다.

#### Pomodoro (`pomodoro`)

- **역할**: 작업/휴식 카운트다운 자동 전환, 전환마다 사운드, 완료 세션 수 표시 [fork #55].
- **설정**: `workMins`, `breakMins`, `longBreakMins`, `longBreakEvery`(0이면 끔, 기본 4), `endSound`,
  `endSoundVol` [fork #55 #77].
- **저장 데이터**: 키 `state` = `{ phase, endMsecs, pausedLeft, doneWork }`. 긴 휴식 여부는 `doneWork`에서 파생한다. 꺼진 사이 페이즈가 끝났으면 놓친
  전환을 재생하지 않고 대기 상태로 복원한다 (코드의 `ponytail:` 주석) [fork #73 #77].
- **동작**: 동작 중이면 `Work 24:59`, `Long Break 14:59` 형식의 동적 타이틀을 표시한다 (`phaseLabel` + `mmss`).

#### Stopwatch (`stopwatch`)

- **역할**: 0부터 올라가는 스톱워치, 1/100초 표시 [fork #52].
- **설정**: 없음 (`Record<string, never>`).
- **저장 데이터**: 키 `state` = `{ accumulated, startTs, laps }`. 실행 중이었다면 앱이 꺼져 있던 시간도 흐른 것으로 센다 [fork #73 #77].
- **동작**: 경과 시간을 항상 `Date.now()` 기준으로 계산해 틱 누락에도 드리프트가 없다. 실행 중에만 짧은 간격 (`tickMsec`)으로 갱신한다. 랩 기록 [fork #77]. 포맷 함수
  `formatStopwatch`(`stopwatch.ts`).

#### Clock (`clock`)

- **역할**: 현재 시각. 한 위젯에 여러 시계 (세계시계) [fork #56].
- **설정**: `entries: { id, label, timeZone }[]`(`timeZone`이 `''`면 로컬), `hour12`, `showSeconds`, `showDate`.
- **동작**: 1초 간격 갱신. `formatClock`이 `Intl.DateTimeFormat`으로 포맷하고, `isValidTimeZone`에 실패한 타임존은 로컬로 대체한다 (`clock.ts`).

#### D-Day (`d-day`)

- **역할**: 목표일까지/이후 날짜 수. `D-30`, `D-DAY`, `D+15` 표기 [fork #51].
- **설정**: `entries: { id, label, date }[]`, `showDate`(날짜와 요일 표시, 기본 끔).
- **동작**: `formatDDay`가 로컬 달력 날짜 기준으로 차이를 계산한다. 다음 로컬 자정에 한 번 갱신하도록 `setTimeout`을 다시 예약한다. 요일은 OS 로케일을 따른다 (`dDay.ts`).

#### Calculator (`calculator`)

- **역할**: 사칙연산 계산기, 버튼과 키보드 입력 [fork #57].
- **설정**: 없음.
- **동작**: `eval` 없이 `calcReducer`(`calc.ts`) 상태 머신으로 계산한다. 키보드는 `tabIndex={0}` div의 `onKeyDown`이 받으므로 위젯에 포커스가 있어야 한다.
  디스플레이 클릭 또는 Ctrl/Cmd+C로 값 복사 (`clipboard`), `c` 단독은 Clear라서 수정자 조합을 먼저 검사한다 [fork #77].
- **스타일**: `var(--freeter-buttonBorder, var(--freeter-textareaBorder))`를 쓴다. `buttonBorder`는 테마에 없고 대체값이 적용된다.

#### System Monitor (`system-monitor`)

- **역할**: CPU·RAM 사용량 막대 표시 [fork #60].
- **설정**: 없음.
- **동작**: 마운트 동안 2초 (`pollMsec`)마다 `systemStats.getStats()`를 부른다. 보이지 않는 워크플로우에 마운트된 동안에도 폴링한다 (가시성 조건 없음). IPC 오류는 무시하고
  마지막 값을 유지한다. 포맷 함수 `formatBytes`, `toPercent`(`systemMonitor.ts`).
- **main 쪽**: `src/main/infra/systemStatsProvider/systemStatsProvider.ts`가 `node:os`의 `cpus`, `totalmem`, `freemem`으로
  계산한다. CPU%는 직전 호출 이후 구간 사용률이다.

#### 템플릿 (`_template`)

- **역할**: 새 위젯 스캐폴드. `widgets/index.ts`에 등록되지 않는다.
- **파일**: `index.ts`(`id: 'widget-id'`, `minSize: 2×2`, `requiresApi: []`), `settings.tsx`(`text` 설정 하나와 편집기),
  `widget.tsx`(설정 텍스트 표시), `icons/`.
- **포크 변경**: 템플릿 `minSize`를 1×1에서 2×2로 바꿨다. 격자 2배 커밋 (e5fee45)에 포함된 변경이다 [fork #34].
