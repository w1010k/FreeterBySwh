# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Developer docs (`docs/dev/`)

Detailed docs written for Claude. Before changing code, open `docs/dev/README.md` (an index of which doc to read for
which task) and read the relevant doc.

- `overview.md`: whole-app structure, fork history, IPC, state and storage, build, tests, security boundaries.
- `features-core.md`: code map of renderer app features (projects, workflows, layout, palette, shelf, menus, settings,
  Memory Saver, Analytics).
- `features-widgets.md`: widget system and per-widget code map.
- `pitfalls.md`: traps to check before editing, grouped by topic.
- `decisions.md`: design decisions with reasons, rejected alternatives, and status.
- `procedures.md`: verification order, adding a widget, release, upstream merge.

Maintenance: when a task changes code, update the affected `docs/dev/` file in the same task (the mapping table is in
`docs/dev/README.md`). When a `docs/dev/` file disagrees with the code, the code wins: fix the `docs/dev/` file.

## Commands

Package manager: **Yarn 1 (Classic)** — do not use npm.

- `yarn dev` — full dev stack (renderer dev server + main watch + Electron + react-devtools). Renderer
  changes are not hot-reloaded (dev server `hot: false`, `liveReload: false`): reload the window (Dev menu → reload).
  Preload is built once at startup, so restart `yarn dev` after preload changes.
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

- `src/main/` — Node/Electron main process. Entry: `src/main/index.ts`. Owns windows, menus, tray, global shortcuts,
  file-based data storage, dialogs, child processes.
- `src/renderer/` — browser-side React 19 UI. Entry: `src/renderer/index.tsx` → `init.ts`.
- `src/common/` — code shared by both (state store primitives, IPC channel names, data storage interfaces, helpers).
- `src/renderer/preload/` — built separately (`webpack.preload.config.js`); exposes a minimal `MainApi` to the renderer
  via `contextBridge`. The API is handed out **exactly once** via `getMainApiOnce()` so it cannot be read off `window`.

Path aliases (mirrored in every tsconfig and in `jest.config.js` `moduleNameMapper`):

- `@/*` → the current surface (`src/main/*` or `src/renderer/*`).
- `@common/*` → `src/common/*`.
- In tests: `@tests/*` → `tests/<surface>/*`, `@testscommon/*` → `tests/common/*`, `@utils/*` → `tests/utils/*`.

### Clean-architecture layering (both main and renderer)

Each surface is organized as:

- `base/` — pure domain types/utilities (entities, state shapes, helpers). No I/O.
- `application/interfaces/` — ports (DataStorage, BrowserWindow, AppStore, Registry, …).
- `application/useCases/<feature>/<action>.ts` — each file exports `create<Name>UseCase(deps)` returning a function. Use
  cases are composed via constructor-style DI in `init.ts` (renderer) and `index.ts` (main). Sub-use-cases live under
  `useCases/<feature>/subs/`.
- `infra/` — adapters implementing the interfaces (Electron providers, file storage, IPC glue).
- `data/` — store wiring (renderer: `appStore.ts`, `appStateStorage.ts`; main: `windowStore.ts`).
- `ui/` (renderer only) — React components + hooks + view-model hooks. Components are factories
  (`createXComponent({deps})`) so presentation stays DI-friendly and testable.

The renderer `init.ts` is the composition root: it builds the store, instantiates providers and every use case, then
passes them into `createUI` which wires view-model hooks into component factories. When adding a feature, follow this
pattern — add a use case, thread it through `init.ts`, inject it into the view-model hook.

### Main ↔ renderer IPC

- All channels are prefixed `freeter:` (see `src/common/ipc/ipc.ts`).
- Main side: use cases are grouped into controllers under `src/main/controllers/`; `registerControllers` mounts them on
  an `ipcMain` wrapper (`createIpcMain`) that validates sender origin via `createIpcMainEventValidator`.
- Renderer side: infra code under `src/renderer/infra/` calls into the preload-exposed `MainApi`.

### State management

- Zustand (vanilla) wrapped by `src/common/data/store.ts`. The wrapper adds:
  - A `isLoading` flag while persisted state loads.
  - `prepareState` hook (renderer uses `initAppStateWidgets` to hydrate widget settings from the registry).
  - `mergeState` hook (`mergeAppStateWithPersistentAppState`) to combine disk state with defaults — persistent state is
    a *subset* of runtime state.
  - Auto-save via `stateStorage.saveState` on every `set`.
- Entity collections/lists live in `src/renderer/base/state/entities.ts` with typed actions in `base/state/actions/`.
- App data is persisted under `<appData>/freeter-swh/freeter-data` for the installed app and
  `<appData>/freeter-swh-dev/freeter-data` for repo runs (`yarn dev`, `yarn prod:run`); per-widget data under
  `<that folder>/widgets/<widgetId>` (see `dataDirName` in `src/main/index.ts`).

### Widgets

Widgets are the user-visible units placed into workflows.

- Each widget lives in `src/renderer/widgets/<name>/` with (at minimum) `index.ts`, `widget.tsx`, `settings.tsx`,
  `icons/`. Optional: `actionBar.ts`, `actions.ts`, `contextMenu.ts`, `widget.module.scss`.
- `src/renderer/widgets/_template/` is the reference scaffold — copy it when creating a new widget type.
- Registration: add the default export to the list in `src/renderer/widgets/index.ts`. The `registry`
  (`src/renderer/registry/registry.ts`) feeds these types into the store at startup via
  `entityStateActions.widgetTypes.setAll`. Also add the type id to `palette.widgetTypeIds` in `createUiState`
  (`src/renderer/base/state/ui.ts`), or the widget never shows in Add Widget; `tests/renderer/widgets/registry.spec.ts`
  catches a missing id. Full steps: `docs/dev/procedures.md`.
- A `WidgetType` declares `id`, `name`, `icon`, `minSize`, `description`, `createSettingsState`, `settingsEditorComp`,
  `widgetComp`, and `requiresApi` (capabilities the main process must grant, e.g. clipboard/shell/terminal). The runtime
  `WidgetApi` is built per-widget by `getWidgetApiUseCase` based on `requiresApi`.

## Testing conventions

- Jest with `@swc/jest`; tests match `**/*.spec.(ts|tsx)`. Four projects run in parallel (Main=node, Renderer=jsdom,
  Common=node, Test Utils=node) — see `jest.config.js`.
- Renderer tests use `@testing-library/react` + `jest-dom` (setup in `tests/renderer/setupTests.ts`).
- The generic fixture factory `makeFixture` lives in `tests/utils/` (aliased as `@utils/*`); domain fixtures live in
  `tests/<surface>/**/fixtures/` (e.g. `tests/renderer/base/fixtures/widget.ts`). Prefer these over ad-hoc object literals.
- Put specs under `tests/<surface>/`, mirroring the source path (`src/renderer/x/y.ts` → `tests/renderer/x/y.spec.ts`);
  surface-specific helpers go there too. The one spec next to its source is
  `src/renderer/widgets/spreadsheet/formula.spec.ts`.

## Verification

- When fixing a bug, verify the fix is safe across ALL call sites (grep for usages).
- For UI library upgrades (e.g., Ant Design v6), confirm compatibility before claiming done.

## Style notes enforced by ESLint

Single quotes, `max-len: 160`, `eqeqeq`, `curly`, `consistent-return`, `no-var`, `arrow-body-style: as-needed`, unused
args must start with `_`. Run `yarn lint:<surface>:fix` before committing.

## Code Style

- Primary language: TypeScript (use strict typing, avoid `any`).
- Maintain CHANGES.md discipline: append a concise entry for every user-visible change (see "Change log maintenance"
  below).
- Keep scope minimal — implement only what's asked, don't expand features unilaterally.

## Change log maintenance

This fork tracks user-visible changes (features, behavior shifts, UX-affecting refactors) in `docs/CHANGES.md` — it's
the single source of truth for "what differs from upstream". `README.md` carries a **one-liner mirror** of the same list
so visitors see the fork's value at a glance.

**When a feature addition or behavior change completes**, update **both** files before reporting the task done:

### `docs/CHANGES.md` — full entry

Append a new numbered section. Follow the existing style:

- Header: `## N. <짧은 제목> *(YYYY-MM-DD)*` — continue the running number from the last entry. Date is the
  first-introduction date (commit that brought the feature in); follow-up tweaks don't update it.
- Lead with user-visible behavior (what changed, when it kicks in), then architecture, then "까다로웠던 포인트" (non-obvious
  pitfalls worth remembering), then `**수정 파일**` list (신규 / 수정 / 테스트 분리).
- Write in Korean, matching the surrounding narrative tone. Tables are fine where they clarify. Explain *why*, not just
  *what*.
- Skip this only for pure bug fixes, refactors with no behavior change, or trivial cleanups. When in doubt, add an
  entry — it's easier to skim later than to reconstruct.

Small tweaks to an existing entry's feature (e.g. format adjustments, follow-up fixes) can be merged into that section
rather than creating a new one.

### `README.md` — one-liner in "이 포크에서 추가한 기능"

Append a single numbered line that matches the CHANGES.md section number 1:1. Keep it to one sentence that lands the
user-visible value, ending with ` *(YYYY-MM-DD)*` to mirror the CHANGES.md date. If you merged into an existing
CHANGES.md entry (follow-up tweak), also update that entry's line in README.md instead of adding a new one (don't bump
the date). If the change is purely internal (like a refactor that still got a CHANGES.md entry for tracking), mark it "
(내부 리팩토링)" so readers can skim past.
