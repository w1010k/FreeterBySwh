# Fork 이후 변경사항

원본 [FreeterApp/Freeter](https://github.com/FreeterApp/Freeter) (마지막 upstream 태그 `v2.7.1-beta`) 이후 이 포크에서 추가/변경한 내용 정리.

기준 시점: `v2.7.1-beta` (upstream 마지막 태그) 이후.

각 섹션 제목 끝의 날짜는 해당 기능이 **처음 도입된 커밋 날짜** (follow-up 개선 커밋은 반영하지 않음).

---

## 1. 앱 아이덴티티 분리 — 원본 Freeter와 공존 가능하게 *(2026-04-17)*

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
| About 모달 본문 | upstream 홍보 + Sponsors & Backers (영문) | "포크 정보"(한글) + "원본 Freeter 후원자" 리스트는 원본 기여 인정 차원에서 유지 |

**왜**: 원본 앱을 덮어쓰거나 설정을 공유하지 않도록. `appId`가 달라서 `app.requestSingleInstanceLock()`도 자동 분리됨. 트레이·윈도우·메뉴에 원본 이름이 남아있으면 두 앱 동시 실행 시 어느 쪽이 내 포크인지 구분 불가 → OS 표면에 드러나는 아이덴티티 라벨 일괄 교체.

**그대로 둔 곳** (프로덕트 설명 문구): `applicationSettings` / `workflowSettings` / `projectManagerSettings`의 `moreInfo` 문자열("Freeter frees up memory..."). 이건 오픈소스 프로젝트 자체를 서술하는 산문이라 `Freeter-SWH`로 치환하면 오히려 어색 (이 포크 자체가 별도 프로젝트가 아니라 upstream의 파생이라는 맥락 유지).

About 모달 본문은 후속 작업으로 **한글 "포크 정보"로 재작성** — 이 앱이 swh의 개인 포크임을 밝히고, 원본 Freeter 후원자 섹션은 "원본 Freeter 후원자"로 리프레이밍해 upstream 기여에 대한 attribution은 유지.

**수정 파일**: `electron-builder.config.js`, `package.json`, `src/main/index.ts`, `webpack.renderer.config.js`, `src/main/infra/trayProvider/trayProvider.ts`, `src/main/infra/dialogProvider/dialogProvider.ts`, `src/main/infra/browserWindow/browserWindow.ts`, `src/renderer/application/useCases/appMenu/initAppMenu.ts`, `src/renderer/ui/components/about/about.tsx`

남은 브랜딩 TODO: 아이콘(`resources/{win32,darwin,linux}/`). (기본 글로벌 단축키 충돌은 #20에서 해결)

---

## 2. 빌드 / 런타임 업그레이드 *(2026-04-17)*

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

## 3. Webpage 위젯 — 링크·팝업 동작 개선 *(2026-04-17)*

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

## 4. Webpage 위젯 — 마우스 앞/뒤 버튼 지원 *(2026-04-17)*

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

## 5. "Open Data Folder" 메뉴 *(2026-04-18)*

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

## 6. 워크플로우 전환 단축키 (Ctrl+Tab / Ctrl+Shift+Tab) *(2026-04-18)*

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

## 7. User Agent 정비 — 로그인 세션 유지율 개선 *(2026-04-18)*

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

## 8. Note 위젯 공유 데이터 키 (cross-workflow sync) *(2026-04-18)*

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

## 9. TodoList 자동 프로젝트 동기화 *(2026-04-18)*

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

## 10. 공유 구독 패턴 추상화 — `useSharedDataChangedEffect` *(2026-04-18)*

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

## 11. Webpage 위젯 — 동적 타이틀 (페이지 제목 + URL) *(2026-04-18)*

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

## 12. Webpage 위젯 헤더 텍스트 선택·복사 허용 *(2026-04-18)*

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

## 13. Webpage 위젯 — 새 탭은 기본 브라우저, 팝업은 계속 내부 (#3 재정립) *(2026-04-18)*

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

## 14. Top Bar 높이 축소 (60 → 48) *(2026-04-18)*

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

## 15. 워크플로우 탭·셸프 아이템 가로 폭 축소 *(2026-04-18)*

워크스페이스 폭이 좁은 환경에서 탭들이 필요 이상으로 자리를 차지. `min-width`만 축소하고 내부 padding은 유지:

| 요소 | 이전 | 현재 |
|---|---|---|
| `.workflow-switcher-item-button` (워크플로우 탭) | `min-width: 124px` | `100px` |
| `.shelf-item-caption` (탑바 셸프 아이템) | `min-width: 120px` | `96px` |

워크플로우 탭의 `padding: 0 48px 0 12px` 중 우측 48px는 hover 시 나오는 `.workflow-switcher-item-action-bar` 오버레이 자리라 그대로 유지. 이걸 줄이면 액션 아이콘들이 텍스트와 겹침.

**수정 파일**: `src/renderer/ui/components/workflowSwitcher/workflowSwitcher.module.scss`, `src/renderer/ui/components/topBar/shelf/shelf.module.scss`

---

## 16. 새 위젯 기본 이름 공란 처리 *(2026-04-18)*

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

## 17. 위젯 최소 크기 일괄 축소 — 세로 1칸 허용 *(2026-04-18)*

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

## 18. TodoList 위젯 항목 줄바꿈 *(2026-04-18)*

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

## 19. Shelf 위젯 호버 팝업 높이 축소 (300×300 → 300×150) *(2026-04-18)*

탑바 셸프에 마우스 올리면 나오는 위젯 프리뷰 팝업 크기가 `shelfItemViewModel.ts`에 **하드코딩된 300×300px**. #17에서 위젯 `minSize`를 세로 1까지 내렸지만 이건 워크스페이스 그리드 기준이고 셸프 팝업은 별도 경로라 영향 없었음. 대부분 위젯 내용이 가로로 길쭉한 편이라 **세로만 절반(150px)** 으로 줄이고 가로는 300px 유지.

```ts
// src/renderer/ui/components/topBar/shelf/shelfItemViewModel.ts
const hPx = 150;  // was 300
const wPx = 300;  // unchanged
```

사용자 설정은 아직 없음 — 필요해지면 셸프 위젯별 설정이나 전역 설정으로 노출 가능. 지금은 상수만 조정.

**수정 파일**: `src/renderer/ui/components/topBar/shelf/shelfItemViewModel.ts`

---

## 20. 기본 글로벌 단축키 변경 (`Ctrl/Cmd+Shift+F` → `Ctrl/Cmd+Shift+Space`) *(2026-04-18)*

원본 Freeter의 기본 hotkey가 `Ctrl/Cmd+Shift+F`인데 이 포크도 같은 값이라 **두 앱 동시 실행 시 OS 레벨에서 하나만 등록**되는 문제. `CmdOrCtrl+Shift+Space`로 변경.

- 선택지(`getMainHotkeyOptions`)에는 이미 `Ctrl+Shift+Space`가 포함돼 있어서 UI 추가 작업 없음. 기본값(`createUiState().appConfig.mainHotkey`)만 교체.
- **기존 사용자에게는 영향 없음** — 저장된 설정이 우선이라 이미 원하는 단축키를 설정해뒀다면 그대로 유지. 최초 실행 시에만 새 기본값 적용.
- 원본을 그대로 쓰고 싶으면 Settings에서 수동으로 고르면 됨.

**수정 파일**: `src/renderer/base/state/ui.ts` (`createUiState()` 내 `mainHotkey`)

---

## 21. Link/File Opener 위젯 — 콘텐츠 기반 자동 아이콘 *(2026-04-18)*

Link Opener / File Opener 버튼을 여러 개 놔두면 전부 똑같은 기본 아이콘이라 "이게 어느 링크·파일이더라" 구분이 안 되는 문제. 설정된 대상(URL · 파일 경로)을 기준으로 **런타임에 자동으로 의미 있는 아이콘**을 뽑아서 버튼에 표시.

### 동작

| 위젯 | 아이콘 소스 | 실패/없음 시 |
|---|---|---|
| Link Opener | ① `<origin>/favicon.ico` 직접 페치 → ② 실패 시 `<origin>/` HTML에서 `<link rel="icon\|apple-touch-icon\|shortcut icon">` 파싱 후 우선순위 순 페치 | 기존 "외부 링크" SVG |
| File Opener | 첫 경로에 대한 `Electron.app.getFileIcon()` (OS 네이티브) | 기존 파일/폴더 SVG |

사용자 설정은 없음 — URL·경로만 바꿔도 자연히 아이콘이 바뀜. "URL이 비어 있으면" 같은 미설정 상태에서는 원래 안내 문구가 그대로 뜨므로 기존 UX와 충돌 없음.

### 아키텍처 — 새 `icon` widget capability

`widgetApi.icon.{getFileIcon, getFavicon}` 모듈을 신규로 추가. file-opener·link-opener 모두 `requiresApi: ['shell', 'icon']`로 선언.

| 레이어 | 변경 |
|---|---|
| **Common** (`common/ipc/channels.ts`) | `ipcGetFileIconChannel` / `ipcGetFaviconChannel` 채널·타입 쌍 추가 |
| **Main infra** (`main/infra/iconProvider/iconProvider.ts` 신규) | `Electron.app.getFileIcon(path, {size:'normal'}).toDataURL()` + favicon용 `fetch('<origin>/favicon.ico')`. 응답 크기 상한(256KB), 타임아웃(4s), 리다이렉트 횟수 제한(3), 매직 바이트로 MIME 추정 (PNG/JPEG/GIF/WebP/ICO/SVG) |
| **Main use case** (`main/application/useCases/icon/{getFileIcon,getFavicon}.ts` 신규) | 입력 검증(empty, url sanitize) 후 provider 위임. 전 경로 try/catch로 예외 삼켜 null 반환 |
| **Main controller** (`main/controllers/icon.ts` 신규) | 두 채널을 use case로 연결 |
| **Renderer infra** (`renderer/infra/iconProvider/iconProvider.ts` 신규) | `electronIpcRenderer.invoke`로 main에 위임 |
| **Renderer base** (`base/widgetApi.ts`) | `WidgetApiModules.icon` 추가 → `WidgetApiModuleName` 유니온 자동 확장 |
| **Renderer use case** (`useCases/widget/getWidgetApi.ts`) | `icon` 모듈 팩토리 + `iconProvider` Deps 추가 |
| **UI 컴포넌트** (`ui/components/basic/button/button.tsx`) | `iconImgSrc?: string` prop 추가. 있으면 `<SvgIcon>` 대신 `<img>` 렌더. `object-fit: contain`으로 비율 유지, `size='Fill'` 규칙(최대 48×48) 그대로 재사용 |
| **Widgets** (`widgets/link-opener/widget.tsx`, `widgets/file-opener/widget.tsx`) | 첫 URL/경로를 `iconKey`로 삼아 `useEffect`에서 1회 페치, 결과 state에 저장. `Button`에는 `iconSvg`(기본값) + `iconImgSrc`(동적) 둘 다 전달 — Button이 imgSrc 유무로 자동 분기 |

### 성능 · 안전성 포인트

1. **캐시 정책 (main 측, 세션 스코프)**: 파일 아이콘/favicon 둘 다 평범한 `Map<key, string | null>` 하나씩. 성공이든 실패든 결과를 프로세스 생존 동안 그대로 기억. 같은 링크/파일 여러 개 놔도 Electron/network 호출은 path·origin 당 최대 1회. 디스크 영속화·LRU 캡·negative TTL 같은 건 **의도적으로 없음** — 단순함이 우선이고, 앱 재시작 비용은 실사용상 미미. ([지표 근거] 데스크톱 런처 성격상 유니크 origin이 수십 개 수준이라 Map이 커져 문제 된 적 없음.)
2. **"유저 클릭 = 재시도" 정책**: 실패가 영구 캐시된다는 건 뒤집어 말하면 **네트워크가 일시적으로 불안정했을 때 영영 기본 SVG에 갇힐 수 있다**는 뜻. 그래서 위젯 버튼을 실제로 클릭했을 때 `bypassCache: true`로 백그라운드 재시도를 같이 건다 — 성공하면 아이콘이 교체되고, 실패하면 원래대로. Fire-and-forget이라 open 동작을 블록하지 않음. "자동으로 N분마다 재시도"보다 유저 의도가 실제로 있는 순간에만 비용 지불하는 쪽이 예측 가능.
3. **in-flight dedup**: 동시에 같은 키로 두 위젯이 요청하면 하나의 Promise 공유 (`inflight<...>` Map). 렌더 초기에 위젯 여러 개가 한꺼번에 깨어나도 스파이크 방지.
3. **사이즈/타임아웃 상한**: favicon은 `content-length`와 누적 수신량 둘 다 체크해서 악성/거대 응답 차단. 4초 타임아웃(AbortController).
4. **MIME 검증**: content-type만 믿지 않고 첫 바이트 매직넘버로도 이미지 여부 판정. 비-이미지 응답은 버리고 null 반환.
5. **http/https 한정**: `new URL(...)` 로 파싱 후 protocol 화이트리스트. data:/ftp:/javascript: 등 차단.
6. **실패 시 앱 안 죽게**: 모든 경로에 try/catch → 최악의 경우 null만 돌아오고 위젯은 기존 SVG 그대로 표시. 사용자 시점에서는 "약간 늦게 예쁜 아이콘이 생기거나, 영영 생기지 않거나" 둘 중 하나.

### 까다로웠던 포인트

1. **`<use href={svg}>` vs `<img src={dataUri}>`**: 기존 `SvgIcon`은 webpack svg-sprite-loader가 생성한 레퍼런스를 `<use>`로 참조. data URI(raster base64)는 이 경로로 못 들어감. Button 레벨에서 두 렌더 모드를 분기하는 쪽이, 위젯이 Button을 우회해 자체 `<button><img></button>`를 쓰는 쪽보다 재사용성 ↑.
2. **`Fill` 사이즈 규칙 그대로 적용**: 기존 SCSS가 `.button-icon { width: 100%; height: 100%; max-*: 48px }` 를 이미 가지고 있어서 `<img>`에도 같은 클래스 붙이면 크기는 자동. 단 `object-fit: contain` 한 줄만 추가해서 raster 아이콘이 정사각형이 아닐 때 비율 유지.
3. **HTML `<link>` 파싱 폴백 (초기 릴리스 직후 추가)**: 초기 구현은 `<origin>/favicon.ico` 직접 페치만 했음. 실제 사용 중 Notion/makelapo/hometax.go.kr/logo.ideachefs.com 등에서 아이콘 안 뜨는 케이스 발견. 이유는 (a) SPA/정적 사이트가 `/favicon.ico`를 루트에 안 두고 `<link rel="icon" href="/favicon-32x32.png">`로만 선언하거나, (b) WAF/UA 게이팅으로 Node 기본 UA(`node/undici`)를 차단해 HTML 에러 페이지를 돌려주는 경우. 두 경로로 해결:
   - **Chrome UA 헤더 추가**: 모든 fetch에 `Electron.app.userAgentFallback`(이미 `main/index.ts:121`에서 Chrome UA로 세팅됨) 또는 하드코딩 fallback을 `User-Agent`로 실어 보냄. WAF 우회 + 일반적인 익명 fetch 호환성.
   - **HTML 파싱 2차 폴백**: `/favicon.ico`가 null을 리턴하면 `<origin>/` HTML을 받아 첫 64KB 안의 `<link>` 태그를 regex로 스캔. `<head>`는 거의 항상 앞쪽 수십 KB에 들어있어서 전체 파싱 불필요. 후보 우선순위: **apple-touch-icon > icon > shortcut icon**, 같은 rel 내에선 `sizes` 값이 큰 순. `apple-touch-icon`(보통 180+)이 Fill 버튼(최대 48×48)에 다운스케일됐을 때 16×16 classic icon 업스케일보다 훨씬 선명해서 기본 선호.
4. **SVG magic-byte 오탐 수정**: 초기 구현은 `bytes[0]===0x3c && (bytes[1]===0x3f || bytes[1]===0x73)`로 `<?` 또는 `<s`만 체크. HTML 에러 페이지가 `<script>` / `<style>`로 시작하면 **SVG로 오판**됐음. 규칙을 "첫 512바이트 안에서 `/<svg\b[^>]*>/i` 매치"로 교체. 이게 HTML 폴백과 맞물리면 중요한데, 잘못 태깅된 HTML이 `image/svg+xml`로 캐시돼 렌더 시 깨진 그림이 나오는 걸 방지.
5. **Third-party 아이콘 서비스 미사용**: Google s2/favicons 같은 서비스가 편하지만 모든 URL을 외부에 보내는 구조라 프라이버시 리스크. 데스크톱 런처 성격 상 대상 origin에 직접 HTTP 요청만 보내는 쪽이 깔끔.
6. **path/URL key 로 refetch 타이밍 동기화**: 설정 편집 중에는 `paths`/`urls`가 계속 바뀌므로 `useEffect` dep을 `paths[0]`·`urls[0]` 한 개로 좁혀서 불필요한 재호출 최소화. type(File↔Folder) 전환도 dep에 포함해야 같은 경로라도 아이콘 재조회됨 (단, 실제로는 경로 자체가 바뀌는 케이스가 더 많음).
7. **CSP `img-src`에 `data:` 추가 필요**: 렌더러 `index.ejs`의 CSP가 원본 그대로 `img-src *`였음. 스펙상 `*`는 http/https/ws/wss/self 계열만 매치하고 `data:` 스킴은 **명시적으로 선언해야** 허용됨. 처음 구현 직후 `"Loading the image '<URL>' violates ... img-src *"` 경고가 떴고 `img-src * data:;`로 고쳐서 해결. 다른 스킴(blob:, filesystem:)은 이 기능엔 불필요해서 추가 안 함.

### 수정 파일

- **신규**
  - `src/main/application/interfaces/iconProvider.ts`
  - `src/main/infra/iconProvider/iconProvider.ts`
  - `src/main/application/useCases/icon/getFileIcon.ts`
  - `src/main/application/useCases/icon/getFavicon.ts`
  - `src/main/controllers/icon.ts`
  - `src/renderer/application/interfaces/iconProvider.ts`
  - `src/renderer/infra/iconProvider/iconProvider.ts`
- **수정**
  - `src/renderer/index.ejs` (CSP `img-src *` → `img-src * data:`)
  - `src/common/ipc/channels.ts` (IPC 채널/타입 2종 추가)
  - `src/main/index.ts` (provider/usecase/controller 조립)
  - `src/renderer/init.ts` (iconProvider 주입)
  - `src/renderer/base/widgetApi.ts` (WidgetApiModules.icon 추가)
  - `src/renderer/application/useCases/widget/getWidgetApi.ts` (icon 모듈 팩토리 + Deps)
  - `src/renderer/ui/components/basic/button/button.tsx` / `button.module.scss` (`iconImgSrc` prop + `object-fit`)
  - `src/renderer/widgets/link-opener/index.ts`, `widget.tsx`
  - `src/renderer/widgets/file-opener/index.ts`, `widget.tsx`
- **테스트**
  - 신규: `tests/main/application/useCases/icon/getFileIcon.spec.ts`, `getFavicon.spec.ts`, `tests/main/controllers/icon.spec.ts`, `tests/renderer/infra/iconProvider/iconProvider.spec.ts`
  - 신규 mock: `tests/main/infra/mocks/iconProvider.ts`, `tests/renderer/infra/mocks/iconProvider.ts`
  - 수정: `tests/renderer/application/useCases/widget/getWidgetApi.spec.ts` (icon 모듈 케이스), `tests/renderer/widgets/setupSut.tsx` (widgetApi mock에 icon 추가)

---

## 22. Link/File Opener 동적 타이틀 *(2026-04-18)*

#16에서 새 위젯의 기본 이름을 공란으로 바꾸고 나서 헤더는 위젯 타입 이름(`Link Opener` / `File Opener`)만 노출됨. #21에서 아이콘은 콘텐츠 기반으로 구분되게 했지만 헤더 텍스트는 여전히 같아서, 여러 개 놓으면 이름만으론 어느 링크·어느 경로인지 알 수 없음. #11이 Webpage에 이미 깔아둔 `widgetApi.setDynamicTitle` 인프라를 그대로 재사용해서 헤더도 첫 URL·첫 경로 기준으로 자동 표시.

### 동작

| 위젯 | 사용자가 이름 지정 | 이름이 공란일 때 |
|---|---|---|
| Link Opener | 그 이름 | 첫 URL의 `host` (예: `github.com`) |
| File Opener | 그 이름 | 첫 경로의 basename (예: `report.pdf`) |

여러 개면 `"(+N)"` 접미사. `github.com (+2)` / `report.pdf (+2)` 처럼 개수가 숨지 않게 노출. 사용자 이름이 있으면 뷰모델(`widgetViewModel.ts`)의 `coreName !== ''` 우선 규칙으로 양보 — #11과 동일한 정책.

### 구현

두 위젯 모두 `useEffect`로 `setDynamicTitle` 호출, unmount·설정 변경 시 `null` 리셋:

- **Link Opener** (`widgets/link-opener/widget.tsx`): 첫 URL을 `sanitizeUrl` → `new URL(...)` → `.host` 파싱. 파싱 실패 시(예: `":"`) 원문 그대로 노출해서 디버깅 단서는 남김.
- **File Opener** (`widgets/file-opener/widget.tsx`): `split(/[/\\]/)`로 Windows·POSIX 구분자 모두 처리한 뒤 마지막 non-empty 세그먼트를 basename으로. 트레일링 슬래시(`/home/me/Documents/` → `Documents`)도 자연 처리.

활성 타입(`type`)이 Folder인데 `folders`가 비어 있으면 `files`에 값이 있어도 `null` 반환 — 화면에 안 보이는 쪽 값이 헤더로 새어나가지 않게.

### 까다로웠던 포인트

- `useEffect`의 dep을 `settings.urls` / `[files, folders, type]`로 좁혀서 불필요한 재호출 최소화. 내부에서 다시 filter하는 게 dep을 필터링된 배열로 두는 것보다 가볍고 안전(배열 identity가 렌더마다 달라지면 매번 useEffect 돌음).
- 두 위젯 모두 `requiresApi: ['shell', 'icon']`만 선언돼 있어서 `setDynamicTitle`은 `WidgetApiCommon`에 속해 별도 capability 추가가 필요 없음. 이미 깔아둔 인프라의 효용이 바로 나옴.

**수정 파일**: `src/renderer/widgets/link-opener/widget.tsx`, `src/renderer/widgets/file-opener/widget.tsx`

**테스트 업데이트**: `tests/renderer/widgets/link-opener/widget.spec.ts` (+4), `tests/renderer/widgets/file-opener/widget.spec.ts` (+4) — 단일/다중/파싱 실패/공란 케이스.

---

## 23. Webpage 위젯 액션바에 Copy URL 버튼 추가 *(2026-04-18)*

기존에는 Webpage 위젯에서 현재 URL을 복사하려면 위젯 본문 우클릭 → "Copy current address" 컨텍스트 메뉴를 거쳐야 했음(`actions.ts`에 `copyCurrentAddress`와 라벨 상수는 원본부터 있었지만 액션바에는 노출 안 돼 있었음). 타이틀바 우측 액션바에 버튼 하나 추가해서 **한 번 클릭**으로 복사 가능하게.

### 배치

```
HOME · BACK · FORWARD · RELOAD(·AUTO-RELOAD) · [COPY-URL] · OPEN-IN-BROWSER
```

`OPEN-IN-BROWSER` 바로 왼쪽. 둘 다 "현재 URL"을 대상으로 하는 동작이라 묶어두는 게 자연스럽고, 왼쪽 내비게이션 그룹과 시각적으로도 분리됨.

### 구현

1. 신규 아이콘 `src/renderer/widgets/webpage/icons/copy-url.svg` — 14×14 viewBox, `fill:currentColor`, `fill-rule:nonzero`. 두 개의 고리가 교차하는 체인-링크 형태(두 원 + 안쪽 구멍 각각, CW 외곽·CCW 내곽으로 감아서 nonzero 규칙으로 구멍 효과). **대각선 `/` 방향**으로 45° 기울여 배치(`<g transform="rotate(-45)">` 래핑). 노션·구글 독스 등에서 "링크 복사"에 쓰는 관용 아이콘이라 한눈에 "URL 복사"로 읽힘. "복사(두 문서 겹침)" 대신 "링크"를 택한 이유: 이 버튼 바로 오른쪽 `OPEN-IN-BROWSER`도 화살표 아이콘이라 URL 의미 계열끼리 모이는 쪽이 시각적으로 일관됨. 외곽 반경 3.1 / 내곽 반경 1.2로 팔 두께 1.9 — 이웃하는 `home` / `reload` / `open-in-browser` 아이콘의 "솔리드한 채움" 질감에 맞도록 얇지 않게 잡음(초기 Material 기반 렌더는 팔 두께 1.1이라 이웃 대비 희미했음).
2. `icons/index.ts`에 `copyUrlSvg` 재-export.
3. `actionBar.ts`의 `createActionBarItems`에 `id: 'COPY-URL'` 아이템 삽입 — `doAction`은 기존 `copyCurrentAddress(elWebview, widgetApi)` 재사용. 이미 Webpage 위젯의 `requiresApi`에 `clipboard`가 들어있어서 capability 추가 불필요.

### 까다로웠던 포인트

- 특별히 없음. 기존 액션/라벨/capability가 전부 갖춰져 있었고, 액션바 아이템 배열에 한 줄 끼워넣는 수준. 아이콘 하나만 새로 그리면 끝나는 작업이었던 게 "이미 인프라가 잘 깔려있구나" 확인.

**수정 파일**:
- 신규: `src/renderer/widgets/webpage/icons/copy-url.svg`
- 수정: `src/renderer/widgets/webpage/icons/index.ts`, `src/renderer/widgets/webpage/actionBar.ts`

---

## 24. Webpage 위젯 — 확대/축소 단축키 + 액션바 버튼 *(2026-04-18)*

Webpage 위젯에서 페이지 확대·축소를 단축키와 액션바 버튼으로 즉시 조작. 기존 컨텍스트 메뉴의 Zoom 서브메뉴(#8의 `zoomPage`)는 우클릭 + 값 선택이 필요해서 일상 사용엔 번거로움.

### 인터페이스

| 입력 | 동작 |
|---|---|
| `CmdOrCtrl+Shift+=` (`+`) / 숫자패드 `+` | 다음 프리셋으로 확대 |
| `CmdOrCtrl+-` | 이전 프리셋으로 축소 |
| `CmdOrCtrl+0` | 100% 리셋 |
| `CmdOrCtrl + 휠 위로` | 확대 한 단계 |
| `CmdOrCtrl + 휠 아래로` | 축소 한 단계 |
| 액션바 **+** / **−** 버튼 (돋보기 아이콘) | 확대 / 축소 한 단계 |

프리셋 사다리(기존 컨텍스트 메뉴와 동일): `25 / 33 / 50 / 75 / 80 / 90 / 100 / 110 / 125 / 150 / 175 / 200 / 250 / 300 / 400 / 500 %`.

액션바 순서: `HOME · BACK · FORWARD · RELOAD · **ZOOM-OUT · ZOOM-IN** · COPY-URL · OPEN-IN-BROWSER`. 네비게이션 그룹 바로 다음, URL 그룹 바로 앞 — 뷰 조작(확대)을 중간에 두는 구성. 아이콘은 표준 돋보기(annulus + 대각선 손잡이) 안에 `−` / `+` 심볼을 삽입해 의미가 즉시 전달되도록.

### 액션바 RELOAD는 zoom도 100%로 리셋

사용자 요청으로 추가 — 액션바 **RELOAD 버튼 클릭 시 `setZoomFactor(1)` 선행 후 reload**. "새로고침 = 일반 상태로 시작" UX 기대에 부합. 적용 범위는 **의도적으로 좁게**:

| 경로 | zoom reset 동반? |
|---|---|
| 액션바 RELOAD 버튼 | ✅ |
| 컨텍스트 메뉴 "Reload" / "Hard reload" | ❌ (정밀 작업용, 현재 줌 유지) |
| auto-reload 주기 타이머 | ❌ (백그라운드 반복이라 중간에 줌 리셋하면 성가심) |
| `CmdOrCtrl+R` 등 외부 단축키 | ❌ (이 프로젝트엔 바인딩 없음) |

Chrome/Firefox 관용에 비해선 살짝 비표준(일반 브라우저는 reload가 zoom 유지). 하지만 Freeter webpage 위젯은 특정 페이지에 임시로 줌하는 용도가 많아서 "F5 = 다 원래대로"가 더 자연스러운 workflow라는 판단.

**상태는 현재 webview 세션에만 유효** — 새로고침은 유지되지만 userAgent 변경 등으로 webview가 재생성되면 100%로 초기화. 기존 컨텍스트 메뉴 동작과 일관. 설정 저장·복원은 별도 범위.

### 아키텍처

세 개 경로를 한 헬퍼 트리오(`zoomStepIn` / `zoomStepOut` / `zoomReset`, `actions.ts`)로 수렴. 둘 다 기존 인프라를 확장 재사용했고 신규 preload 번들은 필요 없었음.

| 입력 | 경로 | 이유 |
|---|---|---|
| Keyboard | main `before-input-event` → 신규 IPC `ipcZoomWebpageChannel` (wc.id 동반) → renderer `init.ts`가 `CustomEvent('freeter:webpage-zoom')` 발행 → webpage `widget.tsx`가 자기 `getWebContentsId()` 매치 시 헬퍼 호출 | #6 Ctrl+Tab과 동일 패턴. `before-input-event`는 키보드만 지원하고 preventable이라 guest 페이지가 `+/-`를 소비하기 전에 가로챌 수 있음 |
| Wheel | `dom-ready`에 webview 안으로 짧은 JS 인젝션 (`executeJavaScript`) → Ctrl/Cmd+휠을 capturing 리스너로 `preventDefault` 후 `console.log('__FREETER_WEBPAGE_ZOOM_WHEEL__', deltaY)` → 호스트의 `webview.on('console-message')`에서 magic prefix 매치하여 헬퍼 호출 | `before-input-event`는 wheel 지원 안 함. preload 번들 추가 없이 guest→host 신호를 보내는 가장 가벼운 방법이 console-message 통로. 매직 prefix가 길고 유니크해서 일반 로그와 충돌 없음 |
| 액션바 버튼 | 기존 actionBar 구조 재사용 — `ActionBarItem.doAction`에서 바로 `zoomStepIn/Out(elWebview)` 호출 | 가장 직관적 경로. IPC·이벤트 없이 renderer 내 동기 호출로 끝남 |

### 신규/변경 코드

| 파일 | 역할 |
|---|---|
| `src/renderer/widgets/webpage/actions.ts` | `zoomLevels` 상수 + `zoomStepIn` / `zoomStepOut` / `zoomReset` 헬퍼 (epsilon 0.001로 FP 드리프트 방어) |
| `src/common/ipc/channels.ts` | `ipcZoomWebpageChannel` + `IpcZoomWebpageDirection` 타입 |
| `src/main/infra/browserWindow/browserWindow.ts` | 기존 Tab 핸들러에 zoom 분기 추가. `=`와 `+` 둘 다 "확대"로 매치 (키보드 종류 무관) |
| `src/renderer/init.ts` | IPC 수신 → `CustomEvent` 발행. 기존 `ipcSharedDataChangedChannel` 라우팅 바로 위에 배치 |
| `src/renderer/widgets/webpage/zoomEvents.ts`(신규) | 이벤트 이름/detail 타입 중앙화 (dispatch측 init.ts와 listen측 widget.tsx 양쪽 참조) |
| `src/renderer/widgets/webpage/widget.tsx` | `dom-ready`에서 zoom-wheel 인젝션 + `console-message` 리스너 + zoom CustomEvent 리스너. webContentsId 매치로 다른 webpage 위젯의 포커스와 충돌 방지 |

### 까다로웠던 포인트

1. **capture + passive:false**: wheel 가로챌 때 `{ capture: true, passive: false }` 필수. 기본 passive true로 붙이면 `preventDefault()` 무시되어 Chromium이 그대로 guest 스크롤로 처리. capture 없으면 guest 페이지의 내부 wheel 핸들러(Google Docs 등)가 먼저 소비.
2. **`=` 키는 `before-input-event`에 안 오는 경우 있음**: 초기 구현은 `input.key === '=' || input.key === '+'` 둘 다 매치했으나, Windows + 특정 키보드 레이아웃/IME 조합에서 Shift 없는 `Ctrl+=`가 호스트로 안 들어오는 걸 실사용 중 발견. 원인은 Chromium/Electron이 해당 키를 호스트 프로세스로 전달하기 전 단계에서 소비하는 걸로 추정(메뉴 accelerator는 아님 — 앱 메뉴엔 zoom 관련 바인딩 없음). 확실히 동작하는 경로만 남기려고 `input.key === '+'` 만 매치(Shift 필수). Chrome의 `Cmd+Shift+=` accelerator와도 일치. 숫자패드 `+` 역시 shift 없이 `+`로 들어와 자동 커버.
3. **webContentsId 매칭 타이밍**: `webview.getWebContentsId()`는 attach 이전에 호출하면 예외. `webviewIsReady`(dom-ready 이후 `true`)로 가드한 뒤 try/catch까지 이중 방어. 매 렌더가 아니라 ready 한 번만 id 읽고 클로저에 보관.
4. **매직 prefix 파싱 방어**: `console.log('__FREETER...', deltaY)`는 `"__FREETER... <number>"` 포맷으로 합성되지만 어떤 사이트가 동일 문자열로 로그 찍는 경우에 대비. prefix 매치 후 `Number(...)` + `Number.isFinite` 검증, `deltaY === 0`은 무시(수동 호출 방어).
5. **guest 페이지 오류로 인젝션 실패 무시**: `executeJavaScript(...).catch(() => undefined)` — 일부 사이트가 strict CSP 또는 이상한 상태에서 throw하더라도 위젯 전체가 깨지지 않도록. 그래도 키보드 경로는 계속 작동.
6. **Cmd+Tab은 건드리지 않음**: 기존 Ctrl-only Tab 핸들러는 `!input.meta` 가드 그대로 유지. zoom 쪽만 `input.control || input.meta` 허용 — macOS에서 Cmd+= / Cmd+-가 표준이고, Cmd+Tab은 OS 앱 스위처라 침범하면 안 됨.

### 제한 사항

- Ctrl+휠의 console.log pollution — 사용자가 직접 DevTools 열어 webview 내부 디버깅 시 magic prefix 메시지가 섞임. 빈도는 휠 이벤트당 1회라 미미하지만 미관상 아쉬움. 없애려면 webview 전용 preload 번들을 추가해 `ipcRenderer.sendToHost`로 바꾸면 되는데, 빌드·설정 배선 비용이 큼. 필요해지면 후속 이슈로.
- 웹사이트의 자체 Ctrl+휠 핸들러(예: 지도·CAD) — capture 단계에서 먼저 소비하므로 해당 사이트 기능이 안 먹힘. 지금은 webpage 위젯 공통이지만 만약 트러블이 잦으면 도메인별 예외 리스트로 끌 수 있음.

### 수정 파일

- **신규**: `src/renderer/widgets/webpage/zoomEvents.ts`, `src/renderer/widgets/webpage/icons/zoom-in.svg`, `src/renderer/widgets/webpage/icons/zoom-out.svg`, `tests/renderer/widgets/webpage/actions.spec.ts`
- **수정**: `src/renderer/widgets/webpage/actions.ts` (헬퍼 + labelZoomIn/Out), `src/renderer/widgets/webpage/actionBar.ts` (ZOOM-OUT/ZOOM-IN 항목), `src/renderer/widgets/webpage/icons/index.ts` (zoomIn/OutSvg export), `src/common/ipc/channels.ts`, `src/main/infra/browserWindow/browserWindow.ts`, `src/renderer/init.ts`, `src/renderer/widgets/webpage/widget.tsx`, `tests/renderer/widgets/webpage/actionBar.spec.ts` (zoom 버튼 케이스 +2)

---

## 25. Webpage 위젯 — 키보드 단축키: Open in Browser · 뒤로/앞으로 *(2026-04-22)*

Webpage 위젯에 **포커스가 있을 때** 반응하는 키보드 단축키 세 개 추가. 모두 webview 내부 guest 페이지로 이벤트가 가기 전에 가로채므로 지연 없이 즉시 동작.

### 인터페이스

| 입력 | 동작 |
|---|---|
| `CmdOrCtrl+T` | 현재 페이지 URL을 **시스템 기본 브라우저**로 열기 (액션바 "Open in Browser"와 동일) |
| `Alt+←` | 히스토리 **뒤로** (`canGoBack()`일 때만) |
| `Alt+→` | 히스토리 **앞으로** (`canGoForward()`일 때만) |

기존 입력 경로 — 액션바 버튼(BACK/FORWARD/OPEN-IN-BROWSER) + 컨텍스트 메뉴 + 마우스 X1/X2 버튼(#4) — 은 그대로 병존.

### 왜 이 키 조합?

- **`Ctrl+T`**: 브라우저의 "새 탭" 니모닉을 차용 — 이 위젯에서 "URL을 진짜 브라우저로 넘긴다"는 의미가 자연스럽게 연결. `Ctrl+B`(Browser) 같은 단일 글자 후보도 있었으나 Notion/Slack/Google Docs 등에서 **굵게(bold) 단축키**와 겹쳐서 기각. 생산성 앱들은 반대로 `Ctrl+T`는 기본 바인딩을 비워 두기 때문에(브라우저가 새 탭으로 이미 점유) 하이재킹 비용이 사실상 없음.
- **`Alt+←/→`**: Chrome/Firefox/Edge/Safari의 공통 관용. 별도 학습 없음.

### 아키텍처

셋 다 **main 프로세스 내부 처리**로 완료 — IPC 없음. 기존 `wc.on('before-input-event', ...)` 블록(#6 Ctrl+Tab, #24 zoom용)에 분기 추가.

| 단축키 | main에서 직접 할 수 있는 이유 |
|---|---|
| `Ctrl+T` | `wc.getURL()`로 URL 얻고 `shell.openExternal(sanitizeUrl(url))` 호출 — renderer 상태 불필요 |
| `Alt+←` | `wc.navigationHistory.canGoBack()` + `goBack()`. widget.tsx의 `did-navigate` 리스너가 자동으로 `refreshActions()` 돌려 액션바 활성 상태 갱신 |
| `Alt+→` | 위와 동일(forward 방향) |

반면 #24 zoom은 DOM API(`webviewEl.setZoomFactor`)가 필요해서 main→IPC→renderer→CustomEvent→widget 경로를 돌아야 했음. 이번 세 기능은 Electron의 `WebContents` API만으로 완결되어 경로가 훨씬 짧음.

### 까다로웠던 포인트

1. **`input.code === 'KeyT'` vs `input.key === 't'`**: Caps Lock이 켜져 있거나 비-QWERTY 레이아웃에서 `input.key`는 't'/'T'가 뒤집히거나 엉뚱한 문자가 올 수 있음. `.code`는 물리 키 기준이라 레이아웃·Caps Lock 무관하게 항상 `KeyT`. 기존 `+/-/0` zoom 키는 `.key`를 그대로 사용 중이지만 — 문자 입력 영향을 받는 건 letter 키뿐이라 거기만 `.code`로 전환.
2. **Alt 단독 분기의 위치**: 기존 핸들러는 `primaryMod = ctrl || meta`를 체크한 뒤 Alt면 즉시 리턴하는 구조(zoom이 Alt 섞이면 안 되기 때문). Alt+←/→ 처리는 그 `primaryMod` 가드 **앞**에 놓아야 Alt-only 조합이 흘러들어옴. Ctrl/Meta/Shift가 함께 눌린 Alt 조합은 의도적으로 무시(브라우저 탭 이동 같은 다른 관용과 혼선 방지).
3. **`wc`가 guest webview의 webContents**: 이 콜백 안의 `wc`는 `did-attach-webview`로 넘어온 **웹뷰 자체의** webContents (호스트 윈도우가 아님). 그래서 `wc.getURL()`은 현재 웹뷰가 로드한 URL을, `wc.navigationHistory`는 그 웹뷰의 히스토리를 가리킴 — 정확히 우리가 원하는 것.
4. **URL sanitize는 유지**: `openCurrentInBrowser`(actions.ts)가 sanitize 없이 바로 `openExternalUrl`을 호출하는 반면, 이 경로는 `sanitizeUrl` 통과 후 빈 문자열이면 no-op. guest가 `javascript:` 같은 비정상 URL 상태일 때 방어.

### 제한 사항

- 실제 브라우저처럼 `Ctrl+Shift+T`(닫은 탭 복구)나 `Ctrl+W`(탭 닫기) 같은 "탭 관리" 관용은 이 위젯에 의미가 없어 바인딩 없음.
- 현재 포커스된 webpage 위젯 하나에만 반응 — 포커스 없는 웹뷰엔 `before-input-event`가 발화하지 않으므로 의도대로.

### 수정 파일

- **수정**: `src/main/infra/browserWindow/browserWindow.ts`

---

## 26. TodoList 라이브 동기화 단순화 — IPC 체인 → in-memory store *(2026-05-10)*

#9 자동 프로젝트 동기화의 **라이브 업데이트 경로**(IPC broadcast → window CustomEvent → useEffect listener → loadData → 또 IPC getText → setState)에서 형제 위젯 동기화가 silent하게 끊기는 사례 발생. 같은 프로젝트 내 다른 워크플로의 todo 위젯이 같은 세션 동안에는 변경을 따라가지 않고, 앱 재시작 후에야 디스크에서 새 데이터를 읽음. 디스크 수준 공유는 정상이라 IPC roundtrip 어딘가에서 알림이 유실됨.

해결: 라이브 동기화를 **renderer 안에서만 동작하는 in-memory pub/sub**로 교체. 디스크 영속화는 그대로 IPC 사용.

### 동작

| 시나리오 | 변경 후 동작 |
|---|---|
| 같은 스코프(프로젝트 또는 `app`)의 형제 위젯들이 mount된 상태 | 한 위젯이 `setStoreToDoList()`를 호출하면 동일 스코프의 모든 구독자가 동기 호출되어 즉시 같은 상태로 리렌더 |
| 한 위젯이 unmount(memSaver) → 다른 위젯이 변경 | store의 in-memory state는 그대로 유지. 나중에 unmount된 위젯이 remount되면 store에서 즉시 최신값 픽업 (디스크 read 생략) |
| 앱 재시작 | store는 비어 있음 → 첫 mount가 디스크에서 읽어 store hydrate. 이후는 위와 동일 |
| 위젯이 다른 프로젝트로 이동 (스코프 변경) | outer `<ToDoInner key={scope} />`가 remount → 새 스코프의 store entry 구독, 비어 있으면 디스크 read |

저장 경로(`<appData>/freeter-swh/freeter-data/shared/to-do-list/<scope>/todo`)와 라우팅 로직(`getWidgetApi.ts`의 to-do-list 분기)은 변경 없음.

### 비교

| | Before (#9, #10) | After (#26) |
|---|---|---|
| 라이브 sync 단계 수 | 7~8단계 | 1단계 (모듈 변수 set + 구독자 호출) |
| 의존하는 인프라 | `ipcSharedDataChangedChannel`, main의 `broadcastChanged`, `init.ts` 재emit, `window` CustomEvent, `useSharedDataChangedEffect` | 모듈 스코프 `Map` + `Set<Listener>` |
| 동기화 범위 | 모든 BrowserWindow (이론상 cross-window) | 단일 renderer 안 |
| 디스크 read 횟수 | 변경마다 1회 (broadcast 받은 모든 위젯이 reload) | 첫 mount 1회 (이후는 store에서) |
| 실패 모드 | 어느 한 단계라도 끊기면 silent | 모듈 import 안 되면 즉시 크래시. 끊길 곳 없음 |

Cross-window 동기화 범위는 줄었으나 Freeter는 트레이 외 단일 메인 윈도우라 사실상 영향 없음.

### Note 위젯과의 차이

Note 위젯의 `sharedKeyId` 기반 동기화(#8)는 그대로 IPC broadcast + `useSharedDataChangedEffect`을 사용. todo만 별도 store로 분기한 이유:

- Note는 사용자가 명시적으로 키를 만들어 옵트인 — 키 단위로 다양한 조합이 가능해서 일반화된 broadcast가 더 적합
- TodoList는 프로젝트 단위 자동 — 스코프가 한정적이라 in-memory Map이 깔끔하게 fit
- 한 메커니즘이 깨졌을 때 다른 위젯에 영향 안 가도록 격리

### 까다로웠던 포인트

1. **테스트 격리**: `states`가 모듈 스코프 `Map`이라 같은 spec 파일 안에서 테스트 간에 상태가 leak. `resetTodoListStore()` 헬퍼를 export하고 `beforeEach`에서 호출해서 각 테스트가 빈 store로 시작하게 함.
2. **초기 디스크 load의 race**: 같은 스코프 위젯 두 개가 거의 동시에 mount되면 둘 다 `getJson` 호출. 먼저 끝난 쪽이 store hydrate → 두 번째 await가 풀렸을 때는 이미 다른 위젯이 사용자 입력으로 store를 갱신했을 수 있음. await 직후 `getTodoListState(scope) !== undefined` 한 번 더 체크해서 stale disk 데이터가 사용자 변경을 덮어쓰지 않게 가드.
3. **TypeScript narrowing**: `toDoList`가 `ToDoListState | undefined`로 바뀌어서 JSX 분기를 `isLoaded ?` → `toDoList ?`로 바꿔야 narrowing이 들어옴. 드래그 drop 핸들러는 deps에 `toDoList` 있어 자동 narrowing이 안 되니 함수 시작에 `if (!toDoList) return;` 추가.
4. **outer key wrapper 유지**: `<ToDoInner key={scope} />`는 이론상 hook이 scope deps로 처리할 수 있어 제거 가능하지만 — `activeItemEditorState`/`dragState` 같은 컴포넌트 로컬 상태가 스코프 전환 시 같이 리셋되어야 자연스러워서 그대로 둠.
5. **`useSyncExternalStore` 채택 + setState 메모이제이션** (셀프 리뷰에서 잡힘): 초기 구현은 `useState + useEffect + 수동 setLocal` 패턴이었는데 hook이 매 렌더마다 새 `setState` arrow를 반환해서 `setToDoListAndSave`(deps: setState)도 매 렌더 새로 생성됨 → `updateActionBar` / `setContextMenuFactory` effect가 매 렌더 재실행되어 IPC 트래픽 증가. React 18+의 `useSyncExternalStore`로 교체하고 `setState`도 `useCallback([scope])`로 안정화. concurrent rendering 환경에서 tearing도 자동 방지됨.
6. **per-widget → per-scope 디바운스** (`/simplify` 효율성 리뷰에서 잡힘): `useMemo(() => debounce(..., 500))`는 위젯 인스턴스마다 자기 타이머를 만들기 때문에 같은 스코프 형제 위젯 두 개가 빠르게 토글하면 **각자 500ms 후에 setJson을 1번씩 호출**해 같은 공유 버킷에 디스크 쓰기가 2회 발생. `todoStore.getTodoListSaver(scope, doSave)`로 hoist해서 한 스코프 내 모든 토글이 같은 타이머를 reset → idle 500ms 후 단 1회 write. 최종 디스크 상태는 어느 쪽이든 동일하지만 I/O 횟수 절반으로.

### 수정 파일

- **신규**: `src/renderer/widgets/to-do-list/todoStore.ts` (`useSyncExternalStore` 기반 store + hook + per-scope debounced saver + 테스트용 reset)
- **수정**: `src/renderer/widgets/to-do-list/widget.tsx` (`useSharedDataChangedEffect` 제거 → `useTodoListState` 사용, 초기 disk load만 useEffect에서 처리, sanitize 로직은 `state.ts`로 추출)
- **수정**: `src/renderer/widgets/to-do-list/state.ts` (`sanitizeLoadedToDoListState(raw): ToDoListState` 추가 — 위젯 useEffect 안의 30줄 inline 검증/매핑을 순수 함수로 분리)
- **테스트**: `tests/renderer/widgets/to-do-list/widget.spec.ts` (`beforeEach`에 `resetTodoListStore()` + 형제 sync 시나리오 3개: 같은 스코프 전파 / 다른 스코프 격리 / 두 번째 mount 시 디스크 read skip)
- **테스트(신규)**: `tests/renderer/widgets/to-do-list/state.spec.ts` (`sanitizeLoadedToDoListState` 단위 테스트 5개 — non-object/잘못된 shape/items 안 항목 검증/extra prop 제거)

기존 `useSharedDataChangedEffect` 훅과 `init.ts`의 IPC 재emit, main의 `broadcastChanged`는 Note 위젯에서 계속 사용 중이라 손대지 않음.

---

## 27. Webpage 위젯 — `Alt+Home` 단축키: 시작 페이지로 이동 *(2026-05-12)*

Webpage 위젯에 포커스가 있을 때 `Alt+Home`을 누르면 액션바의 "Go to start page" 버튼과 동일한 동작 — 위젯 설정의 시작 URL로 이동.

### 인터페이스

| 입력 | 동작 |
|---|---|
| `Alt+Home` | 시작 페이지(`settings.url`)로 이동. 이미 시작 페이지에 있으면 no-op (`canGoHome` 검사) |

액션바 버튼 / 컨텍스트 메뉴 항목 라벨(`Go to start page`)은 그대로 — #25(`Alt+←/→`, `Ctrl+T`) 등 기존 단축키 시리즈도 라벨에 키 조합을 노출하지 않는 컨벤션을 따랐기 때문.

### 왜 이 키 조합?

- Firefox/Chrome의 "홈페이지로 이동" 관용(`Alt+Home`)과 정확히 일치 — 학습 비용 없음.
- `Ctrl+Home`은 브라우저들이 "페이지 맨 위로 스크롤"에 쓰는 표준 동작이라 충돌. webview 안에서 스크롤 기대하는 사용자를 혼란시킬 수 있어 기각.
- `Home` 단독은 입력 필드 커서 이동·스크롤과 강하게 겹쳐 기각.

### 아키텍처

#24 zoom과 동일한 경로: **main `before-input-event` → IPC → `init.ts`에서 `window` CustomEvent로 재emit → widget이 자기 `webContentsId`만 매칭해서 처리**. 시작 URL이 renderer-side widget settings에 있어서 main이 직접 `loadURL`을 호출할 수 없기 때문에 IPC 우회가 필요.

| 단계 | 위치 |
|---|---|
| 키 가로채기 | `src/main/infra/browserWindow/browserWindow.ts` — 기존 Alt+←/→ 분기 옆에 Alt+Home 추가 (`!ctrl && !meta && !shift` 가드 동일) |
| IPC 채널 | `ipcGoHomeWebpageChannel(webContentsId)` — `src/common/ipc/channels.ts` |
| 채널 → CustomEvent | `src/renderer/init.ts` |
| CustomEvent 핸들러 | `src/renderer/widgets/webpage/widget.tsx` — `webviewEl.getWebContentsId()`와 매칭, `canGoHome` 통과 시 `goHome(webviewEl, url)` |

### 까다로웠던 포인트

1. **`canGoHome` 게이트**: 액션바 버튼은 이미 시작 페이지에 있을 때 disabled 상태로 보이므로, 단축키도 같은 조건일 때 no-op이어야 일관됨. `goHome`은 단순 `loadURL`이라 같은 URL이어도 페이지를 새로 로드해버림 → 의도치 않은 reload 방지를 위해 `canGoHome(webviewEl, url)` 검사 후에만 실행.
2. **#25(Alt+←/→) 분기와의 공존**: 기존 Alt-only 가드 블록(`!control && !meta && !shift`)에 `'Home'` 분기 한 줄만 추가. zoom 가드(`primaryMod = ctrl || meta; if (!primaryMod || alt) return;`) **앞**에 위치해서 Alt 단독 조합이 흘러들어옴.
3. **재사용된 webContentsId 매칭 패턴**: #24 zoom과 동일하게 widget useEffect에서 `getWebContentsId()`를 캐시해 detail.webContentsId와 비교 — 같은 페이지에 여러 webpage 위젯이 있어도 키 누른 webview에만 반응.

### 수정 파일

- **수정**: `src/common/ipc/channels.ts` (`ipcGoHomeWebpageChannel` 채널 추가)
- **수정**: `src/main/infra/browserWindow/browserWindow.ts` (Alt+Home 분기)
- **수정**: `src/renderer/init.ts` (IPC → CustomEvent 재emit)
- **수정**: `src/renderer/widgets/webpage/widget.tsx` (CustomEvent 리스너 + `goHome` 실행)
- **신규**: `src/renderer/widgets/webpage/homeEvents.ts` (`WEBPAGE_GO_HOME_EVENT` 상수 + 디테일 타입)

---

## 28. Webpage 위젯 — 액션바 버튼 툴팁에 단축키 표기 *(2026-06-04)*

Webpage 위젯 액션바 버튼에 마우스를 올리면 호버 툴팁에 해당 기능의 키보드 단축키가 함께 표시된다. 예: "Go Back (Alt+←)", "Open in web browser (Ctrl+T)". 그동안 #24·#25·#27로 단축키를 계속 추가해왔지만 라벨에는 의도적으로 노출하지 않아(이전 컨벤션) 사용자가 단축키 존재 자체를 알기 어려웠다 — 액션바를 단축키 치트시트로도 쓸 수 있게 방침을 바꿈.

### 인터페이스

단축키가 **실제로 바인딩된 버튼만** 힌트를 받는다. Copy current address·Auto-reload 토글은 바인딩이 없어 라벨 그대로. (Reload 행은 #29에서 단축키가 생기며 함께 추가됨.)

| 버튼 | 툴팁 (Win/Linux) | 툴팁 (macOS) |
|---|---|---|
| Go to start page | `Go to start page (Alt+Home)` | 동일 |
| Go Back | `Go Back (Alt+←)` | 동일 |
| Go Forward | `Go Forward (Alt+→)` | 동일 |
| Reload this page | `Reload this page (F5 · Ctrl+R)` | `Reload this page (F5 · Cmd+R)` |
| Zoom out | `Zoom out (Ctrl+-)` | `Zoom out (Cmd+-)` |
| Zoom in | `Zoom in (Ctrl++)` | `Zoom in (Cmd++)` |
| Open in web browser | `Open in web browser (Ctrl+T)` | `Open in web browser (Cmd+T)` |

수정자(modifier)는 OS를 따라간다(`Cmd` on macOS, `Ctrl` 그 외). `Alt`는 양 플랫폼 동일. `+`/`-` 기호와 화살표는 브라우저 메뉴 관용을 그대로 차용.

### 아키텍처

- 단축키 힌트는 `actionBar.ts`의 `title` 필드에만 덧붙인다. 라벨 상수(`labelGoBack` 등)는 **컨텍스트 메뉴와 공유**하므로 상수 자체는 건드리지 않음 — 액션바만 영향.
- `title`은 `ActionBar` 컴포넌트에서 버튼의 네이티브 HTML `title` 속성(호버 툴팁)으로 렌더된다.
- OS 판별은 `widgetApi.process.getProcessInfo().isMac` (시작 시 1회 IPC 로드 후 동기 반환). 이를 위해 webpage 위젯 `requiresApi`에 `'process'`를 추가.

### 까다로웠던 포인트

1. **라벨 상수 공유**: `labelGoBack` 등은 `actionBar.ts`와 `contextMenu.ts`가 함께 import. 상수를 고치면 우클릭 메뉴에도 단축키가 새어 들어가므로, 액션바의 `title` 조립 시점에만 `withKeys()`로 감쌌다.
2. **`requiresApi`에 `process` 누락 → 테스트 mock 갱신**: 기존 `actionBar.spec.ts`의 `widgetApi` mock에는 `process`가 없어서 `getProcessInfo()` 호출 시 깨짐. mock에 `process.getProcessInfo`를 추가하고 `isMac` 분기 테스트를 같이 넣음.

### 수정 파일

- **수정**: `src/renderer/widgets/webpage/index.ts` (`requiresApi`에 `'process'` 추가)
- **수정**: `src/renderer/widgets/webpage/actionBar.ts` (`withKeys` 헬퍼 + 버튼별 단축키 힌트)
- **테스트**: `tests/renderer/widgets/webpage/actionBar.spec.ts` (mock에 `process` 추가, 힌트/플랫폼 분기 검증 3건)

---

## 29. Webpage 위젯 — 키보드 단축키: 새로고침 (`F5` / `Ctrl/Cmd+R`) *(2026-06-04)*

Webpage 위젯에 포커스가 있을 때 `F5` 또는 `Ctrl/Cmd+R`로 페이지를 새로고침. 브라우저와 동일하게 **현재 확대 배율은 유지**한다. 그동안 새로고침은 액션바 버튼·컨텍스트 메뉴로만 가능했음.

### 인터페이스

| 입력 | 동작 |
|---|---|
| `F5` | webview 새로고침 (modifier 없음) |
| `Ctrl/Cmd+R` | webview 새로고침. `Shift`는 제외 — `Ctrl+Shift+R`(하드 리로드 관용)은 비워 둠 |

- **줌 유지**: 두 단축키 모두 `wc.reload()`만 호출하므로 확대 배율이 그대로다. 브라우저 F5/Ctrl+R 및 컨텍스트 메뉴의 "Reload this page"와 일치.
- **액션바 Reload 버튼과의 차이**: 액션바 버튼은 의도적으로 줌을 100%로 리셋한 뒤 새로고침("start fresh", #24)하는데, 키보드 단축키는 줌을 유지한다. 즉 #28에서 버튼 툴팁에 `(F5 · Ctrl+R)`를 표기하지만 키와 버튼의 동작이 줌 처리에서만 미묘하게 다르다 — 일상 사용 시 줌이 갑자기 리셋되는 게 더 거슬린다는 판단.

### 아키텍처

#25(`Ctrl+T`, `Alt+←/→`)와 동일하게 **main `before-input-event`에서 전부 처리, IPC 없음** — webview의 webContents(`wc`)를 직접 들고 있어 `wc.reload()`면 충분.

| 단축키 | 위치/처리 |
|---|---|
| `F5` | `src/main/infra/browserWindow/browserWindow.ts` — modifier가 없어 zoom용 `primaryMod` 가드 **앞**(Alt 블록 옆)에 배치. `!control && !meta && !alt && !shift` 확인 후 `wc.reload()` |
| `Ctrl/Cmd+R` | 같은 파일, `Ctrl+T` 분기 옆. `input.code === 'KeyR' && !input.shift` (레이아웃 독립성 위해 `.code` 사용) 후 `wc.reload()` |

### 까다로웠던 포인트

1. **F5의 배치 순서**: 기존 핸들러는 `const primaryMod = ctrl || meta; if (!primaryMod || alt) return;`로 modifier 없는 키를 일찍 걸러낸다. F5는 modifier가 없으므로 이 가드 **앞**에 두지 않으면 도달하지 못함 — Alt 단독 블록 바로 뒤에 배치.
2. **`Ctrl+Shift+R` 회피**: 실제 브라우저에서 `Ctrl+Shift+R`은 캐시 무시 하드 리로드. 의미가 다르므로 `!input.shift`로 제외해 향후 하드 리로드 바인딩 여지를 남김.

### 수정 파일

- **수정**: `src/main/infra/browserWindow/browserWindow.ts` (F5 분기 + Ctrl/Cmd+R 분기)
- **수정**: `src/renderer/widgets/webpage/actionBar.ts` (#28의 Reload 버튼 툴팁에 `F5 · {mod}+R` 표기)
- **테스트**: `tests/renderer/widgets/webpage/actionBar.spec.ts` (Reload 툴팁 검증 반영)

---

## 31. File Explorer 위젯 — 즐겨찾기 폴더 트리 탐색 *(2026-06-05)*

자주 쓰는 폴더 몇 개를 등록해 두고 트리로 펼쳐 탐색하는 **File Explorer** 위젯을 새로 추가했다. 기존 `File Opener`는 "미리 지정한 경로 하나를 여는 버튼"이었던 반면, 이 위젯은 등록한 폴더들의 실제 디렉터리 구조를 트리로 보여주고 항목을 **더블클릭하면 OS 기본 앱/탐색기로 연다**(파일=연결 프로그램, 폴더=Explorer/Finder).

### 사용자 가시적 효과

- **즐겨찾기(Favorites) 모델**: 한 폴더의 전부를 보여주는 게 아니라, 위젯 설정에서 **여러 폴더 경로를 등록**(File Opener의 다중 경로 UI와 동일한 add/삭제/폴더 선택)하면 그 폴더들만 트리 루트에 뜬다. 예: `Downloads`·`Documents`를 등록하면 루트에 그 둘만 보이고, 각각을 펼쳐 하위를 탐색.
- **루트 라벨**: 등록 경로의 마지막 폴더명으로 표시(`.../Downloads` → `Downloads`). 이름이 겹치면 ` (2)`, ` (3)`로 구분.
- **루트는 등록 순서 유지**: 트리 라이브러리는 기본적으로 형제 노드를 폴더 우선·알파벳순으로 자동 정렬하지만, **루트(등록한 즐겨찾기 폴더)만은 설정에 적은 순서를 그대로** 표시한다(`Downloads`→`Documents`로 적으면 알파벳순 `Documents`가 앞으로 가지 않음). 폴더 안쪽(하위 항목)은 그대로 라이브러리 기본 정렬(폴더 우선 + 자연스러운 숫자 정렬).
- **지연 로딩(lazy expand)**: 폴더를 펼치는 순간 그 폴더의 내용만 읽는다. 등록 폴더를 통째로 재귀 스캔하지 않으므로 `node_modules` 같은 거대 트리에서도 가볍다.
- **더블클릭 = 파일만 열기**: 파일을 더블클릭하면 OS 기본 앱으로 연다. **폴더는 더블클릭으로 열리지 않는다** — 폴더는 클릭으로 펼침/접힘만 한다(더블클릭은 결국 싱글클릭 2번이라 "폴더 더블클릭=탐색기 열기"로 두면 펼침과 충돌·깜빡임이 생김). 빠른 트리 탐색을 위해 폴더 토글과 파일 열기를 분리.
- **컨텍스트 메뉴**: 우클릭 시 종류별로 — 파일은 **Open**, 폴더는 **Open in File Explorer**(둘 다 OS 기본 핸들러로 열기) / 공통 **Copy Path**(절대경로 클립보드 복사). 폴더를 탐색기로 여는 동작은 여기로 분리. 메뉴는 위젯 타일의 CSS `transform` 영향을 피하려 `document.body`로 포털해 클릭 좌표(`anchorRect`)에 띄움.
- **파일 크기 표시(설정 토글)**: 각 파일 행 우측 끝에 사람이 읽기 좋은 크기(`1.4 KB`, `3 MB` …)를 row decoration으로 표시(폴더는 없음). 설정의 **Show file sizes**(기본 켜짐)로 끌 수 있다. `readDir`가 파일 entry마다 `stat`으로 크기를 함께 반환 — 디렉터리 진입(lazy) 시에만 읽으므로 비용은 펼친 폴더로 한정.
- **검색**: `Ctrl/Cmd+F`로 라이브러리 내장 검색창을 열어 필터(`hide-non-matches` 모드 — 매치 안 되는 행 숨김). **제약 둘**: ① lazy 로딩이라 모델에 올라온(=펼친) 노드만 검색됨(안 펼친 폴더 속 파일은 안 걸림). ② `@pierre/trees`(beta)의 검색·이름변경 입력이 **IME 조합(`isComposing`)을 가드하지 않아** 한글/CJK 입력이 매 글자 재필터·재렌더에 깨질 수 있음(매칭 로직 자체는 `toLowerCase`+부분일치라 한글 OK). 전체 재귀 검색·IME 안전한 자체 검색창은 별도 과제로 보류.
- 등록된 폴더가 없으면 "설정에서 폴더를 추가하라"는 안내를 표시한다.
- **모양**: 트리는 `@pierre/trees`의 테마 변수(`--trees-theme-*`)를 Freeter 테마 변수(`--freeter-*`)에 바인딩해 **현재 Freeter 테마(라이트/다크)를 자동으로 따라간다** — 색 하드코딩·테마 선택 UI 없음(CSS 변수가 트리 shadow DOM으로 상속). 행 밀도는 좁은 타일에 더 많이 보이도록 **Compact(행 24px)** 고정. 파일 타입 아이콘은 내장 `standard` 세트 + **컬러(`colored`)** 로 스캔하기 쉽게. 트리 기본 16px 좌우 거터는 `--trees-padding-inline-override: 0`(라이브러리 공식 훅)으로 없애 행이 위젯 가장자리에 붙도록 함.

### 아키텍처

새 파일시스템 읽기 능력을 main↔renderer로 한 줄기 뚫고, 트리 UI는 `@pierre/trees`(beta) React 엔트리를 썼다.

| 레이어 | 추가 |
|---|---|
| common | `base/fs.ts`(`FsDirEntry`), `ipc/channels.ts`에 `fs-read-dir`·`fs-get-home-dir` 채널 |
| main | `infra/fsProvider`(node `fs/promises.readdir` + `os.homedir`), `useCases/fs/{readDir,getHomeDir}`, `controllers/fs.ts`, `index.ts` 배선 |
| renderer infra | `infra/fsProvider`(IPC invoke), WidgetApi에 **`fs` 모듈**(`readDir`/`getHomeDir`) 추가 — `getWidgetApi`·`init.ts` 배선 |
| widget | `widgets/file-explorer/`(`index.ts`/`settings.tsx`/`widget.tsx`/`treeModel.ts`/icons), `widgets/index.ts` 등록. `requiresApi: ['fs','shell','clipboard']` |

`@pierre/trees`는 **path-first** 모델 — 각 행을 POSIX 경로 문자열로 식별하고 **후행 `/`로 디렉터리를 표시**한다(문서에 없어 실측으로 확인). 절대 OS 경로(Windows의 `\`·드라이브 문자)는 트리의 `/` 세그먼트 중첩을 깨므로, 트리 키는 이름 기반 상대 POSIX 경로로 만들고 `key → 절대경로` Map을 따로 들어 열 때 매핑한다(`treeModel.ts`).

### 까다로웠던 포인트

1. **`@pierre/trees`는 ESM 전용** → webpack/TS(`moduleResolution: bundler`)에선 잘 동작하지만 jest(CJS)가 못 읽는다. 전역 `customExportConditions`로 풀면 `synckit` 등 다른 ESM 의존성까지 줄줄이 깨졌다(blast radius 過). 그래서 **Renderer jest 프로젝트에서만 `moduleNameMapper`로 수동 mock**(`tests/__mocks__/pierreTrees*.js`)에 매핑 — 어차피 서드파티 트리 UI는 단위 테스트에서 목으로 두는 게 정석.
2. **행 활성화(더블클릭) 콜백이 없음**: 라이브러리에 `onActivate`/`onOpen`류 행 콜백이 없어, 래퍼 `div`의 `onDoubleClick` → `model.getFocusedPath()`로 포커스된 행 경로를 읽어 연다.
3. **lazy 확장 감지**: 확장 이벤트가 따로 없고 `subscribe`는 제네릭 변경 통지뿐. 디렉터리 키 집합을 들고 있다가 변경 때마다 아직 안 읽은 디렉터리의 `getItem(path).isExpanded()`를 확인해, 펼쳐졌으면 `readDir` 후 `model.add(...)`로 자식을 끼워 넣는다. `isExpanded`는 `FileTreeDirectoryHandle`에만 있어 `'isExpanded' in item`으로 union을 좁힘(`isDirectory()`는 타입 가드가 아님).
4. **jest mock 접근**: 스펙에서 `jest.requireMock`을 쓰면 mock 파일을 **자동 목(automock)** 해버려 `__getModel()`이 `undefined`를 반환했다. moduleNameMapper로 매핑된 일반 `import`를 쓰면 위젯과 **같은 mock 인스턴스**를 받는다.
5. **컨텍스트 메뉴 위치**: 위젯 타일이 `transform: translate()`로 배치되므로 메뉴를 그냥 `position: fixed`로 두면 뷰포트가 아니라 타일 기준으로 앵커돼 엉뚱한 곳에 떴다. `createPortal(…, document.body)`로 transform 조상을 벗어나 `anchorRect.x/y`(=`clientX/Y`)에 고정. 라이브러리가 메뉴 내부 클릭을 "바깥 클릭"으로 보고 닫지 않도록 포털 루트에 `data-file-tree-context-menu-root="true"` 필요.
6. **안정성·성능(최종 점검)**: ① 즐겨찾기 재빌드 중 이전 트리의 lazy `readDir`가 늦게 끝나 새 트리에 stale 노드를 `add`하던 race를 `loadEpoch` 가드로 차단. ② rebuild 이펙트가 `paths` **배열 identity**에 의존하면 store가 새 배열을 줄 때마다 트리를 통째로 재빌드하므로, 내용 기반 `pathsKey`(문자열)로만 키잉. ③ `subscribe` cadence를 컴파일본에서 실측 — 컨트롤러 `#emit()`는 **사용자 스크롤이 아니라 상태 변경(펼침/선택/검색/add) 때만** 호출돼서, lazy 로더의 "변경 때마다 디렉터리 스캔"은 고빈도가 아님(헛최적화 회피).
7. **루트만 정렬 끄기**: `@pierre/trees`의 `sort` 옵션은 트리 전체(루트+모든 자식)에 적용돼서, 커스텀 comparator로 "루트만 무정렬"을 구현하려면 자식 쪽 기본 정렬(폴더 우선 + **natural/numeric** 토큰 정렬, `file2`<`file10`)을 직접 재구현해야 했다(미묘한 회귀 위험). 대신 라이브러리 컴파일본을 읽어 `resetPaths(paths, { preparedInput })` 경로가 **presorted 입력은 검증·재정렬 없이 그대로 신뢰**함을 확인 → 루트는 `preparePresortedFileTreeInput(...)`로 등록 순서 그대로 넣고(`paths` 인자는 생략: 둘 다 주면 `paths`를 기본 정렬해 presorted와 일치하는지 검증하다 throw), 자식은 `model.add`가 기존처럼 `sort:'default'`(natural)로 삽입. comparator 재구현 없이 자식 동작은 무변경.

> 런타임(beta 라이브러리)의 빈 폴더 펼침·컨텍스트 메뉴 배치 등 일부 동작은 단위 테스트가 mock 기반이라, 실제 Electron에서 스모크 검증함(트리 표시·lazy 펼침·더블클릭 열기·우클릭 메뉴 위치·파일크기·검색창 모두 확인).

### 수정 파일

- **신규(common)**: `src/common/base/fs.ts`
- **신규(main)**: `src/main/application/interfaces/fsProvider.ts`, `src/main/infra/fsProvider/fsProvider.ts`, `src/main/application/useCases/fs/{readDir,getHomeDir}.ts`, `src/main/controllers/fs.ts`
- **신규(renderer)**: `src/renderer/application/interfaces/fsProvider.ts`, `src/renderer/infra/fsProvider/fsProvider.ts`, `src/renderer/widgets/file-explorer/{index.ts,settings.tsx,widget.tsx,treeModel.ts,widget.module.scss,icons/*}`
- **수정**: `src/common/ipc/channels.ts`, `src/main/index.ts`, `src/renderer/base/widgetApi.ts`, `src/renderer/application/useCases/widget/getWidgetApi.ts`, `src/renderer/init.ts`, `src/renderer/widgets/index.ts`, `src/renderer/base/state/ui.ts`(팔레트 기본 목록 — 새 위젯은 레지스트리 등록만으론 Add Widget에 안 뜨고 이 하드코딩 배열에도 추가해야 함), `jest.config.js`
- **테스트**: `tests/main/{infra/fsProvider,application/useCases/fs,controllers/fs}*`, `tests/main/infra/mocks/fsProvider.ts`, `tests/renderer/{infra/fsProvider,widgets/file-explorer}*`, `tests/renderer/infra/mocks/fsProvider.ts`, `tests/renderer/application/useCases/widget/getWidgetApi.spec.ts`(fs 모듈), `tests/renderer/widgets/setupSut.tsx`(fs mock), `tests/__mocks__/pierreTrees*.js`

---

## 32. File Explorer 위젯 — 숨김 파일 토글 · 큰 폴더 읽기 성능 · 실패 폴더 재시도 *(2026-06-06)*

[#31](#31-file-explorer-위젯--즐겨찾기-폴더-트리-탐색-2026-06-05) File Explorer 위젯의 후속 개선 세 가지. 새 설정 하나와, 겉으로 잘 안 보이지만 체감되는 성능·정확성 개선이 둘.

### 사용자 가시적 효과

- **숨김 파일 토글(설정)**: 설정에 **Show hidden files**(기본 **꺼짐**)를 추가했다. 켜기 전에는 `.git`·`.env` 같은 **점(`.`)으로 시작하는 항목**이 트리에서 숨는다. 토글하면 트리가 루트로 접혔다가 새 필터로 다시 읽는다(드물게 바꾸는 설정이라 허용). **판정 기준은 POSIX의 "이름이 `.`로 시작" 관례 하나** — Windows의 *숨김 파일 속성*(FILE_ATTRIBUTE_HIDDEN)은 보지 않는다(읽으려면 네이티브 바인딩이 필요해 의존성 추가를 피함). 즉 Windows에서 점 없이 숨김 속성만 걸린 파일은 여전히 보인다.
- **큰 폴더가 더 빠르게 열림**: **Show file sizes를 끄면** 폴더를 펼칠 때 파일마다 호출하던 `stat()`를 건너뛴다. 기존에는 크기를 표시하든 말든 항목 1개당 `readdir`+`stat` 두 번의 syscall이 나갔는데, 크기를 안 쓰면 `stat`을 생략해 파일 수천 개짜리 폴더에서 syscall이 절반으로 준다.
- **열다 실패한 폴더가 재시도된다**: 권한 거부·네트워크 드라이브 일시 끊김·읽는 중 폴더 삭제 등으로 펼치기가 실패하면, 기존에는 해당 폴더가 **"로드 완료"로 영구 표시돼 다시 펼쳐도 빈 채로 남았다**. 이제 실패 시 로드 표시를 되돌려, 다음에 다시 펼치면 재시도한다.

### 아키텍처

- `readDir`에 **옵션 인자**를 한 줄기로 추가했다 — `ReadDirOptions { includeHidden?, includeSizes? }`(둘 다 생략 시 기존 동작: 전부 포함·크기 수집). common 타입 → IPC 채널 args → main(useCase·controller·fsProvider) → renderer(infra·WidgetApi `fs.readDir`) 전 구간에 전달.
- main `fsProvider`가 `includeHidden:false`면 `name.startsWith('.')` 항목을 거르고, `includeSizes:false`면 `stat`을 건너뛴다(파일은 `size:0`).
- 위젯은 설정값을 ref로 들고 lazy-load 시 `{ includeHidden: showHiddenFiles, includeSizes: showFileSize }`로 호출. `showHiddenFiles`/`showFileSize` 변경 시 rebuild 이펙트가 재실행돼 새 필터로 다시 읽는다.

### 까다로웠던 포인트

- **`stat` 게이팅은 크기 표시 설정에 종속**: 크기 표시가 켜져 있으면 여전히 `stat`이 필요하므로, 성능 이득은 "크기 끔 + 큰 폴더"에서만 난다. 무조건 끄지 않고 설정과 연동.
- **숨김 판정의 크로스플랫폼 한계를 의도적으로 수용**: 점-접두 관례만 쓰는 게 "틀린" 게 아니라, 의존성 없이 dev 워크플로(대부분 dotfile)를 커버하는 실용적 선택. 설정 `moreInfo`와 타입 주석에 한계를 명시.
- **실패 재시도와 epoch 가드의 상호작용**: 즐겨찾기가 재빌드되면 `loadedDirs`가 비워지므로, 실패 catch의 `loadedDirs.delete(key)`는 이미 비워진 Set에 대해 무해한 no-op.

### 수정 파일

- **수정(common)**: `src/common/base/fs.ts`(`ReadDirOptions`), `src/common/ipc/channels.ts`(`IpcFsReadDirArgs`)
- **수정(main)**: `src/main/application/interfaces/fsProvider.ts`, `src/main/infra/fsProvider/fsProvider.ts`, `src/main/application/useCases/fs/readDir.ts`, `src/main/controllers/fs.ts`
- **수정(renderer)**: `src/renderer/application/interfaces/fsProvider.ts`, `src/renderer/infra/fsProvider/fsProvider.ts`, `src/renderer/base/widgetApi.ts`, `src/renderer/application/useCases/widget/getWidgetApi.ts`, `src/renderer/widgets/file-explorer/{settings.tsx,widget.tsx}`
- **테스트**: `tests/main/{infra/fsProvider,application/useCases/fs,controllers/fs}*`, `tests/renderer/{infra/fsProvider,application/useCases/widget/getWidgetApi,widgets/file-explorer/{settings,widget}}*`

---

## 30. 데이터 저장 안정성·정합성 개선 *(2026-06-04)*

겉으로 드러나지 않지만 사용자 데이터를 지키는 저장 경로를 점검해 네 가지를 고쳤다. 모두 "데이터가 조용히 사라지거나 어긋나는" 종류의 문제다.

### 사용자 가시적 효과

1. **종료 직전 변경이 사라지지 않음**: 상태 저장은 마지막 변경 후 5초 debounce로 디스크에 쓰인다. 그래서 위젯 배치를 바꾸거나 창을 옮긴 뒤 5초 안에 앱을 닫으면 그 변경이 저장되지 않았다. 이제 앱 종료(`will-quit`) 및 창 unload(`beforeunload`) 시 대기 중인 저장을 즉시 flush한다 — 손실 가능 구간이 ~5초에서 종료 순간 수준으로 줄었다. (디스크 쓰기 자체는 비동기라 best-effort이며, 완전한 동기 보장은 별도 과제로 남김.)
2. **특수문자 키 데이터 정합성**: 파일 저장 시 키의 특수문자(`:`, `/`, `*` 등)는 `_`로 치환해 파일명을 만드는데, 읽기(`getText`)·삭제는 치환된 경로를 쓰면서 **쓰기(`setText`)만 원본 키로 다른 경로에 저장**하고 있었다. 이런 키를 쓰는 데이터는 저장 후 다시 읽으면 보이지 않았다. 쓰기도 치환된 경로를 쓰도록 통일.
3. **삭제 누락/에러 전파**: 파일 삭제(`deleteItem`)가 `await` 없이 호출돼 삭제 완료 전에 후속 동작(broadcast 등)이 진행될 수 있었고, 존재하지 않는 파일 삭제 시 unhandled rejection이 떠다녔다. `await rm(.., { force: true })`로 완료 보장 + 비존재 안전 처리.
4. **로드 실패 시 빈 화면 방지**: 영속 상태 로드(`loadState`)가 예기치 못하게 reject하면 `onStoreReady`가 호출되지 않아 UI가 `isLoading` 상태로 영영 멈출 수 있었다. catch를 추가해 실패 시 기본 상태로 UI가 뜨도록 함.

### 아키텍처

- `debounce` 헬퍼에 `flush()` 추가 (대기 중인 호출을 마지막 인자로 즉시 실행 후 타이머 정리). 기존 `cancel()`과 대칭.
- `StateStorage`/`Store` 인터페이스에 `flush()` 추가 → `createStateStorage`가 내부 debounced save를 노출, `createStore`가 이를 위임. main은 `windowStore`를 `will-quit`에서, renderer는 `appStore`를 `beforeunload`에서 flush.
- `createStateStorage`가 그동안 무시하던 `debounceMsec` 인자를 실제로 사용하도록 수정 (기존엔 `5000` 하드코딩 — 모든 호출자가 5000을 넘겨 우연히 무해했음).
- `store.set`은 set 전후 상태를 `shallow` 비교해 **변경이 없으면 저장(및 debounce 타이머 재설정)을 스킵**. dragOver처럼 동일 상태를 재설정하는 고빈도 경로의 불필요한 작업을 줄임 (zustand는 이미 구독자 알림을 단락시키므로 리렌더에는 영향 없음).

### 까다로웠던 포인트

- **종료 flush는 "완벽한 동기 보장"이 아니다**: flush는 디스크 쓰기를 *발사*할 뿐 완료를 기다리지 않는다(setText는 async, 미await). 완전 보장하려면 `before-quit` preventDefault + IPC 왕복 + 저장 완료 ack가 필요해 범위를 키우게 되므로, 손실 구간을 대폭 줄이는 best-effort로 한정했다.
- **`fileDataStorage` 테스트의 `node:original-fs`**: 이 모듈은 Electron 전용이라 Jest에서 로드 불가. `jest.mock('node:original-fs', () => jest.requireActual('node:fs'), { virtual: true })`로 우회 (lint의 `no-require-imports` 때문에 `require` 대신 `jest.requireActual`).
- **렌더 성능은 대부분 이미 최적화돼 있었다**: 리스트 아이템 중 `WidgetLayoutItem`·`Palette`·`WorkflowSwitcher`는 이미 `memo`. `ShelfItem`만 누락이라 일관성 차원에서 `memo` 추가. resize/scroll throttle은 `mouseup` 최종값 보정·`scrollLeft` 위치 계산 의존 때문에 회귀 위험 대비 이득이 불확실해 측정 기반 별도 과제로 보류.

### 수정 파일

- **수정**: `src/common/helpers/debounce.ts` (`flush()` 추가)
- **수정**: `src/common/data/stateStorage.ts` (`debounceMsec` 존중 + `flush()` 노출)
- **수정**: `src/common/data/store.ts` (no-op set 게이팅, `loadState` catch, `flush()` 위임)
- **수정**: `src/common/application/interfaces/store.ts` (`flush` 추가)
- **수정**: `src/main/infra/dataStorage/fileDataStorage.ts` (`setText` 경로 통일, `deleteItem` await/force)
- **수정**: `src/main/index.ts` (`will-quit`에서 `windowStore` flush)
- **수정**: `src/renderer/init.ts` (`beforeunload`에서 `appStore` flush)
- **수정**: `src/renderer/ui/components/topBar/shelf/shelfItem.tsx` (`memo`)
- **테스트**: `tests/main/infra/dataStorage/fileDataStorage.spec.ts` (신규), `tests/common/helpers/debounce.spec.ts`, `tests/common/data/store.spec.ts`

---

## 33. 공유 상태(shared state) 위젯 헛 리렌더 제거 *(2026-06-06)*

`requiresState`를 선언한 위젯(현재 **Note** = `sharedDataKeys`, **File Opener** = `apps`)이 *자신과 무관한* 상태 변경에서도 매번 다시 그려지던 문제를 잡았다. (내부 성능 최적화 — 사용자에게 보이는 동작 변화는 없다.)

### 배경 / 문제

위젯 뷰모델은 `useAppState(state => createSharedState(state, requiresState))`로 공유 슬라이스를 구독한다. 그런데 `useAppState`의 기본 동등성은 **1단계 shallow**인데, `createSharedState`는 호출할 때마다 `{ apps: { appIds, apps } }`처럼 **새 래퍼 + 새 슬라이스 객체**를 만든다. shallow는 `.apps` 참조만 보는데 그게 매번 새 객체라 **항상 불일치** → store가 바뀔 때마다(편집 모드 토글, 드래그오버, 리사이즈 등 초당 수십 회) 해당 위젯이 리렌더됐다. 보드에 Note를 여러 개 깔고 위젯 하나를 리사이즈하면 모든 Note가 매 mousemove마다 다시 그려졌다.

> 단, `requiresState`가 없는(대다수) 위젯은 `createSharedState`가 `{}`를 반환하고 `shallow({}, {})`가 `true`라 영향이 없었다. 그래서 문제는 Note·File Opener 두 종류에 한정.

### 해결

`createSharedState` 결과 전용 동등 함수 `sharedStateEquals`(2단계 shallow — 각 슬라이스의 내부 필드를 참조로 비교)를 추가하고, 두 구독처를 `useAppState.useWithCustomEq(..., sharedStateEquals)`로 바꿨다.

### 까다로웠던 포인트 — "실시간성을 안 깨는가"의 증명

내부 참조로만 비교하면 *내용이 바뀌었는데 같은 참조라 stale하게 남는* 버그가 날 수 있다. 그래서 모든 공유 소스가 **불변 업데이트**(내용 변경 시에만 새 참조)임을 먼저 확인했다:

- `entities.apps` / `entities.sharedDataKeys` — `entityCollection.ts`의 모든 변경 함수가 `changed` 가드로 변경 시에만 새 컬렉션 반환, `entity.ts`의 `updateEntityState`도 `state.entities[key] !== newEntities`일 때만 새 state.
- `ui.apps.appIds` — `list.ts`의 `removeItemFromList`가 `slice()` 후 splice(원본 불변), 범위 밖이면 동일 참조.

따라서 참조가 바뀜 ⟺ 내용이 바뀜이 성립 → 내용 변경 시 즉시 리렌더(stale 불가), 무관한 변경에서만 렌더 생략. 비용도 슬라이스 1~2개 × 필드 1~2개 비교라 리렌더보다 훨씬 싸 성능 저하 없음. 소비자(`file-opener/settings.tsx`)도 `[sharedState.apps.appIds, sharedState.apps.apps]` 내부 참조에 의존하므로 이 동작과 정확히 일치.

### 수정 파일

- **수정(renderer)**: `src/renderer/base/state/shared.ts`(`sharedStateEquals` 추가), `src/renderer/ui/components/widget/widgetViewModel.ts`, `src/renderer/ui/components/widgetSettings/widgetSettingsViewModel.ts`
- **테스트**: `tests/renderer/base/state/shared.spec.ts`(`sharedStateEquals` describe 추가)

---

## 34. 워크플로우 그리드 2배 촘촘하게 (16×8 → 32×16) *(2026-06-06)*

위젯을 배치하는 작업판(worktable) 격자를 **가로 16칸×세로 8칸 → 32×16** 으로 잘게 쪼갰다. 각 칸이 절반 크기가 되어 위젯을 **더 정밀하게(반칸 단위로) 배치·리사이즈**할 수 있다.

### 사용자 가시적 효과

- 위젯 이동·리사이즈 시 스냅 간격이 절반으로 줄어 미세 조정이 가능해진다.
- 위젯 타입별 **최소 크기(minSize)도 ×2** 로 맞춰, 새 위젯의 기본 크기와 최소 크기는 *물리적으로 기존과 동일*하다(= 모양은 그대로, 조정만 촘촘). minSize는 `1×1`→`2×2`, `2×1`→`4×2`. (후속: 버튼 하나짜리인 **link-opener·file-opener·commander·timer**는 굳이 클 필요가 없어 `1×1`로 다시 내림.)
- 칸 사이 **여백·바깥 패딩을 6px → 4px** 로 줄여, 촘촘해진 격자에 맞춰 위젯들이 시각적으로도 더 붙어 보이게 했다.
- **⚠️ 마이그레이션 없음(의도적)**: 기존에 저장된 워크플로우의 위젯들은 옛 16×8 단위값을 그대로 들고 있어, 새 32×16 격자에서 **1/4 크기로 쪼그라들어 좌상단에 몰려 보인다.** 한 번 수동으로 다시 배치/리사이즈하면 된다(데이터 손실은 아님 — 단위 재해석일 뿐). 영속 상태 버전·migrate는 건드리지 않았다.

### 아키텍처

- 격자 칸 수는 컴파일타임 상수 `widgetLayoutVisibleCols`/`widgetLayoutVisibleRows` (`base/widgetLayout.ts`) 하나가 master. 칸 픽셀 크기는 뷰포트를 이 수로 나눠 산출하므로(`calcs.ts`), 상수만 바꾸면 격자 전체가 촘촘해진다.
- 위젯 `minSize`는 각 위젯 `index.ts`에 grid 단위로 선언되며 **위젯 추가 시 기본 크기도 겸한다**(`addWidgetToWorkflow`/`dropOnWorktableLayout`/`pasteWidgetToWorkflow`). 그래서 minSize를 같이 ×2 해야 "모양 유지 + 조정만 촘촘"이 성립.

### 까다로웠던 포인트

- **마이그레이션을 일부러 뺀 트레이드오프**: 정수 배율(×2)이라 기존 좌표에 2를 곱하면 무손실로 모양 보존이 가능했지만, 사용자 요청으로 마이그레이션 없이 진행 — 기존 레이아웃은 수동 재조정 전제. 영속 데이터 스키마는 그대로라 롤백도 안전.
- **margin/padding 6px → 4px**: 격자가 ×2로 촘촘해지면서 6px 여백이 상대적으로 두껍게 느껴져 4px로 축소(`calcs.ts`). 픽셀 변환 로직은 단위 테스트가 없어 시각 조정만으로 안전. 더 잘게(×3↑) 갈 경우엔 추가 재검토 필요.
- **(후속) 가로 격자 상한 클램프**: 그리드 셀은 `viewport ÷ cols`라 반응형이지만, 위젯 rect가 `x+w > cols`로 저장되는 걸 막는 상한이 없었다(이동·리사이즈 모두 하한만 클램프). 칸이 절반 크기가 되며 모서리를 격자 밖으로 몇 칸 넘기기 쉬워졌고, 넓은 화면에선 티가 안 나다가 **좁은 해상도(예: UHD→FHD)에서 위젯 오른쪽이 화면 밖으로 넘쳐** action bar(X·설정)가 안 보였다. `moveLayoutItem`(`_fixRect`에서 `x`를 `[0, cols-w]`로)과 `resizeLayoutItemByEdges`(오른쪽 모서리 성장폭을 `cols-x-w`로 캡)에 가로 상한을 추가. **세로축은 의도적으로 그대로** — worktable은 세로 스크롤되고 collision-stacking이 화면 아래로 밀어내는 동작에 의존한다. 기존에 이미 격자를 넘겨 저장된 위젯은 한 번 이동/리사이즈하면 안으로 들어온다(별도 마이그레이션 없음).

### 수정 파일

- **수정**: `src/renderer/base/widgetLayout.ts`(상수 32/16), 위젯 10종 `src/renderer/widgets/*/index.ts`(minSize ×2), `src/renderer/ui/components/worktable/widgetLayout/calcs.ts`(여백 6→4px)
- **테스트**: `tests/renderer/base/widgetLayout.spec.ts`, `tests/renderer/application/useCases/workflow/addWidgetToWorkflow.spec.ts`(32칸 기준 자동배치 좌표 정정)

---

## 35. Webpage 위젯 — 오디오 음소거 토글 *(2026-06-06)*

Webpage 위젯 액션바에 **음소거 버튼**을 추가했다. 음악·영상 사이트를 위젯으로 띄웠을 때 버튼 한 번으로 그 위젯의 소리만 끄고 켤 수 있다(ZOOM-IN과 COPY-URL 사이에 배치). 그동안 안 쓰던 Chromium/webview 기능(`setAudioMuted`)을 활용한 것.

### 사용자 가시적 효과

- 액션바의 스피커 아이콘 클릭 → 해당 위젯 음소거(아이콘이 스피커+X로, 툴팁이 "Unmute audio"로 바뀜). 다시 누르면 해제.
- 음소거 상태는 같은 webContents 안에서 페이지 내비게이션·새로고침을 넘어 유지된다(위젯 재시작 시에만 초기화).

### 아키텍처

- 상태는 위젯 컴포넌트의 `audioMuted`(세션 한정, 영속 X). 토글 시 effect가 `setAudioMuted(webview, muted)`로 적용 — `setAudioMuted`는 webContents 수명 동안 유지되므로 reload마다 재적용할 필요가 없어, `webviewIsReady`/`audioMuted` 변경 시에만 적용.
- 액션바 버튼은 `createActionBarItems`에 **선택적 콜백**(`onToggleMute`)으로 주입 — 콜백이 없으면(코어 버튼 단위 테스트 등) 버튼을 렌더하지 않아 기존 동작/테스트에 무영향.

### 수정 파일

- **신규**: `src/renderer/widgets/webpage/icons/{volume-on,volume-off}.svg`
- **수정**: `src/renderer/widgets/webpage/{actions.ts,actionBar.ts,widget.tsx,icons/index.ts}`
- **테스트**: `tests/renderer/widgets/webpage/actionBar.spec.ts`(MUTE 버튼 배치·라벨·토글)

---

## 36. Webpage 위젯 — 페이지 내 찾기 (Ctrl/Cmd+F) *(2026-06-06)*

Webpage 위젯에 **인페이지 검색**을 추가했다. 임베드한 페이지 안에서 텍스트를 찾을 수 있다 — 브라우저의 "페이지에서 찾기"와 같은 기능으로, Chromium webview의 `findInPage`/`stopFindInPage`/`found-in-page`를 활용한 것.

### 사용자 가시적 효과

- **Ctrl/Cmd+F** 또는 액션바의 돋보기 버튼으로 위젯 우상단에 작은 **찾기 바**가 열린다.
- 입력하면 즉시(증분) 검색·하이라이트, `n/m` 형태로 현재/전체 일치 수 표시.
- **Enter** = 다음, **Shift+Enter** = 이전, **Esc**(또는 ✕) = 닫기(하이라이트 해제 후 페이지로 포커스 복귀).

### 아키텍처

- 찾기 바 UI·상태(`findOpen`/`findQuery`/`findResult`)는 호스트(위젯 컴포넌트)에 있고, 결과는 webview의 `found-in-page` 이벤트로 받는다. 증분 검색은 `findQuery` 변경 시 effect가 `findInPage`를 호출(쿼리가 비거나 닫히면 `stopFindInPage('clearSelection')`).
- **Ctrl/Cmd+F 가로채기**는 줌-휠과 동일한 방식 — guest에 keydown 리스너를 주입(capture+preventDefault)하고 magic-prefix `console.log`로 호스트에 신호 → `console-message`에서 찾기 바를 연다. guest가 포커스를 가진 상태에서 호스트가 키를 못 보는 문제를 우회.
- 액션바 FIND 버튼은 `createActionBarItems`에 선택적 콜백(`onFind`)으로 주입(ZOOM-IN과 MUTE 사이) — 콜백이 없으면 렌더 안 함(기존 동작/테스트 무영향).

### 까다로웠던 포인트

- **count 리셋을 effect에서 빼냄**: 증분 검색 effect는 webview 동기화(`findInPage`/`stopFindInPage`)만 하고 `setFindResult`는 호출하지 않는다(이펙트 내 setState 경고 회피). 표시는 `findQuery !== ''`로 게이팅하고, 닫을 때만 `closeFind`에서 카운트를 리셋.

### 수정 파일

- **신규**: `src/renderer/widgets/webpage/icons/search.svg`
- **수정**: `src/renderer/widgets/webpage/{widget.tsx,actions.ts,actionBar.ts,icons/index.ts,widget.module.scss}`
- **테스트**: `tests/renderer/widgets/webpage/actionBar.spec.ts`(FIND 버튼 배치·라벨·핸들러)

---

## 37. File Explorer 위젯 — 컨텍스트 메뉴에 "Open containing folder" · "Copy name" *(2026-06-06)*

[#31](#31-file-explorer-위젯--즐겨찾기-폴더-트리-탐색-2026-06-05) File Explorer 우클릭 메뉴에 두 항목을 추가했다. 둘 다 위젯이 이미 가진 API(`shell`/`clipboard`)만 써서 새 배선 없이 붙인 것.

### 사용자 가시적 효과

- **Open containing folder**(파일에만 표시): 파일의 **상위 폴더를 OS 파일 관리자에서** 연다. 폴더는 기존 "Open in File Explorer"가 이미 그 역할을 하므로 파일 항목에만 나온다.
- **Copy name**(파일·폴더 모두): 전체 경로 대신 **이름만**(마지막 경로 세그먼트) 클립보드에 복사. 기존 "Copy Path"와 나란히.

### 아키텍처

- 메뉴는 `widget.tsx`의 `renderContextMenu` 인라인. "Open containing folder"는 `shell.openPath(부모경로)`(폴더 경로를 openPath하면 파일 관리자에서 열림), "Copy name"은 `clipboard.writeText(이름)`.
- 부모 경로 계산용 `dirnameOf(path)`를 `treeModel.ts`에 추가(POSIX `/`·Windows `\` 모두 처리, 후행 구분자 무시). 이름은 기존 `basenameOf` 재사용.

### 수정 파일

- **수정**: `src/renderer/widgets/file-explorer/{treeModel.ts,widget.tsx}`
- **테스트**: `tests/renderer/widgets/file-explorer/treeModel.spec.ts`(`dirnameOf`)

---

## 38. Webpage 위젯 — 로드 실패 시 에러 오버레이 + 재시도 *(2026-06-06)*

페이지 로드가 실패했을 때 **조용히 빈 화면**으로 두던 동작을 고쳤다. 이제 위젯에 "This page couldn't be loaded" + 실패한 URL + **Retry** 버튼 오버레이를 띄운다.

### 사용자 가시적 효과

- 네트워크 끊김·잘못된 도메인·DNS 실패·연결 거부 등으로 **메인 프레임 로드가 실패**하면 오버레이가 뜬다. Retry로 곧바로 다시 시도.
- 새 로드가 시작되면(주소 변경, 재시도, 자동 새로고침) 오버레이는 자동으로 사라진다.

### 까다로웠던 포인트

- **무엇을 "실패"로 볼지**: `did-fail-load`는 서브프레임(깨진 iframe 하나)·사용자 중단(`ERR_ABORTED`, code -3)에서도 발생한다. 위젯 전체를 가리지 않도록 **메인 프레임 + code≠-3** 일 때만 오버레이를 띄운다. 원작 코드에 주석으로 비활성화돼 있던 핸들러를 이 기준으로 되살렸다.
- (참고) 같은 흐름에서 검토했던 컨텍스트 메뉴 "Copy image"는 `<webview>` 태그에 `copyImageAt`이 없어(WebContents 전용) 보류 — 원작이 주석 처리해둔 이유와 동일. main IPC 배선이 필요해 별도 과제로 남김.

### 수정 파일

- **수정**: `src/renderer/widgets/webpage/{widget.tsx,widget.module.scss}`
- **테스트**: `tests/renderer/widgets/webpage/widget.spec.ts`(오버레이 표시·서브프레임/-3 무시·새 로드 시 해제)

---

## 39. Note 위젯 — 공유 노트 동기화 지연·누락 개선 *(2026-06-06)*

[#8](#8-note-위젯-공유-데이터-키-cross-workflow-sync) 같은 키를 공유하는 노트끼리 "간헐적으로 동기화가 안 된다"는 문제의 **수신 측 원인 세 가지**(N1·N2·N3)를 고쳤다. plain text·마크다운 모드 모두 적용.

### 사용자 가시적 효과

- **포커스 중 변경을 놓치지 않음(N1)**: 기존엔 노트에 **커서만 있어도** 다른 노트의 변경 알림을 그냥 버려서, 그 노트는 다음 변경 때까지 옛 내용으로 남았다. 이제 포커스 중 도착한 변경을 기억해뒀다가 **포커스를 떠날 때(blur) 반영**한다(편집 중인 타이핑은 안 건드림).
- **마크다운 모드도 동기화됨(N2)**: 마크다운을 켜면 보이는 편집기가 tinyMDE(별도 contenteditable)라, 기존엔 외부 변경이 textarea에만 반영되고 **화면(tinyMDE)엔 안 보였다**. 이제 외부 로드 시 에디터의 `setContent()`로 직접 갱신하고, 포커스/blur 감지도 tinyMDE 요소(`editor.e`) 기준으로 처리해 N1/blur-flush가 마크다운에서도 동작한다.
- **더 빠른 전파(N3)**: 저장 디바운스를 **3초 → 800ms**로 줄이고, **필드를 떠나면 즉시 저장(flush)**. 이전엔 "마지막 타이핑 후 3초"가 지나야 다른 노트에 반영돼 느리게 느껴졌다.

### 까다로웠던 포인트

- **타이핑 클로버 방지와 일관성의 균형**: 변경을 포커스 중 *드롭*하면 stale, 무조건 *반영*하면 입력 클로버. 그래서 "포커스 중엔 보류 → blur 시 반영"으로 절충. `shouldSkip` 콜백이 보류 플래그를 세우고, blur 핸들러가 (대기 중 저장 flush 후) 보류된 리로드를 수행.
- **마크다운 에디터 라이프사이클 정리**: 기존 마크다운 effect는 **deps가 없어 매 렌더마다 `new Editor`를 만들 수 있는** 구조였다. `isLoaded`(텍스트영역 마운트 후) 기준의 deps 있는 effect로 바꿔 한 번만 생성하고, cleanup에서 에디터 DOM(React 트리 밖)·`focusout` 리스너를 정리하도록 했다.

### 수정 파일

- **수정**: `src/renderer/widgets/note/widget.tsx`(보류-리로드, blur flush, 800ms 디바운스, 마크다운 `setContent`·`editor.e` 포커스·라이프사이클)
- **테스트**: `tests/renderer/widgets/note/widget.spec.ts`(800ms 디바운스·blur flush·포커스 중 보류 후 blur 반영·마크다운 `setContent`)

---

## 40. Note·To-Do List — 종료/언마운트 시 미저장 변경 flush *(2026-06-06)*

Note와 To-Do List의 디스크 저장은 디바운스(노트 800ms, 투두 500ms)라, **변경 직후 그 시간 안에 앱을 닫거나 워크플로우를 전환하면** 마지막 변경이 디스크에 안 써지고 사라질 수 있었다([#30](#30-데이터-저장-안정성정합성-개선-2026-06-04)에서 앱 전역 상태는 종료 시 flush하지만, 위젯별 디바운스는 별개였다).

### 사용자 가시적 효과

- 노트/투두를 바꾸고 **바로 앱을 종료**해도 마지막 변경이 보존된다. **워크플로우 전환 등으로 위젯이 언마운트**될 때도 마찬가지.

### 아키텍처

- 두 위젯에 `beforeunload`(앱 종료) 리스너 + 언마운트 cleanup에서 디바운스 saver의 `flush()`를 호출하는 effect를 추가. `flush()`는 대기 중인 호출이 있을 때만 즉시 실행(없으면 no-op)이라 불필요한 쓰기는 없다.
- 투두 saver는 scope(프로젝트/`'app'`)별 공유라 어느 형제 위젯에서 flush해도 같은 보류 쓰기를 비운다.

### 수정 파일

- **수정**: `src/renderer/widgets/note/widget.tsx`, `src/renderer/widgets/to-do-list/widget.tsx`
- **테스트**: `tests/renderer/widgets/{note,to-do-list}/widget.spec.ts`(beforeunload flush)

---

## 41. Webpage 위젯 다운로드 — 폴더 지정(기본 OS Downloads, 설정에서 변경) *(2026-06-06)*

기존엔 Webpage 위젯에서 다운로드할 때마다 **OS 저장 대화상자**가 떴다. 이제 지정한 폴더로 **자동 저장**하며, 기본값은 **OS 기본 다운로드 폴더**다.

### 사용자 가시적 효과

- 다운로드가 대화상자 없이 다운로드 폴더로 바로 저장된다. 같은 이름이 있으면 브라우저처럼 `이름 (1).ext`로 번호가 붙는다.
- **앱 설정(Application Settings) → Download folder**에서 폴더를 바꿀 수 있다. 비워두면 OS 기본 Downloads 폴더. "Browse…"로 폴더 선택, "Use default"로 기본값 복귀.

### 아키텍처

- **main**: `downloadManager`(`infra/downloads`)가 `app.on('session-created')`로 모든 세션(앱 창 + webview 파티션)의 `will-download`를 가로채 지정 폴더로 `setSavePath`. 윈도우 생성 전에 등록해 파티션 세션까지 포함. 파일명 충돌 dedupe는 순수 함수 `resolveUniqueSavePath`.
- **설정 전파**: 전역 설정이라 `mainHotkey`와 동일한 경로를 미러링 — `AppConfig.downloadDir`(영속) → 스토어 구독(`initDownloadDir`)이 변경 시 IPC(`set-download-dir`)로 main의 `setDownloadDir`에 전달.
- **위젯별이 아니라 전역인 이유**: webview 다운로드는 파티션(세션) 단위로 일어나고 여러 위젯이 세션을 공유할 수 있어, 위젯별 폴더는 충돌·복잡도가 큼.

### 까다로웠던 포인트

- `AppConfig`에 필드를 추가하면 모든 생성자에 파급되지만, 기본값은 `createUiState`·`fixtureAppConfig` 등 소수 지점에만 있어 안전하게 추가. 영속 상태 마이그레이션은 불필요(병합 시 기본값 `''`가 빈 자리를 채움).

### 수정 파일

- **신규(main)**: `infra/downloads/downloadManager.ts`, `application/interfaces/downloadManager.ts`, `application/useCases/download/setDownloadDir.ts`, `controllers/download.ts`
- **신규(renderer)**: `application/interfaces/downloadProvider.ts`, `infra/download/downloadProvider.ts`, `application/useCases/download/initDownloadDir.ts`
- **신규(common)**: `ipc/channels.ts`의 `set-download-dir` 채널
- **수정**: `src/main/index.ts`, `src/renderer/init.ts`, `base/appConfig.ts`, `base/state/ui.ts`, `applicationSettings`(뷰모델·컴포넌트·scss)
- **테스트**: `resolveUniqueSavePath`·`setDownloadDir`·`initDownloadDir`, 설정 fixture 갱신

---

## 42. 워크플로우 배경 커스텀 — 전역 배경색 + 배경 이미지 *(2026-06-06)*

작업판(worktable) 배경을 **앱 전역 설정**에서 커스텀할 수 있다. 단색 배경색과/또는 배경 이미지를 지정할 수 있고, 둘 다 비우면 테마 기본 배경.

### 사용자 가시적 효과

- **Application Settings**에 "Workflow background color"(컬러 피커 + Use default), "Workflow background image"(파일 선택 + 표시 모드 + Clear), **"Workflow background opacity"(0–100% 슬라이더)** 를 추가.
- 배경 이미지 표시 모드: **Fill(cover) / Fit(contain) / Center / Tile**.
- **투명도**: 커스텀 배경(색+이미지)의 불투명도를 조절. 낮추면 테마 기본 배경이 비쳐 보인다.
- 위젯 뒤(투명한 widgetLayout 아래)에 적용되어 위젯 가독성은 유지.

### 아키텍처

- **전역인 이유**: 워크플로우별이 아니라 앱 전역. webview 다운로드 폴더와 마찬가지로 전역이 단순·일관(워크플로우별로 다른 배경의 실익이 적고 설정 분산만 늘어남).
- **렌더링**: 커스텀 배경을 worktable 안의 **전용 레이어 div**(절대배치·`pointer-events:none`·위젯 뒤)에 적용. 색은 `backgroundColor`, 이미지는 `backgroundImage` + 모드별 `size/repeat/position`, 투명도는 그 레이어의 `opacity`. **레이어를 분리한 이유**: worktable 루트에 직접 `opacity`를 주면 그 위의 위젯들까지 흐려지기 때문 — 배경 레이어에만 opacity를 줘 위젯은 또렷하게 유지. worktable 루트의 테마 배경은 그대로라, 반투명 커스텀 배경이 테마와 자연스럽게 섞인다.
- **이미지 로딩(data URL)**: 로컬 이미지 파일을 렌더러에서 바로 못 쓰므로(CSP), **favicon과 동일하게 main이 파일을 읽어 base64 data URL로 IPC 전달**(`fs-get-image-data-url`). main `fsProvider.getImageDataUrl`이 확장자→MIME 매핑 + 20MB 상한. worktable 뷰모델이 경로 변경 시 비동기로 data URL을 받아 적용.
- **설정 저장**: `AppConfig`(전역, 영속)에 `bgColor`/`bgImage`/`bgImageMode`. 마이그레이션 불필요(병합 시 기본값).

### 까다로웠던 포인트

- **로컬 이미지 표시**: `file://`은 커스텀 프로토콜 오리진의 CSP에서 막히고, 앱 커스텀 프로토콜은 번들 파일만 서빙. 그래서 검증된 data-URL 경로(favicon 방식) 채택 — 추가 보안 표면·CSP 변경 없음.

### 수정 파일

- **신규(common)**: `ipc/channels.ts`의 `fs-get-image-data-url` 채널
- **신규(main)**: `application/useCases/fs/getImageDataUrl.ts`. `infra/fsProvider`·`controllers/fs`·`index.ts`에 배선
- **신규(renderer)**: `application/useCases/fs/getImageDataUrl.ts`. `infra/fsProvider`·`init.ts`에 배선
- **수정**: `base/appConfig.ts`(`bgColor`/`bgImage`/`bgImageMode`/`bgOpacity`), `base/state/ui.ts`, `worktable`(뷰모델·컴포넌트·scss), `applicationSettings`(뷰모델·컴포넌트)
- **테스트**: worktable 배경 레이어(색·이미지·투명도) 적용, main `fsProvider.getImageDataUrl`, fs 컨트롤러, 설정 fixture 갱신

---

## 43. 리사이즈 중 위젯 투명도 0.5 → 0.8 *(2026-06-06)*

위젯을 리사이즈하는 동안 위젯이 50%까지 투명해져 내용이 잘 안 보이던 것을 **80%(0.8)** 로 완화했다. 리사이즈 중 위젯은 그리드에 스냅되지 않은 라이브 좌표로 떠 있어 그 아래 "스냅될 자리(고스트)"를 보여주려고 반투명 처리하는데(upstream 기본값 0.5), 너무 흐려 위젯 내용 식별이 어려웠다. 고스트는 여전히 살짝 비치되 위젯은 또렷하게.

### 수정 파일

- **수정**: `src/renderer/ui/components/app/uiTheme/themes/{light,dark}.ts`(`widgetLayoutItemResizingOpacity`)

---

## 44. 위젯 모서리 살짝 둥글게 (4px) *(2026-06-06)*

위젯 테두리가 직각이라 다소 딱딱해 보이던 것을 **4px 라운드**로 살짝 둥글렸다.

- 외곽 박스(`.layout-item`)에 `border-radius`를 주고, 내부 위젯(`.widget`)에 같은 `border-radius` + `overflow:hidden`을 줘 헤더·본문이 둥근 모서리에 맞게 클립되도록 함.
- `.layout-item`의 하단 패딩 트릭(`:after` 스페이서)·리사이즈 핸들은 `.widget` 바깥이라 클립 영향 없음.

### 수정 파일

- **수정**: `src/renderer/ui/components/worktable/widgetLayout/widgetLayout.module.scss`, `src/renderer/ui/components/widget/widget.module.scss`

---

## 45. 워크플로우 바 위치 선택 — 위/아래/좌/우 + 사이드 너비 조절 *(2026-06-06)*

워크플로우 탭 바(프로젝트 스위처·편집 토글·팔레트가 함께 있는 그 바)를 **위/아래/왼쪽(기본)/오른쪽** 중 원하는 위치에 둘 수 있다. 좌/우(사이드)일 때는 세로 패널이 되고 **너비를 조절**할 수 있다. (신규 설치 기본값은 왼쪽 사이드; appConfig는 영구 저장되므로 기존 설치는 저장된 값을 유지.)

### 사용자 가시적 효과

- **Application Settings → "Workflow bar position"** 에서 Top / Bottom / Left / Right 선택. 좌/우면 너비(px) 입력칸이 함께 나온다.
- 좌/우일 때 바는 세로 사이드 패널, 탭은 세로로 쌓이고, 본문(Worktable)이 나머지를 채운다.
- 좌/우 사이드일 때 **에딧 모드에서 바와 본문 사이 경계를 마우스로 드래그**해 너비를 실시간 조절할 수 있다(120~600px로 클램프, 자동 저장). 일반 모드에서는 설정의 너비 입력칸으로만 조절(실수로 끌리는 것 방지).

### 아키텍처

- 전역 설정 `AppConfig.workflowBarPos`('top'|'bottom'|'left'|'right')·`workflowBarWidth`(px).
- **레이아웃**: `app.tsx`가 위치에 따라 — 위/아래는 기존 세로 스택에서 바를 본문 앞/뒤로, 좌/우는 `[바 + 본문]`을 가로 행(`.body-row`, right는 `row-reverse`)으로 묶음.
- **세로 바**: `workflowSwitcher`가 좌/우면 `is-vertical` 클래스(+ 인라인 width)로 `flex-direction:column`·세로 탭·테두리 방향(좌=오른쪽 테두리/우=왼쪽 테두리)을 전환. 아래는 `is-bottom`으로 테두리만 위로.
- **드래그 리사이저**: `.body-row` 안 바와 본문 사이에 얇은 스플리터(`.workflow-bar-resizer`, `cursor:col-resize`). `mousedown` 시 시작 X·시작 width·방향(left=+1/right=−1)을 ref에 저장하고 `window` `mousemove`로 `setWorkflowBarWidthUseCase(시작width + 방향×ΔX)`를 호출 → store 갱신·자동 저장. `mouseup`에 리스너 해제. 너비 클램프(120~600)·반올림·동일값 무시는 use case에서.

### 까다로웠던 포인트

- 드래그 중 매 `mousemove`마다 store를 갱신하지만, 디스크 저장은 store의 디바운스에 맡기고 재렌더는 메모이즈된 컴포넌트에 한정돼 비용이 작다. 별도 로컬 상태 없이 단일 진실 소스(store)로 단순화.
- **webview 이벤트 가로채기**: 드래그가 일반 모드(바 상시 표시)에서 일어나므로, 커서가 살아있는 `<webview>` 위젯 위를 지나면 Electron webview가 `mousemove`/`mouseup`을 삼켜 드래그가 멈추거나 "끼이는" 문제가 생긴다. 드래그 중에만 전체 화면 투명 오버레이(`.resize-overlay`, `position:fixed; inset:0; z-index:9999`)를 호스트 문서에 띄워 모든 마우스 이벤트가 호스트로 들어오게 했다(#38 로드 오류 오버레이가 webview 위에 떠는 것과 동일 원리). 일관된 리사이즈 커서·텍스트 선택 방지도 덤.
- **리사이저가 worktable 왼쪽 여백을 먹던 버그**: 리사이저에 넓은 클릭 영역을 주려고 `width:1px; margin:0 -2px`를 썼더니 flex 주축에서 순수 차지 공간이 −3px가 되어, worktable이 바 쪽으로 3px 끌려가 좌측 위젯 여백이 4px→1px로 좁아졌다(상단은 영향 없어 비대칭으로 보임). 리사이저를 `width:0`(여백 0)로 만들고 클릭 영역은 영역 밖으로 넘치는 `::before` 의사요소로 제공(의사요소도 호스트의 마우스 핸들러를 트리거하므로 레이아웃 공간 없이 넓은 히트 타깃 확보). worktable이 바에 딱 붙어 4px 여백 복원.
- **바 크기 변화 시 그리드 미반영**: 그리드 셀 크기는 worktable 실측값(`useElementRect`)으로 계산하는데, 이 훅이 `window.resize`와 마운트 시에만 재측정했다. 바를 사이드로 옮기거나 너비를 드래그하면 worktable 크기가 창 리사이즈 없이 바뀌므로 그리드가 옛 치수로 남아 위젯이 어긋났다. `ResizeObserver`를 추가해 worktable 크기가 바뀔 때마다 재측정(드래그 중 실시간 리플로우 포함). jsdom엔 `ResizeObserver`가 없어 `typeof` 가드.
- `right`는 `.body-row`가 `row-reverse`라 DOM 순서 `[바, 리사이저, 본문]`이 시각적으로 `[본문, 리사이저, 바]`로 뒤집힌다 — 리사이저가 양쪽 모두 바의 안쪽 경계에 정확히 위치하므로 위치 분기 불필요, 드래그 방향만 부호(`dir`)로 처리.

### 수정 파일

- **신규**: `application/useCases/applicationSettings/setWorkflowBarWidth.ts`(너비 갱신 use case)
- **수정**: `base/appConfig.ts`(`workflowBarPos`/`workflowBarWidth`), `base/state/ui.ts`, `init.ts`(use case 조립), `app`(컴포넌트·뷰모델·scss), `workflowSwitcher`(컴포넌트·뷰모델·scss), `applicationSettings`(컴포넌트), `ui/hooks/useElementRect.ts`(ResizeObserver)
- **테스트**: `setWorkflowBarWidth.spec.ts`(클램프·반올림·동일값 무시), `workflowSwitcher.spec.tsx`(세로 패널 width 적용/미적용), `app.spec.tsx` 및 설정 fixture 갱신

---

## 46. Web Query 기본 엔진 확충 (Naver·YouTube·Namuwiki·Perplexity 등) *(2026-06-06)*

Web Query 위젯의 **Query Engine** 드롭다운(빌트인 검색 엔진 목록)에 자주 쓰는 항목들을 기본 제공으로 추가했다. 더 이상 Custom Engine으로 직접 URL을 넣지 않아도 된다.

| 엔진 | URL 템플릿 |
|---|---|
| Naver | `https://search.naver.com/search.naver?query=QUERY` |
| Naver (Maps) | `https://map.naver.com/p/search/QUERY` |
| Naver (Shopping) | `https://search.shopping.naver.com/ns/search?query=QUERY` (네이버스토어) |
| Naver (Stock) | `https://stock.naver.com/domestic/stock/QUERY/price` (QUERY=종목 코드, 예 005930) |
| Naver (Dictionary) | `https://dict.naver.com/#/search?query=QUERY` (통합 사전; 국어만 `ko.`/영어만 `en.`) |
| Naver (News) | `https://search.naver.com/search.naver?where=news&query=QUERY` |
| Namuwiki | `https://namu.wiki/Search?q=QUERY` |
| Daum | `https://search.daum.net/search?q=QUERY` |
| Kakao Map | `https://map.kakao.com/?q=QUERY` |
| YouTube | `https://www.youtube.com/results?search_query=QUERY` |
| ChatGPT | `https://chatgpt.com/?q=QUERY` |
| Claude | `https://claude.ai/new?q=QUERY` |
| Perplexity | `https://www.perplexity.ai/search?q=QUERY` |
| Google Scholar | `https://scholar.google.com/scholar?q=QUERY` |
| Google Translate | `https://translate.google.com/?sl=auto&tl=ko&text=QUERY&op=translate` |
| Papago | `https://papago.naver.com/?sk=auto&tk=ko&st=QUERY` |
| Aladin | `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchWord=QUERY` |
| Kyobo Book | `https://search.kyobobook.co.kr/search?keyword=QUERY` |

> QUERY는 `encodeURIComponent`로 인코딩돼 치환되므로 공백·한글 문장(번역)·종목명도 안전. 단 Naver (Stock)는 검색이 아니라 종목 **코드**로 가격 페이지에 직행하는 형식이라 6자리 코드를 입력해야 한다(placeholder로 안내). 한국어 맞춤법 검사기는 전부 입력 박스형 인터랙티브라 URL 쿼리로 결과에 못 가 추가 불가.

기존 엔진 배열(`engines`)에 항목만 추가하는 순수 가산 변경 — `enginesById`는 자동 파생되고, 기존 위젯은 엔진 id로 참조하므로 영향 없음. (목록 정렬에 맞춰 Naver는 Google 다음, YouTube는 맨 끝에 배치.)

### 수정 파일

- **수정**: `widgets/web-query/settings.tsx`(`engines` 배열에 3개 추가)

---

## 47. Web Query 위젯: 한 위젯에 여러 검색창 *(2026-06-06)*

기존엔 Web Query 위젯 하나당 검색 1개였는데, 이제 **한 위젯에 여러 검색창을 세로로 쌓을** 수 있다. 각 줄은 자기 엔진으로 독립 검색하고, placeholder로 무슨 검색인지(엔진명/설명) 표시된다. "Google / Naver / GitHub …"를 한 위젯에 모아두는 식.

### 사용자 가시적 효과

- 위젯 본문이 **검색창 목록**(세로 스택)으로 바뀌고, 줄이 많으면 본문이 스크롤된다. 각 줄은 그 줄의 엔진/URL로 따로 검색.
- 빌트인 엔진의 placeholder가 **엔진 이름까지 포함**(예: 그냥 "Search"가 아니라 "Search Google")해서 검색창이 여러 개일 때 구분된다. 동작 문구가 이미 엔진명을 포함하면 중복 안 함(예: "Search Wikipedia").
- 설정 화면은 **항목당 한 줄짜리 가로 레이아웃**: `#N  ↑ ↓  [엔진]  [(커스텀이면)설명/URL]  [쿼리 템플릿]  ✕`. 항목을 추가해도 세로로 길어지지 않는다. 빌트인 엔진 항목은 설명/URL이 자동이라 칸을 숨겨 더 짧게. 맨 아래 **+ Add query**. 모드(Browser/Webpages)는 위젯 단위로 유지.

### 아키텍처

- `Settings`를 단일 `{mode, engine, descr, query, url}`에서 `{mode, entries: QueryEntry[]}`로 변경. `QueryEntry = {id, engine, descr, query, url}`.
- 위젯은 `entries`마다 `QueryRow`(자체 입력 상태 보유)를 렌더 → 줄별 독립 제출. 엔진/URL/placeholder 계산은 `computeEntry`로 분리(기존 단일 로직과 동일).
- 에디터는 항목 리스트를 추가/삭제/순서이동(swap)·항목별 엔진 선택으로 관리. 각 입력 id에 `entry.id`를 붙여 라벨 연결을 고유화.

### 까다로웠던 포인트

- **무중단 마이그레이션**: 기존 위젯은 옛 단일 형태로 저장돼 있다. `createSettingsState`가 `entries` 배열이 없고 `engine/descr/url/query` 중 하나라도 문자열이면 옛 형태로 보고 `entries:[{그 값}]`으로 감싼다. 별도 마이그레이션 코드·버전 업 없이 로드 시 정규화 → 기존 위젯·데이터 손실 0.
- 엔트리 `id`는 없으면 생성(`crypto.randomUUID`, jsdom 대비 폴백)하고 있으면 보존 → 첫 저장 후 안정화. React key·항목 타깃팅에 사용.

### 수정 파일

- **신규**: `widgets/web-query/settings.module.scss`(가로 항목 레이아웃 — settings-screen-panel의 `width:240px;display:block`을 specificity로 오버라이드)
- **수정**: `widgets/web-query/settings.tsx`(모델·정규화·가로 에디터·`enginePlaceholder`), `widgets/web-query/widget.tsx`(다중 행 렌더·엔진명 포함 placeholder), `widgets/web-query/widget.module.scss`(세로 스택)
- **테스트**: `web-query/fixtures.ts`(엔트리 기반 fixture), `settings.spec.ts`·`widget.spec.ts` 재작성(정규화·마이그레이션·다중 엔트리·추가/삭제/순서)

---

## 48. Top Bar 위젯 팝업 크기 조절 + worktable 크기 유지 *(2026-06-06)*

위젯을 Top Bar(shelf)에 올리면 hover 시 뜨는 팝업이 **모든 위젯에 300×150px로 고정**돼 있어 worktable에서 키워둔 위젯도 작게 보였다. 이제 **위젯별로 팝업 크기를 저장**하고, worktable에서 올릴 때 그 크기로 시작하며, 에딧 모드에서 드래그로 조절할 수 있다.

### 사용자 가시적 효과

- **(B) worktable → Top Bar로 위젯을 드래그하면** 그 시점의 worktable 픽셀 크기로 팝업 크기가 초기화된다(150~1200 × 80~900으로 클램프). 팔레트/붙여넣기로 올린 위젯은 기본값 300×150.
- **(C) 에딧 모드에서 팝업 우하단 모서리를 드래그**해 크기를 조절하고, 그 크기가 영구 저장된다. 워크플로우 바 너비 리사이저와 **일관되게 에딧 모드에서만** 수정 가능.

### 아키텍처

- `WidgetListItem`에 `w?`/`h?`(px) 추가(없으면 기본값). shelf 상태는 영구 저장 대상이라 자동 저장된다.
- **(C)** `setShelfItemSize` use case(클램프·반올림·동일값 무시). `shelfItem`이 에딧 모드에서 리사이즈 핸들 렌더 → `window` mousemove로 실시간 갱신.
- **(B)** worktable 드래그 시작(`onItemDragStart`)에서 `getBoundingClientRect`로 픽셀 크기를 캡처해 `dragDrop.from.worktableLayout.sizePx`에 저장 → `dropOnTopBarList`가 shelf 항목 생성 시 `w/h`로 시드(클램프).

### 까다로웠던 포인트

- shelf 팝업은 평소 `:hover`/`:focus-within`으로만 보이는데, 리사이즈 드래그 중 커서가 탭 밖으로 나가면 팝업이 숨어 드래그가 끊긴다. 드래그 중엔 `is-resizing` 클래스로 **강제 표시**하고, 전체화면 투명 오버레이로 webview 위에서도 이벤트가 끊기지 않게 했다(#38·#45와 동일 원리).
- worktable 크기는 그리드 단위라 px 변환에 뷰포트가 필요 → use case(상태 레벨)에서 못 구한다. 그래서 렌더러의 드래그 시작 시점에 실측 px를 캡처해 드래그 상태로 전달하는 방식으로 해결.

### 후속 보완

- **팝업이 창 밖으로 넘치지 않게 클램프 보완**: 기존엔 팝업의 좌측 x좌표만 창 안으로 보정하고 너비·높이는 그대로여서, 저장된 팝업이 현재 창보다 크면(창을 줄였을 때 등) 오른쪽/아래로 삐져나갔다. 이제 *표시* 크기를 창 경계 안으로 클램프한다(저장 크기는 유지 → 창이 다시 커지면 원래 크기로 복원). 클램프 수학은 순수 함수 `clampShelfPopupBox`로 분리해 단위 테스트.
- **리사이즈 드래그 리스너 누수 수정(내부)**: 드래그 도중(마우스 떼기 전) 컴포넌트가 언마운트되면 `window`의 `mousemove`/`mouseup` 리스너가 정리되지 않던 문제를 언마운트 cleanup으로 해소.

### 수정 파일

- **신규**: `application/useCases/shelf/setShelfItemSize.ts`
- **수정**: `base/widgetList.ts`(`w`/`h`), `base/state/ui.ts`(`sizePx`), `init.ts`, `topBar/shelf`(viewModel·item·shelf·scss; 후속: `clampShelfPopupBox` 클램프 + 리스너 cleanup), `dragDrop/dragWidgetFromWorktableLayout.ts`·`dropOnTopBarList.ts`, `widgetLayoutViewModel.ts`(px 캡처)
- **테스트**: `setShelfItemSize.spec.ts`(신규), `dropOnTopBarList.spec.ts`(sizePx 시드), `shelf.spec.tsx`(deps + 언마운트 리스너 정리), `shelfItemViewModel.spec.ts`(신규: 클램프)

---

## 49. 손상된 영구 상태(persistent state) 안전 폴백 *(2026-06-07)*

디스크에 저장된 앱/윈도우 상태 파일(`freeter-data`)이 손상되었거나 구조가 깨졌을 때, 깨진 데이터를 그대로 불러와 UI가 잘못 뜨거나 마이그레이션이 터지는 대신 **기본값으로 안전하게 폴백**한다. 매 변경마다 자동 저장하는 구조라 한 번 깨진 상태가 다시 저장돼 굳는 것을 막는 의미도 있다.

### 사용자 가시적 효과

- 정상 사용 시엔 변화 없음. 평소에는 드러나지 않지만, 데이터 파일이 손상된 경우(수동 편집, 부분 기록, 디스크 손상 등) 앱이 깨진 상태로 뜨지 않고 초기 상태로 복구되어 계속 사용 가능하다.

### 아키텍처

- `createStateStorage`에 선택적 검증기 `validatePersistentState?`를 추가. `loadState`는 (1) 버전 래퍼(`isVersionedObject`) 확인 후, (2) `migrate`/unwrap을 `try/catch`로 감싸 손상 데이터가 던지면 `null` 반환, (3) 검증기가 있고 통과하지 못하면 `null` 반환 → 상위 store가 기본값으로 시작.
- 검증기는 마이그레이션 *후* 형태를 검사: `isPersistentWindowState`(7개 숫자/불리언 필드), `isPersistentAppState`(`entities`·`ui`가 plain object). 현재 버전의 형태만 보므로 정상 데이터를 거르지 않는다.

### 까다로웠던 포인트

- `createStateStorage`는 제네릭이라 영구 상태의 형태를 모른다 → 형태 검증을 호출부에서 주입하는 검증기로 위임. store 레벨엔 이미 `loadState` 실패 시 기본값 폴백하는 `.catch`가 있었지만, **구조는 정상이나 내용이 깨진** 데이터는 통과하던 빈틈을 이 검증기가 메운다.
- 이전부터 `store.spec.ts`에 `it.skip`으로 막혀 있던 "invalid data면 기본값 유지" 테스트가 검증 로직 부재로 의미가 없던 것을, 실제로 영구 상태를 병합하는 merge로 바꿔 **검증 동작을 실증하도록 살림**. `stateStorage.spec.ts`의 주석 처리된 TODO 테스트도 검증/throw 케이스로 부활.

### 수정 파일

- **수정**: `common/data/stateStorage.ts`(검증기·try/catch), `main/base/state/window.ts`(`isPersistentWindowState`), `renderer/base/state/app.ts`(`isPersistentAppState`), `main/data/windowStateStorage.ts`·`renderer/data/appStateStorage.ts`(검증기 주입)
- **테스트**: `stateStorage.spec.ts`(검증/throw), `store.spec.ts`(skip 해제), `window.spec.ts`·`app.spec.ts`(검증기), `windowStateStorage.spec.ts`·`appStateStorage.spec.ts`(인자), `fixtures/stateStorage.ts`(validate 지원)

---

## 50. 위젯 카운트 표시 — To-Do 완료/전체, Note 단어/글자 *(2026-06-07)*

위젯 하단에 작은 상태바를 두어 한눈에 분량을 파악할 수 있게 했다.

### 사용자 가시적 효과

- **To-Do List**: 하단에 `완료 / 전체`(예: `1 / 3 done`, 비었으면 `No items`)를 표시.
- **Note**: 하단에 `단어 수 · 글자 수`(예: `3 words · 13 chars`)를 표시. 입력하면 (약간의 디바운스 뒤) 실시간 갱신.
- 둘 다 위젯에 이름을 지정해도 항상 보인다(헤더 타이틀이 아니라 위젯 본문 하단 바).

### 아키텍처

- 표시를 위젯 **본문 내부 로컬 상태**로 계산 — 앱 스토어(`ui.widgetDynamicTitles`)를 건드리지 않아 동적 타이틀 경로의 저장/리렌더 부하가 없다.
- **To-Do**: 카운트는 discrete 액션(추가/체크/삭제)에서만 바뀌므로 렌더 시 동기 계산. 뷰포트를 flex 컬럼으로 감싸 스크롤 영역과 카운트 바를 분리.
- **Note**: textarea가 uncontrolled(`defaultValue`+ref, 키 입력당 리렌더 회피)라, 카운트 `setState`를 **250ms 디바운스**해 그 설계를 유지. plain·markdown(TinyMDE) 모드 모두 하단 18px 여백을 둬 바를 띄운다.

### 까다로웠던 포인트

- Note 글자 수를 `setDynamicTitle`(헤더)로 하면 **키 입력마다 앱 스토어 write**가 발생해 부적절 → 로컬 상태 + 디바운스로 해결.
- Note는 markdown 모드에서 `:global .TinyMDE`가 절대배치(bottom:0)라, 카운트 바 자리를 위해 textarea와 TinyMDE 양쪽의 `bottom`을 함께 조정해야 했다.

### 수정 파일

- **수정**: `widgets/to-do-list/widget.tsx`·`widget.module.scss`, `widgets/note/widget.tsx`·`widget.module.scss`
- **테스트**: `to-do-list/widget.spec.ts`(카운트·빈 목록), `note/widget.spec.ts`(로드 카운트·타이핑 갱신)

---

## 51. 새 위젯: D-Day *(2026-06-07)*

목표일까지/이후의 날짜 수를 세는 **디데이 위젯**을 추가. 시험·마감·기념일 같은 카운트다운을 워크플로우에 올려둘 수 있다.

### 사용자 가시적 효과

- 한 위젯에 **여러 개의 디데이**를 둘 수 있다(설정에서 라벨 + 날짜를 행으로 추가/삭제/순서이동). 위젯에는 `라벨 … D-카운트`가 목록으로 표시된다.
- 한국식 표기: 목표일은 **D-DAY**, 이전은 **D-30**, 이후는 **D+15**. 당일 항목은 강조색으로 표시.
- 자정이 지나면 카운트가 **자동으로 갱신**된다(앱을 켜둔 채 날짜가 바뀌어도 정확).
- 설정의 **"날짜 표시" 토글**을 켜면 각 카운트 아래에 실제 날짜+요일(`2026-07-07 (화)`)이 표시된다(기본 꺼짐). 요일 표기는 OS 로케일을 따라간다(한글/영문 자동).

### 아키텍처

- `_template` 스캐폴드를 복사해 만든 표준 위젯(`widgets/d-day/`). 데이터 저장·`requiresApi` 불필요(설정의 날짜만 사용).
- 멀티 엔트리 설정 에디터는 Web Query(#47)의 add/remove/reorder 패턴을 그대로 따른다.
- 날짜 계산은 순수 함수 `formatDDay`/`formatDateWithWeekday`로 분리 — **로컬 캘린더 일자 기준**으로 차이를 계산(부분 시간·DST가 결과를 흔들지 않음). 요일은 `toLocaleDateString(locale, {weekday:'short'})`로 로케일 적용. `widgets/index.ts`에 등록.

### 까다로웠던 포인트

- `type="date"` 입력은 항상 유효 날짜를 주지만, 디스크에서 로드된 설정은 손상될 수 있어 `createSettingsState`에서 `parseLocalDate`로 **실제 유효성**까지 검사(형식만 맞는 `2026-99-99` 같은 값도 제거).
- 자정 롤오버: 매초/매분 갱신은 낭비라, 다음 로컬 자정에 한 번 `setState`하도록 effect가 스스로 재예약한다.

### 수정 파일

- **신규**: `widgets/d-day/`(`index.ts`·`settings.tsx`·`settings.module.scss`·`widget.tsx`·`widget.module.scss`·`dDay.ts`·`icons/`)
- **수정**: `widgets/index.ts`(등록)
- **테스트**: `d-day/dDay.spec.ts`(계산·유효성), `settings.spec.ts`(sanitize·에디터), `widget.spec.tsx`(표시)

---

## 52. 새 위젯: Stopwatch *(2026-06-07)*

기존 Timer(카운트다운)와 짝이 되는 **스톱워치(카운트업)** 위젯. 0부터 경과 시간을 1/100초까지 표시한다.

### 사용자 가시적 효과

- **시작 → 일시정지/재개 → 리셋**. (Timer엔 없는) 일시정지/재개가 스톱워치의 핵심이라 기본 제공.
- 표시 형식 `mm:ss.cc`, 1시간을 넘으면 `h:mm:ss.cc`.
- Timer와 동일하게 **위젯 상태**라 워크플로우 전환/재시작 시 초기화된다(영구 저장 안 함). 설정 없음.

### 아키텍처

- `_template` 기반 표준 위젯(`widgets/stopwatch/`). 데이터 저장·`requiresApi` 불필요.
- 경과 시간은 **항상 `Date.now()` 기준으로 계산**(`accumulated + (now - startTs)`) — 틱이 느려지거나 누락돼도 시계가 **드리프트하지 않는다**. 실행 중에만 ~30ms 간격으로 갱신해 1/100초가 부드럽게 흐르고, 멈추면 타이머를 정리한다.
- 표시 포맷은 순수 함수 `formatStopwatch(ms)`로 분리(테스트 가능).

### 까다로웠던 포인트

- 일시정지/재개: 누적 경과(`accumulatedRef`)와 현재 구간 시작시각(`startTsRef`)을 분리해, 재개 시 `startTs`만 새로 잡으면 자연히 이어진다.
- `tabular-nums`로 자릿수 폭을 고정해 1/100초가 바뀔 때 숫자가 흔들리지 않게 했다.

### 수정 파일

- **신규**: `widgets/stopwatch/`(`index.ts`·`settings.tsx`·`widget.tsx`·`widget.module.scss`·`stopwatch.ts`·`icons/`)
- **수정**: `widgets/index.ts`(등록)
- **테스트**: `stopwatch/stopwatch.spec.ts`(포맷), `widget.spec.tsx`(시작·일시정지·재개·리셋)

---

## 53. Webpage 자동 리로드 — 포커스 중엔 멈추는 방식으로 변경 *(2026-06-07)*

Webpage 위젯의 자동 리로드가 **사용자가 그 페이지를 쓰고 있지 않을 때만** 동작하도록 바뀌었다. 폼 입력 중에 시간이 됐다고 강제로 새로고침돼 입력이 날아가던 동작을 없앴다.

### 사용자 가시적 효과

- 그 webview에 **포커스가 들어오면** 자동 리로드 카운트다운이 **즉시 멈추고 초기화**된다(편집 중 강제 리로드 없음).
- **포커스가 빠지는 순간부터** 설정 간격이 새로 카운트되어, 포커스가 나가 있는 동안 간격마다 계속 리로드한다.
- 즉 "보고만 있거나 비활성일 때는 주기적으로 갱신, 내가 만지는 동안은 안 건드림".

### 아키텍처

- 기존: `setInterval`이 포커스와 무관하게 무조건 `webview.reload()` 호출.
- 변경: 자동 리로드 effect가 webview 요소의 `focus`/`blur`를 듣는다 — `blur` 시 인터벌 (재)시작, `focus` 시 인터벌 정리(초기화). 마운트 시 포커스가 없으면 바로 시작.

### 까다로웠던 포인트

- 게스트(webview) 안을 클릭/입력하면 호스트의 `<webview>` 요소가 포커스를 받아 `focus`/`blur` DOM 이벤트가 뜨는 점을 이용 — 별도 프로세스인 게스트의 입력 상태를 호스트에서 감지하는 깔끔한 신호. (Note 위젯이 "포커스 중엔 외부 변경을 미룬다"와 같은 결의 접근.)

### 수정 파일

- **수정**: `widgets/webpage/widget.tsx`(자동 리로드 effect)
- **테스트**: `webpage/widget.spec.ts`(비포커스 시 주기 리로드 / 포커스 시 정지 / 카운트다운 중 포커스 취소 / blur 시 재시작)

---

## 54. Timer 위젯: 일시정지/재개 + 남은시간 헤더 표시 *(2026-06-07)*

- 실행 중 **Pause/Resume** 추가(남은 시간 보존). 기존엔 Reset(처음부터)만 가능했다 — Stopwatch엔 있는데 Timer엔 없던 비대칭 해소.
- 실행/일시정지 중 남은 시간을 **위젯 헤더(dynamic title)에 표시**해, 위젯이 작거나 배경 워크플로우에 있어도 남은 시간이 보인다(유휴 시 해제).

**수정 파일**: `widgets/timer/widget.tsx`·`widget.module.scss` / **테스트**: `timer/widget.spec.ts`(pause/resume)

---

## 55. 새 위젯: Pomodoro *(2026-06-07)*

작업/휴식 카운트다운을 자동으로 번갈아 도는 뽀모도로 타이머. 각 전환 시 소리(Timer의 사운드 인프라 재사용), 시작·일시정지/재개·리셋, 완료한 작업 세션 수(🍅) 표시. 남은 시간은 헤더에도 표시.

**신규**: `widgets/pomodoro/`(설정에서 작업/휴식 분·사운드·볼륨) / **수정**: `widgets/index.ts` / **테스트**: `pomodoro/`(설정·위젯 phase 전환)

---

## 56. 새 위젯: Clock (멀티 타임존 = 세계시계) *(2026-06-07)*

현재 시각 표시. 한 위젯에 **여러 시계(라벨 + IANA 타임존)**를 둘 수 있어 단일 시계이자 세계시계로 동작. 12/24시간·초·날짜 표시 토글. `Intl.DateTimeFormat`로 로케일·타임존 처리(잘못된 타임존은 로컬로 폴백).

**신규**: `widgets/clock/`(`clock.ts` 순수 포맷 분리) / **수정**: `widgets/index.ts` / **테스트**: `clock/`(포맷·유효성·위젯)

---

## 57. 새 위젯: Calculator *(2026-06-07)*

간단한 4칙연산 계산기. 버튼 + 키보드 입력, `±`·`%`·백스페이스, 0 나누기 시 Error 표시. `eval` 없이 **순수 상태머신(reducer)**으로 구현해 안전·테스트 용이.

**신규**: `widgets/calculator/`(`calc.ts` reducer 분리) / **수정**: `widgets/index.ts` / **테스트**: `calculator/`(reducer·위젯)

---

## 58. 에딧 모드 위젯 액션바 "..." 메뉴에 설정·삭제 추가 *(2026-06-07)*

에딧 모드에서 위젯이 작으면 액션바(설정·삭제·"...")가 잘려 버튼에 닿기 어려웠다. 이제 **"More Actions..." 메뉴 안에도 Widget Settings·Delete Widget**을 넣어(+ 기존 Copy Widget), 공간이 부족해도 항상 접근 가능.

**수정 파일**: `ui/components/widget/widgetViewModel.ts`(`showMoreActions`에 env 전달 + 항목 추가) / **테스트**: `widget.spec.tsx`(More 메뉴 항목)

---

## 59. Web Query: 검색 기록 *(2026-06-07)*

검색창에서 제출한 최근 검색어를 **위젯별로 저장**하고(최대 15개, 중복 제거·최신 우선), 입력 시 네이티브 자동완성(`<datalist>`)으로 다시 고를 수 있다. 한 위젯의 여러 검색창이 기록을 공유.

까다로웠던 포인트: 입력에 `list`(datalist)를 달면 ARIA role이 `textbox`→`combobox`로 바뀐다(자동완성 입력의 표준). 기능엔 영향 없고 관련 테스트의 role 단언을 `combobox`로 맞췄다.

**수정 파일**: `widgets/web-query/widget.tsx`(기록 상태·datalist), `widgets/web-query/index.ts`(`requiresApi`에 `dataStorage` 추가) / **테스트**: `web-query/widget.spec.ts`(기록 저장·로드·중복제거, role)

---

## 60. 새 위젯: System Monitor (CPU/RAM) *(2026-06-07)*

내 컴퓨터의 **CPU·RAM 사용량을 실시간**으로 보여주는 위젯. 2초마다 갱신, 막대 그래프 + 퍼센트, RAM은 사용량/전체(예: `8.0 GB / 16.0 GB`)도 표시.

### 아키텍처 (지금까지 위젯 중 유일하게 메인 프로세스 작업)

시스템 메트릭은 렌더러(샌드박스)에서 못 읽으므로 **메인 프로세스 IPC**를 거친다 — 클린 아키텍처대로 전 구간 배선:
- **공유**: `common/base/systemStats.ts`(타입), `common/ipc/channels.ts`(`get-system-stats` 채널)
- **메인**: `systemStatsProvider`(`node:os`의 cpus/totalmem/freemem; CPU%는 직전 샘플과의 누적 cpu times 차이로 계산) → `getSystemStats` use case → `systemStats` 컨트롤러 → `index.ts` 등록
- **렌더러**: `systemStatsProvider` infra(IPC invoke) → **새 위젯 capability `systemStats`** 를 `WidgetApi`에 추가하고 `getWidgetApi`/`init.ts`에 배선 → 위젯이 `widgetApi.systemStats.getStats()`로 폴링

### 까다로웠던 포인트

- 새 capability를 추가하면 `WidgetApi`의 필수 필드가 되므로, 테스트 하니스(`setupSut`)와 `getWidgetApi.spec`의 mock에도 `systemStats`를 더해야 타입체크가 통과한다.
- CPU%는 순간값이 아니라 **샘플 간 구간 사용률** — provider가 직전 cpu times를 들고 있다가 다음 호출과의 차이로 계산.

### 수정 파일

- **신규(메인)**: `application/interfaces/systemStatsProvider.ts`, `infra/systemStatsProvider/`, `application/useCases/systemStats/getSystemStats.ts`, `controllers/systemStats.ts`
- **신규(공유/렌더러)**: `common/base/systemStats.ts`, `renderer/application/interfaces/systemStatsProvider.ts`, `renderer/infra/systemStatsProvider/`, `widgets/system-monitor/`(`systemMonitor.ts` 포맷 분리)
- **수정**: `common/ipc/channels.ts`, `main/index.ts`, `renderer/base/widgetApi.ts`, `renderer/.../getWidgetApi.ts`, `renderer/init.ts`, `widgets/index.ts`, `base/state/ui.ts`(팔레트)
- **테스트**: `system-monitor/`(포맷·위젯), `main/.../getSystemStats.spec.ts`, `getWidgetApi.spec`·`setupSut`(capability)

---

## 61. File Explorer: 액션바 유틸 버튼 (새로고침 · 전부 접기) *(2026-06-15)*

File Explorer 위젯 액션바에 유틸 버튼 두 개 추가.

- **새로고침(Refresh)**: 파일시스템을 다시 읽어 트리를 갱신. 디렉터리 내용은 첫 펼침 때 읽고 `loadedDirs`에 캐시되므로, 외부에서 파일이 추가·삭제돼도 그동안은 반영되지 않았다. 이 버튼이 그 공백을 메운다. (트리는 즐겨찾기 루트 상태로 돌아가고, 다시 펼치면 디스크에서 새로 읽음.)
- **전부 접기(Collapse all)**: 깊게 펼쳐 둔 트리를 한 번에 즐겨찾기 루트 상태로 되돌린다.

### 아키텍처

- 아이콘 `icons/refresh.svg`(원형 화살표), `icons/collapse-all.svg`(이중 ^ 셰브론) → `icons/index.ts` export.
- **새로고침**: 기존에 effect 안에 있던 루트 재빌드 로직(설정 변경 시 트리를 루트로 리셋 + 캐시 clear)을 `rebuildRoots` 콜백으로 추출해, 설정-변경 effect와 버튼이 함께 호출. `loadEpoch` 증가로 진행 중이던 지연 로드 결과는 버려진다.
- **전부 접기**: 위젯이 이미 들고 있는 `dirTreePaths` 맵을 순회하며 `@pierre/trees`의 `FileTreeDirectoryHandle.collapse()` 호출. 루트만이 아니라 **알려진 모든 디렉터리**를 접어, 루트를 다시 펼쳐도 그 하위가 접힌 상태로 보인다.
- note 위젯과 동일한 `widgetApi.updateActionBar(...)` 패턴으로 등록. 폴더 미설정 시 빈 배열을 넘겨 버튼을 숨김.

### 까다로웠던 포인트

- **전부 접기**는 접기만 하고 `loadedDirs`는 건드리지 않는다 — 자식 노드는 트리에 그대로 남아 재펼침이 즉시(재읽기 없이) 이뤄지고, 지연 로드 effect가 이미 있는 경로를 다시 `add`하는 중복도 피한다. 반대로 **새로고침**은 의도적으로 캐시를 비워 디스크를 다시 읽는다 — 두 버튼의 캐시 처리가 정반대.
- `getItem`은 파일/디렉터리 union을 반환하므로 `'collapse' in item`으로 디렉터리 핸들만 좁혀서 호출.

### 수정 파일

- **신규**: `widgets/file-explorer/icons/collapse-all.svg`, `widgets/file-explorer/icons/refresh.svg`
- **수정**: `widgets/file-explorer/icons/index.ts`, `widgets/file-explorer/widget.tsx`

---

## 62. 로컬 사용 통계(Analytics) + AI-ready Export *(2026-06-17)*

Freeter 사용 패턴을 **로컬에만** 수집해 보여주고, AI가 바로 해석할 수 있는 형태로 내보내는 기능. 기본 **OFF**, 명시적 동의(opt-in) 시에만 동작하며, **키 내용 등 콘텐츠는 일절 저장하지 않는다**(키 입력은 횟수만 카운트).

### 사용자 관점

- **동의 토글**: 설정 → "Usage analytics (local only)" Off/On. 켜기 전엔 한 줄도 수집하지 않음.
- **수집 항목**: 어떤 프로젝트/워크플로를 언제·얼마나 썼는지(포커스 기준 체류 시간), 앱 포그라운드 활성 시간, 세션 수, 활성(비유휴) 시간, 키 입력 **횟수**·활성 타이핑 시간.
- **Analytics 화면**: 메뉴 **View → Analytics**(`Ctrl/Cmd+Shift+A`). 설정 화면과 동일한 위상의 독립 모달. 총 활성 시간·세션·키 입력·타이핑 카드, 일별 활성 시간 바, 워크플로별 사용 시간 Top N, 시간대별 활동 히트맵.
- **데이터 통제**: 화면에서 **Export…**(자기서술적 JSON 번들 저장) · **Delete all**(전체 삭제, 확인 다이얼로그) · **Reload**.
- **AI-ready Export**: `manifest`(스키마 버전·타임존·필드 사전·이벤트 타입 설명·주의사항) + `entities`(id→현재 이름 스냅샷, 개명/삭제돼도 의미 보존) + `events`(raw 로그) + `daily`(일별 집계) + `readme`(사람·AI 겸용 안내 + 권장 프롬프트)를 한 파일에 담아, 맥락 없이도 LLM이 해석 가능.

### 아키텍처

- **저장 격리**: `freeter-data/telemetry/`에 별도 FileDataStorage로 보관(앱/위젯 데이터와 분리, 사용자가 파일째 삭제 가능). main에 전용 use case 5종 + 컨트롤러 + IPC 채널 5종, renderer infra `telemetryDataStorage`.
- **수집 코어** `telemetryCollector`(stateful): 전환은 use case를 고치지 않고 **appStore.subscribe**로 current project/workflow 변화를 한 곳에서 포착. 앱 포커스/블러는 main `win.on('focus'/'blur')` → IPC `app-focus-changed`. DOM 활동 리스너(keydown/mousedown/wheel/throttled mousemove) + visibilitychange 백업. heartbeat(60s)·flush(15s) 타이머, blur/beforeunload flush. `telemetryBuffer`가 일자별 키로 append하며 read-modify-write를 promise 체인으로 직렬화.
- **집계**: raw 이벤트 → `DailyRollup`을 **읽을 때 계산**(on-read; 항상 정확, 데이터량 작음). 화면용 순수 요약 `telemetrySummary` + `formatDuration`.
- **Analytics 화면**: 범용 modalScreens 시스템에 `analytics`(About식 void 스크린) 한 칸 추가 — `openModalScreen`/`closeModalScreen` 그대로, 특수 처리 없음.
- **Export 쓰기**: 임의 경로 쓰기용 `fsProvider.writeTextFile` 신설(main/renderer 양쪽 + IPC `fs-write-text-file`), 저장 다이얼로그로 경로 선택 후 기록.

### 까다로웠던 포인트

- **유휴 trim**: blur/유휴 시 active 구간을 "마지막 활동 시각"까지로 보수적으로 종료해 시간 과대 계상을 방지. 장시간 연속 활동은 heartbeat가 분할해 시간대 버킷 정확도 유지.
- **워크플로 presence를 포커스에 종속**: 야간 방치로 인한 시간 부풀림 차단. 같은 워크플로 blur→focus 시 `workflow_open`을 재발행하지 않음(rollup은 `workflow_close.durationMs`만 합산하므로 무관).
- **콘텐츠 미저장은 설계 불변식**: 키는 횟수만(`activity_tick.count`), webview 내부 입력은 캡처 대상 아님(외부 콘텐츠). 영구 비범위로 문서화.
- **이름 해석 분리**: 저장은 id만, export 시점에 현재 이름 스냅샷을 함께 담아 개명/삭제에도 의미 복원.

### 수정 파일

- **신규(공통)**: `common/base/telemetry.ts`
- **신규(main)**: `application/useCases/telemetryDataStorage/{getText,setText,deleteItem,clear,getKeys}.ts`, `controllers/telemetryDataStorage.ts`, `application/useCases/fs/writeTextFile.ts`
- **신규(renderer)**: `base/{telemetryRollup,telemetrySummary,telemetryExport}.ts`, `infra/dataStorage/telemetryDataStorage.ts`, `infra/telemetry/telemetryBuffer.ts`, `application/telemetry/{telemetryCollector,startTelemetry}.ts`, `application/useCases/telemetry/{readTelemetryEvents,getTelemetryRollups,getTelemetryEntities,exportTelemetryData,clearTelemetryData}.ts`, `application/useCases/analytics/{openAnalytics,closeAnalytics}.ts`, `ui/components/analytics/{analytics.tsx,analyticsViewModel.ts,analytics.module.scss,index.ts}`
- **수정(main)**: `index.ts`, `infra/browserWindow/browserWindow.ts`, `infra/fsProvider/fsProvider.ts`, `application/interfaces/fsProvider.ts`, `controllers/fs.ts`
- **수정(공통)**: `common/ipc/channels.ts`
- **수정(renderer)**: `base/appConfig.ts`, `base/state/ui.ts`, `application/interfaces/fsProvider.ts`, `infra/fsProvider/fsProvider.ts`, `application/useCases/appMenu/initAppMenu.ts`, `ui/components/applicationSettings/applicationSettings.tsx`, `ui/components/app/appViewModel.ts`, `init.ts`
- **테스트**: `tests/main/.../telemetryDataStorage`, `tests/renderer/.../telemetry*`, `tests/renderer/.../analytics`, `tests/renderer/base/telemetry{Rollup,Summary,Export}.spec.ts` 등

---

## 63. 활동 타임라인 — "오늘 뭐 했지"를 위한 의미 단위 기록 *(2026-06-17)*

62번의 통계가 "얼마나"라면, 이건 "무엇을"이다. 키 입력을 통째로 수집(키로깅)하는 대신, **이미 의미가 있는 위젯 행동만** 골라 타임라인으로 남긴다. 동의(62번과 동일한 단일 토글) 시에만 동작.

### 사용자 관점

- **기록 대상 4종**: Web Query **검색어**, Webpage **방문 페이지 제목/URL**, File Explorer·File Opener로 **연 파일**, To-Do **완료 항목**. (노트 본문은 본인이 직접 적은 것이라 의도적으로 제외.)
- **Analytics 화면**에 "활동 타임라인" 섹션 추가: 날짜별로 묶어 시간·종류(검색/방문/파일/완료)·내용·워크플로를 시간 역순으로 표시.
- **Export 번들에 자동 포함** → AI에게 "오늘 일지 써줘 / 이번 주 뭐 했는지 요약해줘"가 바로 됨. (검색어·페이지·파일·완료가 맥락으로 들어가므로.)
- 동의 OFF면 한 건도 기록 안 함. 키 입력 내용·노트 본문은 여전히 비수집.

### 아키텍처

- **이벤트 모델 확장**: `web_search`/`page_visit`/`file_open`/`todo_done` 타입 + `text`(검색어·제목·파일명·할일) / `detail`(URL·전체경로) 필드. `isTelemetryActivityEvent` 헬퍼.
- **widget API에 `logActivity(type, {text, detail})` 추가** (setDynamicTitle과 동일 플러밍): widgetApi.ts → getWidgetApi.ts(미리보기는 no-op) → widgetViewModel이 widget.id를 자동 태깅 → `logTelemetryActivityUseCase` → collector.recordActivity(현재 prj/wfl로 태깅, 동의 게이트).
- **collector를 컴포지션 루트로 승격**: `init.ts`에서 collector를 한 번 만들어 (a) 앱 리스너(`startTelemetry`)와 (b) 위젯 활동 API가 **같은 인스턴스**(같은 버퍼·flush)를 공유. `startTelemetry`는 collector를 주입받도록 리팩토링.
- **위젯 5곳 훅**: web-query(검색 submit), to-do(완료 시), file-explorer(더블클릭·컨텍스트 Open), file-opener(열기 버튼), webpage(navigate 시 URL 변할 때만 — `lastLoggedUrlRef`로 디듀프).
- **타임라인 빌더** `telemetryTimeline.ts`(순수): 활동 이벤트만 필터 + 워크플로명 해석 + 날짜·시각 역순. Analytics 뷰모델이 rollup과 함께 raw 이벤트도 읽어 구성.

### 까다로웠던 포인트

- **collector 인스턴스 공유**가 핵심: 위젯 활동과 앱 리스너가 따로 collector를 만들면 버퍼가 갈려 flush가 어긋난다. 그래서 getWidgetApiUseCase 생성보다 **먼저** collector를 만들어 양쪽에 주입(생성 순서 의존).
- **webpage page_visit 디듀프**: `page-title-updated`/`did-navigate`/`did-navigate-in-page`가 한 페이지에 여러 번 발화 → URL이 바뀔 때만 1건 기록.
- **프라이버시 문구 갱신**: "콘텐츠 미저장"이 더 이상 전부 참이 아니므로 설정 설명·export manifest/README를 "키 입력·노트 본문은 비수집, 단 활동(검색·페이지·파일·할일)은 동의 시 기록"으로 정정.

### 수정 파일

- **신규(renderer)**: `base/telemetryTimeline.ts`, `application/useCases/telemetry/logTelemetryActivity.ts`
- **수정(공통)**: `common/base/telemetry.ts`(활동 타입·필드·헬퍼)
- **수정(renderer)**: `base/widgetApi.ts`, `application/useCases/widget/getWidgetApi.ts`, `ui/components/widget/widgetViewModel.ts`, `application/telemetry/{telemetryCollector,startTelemetry}.ts`, `ui/components/analytics/{analytics.tsx,analyticsViewModel.ts,analytics.module.scss}`, `base/telemetryExport.ts`, `ui/components/applicationSettings/applicationSettings.tsx`, `init.ts`, 위젯 5종(`web-query`/`to-do-list`/`file-explorer`/`file-opener`/`webpage`)
- **테스트**: `telemetryTimeline.spec.ts`, `telemetryCollector.spec.ts`(활동 케이스 추가), widgetApi/getWidgetApi/widget 스펙 시그니처 갱신

---

## 64. OS 전역 활동 모니터링 — 앱·창 사용 시간 + 유휴/잠금 *(2026-06-17)*

63번이 "Freeter 안에서 뭘 했나"라면, 이건 **Freeter가 켜진 동안 컴퓨터에서 뭘 했나**. 동의(63·62와 동일한 단일 토글) 시에만, 100% 로컬. 키 입력 "내용"·노트 본문은 여전히 비수집 — 키로거가 아니라 *어떤 앱/창에 얼마나*를 잡는다.

### 사용자 관점

- **포그라운드 앱·창 추적**: 지금 어떤 프로그램(VS Code·Chrome 등)·어떤 창 제목에 있는지 5초 주기로 감지해, 앱이 바뀔 때 직전 구간을 `os_window`(앱·창·체류시간)로 기록 → Analytics에 **앱별 사용 시간 Top N**.
- **시스템 유휴/잠금/절전**: `powerMonitor`로 자리 비움·복귀를 잡아(기본 3분 유휴 시 구간 종료) 시간 과대계상 방지. lock/unlock/suspend/resume는 `system_event`로 타임라인에 표시.
- Analytics 타임라인에 앱 전환·시스템 이벤트가 함께 흐르고, export 번들에도 포함(`os_window`/`system_event`, `daily.perAppMs`).
- 동의 OFF면 모니터가 시작되지 않고 **PowerShell 프로세스 자체가 안 뜬다**(부팅 스모크로 확인).

### 아키텍처

- **네이티브 의존성 0**: main에서 장수 PowerShell 1개(user32 P/Invoke 루프)가 포그라운드 {앱,제목}을 JSON 한 줄씩 stdout으로. 패키징 안전.
- **collector 재사용**: main이 감지→IPC(`os-activity-event`)→renderer의 `collector.recordActivity`로 흘려보내, 기존 동의 게이트·버퍼·flush·export를 그대로 탄다. main은 데이터를 *기록*하지 않고 신호만 보냄(기록은 renderer가 동의 확인 후).
- **start/stop은 renderer가 주도**: 동의 변경을 `appStore.subscribe`로 감지해 `set-os-monitoring` IPC로 main 모니터를 켜고 끔. `osActivityMonitor`는 주입형(reader/powerMonitor/now/emit)이라 단위 테스트 가능.
- `DailyRollup.perAppMs` 추가, summary `topApps`, 타임라인에 `os_window`/`system_event` 포함.

### 까다로웠던 포인트

- **PowerShell 자식 프로세스 누수 방지**(Windows는 부모 사망 시그널이 없음): ① `app.will-quit`에서 stop, ② `process.on('exit')` 최후 킬, ③ PS 루프에 **부모 PID 워치독**(부모가 사라지면 self-exit) — 크래시/강제종료에도 고아가 안 남게 3중.
- **idle 종료 클램프**: 유휴 시작 추정 시각이 구간 시작보다 앞서면 음수 duration이 안 나오게 클램프(테스트로 고정).
- **flush 내구성**: 디스크 쓰기 실패 시 배치를 잃지 않도록 `pending`에 되돌림(언핸들드 리젝션 제거).
- **포커스 종속 금지**: "Freeter가 백그라운드일 때 다른 앱 추적"이 핵심이라, Freeter blur 시 모니터를 멈추면 안 됨(검토 중 나온 잘못된 최적화 제안을 기각).
- 검증: 4개 lens(정확성·성능·안정성·프라이버시) 병렬 리뷰로 발견한 실제 결함(Analytics 이중 읽기, flush 내구성, PS 고아, emit broadcast 예외, 언마운트 setState)을 수정. 프라이버시 리뷰는 위반 0(동의 게이트 전 경로 차단, 키 내용·노트 미수집, 네트워크 없음, PS 정적 스크립트).

### 수정 파일

- **신규(main)**: `infra/osActivity/foregroundWindow.ts`, `application/osActivity/osActivityMonitor.ts`, `application/useCases/osActivity/setOsMonitoring.ts`, `controllers/osActivity.ts`
- **신규(renderer)**: `infra/osActivity/osMonitoring.ts`
- **수정(공통)**: `common/base/telemetry.ts`(os_window/system_event 타입·라벨, perAppMs), `common/ipc/channels.ts`
- **수정(main)**: `index.ts`(powerMonitor·모니터 배선·will-quit·exit 정리)
- **수정(renderer)**: `application/telemetry/{telemetryCollector(durationMs·flush 내구성),startTelemetry(OS 이벤트 수신·동의 토글)}.ts`, `base/{telemetryRollup,telemetrySummary,telemetryExport}.ts`, `ui/components/analytics/{analytics.tsx,analyticsViewModel.ts(단일 읽기·언마운트 가드)}`, `ui/components/applicationSettings/applicationSettings.tsx`, `application/useCases/telemetry/readTelemetryEvents.ts`(날짜 키 검증)
- **테스트**: `tests/main/application/osActivity/*`, `tests/main/application/useCases/osActivity/*`, rollup/summary/viewModel 갱신

---

## 65. Analytics 기록 즉시 반영 + 실시간 활성 시간 *(2026-06-18)*

64번까지 넣고 보니 "기록이 안 쌓이는" 것처럼 보이는 문제가 있었다. 원인과 수정:

- **원인**: Analytics 화면은 디스크에 저장된 이벤트만 읽는데, 방금 한 활동은 아직 메모리 버퍼에 있었다. 버퍼→디스크 flush는 15초 주기·창 blur·앱 종료 때만 일어나는데, Analytics는 앱 내부 모달이라 열어도 blur가 안 나 flush가 안 됐다 → 방금 한 활동이 화면에 안 보임.
- **수정 1 (즉시 반영)**: Analytics를 열거나 Reload할 때 **읽기 직전에 flush**하도록 함(`flushTelemetryUseCase`). 버퍼에 있던 이벤트가 바로 보인다.
- **수정 2 (실시간 활성 시간)**: 읽기 직전에 현재 진행 중인 활성 구간을 "경계 마감"(`collector.markActiveBoundary`)해, 아직 안 닫힌 활성 시간도 *지금까지의 분량*만큼 반영. 15초 타이머 flush는 순수 저장만 유지(이벤트 폭증 방지) — 경계 마감은 화면을 열 때만.

### 까다로웠던 포인트

- 경계 마감은 `[구간시작, now]`를 방출하고 시작점을 now로 리셋해 **중복·누락 없이** 이어붙임. 유휴 상태면 마지막 활동 시각까지만 방출(과대계상 방지).
- 동의 토글은 OK/저장을 눌러야 적용됨(Cancel이면 미적용) — 저장 로직 자체는 정상.

### 수정 파일

- **신규**: `application/useCases/telemetry/flushTelemetry.ts`
- **수정**: `application/telemetry/telemetryCollector.ts`(markActiveBoundary), `ui/components/analytics/analyticsViewModel.ts`(읽기 전 flush), `init.ts`
- **테스트**: collector/flush/viewModel 스펙 갱신

---

## 66. Web Query 최근 검색어 지우기 *(2026-06-22)*

Web Query 위젯은 제출한 검색어를 위젯별로 최대 15개까지 기억해 입력창 드롭다운(`datalist`)으로 다시 제안한다. 그런데 네이티브 `datalist`는 항목을 지우는 방법이 없어, 한번 쌓인 최근 검색어를 사용자가 비울 길이 아예 없었다.

- **동작**: 위젯 **컨텍스트 메뉴**에 *Clear recent searches* 항목을 추가. 누르면 그 위젯의 최근 검색어 기록을 한 번에 비운다(드롭다운 즉시 갱신 + 디스크 반영). 기록이 없을 땐 항목이 보이지 않는다.
- **범위**: 위젯 인스턴스 단위. 개별 항목 삭제나 전역 토글은 범위에서 제외(최소 구현).

### 까다로웠던 포인트

- 컨텍스트 메뉴 팩토리는 React 밖에서 실행되므로, 비우기 동작은 `historyRef`/`setHistory`/`dataStorage`를 함께 건드리는 콜백으로 넘겨 상태와 디스크·드롭다운이 한 번에 동기화되게 함.
- "기록 있을 때만 표시"는 팩토리가 **메뉴를 열 때** `historyRef.current`를 읽도록 해, 검색어가 바뀔 때마다 팩토리를 재등록하지 않아도 정확하게 반영.

### 수정 파일

- **신규**: `widgets/web-query/contextMenu.ts`
- **수정**: `widgets/web-query/widget.tsx`(clearHistory + setContextMenuFactory 배선)
- **테스트**: `tests/renderer/widgets/web-query/widget.spec.ts`(비우기/미표시 케이스)

---

## 67. Webpage 위젯 탭 지원 *(2026-07-16)*

Webpage 위젯 하나에 여러 URL을 등록해 브라우저처럼 탭으로 전환할 수 있다. 별도 위젯을 만들지 않고 기존 Webpage 위젯을 확장했으므로, 기존 위젯은 설정 그대로 동작한다.

- **동작**: 설정에 **Tabs** 항목을 추가 — commander/link-opener처럼 행 단위 편집 UI(행마다 URL 입력 + 이름 입력 + 삭제 버튼, "Add a tab" 버튼). URL이 총 2개 이상이면 **위젯 헤더(타이틀바)가 탭 바로 바뀌고**(액션바는 그대로 오른쪽), 기존 URL 필드가 첫 탭이 된다(URL 필드 옆에도 탭 이름 입력이 있음). 탭 라벨은 사용자 지정 이름 → 페이지 타이틀 → 호스트명 순, 위젯 헤더의 동적 타이틀은 활성 탭을 따라간다. URL이 1개 이하면 지금과 완전히 동일(탭 바 없음, 이름 없는 헤더).
- **상태 유지**: 비활성 탭의 `<webview>`를 언마운트하지 않고 `visibility: hidden` + `inert`로만 숨겨(업스트림이 비활성 워크플로를 숨기는 것과 동일한 계약), 탭을 오가도 스크롤·입력·로그인 상태가 유지된다. 세션 파티션은 위젯 단위 그대로(같은 위젯의 탭끼리 세션 공유).
- **의도된 차이(별개 위젯 2개 대비)**: ① 탭들은 세션을 공유한다 — Widget 세션 범위도 위젯 단위라 탭 간 격리는 없음(실제 브라우저 탭과 같은 의미론). ② 액션바·컨텍스트 메뉴·헤더 타이틀·`exposeApi`(web-query의 Webpages 모드 타깃 포함)는 **활성 탭 기준** — 위젯당 하나뿐인 표면이므로. ③ Inject CSS/JS·User Agent·Auto-Reload 등 설정은 모든 탭에 공통 적용(위젯 설정이므로). 그 외(자동 새로고침 카운트다운, 페이지 내 찾기, 로드 실패 오버레이, 단축키 라우팅, 활동 기록)는 탭별로 독립 동작해 별개 위젯과 동등하다.

### 까다로웠던 포인트

- `Webview` 내부가 `updateActionBar`/`setContextMenuFactory`/`exposeApi`/`setDynamicTitle`을 위젯 단위로 등록하므로, 탭 여러 개가 동시에 마운트되면 서로 덮어쓴다. 활성 탭에만 실제 `widgetApi`를 주고 비활성 탭에는 no-op으로 게이팅한 API를 주입해 해결 — 활성 전환 시 함수 identity가 바뀌면서 기존 effect들이 자연스럽게 재등록된다.
- 동적 타이틀만은 게이팅으로 부족했다. 탭 전환 시 비활성화되는 탭의 effect cleanup(`setDynamicTitle(null)`)이 새 활성 탭의 발행 **뒤에** 실행되는 순서가 존재해 타이틀이 지워질 수 있다. 그래서 멀티탭 모드에선 모든 탭의 `setDynamicTitle`을 no-op으로 만들고, 각 탭이 `onTitleInfo` 콜백으로 타이틀을 보고하면 부모(`WidgetComp`)가 활성 탭의 타이틀을 단독으로 발행한다.
- `display: none`은 Electron `<webview>`를 언로드시키는 것으로 알려진 함정이라, `visibility: hidden` + absolute 겹치기로 숨김.
- (후속) 탭 바를 위젯 본문 상단에서 **헤더로 이동**: 탭 바는 위젯 셸(`ui/components/widget`)이 그리므로, 위젯 → 셸로 탭을 전달할 채널이 필요했다. 액션바가 이미 쓰는 `widgetApi.updateActionBar` 핸들러 패턴을 그대로 따라 `widgetApi.setHeaderTabs({tabs, active, onSelect} | null)`를 추가 — viewModel의 로컬 state로 흘러가 헤더가 이름 대신 탭을 렌더한다. 편집 모드에선 헤더가 드래그 핸들이므로 탭 대신 이름을 유지.
- (후속) 탭 이름의 `URL | 이름` 파이프 문법을 폐기하고 구조화 설정으로 교체: `tabs`를 `{url, name}[]`로, URL 필드 이름은 `urlName` 설정으로 분리. 파이프 파싱은 URL에 리터럴 `|`가 있으면 잘라먹는 문제가 있었다 — 이제 파싱은 `createSettingsState`의 1회성 레거시 마이그레이션에만 남고(파이프 형식 저장분 변환), `urlName`이 저장된 이후에는 재파싱하지 않는다. 함께 탭 타이틀 캐시를 인덱스 키에서 URL 키로 바꿔, 중간 탭 삭제 시 남은 탭이 삭제된 탭의 타이틀을 물려받던 버그도 수정.

### 수정 파일

- **수정**: `widgets/webpage/settings.tsx`(tabs 설정 + 행 단위 편집 UI), `widgets/webpage/widget.tsx`(다중 Webview·API 게이팅·헤더 탭 발행), `widgets/webpage/widget.module.scss`, `base/widgetApi.ts`·`application/useCases/widget/getWidgetApi.ts`·`ui/components/widget/*`(setHeaderTabs 채널 + 헤더 탭 렌더)
- **테스트**: `tests/renderer/widgets/webpage/widget.spec.ts`(탭 발행·전환·클램프·커스텀 이름·타이틀 유지 등 8케이스), `settings.spec.ts`(탭 행 편집 4케이스), `fixtures.ts`, `setupSut.tsx`·`base/widgetApi.spec.ts`·`getWidgetApi.spec.ts`(시그니처 반영), `ui/components/widget/widget.spec.tsx`(헤더 탭 렌더·클릭·편집 모드 폴백 2케이스)

---

## 68. 설정 화면 폼 컨트롤 전체 폭 사용 *(2026-07-17)*

설정 화면(위젯·워크플로우·앱 설정, 프로젝트/앱 매니저)의 우측 폼 패널에서 input/select/textarea가 `240px` 고정폭이라, 패널은 넓은데 폼만 좁게 몰려 있고 오른쪽이 빈 공간으로 남았다. 공통 스타일(`settingsScreen.module.scss`)의 고정폭을 `width: 100%`로 바꿔 폼 컨트롤이 패널 폭을 전부 쓰도록 했다. 다섯 화면 모두 이 공통 클래스를 쓰므로 한 줄 수정으로 일괄 적용된다.

### 수정 파일

- **수정**: `ui/components/basic/settingsScreen/settingsScreen.module.scss`

---

## 69. Webpage 탭 사용성 개선 — 활성 탭 기억·파비콘·로딩 표시 *(2026-07-17)*

67번(Webpage 탭 지원)의 후속 개선 3종. 모두 멀티탭 모드에서만 동작하며 단일 URL 위젯은 영향 없음.

- **활성 탭 기억**: 마지막으로 선택한 탭 인덱스를 위젯별 dataStorage(`activeTab` 키)에 저장하고, 마운트 시 복원. 앱을 재시작해도 보던 탭이 유지된다. 복원은 비동기라 사용자가 그 사이 탭을 클릭하면 사용자 선택이 이긴다(복원값 무시). 탭 개수가 줄어든 경우는 기존 클램프 로직이 처리.
- **탭 파비콘**: 각 탭의 `<webview>`가 보고하는 `page-favicon-updated` 이벤트로 파비콘 URL을 받아 탭 라벨 왼쪽에 14px 아이콘으로 표시. 탭이 여러 개일 때 텍스트보다 빨리 식별된다.
- **탭 로딩 표시**: 탭의 페이지가 로딩 중이면 파비콘 자리에 회전 스피너를 표시(브라우저 탭 관례). `did-start-loading`/`did-stop-loading` 이벤트 기반.
- **(후속) 오디오 탭 표시**: 소리를 내는 탭의 라벨 오른쪽에 스피커 아이콘(🔊), 음소거된 탭엔 음소거 아이콘을 표시(음소거가 재생보다 우선). webview의 `media-started-playing`/`media-paused` 이벤트를 `onTabInfo` 채널에 실어 보고하고, `WidgetHeaderTabs` 탭 항목의 `audioIcon`(SVG 문자열) 필드로 발행 — 셸이 `SvgIcon`으로 렌더한다.
- **(후속) 탭 바 오버플로 수정**: 탭이 위젯 폭을 넘으면 스크롤바가 숨겨져 있어(26px 헤더) 밀려난 탭에 마우스로 도달할 방법이 없었다. 탭 바 위에서 세로 휠을 가로 스크롤로 변환하고, 활성 탭이 바뀌면 `scrollIntoView`로 보이게 했다. 함께 Inject JS의 `executeJavaScript` 호출에 `.catch`를 붙여 사용자 JS 문법 오류가 unhandled rejection으로 새지 않게 수정.

아키텍처: 기존 탭별 `onTitleInfo` 콜백을 `onTabInfo`(부분 patch 방식) 하나로 통합해 타이틀·파비콘·로딩을 같은 채널로 부모(`WidgetComp`)에 보고하고, 부모는 URL 키 레코드(`tabInfos`)에 병합해 `setHeaderTabs`로 발행한다. `WidgetHeaderTabs` 탭 항목에 `icon`/`loading` 필드를 추가하고 셸(`ui/components/widget`)이 렌더. webpage 위젯의 `requiresApi`에 `dataStorage` 추가.

### 수정 파일

- **수정**: `widgets/webpage/widget.tsx`, `widgets/webpage/index.ts`(requiresApi), `base/widgetApi.ts`(WidgetHeaderTabs icon/loading), `ui/components/widget/widget.tsx`·`widget.module.scss`
- **테스트**: `tests/renderer/widgets/webpage/widget.spec.ts`(저장·복원·경합·파비콘·로딩 4케이스), `tests/renderer/ui/components/widget/widget.spec.tsx`(파비콘/스피너 렌더 1케이스)

---

## 70. Webpage 커스텀 액션 버튼 (북마크릿) *(2026-07-17)*

Webpage 위젯 설정에 **Custom Actions** 항목을 추가 — 행마다 이름 + JavaScript 코드(+삭제 버튼, "Add an action" 버튼). 등록하면 위젯 액션바에 버튼이 생기고, 클릭할 때마다 현재 페이지에서 그 JS를 실행한다(브라우저 북마크릿과 같은 개념). "모두 읽음 처리", 특정 요소 클릭, 뷰 토글 같은 반복 작업을 버튼 하나로 줄이는 용도.

- JS가 비어 있는 행은 버튼을 만들지 않고, 이름이 비면 `Custom action N`으로 표시. 실행 오류는 무시(`.catch`).
- 멀티탭 모드에선 액션바가 활성 탭 소유이므로 커스텀 액션도 활성 탭에서 실행된다.
- 설정 편집 UI·디바운스 계약은 탭 행 편집과 동일 패턴. 아이콘은 commander의 exec-command.svg를 복사(`run-script.svg`).

### 수정 파일

- **수정**: `widgets/webpage/settings.tsx`, `widgets/webpage/actionBar.ts`, `widgets/webpage/widget.tsx`, `widgets/webpage/icons/`(run-script.svg 추가)
- **테스트**: `tests/renderer/widgets/webpage/actionBar.spec.ts`, `settings.spec.ts`, `fixtures.ts`

---

## 71. HTTP Basic Auth 지원 *(2026-07-17)*

Basic/Digest 인증(프록시 인증 포함)으로 보호된 페이지를 Webpage 위젯에서 열 수 있게 했다. 지금까지는 main 프로세스에 `app.on('login')` 핸들러가 없어 Electron이 인증 요청을 그대로 취소 — 사내 툴, 스테이징 서버, 공유기/NAS 관리 페이지 등이 자격증명 입력 기회도 없이 빈 401로 끝났다.

- **동작**: 인증 챌린지가 오면 부모 창에 모달로 작은 로그인 창(호스트:포트, realm 표시 + 아이디/비밀번호 입력)을 띄우고, 입력하면 인증을 계속, 취소/창 닫기/Esc면 원래대로 실패시킨다.
- **아키텍처**: `src/main/infra/httpAuth/httpAuth.ts` 단일 모듈, `index.ts`에서 `registerHttpAuthHandler()` 한 줄로 등록(downloadManager 선례를 따름). 프롬프트 창은 preload 번들 없이 data URL로 로드하고, 결과는 webpage 위젯의 줌/찾기와 같은 마커 prefix `console.message` 시그널링으로 회수. 서버가 보내는 host/realm은 HTML 이스케이프 처리. 판단 로직(`createLoginHandler`)은 프롬프트 주입식으로 분리해 단위 테스트.

### 수정 파일

- **신규**: `src/main/infra/httpAuth/httpAuth.ts`
- **수정**: `src/main/index.ts`
- **테스트**: `tests/main/infra/httpAuth/httpAuth.spec.ts`

---

## 72. 위젯 소소 개선 3종 — Timer 알림·Link Opener 기록·Note 단어 수 *(2026-07-17)*

위젯 전반 스캔에서 나온 소규모 버그·불일치 묶음.

- **Timer 데스크톱 알림**: 위젯 설명("notifies you when time is up")과 달리 실제론 사운드만 있었고, `createSettingsState`에는 인터페이스에도 없는 죽은 `endDesktop` 필드가 남아 있었다(미완성 흔적). 필드를 정식으로 살려 설정에 "Desktop Notification" 체크박스(기본 켬)를 추가하고, 타이머 종료 시 OS 알림(`new Notification`)을 띄운다.
- **Link Opener 활동 기록**: file-opener(`file_open`)·web-query(`web_search`)·webpage(`page_visit`)는 활동 타임라인에 기록하는데 link-opener만 누락. 링크를 열 때 URL별로 `page_visit`(text=호스트, detail=URL)을 기록해 일관성 확보.
- **Note 단어 수 CJK 보정**: 단어 수가 공백 분리 기반이라 한자·가나 텍스트는 통째로 1단어로 집계됐다. 한자·가나는 글자당 1단어로 세고(워드프로세서 관례) 나머지는 기존 공백 기준 유지 — 한국어는 띄어쓰기를 쓰므로 기존과 동일하게 집계된다.

### 수정 파일

- **수정**: `widgets/timer/settings.tsx`·`widget.tsx`, `widgets/link-opener/widget.tsx`, `widgets/note/widget.tsx`
- **테스트**: `tests/renderer/widgets/timer/widget.spec.ts`·`settings.spec.ts`·`fixtures.ts`, `link-opener/widget.spec.ts`, `note/widget.spec.ts`

---

## 73. 타이머 계열 실행 상태 영속화 *(2026-07-17)*

Timer·Stopwatch·Pomodoro의 실행 상태가 React state뿐이라 위젯 재마운트(프로젝트 전환 등)나 앱 재시작 시 돌아가던 타이머가 리셋되던 것을, 위젯별 dataStorage(`state` 키)에 저장해 복원하도록 했다.

- **Timer**: 실행 중이면 종료 시각(절대 타임스탬프)을 저장 — 복원 시 앱이 꺼져 있던 시간만큼 차감된 잔여 시간으로 이어서 돌아간다. 일시정지는 잔여 ms로 복원. 앱이 꺼진 사이 만료된 타이머는 소급 사운드/알림 없이 대기 상태로 복원.
- **Stopwatch**: 누적 시간 + 현재 구간 시작 타임스탬프를 저장 — 실행 중이었다면 꺼져 있던 시간도 계속 흐른 것으로 집계(실제 스톱워치 의미론).
- **Pomodoro**: 페이즈·종료 시각·일시정지 잔여·완료 세션 수를 저장. 꺼진 사이 페이즈가 끝났으면 놓친 페이즈 전환을 재생하지 않고 세션 수만 유지한 채 대기 상태로 복원(ponytail 주석으로 한계 명시).
- 공통: 복원은 마운트 시 1회 비동기이며, 그 전에 사용자가 버튼을 누르면 사용자 조작이 우선한다(webpage 활성 탭 복원과 같은 패턴). 세 위젯의 `requiresApi`에 `dataStorage` 추가.

### 수정 파일

- **수정**: `widgets/timer/widget.tsx`·`index.ts`, `widgets/stopwatch/widget.tsx`·`index.ts`, `widgets/pomodoro/widget.tsx`·`index.ts`
- **테스트**: `tests/renderer/widgets/timer/widget.spec.ts`(복원 3케이스+저장 1), `stopwatch/widget.spec.tsx`(복원 2), `pomodoro/widget.spec.tsx`(복원 2+저장 1)

---

## 74. 위젯 팔레트 검색 + 접근성 *(2026-07-17)*

편집 모드의 Add Widget 팔레트에 **검색 인풋**을 추가 — 위젯 이름으로 즉시 필터링되고, 결과가 없으면 "No widgets found" 안내가 뜬다. 팔레트 드롭다운은 CSS hover 기반이라 검색 중 마우스가 벗어나면 닫히는 문제가 있는데, `:focus-within` 규칙을 추가해 입력 중에는 열려 있게 했다. 같은 규칙 덕에 Add/Paste 탭이 키보드 포커스로도 열린다(트리거 span에 `role="button"`·`aria-haspopup` 부여).

### 수정 파일

- **수정**: `ui/components/palette/palette.tsx`·`palette.module.scss`
- **테스트**: `tests/renderer/ui/components/palette.spec.tsx`(검색 필터 1케이스)

---

## 75. 리스트형 위젯 설정 순서 변경 통일 *(2026-07-17)*

web-query·d-day·clock에는 있는 항목 순서 변경이 commander(커맨드라인)·link-opener(URL)·file-opener(파일/폴더 경로)·file-explorer(루트 폴더)에는 없어서, 순서를 바꾸려면 내용을 손으로 맞바꿔 타이핑해야 했다. 네 위젯의 각 행에 ↑/↓(Move Up/Down) 액션 버튼을 추가 — 첫/마지막 행에서는 비활성화. 위 화살표 아이콘이 없어 기존 `arr-down-14.svg`를 뒤집은 `arr-up-14.svg`를 추가하고 둘 다 `appModules`로 노출했다.

### 수정 파일

- **신규**: `ui/assets/images/appIcons/arr-up-14.svg`
- **수정**: `widgets/commander/settings.tsx`, `widgets/link-opener/settings.tsx`, `widgets/file-opener/settings.tsx`, `widgets/file-explorer/settings.tsx`, `ui/assets/images/appIcons/index.ts`, `widgets/appModules.ts`
- **테스트**: 각 위젯 `settings.spec.ts`에 이동 케이스 4건

---

## 76. 앱/프로젝트 매니저 목록 검색 + 빈 상태 안내 *(2026-07-17)*

App Manager와 Project Manager의 좌측 목록에 **이름 검색 인풋**을 추가(항목이 2개 이상일 때만 표시). 일치 항목이 없으면 "No apps/projects found", 목록 자체가 비어 있으면 "No apps/projects yet — use Add … below to create one" 안내를 보여준다. 필터는 컴포넌트 로컬 상태의 표시용 필터라 저장 데이터에는 영향이 없다. 한계: 필터가 걸린 상태의 드래그 재정렬은 보이는 항목 기준으로만 동작(코드 주석에 명시).

### 수정 파일

- **수정**: `ui/components/appManager/appManagerList/appManagerList.tsx`·`.module.scss`, `ui/components/projectManager/projectManagerList/projectManagerList.tsx`·`.module.scss`
- **테스트**: `tests/renderer/ui/components/appManager.spec.tsx`·`projectManager.spec.tsx`(빈 상태·검색 각 2케이스)

---

## 77. 위젯 기능 3종 — Pomodoro 긴 휴식·Stopwatch 랩·Calculator 복사 *(2026-07-18)*

- **Pomodoro 긴 휴식**: 설정에 **Long Break** 항목 추가 — "Every N work sessions"(2~6, 기본 4, 끄기 가능)마다 짧은 휴식 대신 긴 휴식(기본 15분)으로 전환. 긴 휴식 여부는 별도 상태가 아니라 완료 세션 수(`doneWork`)에서 파생되므로 일시정지·복원을 거쳐도 어긋나지 않는다. 진행 화면·헤더 타이틀에 "Long Break"로 표기.
- **Stopwatch 랩**: 실행 중 **Lap** 버튼으로 랩 기록. 목록은 최신이 위이고 각 행에 랩 구간 시간과 그 시점의 총 시간을 함께 표시. Reset이 랩도 지우며, 랩 목록은 실행 상태와 함께 dataStorage에 저장돼 재시작 후에도 유지된다(73번의 영속화에 편승).
- **Calculator 복사**: 디스플레이 클릭 또는 Ctrl/Cmd+C로 표시된 값을 클립보드에 복사(0.8초간 "Copied" 표시). 기존에 `c` 키가 Clear라서 Ctrl 조합을 먼저 검사한다. `requiresApi`에 `clipboard` 추가.

### 수정 파일

- **수정**: `widgets/pomodoro/settings.tsx`·`widget.tsx`, `widgets/stopwatch/widget.tsx`·`widget.module.scss`, `widgets/calculator/widget.tsx`·`index.ts`
- **테스트**: `tests/renderer/widgets/pomodoro/widget.spec.tsx`·`fixtures.ts`, `stopwatch/widget.spec.tsx`, `calculator/widget.spec.tsx`

---

## 78. Analytics 기간 필터 *(2026-07-18)*

Analytics 화면 상단에 **기간 선택**(전체/최근 30일/최근 7일, 기본 전체)을 추가. 요약 카드·타임라인·일별/워크플로별/앱별/시간대별 통계가 모두 선택한 기간 기준으로 다시 계산된다. 필터는 표시 단계가 아니라 **읽기 단계**에서 적용 — `readTelemetryEventsUseCase`가 이미 갖고 있던 `fromDate` 파라미터를 활용해 기간 밖의 일자 파일은 아예 읽지 않으므로, 기록이 수개월 쌓여도 좁은 기간 조회가 가볍다. 기간을 빠르게 전환할 때 이전 조회가 늦게 도착해 새 결과를 덮어쓰지 않도록 로드 시퀀스 토큰을 추가. 함께 타임라인 제목의 "오늘 무엇을 했나"를 "무엇을 했나"로 수정(실제로는 전체 일자를 보여주고 있었음).

### 수정 파일

- **수정**: `ui/components/analytics/analyticsViewModel.ts`·`analytics.tsx`·`analytics.module.scss`
- **테스트**: `tests/renderer/ui/components/analytics/analyticsViewModel.spec.ts`(기간 변경 재조회 1케이스), `analytics.spec.tsx`(뷰모델 시그니처 반영)

---

## 부록: 참고 문서

- `CLAUDE.md` — 이 저장소 구조·명령 가이드 (Claude Code용이지만 일반 참고용으로도 OK)
- `README.md` — 원본 Freeter README (fork 관련 설명은 아직 추가 X)
