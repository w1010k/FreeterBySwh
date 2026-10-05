## 작업 절차

반복 작업의 단계별 절차. 명령어 목록과 변경 기록 규칙은 `CLAUDE.md`에 있으므로 여기서는 링크만 둔다.

### 개발 실행과 검증

#### 개발 실행 데이터

- 저장소에서 실행한 앱 (`yarn dev`, `yarn prod:run`)은 설치본과 다른 데이터 폴더, 세션, 단일 인스턴스 잠금을 쓴다. `src/main/index.ts`의 `dataDirName`이
  `app.isPackaged`에 따라 `freeter-swh` (설치본) 또는 `freeter-swh-dev` (저장소 실행)를 고른다.
- 저장소 실행 중에 데이터를 지우거나 망가뜨려도 설치본 데이터에는 영향이 없다. 설치본과 저장소 실행을 동시에 띄울 수 있다.
- 데이터 경로 전체는 [overview.md](overview.md)의 저장 섹션을 따른다.

#### 커밋 전 검증 순서

CI (`.github/workflows/ci.yml`)와 같은 순서로 실행한다. 4단계 모두 CI에서 실패 조건이다.

1. `yarn test`
2. `yarn prod` (production 빌드)
3. `yarn lint`
4. `yarn test:typecheck`

부분 확인은 `yarn test <경로>`, `yarn lint:<surface>`, `yarn test:typecheck:<surface>`를 쓴다.

### 새 위젯 추가

`src/renderer/widgets/_template/`이 기준 골격이다 (`index.ts`, `settings.tsx`, `widget.tsx`, `icons/`).

1. `src/renderer/widgets/_template/`을 `src/renderer/widgets/<id>/`로 복사한다.
2. `<id>/index.ts`의 `WidgetType` 필드를 채운다: `id`, `name`, `icon`, `minSize`, `description`, `requiresApi`, 필요하면
   `requiresState`.
3. `src/renderer/widgets/index.ts`에 import를 추가하고 `widgetTypes` 배열에 넣는다.
4. `src/renderer/base/state/ui.ts`의 `createUiState` 안 `palette.widgetTypeIds` 목록에 `id`를 넣는다.
5. 위젯 SCSS를 쓴다. `var(--freeter-*)`는 테마 객체에 있는 키만 쓴다.
6. `tests/renderer/widgets/<id>/`에 테스트를 만든다. 파일 구성은 `fixtures.ts`, `settings.spec.ts`, `widget.spec.ts` 또는
   `widget.spec.tsx`다. 골격은 `tests/renderer/widgets/_template/`이다. 렌더 도우미 `setupWidgetSut`, `setupSettingsSut`과 위젯 API
   mock은 `tests/renderer/widgets/setupSut.tsx`에 있다.
7. `docs/CHANGES.md`와 `README.md`에 항목을 추가한다 (`CLAUDE.md`의 Change log maintenance 규칙).
8. [features-widgets.md](features-widgets.md)의 위젯 요약표와 위젯별 상세에 항목을 추가한다.

#### 단계별 주의점

| 단계 | 주의점                                                                                                                                                                                                        | 근거                                                                                                                       |
|------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| 2    | `minSize`는 최소 크기이면서 새로 추가할 때의 기본 크기다. 격자는 32×16 칸 (`widgetLayoutVisibleCols`, `widgetLayoutVisibleRows`)이라 1×1은 1280×800 창에서 수십 px밖에 안 된다. 실제 창에서 넣어 보고 정한다. | `src/renderer/application/useCases/workflow/addWidgetToWorkflow.ts`, `src/renderer/base/widgetLayout.ts`, CHANGES #34 후속 |
| 2    | `requiresApi`에 없는 기능은 위젯 API에 들어오지 않는다. 새 main 기능이 필요하면 IPC 경로를 먼저 만든다.                                                                                                       | [overview.md](overview.md)의 IPC 섹션, [features-widgets.md](features-widgets.md)                                          |
| 4    | 이 목록을 빠뜨리면 위젯이 등록되어도 Add Widget 팔레트에 나타나지 않는다. `tests/renderer/widgets/registry.spec.ts`가 누락을 잡는다.                                                                          | `tests/renderer/widgets/registry.spec.ts`                                                                                  |
| 4    | `palette`는 영구 상태에서 제외되므로 (`createPersistentAppState`), 기존 사용자에게도 기본 목록이 그대로 적용된다. 마이그레이션은 필요 없다.                                                                   | `src/renderer/base/state/app.ts`                                                                                           |
| 5    | 테마에 없는 변수가 들어간 선언은 오류 없이 통째로 무효가 된다. 테마 키는 `src/renderer/ui/components/app/uiTheme/themes/light.ts`와 `dark.ts`에 있다. 폴백 형태 `var(--a, var(--b))`는 안전하다.              | [pitfalls.md](pitfalls.md)의 "정의되지 않은 테마 변수", CHANGES #82                                                        |
| 7    | `docs/GUIDE.md` (사용자 가이드)의 위젯 카탈로그는 갱신 규칙이 없다. 위젯을 추가하면 카탈로그 표와 머리말의 위젯 수를 함께 확인한다 (Spreadsheet는 2026-10-05에 뒤늦게 추가했다).                                                                                             | `docs/GUIDE.md`                                                                                                            |

### 릴리스

버전 형식은 `<upstream 기준 버전>-swh.N`이다 (예: `2.8.0-swh.17`). 포크 릴리스마다 N을 1 올린다.

1. `package.json`의 `version`을 올린다.
2. 버전 변경만 담은 커밋을 만든다. 메시지는 `Release <version>`이다 (예: 커밋 96b45b2는 `package.json` 한 파일만 바꾼다).
3. 태그 `v<version>`을 만든다. CD는 `v*.*.*` 형식 태그 push에만 반응한다.
4. `git push origin master`와 `git push origin v<version>`을 실행한다.
5. CD (`.github/workflows/cd.yml`)가 끝날 때까지 기다린다. `gh run watch <run-id> -R w1010k/FreeterBySwh --exit-status`로 볼 수 있다.
6. 초안 릴리스의 자산 수를 확인한다. 정상은 릴리스 1개에 자산 3개다.
7. 릴리스 노트를 쓴다. 범위는 `git log --oneline v<이전>..v<version>`과 `docs/CHANGES.md`다. 한국어로 주제별로 묶고, 끝에
   `**Full Changelog**: https://github.com/w1010k/FreeterBySwh/compare/v<이전>...v<version>`을 단다.
8. 노트를 적용한다: `gh release edit v<version> -R w1010k/FreeterBySwh --notes-file <파일>`.
9. 공개한다: `gh release edit v<version> -R w1010k/FreeterBySwh --draft=false --latest`.

#### CD 구성

- 작업 2개 (linux, windows)가 `needs:`로 직렬 실행된다. macOS는 빌드하지 않는다 (decisions.md D59). 각 작업은 `yarn install`, `yarn run prod`, `yarn run cd:package-draft`
  (`electron-builder --publish always`)를 실행한다.
- 직렬화 이유는 `cd.yml` 주석에 있다. 병렬 실행하면 두 작업이 각자 초안을 만들어 같은 태그의 초안이 여러 개 생기고 자산이 나뉜다 (swh.10에서 발생). 대가는 약 2배의 실행 시간이다.
- CI와 CD 모두 `git+ssh` 의존성 URL을 HTTPS로 바꾸는 `git config url.insteadOf` 설정을 둔다.

#### 릴리스 주의점

| 주의점                                                                                                                                                                                                                                       | 근거                                                        |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| 이 저장소는 `gh` 기본 저장소가 설정되어 있지 않다 (`gh repo set-default --view`). fork 저장소에서 `gh`가 upstream `FreeterApp/Freeter`를 대상으로 잡은 기록이 있으므로 모든 `gh release`, `gh run` 명령에 `-R w1010k/FreeterBySwh`를 붙인다. | 로컬 기록                                                   |
| 초안 릴리스는 본문이 빈 채로 만들어진다. `electron-builder.config.js`에 `releaseInfo`가 없다. 7단계 없이 공개하면 빈 노트로 나간다 (swh.3, swh.4, swh.5, swh.8에서 발생).                                                                    | `electron-builder.config.js`, 로컬 기록                     |
| 자산 3개: linux `tar.xz` 1개, win `msi`와 `zip` 2개. macOS를 빌드하던 이전 설정 (swh.17 태그 시점)에서는 mac `dmg` 2개, blockmap 2개, `latest-mac.yml`이 더해져 8개였다.                                                                                                              | `electron-builder.config.js`의 `win`, `linux` target        |
| `latest.yml` (Windows 자동 업데이트 메타)은 생성되지 않는 것이 정상이다. Windows target이 `msi`와 `zip`뿐이다.                                                                                                                               | `electron-builder.config.js`의 `win.target`                 |
| `package.json`의 `draft-release` 스크립트 (`yarn version && git push && git push --tags`)는 upstream 2.8에서 온 것이다. 포크 릴리스 커밋은 `Release <version>` 형식이라 이 스크립트를 쓰지 않는 것으로 보인다 (추정).                        | `package.json`, 커밋 83c5829                                |
| 초안 릴리스를 지워도 git 태그는 남는다. 태그는 `git push origin :refs/tags/<tag>`와 `git tag -d <tag>`로 따로 지운다.                                                                                                                        | 로컬 기록                                                   |
| `gh release view --json`에는 `isLatest` 필드가 없다. 초안과 공개 여부는 `isDraft`, `isPrerelease`로 본다. | 로컬 기록 |

#### 같은 태그의 초안 중복 복구

swh.10에서 발생했다 (`cd.yml` 주석). CD를 다시 병렬화하면 재발할 수 있다. 아래 절차는 swh.10 복구의 로컬 기록이다.

1. 확인:
   `gh api repos/w1010k/FreeterBySwh/releases --jq '.[] | select(.tag_name=="v<ver>") | "id=\(.id) draft=\(.draft) assets=\(.assets|length)"'`.
   id가 2개면 자산이 나뉜 상태다.
2. 작은 쪽 초안의 자산을 asset API
   (`gh api -H "Accept: application/octet-stream" repos/w1010k/FreeterBySwh/releases/assets/<asset_id>`)로 내려받는다.
3. 남길 초안에 릴리스 ID 기준으로 업로드한다 (`https://uploads.github.com/repos/w1010k/FreeterBySwh/releases/<id>/assets?name=<file>`).
   `gh release upload <tag>`는 초안이 2개일 때 대상이 모호해서 쓰지 않는다.
4. 중복 초안을 먼저 삭제한다. 삭제는 사용자 승인을 받고 실행한다.
5. 남긴 초안의 본문을 쓰고 공개한다. 4단계보다 먼저 공개하면 GitHub가 공개 릴리스를 `untagged-<hash>` 태그로 옮긴다. 이때는 `PATCH {tag_name: "v<ver>"}`로 태그를 다시
   붙인다.

본문 JSON은 node로 만든다. Git Bash 환경에는 `jq`가 없어서, 실패한 `jq` 파이프가 빈 본문으로 PATCH한 적이 있다 (로컬 기록).

### upstream 병합

upstream (`FreeterApp/Freeter`)의 새 릴리스를 받는 절차. 2.8 병합 (커밋 0ebf9ac, 브랜치 `merge/upstream-2.8`)이 기준 사례다.

1. upstream remote를 확인한다. 현재 저장소에는 `origin`만 있다. 없으면 `git remote add
   upstream https://github.com/FreeterApp/Freeter.git`을 실행한다.
2. `git fetch upstream --tags`를 실행한다.
3. `merge/upstream-<버전>` 브랜치를 만든다.
4. upstream 태그를 병합한다.
5. 충돌을 아래 표의 규칙대로 해소한다.
6. `yarn install`로 `yarn.lock`을 다시 만든다.
7. 커밋 전 검증 4단계를 모두 실행한다.
8. 버전을 `<새 upstream 버전>-swh.1`로 정한다.
9. `docs/CHANGES.md` 머리말의 기준 시점을 갱신한다.
10. [overview.md](overview.md)의 포크 이력과 기술 스택 표를 갱신한다.

#### 충돌 해소 규칙 (2.8 병합 기준)

| 대상                                          | 규칙                                                                                                        |
|-----------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `package.json` 의존성                         | upstream의 버전 변경을 받는다.                                                                              |
| `package.json` scripts, `.github/workflows/*` | 포크 (Yarn) 쪽을 유지한다 (`git checkout --ours`).                                                          |
| `package-lock.json`                           | 삭제한다 (`git rm package-lock.json`). 포크는 Yarn 1을 유지한다.                                            |
| note, to-do-list 위젯과 spec                  | 포크 기능 (공유 라이브 동기화, in-memory store)을 유지한다.                                                 |
| upstream이 바꾼 전역 관례                     | 포크 파일도 맞춘다. 2.8에서는 scss를 기본 import (`import styles from`)로 통일했다.                         |
| jest 30                                       | 제거된 `toBeCalled*` 별칭을 `toHaveBeenCalled*`로 바꾼다.                                                   |
| react-hooks 7 신규 규칙                       | `set-state-in-effect`, `refs`를 `src/renderer/eslint.config.mjs`에서 `warn`으로 낮췄다. 후속 정리 대상이다. |

근거: 커밋 0ebf9ac 메시지, `src/renderer/eslint.config.mjs`.
