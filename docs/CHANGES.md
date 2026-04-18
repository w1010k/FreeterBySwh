# Fork 이후 변경사항

원본 [FreeterApp/Freeter](https://github.com/FreeterApp/Freeter) (마지막 upstream 태그 `v2.7.1-beta`) 이후 이 포크에서 추가/변경한 내용 정리.

기준 시점: `v2.7.1-beta` (upstream 마지막 태그) 이후.

---

## 1. 앱 아이덴티티 분리 — 원본 Freeter와 공존 가능하게

원본 Freeter 앱과 동시에 설치·실행 가능하도록 식별자·이름·데이터 경로를 분리.

| 항목 | 원본 | 이 포크 |
|---|---|---|
| `appId` (electron-builder) | `io.freeter.app` | `io.freeter.app.swh` |
| `productName` | `Freeter` | `Freeter-SWH` |
| `package.json` `name` | `freeter` | `freeter-swh` |
| 사용자 데이터 폴더 | `<appData>/freeter/freeter-data` | `<appData>/freeter-swh/freeter-data` |
| 윈도우 타이틀 (HTML) | `Freeter` | `Freeter-SWH` |
| 시스템 트레이 툴팁 | `Freeter` | `Freeter-SWH` |
| 다이얼로그 타이틀 | `Freeter` | `Freeter-SWH` |
| Electron 윈도우 `title` (메인·팝업) | `Freeter` | `Freeter-SWH` |
| macOS 앱 메뉴 라벨 | `Freeter` | `Freeter-SWH` |
| About 모달 (타이틀·앱 이름 헤딩) | `Freeter` / `About Freeter` | `Freeter-SWH` / `About Freeter-SWH` |

**왜**: 원본 앱을 덮어쓰거나 설정을 공유하지 않도록. `appId`가 달라서 `app.requestSingleInstanceLock()`도 자동 분리됨. 트레이·윈도우·메뉴에 원본 이름이 남아있으면 두 앱 동시 실행 시 어느 쪽이 내 포크인지 구분 불가 → OS 표면에 드러나는 아이덴티티 라벨 일괄 교체.

**그대로 둔 곳** (프로덕트 설명 문구): `applicationSettings` / `workflowSettings` / `projectManagerSettings`의 `moreInfo` 문자열("Freeter frees up memory..."), About 모달 본문의 스폰서십 설명. 이건 오픈소스 프로젝트 자체를 서술하는 산문이라 `Freeter-SWH`로 치환하면 오히려 어색 (이 포크 자체가 별도 프로젝트가 아니라 upstream의 파생이라는 맥락 유지).

**수정 파일**: `electron-builder.config.js`, `package.json`, `src/main/index.ts`, `webpack.renderer.config.js`, `src/main/infra/trayProvider/trayProvider.ts`, `src/main/infra/dialogProvider/dialogProvider.ts`, `src/main/infra/browserWindow/browserWindow.ts`, `src/renderer/application/useCases/appMenu/initAppMenu.ts`, `src/renderer/ui/components/about/about.tsx`

남은 브랜딩 TODO: 아이콘(`resources/{win32,darwin,linux}/`), 기본 글로벌 단축키(원본 Freeter와 동시 실행 시 `Ctrl/Cmd+Shift+F` 충돌).

---

## 2. 빌드 / 런타임 업그레이드

### Electron 36 → 41

| 구성 요소 | Before | After |
|---|---|---|
| Electron | 36.4.0 | **41.2.1** |
| 내장 Chromium | 136 | **146** |
| 내장 Node | 22.15 | 24.14 |

**왜**: Webpage 위젯이 Electron에 번들된 Chromium을 쓰기 때문에 Chromium을 최신으로 올리려면 Electron 메이저 업 필요. 최신 웹사이트 호환성·보안 개선.

**타입·테스트 무변경 통과**: Electron 36→41 구간의 API 시그니처 변경이 이 코드베이스엔 영향 없었음 (1354 tests pass).

**수정 파일**: `package.json`

### `yarn dev` 크로스플랫폼 수정

원본의 `dev:run` 스크립트가 Unix `sleep` 명령에 의존해서 Windows에서 실행 시 `sleep이 내부 또는 외부 명령이 아닙니다` 오류로 Electron이 뜨지 않음.

```diff
- "dev:run": "... nodemon --on-change-only --watch build/main.js --exec \"sleep 3 && electron ./build/main.js\""
+ "dev:run": "... nodemon --on-change-only --delay 3 --watch build/main.js --exec \"electron ./build/main.js\""
```

nodemon 내장 `--delay` 옵션으로 동일 효과 + 크로스플랫폼. 원본이 Mac/Linux 기반이라 남아있던 흔적.

**수정 파일**: `package.json`

---

## 3. Webpage 위젯 — 링크·팝업 동작 개선

원본 동작: 웹페이지 위젯 내부에서 `target="_blank"` 링크 클릭하거나 `window.open()` 호출되면 **무조건 Freeter 팝업 창**이 새로 뜸. 단일 탭 브라우저처럼 쓰고 싶은 사용자에겐 번거로움.

개선된 동작 — 링크 종류별로 분기:

| 링크 종류 | 실제 브라우저에서 | 이 포크에서 |
|---|---|---|
| 일반 `<a href>` | 현재 탭 이동 | 현재 webview 이동 (Chromium 기본) |
| `<a target="_blank">` | 새 탭 | **현재 webview에서 이동** (single-tab 브라우징) |
| `window.open(url)` 기본 | 새 탭 | **현재 webview에서 이동** |
| `window.open(url, '', 'width=500,height=600')` | 별도 팝업 창 | **Freeter 내부 팝업** (OAuth 로그인 등) |
| OAuth/로그인 팝업 | 별도 팝업 창 | **Freeter 내부 팝업** (`window.opener` 통신 유지) |

판단 기준: `setWindowOpenHandler`의 `disposition === 'new-window'` 또는 `features`에 `popup` 포함 여부.

**왜 OAuth 팝업은 Freeter 내부로 유지?**  
로그인 팝업은 `window.opener.postMessage({ token: ... })`로 원래 창에 결과를 돌려줘야 함. 이 opener 참조는 같은 Electron 프로세스 안에서만 유효. 외부 브라우저로 보내면 통신 단절로 로그인 실패.

**수정 파일**: `src/main/infra/browserWindow/browserWindow.ts` (`setWindowOpenHandler`)

---

## 4. Webpage 위젯 — 마우스 앞/뒤 버튼 지원

요즘 마우스의 사이드 버튼(X1/X2)으로 webview 앞/뒤 이동 가능하게.

### 타겟팅: 커서 아래 webview

여러 webpage 위젯이 있을 때 **마우스 커서가 있는 위젯**을 대상으로 이동 (이전 포커스에 의존하지 않음).

```ts
// 의사 코드
cursor = screen.getCursorScreenPoint();
localPos = cursor - window.contentBounds;
webContentsId = await win.executeJavaScript(
  `document.elementFromPoint(x, y).closest('webview').getWebContentsId()`
);
webContents.fromId(webContentsId).navigationHistory.goBack();
```

**왜 포커스 기반이 아닌 커서 기반?**  
키보드 포커스는 위젯 전환 후에도 이전 webview에 남아있는 경우가 많음 (예: 자소설 위젯에서 클릭 → Slack 위젯으로 이동 → 마우스 뒤로 → 자소설이 뒤로가는 버그). 커서 위치는 사용자의 현재 의도를 가장 잘 반영함.

### 이벤트 수신: 이중 훅

1. `BrowserWindow.on('app-command')` — 표준 경로 (Linux XF86Back/Forward, 정상 Windows 드라이버의 `WM_APPCOMMAND`)
2. `win.hookWindowMessage(0x020C /* WM_XBUTTONUP */)` — Windows 드라이버가 `WM_APPCOMMAND`로 번역 안 해주는 케이스(일부 게이밍 마우스 드라이버 등) 폴백

**수정 파일**: `src/main/infra/browserWindow/browserWindow.ts`

---

## 5. "Open Data Folder" 메뉴

File/Freeter 메뉴에 프로젝트/위젯 설정이 저장된 폴더를 OS 파일 탐색기로 여는 항목 추가. 데이터 위치 찾기 어렵던 UX 개선.

- Windows/Linux: `File → Settings → **Open Data Folder** → Quit`
- macOS: `Freeter → About → Settings → **Open Data Folder** → ...`

클릭 시 `<appData>/freeter-swh/freeter-data/` 가 열림. 내부엔 `freeter-data` 파일(앱 상태) + `widgets/<id>/` (위젯별 데이터).

### 구현

클린 아키텍처 패턴 유지:
- 새 IPC 채널: `ipcShellOpenAppDataDirChannel` (`src/common/ipc/channels.ts`)
- 새 use case: `createOpenAppDataDirUseCase` (`src/main/application/useCases/shell/openAppDataDir.ts`) — `shellProvider.openPath(appDataDir)` 래핑. 경로는 main에서만 앎 (렌더러에 노출 X).
- 컨트롤러: `src/main/controllers/shell.ts` 확장
- 렌더러 provider: `openAppDataDir()` 메서드 추가 (`src/renderer/application/interfaces/shellProvider.ts`, `src/renderer/infra/shellProvider/shellProvider.ts`)
- 메뉴: `src/renderer/application/useCases/appMenu/initAppMenu.ts`

**수정 파일**: 위 7개 + 테스트 2개

---

## 6. 워크플로우 전환 단축키 (Ctrl+Tab / Ctrl+Shift+Tab)

브라우저 탭 전환과 동일한 단축키로 같은 프로젝트 내 워크플로우 순환.

- **Ctrl+Tab**: 다음 워크플로우
- **Ctrl+Shift+Tab**: 이전 워크플로우

끝에서 처음으로 순환. 워크플로우가 1개 이하면 무시.

### 구현

- 새 use case: `createSwitchWorkflowByOffsetUseCase(offset: number)` (`src/renderer/application/useCases/workflowSwitcher/switchWorkflowByOffset.ts`)
  - 현재 프로젝트의 `workflowIds`에서 현재 인덱스 ±1 (modulo 순환) → `switchWorkflowUseCase` 호출
- 메뉴에 항목 추가 (`initAppMenu.ts`): View 메뉴에 "Next Workflow" / "Previous Workflow" + accelerator

### 수신 경로 (2-경로 전략)

단일 accelerator만으로는 부족해서 두 경로로 받음:

| 포커스 위치 | 수신 경로 |
|---|---|
| Freeter UI (워크플로우 탭, 위젯 래퍼 등) | 메뉴 accelerator → menu item `doAction` 호출 |
| webview 내부 (웹페이지 위젯) | webview의 `before-input-event`에서 Ctrl+Tab 감지 → `preventDefault()` + IPC로 main→renderer 전달 |

webview 내부에 키보드 포커스가 들어가면 guest 페이지가 키를 먼저 소비해서 메뉴 accelerator가 닿지 않음. `before-input-event` 리스너를 각 webview의 webContents에 붙여 폴백 확보. 두 경로 모두 최종적으로 `switchWorkflowByOffsetUseCase` 호출.

IPC 채널: `ipcSwitchWorkflowByOffsetChannel` (`src/common/ipc/channels.ts`), main→renderer 방향, `offset: number` 전달.

**수정 파일**: `src/common/ipc/channels.ts`, `src/main/infra/browserWindow/browserWindow.ts`, `src/renderer/init.ts`, `src/renderer/application/useCases/appMenu/initAppMenu.ts`, `src/renderer/application/useCases/workflowSwitcher/switchWorkflowByOffset.ts`(신규), 테스트 1개

---

## 7. User Agent 정비 — 로그인 세션 유지율 개선

일부 사이트에서 Freeter webview에 로그인해도 앱 재시작 시 세션이 날아가던 문제를 해결.

### 원인

원본 코드는 Electron 기본 UA에서 `Electron/x.x.x` 토큰만 제거:

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
(KHTML, like Gecko) Freeter-SWH/2.7.1-beta Chrome/146.0.0.0 Safari/537.36
                    ^^^^^^^^^^^^^^^^^^^^^^
```

`Freeter-SWH/...` 토큰이 남아있어서 UA를 꼼꼼히 파싱하는 사이트들이 "알 수 없는 브라우저"로 분류 → 영구 세션 쿠키 안 발급하거나, 매 접속마다 재인증 요구.

### 수정

`app.userAgentFallback`을 순수 Chrome UA로 재작성. `process.versions.chrome`에서 현재 Chromium 메이저 버전을 뽑아 Chrome UA 축소(UA reduction) 규격에 맞춤:

```
Mozilla/5.0 (<platform>) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<major>.0.0.0 Safari/537.36
```

- 플랫폼 슬러그: `Windows NT 10.0; Win64; x64` / `Macintosh; Intel Mac OS X 10_15_7` / `X11; Linux x86_64`
- Chrome UA reduction처럼 minor·build·patch를 `0.0.0`으로
- Electron 버전 업그레이드 시 `process.versions.chrome`가 자동 갱신되어 UA도 따라 갱신됨

### Google 예외는 그대로 유지

`uaOriginal` (원본 Electron UA)을 여전히 캡처해서 `browserWindow.ts`의 `reUrlsRequiringOriginalUA`(Google Apps 도메인)에 사용. Google은 이미 잘 되고 있으므로 회귀 방지.

**수정 파일**: `src/main/index.ts`

### 주의사항

이론상 일부 웹 챌린지 서비스(Cloudflare Turnstile 등)가 UA 일관성 검사를 하면 오탐 가능. 실무상 드묾 — 문제되는 사이트가 나오면 `reUrlsRequiringOriginalUA`에 예외 추가로 처리.

---

## 8. Note 위젯 공유 데이터 키 (cross-workflow sync)

여러 워크플로에 있는 Note 위젯들이 선택적으로 **같은 내용을 공유**할 수 있음. 한 쪽에서 수정하면 같은 키를 쓰는 다른 모든 위젯에 실시간 반영.

### 사용 흐름

1. Note 위젯 설정 → "Shared Data" 섹션 드롭다운에서 "+ Create new key…" 선택
2. 인라인으로 키 이름 입력 (예: `Shopping list`) → Create
3. 다른 워크플로의 Note 위젯 설정에서 같은 키 선택 → 동일 내용 표시
4. 한 쪽에서 수정 (3초 debounce) → 다른 쪽에 자동 반영

### 저장 위치

- 공유 키 지정 시: `<appData>/freeter-swh/freeter-data/shared/<widgetType>/<keyId>/`
- 지정 안 한 경우(기본): 기존대로 위젯별 `<appData>/.../widgets/<widgetId>/`

### 아키텍처

| 레이어 | 역할 |
|---|---|
| **Common** (`src/common/base/sharedStorageId.ts`, `ipc/channels.ts`) | 합성 ID `"<widgetType>:<keyId>"` 생성/파싱 헬퍼 + 6개 IPC 채널 (get/set/delete/clear/getKeys + 변경 broadcast) |
| **Main** (`application/useCases/sharedDataStorage/*`, `controllers/sharedDataStorage.ts`, `index.ts`) | `sharedDataStorageManager` (createObjectManager) + 5개 use case + 컨트롤러. write 성공 시 모든 BrowserWindow에 `ipcSharedDataChangedChannel` broadcast |
| **Renderer infra** (`infra/dataStorage/sharedDataStorage.ts`) | IPC 래퍼 |
| **State** (`base/sharedDataKey.ts`, `state/entities.ts`, `state/shared.ts`, `state/actions/entity.ts`) | `SharedDataKey` 엔티티 + `entityStateActions.sharedDataKeys` + `SharedState.sharedDataKeys` 슬라이스 |
| **Widget API** (`base/widgetApi.ts`, `useCases/widget/getWidgetApi.ts`) | `dataStorage` getter가 위젯 설정의 `sharedKeyId` 여부에 따라 shared vs widget-local 스토리지를 매 호출마다 lazy하게 선택 |
| **Settings API** (`useCases/widgetSettings/getWidgetSettingsApi.ts`) | `sharedDataKey.create(widgetType, name)` → id 생성 + state addOne |
| **Note 위젯** (`widgets/note/{settings.tsx, widget.tsx, index.ts}`) | 설정 UI (드롭다운 + 인라인 input), CustomEvent 구독, `requiresState: ['sharedDataKeys']` |

### 실시간 동기화 흐름

```
B에서 편집 → 3s debounce → dataStorage.setText IPC → main이 파일 write
  → main이 BrowserWindow.getAllWindows()에 broadcast
  → renderer init.ts가 IPC 받음 → window CustomEvent 'freeter:shared-data-changed'
  → A의 NoteInner가 리스너로 받음
    → 포커스가 자기 textarea에 있으면 skip (사용자 타이핑 보호)
    → 아니면 loadNote() → getText IPC → textarea.value 갱신
```

### 까다로웠던 포인트 (구현 시 만난 함정)

1. **widgetApi memoize의 함정**: `widgetApi.dataStorage`는 `widget.id`에 memoize돼서, sharedKeyId 변경해도 참조는 같음. → `getStorage()`를 lazy closure로 만들어 매 호출마다 state에서 현재 sharedKeyId 확인
2. **Uncontrolled textarea**: `defaultValue`는 mount 시에만 반영되므로 리로드 시 화면이 안 바뀜. → `textAreaRef.current.value`를 직접 씀
3. **sharedKeyId 전환 시 초기 로드**: 기존 위젯이 이미 마운트된 상태에서 sharedKeyId만 바꾸면 useEffect가 안 타서 이전 데이터가 남음. → `<NoteInner key={sharedKeyId ?? '__self__'}>` 래퍼로 강제 remount
4. **memSaver로 위젯이 영구 마운트**: 워크플로 전환으로 자연스러운 remount를 기대할 수 없음. → broadcast + CustomEvent 필수
5. **Self-echo**: 같은 window의 위젯들은 webContents.id가 같아 sender 구분 불가. → 타이핑 중인 textarea는 `document.activeElement` 체크로 스킵

### 키 삭제

설정 드롭다운 옆에 **"Delete key"** 버튼(선택된 키가 있을 때만). 삭제 시:

1. OS 확인 다이얼로그 — 영향받는 위젯 개수 표시
2. `shared/<widgetType>/<keyId>/` 폴더 내용 clear (공유 콘텐츠 제거)
3. 해당 키를 쓰던 모든 위젯의 **자체 storage도 clear** — 이전 로컬 데이터 복원 방지, 위젯이 빈 상태로 돌아감 (사용자 의도: "키 삭제하면 노트도 사라져")
4. 각 위젯의 `settings.sharedKeyId = null` 리셋
5. state에서 `SharedDataKey` 엔티티 removeOne

구현: `src/renderer/application/useCases/sharedDataKey/deleteSharedDataKey.ts` 단일 use case. `settingsApi.sharedDataKey.delete(keyId)`로 호출.

### 제한 사항

- **콘텐츠 비어있음 사전 체크 없음**: 당초 Q1 결정은 "비어있어야 공유 허용"이었으나, settings UI에서 위젯 데이터 dry-read가 까다로워 `moreInfo` 경고 문구로 대체. 사용자가 공유 키 지정 시 위젯의 visible 콘텐츠는 선택한 키의 내용으로 교체됨 (local 데이터는 widget 폴더에 그대로 남아, 공유 해제 시 복원됨).
- **독립적 키 관리 다이얼로그 부재**: 키 생성·삭제 모두 위젯 설정에서 인라인으로 처리. 전체 키 목록을 한눈에 보는 별도 "Manage Shared Data Keys" 화면은 없음. 키가 많아지면 필요해질 수 있음.

---

## 9. TodoList 자동 프로젝트 동기화

**TodoList는 설정 없이 프로젝트 단위로 자동 동기화**. 같은 프로젝트 내 모든 TodoList 위젯이 단일 데이터 버킷을 공유. 사용자가 키를 지정할 필요 없음.

### 동작

| 위젯 위치 | 스코프 | 결과 |
|---|---|---|
| 프로젝트 P1의 워크플로 여러 개 | `P1` | 모두 같은 목록 공유 |
| 프로젝트 P2의 워크플로 | `P2` | P1과 독립 |
| Shelf (탑 바) | `app` | 쉘프 내에서만 공유 (앱 전역) |
| 위젯을 프로젝트 간 이동 | 스코프 변경 | 자동 remount → 새 스코프의 데이터 로드 |

저장 경로: `<appData>/freeter-swh/freeter-data/shared/to-do-list/<projectId>/todo` (또는 `.../shared/to-do-list/app/todo`).

### Note 공유 키와의 차이

| | Note | TodoList |
|---|---|---|
| 공유 방식 | 사용자가 명시적으로 키 생성/선택 | 자동 (설정 없음) |
| 스코프 단위 | 임의 (키 이름 자유) | 프로젝트 또는 `app` |
| UX | 세밀한 제어 | 단순함 (무조건 동기화) |

Note의 유연성과 TodoList의 단순성 둘 다 취할 수 있도록 독립 설계. 공유 infra는 재사용.

### 구현

- `getWidgetApi.ts`에 `findWidgetProjectId(state, widgetId)` 헬퍼 추가. `project.workflowIds → workflow.layout.items`를 순회해서 위젯을 포함한 프로젝트 찾기.
- `dataStorage.getStorage()` 분기 확장: `widget.type === 'to-do-list'`이면 공유 키 지정 없이도 shared storage로 라우팅 (key = projectId 또는 `app`).
- TodoList widget에 outer `WidgetComp` 래퍼 추가 — `<ToDoInner key={scope} />`로 스코프 변경 시 remount 유도.
- debounce를 **3초 → 500ms**로 단축. 이산 동작(체크박스 토글, 항목 추가/삭제)은 키 입력 burst가 아니라서 짧아도 부담 없음.

**수정 파일**: `src/renderer/application/useCases/widget/getWidgetApi.ts`, `src/renderer/widgets/to-do-list/widget.tsx`. TodoList는 `settings.tsx`, `index.ts` 모두 건드릴 필요 없음.

---

## 10. 공유 구독 패턴 추상화 — `useSharedDataChangedEffect`

Note와 TodoList 두 위젯이 동일 구조의 브로드캐스트 리스너를 갖고 있던 걸 재사용 가능한 훅으로 분리.

```ts
useSharedDataChangedEffect(widgetType, scope, shouldSkip, reload);
// 예: Note
useSharedDataChangedEffect('note', settings.sharedKeyId, () => document.activeElement === ref.current, loadNote);
// 예: TodoList
useSharedDataChangedEffect('to-do-list', scopeForEnv(env), () => activeItemEditorState !== null, loadData);
```

설계 포인트:
- `shouldSkip`/`reload`를 `useRef`로 보관해서 subscribe useEffect가 편집 상태 변경마다 재실행되지 않음
- `scope`가 nullish면 자동 구독 스킵 (Note에 키 없을 때)
- 이벤트 이름 상수 `SHARED_DATA_CHANGED_EVENT`는 `src/renderer/base/sharedDataEvents.ts`로 중앙화 — dispatch(init.ts)와 listen(훅) 양쪽에서 같은 상수 참조

**효과**: 각 위젯의 live-sync 코드가 21줄에서 6줄로. 새 위젯이 공유 기능을 붙일 때 한 줄이면 끝.

**수정 파일**: 신규 `src/renderer/base/sharedDataEvents.ts`, `src/renderer/widgets/sharedDataSync.ts`. 수정 `renderer/init.ts`, `renderer/widgets/note/widget.tsx`, `renderer/widgets/to-do-list/widget.tsx`.

---

## 11. Webpage 위젯 — 동적 타이틀 (페이지 제목 + URL)

웹페이지 위젯의 헤더 타이틀을 사용자가 설정에서 직접 입력하지 않아도 현재 페이지의 제목·URL로 자동 표시.

### 동작

| 조건 | 헤더 표시 |
|---|---|
| 사용자가 `coreSettings.name` 지정 | 그 이름 그대로 (우선권 유지) |
| 미지정 + 페이지 로드됨 | `<페이지 제목> — <URL>` |
| 미지정 + 제목/URL 한쪽만 있음 | 있는 값 하나 |
| 미지정 + URL 비설정(초기 상태) | 위젯 타입 기본 이름 (`Webpage`) |

포맷은 em-dash(` — `) 구분. URL 자체가 사용자 원래 의도였고, 제목만으로는 어떤 사이트인지 식별이 애매한 경우가 많아 둘 다 표시.

### 아키텍처 — widgetApi 공통 메서드 추가

새 공통 메서드 `widgetApi.setDynamicTitle(title: string | null)`. 위젯이 런타임에 자기 헤더 타이틀을 덮어쓸 수 있음. webpage 외의 위젯도 재사용 가능(예: file-opener가 현재 디렉터리 표시 등).

| 레이어 | 변경 |
|---|---|
| **Base** (`base/widgetApi.ts`) | `WidgetApiCommon.setDynamicTitle` + `WidgetApiSetDynamicTitleHandler` 타입 |
| **Use case** (`useCases/widget/setWidgetDynamicTitle.ts` 신규) | 정규화(빈 문자열→null) + 동일 값 재기록 방지로 불필요한 리렌더 차단 |
| **State** (`base/state/ui.ts`, `state/app.ts`) | `ui.widgetDynamicTitles: Record<EntityId, string>` — **비영속**. `createPersistentAppState`에서 destructure로 제외 |
| **View model** (`ui/components/widget/widgetViewModel.ts`) | 표시 우선순위: `coreSettings.name` → `dynamicTitle` → `type.name` |
| **Webpage widget** (`widgets/webpage/widget.tsx`) | `page-title-updated` + `did-navigate` + `did-navigate-in-page` 3개 이벤트에서 `webview.getTitle() + getURL()` 조합해 publish |
| **Cleanup** (`useCases/widget/deleteWidget.ts`) | 위젯 삭제 시 `widgetDynamicTitles`에서 해당 엔트리 제거 (메모리 누수 방지) |

### 까다로웠던 포인트

1. **SPA 내부 네비게이션**: `page-title-updated`만 구독하면 SPA가 URL만 바꾸고 `<title>`을 갱신 안 할 때 URL 부분이 stale. → `did-navigate-in-page`도 붙여 `getURL()` 재조회.
2. **webview 재시작 시 잔상**: `requireRestart`(injectedJS/userAgent 변경)로 webview 재생성될 때 이전 타이틀이 store에 남아있으면 잠깐 노출됨. → cleanup에서 `setDynamicTitle(null)` 호출.
3. **persist/runtime 분리**: dynamic title을 ui 슬라이스에 두되 disk에 쓰이면 삭제된 위젯의 dead key가 누적되므로 `createPersistentAppState`에서 명시적 destructure 제외. `fixtureAppState`와 `createUiState` 양쪽에 필드 기본값 `{}` 추가.
4. **사용자 이름 우선순위**: `coreSettings.name`이 명시적으로 설정된 경우 자동값이 덮어쓰지 않도록 뷰모델에서 `coreSettings.name !== ''` 체크 선행. 빈 문자열이면 dynamic title fallback.
5. **프리뷰 모드**: `getWidgetApiUseCase`의 `forPreview` 분기에서는 `setDynamicTitle`도 no-op 처리 (기존 `updateActionBar`/`setContextMenuFactory`/`exposeApi`와 동일 패턴).

**수정 파일**:
- 신규: `src/renderer/application/useCases/widget/setWidgetDynamicTitle.ts`
- 수정: `src/renderer/base/widgetApi.ts`, `src/renderer/base/state/ui.ts`, `src/renderer/base/state/app.ts`, `src/renderer/application/useCases/widget/getWidgetApi.ts`, `src/renderer/application/useCases/widget/deleteWidget.ts`, `src/renderer/ui/components/widget/widgetViewModel.ts`, `src/renderer/widgets/webpage/widget.tsx`, `src/renderer/init.ts`
- 테스트 업데이트: `tests/renderer/base/widgetApi.spec.ts`, `tests/renderer/application/useCases/widget/getWidgetApi.spec.ts`, `tests/renderer/ui/components/widget/widget.spec.tsx`, `tests/renderer/widgets/setupSut.tsx`, `tests/renderer/base/state/fixtures/appState.ts` (시그니처 변경 반영 + `setDynamicTitle` 모킹)

---

## 12. Webpage 위젯 헤더 텍스트 선택·복사 허용

Webpage 위젯의 동적 타이틀(페이지 제목 + URL)을 마우스로 드래그해서 블록 선택·복사 가능하게. 다른 위젯 타입은 원본 Electron UI 관용(`body { user-select: none }`)을 그대로 유지.

### 원인

`src/renderer/ui/components/app/globals.scss`의 `body { user-select: none; }` — 드래그/리사이즈 중 실수로 텍스트가 블록 선택되는 걸 막는 Electron UI 관용. Webpage 위젯만 예외 처리하고 나머지는 원본 동작 유지.

### 변경

1. 공용 `widget.tsx`의 최상위 `.widget` div에 `data-widget-type={widget.type}` 속성 추가 — 위젯 타입을 DOM에 노출 (기존 `data-widget-context` 패턴과 일관).
2. `widget.module.scss`에서 `.widget[data-widget-type="webpage"] .widget-header-name`에만 `user-select: text; cursor: text;` 적용. 기본 `.widget-header-name` 규칙에서는 제거.

뷰 모드에선 깔끔하게 선택 가능. 편집 모드에선 `WidgetLayoutItem`이 `draggable={true}`라 드래그가 우선이라 자연스럽게 선택이 안 됨 (브라우저 기본 동작, 별도 처리 불필요).

### 왜 Webpage만?

다른 위젯(Note, TodoList, Timer 등)의 헤더 타이틀은 사용자가 직접 입력한 이름이라 복사할 일이 드묾. Webpage는 **동적 타이틀**(#11)로 현재 페이지 주소/제목을 자동으로 노출해서 "이 URL 복사" 같은 요구가 잦음. 범위를 좁혀서 원본의 UI 관용을 최대한 유지.

### 까다로웠던 포인트

- `.widget-header-name`은 공용 `widget.tsx`에서 렌더되는 DOM이라 각 위젯 타입의 개별 SCSS로는 스타일 접근 불가. 공용 SCSS에서 속성 선택자로 좁히는 게 유일한 깔끔한 방법.
- CSS 모듈 빌드 후에도 `[data-widget-type="webpage"]`는 속성 선택자라 해시되지 않음 — 의도대로 매칭됨.

**수정 파일**: `src/renderer/ui/components/widget/widget.module.scss`, `src/renderer/ui/components/widget/widget.tsx`

---

## 13. Webpage 위젯 — 새 탭은 기본 브라우저, 팝업은 계속 내부 (#3 재정립)

#3은 `target="_blank"` / `window.open(url)`까지 현재 webview로 눌러넣어서 "이건 새 창에서 보고 싶었는데"라는 기대를 깼음. 사용자가 원한 건 **일반 브라우저 감각**:

| 링크 종류 | 실제 브라우저 | 이 포크 (이전, #3) | 이 포크 (현재) |
|---|---|---|---|
| 일반 `<a href>` / JS 리다이렉트 / 폼 전송 / back-forward | 현재 탭 이동 | 현재 webview 이동 | **현재 webview 이동** (변화 없음) |
| `<a target="_blank">` / 중간클릭 / Ctrl·Cmd+클릭 | 새 탭 | 현재 webview 이동 | **기본 브라우저로 전송** |
| `window.open(url)` (features 없음) | 새 탭 | 현재 webview 이동 | **기본 브라우저로 전송** |
| `window.open(url, '', 'popup,width=...')` 또는 disposition `new-window` | 별도 팝업 창 | Freeter 내부 팝업 | **Freeter 내부 팝업** (변화 없음) |

### 갈림길의 이유

Chromium이 `setWindowOpenHandler` 콜백에 `disposition`과 `features`를 실어서 넘겨줌. 새 탭 성격(`foreground-tab`/`background-tab`, features 비어있음)은 외부 브라우저로, 진짜 팝업 성격(`new-window` 또는 features에 `popup`/`width`/`height`)은 내부로 라우팅.

**왜 팝업은 내부 유지?**  
OAuth / 로그인 플로우는 `window.opener.postMessage({token: ...})`로 원래 창에 결과를 돌려줘야 함. opener 참조는 같은 Electron 프로세스 안에서만 유효. 팝업도 외부 브라우저로 밀면 통신 단절 → 로그인 실패. #3이 이걸 일부러 내부로 뒀던 이유는 유효했음.

**왜 새 탭은 외부?**  
`target="_blank"` / 중간클릭은 사용자가 "이 위젯 밖에서 보고 싶다"는 신호. 현재 webview 위에 덮어씌우면 위젯 내비게이션 히스토리도 꼬이고 의도와도 안 맞음.

### 같은 프레임 이동과의 구분이 왜 공짜인가

같은 프레임 안에서 URL이 바뀌는 경우(일반 링크 클릭, `location.href=...`, 폼 submit, back/forward)는 Chromium이 `will-navigate` 경로로 보내고 `setWindowOpenHandler`를 부르지 않음. 새 창/새 탭을 열려는 의도만 이 핸들러로 넘어옴 → 호스트 측에서 별도 감지 로직(preload 주입, 클릭 핸들러 등) 불필요.

### 까다로웠던 포인트

- 초기 구현(이 섹션의 첫 버전)은 "전부 외부 브라우저로" 밀어버렸는데 — OAuth 팝업이 같이 깨져서 되돌림. `rePopupFeatures`와 `BrowserWindowConstructorOptions` 분기는 다시 살아남.
- 처음엔 webview에 preload 주입해 `<a>` 클릭을 가로챌 생각이었는데 과했음. Chromium이 같은 창 이동과 새 창/새 탭 요청을 이미 분리해서 주기 때문에 `setWindowOpenHandler` 한 곳에서 처리 가능.
- `shell.openExternal`엔 `sanitizeUrl`을 통과시킨 URL만 넘김. javascript:/file: 등 이상한 프로토콜이 페이지에서 `window.open`으로 흘러들어올 때 방어.
- #3과의 유일한 실질적 차이는 "새 탭성 요청을 현재 webview에 덮어씌우지 않고 외부로 보낸다"는 한 줄. 팝업 처리 로직(BrowserWindow 생성 옵션 등)은 그대로.

**수정 파일**: `src/main/infra/browserWindow/browserWindow.ts`

---

## 14. Top Bar 높이 축소 (60 → 48)

상시 노출되는 탑바가 세로 공간을 꽤 먹어서 워크스페이스 영역이 좁아지는 문제. 좌측 프로젝트 스위처(36px)는 그대로 들어가므로 기능/클릭 타겟 축소 없음.

연동된 수치들을 같이 맞춤:

| 위치 | 이전 | 현재 |
|---|---|---|
| `.top-bar-section` height | 60px | 48px |
| `.palette-tab` (pos-top-bar) padding | 22px 16px | 16px |
| `.shelf-item-caption` height / line-height | 62px / 60px | 50px / 48px |
| `.shelf-item-widget-box` top | 58px | 46px |

### 까다로웠던 포인트

- `.shelf` 가 탑바 경계를 `top: -1px / bottom: -1px` 로 덮는 구조라, shelf-item-caption 의 `height` 는 `top-bar-section + 2px` 가 돼야 함. 단순히 60→48로만 안 되고 62→50 으로 같이 조정.
- `.shelf-item-widget-box` 는 `position: fixed` 라 뷰포트 기준 `top` 값(탑바 하단 위치)에 연동. 탑바가 바뀌면 이것도 같이 바꿔야 hover 팝업이 붙어서 뜸.

**수정 파일**: `src/renderer/ui/components/topBar/topBar.module.scss`, `src/renderer/ui/components/palette/palette.module.scss`, `src/renderer/ui/components/topBar/shelf/shelf.module.scss`

---

## 15. 워크플로우 탭·셸프 아이템 가로 폭 축소

워크스페이스 폭이 좁은 환경에서 탭들이 필요 이상으로 자리를 차지. `min-width`만 축소하고 내부 padding은 유지:

| 요소 | 이전 | 현재 |
|---|---|---|
| `.workflow-switcher-item-button` (워크플로우 탭) | `min-width: 124px` | `100px` |
| `.shelf-item-caption` (탑바 셸프 아이템) | `min-width: 120px` | `96px` |

워크플로우 탭의 `padding: 0 48px 0 12px` 중 우측 48px는 hover 시 나오는 `.workflow-switcher-item-action-bar` 오버레이 자리라 그대로 유지. 이걸 줄이면 액션 아이콘들이 텍스트와 겹침.

**수정 파일**: `src/renderer/ui/components/workflowSwitcher/workflowSwitcher.module.scss`, `src/renderer/ui/components/topBar/shelf/shelf.module.scss`

---

## 16. 새 위젯 기본 이름 공란 처리

원본은 위젯을 만들 때마다 `Webpage 1`, `Note 2` 같은 자동 이름을 `coreSettings.name`에 박아넣었는데, 대부분의 경우 사용자는 곧바로 이름을 바꾸거나 비워놓기 때문에 기본값이 불필요. 새 위젯의 기본 이름을 **빈 문자열**로 변경. 헤더에서는 이미 `name`이 비어있을 때 위젯 타입 이름을 표시하는 로직(`should display a widget type name, if the widget name is not set`)이 있어서 공란이어도 UI가 깨지지 않음.

### 영향 범위

네 개의 "새 위젯 생성" 경로 모두:

| 경로 | 트리거 |
|---|---|
| `addWidgetToWorkflowUseCase` | 워크플로우 레이아웃에 위젯 추가 |
| `addWidgetToShelfUseCase` | 탑바 셸프에 위젯 추가 |
| `dropOnWorktableLayoutUseCase` (palette → layout) | 팔레트에서 워크스페이스로 드래그 |
| `dropOnTopBarListUseCase` (palette → top bar) | 팔레트에서 탑바로 드래그 |

**붙여넣기(paste)는 건드리지 않음** — 복제 시 기존 이름을 이어받으므로 여전히 `Widget Name Copy 1` 식 중복 방지 로직이 필요.

### 까다로웠던 포인트

- `generateWidgetName`과 `getAllWidgetNamesFrom*` 유틸은 paste 플로우에서도 쓰여서 완전히 제거하진 않고, 생성 경로 네 곳의 호출만 `''`로 대체. `generateWidgetName`은 결과적으로 paste쪽 `cloneWidget*SubCase` 내부에서만 호출되는 형태로 남음.

**수정 파일**: `src/renderer/application/useCases/workflow/addWidgetToWorkflow.ts`, `src/renderer/application/useCases/shelf/addWidgetToShelf.ts`, `src/renderer/application/useCases/dragDrop/dropOnWorktableLayout.ts`, `src/renderer/application/useCases/dragDrop/dropOnTopBarList.ts`

**테스트 업데이트**: `tests/renderer/application/useCases/dragDrop/dropOnTopBarList.spec.ts`, `tests/renderer/application/useCases/dragDrop/dropOnWorktableLayout.spec.ts` — 새 위젯 이름 단언을 `'Type 1'` → `''`로 변경.

---

## 17. 위젯 최소 크기 일괄 축소 — 세로 1칸 허용

좁은 공간에 위젯을 납작하게 두고 싶은 경우가 많은데 기본 `minSize`의 세로가 대부분 2칸이라 불필요하게 자리 차지. 세로 최소값을 **전부 1로 내림**. 가로(`w`)는 위젯 내부 UI(체크박스+텍스트, 검색창 등)가 들어갈 최소 폭이라 그대로 유지.

| 위젯 | 이전 | 현재 |
|---|---|---|
| Note | 2×2 | **1×1** |
| Webpage | 2×2 | **2×1** |
| To-Do List | 2×2 | **2×1** |
| Timer | 1×2 | **1×1** |
| Web Query | 2×1 | 2×1 (변화 없음) |
| Commander | 1×1 | 1×1 (변화 없음) |
| File Opener | 1×1 | 1×1 (변화 없음) |
| Link Opener | 1×1 | 1×1 (변화 없음) |

원본에서 이미 `h: 1` 동작하는 위젯들(Commander, Web Query 등)이 있어서 그리드 시스템 상 안전. 헤더(26px) + 바디 최소 1줄은 1칸 안에 들어감.

**수정 파일**: `src/renderer/widgets/note/index.ts`, `src/renderer/widgets/webpage/index.ts`, `src/renderer/widgets/to-do-list/index.ts`, `src/renderer/widgets/timer/index.ts`

---

## 18. TodoList 위젯 항목 줄바꿈

원본은 TodoList 항목 텍스트를 한 줄 고정(`white-space: pre` + `text-overflow: ellipsis`)으로 처리해서 긴 내용이 **`…`로 잘려서 안 보임**. 좁은 위젯 폭에 긴 할 일을 적으면 끝이 사라지는 UX. 여러 줄로 풀어서 전체 내용이 보이도록 변경.

### 변경

| 속성 | 이전 | 현재 |
|---|---|---|
| `.todo-list-item` `white-space` | `nowrap` | 제거 |
| `label` 높이 | `height: 32px` (고정) | `min-height: 32px` |
| `label` `line-height` | `32px` (단일 줄 수직 센터링용) | `1.4` (일반 다중 줄 간격) |
| `label` padding | `0 6px` | `6px` (위아래 숨통) |
| 텍스트 `span` | `text-overflow: ellipsis` + `overflow: hidden` + `white-space: pre` | `white-space: pre-wrap` + `overflow-wrap: break-word` + `min-width: 0` |

### 까다로웠던 포인트

- `span:last-child`에 `min-width: 0` 추가 — flex child는 기본 `min-width: auto`라 내용이 컨테이너보다 커도 축소/줄바꿈이 안 됨. flexbox에서 자식 텍스트 래핑 시 자주 놓치는 함정.
- `white-space: pre` 그대로 두지 않고 `pre-wrap`으로 변경 — 기존 의도(공백 보존)는 유지하면서 wrap만 허용.
- `overflow-wrap: break-word`로 타협 — `anywhere`는 공격적이라 단어 중간 칼같이 자름. `break-word`는 "단어가 통째로 안 들어갈 때만 쪼갬"이라 URL이나 비어있는 토큰이 박힐 때 깔끔.
- 편집 input(`<input type="text">`)은 단일 줄 고유 특성이라 별도 작업 없음. 표시 상태에서만 여러 줄.

**수정 파일**: `src/renderer/widgets/to-do-list/widget.module.scss`

---

## 부록: 참고 문서

- `CLAUDE.md` — 이 저장소 구조·명령 가이드 (Claude Code용이지만 일반 참고용으로도 OK)
- `README.md` — 원본 Freeter README (fork 관련 설명은 아직 추가 X)
