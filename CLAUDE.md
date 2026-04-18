# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: **Yarn 1 (Classic)** — do not use npm.

- `yarn dev` — full dev stack (renderer HMR + main watch + Electron + react-devtools).
- `yarn dev:no-react-devtools` — same without the separate devtools window.
- `yarn prod` then `yarn prod:run` — production build + launch.
- `yarn package` — produce installers via electron-builder (output in `./dist`).
- `yarn test` — run all Jest projects (Main, Renderer, Common, Test Utils).
- `yarn test <path-or-pattern>` — run a subset; pass `-t "<test name>"` to filter by name.
- `yarn test:watch` — watch mode (clears cache first).
- `yarn test:coverage` — coverage via v8 provider.
- `yarn test:typecheck` — tsc --noEmit for all three surfaces in parallel; `:main`/`:renderer`/`:common` run one.
- `yarn lint` — ESLint across src + tests per surface; `yarn lint:<surface>[:fix]` to target one.

## Architecture

Electron app split into three TS surfaces, each with its own `tsconfig.json` and `eslint.config.mjs`:

- `src/main/` — Node/Electron main process. Entry: `src/main/index.ts`. Owns windows, menus, tray, global shortcuts, file-based data storage, dialogs, child processes.
- `src/renderer/` — browser-side React 19 UI. Entry: `src/renderer/index.tsx` → `init.ts`.
- `src/common/` — code shared by both (state store primitives, IPC channel names, data storage interfaces, helpers).
- `src/renderer/preload/` — built separately (`webpack.preload.config.js`); exposes a minimal `MainApi` to the renderer via `contextBridge`. The API is handed out **exactly once** via `getMainApiOnce()` so it cannot be read off `window`.

Path aliases (mirrored in every tsconfig and in `jest.config.js` `moduleNameMapper`):
- `@/*` → the current surface (`src/main/*` or `src/renderer/*`).
- `@common/*` → `src/common/*`.
- In tests: `@tests/*` → `tests/<surface>/*`, `@testscommon/*` → `tests/common/*`, `@utils/*` → `tests/utils/*`.

### Clean-architecture layering (both main and renderer)

Each surface is organized as:

- `base/` — pure domain types/utilities (entities, state shapes, helpers). No I/O.
- `application/interfaces/` — ports (DataStorage, BrowserWindow, AppStore, Registry, …).
- `application/useCases/<feature>/<action>.ts` — each file exports `create<Name>UseCase(deps)` returning a function. Use cases are composed via constructor-style DI in `init.ts` (renderer) and `index.ts` (main). Sub-use-cases live under `useCases/<feature>/subs/`.
- `infra/` — adapters implementing the interfaces (Electron providers, file storage, IPC glue).
- `data/` — store wiring (renderer: `appStore.ts`, `appStateStorage.ts`; main: `windowStore.ts`).
- `ui/` (renderer only) — React components + hooks + view-model hooks. Components are factories (`createXComponent({deps})`) so presentation stays DI-friendly and testable.

The renderer `init.ts` is the composition root: it builds the store, instantiates providers and every use case, then passes them into `createUI` which wires view-model hooks into component factories. When adding a feature, follow this pattern — add a use case, thread it through `init.ts`, inject it into the view-model hook.

### Main ↔ renderer IPC

- All channels are prefixed `freeter:` (see `src/common/ipc/ipc.ts`).
- Main side: use cases are grouped into controllers under `src/main/controllers/`; `registerControllers` mounts them on an `ipcMain` wrapper (`createIpcMain`) that validates sender origin via `createIpcMainEventValidator`.
- Renderer side: infra code under `src/renderer/infra/` calls into the preload-exposed `MainApi`.

### State management

- Zustand (vanilla) wrapped by `src/common/data/store.ts`. The wrapper adds:
  - A `isLoading` flag while persisted state loads.
  - `prepareState` hook (renderer uses `initAppStateWidgets` to hydrate widget settings from the registry).
  - `mergeState` hook (`mergeAppStateWithPersistentAppState`) to combine disk state with defaults — persistent state is a *subset* of runtime state.
  - Auto-save via `stateStorage.saveState` on every `set`.
- Entity collections/lists live in `src/renderer/base/state/entities.ts` with typed actions in `base/state/actions/`.
- App data is persisted under `<appData>/freeter2/freeter-data`; per-widget data under `<appData>/freeter2/freeter-data/widgets/<widgetId>` (see `src/main/index.ts`).

### Widgets

Widgets are the user-visible units placed into workflows.

- Each widget lives in `src/renderer/widgets/<name>/` with (at minimum) `index.ts`, `widget.tsx`, `settings.tsx`, `icons/`. Optional: `actionBar.ts`, `actions.ts`, `contextMenu.ts`, `widget.module.scss`.
- `src/renderer/widgets/_template/` is the reference scaffold — copy it when creating a new widget type.
- Registration: add the default export to the list in `src/renderer/widgets/index.ts`. The `registry` (`src/renderer/registry/registry.ts`) feeds these types into the store at startup via `entityStateActions.widgetTypes.setAll`.
- A `WidgetType` declares `id`, `name`, `icon`, `minSize`, `description`, `createSettingsState`, `settingsEditorComp`, `widgetComp`, and `requiresApi` (capabilities the main process must grant, e.g. clipboard/shell/terminal). The runtime `WidgetApi` is built per-widget by `getWidgetApiUseCase` based on `requiresApi`.

## Testing conventions

- Jest with `@swc/jest`; tests match `**/*.spec.(ts|tsx)`. Four projects run in parallel (Main=node, Renderer=jsdom, Common=node, Test Utils=node) — see `jest.config.js`.
- Renderer tests use `@testing-library/react` + `jest-dom` (setup in `tests/renderer/setupTests.ts`).
- Shared fixtures/builders live in `tests/utils/` (aliased as `@utils/*`). Prefer these over ad-hoc object literals.
- Colocate `*.spec.ts` next to the code under test; surface-specific helpers go in `tests/<surface>/`.

## Verification

- When fixing a bug, verify the fix is safe across ALL call sites (grep for usages).
- For UI library upgrades (e.g., Ant Design v6), confirm compatibility before claiming done.

## Style notes enforced by ESLint

Single quotes, `max-len: 160`, `eqeqeq`, `curly`, `consistent-return`, `no-var`, `arrow-body-style: as-needed`, unused args must start with `_`. Run `yarn lint:<surface>:fix` before committing.

## Code Style

- Primary language: TypeScript (use strict typing, avoid `any`).
- Maintain CHANGES.md discipline: append a concise entry for every user-visible change (see "Change log maintenance" below).
- Keep scope minimal — implement only what's asked, don't expand features unilaterally.

## Change log maintenance

This fork tracks user-visible changes (features, behavior shifts, UX-affecting refactors) in `docs/CHANGES.md` — it's the single source of truth for "what differs from upstream". `README.md` carries a **one-liner mirror** of the same list so visitors see the fork's value at a glance.

**When a feature addition or behavior change completes**, update **both** files before reporting the task done:

### `docs/CHANGES.md` — full entry

Append a new numbered section. Follow the existing style:

- Header: `## N. <짧은 제목> *(YYYY-MM-DD)*` — continue the running number from the last entry. Date is the first-introduction date (commit that brought the feature in); follow-up tweaks don't update it.
- Lead with user-visible behavior (what changed, when it kicks in), then architecture, then "까다로웠던 포인트" (non-obvious pitfalls worth remembering), then `**수정 파일**` list (신규 / 수정 / 테스트 분리).
- Write in Korean, matching the surrounding narrative tone. Tables are fine where they clarify. Explain *why*, not just *what*.
- Skip this only for pure bug fixes, refactors with no behavior change, or trivial cleanups. When in doubt, add an entry — it's easier to skim later than to reconstruct.

Small tweaks to an existing entry's feature (e.g. format adjustments, follow-up fixes) can be merged into that section rather than creating a new one.

### `README.md` — one-liner in "이 포크에서 추가한 기능"

Append a single numbered line that matches the CHANGES.md section number 1:1. Keep it to one sentence that lands the user-visible value, ending with ` *(YYYY-MM-DD)*` to mirror the CHANGES.md date. If you merged into an existing CHANGES.md entry (follow-up tweak), also update that entry's line in README.md instead of adding a new one (don't bump the date). If the change is purely internal (like a refactor that still got a CHANGES.md entry for tracking), mark it "(내부 리팩토링)" so readers can skim past.
