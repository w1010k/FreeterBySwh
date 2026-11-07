# Freeter AI 인프라 설계

- 작성일: 2026-11-07
- 상태: 초안 (사용자 검토 전)
- 범위: 인프라만. 채팅, 한 줄 질문, AI 위젯, 터미널 위젯 같은 화면은 각각 별도 spec으로 다룬다.

## 배경과 목표

### 목표

Freeter에 AI 인프라를 만든다. AI는 사용자가 PC에 설치하고 로그인한 Claude Code (`claude`)와 Codex (`codex`)를 쓴다. Freeter는 계정 정보와 API 키를 다루지 않는다.

### 참고한 제품

| 제품 | 참고한 점 |
|------|-----------|
| Lomar (`IdeaProjects/markedit`) | PATH에서 `claude`, `codex`를 찾아 실행한다. 프롬프트는 stdin, 답은 stdout. 시간 제한과 취소. 실행 인자 (`src/ai.rs` `command`) |
| Aside (AI 브라우저) | 세 층 구조: AI가 앱의 본래 일을 한다, AI가 앱 자체를 다룬다, 채팅이 두 가지로 이어진다. `aside mcp`로 다른 에이전트에 앱을 연다. 민감한 작업은 사용자 확인 뒤에 실행한다 |
| Orca (stablyai/orca, MIT) | Electron + React 19 + TypeScript. `node-pty`와 `@xterm/xterm`으로 앱 안에서 CLI 에이전트를 실행한다. "Orca에서 할 수 있는 일은 에이전트도 할 수 있다"는 원칙과 `orca` CLI, 에이전트용 사용법 skill |

### Aside 틀의 Freeter 대응

| Aside | Freeter |
|-------|---------|
| 본질: 브라우저 | 본질: 프로젝트와 워크플로에 위젯을 모아 두는 업무 정리 앱 |
| AI가 브라우징을 한다 | AI가 위젯을 쓴다 (To-do 항목 추가, Note 쓰기, 링크 열기, Commander 명령 실행, 위젯 내용 읽기) |
| AI가 브라우저 앱을 다룬다 | AI가 Freeter 자체를 다룬다 (프로젝트, 워크플로, 위젯의 생성, 배치, 설정) |
| 기본 채팅 | Freeter 안의 AI 대화. 답하다가 위 두 가지 작업으로 이어진다 |

### 원칙

1. 사람이 Freeter에서 할 수 있는 일은 AI도 할 수 있다.
2. 쓰기 작업은 모두 Freeter가 사용자에게 확인을 받은 뒤 실행한다. 확인은 Freeter 안에서 받으므로 어느 에이전트에서 왔든 같다.
3. 외부 에이전트가 Freeter를 다루는 통로는 CLI와 MCP 두 가지다. 두 통로는 같은 작업 목록과 같은 처리부를 쓴다.
4. 인프라가 먼저다. 화면은 인프라 위에 나중에 올린다.

## 범위

### 포함

| 부분 | 내용 |
|------|------|
| A. 작업 목록 | Freeter 작업을 이름, 입력 스키마, 읽기/쓰기 구분을 가진 목록으로 정의한다 (renderer) |
| B. 확인 장치 | 쓰기 작업 전에 확인 창을 띄운다 (renderer) |
| C. 제어 서버 | 실행 중인 Freeter가 로컬 연결을 열고, 요청을 작업 목록으로 넘긴다 (main) |
| D. `freeter` CLI와 `freeter mcp` | 외부 프로세스가 제어 서버를 쓰는 두 통로 |
| E. 에이전트 실행기 | Freeter가 `claude`, `codex`를 직접 실행하고 대화를 이어 간다 (main) |
| F. 터미널 실행기 | 앱 안에서 셸을 실행하는 pty 관리 (main) |

### 제외 (별도 spec)

- 채팅 화면, 한 줄 질문 화면, AI 위젯, 터미널 위젯 (탭, 분할, 재시작 후 화면 유지의 화면 쪽)
- 채팅 화면의 위치는 사용자가 나중에 정한다
- Claude Code, Codex 외의 에이전트 실행 규칙. 단, 제어 통로 (CLI, MCP)는 어느 에이전트든 쓸 수 있다
- 시스템 PATH에 `freeter` 명령을 전역 설치하는 기능

## 검증 결과 (2026-11-07, 버리는 코드)

scratchpad에 Node 스크립트 하나로 stdio MCP 서버를 만들고 가짜 도구 `list_todos`, `add_todo`로 확인했다.

| 항목 | Claude Code 2.1.319 | Codex CLI 0.164.0 |
|------|---------------------|-------------------|
| 실행 인자 | `claude -p --tools "" --setting-sources "" --strict-mcp-config --mcp-config <파일> --allowedTools <MCP 도구들> --output-format json` | `codex exec --json --skip-git-repo-check --sandbox read-only -c mcp_servers.<이름>.command=... -c mcp_servers.<이름>.args=[...] -c mcp_servers.<이름>.default_tools_approval_mode="approve" -` |
| MCP 도구 호출 | 성공 | 성공. 단, `default_tools_approval_mode`가 없으면 "MCP tool call requires approval, but approval policy is never"로 막힌다 |
| 대화 이어 가기 | `--resume <session_id>` 성공. `--no-session-persistence`와 함께 쓸 수 없다 | `codex exec resume <thread_id>` 성공 |
| 쓰기 전 확인 | `--permission-prompt-tool`로 MCP 도구에 allow/deny를 물을 수 있다 | 같은 장치를 찾지 못했다 |
| 내장 도구 끄기 | `--tools ""`로 모두 끈다 | 셸 명령을 끄는 옵션을 찾지 못했다. 도구가 막히자 read-only sandbox에서 셸 명령 4개를 실행했다 |
| MCP 서버 수명 | 턴마다 서버 프로세스를 새로 띄운다 | (확인하지 않음) |
| 사용량 | haiku로 턴당 약 3초 | 짧은 1턴에 입력 토큰 약 12.9만 (캐시 약 11.3만). 원인은 확인하지 않았다 (추정: 사용자 전역 설정과 지시문 로드) |

설계에 준 영향:

- MCP 서버는 데이터를 가지면 안 된다. 실행 중인 Freeter에 요청을 넘기는 중계 프로세스여야 한다 (부분 C, D).
- 확인은 에이전트별 장치 대신 Freeter 처리부에서 받는다. `--permission-prompt-tool`은 쓰지 않는다 (부분 B).
- 에이전트 실행기는 세션 기록을 남겨야 한다. 대화 내용은 `~/.claude/projects` 등 각 CLI의 저장 위치에 남는다 (부분 E).

### 단계 0 결과 (2026-11-07)

| 항목 | 결과 |
|------|------|
| RunAsNode (패키지된 `Freeter-SWH.exe`, `electron-builder --dir`) | `ELECTRON_RUN_AS_NODE=1`로 Node 스크립트 실행 성공. Node `spawnSync`와 bash pipe에서 stdin, stdout, 종료 코드 (7) 모두 정상 |
| RunAsNode에서 asar 읽기 | `require('<resources>/app.asar/package.json')` 성공 |
| PowerShell에서 직접 실행 | `& Freeter-SWH.exe ...`는 출력과 종료 코드를 받지 못했다. PowerShell이 GUI 실행 파일을 기다리지 않기 때문으로 보인다 (추정). 래퍼 `.cmd`를 거치는 경우는 단계 1 Task 7에서 확인한다 |
| named pipe 기본 ACL | 측정 실패. `[System.IO.Directory]::GetAccessControl`이 pipe에 대해 오류 87을 냈다. 토큰 검사가 접근 통제를 맡으므로 설계는 그대로 둔다 |

## 구조

### 전체 흐름

```
[외부 에이전트 / 사람]                [Freeter]
 claude, codex (내장 터미널 또는 외부)
   ├─ 셸 명령: freeter run ... ─┐
   └─ MCP: freeter mcp (stdio) ─┤
                                ▼
                     C. 제어 서버 (main, 로컬 연결)
                                │  IPC (main → renderer 요청, renderer → main 응답)
                                ▼
                     A. 작업 목록 (renderer)
                                │  쓰기면
                                ▼
                     B. 확인 창 (renderer) ── 거절 → 오류 응답
                                │  허용
                                ▼
                     기존 use case / 위젯 작업 처리기

 E. 에이전트 실행기 (main): Freeter가 claude/codex를 실행할 때 `freeter mcp`를 MCP 서버로 붙인다
 F. 터미널 실행기 (main): 셸 환경 변수에 CLI 경로와 연결 정보를 넣는다
```

### 왜 renderer에서 작업을 실행하는가

프로젝트, 워크플로, 위젯을 바꾸는 use case는 모두 `src/renderer/application/useCases/`에 있다. 앱 상태 store도 renderer가 가진다. main에 같은 로직을 다시 만들면 상태가 둘로 갈라진다. 그래서 main은 요청을 받아 renderer로 넘기기만 한다.

## A. 작업 목록

### 형태

```ts
// src/renderer/base/ai/action.ts (예정)
interface AiAction<I, O> {
  id: string;              // 'workflow.create', 'widget.todo.addItem' 처럼 점으로 구분
  description: string;     // 에이전트가 읽는 영어 설명
  kind: 'read' | 'write';
  inputSchema: JsonSchema; // MCP inputSchema와 CLI --input 검증에 같이 쓴다
  describe(input: I): string; // 확인 창에 보일 한국어 요약 (write만)
  run(input: I): Promise<O>;
}
```

- 목록은 `init.ts`에서 use case를 받아 만든다. 기존 DI 방식을 따른다.
- 입력 검증: 신뢰 경계이므로 `run` 전에 스키마로 검증한다. 검증 라이브러리를 새로 넣지 않고, 작업별 타입 가드 함수로 검증한다. `inputSchema`는 에이전트에게 보여 주는 문서 역할만 한다. (구현 때 기존 검증 helper가 있는지 먼저 찾는다)
- 반환값은 JSON으로 직렬화할 수 있어야 한다. 엔티티는 id와 이름을 함께 돌려준다.

### 작업 묶음

| 묶음 | 예 | 처리 경로 |
|------|----|-----------|
| 읽기 | `app.describe` (프로젝트, 워크플로, 위젯 트리), `widget.get`, 위젯별 내용 읽기 | store 읽기, 위젯 데이터 저장소 읽기 |
| 앱 구조 변경 | 프로젝트와 워크플로의 생성, 이름 변경, 삭제, 순서 변경, 전환. 위젯 추가, 삭제, 복사, 크기와 위치 변경, 설정 변경. 앱 설정 변경 | 기존 use case 호출. 드래그처럼 UI 조작으로만 있는 기능은 결과가 같은 의미 단위 작업 (`widget.move`)으로 만든다 |
| 위젯 내용 변경 | To-do 항목 추가, 완료, 삭제. Note 본문 쓰기. Spreadsheet 셀 쓰기 | 위젯 타입별 처리기 (아래) |
| 위젯 동작 실행 | 링크 열기, Commander 명령 실행, Webpage 이동 | 위젯 타입별 처리기 (아래) |

### 위젯 타입별 처리기

- `WidgetType`에 선택 필드 `aiActions`를 더한다. 위젯 타입마다 자기 작업을 선언한다. 없으면 그 위젯은 읽기 공통 작업 (설정 읽기)만 가진다.
- 내용 변경은 위젯 데이터 저장소에 쓴다. 위젯이 화면에 있으면 (마운트 상태) 위젯 자신의 메모리 상태가 저장소를 다시 덮어쓸 수 있다. 그래서 쓰기 뒤에 해당 위젯에 다시 읽기 이벤트를 보낸다. 기존 `useSharedDataChangedEffect` (`src/renderer/widgets/sharedDataSync.ts`)와 같은 방식이다. 사용자가 그 위젯을 편집 중이면 작업을 거절하고 "편집 중" 오류를 돌려준다.
- 동작 실행은 위젯이 마운트되어 있어야 하는 경우가 있다 (Webpage 이동). 이 경우 기존 `exposeApi` 장치를 쓴다. 위젯이 Memory Saver로 비활성이면 "비활성 위젯" 오류를 돌려준다. 에이전트는 워크플로 전환 작업으로 먼저 활성화할 수 있다.
- 구현 순서: To-do, Note를 먼저 하고, 나머지 위젯은 단계 4에서 하나씩 더한다.

## B. 확인 장치

- `kind: 'write'` 작업은 실행 전에 확인 창을 띄운다. 창에는 요청한 곳 (CLI, MCP, 에이전트 실행기)과 `describe(input)` 결과를 보인다.
- 버튼: 허용, 거절. 거절하면 에이전트에게 "사용자가 거절했다" 오류를 돌려준다. 에이전트는 이 문구를 읽고 사용자에게 알린다 (검증 결과에서 Claude가 그렇게 답했다).
- 창이 숨겨져 있으면 창을 보이고 확인 창을 띄운다.
- 120초 안에 답이 없으면 거절로 처리한다.
- 확인 요청은 한 번에 하나만 보인다. 나머지는 차례를 기다린다.
- "이번 대화에서 모두 허용" 같은 완화 옵션은 넣지 않는다. 필요해지면 화면 spec에서 다룬다.

## C. 제어 서버

### 연결

- main이 `node:net`으로 서버를 연다. 새 의존성은 없다.
  - Windows: named pipe `\\.\pipe\freeter-swh-<appDataDir 해시>`. 설치본과 저장소 실행 (`freeter-swh-dev`)이 서로 다른 pipe를 쓴다.
  - Linux: `<appDataDir>/ai/control.sock`, 권한 0600.
- 연결 정보 파일: `<appDataDir>/ai/endpoint.json` = `{ pipe, token, pid }`. 앱 시작 때 쓰고 종료 때 지운다.
- 토큰: 앱 실행마다 새로 만든다 (`crypto.randomBytes`). 모든 요청에 토큰이 맞아야 한다. 이유: Windows named pipe의 기본 접근 권한이 다른 사용자를 막는지 확인하지 않았다. 토큰 파일은 사용자 프로필 폴더 안에 있으므로 같은 사용자만 읽는다고 본다. 기존 Analytics 서버의 "실행마다 바뀌는 토큰" 방식과 같다.

### 프로토콜

- 줄 단위 JSON-RPC 2.0. 메서드는 두 개다.
  - `actions.list` → `{ id, description, kind, inputSchema }[]`
  - `actions.run { id, input, origin }` → 작업 결과 또는 오류
- 오류 코드: 토큰 불일치, 알 수 없는 작업, 입력 검증 실패, 사용자 거절, 확인 시간 초과, 편집 중, 비활성 위젯, 실행 실패.

### main과 renderer 사이

- 지금 IPC는 renderer → main 요청 (`invoke`/`handle`)과 main → renderer 알림 (`webContents.send`)만 있다. main → renderer 요청은 없다.
- 새 방식: main이 `ai-action-request` 알림을 `{ reqId, id, input, origin }`으로 보낸다. renderer는 실행 뒤 `ai-action-response`를 `invoke`로 돌려준다. main은 `reqId`로 대기 중인 요청을 찾는다.
- 응답 대기 시간 제한: 확인 대기 (120초)보다 길게 150초. 넘으면 시간 초과 오류.
- renderer가 아직 로드 중이면 (`isLoading`) 요청을 거절한다.

## D. `freeter` CLI와 `freeter mcp`

### 배포 방식

- CLI 코드는 별도 번들 `build/cli.js`로 만든다 (webpack target `node`).
- 실행은 Freeter 실행 파일 자체를 Node로 쓴다: 환경 변수 `ELECTRON_RUN_AS_NODE=1`. 새 런타임이나 의존성이 필요 없다. 지금 `electron-builder.config.js`에는 fuse 설정이 없으므로 RunAsNode가 켜져 있다.
- Windows 래퍼 `freeter.cmd`, Linux 래퍼 `freeter` (셸 스크립트)를 패키지에 넣는다.
- PATH: 전역 설치는 하지 않는다. 에이전트 실행기와 터미널 실행기가 자식 프로세스의 PATH 앞에 래퍼 폴더를 넣는다. 외부 터미널에서 쓰려면 사용자가 직접 PATH에 넣거나 전체 경로로 실행한다.
- 연결 정보: 환경 변수 `FREETER_AI_ENDPOINT` (endpoint.json 경로)가 있으면 그것을, 없으면 설치본 기본 경로를 읽는다.
- 확인 필요 (단계 0): 패키지된 GUI 실행 파일을 `ELECTRON_RUN_AS_NODE=1`로 실행할 때 stdout, stdin이 pipe로 정상 동작하는지.

### 명령

| 명령 | 동작 |
|------|------|
| `freeter actions [--json]` | 작업 목록 |
| `freeter run <작업 id> [--input <JSON>]` | 작업 실행. 결과는 JSON으로 stdout에, 오류는 stderr와 종료 코드로 |
| `freeter guide` | 에이전트용 사용법 (Orca의 `orca skills get` 방식). 작업 목록을 포함해 실행 중인 Freeter 버전에 맞게 만든다 |
| `freeter mcp` | stdio MCP 서버. 시작 때 `actions.list`로 도구 목록을 만들고, 도구 호출을 `actions.run`으로 넘긴다 |

- Freeter가 실행 중이 아니면 "Freeter is not running" 오류와 종료 코드를 돌려준다. 자동 실행은 하지 않는다.
- MCP 구현: 검증 때 손으로 쓴 JSON-RPC 처리 약 50줄로 충분했다. `@modelcontextprotocol/sdk`는 넣지 않는다. 새 프로토콜 요청 (검증 때 본 `server/discover`)은 "method not found"로 답한다. 프로토콜 버전 대응이 부족해지면 SDK로 바꾼다.

## E. 에이전트 실행기

### 역할

Freeter가 `claude`나 `codex`를 직접 실행한다. 채팅, 한 줄 질문 같은 화면이 이것을 쓴다. 이번 spec은 IPC API까지만 만든다.

### 동작

- 설치 확인: PATH에서 `claude.exe`/`claude.cmd`, `codex.exe`/`codex.cmd`를 찾는다 (Lomar `find_on_path`와 같다). 설정을 열 때 다시 찾는다.
- 대화 시작과 이어 가기:
  - Claude: `-p --tools "" --setting-sources "" --strict-mcp-config --mcp-config <ai/mcp-claude.json> --allowedTools mcp__freeter__* --output-format stream-json --verbose`. 이어 갈 때 `--resume <session_id>`.
  - Codex: `exec --json --skip-git-repo-check --sandbox read-only -c mcp_servers.freeter.*` (자동 승인 포함). 이어 갈 때 `exec resume <thread_id>`.
  - 프롬프트는 stdin으로 보낸다.
  - MCP 서버 명령은 `freeter mcp`이고, 환경 변수로 연결 정보와 `origin=agent-runner`를 넘긴다.
- 작업 폴더: `<appDataDir>/ai/empty` (빈 폴더). Lomar와 같다.
- 출력: 두 CLI의 이벤트 (Claude stream-json, Codex `--json`)를 공통 이벤트로 바꿔 renderer로 보낸다: 텍스트, 도구 호출 시작/끝, 완료 (세션 id, 사용량), 오류.
- 취소: 프로세스 트리를 끝낸다 (Windows `taskkill /T /F`, Lomar와 같다).
- 시간 제한: 턴당 기본 300초. 확인 창 대기 시간이 포함되므로 Lomar의 60초보다 길다.
- 동시 실행: 대화마다 프로세스 하나. 같은 대화에서는 한 턴씩.

### 설정

- `appConfig.ai = { tool: 'none' | 'claude' | 'codex', claudeModel, codexModel, effort }`. 기본 `tool: 'none'`.
- `appConfig`의 새 최상위 필드이므로 기존 사용자도 기본값을 받는다. `ai` 객체 안에 필드를 나중에 더하면 저장된 객체가 통째로 덮어써서 새 필드 기본값이 빠진다 (overview.md "앱 상태의 영구 범위"). 그때는 읽는 쪽에서 기본값을 채운다.

### IPC

- `ai-agent-detect` → `{ claude: boolean, codex: boolean }`
- `ai-agent-send { conversationId?, tool, prompt }` → `{ conversationId }`. 이벤트는 `ai-agent-event`로 보낸다.
- `ai-agent-cancel { conversationId }`

### 알려진 한계

- Codex는 셸 명령을 끌 수 없어 PC의 파일을 읽을 수 있다. 사용자 전역 지시문 (`~/.codex/AGENTS.md`)도 읽는다. Lomar와 같은 한계이고, 화면 spec에서 사용자 안내에 넣는다.
- 대화 기록은 각 CLI의 저장 위치에 남는다.

## F. 터미널 실행기

### 역할

앱 안에서 셸 (PowerShell, cmd, Git Bash 등)을 실행한다. 터미널 위젯, 탭, 분할, AI 시작 버튼이 이것을 쓴다. 이번 spec은 main의 pty 관리와 IPC까지만 만든다.

### 의존성 결정

- `node-pty`가 필요하다. `claude` 같은 대화형 TUI는 pipe로는 동작하지 않고 pty가 필요하기 때문이다.
- 이 결정은 기존 방침과 부딪친다. decisions.md D55 등은 "네이티브 의존성 0으로 패키징이 안전하다"를 이유로 네이티브 모듈을 피했다.
- 버린 대안: (1) `child_process` pipe만 쓰기 (대화형 TUI가 동작하지 않는다). (2) 외부 터미널만 쓰기 (지금 Commander 방식. 앱 안에 둘 수 없다).
- 결과: decisions.md에 새 결정으로 기록한다. 구현 전에 단계 0 검증을 통과해야 한다.
- 화면 쪽 `@xterm/xterm`은 터미널 위젯 spec에서 다룬다.

### 동작

- 세션: `terminalId`별 pty. 셸 종류, 시작 폴더, 시작 명령, 크기를 받는다.
- 환경 변수: PATH 앞에 `freeter` 래퍼 폴더, `FREETER_AI_ENDPOINT`, `origin=terminal`.
- 출력 버퍼: 세션마다 최근 출력을 메모리에 일정 크기 (예정: 1MB)까지 둔다. 재시작 후 화면 유지는 이 버퍼를 위젯 데이터 저장소에 저장해서 만든다. 저장 시점과 크기는 터미널 위젯 spec에서 정한다.
- 종료: 앱 종료 때 모든 pty를 끝낸다. 위젯 삭제 때 해당 pty를 끝낸다.
- IPC: `terminal-create`, `terminal-write`, `terminal-resize`, `terminal-kill`, 알림 `terminal-data`, `terminal-exit`.
- 출력 알림은 묶어서 보낸다 (예정: 16ms 간격). 출력이 많을 때 IPC 메시지 수를 줄이기 위해서다.

## 보안

| 위협 | 대응 |
|------|------|
| 다른 프로세스가 제어 서버에 접속 | 실행마다 바뀌는 토큰. 토큰 파일은 사용자 프로필 폴더 안. Linux 소켓은 0600 |
| 잘못된 입력 | 작업마다 입력 검증 (타입 가드). 검증 실패는 실행하지 않는다 |
| AI가 원치 않는 변경 | 모든 쓰기는 확인 창. 확인 시간 초과는 거절 |
| AI가 PC 파일과 명령에 접근 | 에이전트 실행기: Claude는 내장 도구 없음, Codex는 read-only sandbox (파일 읽기는 가능, 한계로 기록). 터미널 실행기: 사용자가 직접 터미널을 쓰는 것과 같은 권한 |
| 외부로 나가는 데이터 | 에이전트에게 보낸 내용은 Anthropic 또는 OpenAI로 간다. 화면 spec에서 사용자 안내에 넣는다 |
| IPC 발신자 | 새 IPC 채널도 기존 `createIpcMainEventValidator`를 거친다 |

## 오류 처리

- 제어 서버가 열리지 않으면 (pipe 이름 충돌 등) AI 기능만 끄고 앱은 계속 동작한다. 로그를 남긴다.
- 에이전트 CLI가 없거나 로그인되지 않았으면 그 CLI의 오류 문구를 그대로 화면으로 넘긴다 (Lomar `AiError::Failed`와 같다).
- 작업 실행 중 예외는 오류 응답으로 바꾼다. 앱 상태 저장은 기존 store 경로를 그대로 쓰므로 새 데이터 손실 경로는 없다.
- pty 생성 실패 (셸 없음 등)는 `terminal-exit`에 오류와 함께 보낸다.

## 테스트와 검증

- 작업 목록: 작업마다 입력 검증, 읽기/쓰기 구분, use case 호출을 단위 테스트한다 (`tests/renderer/...`, 기존 fixture 사용).
- 확인 장치: 허용, 거절, 시간 초과, 대기열 순서.
- 제어 서버: 토큰 불일치, 알 수 없는 작업, 응답 시간 초과, 줄 단위 프로토콜 파싱 (부분 줄, 여러 줄).
- CLI: 인자 파싱, 종료 코드, `freeter mcp`의 initialize, tools/list, tools/call 처리.
- 에이전트 실행기: 실행 인자 생성 (Lomar 테스트처럼 인자 문자열 검사), 이벤트 변환, 취소.
- 터미널 실행기: `node-pty`를 mock으로 바꿔 세션 관리와 출력 묶음만 테스트한다.
- 수동 검증: 단계마다 아래 "검증" 항목.

## 구현 단계

각 단계는 별도 구현 계획으로 나눈다.

| 단계 | 내용 | 검증 |
|------|------|------|
| 0. 사전 검증 (버리는 코드) | (1) `node-pty`를 Electron 42에서 빌드하고 `yarn package`로 msi, zip, tar.xz에 넣기. (2) 패키지된 실행 파일을 `ELECTRON_RUN_AS_NODE=1`로 실행해 stdin, stdout pipe 동작 확인. (3) named pipe의 기본 접근 권한 확인 | 세 항목 결과를 기록하고, 실패 항목은 이 spec을 고친다 |
| 1. 작업 목록 (읽기, 앱 구조) + 확인 장치 + 제어 서버 + CLI | `freeter actions`, `freeter run` | 외부 터미널에서 `freeter run workflow.create`를 실행하면 확인 창이 뜨고, 허용하면 워크플로가 생긴다. 거절하면 오류 종료 코드 |
| 2. `freeter mcp` + 에이전트 실행기 | MCP 통로, `ai-agent-*` IPC | `claude`, `codex` 각각 "새 워크플로 만들어 줘" 요청이 확인 창을 거쳐 실행된다. 대화 이어 가기 동작 |
| 3. 위젯 처리기 (To-do, Note) | `aiActions`, 다시 읽기 이벤트 | 마운트된 To-do에 항목을 추가하면 화면에 바로 보이고, 편집 중이면 거절된다 |
| 4. 나머지 위젯 처리기 | Commander, Link Opener, Webpage, Spreadsheet 등 | 위젯마다 작업 1개 이상을 CLI로 실행 |
| 5. 터미널 실행기 | pty 관리, IPC | 개발용 호출로 PowerShell에서 `freeter actions`가 실행된다 |

화면 spec (채팅, 한 줄 질문, AI 위젯, 터미널 위젯)은 단계 2와 5 뒤에 각각 쓴다.

## 미결 사항

- 확인 창의 모양과 위치 (화면 spec과 함께 정한다)
- 에이전트 실행기의 기본 모델과 effort 값 (Lomar는 Claude 기본 haiku)
- 터미널 출력 버퍼의 저장 시점과 크기
- macOS: 패키징 대상이 없으므로 (D59) 다루지 않는다

## 문서 영향 (구현 때)

- `docs/dev/overview.md`: IPC (main → renderer 요청 방식), main 기능 지도 (ai, terminal), 보안 경계, 번들 (`cli.js`), 디스크 경로 (`ai/`)
- `docs/dev/decisions.md`: 제어 통로 (CLI + MCP), renderer에서 작업 실행, 확인 장치 위치, `node-pty` 도입
- `docs/dev/pitfalls.md`: 위젯 메모리 상태와 외부 쓰기의 충돌, Codex 승인 정책
- `docs/CHANGES.md`, `README.md`: 사용자에게 보이는 기능이 생기는 단계에서 추가
