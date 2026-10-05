## 함정과 제약

코드를 바꿀 때 다시 밟을 수 있는 함정만 모았다. 이미 고쳐져 재발할 수 없는 일회성 버그는 뺐다.

- 출처 표시: `[upstream]` upstream v2.8.0-beta에 있던 것, `[fork #N]` `docs/CHANGES.md` 섹션 N, `[fork]` 대응 섹션이 없는 포크 변경.
- 증상 표기: `(잠재)`는 발생 기록이 없는 위험, `(회피)`는 설계 단계에서 피한 위험이다.
- 근거의 경로는 저장소 루트 기준이다.

### 위젯 레이아웃과 격자

#### 격자 상수와 저장 좌표

- 출처: `[fork #34]`
- 증상: 격자를 16×8에서 32×16으로 바꾼 뒤 기존 위젯이 1/4 크기로 좌상단에 몰려 보였다.
- 원인: 저장된 레이아웃은 격자 단위 정수를 그대로 들고 있고, 칸 픽셀 크기는 `뷰포트 ÷ 칸 수`로 매번 다시 계산한다. 상수를 바꾸면 저장 좌표의 의미가 바뀐다. 이 변경은 마이그레이션 없이 들어갔다 (사용자
  요청).
- 규칙: `widgetLayoutVisibleCols`/`widgetLayoutVisibleRows`를 바꾸기 전에 저장 좌표 마이그레이션 여부를 먼저 정한다. 마이그레이션은 `migrateAppState`와
  `currentAppStateVersion`(현재 2)으로 한다.
- 근거: CHANGES #34, `src/renderer/base/widgetLayout.ts` `widgetLayoutVisibleCols`,
  `src/renderer/ui/components/worktable/widgetLayout/calcs.ts`

#### minSize의 이중 역할

- 출처: `[upstream, fork #17 #34 변경]`
- 증상: #34 이후 추가된 위젯 6종이 1×1로 생성되어 본문이 잘렸다 (1280×800 창에서 수십 px).
- 원인: `minSize`는 최소 크기이면서 새 위젯의 기본 크기다. `addWidgetToWorkflow`, `dropOnWorktableLayout`, `pasteWidgetToWorkflow`가 모두
  `widgetType.minSize`로 크기를 잡는다. 이미 배치된 위젯은 다음 리사이즈 때만 새 최솟값을 적용받는다.
- 규칙: 새 위젯의 `minSize`는 실제 창에서 추가해 보고 정한다. `minSize`를 바꿔도 기존 위젯 크기는 바뀌지 않는다는 전제로 설명한다.
- 근거: CHANGES #34 후속, `src/renderer/application/useCases/workflow/addWidgetToWorkflow.ts`,
  `src/renderer/application/useCases/dragDrop/dropOnWorktableLayout.ts`

#### 가로 상한과 세로 무제한

- 출처: `[fork #34]`
- 증상: 좁은 해상도에서 위젯 오른쪽이 화면 밖으로 넘쳐 액션바 (X, 설정)가 안 보였다. 넘친 위젯을 바깥으로 리사이즈하면 오히려 줄어들었다. minSize보다 작게 저장된
  위젯이 오른쪽 끝에 있으면 리사이즈가 minSize를 맞추느라 격자 밖으로 커졌다.
- 원인: 이동과 리사이즈가 하한만 클램프했다. 이후 상한을 넣으면서 `maxRight`가 음수가 되는 경우가 생겼다. 또 `deltaRight`는 `minSize.w - w`를 하한으로 두어
  minSize 성장이 상한보다 우선한다. minSize를 올리면 (CHANGES #34 후속) 이 경우가 실제로 생긴다.
- 규칙: 레이아웃 함수를 고칠 때 `_fixRect`는 `w ≤ cols`, `x ∈ [0, cols-w]`로 클램프한다. `resizeLayoutItemByEdges`의 `maxRight`는 0 이상으로 바닥
  처리하고, 원래 격자 안에 있던 항목이 minSize 성장으로 넘치면 `x`를 왼쪽으로 옮긴다. 미리보기 (`widgetLayoutItemViewModel.ts`)도 같은 규칙으로 맞추고 상한은
  `resizing.initialItemRectUnits`로 계산한다 (리사이즈 중 `x` prop은 바뀐다). `moveLayoutItem`은 x, y와 함께 `w`도 비교한다. 세로축 클램프는 넣지 않는다
  (worktable 세로 스크롤과 collision-stacking이 아래로 밀어내는 동작에 의존).
- 근거: CHANGES #34 후속, `src/renderer/base/widgetLayout.ts` `_fixRect`, `moveLayoutItem`, `resizeLayoutItemByEdges`

#### 바깥 여백 값의 이중 정의

- 출처: `[upstream, fork #34 변경]`
- 증상: 오른쪽·아래 끝에 붙은 위젯이 있으면 worktable이 휠에 1~2px씩 흔들렸다.
- 원인: 바깥 여백은 `calcs.ts`의 `layoutPadding`과 `widgetLayout.module.scss`의 `.layout-item:after` 스페이서에 따로 정의되어 있다. 한쪽만 6px에서
  4px로 바뀌었다.
- 규칙: 여백을 바꾸면 두 값을 함께 바꾼다. 두 파일에 서로를 가리키는 주석이 있다.
- 근거: CHANGES #34 후속, `src/renderer/ui/components/worktable/widgetLayout/calcs.ts` `layoutPadding`,
  `src/renderer/ui/components/worktable/widgetLayout/widgetLayout.module.scss`

#### 위젯 타일의 transform과 fixed 위치

- 출처: `[upstream 구조, fork #31]`
- 증상: 위젯 안에서 `position: fixed`로 띄운 컨텍스트 메뉴가 엉뚱한 위치에 떴다.
- 원인: 위젯 타일은 `transform: translate(...)`로 배치된다. transform 조상 아래의 `position: fixed`는 그 transform 조상을 기준으로 잡힌다.
- 규칙: 위젯 안의 팝업은 `createPortal(..., document.body)`로 띄우고 `clientX`/`clientY`로 위치를 잡는다. File Explorer는 `@pierre/trees`가 메뉴
  내부 클릭을 바깥 클릭으로 보지 않도록 포털 루트에 `data-file-tree-context-menu-root="true"`를 단다.
- 근거: CHANGES #31, `src/renderer/ui/components/worktable/widgetLayout/widgetLayoutItem.tsx`,
  `src/renderer/widgets/file-explorer/widget.tsx`

#### 팔레트 기본 목록

- 출처: `[upstream, fork #31 #79]`
- 증상: 새 위젯을 `src/renderer/widgets/index.ts`에 등록했는데 Add Widget 목록에 나오지 않았다.
- 원인: 팔레트 목록은 `createUiState()`의 `palette.widgetTypeIds` 하드코딩 배열이다. `palette`는 `createPersistentAppState`에서 영속 대상에서 빠지므로
  매 실행 이 배열이 그대로 쓰인다.
- 규칙: 새 위젯은 `widgets/index.ts`와 `palette.widgetTypeIds`에 모두 넣는다. `tests/renderer/widgets/registry.spec.ts`가 누락을 잡는다.
- 근거: CHANGES #31, #79, `src/renderer/base/state/ui.ts` `createUiState`

### 렌더링과 성능

#### useAppState의 1단계 shallow 비교

- 출처: `[upstream, fork #33]`
- 증상: `requiresState`를 선언한 위젯 (Note, File Opener)이 무관한 store 변경 (편집 모드 토글, 드래그오버, 리사이즈)마다 리렌더됐다.
- 원인: `useAppState`의 기본 동등성은 `shallow`(1단계)다. selector가 매번 새 중첩 객체를 만들면 (`createSharedState`) 항상 다르다고 판정한다.
- 규칙: 중첩 객체를 돌려주는 selector는 `useAppState.useWithCustomEq`와 전용 비교 함수를 쓴다. 비교 함수가 참조만 본다면 원천 데이터가 불변 업데이트 (내용이 바뀔 때만 새 참조)
  인지 먼저 확인한다.
- 근거: CHANGES #33, `src/renderer/ui/hooks/appState.ts` `createAppStateHook`, `src/renderer/base/state/shared.ts`
  `sharedStateEquals`

#### useElementRect의 재측정 시점

- 출처: `[upstream, fork #45 변경, fork]`
- 증상: 위젯 바를 옆으로 옮겨도 격자가 옛 치수로 남았다 (#45). 셸프 위젯을 지운 뒤 남은 탭의 팝업이 엉뚱한 x에 떴다 (커밋 548a753).
- 원인: 이 hook은 마운트, `window` resize, `ResizeObserver`(크기 변화), 요소 교체 때만 재측정한다. 형제 요소 삭제로 생기는 위치만의 이동은 감지하지 않는다.
  `WidgetLayout`은 첫 렌더의 placeholder `<div>`를 마운트 후 다른 `<div>`로 바꾼다.
- 규칙: 측정값으로 팝업을 띄우는 곳은 여는 순간 세 번째 반환값 `measure`를 호출한다 (`shelfItemViewModel.ts` 선례). `measure`에 "값이 같으면 setRect 생략" 가드를
  넣지 않는다. `useComponentMounted`는 ref만 바꾸고 리렌더를 일으키지 않으므로, `widgetLayout`은 마운트 시 `setRect(새 객체)`가 일으키는 리렌더에 기대어 내용을 그린다.
  jsdom에는 `ResizeObserver`가 없어 `typeof` 가드가 있다.
- 근거: CHANGES #45 후속, 커밋 548a753, (로컬 기록: 동등성 가드를 넣자 widgetLayout 테스트 20개가 깨졌다),
  `src/renderer/ui/hooks/useElementRect.ts`, `src/renderer/ui/hooks/useComponentMounted.ts`,
  `src/renderer/ui/components/topBar/shelf/shelfItemViewModel.ts`

#### effect deps의 배열 identity

- 출처: `[fork #22 #31]`
- 증상: 설정이 바뀌지 않았는데 File Explorer 트리가 통째로 재빌드되거나 effect가 매 렌더 다시 돌았다.
- 원인: store와 설정은 같은 내용이어도 새 배열을 줄 수 있다. 배열을 deps에 두면 identity가 바뀔 때마다 effect가 실행된다.
- 규칙: 내용 기반 원시값 (예: `pathsKey = paths.join('\n')`)이나 필요한 원소 (`urls[0]`)를 deps에 둔다.
- 근거: CHANGES #22, #31, `src/renderer/widgets/file-explorer/widget.tsx` `pathsKey`

#### 렌더마다 새로 만드는 콜백

- 출처: `[fork #26]`
- 증상: To-Do 위젯의 `updateActionBar`/`setContextMenuFactory` 등록 effect가 매 렌더 다시 실행됐다.
- 원인: hook이 매 렌더 새 `setState` 함수를 돌려줬고, 그 함수에 의존하는 콜백과 effect가 연쇄로 새로 만들어졌다. `updateActionBar`는 위젯 셸의 view-model 상태
  (`setActionBarItemsViewMode`)를 갱신하므로 재등록마다 셸 리렌더가 따라온다.
- 규칙: 위젯 API 등록 effect의 deps에 들어가는 함수는 `useCallback`으로 안정화한다. 외부 store 구독은 `useSyncExternalStore`를 쓴다.
- 근거: CHANGES #26, `src/renderer/widgets/to-do-list/todoStore.ts` `useTodoListState`,
  `src/renderer/ui/components/widget/widgetViewModel.ts`

#### 키 입력 단위의 store 쓰기

- 출처: `[fork #50]`
- 증상: (회피) Note 글자 수를 헤더 동적 타이틀로 보내면 키 입력마다 앱 store에 쓰게 된다.
- 원인: `setDynamicTitle`은 `ui.widgetDynamicTitles`를 갱신하는 store 쓰기다. store 쓰기는 구독자 selector 재실행과 저장 타이머 재설정을 부른다.
- 규칙: 키 입력 빈도로 바뀌는 값은 위젯 로컬 state에 두고 디바운스한다. Note는 textarea를 uncontrolled (`defaultValue` + ref)로 두고 카운트를 250ms 디바운스한다.
- 근거: CHANGES #50, `src/renderer/widgets/note/widget.tsx` `updateCounts`

#### 이벤트 핸들러가 읽는 렌더 상태

- 출처: `[fork #82 #83]`
- 증상: 빠른 키 입력에서 같은 값이 두 번 커밋됐다. 채우기 핸들 드래그가 실제 마우스에서만 아무 일도 안 했다. 셀 클릭 직후 수식 입력줄 타이핑이 직전 셀에 써졌다.
- 원인: 이벤트가 마지막 `setState` 커밋보다 먼저 도착하면 핸들러는 낡은 렌더 상태를 본다 (예: mouseup이 마지막 `setFillBox` 커밋보다 먼저 실행).
- 규칙: 연속 이벤트 핸들러가 읽는 상태 (draft, 선택, 채우기 범위)는 ref로 미러링하고 핸들러에서만 ref를 쓴다. 렌더 중 ref 쓰기는 lint가 막는다. jsdom의 `fireEvent`는
  `act()`로 감싸 매 이벤트마다 상태를 flush하므로 이 종류의 버그를 잡지 못한다.
- 근거: CHANGES #82, #83, `src/renderer/widgets/spreadsheet/widget.tsx`

#### 큰 표의 행 메모이제이션

- 출처: `[fork #86]`
- 증상: 윈도잉 뒤에도 방향키 한 번에 약 1,500셀이 다시 렌더됐다.
- 원인: 행 컴포넌트에 매 렌더 바뀌는 prop이 들어가면 `memo`가 무력해진다.
- 규칙: 행 컴포넌트 prop은 원시값이거나, 그 행의 겉모습이 바뀔 때만 바뀌는 값으로 한정한다. 빈 값은 공유 상수 (`NO_HINTS`, `NO_DISPLAY`)를 쓴다. 이 파일 상단 주석의 "no
  virtualisation" 문구는 현재 코드 (`OVERSCAN` 윈도잉)와 맞지 않는다.
- 근거: CHANGES #86, `src/renderer/widgets/spreadsheet/widget.tsx` `OVERSCAN`, `SheetRowProps`

#### mousedown preventDefault와 dblclick

- 출처: `[fork #84]`
- 증상: 열 경계 더블클릭 자동 맞춤이 실제 마우스에서 실행되지 않았다. 합성 `dblclick` 테스트는 통과했다.
- 원인: Chrome은 `mousedown` 기본 동작이 취소되면 뒤따르는 `dblclick`을 만들지 않는다.
- 규칙: 더블클릭을 받을 요소의 `mousedown`에서 `preventDefault()`를 부르지 않는다. 텍스트 선택 방지는 `user-select: none`으로 한다.
- 근거: CHANGES #84

### 스타일과 테마

#### 정의되지 않은 테마 변수

- 출처: `[fork #82]`
- 증상: 선택 셀 외곽선이 보이지 않았다. 빌드 오류와 경고는 없었다.
- 원인: 테마에 없는 `var(--freeter-x)`가 들어간 선언은 통째로 무효가 된다. 테마 키는 `themes/{light,dark}.ts` 객체이고 런타임에 `--freeter-<key>`로 주입된다.
- 규칙: 새 `var(--freeter-*)`는 두 테마 객체에 키가 있는지 확인한다. 폴백 형태 `var(--a, var(--b))`는 안전하다 (Calculator의 `buttonBorder`가 이 형태).
  `tests/renderer/widgets/spreadsheet/theme.spec.ts`는 spreadsheet 스타일시트 하나만 검사한다.
- 근거: CHANGES #82, `src/renderer/ui/components/app/uiTheme/themes/light.ts`,
  `tests/renderer/widgets/spreadsheet/theme.spec.ts`

#### CSS 모듈의 특이성

- 출처: `[fork #85]`
- 증상: 필터 드롭다운이 셀에 잘렸고, 텍스트 넘침 (`.spill`)도 동작하지 않았다.
- 원인: `.sheet td { overflow: hidden }`(0,1,1)이 `.menu-open { overflow: visible }`(0,1,0)보다 특이성이 높아 상태 클래스가 무시됐다.
- 규칙: 상태 클래스를 추가할 때 기존 기본 규칙의 특이성과 비교한다 (`td.menu-open`처럼 올린다). 화면에서 실제로 확인한다.
- 근거: CHANGES #85, `src/renderer/widgets/spreadsheet/widget.module.scss`

#### 상단 바 높이의 다중 정의

- 출처: `[upstream, fork #14 변경]`
- 증상: (잠재) 상단 바 높이만 바꾸면 셸프 탭과 팝업이 바와 어긋나고, 팝업의 세로 클램프 계산도 틀어진다.
- 원인: 높이 값이 여러 파일에 따로 있다. `topBar.module.scss`의 높이 48px, `shelf.module.scss`의 셸프 항목 `height: 50px` (높이 + 2)과
  `line-height: 48px`, 팝업 `top: 46px` (높이 - 2), `shelfItemViewModel.ts`의 `shelfPopupTopPx = 46`이다.
- 규칙: 상단 바 높이를 바꾸면 위 값을 모두 함께 바꾼다. #14가 60px에서 48px로 바꿀 때 이 값들을 함께 고쳤다.
- 근거: CHANGES #14, `src/renderer/ui/components/topBar/topBar.module.scss`,
  `src/renderer/ui/components/topBar/shelf/shelf.module.scss`,
  `src/renderer/ui/components/topBar/shelf/shelfItemViewModel.ts` `shelfPopupTopPx`

### 상태와 저장

#### 로드 완료 전의 store.set

- 출처: `[upstream]`
- 증상: (잠재) 시작 직후 실행되는 코드가 쓴 상태가 사라진다.
- 원인: `createStore`의 `set`은 `isLoaded`가 거짓이면 아무것도 하지 않는다. 큐에 쌓지도 않는다.
- 규칙: 초기화 코드에서 상태를 쓰려면 `appStoreReady`(renderer `init.ts`)나 `onStoreReady` 이후에 쓴다.
- 근거: `src/common/data/store.ts` `createStore`, `src/renderer/init.ts` `appStoreReady`

#### 영속 subset과 런타임 전용 필드

- 출처: `[upstream, fork #11]`
- 증상: (회피) 런타임 전용 값이 디스크에 저장되면 삭제된 위젯의 키가 계속 쌓인다.
- 원인: 영속 상태는 `createPersistentAppState`가 런타임 상태에서 필드를 destructure로 빼서 만든다. 빼지 않은 `ui` 필드는 모두 저장된다.
- 규칙: 런타임 전용 `ui` 필드를 추가하면 `createPersistentAppState`의 제외 목록에 넣고, `createUiState`와 테스트 fixture
  (`tests/renderer/base/state/fixtures/appState.ts`)에 기본값을 넣는다. 현재 제외 목록: `copy`, `dragDrop`, `editMode`, `palette`,
  `memSaver`, `modalScreens`, `worktable`, `widgetDynamicTitles`, 위젯의 `exposedApi`.
- 근거: CHANGES #11, `src/renderer/base/state/app.ts` `createPersistentAppState`

#### 영속 상태 병합의 깊이

- 출처: `[upstream]`
- 증상: (잠재) 기존 설치에서 새 필드가 `undefined`로 읽힌다.
- 원인: `mergeAppStateWithPersistentAppState`는 `ui.appConfig`, `ui.apps`, `ui.projectSwitcher`, `ui.shelf`만 한 단계 병합한다. 그래서
  `appConfig` 최상위의 새 필드는 기본값이 채워지지만 (#41, #42), 중첩 객체 안의 새 필드 (예: `appConfig.memSaver.x`)와 엔티티의 새 필드는 저장본이 통째로 덮는다.
- 규칙: 중첩 필드나 엔티티 필드를 추가하면 읽는 쪽에서 `undefined`를 허용하거나 `migrateAppState`에 단계를 추가하고 `currentAppStateVersion`을 올린다. 선례는 v2의
  `memSaver` 마이그레이션이다.
- 근거: `src/renderer/base/state/app.ts` `mergeAppStateWithPersistentAppState`, `migrateAppState`, CHANGES #41, #42

#### 영속 상태 검증 실패의 결과

- 출처: `[fork #49]`
- 증상: (잠재) 검증기가 정상 데이터를 거부하면 사용자 데이터가 기본값으로 바뀐다.
- 원인: `validatePersistentState`가 거짓이면 `loadState`가 `null`을 돌려주고 store는 기본값으로 시작한다. 이후 첫 변경에서 `saveState`가 기본값 기반 상태를
  디스크에 쓴다.
- 규칙: 검증기는 형태만 느슨하게 본다 (`isPersistentAppState`는 `entities`, `ui`가 plain object인지만 본다). 창 상태 형태를 바꾸면
  `isPersistentWindowState`(숫자 4개 + 불리언 3개)를 함께 고친다.
- 근거: CHANGES #49, `src/common/data/stateStorage.ts` `createStateStorage`, `src/main/base/state/window.ts`
  `isPersistentWindowState`

#### 위젯 설정 정규화와 저장 회귀

- 출처: `[upstream, fork #47 #67 #79 #86]`
- 증상: 열 수를 줄이고 한 글자를 치자 숨은 열 데이터가 영구 삭제될 구조였다 (#79). 기본값을 올렸는데 기존 위젯은 그대로였다 (#86). "키가 없으면 옛 위젯"이라는 추론이 자동 저장 한 번으로 무효가
  됐다 (#86).
- 원인: `initAppStateWidgets`가 매 로드마다 저장된 설정을 `createSettingsState`에 통과시키고, 결과는 다음 저장 때 디스크로 돌아간다. 설정은 인스턴스마다 저장되므로 기본값
  변경은 새 위젯에만 닿는다.
- 규칙: `createSettingsState`와 데이터 정규화 함수는 멱등이어야 하고 데이터를 잘라내지 않는다 (늘리기만 한다). 옛 형태 판별은 명시적 버전 스탬프로 한다 (spreadsheet
  `SETTINGS_VERSION`). 옛 형태 정규화 선례: web-query `entries`(#47), webpage 탭 파이프 문법 (#67).
- 근거: `src/renderer/base/state/app.ts` `initAppStateWidgets`, `src/renderer/widgets/spreadsheet/settings.tsx`
  `SETTINGS_VERSION`, `src/renderer/widgets/web-query/settings.tsx` `createSettingsState`

#### 디바운스 저장과 종료·언마운트

- 출처: `[fork #30 #40]`
- 증상: 변경 직후 앱을 닫거나 워크플로우를 바꾸면 마지막 변경이 사라졌다.
- 원인: 앱 상태는 5초, Note와 Spreadsheet는 800ms, To-Do는 500ms 디바운스로 저장한다. 위젯별 디바운스는 앱 상태 flush와 별개다. 확인된 손실 경로는 앱 종료다:
  `beforeunload` 때 대기 중인 저장이 실행되지 않으면, renderer가 닫히면서 타이머도 사라진다 (추정). 언마운트만으로는 대기 중인 저장이 사라지지 않았다 (Spreadsheet로
  확인, 타이머가 언마운트 뒤에도 실행됨). 언마운트 flush는 빠른 재마운트 때 옛 데이터를 읽는 틈을 없앤다.
- 규칙: 디바운스 저장을 쓰는 위젯은 `beforeunload` 리스너와 언마운트 cleanup에서 `flush()`를 부른다. 앱 상태 flush (`will-quit`의 `windowStore.flush`,
  `beforeunload`의 `appStore.flush`)는 쓰기를 발사만 하고 완료를 기다리지 않는다 (best-effort).
- 근거: CHANGES #30, #40 (Spreadsheet 후속 포함), `src/common/helpers/debounce.ts`, `src/renderer/widgets/note/widget.tsx`,
  `src/renderer/widgets/spreadsheet/widget.tsx`, `src/main/index.ts`

#### memSaver와 위젯 마운트 수명

- 출처: `[upstream, fork #8 #9 #40]`
- 증상: 워크플로우 전환으로 remount를 기대한 코드가 동작하지 않거나, 반대로 언마운트 때 미저장 변경이 사라진다.
- 원인: 현재 화면이 아닌 워크플로우의 언마운트 시점은 memSaver 설정 `workflowInactiveAfter`가 정한다. `-1` (기본값)은 같은 프로젝트 안에서 워크플로우를 바꿀 때 마운트를 유지하고,
  프로젝트를 바꿀 때 언마운트한다. `0`은 워크플로우나 프로젝트를 바꾸는 즉시, 양수 N은 전환 N분 뒤 언마운트한다. 마운트가 유지된 워크플로우는 `visibility: hidden`으로 숨긴다.
- 규칙: 위젯은 두 경우를 모두 처리한다. 마운트된 채로 바뀌는 데이터는 구독으로 받고, 스코프 변경은 `key`로 remount를 강제한다 (`<NoteInner key=...>`,
  `<ToDoInner key={scope}>`). 언마운트 경로에는 flush를 둔다.
- 근거: CHANGES #8, #9, `src/renderer/application/useCases/memSaver/subs/scheduleWorkflowDeactivation.ts`
  `scheduleWorkflowDeactivationSubCase`,
  `src/renderer/application/useCases/memSaver/subs/scheduleProjectWorkflowsDeactivation.ts`
  `scheduleProjectWorkflowsDeactivationSubCase`, `src/renderer/base/memSaver.ts`

#### 파일 저장 키의 변환

- 출처: `[upstream, fork #30 변경]`
- 증상: (#30 이전) 특수문자 키로 쓴 데이터가 다시 읽히지 않았다.
- 원인: `storageKeyToFilePath`는 `[A-Za-z0-9_\-()\s]` 밖의 문자를 `_`로 바꿔 파일명을 만든다. 단방향 변환이라 `a:b`와 `a/b`가 같은 파일 `a_b`가 된다.
  `getKeys`는 변환된 파일명을 돌려준다.
- 규칙: 저장 키는 허용 문자 안에서 만든다. 읽기, 쓰기, 삭제가 같은 변환을 거치는지 확인한다.
- 근거: CHANGES #30, `src/main/infra/dataStorage/fileDataStorage.ts` `storageKeyToFilePath`

#### 변경 검사 래퍼의 적용 범위

- 출처: `[upstream]`
- 증상: (잠재) 내용이 같은 앱 상태도 저장 때마다 다시 기록된다.
- 원인: `setTextOnlyIfChanged(withJson(storage))` 순서에서 `withJson`의 `setJson`은 안쪽 `setText`를 직접 부른다. 변경 검사는 바깥 `setText`
  호출에만 걸린다. `store.set`은 런타임 전용 필드 (예: `widgetDynamicTitles`)만 바뀌어도 저장 타이머를 돌린다.
- 규칙: 쓰기 횟수를 줄이려면 store 쓰기 자체를 동일값 가드로 막는다 (`setWidgetDynamicTitle`, `setWorkflowBarWidth`, `setShelfItemSize` 선례).
- 근거: `src/common/infra/dataStorage/setTextOnlyIfChanged.ts`, `src/common/infra/dataStorage/withJson.ts`,
  `src/common/data/store.ts`, `src/renderer/init.ts` `prepareDataStorageForRenderer`

#### 저장된 설정과 기본값 변경

- 출처: `[fork #20 #45]`
- 증상: 기본 단축키나 기본 위치를 바꿔도 기존 사용자에게는 반영되지 않는다.
- 원인: 저장된 `appConfig` 값이 기본값을 덮는다.
- 규칙: 기존 사용자까지 바꾸려면 마이그레이션이 필요하다. #45는 `top`을 저장한 배포판이 없다는 사실을 확인한 뒤에만 기본값을 바꿨다.
- 근거: CHANGES #20, #45, `src/renderer/base/state/ui.ts` `createUiState`

#### await 뒤의 낡은 state

- 출처: `[upstream]`
- 증상: (잠재) 확인 대화상자가 떠 있는 동안 다른 경로가 바꾼 상태가 대화상자를 닫은 뒤 되돌아간다.
- 원인: 여러 비동기 use case가 `await` 전에 `appStore.get()`으로 읽은 `state`로 `await` 뒤에 새 상태를 계산해 `set`한다. 대상은
  `createDeleteWidgetUseCase`, `createDeleteWorkflowUseCase` (확인 대화상자 뒤), `createPasteWorkflowUseCase`,
  `createPasteWidgetToWorkflowUseCase`, `createPasteWidgetToShelfUseCase`, `createDropOnWorktableLayoutUseCase`와
  `createDropOnTopBarListUseCase`의 붙여넣기 분기, `createSaveChangesInProjectManagerUseCase`의 복제 분기다. 그 사이의 변경 (동적 제목 갱신,
  Memory Saver 타이머 등)은 덮어써진다 (추정: 발생 기록 없음).
- 규칙: `await` 뒤에 상태를 쓰는 use case는 `appStore.get()`을 다시 호출해 최신 상태 위에서 계산한다. 선례는 `createDeleteSharedDataKeyUseCase`다.
- 근거: `src/renderer/application/useCases/widget/deleteWidget.ts` `createDeleteWidgetUseCase`,
  `src/renderer/application/useCases/workflow/pasteWidgetToWorkflow.ts`,
  `src/renderer/application/useCases/sharedDataKey/deleteSharedDataKey.ts`

#### 삭제 후 남는 위젯 데이터

- 출처: `[upstream]`
- 증상: 위젯, 워크플로우, 프로젝트를 지워도 `freeter-data/widgets/<widgetId>/` 폴더가 디스크에 남는다.
- 원인: `createDeleteWidgetUseCase`, `deleteWorkflowsSubCase`, `createSaveChangesInProjectManagerUseCase`는 엔티티와 배치만 지운다.
  위젯 데이터 저장소를 비우는 호출이 없다. 이유는 기록되지 않았다.
- 규칙: 삭제와 함께 데이터를 지우는 기능을 넣으려면 복사 목록 (`ui.copy.widgets`)을 함께 처리한다. 붙여넣기는 `cloneWidgetSubCase`가 원본 위젯 id의 폴더를
  `copyObjectData`로 복사하므로, 원본 폴더가 없으면 붙여넣은 위젯이 빈 데이터로 시작한다 (추정: 코드 경로에서 도출).
- 근거: `src/renderer/application/useCases/widget/deleteWidget.ts`,
  `src/renderer/application/useCases/workflow/subs/deleteWorkflows.ts`,
  `src/renderer/application/useCases/projectManager/saveChangesInProjectManager.ts`,
  `src/renderer/application/useCases/widget/subs/cloneWidget.ts`

### IPC와 보안

#### 게스트 URL의 스킴 검사

- 출처: `[fork #88]`
- 증상: (#88 이전) Webpage 위젯의 게스트 페이지가 넘긴 `file:`, `javascript:`, OS 커스텀 프로토콜 URL이 `shell.openExternal`까지 가는 코드 경로가 있었다. 위젯이 `allowpopups`를 켜므로
  `target="_blank"` 링크를 한 번 클릭하면 발생할 수 있었다 (코드 경로 기준, 실행으로 확인하지 않음).
- 원인: `sanitizeUrl`은 `new URL()`로 파싱되는지만 보고, 실패하면 `https://`를 붙여 다시 본다. 스킴은 거르지 않는다. CHANGES #13, #25는 이 함수가 비정상 프로토콜을
  막는다고 적었지만 코드와 다르다.
- 규칙: 게스트 페이지에서 온 URL (현재 주소, 링크 주소, 새 창 요청)을 OS로 넘기는 코드는 `isAllowedExternalUrl`을 통과한 URL만 넘긴다. 현재 적용 위치는
  `setWindowOpenHandler`의 새 탭 분기, `Ctrl+T` 분기, `openCurrentInBrowser`, `openLinkInBrowser`, 그리고 세션 권한 처리기 ("세션 권한 요청 처리기")다. 이 검사를
  `sanitizeUrl`이나 `openExternalUrlUseCase`로 옮기지 않는다. 그 둘은 사용자가 등록한 앱 딥링크 (Link Opener 등)도 처리한다.
- 근거: CHANGES #88, `src/common/helpers/isAllowedExternalUrl.ts`, `src/common/helpers/sanitizeUrl.ts`,
  `src/main/infra/browserWindow/browserWindow.ts`, `src/renderer/widgets/webpage/actions.ts`

#### 세션 권한 요청 처리기

- 출처: `[fork #88]`
- 증상: (#88 이전) 게스트 페이지가 같은 프레임 이동 (target 없는 `<a href="slack://...">`, `location.href` 변경)으로 앱 프로토콜을 열면, 위의 4곳을 거치지 않고 OS
  앱이 실행될 수 있었다.
- 원인: 이 이동은 세션 권한 요청 `openExternal`로 처리되고, 요청의 `externalURL`에 대상 주소가 들어 있다. 앱에는 처리기가 없었고, Electron은 처리기가 없으면 모든
  권한 요청을 자동 승인한다 (Electron 보안 문서 5번). Electron 42.3.3 숨김 창 실험 (2026-10-05)으로 일반 창과 `<webview>` 모두에서 요청이 생기는 것을 확인했다.
- 규칙: 처리기는 `registerPermissionHandler`가 기본 세션과 `session-created`로 이후의 모든 세션 (webview 파티션 포함)에 건다. 처리기는 세션마다 하나라서 다른 곳에서
  `setPermissionRequestHandler`를 다시 호출하면 이 처리기를 덮어쓴다. 권한 정책은 `shouldGrantPermission`에 모은다. `openExternal` 외의 권한 (알림, 카메라, 마이크
  등)은 지금 Electron 기본값처럼 모두 승인한다. 이 정책을 바꾸면 Webpage 위젯 안 웹앱 (화상 회의, 알림)의 동작이 바뀐다.
- 근거: CHANGES #88, `src/main/infra/permissions/permissionHandler.ts` `registerPermissionHandler`, `shouldGrantPermission`, `src/main/index.ts`,
  `src/main/infra/downloads/downloadManager.ts` (같은 세션 등록 방식)

#### preload의 removeListener

- 출처: `[upstream]`
- 증상: (잠재) IPC 리스너를 해제해도 해제되지 않는다.
- 원인: `on`은 `wrappedListener`를 WeakMap에 기록하지만 실제 등록은 별도의 새 화살표 함수로 한다. `removeListener`는 등록되지 않은 `wrappedListener`를 지운다.
  현재 renderer에 `removeListener` 호출처는 없다.
- 규칙: IPC 리스너 해제가 필요해지면 preload의 `on`이 `wrappedListener`를 등록하도록 먼저 고친다.
- 근거: `src/renderer/preload/index.ts` `wrapperByListener`

#### IPC 발신자 검증

- 출처: `[upstream]`
- 증상: (잠재) 새 채널 호출이 main에서 거부된다.
- 원인: `createIpcMainEventValidator`는 채널 접두사 `freeter:`, 발신 프레임 host `freeter-app`, 메인 프레임 여부를 검사한다. webview 게스트와 서브프레임은
  IPC를 부를 수 없다.
- 규칙: 새 채널 이름은 `src/common/ipc/channels.ts`에서 `makeIpcChannelName`으로 만든다. 게스트 페이지의 신호가 필요하면 main의 webContents 이벤트나
  `console-message` 경로를 쓴다.
- 근거: `src/main/infra/ipcMain/ipcMainEventValidator.ts`, `src/common/ipc/ipc.ts` `channelPrefix`, `makeIpcChannelName`

#### renderer CSP와 로컬 이미지

- 출처: `[upstream, fork #21 #42 변경]`
- 증상: data URI 아이콘이 CSP 위반으로 막혔다 (#21). 로컬 배경 이미지를 `file://`로 띄울 수 없었다 (#42).
- 원인: CSP의 `*`는 `data:` 스킴을 포함하지 않는다. renderer는 커스텀 프로토콜 (`freeter-file://freeter-app`) 오리진이고, 이 프로토콜은 앱 번들 파일만 서빙한다.
- 규칙: 로컬 이미지는 main이 읽어 data URL로 넘긴다 (`fsProvider.getImageDataUrl`, 20MB 상한). CSP는 `src/renderer/index.ejs`에 있고 현재
  `img-src * data:`다.
- 근거: CHANGES #21, #42, `src/renderer/index.ejs`, `src/main/infra/protocolHandler/registerAppFileProtocol.ts`

#### 외부 fetch의 상한

- 출처: `[fork #21]`
- 증상: (회피) 악성·거대 응답, HTML 에러 페이지가 아이콘으로 캐시될 수 있다.
- 원인: favicon은 임의 origin에서 받는다. HTML 에러 페이지가 `<script>`로 시작하면 초기 매직 바이트 검사가 SVG로 오판했다.
- 규칙: `iconProvider`를 고칠 때 `http:`/`https:` 화이트리스트, 256KB 상한, 4초 타임아웃, 리다이렉트 3회, 매직 바이트 MIME 판정, "첫 512바이트 안의 `<svg>`"
  SVG 판정을 유지한다. 서드파티 favicon 서비스는 쓰지 않는다 (프라이버시).
- 근거: CHANGES #21, `src/main/infra/iconProvider/iconProvider.ts`

#### Analytics 루프백 서버

- 출처: `[fork #87]`
- 증상: (회피) 방문 URL과 창 제목이 담긴 데이터가 다른 사이트나 로컬 프로세스에 노출될 수 있다.
- 원인: 브라우저 리포트가 `127.0.0.1` HTTP 서버에서 텔레메트리 원본을 읽는다.
- 규칙: 라우트를 추가해도 불변식을 유지한다. Host 헤더 정확히 일치 (아니면 403), 실행마다 바뀌는 토큰 경로 접두사 (아니면 404), CORS 미허용, 페이지 CSP,
  `Referrer-Policy: no-referrer`, 자산 이름 정규식 (`reAssetName`), `api/clear`는 POST만.
- 근거: CHANGES #87, `src/main/infra/analyticsServer/analyticsServer.ts` `handleAnalyticsRequest`

#### 데이터 URL 창에 넣는 외부 문자열

- 출처: `[fork #71]`
- 증상: (회피) 서버가 보낸 host나 realm에 HTML이 들어 있으면 로그인 창에 삽입된다.
- 원인: HTTP 인증 프롬프트는 preload 없이 data URL HTML로 만든다.
- 규칙: 외부 문자열은 `escapeHtml`을 거친다. 결과 회수는 `console-message` 마커 방식이다.
- 근거: CHANGES #71, `src/main/infra/httpAuth/httpAuth.ts` `escapeHtml`, `createLoginHandler`

### webview와 Webpage 위젯

#### webview 포커스 중의 키 입력

- 출처: `[fork #6 #24 #25 #27 #29]`
- 증상: webview에 포커스가 있으면 메뉴 accelerator (예: `Ctrl+Tab`)가 닿지 않는다.
- 원인: 게스트 페이지가 키를 먼저 소비한다.
- 규칙: 위젯 단축키는 `did-attach-webview`로 받은 게스트 webContents의 `before-input-event`에서 처리한다. 분기 순서를 지킨다: `Ctrl+Tab` → Alt 단독
  (`←`, `→`, `Home`) → `F5` → `primaryMod` 가드 → `Ctrl+T`, `Ctrl+R`, 줌. modifier 없는 키는 `primaryMod` 가드 앞에 둔다. 글자 키는
  `input.code`(`KeyT`, `KeyR`)로 비교한다. 확대는 `input.key === '+'`만 받는다 (Windows 일부 레이아웃에서 `=`가 오지 않음). `Tab` 분기는
  `!input.meta`로 macOS `Cmd+Tab`을 건드리지 않는다.
- 근거: CHANGES #6, #24, #25, #27, #29, `src/main/infra/browserWindow/browserWindow.ts`

#### 게스트 안의 휠·키 가로채기

- 출처: `[fork #24 #36]`
- 증상: `before-input-event`로는 `Ctrl+휠`을 받을 수 없다. 게스트가 포커스를 가지면 호스트는 `Ctrl+F`를 보지 못한다.
- 원인: `before-input-event`는 키보드만 지원한다.
- 규칙: `dom-ready`에서 `executeJavaScript`로 리스너를 주입하고 (`{ capture: true, passive: false }`), magic prefix `console.log`로
  신호를 보내 호스트의 `console-message`에서 받는다 (`ZOOM_WHEEL_MARKER`, `FIND_KEY_MARKER`). prefix 매치 뒤 `Number.isFinite`로 값을 검증한다.
  주입 호출에는 `.catch(() => undefined)`를 붙인다. 한계: DevTools에 마커 로그가 섞이고, 사이트 자체의 `Ctrl+휠` 기능은 먹히지 않는다.
- 근거: CHANGES #24, #36, `src/renderer/widgets/webpage/widget.tsx`

#### getWebContentsId 호출 시점

- 출처: `[fork #24]`
- 증상: attach 이전에 호출하면 예외가 난다.
- 원인: webview가 아직 게스트 webContents에 붙지 않았다.
- 규칙: `webviewIsReady`(dom-ready 이후)로 가드하고 try/catch로 한 번 더 감싼다. id는 한 번 읽어 클로저에 보관한다.
- 근거: CHANGES #24, `src/renderer/widgets/webpage/widget.tsx`

#### 여러 Webpage 위젯과 이벤트 라우팅

- 출처: `[fork #24 #27]`
- 증상: (회피) 한 위젯의 단축키가 다른 위젯에 적용된다.
- 원인: main→renderer 신호는 `window` CustomEvent로 재발행되어 모든 Webpage 위젯이 받는다.
- 규칙: main은 `wc.id`를 함께 보내고 (`ipcZoomWebpageChannel`, `ipcGoHomeWebpageChannel`), 위젯은 자기 `getWebContentsId()`와 같을 때만
  처리한다. 이벤트 이름과 detail 타입은 `zoomEvents.ts`, `homeEvents.ts`에 모은다.
- 근거: CHANGES #24, #27, `src/renderer/init.ts`, `src/renderer/widgets/webpage/zoomEvents.ts`

#### webview 숨기기

- 출처: `[upstream, fork #67]`
- 증상: (회피) 숨긴 webview가 언로드되어 스크롤, 입력, 로그인 상태를 잃는다.
- 원인: `display: none`은 Electron `<webview>`를 언로드시키는 것으로 알려져 있다 (CHANGES #67 기록).
- 규칙: `visibility: hidden` + absolute 겹치기로 숨기고 `inert`로 상호작용을 막는다. upstream이 비활성 워크플로우를 숨기는 방식 (`visibility`)과 같은 계약이다.
- 근거: CHANGES #67, `src/renderer/widgets/webpage/widget.tsx`,
  `src/renderer/ui/components/worktable/widgetLayout/widgetLayout.module.scss`

#### 앱 레이아웃 트리 변경과 webview 리로드

- 출처: `[fork #45]`
- 증상: (회피) 워크플로우 바 위치를 바꿀 때 Worktable이 다시 만들어지면 모든 webview 위젯이 새로고침된다.
- 원인: React는 부모 트리의 구조나 자식 위치가 바뀌면 하위 컴포넌트를 언마운트하고 새로 만든다. 다시 마운트된 webview는 페이지를 처음부터 로드한다.
- 규칙: `app.tsx`의 `.body-layout`은 `[WorkflowSwitcher, 리사이저 자리, 본문]`을 고정 순서로 둔다. 위치는 CSS `flex-direction`으로만 바꾸고, 쓰지 않는
  리사이저 자리는 `false`로 둔다. Worktable 위쪽 트리를 조건부로 바꾸는 변경은 같은 문제를 다시 만든다.
- 근거: CHANGES #45, `src/renderer/ui/components/app/app.tsx` (주석)

#### 드래그 중 webview의 마우스 이벤트

- 출처: `[fork #45 #48]`
- 증상: 리사이저를 끄는 커서가 webview 위를 지나면 드래그가 멈췄다. 드래그 중 `Alt+Tab`으로 포커스가 빠지면 버튼을 뗀 뒤에도 너비가 커서를 따라갔다.
- 원인: webview가 `mousemove`/`mouseup`을 삼킨다. 포커스를 잃으면 `mouseup`이 오지 않는다.
- 규칙: 드래그 중에는 전체 화면 투명 오버레이 (`.resize-overlay`)를 띄운다. `mousemove`에서 `buttons`에 왼쪽 버튼이 없으면 끝내고, `window` `blur`에도 끝낸다.
  언마운트 cleanup에서 `window` 리스너를 해제한다.
- 근거: CHANGES #45 후속, #48, `src/renderer/ui/components/app/app.tsx`,
  `src/renderer/ui/components/topBar/shelf/shelfItem.tsx`

#### 탭과 세션 파티션

- 출처: `[fork #67]`
- 증상: 같은 URL을 두 탭에 등록하면 한 탭의 이동을 다른 탭이 따라갔다.
- 원인: 한 위젯의 탭들은 위젯 설정 `sessionScope`(`app`/`prj`/`wfl`/`wgt`, 기본 `prj`)가 정한 같은 파티션을 쓴다. 같은 파티션의 같은 origin 게스트끼리
  SharedWorker/BroadcastChannel을 공유한다.
- 규칙: 중복 URL 탭에만 파티션 접미사 (`:dup1`, `:dup2`…)를 붙인다. 첫 등장 탭의 파티션 문자열은 바꾸지 않는다 (기존 로그인 유지). 탭 정보 (`tabInfos`)의 키는 탭 키다 (URL
  키를 쓰면 중복 탭끼리 타이틀·파비콘·음소거 아이콘을 덮어쓴다).
- 근거: CHANGES #67, `src/renderer/widgets/webpage/widget.tsx` `partitionSuffix`,
  `src/renderer/widgets/webpage/settings.tsx` `sessionScope`

#### 위젯 단위 API와 다중 탭

- 출처: `[fork #67]`
- 증상: 탭 여러 개가 동시에 마운트되면 액션바, 컨텍스트 메뉴, `exposeApi`, 동적 타이틀을 서로 덮어쓴다.
- 원인: 이 API들은 위젯 단위로 하나뿐이다. 탭 전환 때 비활성 탭의 cleanup (`setDynamicTitle(null)`)이 새 활성 탭의 발행 뒤에 실행될 수 있다.
- 규칙: 활성 탭에만 실제 `widgetApi`를 주고 비활성 탭에는 no-op API를 준다. 다중 탭 모드의 동적 타이틀은 부모 (`WidgetComp`)가 `onTabInfo` 보고를 받아 단독으로 발행한다.
- 근거: CHANGES #67, #69, `src/renderer/widgets/webpage/widget.tsx`

#### 새 창 요청의 분기

- 출처: `[fork #13]`
- 증상: (#3) 새 탭 링크를 현재 webview에 덮어 위젯 히스토리가 꼬였다. (#13 초기안) 모든 요청을 외부로 보내 OAuth 팝업이 깨졌다.
- 원인: OAuth 팝업은 `window.opener.postMessage`로 결과를 돌려주며, opener 참조는 같은 Electron 프로세스 안에서만 유효하다.
- 규칙: `setWindowOpenHandler`의 판정을 유지한다. 코드의 판정식은 `disposition === 'new-window' || /\bpopup\b/i.test(features)`이고, 참이면 내부
  팝업, 거짓이면 외부 브라우저다. 같은 프레임 이동은 이 핸들러를 거치지 않는다.
- 근거: CHANGES #3, #13, `src/main/infra/browserWindow/browserWindow.ts` `rePopupFeatures`

#### did-fail-load 필터

- 출처: `[fork #38]`
- 증상: (회피) 깨진 iframe 하나나 사용자 중단에도 오버레이가 위젯 전체를 가린다.
- 원인: `did-fail-load`는 서브프레임과 `ERR_ABORTED`(-3)에서도 발생한다.
- 규칙: `e.isMainFrame && e.errorCode !== -3`일 때만 실패로 본다.
- 근거: CHANGES #38, `src/renderer/widgets/webpage/widget.tsx` `handleDidFailLoad`

#### User Agent와 Google 예외

- 출처: `[upstream, fork #7 변경]`
- 증상: 앱 이름 토큰이 남은 UA에서 일부 사이트가 영구 세션을 주지 않았다.
- 원인: Electron 기본 UA에는 `Freeter-SWH/...` 토큰이 들어 있다.
- 규칙: `app.userAgentFallback`은 `process.versions.chrome` 메이저로 만든 순수 Chrome UA다. 원본 UA가 필요한 사이트는
  `reUrlsRequiringOriginalUA`(현재 Google 도메인)에 추가한다.
- 근거: CHANGES #7, `src/main/index.ts`, `src/main/infra/browserWindow/browserWindow.ts` `reUrlsRequiringOriginalUA`

#### 사용자 JS 실행

- 출처: `[fork #69 #70]`
- 증상: 사용자 Inject JS의 문법 오류가 unhandled rejection으로 샜다.
- 원인: `executeJavaScript`는 실패 시 reject한다.
- 규칙: 사용자 JS나 주입 스크립트를 실행하는 모든 `executeJavaScript` 호출에 `.catch`를 붙인다.
- 근거: CHANGES #69 후속, #70, `src/renderer/widgets/webpage/widget.tsx`

### 단축키와 포커스

#### 워크플로우 전환 단축키의 두 경로

- 출처: `[fork #6]`
- 증상: (회피) webview에 포커스가 있으면 `Ctrl+Tab`이 동작하지 않는다.
- 원인: 메뉴 accelerator는 호스트 포커스일 때만 닿는다.
- 규칙: 메뉴 accelerator (`initAppMenu.ts`)와 webview `before-input-event` → `ipcSwitchWorkflowByOffsetChannel` 두 경로를 함께
  유지한다. 둘 다 `switchWorkflowByOffsetUseCase`로 모인다.
- 근거: CHANGES #6, `src/renderer/application/useCases/workflowSwitcher/switchWorkflowByOffset.ts`

#### 마우스 사이드 버튼

- 출처: `[fork #4]`
- 증상: 키보드 포커스 기준으로 처리하면 이전 위젯의 webview가 뒤로 갔다.
- 원인: 위젯 전환 뒤에도 키보드 포커스가 이전 webview에 남는 경우가 많다. 일부 Windows 드라이버는 `WM_APPCOMMAND`를 만들지 않는다.
- 규칙: 대상은 커서 아래 webview다 (`elementFromPoint`). 이벤트는 `app-command`와 `hookWindowMessage(WM_XBUTTONUP)` 두 경로로 받는다.
- 근거: CHANGES #4, `src/main/infra/browserWindow/browserWindow.ts`

#### IME 조합 입력

- 출처: `[fork #31]`
- 증상: File Explorer 검색창에서 한글 입력이 매 글자 재필터로 깨질 수 있다.
- 원인: `@pierre/trees`(beta)의 검색·이름변경 입력이 `isComposing`을 가드하지 않는다.
- 규칙: 이 라이브러리 입력에 한글 지원을 기대하는 기능을 얹지 않는다. 자체 검색창은 보류 과제다.
- 근거: CHANGES #31

### 위젯 간 공유 데이터 동기화

#### widgetApi 메모이제이션

- 출처: `[upstream, fork #8 변경]`
- 증상: 위젯 설정의 `sharedKeyId`를 바꿔도 이전 저장소를 계속 썼다.
- 원인: `widgetApi`는 `widgetViewModel`의 `useMemo`(deps: `env.isPreview`, `maximizeAction`, `widget.id`,
  `widgetType?.maximizable`, `widgetType?.requiresApi`)로 고정된다. 설정 변경으로는 다시 만들어지지 않는다.
- 규칙: 설정에 따라 달라지는 동작은 호출 시점에 상태를 읽는다. `dataStorage` 모듈은 `getStorage()`가 매 호출마다 공유 키와 To-Do 스코프를 다시 판정한다.
- 근거: CHANGES #8, `src/renderer/ui/components/widget/widgetViewModel.ts`,
  `src/renderer/application/useCases/widget/getWidgetApi.ts` `getStorage`

#### 두 가지 라이브 동기화 방식

- 출처: `[fork #10 #26]`
- 증상: (#26 이전) To-Do의 IPC 체인 동기화가 조용히 끊겼다.
- 원인: 라이브 동기화가 IPC broadcast → `window` CustomEvent → 리스너 → 재읽기의 여러 단계를 거쳤다.
- 규칙: Note는 IPC broadcast + `useSharedDataChangedEffect`를 쓰고, To-Do는 renderer 안 in-memory store (`todoStore.ts`,
  `useSyncExternalStore`)를 쓴다. Note가 쓰므로 `ipcSharedDataChangedChannel`, `init.ts` 재발행, main broadcast는 지우지 않는다. 첫 디스크
  로드는 `await` 뒤에 store가 이미 채워졌는지 다시 확인한다 (경합 가드). To-Do 디스크 저장은 스코프별 하나의 saver (`getOrCreateTodoListSaver`)로 모은다.
- 근거: CHANGES #10, #26, `src/renderer/widgets/sharedDataSync.ts`, `src/renderer/widgets/to-do-list/todoStore.ts`,
  `src/renderer/widgets/to-do-list/widget.tsx`

#### 자기 에코와 포커스 중 변경

- 출처: `[fork #8 #39]`
- 증상: 커서만 있어도 다른 노트의 변경을 버려 옛 내용이 남았다. 마크다운 모드에서는 외부 변경이 화면에 보이지 않았다.
- 원인: 같은 창의 위젯들은 발신자를 구분할 수 없다. 마크다운 모드에서 화면에 보이는 요소는 TinyMDE contenteditable이다. 숨은 textarea 값을 바꿔도 화면은 바뀌지 않는다.
- 규칙: 포커스 중 도착한 변경은 보류 플래그 (`pendingReload`)만 세우고, blur에서 대기 저장을 flush한 뒤 반영한다. 마크다운 모드는 `editor.setContent()`로 갱신하고 포커스
  판정은 `editor.e` 기준으로 한다.
- 근거: CHANGES #39, `src/renderer/widgets/note/widget.tsx`

#### uncontrolled 입력의 외부 갱신

- 출처: `[fork #8]`
- 증상: 다시 읽은 내용이 화면에 반영되지 않았다.
- 원인: `defaultValue`는 마운트 때만 적용된다.
- 규칙: uncontrolled 입력은 `ref.current.value`에 직접 쓴다. 스코프가 바뀌면 `key`로 remount한다.
- 근거: CHANGES #8, `src/renderer/widgets/note/widget.tsx`

### Widget API와 위젯 계약

#### requiresApi 누락

- 출처: `[upstream, fork #28 #60]`
- 증상: (#28) 테스트의 `widgetApi` mock에 `process`가 없어 `getProcessInfo()` 호출이 깨졌다. (잠재) 런타임에서도 선언하지 않은 모듈은 `undefined`이고 타입
  검사는 이를 잡지 못한다.
- 원인: `createWidgetApiFactory`는 `requiresApi`에 적힌 모듈만 만들고 결과를 `as WidgetApi`로 캐스팅한다.
- 규칙: 새 모듈을 쓰면 위젯 `index.ts`의 `requiresApi`에 넣는다. 새 capability를 추가하면 `tests/renderer/widgets/setupSut.tsx`와
  `getWidgetApi.spec.ts`의 mock에도 넣는다.
- 근거: CHANGES #28, #60, `src/renderer/base/widgetApi.ts` `createWidgetApiFactory`

#### 미리보기 분기

- 출처: `[upstream, fork #11 #63 #67 변경]`
- 증상: (회피) 팔레트 미리보기 위젯이 실제 store와 텔레메트리에 쓴다.
- 원인: 미리보기도 같은 위젯 컴포넌트를 렌더한다.
- 규칙: `WidgetApiCommon`에 메서드를 추가하면 `_createWidgetApiFactory`의 `forPreview` 분기에 no-op을 함께 넣는다 (`updateActionBar`,
  `setHeaderTabs`, `setContextMenuFactory`, `exposeApi`, `setDynamicTitle`, `logActivity` 선례).
- 근거: CHANGES #11, #63, `src/renderer/application/useCases/widget/getWidgetApi.ts`

#### 액션바와 컨텍스트 메뉴의 라벨 공유

- 출처: `[fork #28]`
- 증상: (회피) 액션바 툴팁용 단축키 표기가 우클릭 메뉴에도 섞인다.
- 원인: `labelGoBack` 등 라벨 상수를 `actionBar.ts`와 `contextMenu.ts`가 함께 import한다.
- 규칙: 단축키 힌트는 액션바 `title` 조립 시점에만 `withKeys()`로 붙인다.
- 근거: CHANGES #28, `src/renderer/widgets/webpage/actionBar.ts` `withKeys`

#### 위젯 이름 표시 우선순위

- 출처: `[upstream, fork #11 #16 #22 변경]`
- 증상: (회피) 자동 타이틀이 사용자가 지은 이름을 덮는다.
- 원인: 새 위젯의 이름은 빈 문자열이고 (#16), 헤더 이름은 여러 출처에서 온다.
- 규칙: 표시 순서는 `coreSettings.name`(비어 있지 않을 때) → 동적 타이틀 → 위젯 타입 이름이다. 붙여넣기는 여전히 `generateWidgetName`으로 `... Copy N` 이름을
  만든다.
- 근거: CHANGES #11, #16, `src/renderer/ui/components/widget/widgetViewModel.ts`

#### 텔레메트리 collector 인스턴스

- 출처: `[fork #62 #63 #64]`
- 증상: (회피) 위젯 활동과 앱 리스너가 다른 버퍼에 쌓여 flush가 어긋난다.
- 원인: 활동은 `startTelemetry`와 `widgetApi.logActivity` 양쪽에서 기록된다.
- 규칙: collector는 `init.ts`에서 한 번 만들고 `createGetWidgetApiUseCase`보다 먼저 만든다. 새 이벤트도 collector를 거쳐 동의 게이트
  (`getConfig().enabled`)를 통과시킨다. main의 OS 모니터는 신호만 보내고 기록은 renderer가 동의를 확인한 뒤 한다.
- 근거: CHANGES #63, #64, `src/renderer/init.ts`, `src/renderer/application/telemetry/telemetryCollector.ts`

#### os_window의 wflId

- 출처: `[fork #87]`
- 증상: (회피) 다른 앱 사용 시간이 엉뚱한 워크플로우로 배분된다.
- 원인: `os_window` 이벤트의 `wflId`는 기록 시점에 Freeter에서 선택돼 있던 워크플로우일 뿐이다.
- 규칙: 워크플로우 배분은 rollup의 `perWorkflowMs`(Freeter 체류)만 쓴다.
- 근거: CHANGES #87, `src/renderer/base/telemetryInsights.ts`

### 빌드, 의존성, 테스트

#### Yarn 유지와 upstream 병합

- 출처: `[fork]`
- 증상: upstream v2.8.0-beta가 npm으로 전환해 병합 때 패키지 관리자 충돌이 난다.
- 원인: upstream이 `yarn.lock`을 지우고 `package-lock.json`과 npm 스크립트·CI로 바꿨다 (커밋 9a3f215).
- 규칙: upstream의 의존성 버전만 받고 `yarn install`로 `yarn.lock`을 다시 만든다. `package-lock.json`은 지운다. `.github/workflows/*`와
  `package.json` scripts는 포크 쪽 (Yarn)을 유지한다. 2.8 병합 커밋 0ebf9ac가 선례다.
- 근거: 커밋 9a3f215, 커밋 0ebf9ac 메시지, `CLAUDE.md`

#### upstream 2.8 이후의 코드 규약

- 출처: `[upstream 2.8]`
- 증상: 옛 패턴으로 쓴 코드가 테스트나 lint에서 실패하거나 경고를 낸다.
- 원인: 2.8의 의존성 업그레이드 (Jest 30, eslint-plugin-react-hooks 7 등)와 코드 정리가 들어왔다.
- 규칙: SCSS 모듈은 default import (`import styles from ...`)로 쓴다. Jest 30에는 `toBeCalled*` 별칭이 없으므로 `toHaveBeenCalled*`를 쓴다.
  `react-hooks/set-state-in-effect`, `react-hooks/refs`는 `src/renderer/eslint.config.mjs`에서 warn으로 낮춰 두었다 (포크 위젯의 의도된 패턴
  때문, 재검토 과제).
- 근거: 커밋 0ebf9ac 메시지, `src/renderer/eslint.config.mjs`

#### ESM 전용 패키지와 Jest

- 출처: `[fork #31]`
- 증상: `@pierre/trees`를 Jest (CJS)가 읽지 못했다. 전역 `customExportConditions`로 풀자 다른 ESM 의존성이 연쇄로 깨졌다. `jest.requireMock`으로
  mock에 접근하자 automock이 되어 값이 `undefined`였다.
- 원인: 패키지가 ESM 전용이다.
- 규칙: Renderer Jest 프로젝트의 `moduleNameMapper`에서만 수동 mock (`tests/__mocks__/pierreTrees*.js`)으로 매핑한다. 스펙에서는 일반 `import`로
  같은 mock 인스턴스를 받는다.
- 근거: CHANGES #31, `jest.config.js`

#### Electron 전용 모듈과 Jest

- 출처: `[fork #30]`
- 증상: `fileDataStorage` 테스트에서 `node:original-fs`를 로드할 수 없다.
- 원인: Electron 전용 모듈이다.
- 규칙: `jest.mock('node:original-fs', () => jest.requireActual('node:fs'), { virtual: true })`로 우회한다. lint의
  `no-require-imports` 때문에 `require` 대신 `jest.requireActual`을 쓴다.
- 근거: CHANGES #30, `src/main/infra/dataStorage/fileDataStorage.ts`

#### 테스트 tsconfig의 와일드카드 paths

- 출처: `[fork #79]`
- 증상: 실제로 있는 패키지 CSS를 `.tsx`에서 import하자 TS2307/TS2882가 났다.
- 원인: `tests/renderer/tsconfig.json`의 `paths`에 `"*": ["../../*"]`가 있어 모든 bare specifier가 저장소 루트로 매핑된다.
- 규칙: 서드파티 CSS는 위젯 SCSS 안에서 `:global { @import ... }`로 가져온다.
- 근거: CHANGES #79, `tests/renderer/tsconfig.json`

#### jsdom의 한계

- 출처: `[fork #45 #79 #81 #82 #83 #86]`
- 증상: 레이아웃, 좌표, 이벤트 순서 버그가 테스트를 통과한 채 실제 앱에서 드러났다.
- 원인: jsdom에는 레이아웃과 `ResizeObserver`가 없다. `fireEvent`는 `act()`로 감싸 매 이벤트마다 상태를 flush한다.
- 규칙: 레이아웃·좌표·마우스 순서에 걸린 변경은 실제 앱이나 브라우저 하네스에서 확인한다. 회귀 테스트는 수정을 일부러 되돌려 실패하는지 확인한다 (#79, #81). 자동화 브라우저의 백그라운드 탭은 타이머가
  1초로 클램프되므로 거기서 잰 지연 값은 믿지 않는다 (#86 관찰 기록).
- 근거: CHANGES #45, #79, #81, #82, #83, #86

#### 모듈 스코프 상태와 테스트 격리

- 출처: `[fork #26]`
- 증상: 같은 spec 파일 안에서 테스트 간 상태가 샜다.
- 원인: `todoStore.ts`의 상태가 모듈 스코프 `Map`이다.
- 규칙: 모듈 스코프 store에는 reset 함수를 export하고 `beforeEach`에서 부른다 (`resetTodoListStore`).
- 근거: CHANGES #26, `src/renderer/widgets/to-do-list/todoStore.ts` `resetTodoListStore`

### 플랫폼

#### Windows 경로의 대소문자

- 출처: `[fork #80]`
- 증상: 설치판이 떠 있으면 개발판이 창도 못 띄우고 종료됐다.
- 원인: 비패키지 Electron은 `userData`를 `package.json` `name`(`freeter-swh`)에서, 설치판은 productName (`Freeter-SWH`)에서 만든다. Windows
  경로는 대소문자를 구분하지 않아 같은 폴더와 같은 단일 인스턴스 잠금을 쓴다.
- 규칙: 개발 실행은 `freeter-swh-dev`를 쓴다. 판별은 `app.isPackaged`로 한다 (`yarn prod:run`도 개발 실행). 순서는 `setPath('userData')` →
  `requestSingleInstanceLock()`이고, `setName`은 `setPath` 뒤다. 설치판 경로는 바꾸지 않는다. 개발판 창 제목은 `page-title-updated`를 막아 고정한다.
- 근거: CHANGES #80, `src/main/index.ts` `dataDirName`, `src/main/infra/browserWindow/browserWindow.ts`

#### 앱 데이터 폴더의 위치

- 출처: `[fork #1 #80]`
- 증상: upstream 경로 (`<appData>/freeter2/freeter-data`)나 잘못된 원본 경로가 문서에 남아 있던 적이 있다 (`CLAUDE.md`, CHANGES #1, 2026-10-05에 정정).
- 원인: 앱 데이터는 `join(app.getPath('appData'), dataDirName, 'freeter-data')`로 만든다. 설치판은
  `<appData>/freeter-swh/freeter-data`, 개발 실행은 `<appData>/freeter-swh-dev/freeter-data`다. Electron `userData`(세션, 잠금)와는
  별개 경로다.
- 규칙: 경로는 `src/main/index.ts`의 `dataDirName`과 `appDataDir`을 기준으로 적는다.
- 근거: CHANGES #1, #80, `src/main/index.ts` `appDataDir`

#### 자식 프로세스 정리

- 출처: `[fork #64]`
- 증상: (회피) 크래시나 강제 종료 뒤 PowerShell 프로세스가 남는다.
- 원인: Windows에는 부모 종료 시그널이 없다.
- 규칙: 장수 자식 프로세스는 `will-quit`에서 stop하고, `process.once('exit')`에서 kill하고, 스크립트 안에서 부모 PID를 감시해 스스로 끝내게 한다. 동의가 꺼져 있으면
  PowerShell을 띄우지 않는다.
- 근거: CHANGES #64, `src/main/infra/osActivity/foregroundWindow.ts`, `src/main/index.ts`

#### 경로 구분자

- 출처: `[fork #22 #31 #37]`
- 증상: (회피) Windows 경로에서 basename, 부모 경로, 트리 중첩이 깨진다.
- 원인: Windows는 `\`와 드라이브 문자를 쓴다. `@pierre/trees`는 POSIX 경로 문자열과 후행 `/`로 디렉터리를 식별한다.
- 규칙: 경로 분해는 `/[/\\]/`로 두 구분자를 모두 처리한다. 트리 키는 이름 기반 상대 POSIX 경로로 만들고 `key → 절대경로` Map으로 되돌린다.
- 근거: CHANGES #22, #31, #37, `src/renderer/widgets/file-explorer/treeModel.ts`

#### 숨김 파일 판정

- 출처: `[fork #32]`
- 증상: Windows에서 숨김 속성만 걸린 파일이 계속 보인다.
- 원인: 판정 기준이 "이름이 `.`로 시작"뿐이다. 숨김 속성을 읽으려면 네이티브 바인딩이 필요해 의도적으로 뺐다.
- 규칙: 이 한계를 바꾸려면 의존성 추가 결정이 먼저다.
- 근거: CHANGES #32, `src/main/infra/fsProvider/fsProvider.ts`

#### 크로스플랫폼 스크립트

- 출처: `[fork #2]`
- 증상: upstream `dev:run`이 Windows에서 `sleep` 명령 오류로 Electron을 띄우지 못했다.
- 원인: Unix 명령에 의존했다.
- 규칙: `package.json` scripts에는 플랫폼 중립 도구 (`cross-env`, `rimraf`, `copyfiles`, nodemon `--delay`)를 쓴다.
- 근거: CHANGES #2, `package.json` `dev:run`
