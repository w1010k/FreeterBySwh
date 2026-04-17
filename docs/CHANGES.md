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

**왜**: 원본 앱을 덮어쓰거나 설정을 공유하지 않도록. `appId`가 달라서 `app.requestSingleInstanceLock()`도 자동 분리됨.

**수정 파일**: `electron-builder.config.js`, `package.json`, `src/main/index.ts`, `webpack.renderer.config.js`

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

### 제한 사항

- **Manage Shared Data Keys 다이얼로그 부재**: 현재 키 삭제/이름 변경 UI 없음 (키 생성은 설정 드롭다운에서 가능). 향후 추가 예정.
- **TodoList 미적용**: Note에만 적용. 패턴 확립됐으므로 TodoList로 확장은 기계적 작업 — 향후 세션에서.
- **콘텐츠 비어있음 사전 체크 없음**: 당초 Q1 결정은 "비어있어야 공유 허용"이었으나, settings UI에서 위젯 데이터 dry-read가 까다로워 `moreInfo` 경고 문구로 대체. 사용자가 공유 키 지정 시 위젯의 visible 콘텐츠는 선택한 키의 내용으로 교체됨 (local 데이터는 widget 폴더에 그대로 남아, 공유 해제 시 복원됨).

**수정 파일 요약**:
- 신규 9개: `common/base/sharedStorageId.ts`, `main/application/useCases/sharedDataStorage/{clear,delete,getKeys,getText,setText}.ts` (5), `main/controllers/sharedDataStorage.ts`, `renderer/base/sharedDataKey.ts`, `renderer/infra/dataStorage/sharedDataStorage.ts`
- 수정 12개: `common/ipc/channels.ts`, `main/index.ts`, `renderer/init.ts`, `renderer/base/widget.ts`, `renderer/base/widgetApi.ts`, `renderer/base/state/{entities,shared}.ts`, `renderer/base/state/actions/entity.ts`, `renderer/application/useCases/widget/getWidgetApi.ts`, `renderer/application/useCases/widgetSettings/getWidgetSettingsApi.ts`, `renderer/widgets/appModules.ts`, `renderer/widgets/note/{index.ts,settings.tsx,widget.tsx}`

---

## 부록: 참고 문서

- `CLAUDE.md` — 이 저장소 구조·명령 가이드 (Claude Code용이지만 일반 참고용으로도 OK)
- `README.md` — 원본 Freeter README (fork 관련 설명은 아직 추가 X)
