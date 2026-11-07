# AI 인프라 단계 1 구현 계획 (제어 통로, 작업 목록 핵심, 확인 장치, CLI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실행 중인 Freeter를 외부 프로세스가 `freeter` CLI와 `freeter mcp`로 다루게 한다. 쓰기 작업은 Freeter가 확인을 받은 뒤 실행한다.

**Architecture:** main이 로컬 연결 (Windows named pipe, Linux 소켓)을 열고 줄 단위 JSON-RPC 요청을 받는다. main은 요청을 IPC로 renderer에 넘기고, renderer의 작업 목록이 기존 sub use case로 앱 상태를 바꾼다. 쓰기 확인은 main의 OS 메시지 상자로 받는다.

**Tech Stack:** Electron 42, TypeScript, React 19 (변경 없음), `node:net`, `node:crypto`, Jest. 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-07-ai-infra-design.md`

**이 계획의 범위:** spec "구현 단계"의 단계 1과, 단계 1에 필요한 단계 0 검증 두 가지 (RunAsNode, named pipe 권한). 단계 0의 `node-pty` 검증은 단계 5 계획에서 한다. 작업 목록은 읽기 1개, 프로젝트 1개, 워크플로 4개, 위젯 3개로 시작한다. 프로젝트 생성/이름 변경/삭제, 위젯 이동과 설정 변경, 앱 설정은 다음 계획 (단계 1b)에서 더한다. 이유: 프로젝트 생성은 지금 Project Manager 모달의 편집 상태를 거쳐서만 가능해 별도 sub use case 분리가 필요하다.

## Global Constraints

- 패키지 관리자: Yarn 1. `npm` 금지. 새 의존성 추가 금지 (`@modelcontextprotocol/sdk` 포함).
- ESLint: 작은따옴표, `max-len: 160`, `eqeqeq`, `curly`, `consistent-return`, 사용하지 않는 인자는 `_`로 시작. 커밋 전 `yarn lint:<surface>:fix`.
- TypeScript strict, `any` 금지.
- 테스트 위치: `tests/<surface>/`에 src 경로를 따라 둔다. fixture는 `tests/renderer/base/fixtures/`, `tests/renderer/base/state/fixtures/`, `fixtureAppStore` (`@tests/data/fixtures/appStore`)를 쓴다.
- 모든 IPC 채널은 `src/common/ipc/channels.ts`에 `makeIpcChannelName`으로 정의한다. invoke 채널은 `registerControllers`로 등록해 `createIpcMainEventValidator`를 거친다.
- 연결 정보 파일: `<appDataDir>/ai/endpoint.json` = `{ "pipe": string, "token": string, "pid": number }`. 앱 시작 때 쓰고 `will-quit`에서 지운다.
- Windows pipe 이름: `\\.\pipe\freeter-swh-` + `sha256(appDataDir)` 앞 12자. Linux: `<appDataDir>/ai/control.sock`, 권한 0600.
- 토큰: 앱 실행마다 `crypto.randomBytes(32).toString('hex')`. 모든 요청의 `params.token`이 같아야 한다.
- 시간 제한: 확인 상자 120000ms (지나면 거절, 상자는 닫는다). main → renderer 요청 150000ms.
- 확인 상자 문구 (앱 UI가 영어이므로 영어): message `An AI agent (via <origin>) wants to: <describe>`, buttons `['Allow', 'Deny']`, `defaultId: 1`, `cancelId: 1`, `type: 'question'`. 상자를 띄우기 전에 창이 숨겨져 있으면 보이게 한다.
- 확인은 한 번에 하나. 나머지는 도착 순서로 기다린다.
- 줄 하나의 최대 길이: 1MiB (1048576 bytes). 넘으면 연결을 끊는다.
- CLI 종료 코드: 0 성공, 1 작업 실패 (거절 포함), 2 사용법 오류, 3 연결 실패 (Freeter 미실행 포함).
- CLI는 Freeter를 자동으로 실행하지 않는다. 시스템 PATH에 설치하지 않는다.

## Review Focus

1. Freeter가 꺼져 있거나 비정상 종료로 `endpoint.json`이 남은 상태에서 CLI 실행: 멈추지 않고 "Freeter is not running" + 종료 코드 3. (Task 7 테스트)
2. 확인 상자가 열린 동안 사용자가 대상 워크플로를 직접 지움: 확인 뒤 최신 상태로 다시 찾고 `not_found`를 돌려준다. 앱 상태를 깨지 않는다. (Task 5 테스트)
3. renderer가 로드 중이거나 개발 중 창을 새로고침해 응답이 오지 않음: main 요청이 150초 뒤 `timeout`으로 끝나고, 늦게 온 응답은 무시한다. (Task 3 테스트)
4. 한 데이터 덩어리에 여러 줄, 한 줄이 여러 덩어리로 나뉨, JSON이 아닌 줄: 각각 처리하거나 parse 오류를 돌려주고 연결은 유지한다. 1MiB 초과 줄은 연결을 끊는다. (Task 1, Task 2 테스트)
5. CLI 두 개가 동시에 쓰기 요청: 확인 상자가 겹치지 않고 차례로 뜬다. (Task 3 테스트)

## 파일 구조

| 파일 | 책임 |
|------|------|
| `src/common/ai/protocol.ts` (신규) | 공통 타입 (`AiActionInfo`, `AiErrorCode`, `AiRpcResult`, `AiOrigin`), 줄 분리기, 메시지 인코딩 |
| `src/main/infra/aiControlServer/aiControlServer.ts` (신규) | `node:net` 서버, 줄 단위 JSON-RPC, 토큰 검사 |
| `src/main/infra/aiControlServer/endpoint.ts` (신규) | pipe 경로 계산, endpoint.json 쓰기/지우기 |
| `src/main/application/ai/aiActionBridge.ts` (신규) | main → renderer 요청과 응답 대기 |
| `src/main/application/useCases/ai/confirmAiAction.ts` (신규) | 확인 상자 직렬화와 시간 제한 |
| `src/main/controllers/ai.ts` (신규) | `ai-action-response`, `ai-confirm` 컨트롤러 |
| `src/main/index.ts` (수정) | 생성, 등록, 시작, 종료 |
| `src/common/ipc/channels.ts` (수정) | 채널 3개 |
| `src/renderer/base/ai/aiAction.ts` (신규) | `AiAction` 타입 |
| `src/renderer/application/interfaces/aiControlProvider.ts` (신규) | renderer 포트 |
| `src/renderer/infra/aiControlProvider/aiControlProvider.ts` (신규) | IPC 구현 |
| `src/renderer/application/useCases/ai/runAiRequest.ts` (신규) | 목록 응답, 입력 검증, 확인, 실행, 오류 변환 |
| `src/renderer/application/useCases/ai/actions/appActions.ts` (신규) | 읽기, 프로젝트, 워크플로 작업 |
| `src/renderer/application/useCases/ai/actions/widgetActions.ts` (신규) | 위젯 작업 |
| `src/renderer/init.ts` (수정) | 작업 목록 생성, 요청 리스너 |
| `src/main/cli/index.ts` (신규) | CLI 진입점 (`process.argv`, stdio 연결) |
| `src/main/cli/cli.ts` (신규) | `runCli` (테스트 가능한 본체), 연결 클라이언트 |
| `src/main/cli/mcp.ts` (신규) | stdio MCP 서버 |
| `webpack.main.config.js` (수정) | entry `cli` 추가 → `build/cli.js` |
| `resources/bin/freeter.cmd`, `resources/bin/freeter` (신규) | 래퍼 |
| `electron-builder.config.js` (수정) | `extraResources`로 `resources/bin` → `bin` |

CLI를 `src/main/cli/`에 두는 이유: main surface의 tsconfig, eslint, Jest Main 프로젝트를 그대로 쓴다. `electron`을 import하지 않으므로 RunAsNode와 일반 Node 양쪽에서 동작한다.

---

### Task 0: 사전 검증 (버리는 코드)

**Files:** scratchpad만. 결과는 spec 파일 "검증 결과" 절 아래에 "단계 0 결과" 표로 추가한다.

- [ ] **Step 1: RunAsNode 확인.** scratchpad에 `probe.js` (stdin을 읽어 대문자로 stdout에 쓰고 종료 코드 7로 끝남)를 만든다. `yarn prod && yarn package`로 만든 `dist/win-unpacked/Freeter-SWH.exe`에 대해 PowerShell에서 실행:
  `$env:ELECTRON_RUN_AS_NODE=1; 'abc' | & .\dist\win-unpacked\Freeter-SWH.exe probe.js; $LASTEXITCODE`
  기대: `ABC`, `7`. 이어서 `probe.js`를 `resources/app.asar` 안 경로로 지정할 수 있는지 (`...\resources\app.asar\main.js`를 `-e "require('...app.asar/package.json')"`로 읽기) 확인한다.
- [ ] **Step 2: 결과에 따라 래퍼 경로 결정.** asar 안 실행이 되면 래퍼는 `resources\app.asar\cli.js`를 쓴다. 안 되면 `build/cli.js`를 `extraResources`로 `resources/cli/cli.js`에 복사하는 방식으로 Task 7 Step 7, 8을 고친다.
- [ ] **Step 3: named pipe 권한 확인.** `node -e` 로 `net.createServer().listen('\\\\.\\pipe\\freeter-probe')`를 띄우고, PowerShell `[System.IO.Directory]::GetAccessControl('\\.\pipe\freeter-probe').Access | ft IdentityReference,FileSystemRights`로 ACL을 기록한다. 결과와 관계없이 토큰 검사는 유지한다 (spec 결정). 다른 사용자 계정 허용이 보이면 spec 보안 절에 기록한다.
- [ ] **Step 4: spec에 "단계 0 결과" 표를 추가하고 커밋한다.**

```bash
git add docs/superpowers/specs/2026-11-07-ai-infra-design.md
git commit -m "docs(ai): record stage 0 probe results"
```

### Task 1: 공통 프로토콜

**Files:**
- Create: `src/common/ai/protocol.ts`
- Test: `tests/common/ai/protocol.spec.ts`

**Interfaces:**
- Produces:
  - `type AiOrigin = 'cli' | 'mcp' | 'agent-runner' | 'terminal'`
  - `type AiErrorCode = 'parse_error' | 'unauthorized' | 'unknown_method' | 'unknown_action' | 'invalid_input' | 'denied' | 'timeout' | 'not_ready' | 'not_found' | 'failed'`
  - `interface AiActionInfo { id: string; description: string; kind: 'read' | 'write'; inputSchema: object }`
  - `type AiRpcResult = { ok: true; value: unknown } | { ok: false; code: AiErrorCode; message: string }`
  - `interface AiRpcRequest { jsonrpc: '2.0'; id: number; method: 'actions.list' | 'actions.run'; params: { token: string; origin: AiOrigin; actionId?: string; input?: unknown } }`
  - `interface AiRpcResponse { jsonrpc: '2.0'; id: number | null; result?: unknown; error?: { code: number; message: string; data: { code: AiErrorCode } } }`
  - `const AI_MAX_LINE_BYTES = 1048576`
  - `createLineSplitter(onLine: (line: string) => void, onOverflow: () => void): (chunk: Buffer | string) => void`
  - `encodeLine(msg: object): string` (JSON + `\n`)
  - `toRpcResponse(id: number | null, res: AiRpcResult): AiRpcResponse` (ok → `result`, 실패 → `error.code = -32000`, `error.data.code`)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
describe('createLineSplitter', () => {
  it('emits each line of one chunk and joins split chunks', () => {
    const lines: string[] = [];
    const push = createLineSplitter(l => lines.push(l), jest.fn());
    push('{"a":1}\n{"b"');
    push(':2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });
  it('skips empty lines and strips \\r', () => { /* 'x\r\n\n' → ['x'] */ });
  it('calls onOverflow once when a pending line exceeds AI_MAX_LINE_BYTES', () => { /* 'a'.repeat(AI_MAX_LINE_BYTES + 1) 무개행 → onOverflow 1회, 이후 push 무시 */ });
});
describe('toRpcResponse', () => {
  it('maps failure to error -32000 with data.code', () => {
    expect(toRpcResponse(3, { ok: false, code: 'denied', message: 'm' }))
      .toEqual({ jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'm', data: { code: 'denied' } } });
  });
});
```

- [ ] **Step 2: 실행해 실패 확인.** `yarn test tests/common/ai/protocol.spec.ts` → FAIL (모듈 없음)
- [ ] **Step 3: `src/common/ai/protocol.ts` 구현.** 줄 길이는 `Buffer.byteLength`로 잰다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS
- [ ] **Step 5: 커밋.** `git commit -m "feat(ai): shared control protocol types and line framing"`

### Task 2: 제어 서버

**Files:**
- Create: `src/main/infra/aiControlServer/aiControlServer.ts`, `src/main/infra/aiControlServer/endpoint.ts`
- Test: `tests/main/infra/aiControlServer/aiControlServer.spec.ts`, `tests/main/infra/aiControlServer/endpoint.spec.ts`

**Interfaces:**
- Consumes: Task 1 전부.
- Produces:
  - `createAiControlServer(deps: { path: string; token: string; handle: (req: AiRpcRequest) => Promise<AiRpcResult> }): { start(): Promise<void>; stop(): Promise<void> }`
  - `getAiPipePath(appDataDir: string, platform: NodeJS.Platform): string`
  - `writeAiEndpoint(appDataDir: string, info: { pipe: string; token: string; pid: number }): Promise<void>` (폴더 생성, 파일 쓰기)
  - `removeAiEndpointSync(appDataDir: string): void` (없으면 무시)

- [ ] **Step 1: 실패하는 테스트 작성.** 테스트는 실제 `net` 서버를 쓴다. 경로는 Windows면 `\\.\pipe\freeter-test-<random>`, 아니면 `os.tmpdir()` 아래 소켓.
  - `rejects a request with a wrong token as unauthorized and keeps the connection` (응답 `error.data.code === 'unauthorized'`, 같은 연결로 다음 요청 성공)
  - `answers parse_error with id null for a non-JSON line`
  - `answers unknown_method for method "x"`
  - `passes a valid request to handle and writes its result` (`handle`이 `{ok:true,value:42}` → `result: 42`)
  - `answers two requests sent in one chunk in order`
  - `destroys the socket when a line exceeds AI_MAX_LINE_BYTES`
  - endpoint: `getAiPipePath('C:\\x', 'win32')`가 `\\.\pipe\freeter-swh-` + 12자 hex로 시작하고 같은 입력에 같은 값, `getAiPipePath('/x', 'linux') === '/x/ai/control.sock'`
- [ ] **Step 2: 실행해 실패 확인.** `yarn test tests/main/infra/aiControlServer` → FAIL
- [ ] **Step 3: 구현.** Linux에서 `start()`는 남은 소켓 파일을 먼저 지우고, listen 뒤 `fs.chmod(path, 0o600)`. `handle`이 throw하면 `failed`로 응답한다.
- [ ] **Step 4: 통과 확인.** → PASS
- [ ] **Step 5: 커밋.** `git commit -m "feat(ai): local control server over named pipe / unix socket"`

### Task 3: main 브리지, 확인 장치, IPC 연결

**Files:**
- Create: `src/main/application/ai/aiActionBridge.ts`, `src/main/application/useCases/ai/confirmAiAction.ts`, `src/main/controllers/ai.ts`
- Modify: `src/common/ipc/channels.ts`, `src/main/index.ts`
- Test: `tests/main/application/ai/aiActionBridge.spec.ts`, `tests/main/application/useCases/ai/confirmAiAction.spec.ts`, `tests/main/controllers/ai.spec.ts`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces:
  - 채널: `ipcAiActionRequestChannel` (`'ai-action-request'`, main → renderer 알림, `IpcAiActionRequestArgs = [reqId: number, req: AiRpcRequest]`), `ipcAiActionResponseChannel` (`'ai-action-response'`, invoke, `[reqId: number, res: AiRpcResult]`, Res `void`), `ipcAiConfirmChannel` (`'ai-confirm'`, invoke, `[origin: AiOrigin, describe: string]`, Res `boolean`)
  - `createAiActionBridge(deps: { send: (reqId: number, req: AiRpcRequest) => void; timeoutMs: number }): { request(req: AiRpcRequest): Promise<AiRpcResult>; resolve(reqId: number, res: AiRpcResult): void }`
  - `createConfirmAiActionUseCase(deps: { showWindow: () => void; showConfirmBox: (message: string, signal: AbortSignal) => Promise<boolean>; timeoutMs: number }): (origin: AiOrigin, describe: string) => Promise<boolean>`
  - `createAiControllers(deps: { aiActionBridge; confirmAiActionUseCase })`

- [ ] **Step 1: 실패하는 테스트 작성** (jest fake timers)
  - bridge: `resolves request when resolve is called with its reqId`, `returns {ok:false, code:'timeout'} after timeoutMs`, `ignores resolve for an unknown or already timed-out reqId`
  - confirm: `returns true when the box answers true`, `aborts the box and returns false after timeoutMs` (signal.aborted === true), `shows the second box only after the first settles` (두 번째 `showConfirmBox` 호출 시점 확인), `builds the message "An AI agent (via cli) wants to: Create workflow \"X\""` , `calls showWindow before showConfirmBox`
  - controllers: 두 채널이 각각 `aiActionBridge.resolve`, `confirmAiActionUseCase`로 위임한다
- [ ] **Step 2: 실행해 실패 확인.** `yarn test tests/main/application/ai tests/main/application/useCases/ai tests/main/controllers/ai.spec.ts` → FAIL
- [ ] **Step 3: 구현.** confirm은 내부 promise 체인으로 직렬화한다. `showConfirmBox`는 index.ts에서 `Electron.dialog.showMessageBox(win, { message, buttons: ['Allow', 'Deny'], defaultId: 1, cancelId: 1, type: 'question', signal })`의 `response === 0`으로 만든다. abort되면 `response`가 `cancelId`이므로 false다.
- [ ] **Step 4: `src/main/index.ts` 연결.** `appDataDir`를 만든 블록에서: 토큰 생성 → `aiActionBridge` (`send`는 `sendToAppWindow(ipcAiActionRequestChannel, reqId, req)`, 150000ms) → `confirmAiActionUseCase` (120000ms, `showWindow`는 기존 `showBrowserWindowUseCase`) → `createAiControllers`를 `registerControllers` 배열에 추가 → `createAiControlServer({ path, token, handle: aiActionBridge.request })` 시작 → `writeAiEndpoint`. 시작 실패는 `console.error`로 남기고 앱은 계속한다. `will-quit`에 `stopAiControlServer?.()`와 `removeAiEndpointSync(appDataDir)`를 더한다.
- [ ] **Step 5: 통과 확인.** Step 2 명령 → PASS, `yarn test:typecheck:main` → 오류 0
- [ ] **Step 6: 커밋.** `git commit -m "feat(ai): main bridge, confirm dialog and control server wiring"`

### Task 4: renderer 요청 실행기

**Files:**
- Create: `src/renderer/base/ai/aiAction.ts`, `src/renderer/application/interfaces/aiControlProvider.ts`, `src/renderer/infra/aiControlProvider/aiControlProvider.ts`, `src/renderer/application/useCases/ai/runAiRequest.ts`
- Modify: `src/renderer/init.ts`
- Test: `tests/renderer/application/useCases/ai/runAiRequest.spec.ts`

**Interfaces:**
- Consumes: Task 1 타입, Task 3 채널.
- Produces:
  - `interface AiAction<I = unknown> { id: string; description: string; kind: 'read' | 'write'; inputSchema: object; parse(input: unknown): I | undefined; describe(input: I): string; run(input: I): Promise<AiRpcResult> | AiRpcResult }`
    (`parse`는 작업별 타입 가드. 실패면 `undefined`. `describe`는 영어 한 줄.)
  - `interface AiControlProvider { confirm(origin: AiOrigin, describe: string): Promise<boolean>; respond(reqId: number, res: AiRpcResult): Promise<void> }`
  - `createRunAiRequestUseCase(deps: { actions: AiAction[]; aiControl: AiControlProvider; appStore: AppStore }): (req: AiRpcRequest) => Promise<AiRpcResult>`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `actions.list returns AiActionInfo for every action`
  - `returns not_ready while appStore state isLoading` (`fixtureAppStore`의 로드 전 상태 사용)
  - `returns unknown_action for an unknown id`
  - `returns invalid_input when parse returns undefined, without confirming`
  - `runs a read action without confirming`
  - `confirms a write action with origin and describe, then runs it`
  - `returns denied and does not run when confirm resolves false`
  - `returns failed with the error message when run throws`
- [ ] **Step 2: 실행해 실패 확인.** `yarn test tests/renderer/application/useCases/ai/runAiRequest.spec.ts` → FAIL
- [ ] **Step 3: 구현.** 확인 전후 모두 `run`이 상태를 새로 읽도록 하는 것은 각 작업의 책임이다 (Task 5, 6).
- [ ] **Step 4: init.ts 연결.** 다른 알림 리스너 (`ipcSwitchWorkflowByOffsetChannel` 근처)와 같은 자리에 `electronIpcRenderer.on(ipcAiActionRequestChannel, (reqId, req) => runAiRequestUseCase(req).then(res => aiControlProvider.respond(reqId, res)))`. 작업 목록은 Task 5, 6의 생성 함수 결과를 합쳐 넘긴다 (이 Task에서는 빈 배열).
- [ ] **Step 5: 통과 확인.** → PASS, `yarn test:typecheck:renderer` → 오류 0
- [ ] **Step 6: 커밋.** `git commit -m "feat(ai): renderer request runner with confirm gate"`

### Task 5: 앱 작업 (읽기, 프로젝트, 워크플로)

**Files:**
- Create: `src/renderer/application/useCases/ai/actions/appActions.ts`
- Modify: `src/renderer/init.ts` (작업 목록에 추가)
- Test: `tests/renderer/application/useCases/ai/actions/appActions.spec.ts`

**Interfaces:**
- Consumes: `AiAction`, `AppStore`, `CreateWorkflowSubCase`, `deleteWorkflowsSubCase`, `setCurrentWorkflowSubCase`, `setCurrentProjectSubCase`, `DeactivateWorkflowUseCase`, `RenameWorkflowUseCase`, `generateWorkflowName`, `getAllWorkflowNamesFromWorkflowIdList`.
- Produces: `createAppAiActions(deps: { appStore; createWorkflowSubCase; deactivateWorkflowUseCase; renameWorkflowUseCase }): AiAction[]`

작업 정의 (id, kind, 입력, 반환 value):

| id | kind | 입력 | value | 메모 |
|----|------|------|-------|------|
| `app.describe` | read | `{}` | `{ currentProjectId, projects: [{ id, name, currentWorkflowId, workflows: [{ id, name, widgets: [{ id, type, name }] }] }], widgetTypes: [{ id, name, description }] }` | 위젯 순서는 layout 순서 |
| `project.switch` | write | `{ projectId: string }` | `null` | 없는 id는 `not_found` |
| `workflow.create` | write | `{ projectId: string; name?: string }` | `{ workflowId }` | 이름이 없으면 `generateWorkflowName`. 프로젝트 끝에 추가하고 그 워크플로로 전환 (`addWorkflow`와 같은 sub 조합) |
| `workflow.rename` | write | `{ workflowId: string; name: string }` | `null` | 빈 이름은 `invalid_input` |
| `workflow.delete` | write | `{ workflowId: string }` | `null` | 소유 프로젝트를 찾아 `deleteWorkflowsSubCase`. 기존 `deleteWorkflow` use case의 확인 상자는 쓰지 않는다 (확인 중복 방지) |
| `workflow.switch` | write | `{ workflowId: string }` | `null` | 소유 프로젝트로 `setCurrentProjectSubCase` 뒤 `setCurrentWorkflowSubCase` |

describe 문구: `Switch to project "<name>"`, `Create workflow "<name>" in project "<name>"`, `Rename workflow "<old>" to "<new>"`, `Delete workflow "<name>"`, `Switch to workflow "<name>"`. 없는 id면 이름 자리에 id를 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** (fixture: `fixtureAppState`, `fixtureProjectA`, `fixtureWorkflowA` 등)
  - `app.describe lists projects, workflows in order, widgets with display names and widget types`
  - `workflow.create adds to the given project, uses the given name and returns the new id`
  - `workflow.create without name generates a unique name`
  - `workflow.create returns not_found for an unknown project`
  - `workflow.rename rejects an empty name via parse`
  - `workflow.delete removes the workflow from its owner project without showing a dialog`
  - `workflow.delete returns not_found when the workflow was removed after confirm` (run 전에 appStore에서 지운 상태로 run 호출)
  - `workflow.switch switches project and workflow`
  - 모든 write 작업의 `describe`가 위 문구와 같다
- [ ] **Step 2: 실행해 실패 확인.** `yarn test tests/renderer/application/useCases/ai/actions/appActions.spec.ts` → FAIL
- [ ] **Step 3: 구현.** 각 `run`은 시작할 때 `appStore.get()`으로 상태를 새로 읽는다.
- [ ] **Step 4: init.ts에서 작업 목록에 추가.**
- [ ] **Step 5: 통과 확인.** → PASS
- [ ] **Step 6: 커밋.** `git commit -m "feat(ai): app structure actions (describe, project, workflow)"`

### Task 6: 위젯 작업

**Files:**
- Create: `src/renderer/application/useCases/ai/actions/widgetActions.ts`
- Modify: `src/renderer/init.ts`
- Test: `tests/renderer/application/useCases/ai/actions/widgetActions.spec.ts`

**Interfaces:**
- Consumes: `AiAction`, `AppStore`, `CreateWidgetSubCase`, `AddItemToWidgetLayoutSubCase`, `deleteWidgetsFromWidgetLayoutSubCase`, `getWidgetDisplayName`.
- Produces: `createWidgetAiActions(deps: { appStore; createWidgetSubCase; addItemToWidgetLayoutSubCase }): AiAction[]`

| id | kind | 입력 | value | 메모 |
|----|------|------|-------|------|
| `widget.add` | write | `{ workflowId: string; widgetTypeId: string; name?: string }` | `{ widgetId }` | 크기는 `widgetType.minSize`, 위치는 `addItemToWidgetLayoutSubCase`에 맡긴다 (`addWidgetToWorkflow`와 같다) |
| `widget.rename` | write | `{ widgetId: string; name: string }` | `null` | `coreSettings.name` 변경. 빈 문자열 허용 (기본 이름으로 표시) |
| `widget.delete` | write | `{ widgetId: string }` | `null` | layout에 그 `widgetId`가 있는 워크플로를 찾아 지우고 `ui.widgetDynamicTitles`에서도 뺀다 (`deleteWidget`의 workflow 분기와 같은 결과). Shelf 위젯은 이번 범위에서 `not_found` |

describe 문구: `Add a <type name> widget to workflow "<name>"`, `Rename widget "<old>" to "<new>"`, `Delete widget "<name>"`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `widget.add creates the widget in the workflow layout and returns its id`
  - `widget.add returns not_found for an unknown widget type or workflow`
  - `widget.rename updates coreSettings.name`
  - `widget.delete removes widget, layout item and dynamic title`
  - `widget.delete returns not_found for a shelf widget`
- [ ] **Step 2: 실행해 실패 확인.** → FAIL
- [ ] **Step 3: 구현.** `deleteWidget.ts`의 `omitKeys`는 export되어 있지 않다. 같은 동작을 이 파일에서 `Object.fromEntries`로 처리한다 (기존 파일은 건드리지 않는다).
- [ ] **Step 4: init.ts에서 작업 목록에 추가.**
- [ ] **Step 5: 통과 확인.** → PASS
- [ ] **Step 6: 커밋.** `git commit -m "feat(ai): widget add/rename/delete actions"`

### Task 7: `freeter` CLI와 `freeter mcp`

**Files:**
- Create: `src/main/cli/index.ts`, `src/main/cli/cli.ts`, `src/main/cli/mcp.ts`, `resources/bin/freeter.cmd`, `resources/bin/freeter`
- Modify: `webpack.main.config.js`, `electron-builder.config.js`
- Test: `tests/main/cli/cli.spec.ts`, `tests/main/cli/mcp.spec.ts`

**Interfaces:**
- Consumes: Task 1 전부, Task 2 `getAiPipePath`가 아닌 endpoint.json (CLI는 파일만 읽는다).
- Produces:
  - `interface CliIo { stdin: NodeJS.ReadableStream; stdout: { write(s: string): void }; stderr: { write(s: string): void }; env: Record<string, string | undefined> }`
  - `interface AiClient { call(method: 'actions.list' | 'actions.run', params: { actionId?: string; input?: unknown }): Promise<AiRpcResult>; close(): void }`
  - `connectAiClient(endpointPath: string, origin: AiOrigin): Promise<AiClient>` (파일 없음, ENOENT, ECONNREFUSED는 `Error('Freeter is not running')`)
  - `runCli(argv: string[], io: CliIo, connect: typeof connectAiClient): Promise<number>` (종료 코드 반환)
  - `runMcpServer(io: CliIo, client: AiClient): Promise<void>`
  - 기본 endpoint 경로: `io.env.FREETER_AI_ENDPOINT`, 없으면 Windows `%APPDATA%\freeter-swh\freeter-data\ai\endpoint.json`, Linux `$XDG_CONFIG_HOME` (없으면 `~/.config`) `/freeter-swh/freeter-data/ai/endpoint.json`
  - origin: `io.env.FREETER_AI_ORIGIN`이 `AiOrigin` 값이면 그것, 아니면 `cli`. `mcp` 명령은 항상 `mcp`.

명령:

| argv | 동작 | stdout | 종료 코드 |
|------|------|--------|-----------|
| `actions` | 목록을 `id  kind  description` 줄로 | 표 | 0 |
| `actions --json` | 목록 JSON | JSON | 0 |
| `run <id> [--input <JSON>]` | 실행. `--input` 없으면 `{}` | `value`의 JSON | 성공 0, 실패 1 (stderr `<code>: <message>`) |
| `guide` | 에이전트용 사용법: 명령 표, 종료 코드, 확인 상자 설명, 그리고 `actions --json` 결과 | Markdown | 0 |
| `mcp` | stdio MCP 서버 | MCP 메시지 | 0 |
| 그 밖, `--input`이 JSON 아님 | 사용법 출력 | stderr | 2 |
| 연결 실패 | `Freeter is not running` | stderr | 3 |

MCP: `initialize` (클라이언트의 `protocolVersion`을 그대로 돌려줌, `capabilities: { tools: {} }`, `serverInfo: { name: 'freeter', version: <package.json version> }`), `tools/list` (작업 id의 `.`을 `_`로 바꾼 이름, description, inputSchema), `tools/call` (도구 이름을 마지막 `actions.list` 결과에서 찾아 작업 id로 되돌린 뒤 `actions.run`, 성공은 `content: [{ type: 'text', text: JSON }]`, 실패는 `isError: true`와 `<code>: <message>`), 알림 (`id` 없음)은 응답하지 않음, 그 밖 메서드는 `-32601`. 도구 목록은 `tools/list` 때마다 `actions.list`로 새로 받는다.

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 `connect`, 메모리 스트림)
  - `run prints the JSON value and returns 0`
  - `run returns 1 and prints "denied: ..." to stderr when the action is denied`
  - `returns 2 for unknown command and for --input that is not JSON`
  - `returns 3 with "Freeter is not running" when connect throws`
  - `connectAiClient rejects with "Freeter is not running" when endpoint.json points to a dead pipe` (존재하지 않는 pipe 경로를 쓴 임시 endpoint.json)
  - `uses FREETER_AI_ORIGIN when it is a valid origin`
  - mcp: `initialize echoes protocolVersion`, `tools/list maps "workflow.create" to "workflow_create"`, `tools/call returns isError for a failed action`, `does not answer notifications`, `answers -32601 for server/discover`
- [ ] **Step 2: 실행해 실패 확인.** `yarn test tests/main/cli` → FAIL
- [ ] **Step 3: `cli.ts`, `mcp.ts`, `index.ts` 구현.** `index.ts`는 `runCli(process.argv.slice(2), {stdin: process.stdin, ...}, connectAiClient).then(code => process.exit(code))`만 한다.
- [ ] **Step 4: 통과 확인.** → PASS
- [ ] **Step 5: 번들.** `webpack.main.config.js`의 `entry`에 `cli: path.join(__dirname, 'src', 'main', 'cli', 'index.ts')`를 더한다. `yarn prod:main` 뒤 `build/cli.js`가 있고 `node build/cli.js nope; echo $?` → `2`.
- [ ] **Step 6: 래퍼.** `resources/bin/freeter.cmd`:

```bat
@echo off
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\Freeter-SWH.exe" "%~dp0..\app.asar\cli.js" %*
```

  `resources/bin/freeter` (Linux, 실행 권한): 같은 동작 (`ELECTRON_RUN_AS_NODE=1 exec "$DIR/../../freeter-swh" "$DIR/../app.asar/cli.js" "$@"`). 실행 파일 이름은 Task 0 Step 2 결과와 `dist/linux-unpacked`의 실제 이름으로 맞춘다.
- [ ] **Step 7: 패키징.** `electron-builder.config.js`에 `extraResources: [{ from: 'resources/bin', to: 'bin' }]`. `yarn prod && yarn package` 뒤 `dist/win-unpacked/resources/bin/freeter.cmd`가 있다.
- [ ] **Step 8: 커밋.** `git commit -m "feat(ai): freeter CLI with actions/run/guide/mcp commands"`

### Task 8: 문서와 종단 검증

**Files:**
- Modify: `docs/dev/overview.md`, `docs/dev/decisions.md`, `docs/dev/pitfalls.md`, `docs/dev/features-core.md`, `docs/GUIDE.md`, `docs/CHANGES.md`, `README.md`

- [ ] **Step 1: 종단 검증 (저장소 실행).** `yarn prod && yarn prod:run`으로 앱을 띄운다. 다른 터미널에서 `$env:FREETER_AI_ENDPOINT="$env:APPDATA\freeter-swh-dev\freeter-data\ai\endpoint.json"` 뒤:
  1. `node build/cli.js actions` → 작업 9개
  2. `node build/cli.js run app.describe` → 현재 프로젝트 JSON
  3. `node build/cli.js run workflow.create --input '{\"projectId\":\"<id>\",\"name\":\"AI test\"}'` → 확인 상자, Allow → 워크플로 생성, 종료 코드 0
  4. 같은 명령에서 Deny → 종료 코드 1, `denied: ...`
  5. 앱 종료 뒤 `node build/cli.js actions` → `Freeter is not running`, 종료 코드 3. `endpoint.json`이 지워졌다
  6. MCP: spec "검증 결과" 표의 Claude 실행 인자에서 `--mcp-config`를 `node build/cli.js mcp`로 바꿔 "새 워크플로 'MCP test'를 만들어 줘" → 확인 상자 → 생성
- [ ] **Step 2: 전체 검사.** `yarn test`, `yarn test:typecheck`, `yarn lint`, `yarn prod` 모두 오류 0
- [ ] **Step 3: docs/dev 갱신.** overview: IPC 표에 `ai-action-request` (main → renderer 요청 방식), main 기능 지도에 `ai` 그룹, 보안 경계에 제어 서버 행, 번들 표에 `cli.js`, 디스크 경로에 `ai/`. decisions: D70 (제어 통로 CLI + MCP, 로컬 연결 + 실행마다 바뀌는 토큰), D71 (작업은 renderer에서 sub use case로 실행, 기존 use case의 확인 상자 우회), D72 (확인은 main OS 메시지 상자, 120초 abort). pitfalls: Codex `default_tools_approval_mode`, 기존 delete use case를 AI 작업에 쓰면 확인이 두 번 뜸. features-core: AI 제어 절.
- [ ] **Step 4: 사용자 문서.** `docs/GUIDE.md`에 "AI 에이전트로 Freeter 다루기" 절 (래퍼 경로, `FREETER_AI_ENDPOINT`, 명령 표, Claude/Codex MCP 연결 예, 확인 상자, 보내는 데이터 안내). `docs/CHANGES.md`에 `## 99. AI 제어 통로: freeter CLI와 MCP *(작업 완료일)*`, README "이 포크에서 추가한 기능"에 99번 한 줄.
- [ ] **Step 5: 커밋.** `git commit -m "docs(ai): control channel docs, guide and changelog"`
