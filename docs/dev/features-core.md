## 앱 기능별 코드 지도 (renderer 앱 셸)

범위: renderer의 앱 셸 기능. 위젯 시스템과 위젯별 구현은 [features-widgets.md](features-widgets.md), 프로세스 구조와 IPC 채널과 저장
계층은 [overview.md](overview.md), 함정 상세는 [pitfalls.md](pitfalls.md), 결정 배경은 [decisions.md](decisions.md)가 다룬다.

기준 시점: 2026-10-05 (#34, #45 후속 수정 포함).

출처 표시: `[upstream]` = upstream v2.8.0-beta에 있던 것, `[fork #N]` = 포크가 추가한 것 (N은 `docs/CHANGES.md` 섹션 번호),
`[upstream, fork #N 변경]` = upstream 것을 포크가 바꾼 것, `[fork]` = CHANGES 섹션이 없는 포크 변경.

주의점 끝의 `(pitfalls: 제목)`은 [pitfalls.md](pitfalls.md)의 같은 제목 항목이다.

### 공통 패턴

#### use case와 상태 갱신

출처: `[upstream, fork #30 변경]`

- use case는 `create<Name>UseCase(deps)`가 반환하는 함수다. 조립 위치는 `src/renderer/init.ts`의 `createUseCases`다.
- 기본 형태: `appStore.get()` → 불변 갱신으로 새 `AppState` 계산 → `appStore.set()`.
- 하위 단계는 `subs/` 폴더의 `<name>SubCase`로 분리한다. state를 받아 state를 돌려주는 순수 함수가 많다. 예: `setCurrentWorkflowSubCase`
  (`src/renderer/application/useCases/project/subs/setCurrentWorkflow.ts`).
- 갱신 헬퍼: `entityStateActions.<컬렉션>.getOne/addOne/updateOne/removeOne/removeMany`
  (`src/renderer/base/state/actions/entity.ts`), 컬렉션 함수 (`src/renderer/base/entityCollection.ts`), 목록 함수
  (`src/renderer/base/list.ts`, `src/renderer/base/entityList.ts`).
- `store.set`은 전후 상태가 `shallow`로 같으면 저장과 debounce 타이머 재설정을 건너뛴다 [fork #30] (`createStore`, `src/common/data/store.ts`).
  앱 상태 저장은 5000ms debounce다 (`createAppStateStorage`, `src/renderer/data/appStateStorage.ts`).
- 주의점: 비동기 use case 여러 곳이 `await` 전에 읽은 `state`로 `await` 뒤에 `set`한다. 해당 위치는 `createPasteWorkflowUseCase`,
  `createPasteWidgetToWorkflowUseCase`, `createPasteWidgetToShelfUseCase`, `createDropOnWorktableLayoutUseCase`와
  `createDropOnTopBarListUseCase`의 붙여넣기 분기, `createSaveChangesInProjectManagerUseCase`의 복제 분기,
  `createDeleteWidgetUseCase`와 `createDeleteWorkflowUseCase`의 확인 대화상자 뒤다. 그 사이에 다른 경로가 바꾼 상태는 덮어써진다 (추정: 대화상자가 떠 있는 동안의
  동적 제목 갱신, Memory Saver 타이머). `createDeleteSharedDataKeyUseCase`는 대화상자 뒤에 `appStore.get()`을 다시 호출한다. (pitfalls: await
  뒤의 낡은 state)

#### 모달 화면의 초안 편집

출처: `[upstream]`

- 모달 화면 id (`ModalScreenId`, `src/renderer/base/state/ui.ts`): `about`, `appManager`, `applicationSettings`,
  `projectManager`, `widgetSettings`, `workflowSettings`.
- 흐름: `open*UseCase`가 대상 엔티티나 설정을 `ui.modalScreens.data.<id>`에 복사 → `update*UseCase`는 이 초안만 고침 → `save*UseCase`가 초안을
  `entities`나 `ui.appConfig`에 반영하고 닫음 → `close*UseCase`는 초안을 버림.
- 헬퍼: `modalScreensStateActions.openModalScreen/updateModalScreen/closeModalScreen`
  (`src/renderer/base/state/actions/modalScreens.ts`).
- `ui.modalScreens.order`는 스택이다. 마지막 화면만 조작할 수 있고, 나머지 화면과 main screen은 `inert`다 (`createAppComponent`,
  `src/renderer/ui/components/app/app.tsx`).
- 결과: 설정 화면에서 바꾼 값은 OK 전까지 앱에 반영되지 않는다. 예: 사용 통계 동의, 워크플로우 바 너비 입력칸.

#### 영속 범위

출처: `[upstream, fork #11 #49 변경]`

`createPersistentAppState` (`src/renderer/base/state/app.ts`)가 디스크에 쓸 부분을 고른다.

| 저장됨                                                                                          | 저장 안 됨 (런타임 전용)                              |
|-------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| `entities.apps`, `entities.projects`, `entities.sharedDataKeys` [fork #8], `entities.workflows` | `entities.widgetTypes` (시작 때 registry에서 채움)    |
| `entities.widgets` (`exposedApi` 필드 제외)                                                     | `ui.copy`, `ui.dragDrop`, `ui.editMode`, `ui.palette` |
| `ui.appConfig`, `ui.apps`, `ui.menuBar`, `ui.topBar`                                            | `ui.memSaver`, `ui.modalScreens`, `ui.worktable`      |
| `ui.editTogglePos`, `ui.projectSwitcher`, `ui.shelf`                                            | `ui.widgetDynamicTitles` [fork #11]                   |

- 로드 병합: `mergeAppStateWithPersistentAppState`. `ui.appConfig`, `ui.apps`, `ui.projectSwitcher`, `ui.shelf`는 한 단계만 펼쳐
  병합한다.
- 결과: `appConfig.memSaver`, `appConfig.telemetry` 같은 중첩 객체는 저장된 값이 기본값을 통째로 덮는다. 중첩 객체에 새 필드를 추가하면 기존 설치에서 그 필드는
  `undefined`다 (추정, 병합 코드에서 도출). (pitfalls: 영속 상태 병합의 깊이)
- 상태 버전: `currentAppStateVersion = 2`, 마이그레이션 `migrateAppState`. 손상 상태 검증 `isPersistentAppState` [fork #49].
- 앱은 항상 편집 모드가 꺼진 상태로 시작한다 (`editMode` 비저장). 위젯·워크플로우 복사 목록도 재시작하면 비워진다.

#### 구독형 초기화

출처: `[upstream, fork #6 #10 #24 #27 #30 #41 #62 변경]`

- `init()` (`src/renderer/init.ts`)이 `appStoreReady` 이후 `initMainShortcutUseCase`, `initDownloadDirUseCase` [fork #41],
  `initAppMenuUseCase`, `initTrayMenuUseCase`, `initMemSaverUseCase`, `startTelemetry` [fork #62]를 호출한다.
- 대부분 `appStore.subscribe(selector, listener, { fireImmediately: true })`로 상태를 main에 미러링하고, `isLoading` 동안은 건너뛴다. 구독 비교는
  `shallow`다 (`src/common/data/store.ts`).
- `init()`은 main→renderer IPC를 use case나 DOM `CustomEvent`로 다시 보낸다.

| 채널 상수 (`src/common/ipc/channels.ts`) | 받는 쪽                         | 출처     |
|------------------------------------------|---------------------------------|----------|
| `ipcSwitchWorkflowByOffsetChannel`       | `switchWorkflowByOffsetUseCase` | fork #6  |
| `ipcZoomWebpageChannel`                  | `WEBPAGE_ZOOM_EVENT`            | fork #24 |
| `ipcGoHomeWebpageChannel`                | `WEBPAGE_GO_HOME_EVENT`         | fork #27 |
| `ipcSharedDataChangedChannel`            | `SHARED_DATA_CHANGED_EVENT`     | fork #10 |

- `window` `beforeunload`에서 `appStore.flush()`로 대기 중인 저장을 즉시 보낸다 [fork #30].

#### view model과 useAppState

출처: `[upstream, fork #33 변경]`

- 컴포넌트는 `create<X>Component({ use<X>ViewModel, 하위 컴포넌트 })` 팩토리다. view model hook은 `create<X>ViewModelHook(deps)`가 만든다.
  조립 위치는 `src/renderer/init.ts`의 `createUI`다.
- `useAppState` 변형 (`createAppStateHook`, `src/renderer/ui/hooks/appState.ts`):

| 함수                                    | 비교      | 용도                                       |
|-----------------------------------------|-----------|--------------------------------------------|
| `useAppState(selector)`                 | `shallow` | 기본                                       |
| `useAppState.useWithStrictEq`           | 참조 비교 | 엔티티 하나                                |
| `useAppState.useWithCustomEq`           | 직접 지정 | 공유 상태 (`sharedStateEquals`) [fork #33] |
| `useAppState.useEntityList`             | `shallow` | id 목록 → 엔티티 배열                      |
| `useAppState.useEntityListIfIdsDefined` | `shallow` | id 목록이 없을 수 있을 때                  |

- 주의점: selector가 매번 새 중첩 객체를 만들면 `shallow` 비교가 계속 실패해 매 store 변경마다 재렌더된다. #33이 이 문제를 `sharedStateEquals`
  (`src/renderer/base/state/shared.ts`)로 고쳤다. (pitfalls: useAppState의 1단계 shallow 비교)

#### 메뉴 항목의 IPC 왕복

출처: `[upstream]`

- `MenuItem.doAction`은 함수라서 IPC로 보낼 수 없다. `prepareMenuItemsForIpc` (`src/renderer/infra/ipc/prepareMenuItemsForIpc.ts`)가
  항목을 action id로 바꿔 main에 보내고, provider가 id→항목 표를 보관한다.
- main에서 클릭 신호가 오면 `click*MenuItemUseCase`가 해당 항목의 `doAction`을 호출한다.
- 같은 구조의 provider: `createAppMenuProvider`, `createOsContextMenuProvider`, `createTrayMenuProvider`
  (`src/renderer/infra/appMenuProvider/`, `contextMenuProvider/`, `trayMenuProvider/`).

### 앱 루트 레이아웃

출처: `[upstream, fork #14 #45 변경]`. main screen (상단 바, 워크플로우 바, 본문)과 모달 스택을 그린다.

| 경로                                             | 역할                                                                               |
|--------------------------------------------------|------------------------------------------------------------------------------------|
| `src/renderer/ui/components/app/app.tsx`         | `createAppComponent`. 레이아웃, 워크플로우 바 리사이저, 모달 스택                  |
| `src/renderer/ui/components/app/appViewModel.ts` | `createAppViewModelHook`. 모달 컴포넌트 표, 입력칸 우클릭 메뉴, 테마 id            |
| `src/renderer/ui/components/app/app.module.scss` | `.body-layout` 위치별 `flex-direction`, `.workflow-bar-resizer`, `.resize-overlay` |

구조:

- `TopBar`는 `ui.topBar`가 true일 때만 렌더한다 (기본 false).
- `.body-layout` 하나에 `[WorkflowSwitcher, 리사이저 자리, 본문]`을 고정 순서로 둔다. `appConfig.workflowBarPos`는 CSS 클래스
  `is-top/is-bottom/is-left/is-right`로 `flex-direction`만 바꾼다 (`column`, `column-reverse`, `row`,
  `row-reverse`) [fork #45].
- 본문: 프로젝트가 있으면 `Worktable`, 없으면 Manage Projects 안내 문구.
- 리사이저: 바가 좌/우이고 편집 모드일 때만 렌더한다. 왼쪽 버튼 `mousedown` → `window` `mousemove`마다
  `setWorkflowBarWidthUseCase(시작 폭 + dir × ΔX)` (`dir`은 left=+1, right=-1) → `mouseup`, `window` `blur`, 또는 왼쪽 버튼이 떼어진
  `mousemove`에서 종료. 리스너는 `AbortController` 하나로 해제한다. 드래그 중에는 `.resize-overlay`가 창 전체를 덮는다.
- `input`과 `textarea` 우클릭은 `contextMenuForTextInput` (`src/renderer/base/contextMenu.ts`)을 띄운다.

상태: `ui.topBar`, `ui.appConfig.workflowBarPos` (기본 `'left'`), `ui.appConfig.workflowBarWidth` (기본 200, 범위 120~600:
`workflowBarMinWidth`, `workflowBarMaxWidth`), `ui.modalScreens.order`.

주의점:

- 바 위치마다 다른 트리를 렌더하면 React가 `Worktable`을 다시 만들어 webview 위젯이 모두 새로고침된다. 자식 슬롯 순서를 고정한다 (`app.tsx` 주석, CHANGES #45 후속).
  (pitfalls: 앱 레이아웃 트리 변경과 webview 리로드)
- `<webview>`는 커서가 위를 지날 때 `mousemove`/`mouseup`을 삼킨다. 드래그 UI는 전체 화면 오버레이로 이벤트를 호스트 문서로 모은다 (#38, #45, #48 공통 방식).
  (pitfalls: 드래그 중 webview의 마우스 이벤트)
- 리사이저의 `z-index` 3은 워크플로우 바 (2)보다 커야 잡는 영역 전체가 동작한다 (`app.module.scss` 주석).

### 프로젝트

출처: `[upstream, fork #76 변경]`. 프로젝트 전환과 관리 (추가, 복제, 삭제, 순서, 이름, Memory Saver 설정).

| 경로                                                                          | 역할                                                                                                                    |
|-------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `src/renderer/base/project.ts`                                                | `Project` (`settings.name`, `settings.memSaver`, `workflowIds`, `currentWorkflowId`), `createProject`                   |
| `src/renderer/application/useCases/projectSwitcher/switchProject.ts`          | `createSwitchProjectUseCase`                                                                                            |
| `src/renderer/application/useCases/projectSwitcher/subs/setCurrentProject.ts` | `setCurrentProjectSubCase`. 현재 프로젝트 변경과 Memory Saver 처리                                                      |
| `src/renderer/application/useCases/projectManager/`                           | 관리 모달: open, add, duplicate, toggleDeletion, updateProjectSettings, updateProjectsOrder, switch, saveChanges, close |
| `src/renderer/application/useCases/project/subs/deleteProjects.ts`            | `deleteProjectsSubCase`. 삭제할 workflow id와 widget id 계산, 현재 프로젝트 이동                                        |
| `src/renderer/ui/components/projectSwitcher/`                                 | `<select>` 전환기                                                                                                       |
| `src/renderer/ui/components/projectManager/`                                  | 관리 모달. 목록 검색과 빈 상태 안내 [fork #76]                                                                          |
| `src/renderer/ui/components/manageProjectsButton/`                            | 관리 모달 열기 버튼                                                                                                     |

흐름:

- 전환: `<select>` 변경 또는 트레이 메뉴 → `switchProjectUseCase(projectId)` → `setCurrentProjectSubCase` → 새 프로젝트 workflow 활성화
  (`activateProjectWorkflowsSubCase`), 이전 프로젝트 workflow 비활성화 예약 (`scheduleProjectWorkflowsDeactivationSubCase`),
  `ui.projectSwitcher.currentProjectId` 갱신.
- 관리 저장 (`createSaveChangesInProjectManagerUseCase`):
  1. 초안 `projects`, `projectIds`를 반영하고 모달을 닫는다.
  2. 복제가 아닌 새 프로젝트마다 빈 workflow 1개를 만든다.
  3. 삭제 표시 프로젝트의 workflow와 widget 엔티티를 지우고 Memory Saver에서 비활성화한다.
  4. 복제 표시 (`duplicateProjectIds`: 새 id → 원본 id)마다 `cloneWorkflowSubCase`로 workflow와 위젯 데이터를 복사한다.
  5. 현재 프로젝트가 목록에 없으면 첫 프로젝트로 전환한다.

상태: `entities.projects`, `ui.projectSwitcher.{projectIds, currentProjectId, pos}`, 초안
`ui.modalScreens.data.projectManager`.

주의점:

- 프로젝트, workflow, 위젯 삭제는 엔티티만 지운다. main의 위젯 데이터 폴더 (`freeter-data/widgets/<widgetId>`)는 남는다. `deleteWidget.ts`,
  `subs/deleteWorkflows.ts`, `saveChangesInProjectManager.ts`에 데이터 삭제 호출이 없다. (pitfalls: 삭제 후 남는 위젯 데이터)
- 목록 검색 필터가 걸린 상태의 드래그 재정렬은 보이는 항목 기준으로만 동작한다 (CHANGES #76, 코드 주석).

### 워크플로우

출처: `[upstream, fork #6 #15 #45 변경]`. 프로젝트 안의 탭이다. workflow마다 위젯 배치 (`layout`)와 설정을 가진다.

| 경로                                                                   | 역할                                                                                                                     |
|------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| `src/renderer/base/workflow.ts`                                        | `Workflow` (`layout`, `settings.name`, `settings.memSaver`), `createWorkflow`, `generateWorkflowName`                    |
| `src/renderer/application/useCases/workflowSwitcher/`                  | `switchWorkflow`, `switchWorkflowByOffset` [fork #6], `addWorkflow`, `renameWorkflow`, `deleteWorkflow`, `pasteWorkflow` |
| `src/renderer/application/useCases/workflow/copyWorkflow.ts`           | 복사 목록 `ui.copy.workflows`에 추가 (최대 10개)                                                                         |
| `src/renderer/application/useCases/workflow/subs/`                     | `createWorkflow`, `cloneWorkflow`, `cloneWidgetLayoutItem`, `deleteWorkflows` 등 하위 단계                               |
| `src/renderer/application/useCases/project/subs/setCurrentWorkflow.ts` | `setCurrentWorkflowSubCase`. 현재 workflow 변경과 Memory Saver 처리                                                      |
| `src/renderer/application/useCases/workflowSettings/`                  | 설정 모달 (이름, Memory Saver 값)                                                                                        |
| `src/renderer/application/useCases/dragDrop/`                          | `dragWorkflowFromWorkflowSwitcher`, `dragOverWorkflowSwitcher`, `dropOnWorkflowSwitcher` (탭 재정렬)                     |
| `src/renderer/ui/components/workflowSwitcher/`                         | 탭 바. 세로 배치와 `dropUp` [fork #45], 탭 최소 폭 100px [fork #15]                                                      |

흐름:

- 탭 클릭 → `onItemClick` → 다른 탭이면 `switchWorkflowUseCase(projectId, workflowId)`, 현재 탭이고 편집 모드면 이름 편집 모드
  (`workflowSwitcherViewModel.ts`).
- `Ctrl/Cmd+Tab`, `Ctrl/Cmd+Shift+Tab` [fork #6]: 앱 메뉴 accelerator (View → Next/Previous Workflow) →
  `switchWorkflowByOffsetUseCase(±1)`. 끝에서 처음으로 순환하고 workflow가 2개 미만이면 무시한다. 포커스가 `<webview>` 안이면 main이
  `before-input-event`로 키를 잡아 `ipcSwitchWorkflowByOffsetChannel`로 보낸다.
- 추가: `addWorkflowUseCase(posByWorkflowId?)` → 새 workflow를 지정 위치에 넣고 현재 workflow로 만든다 → 탭이 이름 편집 모드로 들어간다.
- 삭제 (`deleteWorkflowsSubCase`): workflow의 위젯 엔티티 제거 → 현재 workflow였으면 같은 위치의 다음 workflow로 이동 → Memory Saver 비활성화.
- 붙여넣기: `cloneWorkflowSubCase`가 항목마다 `cloneWidgetSubCase` (위젯 데이터 폴더 복사 포함)를 호출한다. 이름은 `generateCopyName`이 중복을 피한다.
- 탭 드래그는 편집 모드에서만 시작한다. drop 시 같은 프로젝트면 순서를 바꾼다. `dropOnWorkflowSwitcherUseCase`에 다른 프로젝트로 옮기는 분기도 있으나, 탭 바가 현재 프로젝트만 보여
  주므로 UI 진입 경로는 확인하지 못했다.

바 안 구성요소 배치 (`createWorkflowSwitcherViewModelHook`):

| 요소                                   | 표시 조건                                                                                  |
|----------------------------------------|--------------------------------------------------------------------------------------------|
| 프로젝트 전환기 + Manage Projects 버튼 | `ui.projectSwitcher.pos`가 `TabBarLeft` 또는 `TabBarRight`                                 |
| 편집 토글                              | `ui.editTogglePos`가 `TabBarLeft` 또는 `TabBarRight`                                       |
| 팔레트 (왼쪽)                          | 편집 모드, 현재 workflow 있음, 편집 토글이 왼쪽                                            |
| 팔레트 (오른쪽)                        | 편집 모드, 현재 workflow 있음, 왼쪽 팔레트 아님, 편집 토글이 오른쪽이거나 상단 바가 숨겨짐 |
| 팔레트 `dropUp`                        | 바가 아래이거나, 세로 바에서 팔레트가 탭 목록 뒤에 있음 [fork #45 후속]                    |

상태: `entities.workflows`, `Project.workflowIds`, `Project.currentWorkflowId`, `ui.copy.workflows`,
`ui.dragDrop.from.workflowSwitcher`, `ui.dragDrop.over.workflowSwitcher`.

### Worktable과 위젯 레이아웃

출처: `[upstream, fork #34 #42 #43 #44 #45 변경]`. 현재 workflow의 위젯을 격자에 배치하고 이동, 리사이즈, 최대화를 처리한다.

| 경로                                                                             | 역할                                                                                                                                                                                       |
|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/renderer/base/widgetLayout.ts`                                              | 격자 상수, 배치 계산 (`createLayoutItem`, `createLayoutItemAtFreeArea`, `moveLayoutItem`, `removeLayoutItem`, `resizeLayoutItemByEdges`), 충돌 처리 `_fixCollisions`, 경계 보정 `_fixRect` |
| `src/renderer/ui/components/worktable/worktable.tsx`, `worktableViewModel.ts`    | 활성 workflow마다 `WidgetLayout` 렌더, 배경 레이어 [fork #42]                                                                                                                              |
| `src/renderer/ui/components/worktable/widgetLayout/widgetLayoutViewModel.ts`     | 드래그 앤 드롭, 리사이즈 미리보기, 편집 모드 우클릭 메뉴 (Add Widget, Paste Widget)                                                                                                        |
| `src/renderer/ui/components/worktable/widgetLayout/widgetLayoutItemViewModel.ts` | 항목 픽셀 rect, 리사이즈 핸들 드래그, 최대화                                                                                                                                               |
| `src/renderer/ui/components/worktable/widgetLayout/calcs.ts`                     | 격자 단위 ↔ 픽셀 변환                                                                                                                                                                      |
| `src/renderer/application/useCases/worktable/resizeLayoutItem/`                  | `resizeLayoutItemStart`, `resizeLayoutItem`, `resizeLayoutItemEnd`, 계산 `resizeLayoutItemCalc`                                                                                            |

#### 격자와 픽셀 변환

- 격자: `widgetLayoutVisibleCols = 32`, `widgetLayoutVisibleRows = 16` [fork #34, 원래 16×8].
- 칸 크기는 worktable 실측 크기에서 간격과 여백을 빼고 칸 수로 나눈다 (`calcGridColWidth`, `calcGridRowHeight`). 칸 간격 `itemMargin` 4px, 바깥 여백
  `layoutPadding` 4px [fork #34, 원래 6px].
- `layoutPadding`과 `.layout-item:after` spacer (`widgetLayout.module.scss`)는 같은 값을 유지한다 (두 파일에 서로 참조하는 주석, CHANGES #34
  후속).
- worktable 크기는 `useElementRect`로 잰다. 창 크기 변화 없이 바 위치나 너비가 바뀌어도 `ResizeObserver`가 다시 잰다 [fork #45].

#### 배치, 충돌, 이동, 리사이즈

- 새 항목의 기본 크기는 위젯 타입 `minSize`다 (`addWidgetToWorkflow`, `dropOnWorktableLayout`, `pasteWidgetToWorkflow`).
- 좌표가 없으면 `createLayoutItemAtFreeArea`가 위에서 아래, 왼쪽에서 오른쪽 순서로 첫 빈자리를 찾는다.
- 충돌: 움직인 항목 (initiator)과 겹치는 항목을 그 아래로 밀고 재귀로 반복한다 (`_fixCollisionsIter`).
- 경계: 가로는 `x + w <= cols`로 클램프하고, 세로는 하한만 둔다 (worktable이 세로 스크롤) (`_fixRect`) [fork #34 후속].
- 오른쪽 모서리 성장 상한 `maxRight`는 0 이상으로 바닥 처리한다. 이미 격자를 넘은 항목을 바깥으로 끌어도 줄지 않는다. `moveLayoutItem`은 x, y가 같아도 `_fixRect`가 폭을
  줄였으면 갱신한다 [fork #34 후속, 2026-10-05].
- minSize 성장이 가로 상한보다 우선한다 (minSize보다 작게 저장된 항목). 원래 격자 안에 있던 항목이 이 때문에 오른쪽 끝을 넘으면 `resizeLayoutItemByEdges`가 넘친
  만큼 `x`를 왼쪽으로 옮긴다. 드래그 미리보기 (`widgetLayoutItemViewModel.ts`의 `onResizeMouseMoveHandler`)도 같은 규칙이고, 상한은 실시간 `x` prop 대신
  `resizing.initialItemRectUnits` 기준으로 계산한다. 리사이즈 중에는 `x` prop이 미리보기 layout을 따라 바뀌기 때문이다 [fork #34 후속, 2026-10-05].
- 1칸 미만 드래그는 `deltaUnits`가 0이라 확정 계산이 건너뛴다. minSize보다 작은 항목은 미리보기에서만 minSize까지 커져 보이고 놓으면 원래 크기로 돌아간다 (기존 불일치, 미수정).
- 리사이즈 흐름:
  1. 핸들 `mousedown` → `resizeLayoutItemStartUseCase`가 `ui.worktable.resizingItem`에 workflow, 항목, 모서리, `minSize`를 기록한다.
  2. `mousemove`마다 `resizeLayoutItemUseCase(deltaUnits)`가 delta만 저장한다. 항목은 로컬 픽셀 rect로 그려지고, view model이
     `resizeLayoutItemCalc`로 미리보기 layout과 고스트 (`WidgetLayoutItemGhost`)를 계산한다.
  3. `mouseup` → `resizeLayoutItemEndUseCase`가 layout을 확정하고 `resizingItem`을 지운다.
- 리사이즈 중 위젯 투명도 `widgetLayoutItemResizingOpacity` 0.8 [fork #43].
- 이동: HTML5 drag and drop. 미리보기는 `ui.dragDrop.over.worktableLayout` 좌표로 view model이 `moveLayoutItem` 또는
  `createLayoutItem`을 미리 적용해 그린다. 확정은 drop 때 `dropOnWorktableLayoutUseCase`다.
- 최대화: 보기 모드에서 `maximizable` 위젯 타입 (현재 Note, Webpage)만 가능하다. 항목 컴포넌트의 로컬 state (`maximized`)라 저장되지 않는다.

#### 렌더링 구조

- `Worktable`은 `ui.memSaver.activeWorkflows`의 모든 workflow에 `WidgetLayout`을 렌더한다. 현재 workflow만 보이고, 나머지는
  `visibility: hidden`과 `inert`로 마운트된 채 숨는다.
- 편집 모드, 리사이즈, 드래그 관련 props는 현재 workflow의 `WidgetLayout`에만 넘긴다.
- `WidgetLayout`은 마운트 전에는 placeholder `<div>`를, 마운트 후에는 다른 `<div>`를 렌더한다 (`useComponentMounted`).
- 편집 모드에서는 위젯 본문 (`.widget-body`)이 `inert`라서 위젯 내용을 조작할 수 없다 (`src/renderer/ui/components/widget/widget.tsx`).
- 위젯 모서리 4px 라운드 [fork #44].

#### 배경

출처: `[fork #42]`

- 설정: `appConfig.bgColor`, `bgImage` (절대 경로), `bgImageMode` (`cover`, `contain`, `center`, `tile`), `bgOpacity` (0~100).
- 이미지: 경로가 바뀌면 `worktableViewModel`이 `getImageDataUrlUseCase(path)`를 비동기로 호출한다. main이 파일을 읽어 data URL을 돌려준다
  (`ipcFsGetImageDataUrlChannel`).
- 별도 레이어 `.worktable-bg`에만 `opacity`를 준다. 위젯은 흐려지지 않는다.

상태: `Workflow.layout` (`WidgetLayoutItem { id, widgetId, rect: { x, y, w, h } }`, 격자 단위), `ui.worktable.resizingItem`.

주의점:

- `minSize`는 추가 시 기본 크기를 겸한다. minSize를 바꾸면 새 위젯의 크기도 바뀐다 (CHANGES #34). (pitfalls: minSize의 이중 역할)
- #34의 격자 변경에는 마이그레이션이 없다. 16×8 좌표로 저장된 위젯은 1/4 크기로 보인다. (pitfalls: 격자 상수와 저장 좌표)
- `useElementRect`는 위치만 바뀌는 경우를 감지하지 못한다. 공용 hook 섹션 참고. (pitfalls: useElementRect의 재측정 시점)

### 위젯 생애주기

출처: `[upstream, fork #8 #11 #16 #58 #63 #67 변경]`. 위젯 엔티티의 생성, 배치, 복사, 붙여넣기, 삭제, 설정 편집을 다룬다. 위젯에 주는 API
자체는 [features-widgets.md](features-widgets.md)가 다룬다.

| 경로                                                                                       | 역할                                                                                                                                                                                                           |
|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/renderer/base/widget.ts`                                                              | `Widget` (`type`, `coreSettings.name`, `settings`, `exposedApi?`), `WidgetEnv` (`area: 'shelf'` 또는 `'workflow'`, `isPreview?`), `createWidget`, `getWidgetDisplayName`, `resolveWidgetSharedKeyId` [fork #8] |
| `src/renderer/application/useCases/widget/subs/createWidget.ts`, `cloneWidget.ts`          | 생성, 복제 (위젯 데이터 폴더 복사 포함)                                                                                                                                                                        |
| `src/renderer/application/useCases/widget/copyWidget.ts`, `deleteWidget.ts`                | 복사 목록 추가, 삭제 (확인 대화상자)                                                                                                                                                                           |
| `src/renderer/application/useCases/widget/setExposedApi.ts`, `setWidgetDynamicTitle.ts`    | 위젯이 노출한 API 저장, 동적 제목 [fork #11]                                                                                                                                                                   |
| `src/renderer/application/useCases/widget/widgetApiWidgets/getWidgetsInCurrentWorkflow.ts` | 현재 workflow의 같은 타입 위젯 목록과 `exposedApi`. Web Query가 Webpage 위젯을 찾을 때 쓴다                                                                                                                    |
| `src/renderer/application/useCases/widgetSettings/`                                        | 설정 모달 open, updateWidgetCoreSettings, save, close, `getWidgetSettingsApi`                                                                                                                                  |
| `src/renderer/ui/components/widget/widgetViewModel.ts`                                     | 헤더 이름, 액션바, 컨텍스트 메뉴, `widgetApi` 생성                                                                                                                                                             |
| `src/renderer/ui/components/widget/widget.tsx`                                             | 헤더 (이름 또는 탭), 액션바, 본문                                                                                                                                                                              |
| `src/renderer/ui/components/widgetSettings/`                                               | 설정 모달 (미리보기 위젯 + 설정 편집기)                                                                                                                                                                        |

#### 생성 경로

| use case                       | 트리거                                                                       | 위치      |
|--------------------------------|------------------------------------------------------------------------------|-----------|
| `addWidgetToWorkflowUseCase`   | 팔레트 항목 클릭, worktable 우클릭 Add Widget, 팔레트 우클릭 Add to Workflow | 첫 빈자리 |
| `addWidgetToShelfUseCase`      | 팔레트 우클릭 Add to Shelf, 셸프 우클릭 Add Widget                           | 셸프 목록 |
| `dropOnWorktableLayoutUseCase` | 팔레트 → worktable 드래그                                                    | drop 좌표 |
| `dropOnTopBarListUseCase`      | 팔레트 → 셸프 드래그                                                         | drop 위치 |

- 네 경로 모두 새 위젯 이름을 `''`로 만든다 [fork #16]. 헤더는 이름이 비면 동적 제목, 그다음 타입 이름을 보여 준다.
- `settings`는 `widgetType.createSettingsState({})`로 채운다 (`createWidget`).

#### 복사, 붙여넣기, 이동

- 복사: `copyWidgetUseCase`가 위젯 엔티티 스냅샷을 `ui.copy.widgets`에 넣는다 (최대 10개, 비영속).
- 붙여넣기: `cloneWidgetSubCase`가 새 id를 만들고 `widgetDataStorageManager.copyObjectData(oldId, newId)`로 위젯 데이터 폴더를 복사한다. 이름은
  `generateCopyName`이 중복을 피한다. 붙여넣기는 원래 이름을 이어받는다 (#16의 공란 처리 대상 밖).
- 셸프와 worktable 사이 이동은 같은 위젯 id를 유지한다. `dropOnTopBarListUseCase`의 worktable 분기는 layout 항목을 지우고 셸프 항목을 만든다.
  `dropOnWorktableLayoutUseCase`의 셸프 분기는 반대로 하고 크기를 `minSize`로 둔다.
- 다른 workflow로 옮기는 UI 경로는 셸프를 거치는 방법이다 (추정: 드래그 props가 현재 workflow에만 전달된다). `dropOnWorktableLayoutUseCase`에 workflow 간
  이동 분기가 있으나 진입 경로는 확인하지 못했다.

#### 삭제

- `deleteWidgetUseCase(widgetId, env)`: 확인 대화상자 → `env.area`가 `shelf`면 셸프 목록에서, `workflow`면 그 workflow의 layout에서 제거 →
  엔티티 제거 → `ui.widgetDynamicTitles` 항목 정리 [fork #11].
- 위젯 데이터 폴더는 지우지 않는다 (프로젝트 섹션 주의점).

#### 설정 화면

- `openWidgetSettingsUseCase(widgetId, env)`가 위젯 사본과 `env.isPreview = true`를 초안에 넣는다.
- 위젯 타입의 `settingsEditorComp`가 `settingsApi.updateSettings`로 초안 `settings`를 병합한다. 이름은 `updateWidgetCoreSettingsUseCase`가
  고친다.
- `settingsApi` (`getWidgetSettingsApiUseCase`): `updateSettings`, `dialog.showAppManager`, `dialog.showOpenDirDialog`,
  `dialog.showOpenFileDialog`, `sharedDataKey.create`, `sharedDataKey.delete` [fork #8].
- 저장: `saveWidgetSettingsUseCase`가 `coreSettings`와 `settings`를 엔티티에 반영하고 모달을 닫는다.

#### 헤더, 액션바, 컨텍스트 메뉴

- 헤더 이름 우선순위: `coreSettings.name` → `ui.widgetDynamicTitles[widgetId]` [fork #11] → 타입 이름.
- 보기 모드에서 위젯이 `setHeaderTabs`로 탭을 주면 이름 대신 탭 목록을 그린다 (Webpage 탭 [fork #67]).
- 편집 모드 액션바: Widget Settings, Delete Widget, More Actions. More 메뉴에도 Widget Settings, Copy Widget, Delete Widget이
  있다 [fork #58]. 작은 위젯에서 bar가 잘려도 접근할 수 있게 하려는 것이다.
- 보기 모드 액션바: 위젯이 `updateActionBar`로 준 항목 + 최대화 버튼 (`maximizable`일 때).
- 우클릭: 편집 모드면 고정 메뉴 (Widget Settings, Copy Widget, Delete Widget), 보기 모드면 위젯이 `setContextMenuFactory`로 등록한 factory를 쓴다.
  `data-widget-context` 속성을 가진 가장 가까운 조상의 값이 `contextId`로 전달된다.
- `widgetApi`는 위젯마다 `useMemo`로 만든다 (`getWidgetApiUseCase`). 콜백이 액션바, 컨텍스트 메뉴, exposed API, 동적 제목, 활동 기록 [fork #63], 헤더
  탭을 view model state나 store에 연결한다. 미리보기 (`isPreview`)에서는 이 콜백들이 no-op다 (`_createWidgetApiFactory`의 `forPreview` 분기,
  `src/renderer/application/useCases/widget/getWidgetApi.ts`).
- 활동 기록 콜백은 `widgetId`를 자동으로 붙여 `logTelemetryActivityUseCase`로 보낸다.
- 액션바와 워크플로우 탭 액션바는 리사이즈나 드래그 중에 숨긴다 (`dontShowActionBar`).

### 팔레트와 드래그 앤 드롭

출처: `[upstream, fork #45 #48 #74 변경]`

| 경로                                                                                       | 역할                                                         |
|--------------------------------------------------------------------------------------------|--------------------------------------------------------------|
| `src/renderer/ui/components/palette/palette.tsx`, `paletteViewModel.ts`, `paletteItem.tsx` | Add Widget, Paste Widget 드롭다운 (CSS hover와 focus로 열림) |
| `src/renderer/base/state/ui.ts`                                                            | `ui.palette.widgetTypeIds` 기본 목록, `DragDropState` 타입   |
| `src/renderer/base/state/actions/dragDrop.ts`                                              | `dragDropStateActions.resetAll`, `resetOver`                 |
| `src/renderer/application/useCases/dragDrop/`                                              | drag 시작, over, leave, drop, end use case 13개              |

팔레트:

- 표시 조건: 편집 모드이고 현재 workflow가 있을 때. 위치는 상단 바 (`PalettePropsPos.TopBar`) 또는 워크플로우 바 (`PalettePropsPos.TabBar`).
- 항목 클릭 → 현재 workflow에 추가 또는 붙여넣기. 드래그 → `dragWidgetFromPaletteUseCase({ widgetTypeId })` 또는 `({ widgetCopyId })`. 우클릭 →
  Add/Paste to Workflow, Add/Paste to Shelf.
- 검색: 컴포넌트 로컬 state로 이름을 필터한다. `:focus-within` 규칙이 입력 중 드롭다운을 열어 둔다 [fork #74].
- 드롭다운 섹션은 `.palette` 기준 absolute로 뜨고, `dropUp`이면 위로 펼친다 [fork #45 후속]. 위로 펼칠 때는 `max-height`가 `min(500px, 60vh)`라
  최소 높이 (600px) 창에서도 검색창이 창 위로 잘리지 않는다 (`palette.module.scss`의 `.palette.drop-up .palette-section`).
- 드래그가 시작되면 (`ui.dragDrop.from` 존재) 섹션을 숨긴다.

드래그 출발 기록 (`ui.dragDrop.from`, 비영속):

| 출발               | 기록 내용                                                                      |
|--------------------|--------------------------------------------------------------------------------|
| `palette`          | `widgetTypeId` 또는 `widgetCopyId`                                             |
| `topBarList`       | `widgetId`, `listItemId`                                                       |
| `workflowSwitcher` | `projectId`, `workflowId`                                                      |
| `worktableLayout`  | `workflowId`, `widgetId`, `layoutItemId`, `layoutItemWH`, `sizePx?` [fork #48] |

도착별 처리:

| 도착                                            | 받는 출발                            | drop 결과                                                                                  |
|-------------------------------------------------|--------------------------------------|--------------------------------------------------------------------------------------------|
| worktable (`dropOnWorktableLayoutUseCase`)      | palette, topBarList, worktableLayout | 새 위젯 생성, 붙여넣기, 같은 workflow 안 이동, 셸프에서 꺼내기                             |
| 셸프 (`dropOnTopBarListUseCase`)                | palette, topBarList, worktableLayout | 새 위젯 생성, 붙여넣기, 셸프 순서 변경, worktable에서 올리기 (팝업 크기를 `sizePx`로 시드) |
| 워크플로우 탭 (`dropOnWorkflowSwitcherUseCase`) | workflowSwitcher                     | 탭 순서 변경                                                                               |

- over use case는 받을 수 없는 출발이면 `false`를 돌려주고, view model은 그때 `preventDefault`를 하지 않는다 (drop 불가).
- over use case는 값이 같으면 `set`을 하지 않는다. `dragOver`는 고빈도로 호출된다.
- drop use case와 `dragEndUseCase`는 끝에 `resetAll`로 drag 상태를 지운다.
- worktable 항목 drag 시작은 `setTimeout(0)` 뒤에 상태를 기록한다. `setDragImage`가 먼저 실행되게 하려는 것이다 (`widgetLayoutViewModel.ts` 주석).
- 주의점: `ui.palette.widgetTypeIds`는 저장되지 않고 `createUiState`의 기본 목록을 매번 쓴다. 이 목록은 팔레트, worktable 우클릭 Add Widget, 셸프 우클릭
  Add Widget이 모두 쓴다. 새 위젯 타입은 `src/renderer/widgets/index.ts` 등록과 함께 이 목록에도 넣어야 보인다. (pitfalls: 팔레트 기본 목록)

### 셸프 (Top Bar 위젯 목록)

출처: `[upstream, fork #14 #15 #19 #30 #48 변경]`. 상단 바에 위젯을 탭으로 두고, hover나 focus 때 팝업으로 보여 준다. 상단 바가 숨겨져 있으면 (기본값) 보이지 않는다.

| 경로                                                                             | 역할                                                                              |
|----------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| `src/renderer/base/widgetList.ts`                                                | `WidgetListItem { id, widgetId, w?, h? }` (`w`, `h`는 fork #48), `createListItem` |
| `src/renderer/application/useCases/shelf/`                                       | `addWidgetToShelf`, `pasteWidgetToShelf`, `setShelfItemSize` [fork #48], subs     |
| `src/renderer/ui/components/topBar/shelf/shelf.tsx`, `shelfViewModel.ts`         | 목록, drag 처리, 우클릭 메뉴                                                      |
| `src/renderer/ui/components/topBar/shelf/shelfItem.tsx`, `shelfItemViewModel.ts` | 탭, 팝업 위치와 크기, 리사이즈 핸들, `clampShelfPopupBox`                         |

- 팝업 크기: 기본 300×150 (`shelfWidgetDefaultW`, `shelfWidgetDefaultH`), 범위 150~1200 × 80~900
  (`src/renderer/application/useCases/shelf/setShelfItemSize.ts`) [fork #19 #48].
- 팝업은 `position: fixed`이고 x 좌표는 탭의 실측 rect다. 탭에 `onMouseEnter`나 `onFocus`가 오면 `measureItemElRect`로 다시
  잰다 [fork, CHANGES 섹션 없음, 커밋 548a753]. 다른 탭이 삭제되어 위치만 바뀐 경우를 잡으려는 것이다.
- 표시 크기만 창 안으로 클램프하고 저장 크기는 유지한다 (`clampShelfPopupBox`).
- 편집 모드에서 팝업 우하단 핸들로 크기를 바꾼다 → `setShelfItemSizeUseCase` (클램프, 반올림, 같은 값 무시). 드래그 중에는 `is-resizing` 클래스로 팝업을 강제 표시하고
  오버레이를 띄운다.
- 모든 셸프 위젯은 `createWidgetEnv({ area: 'shelf' })` 객체 하나를 공유한다 (`shelfViewModel.ts`). env 객체는 `Object.freeze`된다.
- `ShelfItem`은 `memo`다 [fork #30].
- 주의점: 상단 바 높이 48px [fork #14]와 팝업 `top: 46px`은 `shelf.module.scss`와 `shelfItemViewModel.ts`의 `shelfPopupTopPx`가 같은 값을
  유지해야 한다. (pitfalls: 상단 바 높이의 다중 정의)

### 편집 모드와 바 배치 토글

출처: `[upstream]`

| use case (`src/renderer/application/useCases/`) | 상태 (기본값)                                               | 진입점                                                          |
|-------------------------------------------------|-------------------------------------------------------------|-----------------------------------------------------------------|
| `toggleEditMode.ts`                             | `ui.editMode` (false, 비영속)                               | Edit → Enable/Disable Edit Mode (`CmdOrCtrl+E`), 편집 토글 버튼 |
| `toggleMenuBar.ts`                              | `ui.menuBar` (true)                                         | View → Appearance (mac 제외). main에 `setAutoHide(!menuBar)`    |
| `toggleTopBar.ts`                               | `ui.topBar` (false)                                         | View → Appearance → Show/Hide Top Bar                           |
| `projectSwitcher/setProjectSwitcherPosition.ts` | `ui.projectSwitcher.pos` (`ProjectSwitcherPos.TabBarRight`) | View → Appearance → Project Switcher Position                   |
| `setEditTogglePosition.ts`                      | `ui.editTogglePos` (`EditTogglePos.TabBarRight`)            | View → Appearance → Edit Mode Toggle Position                   |

- `ProjectSwitcherPos`와 `EditTogglePos` 값: `Hidden`, `TopBar`, `TabBarLeft`, `TabBarRight`.
- 상단 바 팔레트는 편집 토글이 `TopBar` 또는 `Hidden`일 때 보인다 (`topBarViewModel.ts`).
- 편집 모드에서 바뀌는 것: 팔레트 표시, 위젯 액션바 (Settings, Delete, More), 위젯 본문 `inert`, 위젯 드래그와 리사이즈, 워크플로우 탭 액션바와 탭 드래그, worktable 우클릭
  메뉴, 사이드 바 리사이저 [fork #45], 셸프 팝업 리사이즈 핸들 [fork #48].

### 앱 메뉴, 컨텍스트 메뉴, 트레이 메뉴

출처: `[upstream, fork #1 #5 #6 #62 #87 변경]`

| 경로                                                                               | 역할                                     |
|------------------------------------------------------------------------------------|------------------------------------------|
| `src/renderer/application/useCases/appMenu/initAppMenu.ts`                         | 메뉴 트리 구성, 상태 변화 때 다시 설정   |
| `src/renderer/application/useCases/trayMenu/initTrayMenu.ts`                       | 프로젝트 목록 트레이 메뉴                |
| `src/renderer/application/useCases/contextMenu/showContextMenu.ts`                 | 메뉴 항목 배열을 OS 컨텍스트 메뉴로 표시 |
| `src/renderer/infra/appMenuProvider/`, `trayMenuProvider/`, `contextMenuProvider/` | IPC 래퍼 (공통 패턴의 메뉴 IPC 왕복)     |

앱 메뉴 (Windows/Linux 기준. macOS는 첫 메뉴가 `Freeter-SWH` 앱 메뉴):

| 메뉴 | 항목                                                                                                                                                                                                                                    |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| File | Settings (`CmdOrCtrl+,`), Open Data Folder [fork #5], Quit                                                                                                                                                                              |
| Edit | Enable/Disable Edit Mode (`CmdOrCtrl+E`), undo, redo, cut, copy, paste, selectAll                                                                                                                                                       |
| View | Appearance (전체 화면, 메뉴 바, 상단 바, 프로젝트 전환기 위치, 편집 토글 위치), Next/Previous Workflow (`CmdOrCtrl+Tab`, `CmdOrCtrl+Shift+Tab`) [fork #6], Analytics (`CmdOrCtrl+Shift+A`) [fork #62 #87], Manage Projects, Manage Apps |
| Help | Twitter, Community, Feature Requests, Report Issues, Check for updates, About Freeter-SWH [fork #1]                                                                                                                                     |
| Dev  | dev 모드 (`isDevMode`)에서만: reload, forceReload, toggleDevTools                                                                                                                                                                       |

- 메뉴는 로딩이 끝난 뒤 `editMode`, `menuBar`, `topBar`, `projectSwitcher.pos`, `editTogglePos`가 바뀔 때마다 다시 만든다.
- Help의 외부 링크와 Check for updates (`https://freeter.io/v2/download`)는 upstream 주소 그대로다.
- 트레이 메뉴: 프로젝트마다 항목 하나 (현재 프로젝트는 radio). 클릭 → `showBrowserWindowUseCase()` → `switchProjectUseCase(id)`.

컨텍스트 메뉴 진입점:

| 위치                 | 항목 (편집 모드)                                                    | 보기 모드             |
|----------------------|---------------------------------------------------------------------|-----------------------|
| worktable 빈 곳      | Add Widget, Paste Widget 하위 메뉴                                  | 없음                  |
| 워크플로우 바 빈 곳  | Add Workflow                                                        | 없음 (빈 배열로 호출) |
| 워크플로우 탭        | Rename, Settings, Add, Copy, Paste, Delete                          | 없음 (빈 배열로 호출) |
| 셸프 빈 곳과 셸프 탭 | Add Widget, Paste Widget 하위 메뉴                                  | 없음                  |
| 위젯                 | Widget Settings, Copy, Delete                                       | 위젯이 등록한 factory |
| `input`, `textarea`  | `contextMenuForTextInput` (undo, redo, cut, copy, paste, selectAll) | 같음                  |

### 글로벌 단축키

출처: `[upstream, fork #20 변경]`

- 설정: `appConfig.mainHotkey`. 기본 `CmdOrCtrl+Shift+Space` [fork #20, 원래 `CmdOrCtrl+Shift+F`]. 선택지는
  `getMainHotkeyOptionsUseCase`가 준다 (빈 문자열 = 사용 안 함).
- 흐름: `initMainShortcutUseCase` 구독 → `globalShortcut.setMainShortcut(accelerator)` (IPC) → main
  `createGlobalShortcutProvider` (`src/main/infra/globalShortcut/globalShortcutProvider.ts`)가 이전 키를 해제하고 새 키를 등록한다.
- 키를 누르면 창이 포커스가 없거나 숨겨져 있으면 `show()`, 아니면 `hide()`.
- 주의점: 등록이 실패하면 (다른 앱이 키를 선점) main은 `false`를 돌려주지만 renderer는 결과를 쓰지 않는다. 원본 Freeter와 같은 키를 쓰면 한쪽만 등록된다 (#20의 이유).

### Application Settings와 appConfig

출처: `[upstream, fork #20 #41 #42 #45 #62 #68 변경]`

| 경로                                                     | 역할                                                                                       |
|----------------------------------------------------------|--------------------------------------------------------------------------------------------|
| `src/renderer/base/appConfig.ts`                         | `AppConfig` 타입                                                                           |
| `src/renderer/base/state/ui.ts`                          | `createUiState().appConfig` 기본값                                                         |
| `src/renderer/application/useCases/applicationSettings/` | open, update (초안), save, close, `getMainHotkeyOptions`, `setWorkflowBarWidth` [fork #45] |
| `src/renderer/ui/components/applicationSettings/`        | 설정 모달, `WorkflowBarWidthInput` [fork #45 후속]                                         |

| 필드                                             | 기본값                       | 소비처                        | 출처                    |
|--------------------------------------------------|------------------------------|-------------------------------|-------------------------|
| `mainHotkey`                                     | `'CmdOrCtrl+Shift+Space'`    | `initMainShortcutUseCase`     | upstream, fork #20 변경 |
| `uiTheme`                                        | `'light'`                    | `UITheme`                     | upstream                |
| `memSaver.workflowInactiveAfter`                 | `-1`                         | Memory Saver                  | upstream                |
| `memSaver.activateWorkflowsOnProjectSwitch`      | `true`                       | Memory Saver                  | upstream                |
| `downloadDir`                                    | `''` (OS 기본 Downloads)     | `initDownloadDirUseCase`      | fork #41                |
| `bgColor`, `bgImage`, `bgImageMode`, `bgOpacity` | `''`, `''`, `'cover'`, `100` | `worktableViewModel`          | fork #42                |
| `workflowBarPos`, `workflowBarWidth`             | `'left'`, `200`              | `app.tsx`, `workflowSwitcher` | fork #45                |
| `telemetry.enabled`, `telemetry.idleTimeoutMs`   | `false`, `300000`            | `telemetryCollector`          | fork #62                |

- 모달 안의 변경은 초안에만 들어가고, OK (`saveApplicationSettingsUseCase`)에서 `ui.appConfig`로 반영된다. Cancel은 초안을 버린다.
- 사이드 바 너비를 바꾸는 경로: 모달 입력칸 (초안, OK 때 적용, 입력 중 문자열은 로컬 state로 들고 blur 때 클램프), 편집 모드 리사이저 드래그
  (`setWorkflowBarWidthUseCase`, `ui.appConfig`에 바로 반영).
- `telemetry.idleTimeoutMs`는 설정 UI가 없다.
- 설정 화면 공통 폼 컨트롤은 `width: 100%`다 [fork #68]
  (`src/renderer/ui/components/basic/settingsScreen/settingsScreen.module.scss`).
- 주의점: `AppConfig`에 필드를 추가하면 `createUiState`와 테스트 fixture `fixtureAppConfig`
  (`tests/renderer/base/fixtures/appConfig.ts`)에 기본값을 함께 넣는다. 최상위 필드는 로드 병합이 기본값으로 채우지만 중첩 객체 안의 새 필드는 채우지 않는다 (영속 범위
  참고). (pitfalls: 영속 상태 병합의 깊이)

### Apps (App Manager)

출처: `[upstream, fork #76 변경]`

- `App { settings: { name, execPath, cmdArgs } }` (`src/renderer/base/app.ts`). 외부 실행 파일 정의다. File Opener 위젯이
  `requiresState: ['apps']`로 읽는다 (`src/renderer/widgets/file-opener/index.ts`).
- 관리 모달 use case: `src/renderer/application/useCases/appManager/`. 프로젝트 관리와 같은 초안 패턴이다. 위젯 설정에서
  `settingsApi.dialog.showAppManager()`로도 연다.
- 상태: `entities.apps`, `ui.apps.appIds`, 초안 `ui.modalScreens.data.appManager`.
- 목록 검색과 빈 상태 안내 [fork #76] (`src/renderer/ui/components/appManager/appManagerList/appManagerList.tsx`).

### 공유 데이터 키 관리

출처: `[fork #8]`. 같은 타입 위젯 여러 개가 데이터 하나를 공유하게 하는 이름표다. 현재 `requiresState: ['sharedDataKeys']`를 선언한 위젯은 Note뿐이다.

- 엔티티: `SharedDataKey { id, widgetType, name }` (`src/renderer/base/sharedDataKey.ts`), 저장 위치 `entities.sharedDataKeys`.
- 위젯이 키를 쓰는지는 `resolveWidgetSharedKeyId(widget)` (`settings.sharedKeyId`가 비어 있지 않은 문자열인지)로 판단한다.
- 생성: 위젯 설정 화면의 `settingsApi.sharedDataKey.create(widgetType, name)` → 엔티티 추가, id 반환.
- 삭제 (`createDeleteSharedDataKeyUseCase`, `src/renderer/application/useCases/sharedDataKey/deleteSharedDataKey.ts`):
  1. 확인 대화상자를 띄운다.
  2. 공유 저장소 (main 기준 `freeter-data/shared/<widgetType>/<keyId>`)와 그 키를 쓰던 위젯의 데이터 저장소를 `clear()`한다. 완료를 기다리지 않는다 (코드
     주석).
  3. state를 다시 읽고 키 엔티티를 지운 뒤, 영향받은 위젯의 `settings.sharedKeyId`를 `null`로 바꾼다.
- 변경 알림과 위젯 쪽 동기화 (`useSharedDataChangedEffect`)는 [features-widgets.md](features-widgets.md) 참고.

### Memory Saver

출처: `[upstream]`. 오래 보지 않은 workflow를 언마운트해 메모리를 아낀다. 언마운트된 workflow는 다시 활성화될 때 새로 마운트되고, 그 안의 webview는 다시 로드된다.

| 경로                                          | 역할                                                                                                                                                                                                                                                              |
|-----------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/renderer/base/memSaver.ts`               | 설정 타입, 옵션 목록, `calcMemSaverConfig` (app → project → workflow 순으로 덮어씀), sanitize 함수                                                                                                                                                                |
| `src/renderer/application/useCases/memSaver/` | `initMemSaver`, `deactivateWorkflow`, subs (`activateWorkflow`, `activateProjectWorkflows`, `scheduleWorkflowDeactivation`, `scheduleProjectWorkflowsDeactivation`, `startDelayedWorkflowDeactivation`, `resetDelayedWorkflowDeactivation`, `deactivateWorkflow`) |

- 상태: `ui.memSaver.activeWorkflows` (`{ prjId, wflId }` 목록, 비영속), `ui.memSaver.workflowTimeouts` (workflow id →
  `setTimeout` 핸들).
- `workflowInactiveAfter`: `-1` = 프로젝트 전환 때 비활성, `0` = 프로젝트나 workflow 전환 때 비활성, 양수 = 전환 후 N분 뒤 비활성 (`delay * 60000`).
- `activateWorkflowsOnProjectSwitch`: 프로젝트로 전환할 때 그 프로젝트의 workflow를 모두 미리 활성화한다 (`workflowInactiveAfter`가 0인 workflow
  제외).
- 진입점: 앱 시작 (`initMemSaverUseCase`), 프로젝트 전환 (`setCurrentProjectSubCase`), workflow 전환 (`setCurrentWorkflowSubCase`,
  `activate = true`), workflow와 프로젝트 삭제 (`deactivateWorkflowSubCase`).
- 설정 위치: Application Settings, Project Manager의 프로젝트 설정, Workflow Settings. 하위 단계 값이 없으면 상위 값을 쓴다.
- 문서-코드 불일치: `src/renderer/base/memSaver.ts`의 `MemSaverConfig` 주석은 양수 값을 "X secs"라고 적지만, 코드
  (`startDelayedWorkflowDeactivationSubCase`의 `delay * 60000`)와 옵션 이름 (`'5 minutes'` 등)은 분 단위다.

### 사용 통계 수집과 Analytics 리포트

출처: `[fork #62 #63 #64 #65 #78 #87]`. 동의한 경우에만 로컬에 사용 기록을 남기고, 기본 브라우저의 리포트 페이지로 보여 준다. 기본값은 꺼짐이다.

| 경로                                                                                                        | 역할                                                                                                                           |
|-------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `src/common/base/telemetry.ts`                                                                              | 이벤트 타입 `TelemetryEventType`, `TelemetryEvent`, `DailyRollup`, 날짜 키 `telemetryEventsKey` (`events-YYYY-MM-DD`)          |
| `src/renderer/application/telemetry/telemetryCollector.ts`                                                  | `createTelemetryCollector`. 포커스, 활성 구간, workflow 체류, 메모리 버퍼를 가진 수집기                                        |
| `src/renderer/application/telemetry/startTelemetry.ts`                                                      | 수집 배선 (store 구독, DOM 리스너, IPC, 타이머)                                                                                |
| `src/renderer/infra/telemetry/telemetryBuffer.ts`                                                           | 일자별 파일에 append. promise 체인으로 read-modify-write 직렬화                                                                |
| `src/renderer/infra/dataStorage/telemetryDataStorage.ts`                                                    | telemetry 저장소 IPC 래퍼                                                                                                      |
| `src/renderer/application/useCases/telemetry/`                                                              | `logTelemetryActivity` (위젯 활동), `flushTelemetry`, `getTelemetryEntities` (id→이름 스냅샷)                                  |
| `src/renderer/application/useCases/analytics/openAnalytics.ts`                                              | 메뉴 동작: flush → 브라우저 열기                                                                                               |
| `src/renderer/infra/analytics/analytics.ts`, `src/renderer/infra/osActivity/osMonitoring.ts`                | `ipcOpenAnalyticsChannel`, `ipcSetOsMonitoringChannel` 호출                                                                    |
| `src/renderer/base/telemetryRollup.ts`, `telemetrySummary.ts`, `telemetryExport.ts`, `telemetryInsights.ts` | 순수 계산: 일별 집계, 요약, AI용 export 번들, 작업 블록과 집중 지표 (`telemetryInsights.ts`만 fork #87, 나머지는 fork #62 #63) |
| `src/renderer/analyticsPage/`                                                                               | 브라우저 리포트 페이지 (React, `webpack.analytics.config.js` 별도 번들) [fork #87]                                             |
| `src/main/infra/analyticsServer/analyticsServer.ts`                                                         | main의 `127.0.0.1` 임의 포트 HTTP 서버 [fork #87]                                                                              |

#### 수집

- 동의 게이트: collector의 `push`가 이벤트마다 `getConfig().enabled` (`ui.appConfig.telemetry`)를 확인한다. 꺼져 있으면 아무것도 쌓지 않는다.
- 신호와 수신 함수:

| 신호                                                                                           | collector 함수                            |
|------------------------------------------------------------------------------------------------|-------------------------------------------|
| store 구독: 현재 프로젝트와 workflow                                                           | `syncCurrent`                             |
| main의 `ipcAppFocusChangedChannel`, `visibilitychange`                                         | `onAppFocus`, `onAppBlur` (blur 때 flush) |
| DOM `keydown`, `mousedown`, `wheel`, `mousemove` (1초 throttle)                                | `onActivity` (키는 횟수만)                |
| 위젯 `widgetApi.logActivity` (`web_search`, `page_visit`, `file_open`, `todo_done`) [fork #63] | `recordActivity`                          |
| main의 `ipcOsActivityEventChannel` (`os_window`, `system_event`) [fork #64]                    | `recordActivity`                          |

- 타이머 (`startTelemetry`): heartbeat 60초 (유휴 trim, 5분 넘는 활성 구간 분할), flush 15초. `beforeunload`에서도 flush한다.
- OS 모니터: 동의 값을 구독해 `setOsMonitoring(enabled)`를 보낸다. main이 PowerShell 프로세스를 켜고 끈다 [fork #64].
- 저장: main 기준 `freeter-data/telemetry/events-YYYY-MM-DD` (일자별 JSON 배열). flush가 실패하면 배치를 `pending` 앞에 되돌린다.

#### 리포트 열기

1. View → Analytics (`CmdOrCtrl+Shift+A`) → `openAnalyticsUseCase`.
2. `flushTelemetryUseCase`가 `markActiveBoundary`로 진행 중인 활성 구간을 지금까지 마감하고 flush한다.
3. `openAnalyticsInBrowser(getTelemetryEntitiesUseCase())`가 id→이름 스냅샷을 `ipcOpenAnalyticsChannel`로 보낸다.
4. main이 서버를 띄우고 `http://127.0.0.1:<port>/<token>/`을 기본 브라우저로 연다. 실패하면 renderer가 경고 대화상자를 띄운다.

- 동의가 꺼져 있어도 열린다. 동의는 수집만 막고, 이미 쌓인 데이터를 보거나 지우는 것은 막지 않는다 (`openAnalytics.ts` 주석).

#### 리포트 페이지

- 사용자의 기본 브라우저에서 실행된다. `MainApi`가 없고, 같은 출처의 `api/events?from&to`, `api/entities`, `api/clear` (POST)만 부른다
  (`src/renderer/analyticsPage/index.tsx` 주석).
- 계산은 전부 브라우저에서 한다 (`computeDailyRollup`, `summarizeTelemetry`, `buildTelemetryExport`, `telemetryInsights.ts`의 함수). 기간
  퀵 버튼은 7일, 30일, 90일, 6개월, 1년이고, 수치마다 직전 같은 길이 기간과 비교한다.
- 서버 보안 장치 (Host 헤더 검사, 실행마다 바뀌는 토큰, CSP 등)는 CHANGES #87과 [overview.md](overview.md) 참고.
- CHANGES #62~#65, #78의 앱 내부 Analytics 모달 (`ui/components/analytics`), 관련 use case, 기간 필터는 #87에서 제거되었다.

주의점:

- `os_window` 이벤트의 `wflId`는 기록 시점에 선택돼 있던 workflow일 뿐이다. 프로젝트와 workflow 시간 배분에 쓰지 않는다 (CHANGES #87). (pitfalls:
  os_window의 wflId)
- collector는 `init.ts`에서 하나만 만들어 `startTelemetry`와 `getWidgetApiUseCase` (활동 기록)가 공유한다. widget API보다 먼저 만들어야 한다
  (`init.ts` 주석, CHANGES #63). (pitfalls: 텔레메트리 collector 인스턴스)

### 다운로드 폴더

출처: `[fork #41]`

- renderer: `initDownloadDirUseCase` (`src/renderer/application/useCases/download/initDownloadDir.ts`)가
  `appConfig.downloadDir`를 구독해 `download.setDownloadDir(dir)` (`ipcSetDownloadDirChannel`)로 보낸다. 빈 문자열이면 OS 기본 Downloads
  폴더다.
- main: 모든 세션의 `will-download`를 가로채 저장 경로를 정한다 (`src/main/infra/downloads/downloadManager.ts`).
  상세는 [overview.md](overview.md)와 CHANGES #41 참고.
- 설정 UI: Application Settings의 Download folder (Browse, Use default).

### About

출처: `[upstream, fork #1 변경]`

- use case: `openAboutUseCase`, `closeAboutUseCase` (모달 `about`, 데이터 없음), `getAboutInfoUseCase` (제품 정보 + 브라우저 버전),
  `openSponsorshipUrlUseCase` (upstream 후원 링크) (`src/renderer/application/useCases/about/`).
- 화면 (`src/renderer/ui/components/about/about.tsx`): 한국어 "포크 정보"와 원본 Freeter 후원자 목록 [fork #1].
- 후원자 데이터는 빌드 때 webpack이 주입하는 전역 `BACKERS`다 (`getBackers()`, `webpack.renderer.config.js`; 사용처
  `src/renderer/infra/productInfoProvider/productInfoProvider.ts`).

### UI 테마

출처: `[upstream, fork #43 변경]`

- 테마 id: `dark`, `light` (기본 `light`) (`src/renderer/base/uiTheme.ts`, 알 수 없는 값은 `sanitizeUiThemeId`가 기본값으로 바꿈).
- 값: `src/renderer/ui/components/app/uiTheme/themes/light.ts`, `dark.ts`의 객체. `UITheme` 컴포넌트가 키마다 `--freeter-<key>` CSS
  변수를 `document.documentElement`에 쓴다.
- 포크 변경: `widgetLayoutItemResizingOpacity` 0.5 → 0.8 [fork #43].

### 공용 hook과 기본 컴포넌트

출처: 항목별 표시

| 경로                                           | 내용                                                                                                                                                                 | 출처                                                                       |
|------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| `src/renderer/ui/hooks/appState.ts`            | `createAppStateHook`, `UseAppState` (공통 패턴 참고)                                                                                                                 | upstream                                                                   |
| `src/renderer/ui/hooks/useElementRect.ts`      | `[ref, rect, measure]`. 마운트, `window` resize, `ResizeObserver`로 재측정. 요소가 바뀌면 다시 observe한다                                                           | upstream, fork #45 후속 변경 (2026-10-05), `measure`는 fork (커밋 548a753) |
| `src/renderer/ui/hooks/useComponentMounted.ts` | 마운트 여부 ref. 재렌더를 일으키지 않는다                                                                                                                            | upstream                                                                   |
| `src/renderer/ui/hooks/useWindowSize.ts`       | 창 크기 state                                                                                                                                                        | upstream                                                                   |
| `src/renderer/ui/hooks/useWidgetTypeComp.tsx`  | 위젯 타입의 `widgetComp`, `settingsEditorComp`를 `memo`로 감싸 반환                                                                                                  | upstream                                                                   |
| `src/renderer/ui/components/basic/`            | `ActionBar`, `Button` (`iconImgSrc` [fork #21]), `InAppNote`, `ModalScreen`, `MoreInfo`, `SettingsScreen`, `SettingBlock`, `SettingRow`, `SettingActions`, `SvgIcon` | upstream, fork #21 #68 변경                                                |
| `src/renderer/helpers/event.ts`                | `Event` 클래스. `src/` 안에서 import하는 곳이 없다 (grep 기준)                                                                                                       | upstream                                                                   |

- 주의점 (`useElementRect`):
  - `ResizeObserver`는 크기 변화만 알린다. 형제 요소 삭제처럼 위치만 바뀌면 rect가 낡는다. 위치로 팝업을 띄우는 쪽은 열기 직전에 `measure()`를 부른다 (셸프 탭).
  - `measure`는 값이 같아도 새 객체로 `setRect`한다. `useComponentMounted`는 ref만 바꿔 재렌더를 일으키지 않는다. `WidgetLayout`은 마운트 직후 `measure`의
    `setRect`가 일으키는 재렌더로 실제 내용을 드러낸다. `measure`에 동등성 가드를 넣으면 이 재렌더가 사라진다 (코드 구조로 확인, 커밋 548a753).
  - `WidgetLayout`은 placeholder `<div>`에서 다른 `<div>`로 바뀐다. observer를 마운트 때 한 번만 붙이면 떨어져 나간 placeholder를 계속 본다. 그래서 매 커밋
    `ref.current`를 비교해 바뀌면 다시 observe한다 [fork #45 후속, 2026-10-05].
  - jsdom에는 `ResizeObserver`가 없어 `typeof` 가드가 있다. 테스트로는 observer 동작이 드러나지 않는다.
  - (pitfalls: useElementRect의 재측정 시점)
