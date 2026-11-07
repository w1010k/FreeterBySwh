# AI 인프라 단계 1b 구현 계획 (나머지 앱 구조 작업)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 단계 1의 작업 목록에 프로젝트 생성/이름 변경/삭제, 위젯 조회/설정 변경/이동, 앱 설정 조회/변경을 더한다.

**Architecture:** 단계 1과 같다. renderer `AiAction`이 sub use case와 base 함수를 조합한다. 확인, 입력 검증, 오류 코드는 `runAiRequest`가 이미 처리한다.

**Spec:** `docs/superpowers/specs/2026-11-07-ai-infra-design.md` (A. 작업 목록, "앱 구조 변경" 묶음)

## Global Constraints

- 단계 1 계획의 Global Constraints를 그대로 따른다.
- 새 의존성 없음. 확인 문구는 영어 한 줄.
- 기존 use case 중 대화상자를 띄우는 것은 쓰지 않는다 (pitfalls.md "AI 작업과 기존 use case의 확인 상자").
- 모든 `run`은 시작할 때 `appStore.get()`으로 상태를 다시 읽는다.

## Review Focus

1. 마지막 프로젝트 삭제: 거절 (`invalid_input`). 프로젝트가 0개인 앱 상태를 만들지 않는다.
2. 현재 프로젝트 삭제: 현재 프로젝트가 남은 프로젝트로 바뀌고, 지운 워크플로는 Memory Saver에서 비활성화된다.
3. 위젯 설정에 잘못된 타입 값: 위젯 타입의 `createSettingsState`가 기본값으로 바꾼다. 위젯이 깨지지 않는다.
4. 앱 설정의 enum 필드에 모르는 값, 숫자 범위 밖 값: `invalid_input`.
5. 같은 워크플로로 위젯 이동: 아무것도 바꾸지 않고 성공.

## 작업 정의

| id | kind | 입력 | value | 처리 |
|----|------|------|-------|------|
| `project.create` | write | `{ name?: string }` | `{ projectId, workflowId }` | `createProject` + 첫 워크플로 (`createWorkflowSubCase`, 이름 `generateWorkflowName([])`). 프로젝트 목록 끝에 추가. 현재 프로젝트는 바꾸지 않는다 (Project Manager 저장과 같다) |
| `project.rename` | write | `{ projectId, name }` | `null` | `settings.name` 변경. 빈 이름 거절 |
| `project.delete` | write | `{ projectId }` | `null` | `deleteProjectsSubCase` + 현재 프로젝트 재설정 + 지운 워크플로 Memory Saver 비활성화 (`saveChangesInProjectManager`와 같은 결과). 마지막 프로젝트는 `invalid_input` |
| `widget.get` | read | `{ widgetId }` | `{ id, type, name, settings, workflowId }` | 워크플로에 없는 (Shelf) 위젯은 `workflowId: null` |
| `widget.updateSettings` | write | `{ widgetId, settings: object }` | `{ settings }` | `type.createSettingsState({...widget.settings, ...input.settings})`. 타입이 없는 위젯은 `not_found` |
| `widget.move` | write | `{ widgetId, toWorkflowId }` | `null` | 원래 layout에서 빼고 대상 layout에 같은 w,h로 `addItemToWidgetLayoutSubCase` |
| `app.getSettings` | read | `{}` | 아래 허용 키의 현재 값 | |
| `app.updateSettings` | write | 허용 키의 부분 객체 | `null` | 허용 키만, 키마다 검사 |

`app.updateSettings` 허용 키: `uiTheme` (`uiThemeIds` 중 하나), `bgColor`, `bgImage`, `downloadDir` (문자열), `bgImageMode` (`cover|contain|center|tile`), `bgOpacity` (0~100 정수), `workflowBarPos` (`top|bottom|left|right`), `workflowBarWidth` (양의 정수). 그 밖의 키 (`mainHotkey`, `memSaver`, `telemetry`)는 `invalid_input`. 이유: `telemetry`는 사용 통계 동의라 AI가 바꾸지 않는다. `mainHotkey`는 잘못 바꾸면 창을 부를 수 없다.

describe 문구: `Create project "<name|(default name)>"`, `Rename project "<old>" to "<new>"`, `Delete project "<name>" and all its workflows`, `Change settings of widget "<name>": <keys>`, `Move widget "<name>" to workflow "<name>"`, `Change app settings: <keys>`.

## Tasks

### Task 1: 프로젝트 작업

**Files:** Create `src/renderer/application/useCases/ai/actions/projectActions.ts`, Test `tests/renderer/application/useCases/ai/actions/projectActions.spec.ts`, Modify `src/renderer/init.ts`.

**Interfaces:** Produces `createProjectAiActions(deps: { appStore; idGenerator; createWorkflowSubCase; deactivateWorkflowUseCase }): AiAction[]`.

- [ ] 테스트: create (목록 끝 추가, 첫 워크플로, 이름 생성), rename (빈 이름 parse 거절), delete (현재 프로젝트 재설정, 위젯·워크플로 제거, memSaver 비활성화), 마지막 프로젝트 거절, not_found, describe 문구
- [ ] RED 확인 → 구현 → GREEN → init.ts 연결 → `tsc -p src/renderer/tsconfig.json` → 커밋

### Task 2: 위젯 조회·설정·이동

**Files:** Modify `src/renderer/application/useCases/ai/actions/widgetActions.ts`, test 파일.

- [ ] 테스트: widget.get (워크플로/Shelf), updateSettings (병합과 sanitize, 타입 없음 not_found), move (다른 워크플로, 같은 워크플로 no-op, 대상 없음 not_found), describe 문구
- [ ] RED → 구현 → GREEN → 커밋

### Task 3: 앱 설정

**Files:** Create `src/renderer/application/useCases/ai/actions/settingsActions.ts`, test 파일, Modify `init.ts`.

- [ ] 테스트: getSettings 값, updateSettings 허용 키 반영, 모르는 키·enum 밖 값·범위 밖 숫자 parse 거절, describe 문구
- [ ] RED → 구현 → GREEN → 커밋

### Task 4: 문서와 검증

- [ ] `yarn test`, `yarn test:typecheck`, `tsc -p src/renderer/tsconfig.json`, `yarn lint`
- [ ] `docs/dev/features-core.md` AI 제어 절의 작업 목록, CHANGES #99 (후속 변경으로 병합), README 99번 줄, GUIDE 명령 예 갱신
- [ ] 커밋
