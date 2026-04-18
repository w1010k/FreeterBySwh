<p align="center"><img src="https://raw.githubusercontent.com/FreeterApp/Freeter/master/resources/linux/freeter-icons/256x256.png" style="margin-right: 16px; width: 128px; height: 128px"/></p>

**Freeter**는 컴퓨터로 일하는 사람을 위한 무료 오픈소스 정리 도구입니다.

업무에 필요한 모든 것을 한 곳에 모아 프로젝트와 워크플로우 단위로 정리할 수 있습니다. `Ctrl` 또는 `Cmd` + `Shift` + `Space` 단축키(이 포크의 기본값, 변경 가능)나 시스템 트레이 아이콘으로 언제든지 빠르게 호출할 수 있고, 워크플로우 간 전환도 매끄럽습니다. 컨텍스트 스위칭 비용을 줄이고 지금 해야 할 일에 집중하세요.

앱이 어떤 물건이고 어떻게 시작하는지 궁금하다면 [**소개 글을 읽어보세요**][post-intro].

> 이 저장소는 원본 [FreeterApp/Freeter][upstream]의 **포크**입니다. 원본 프로젝트의 기능·동작을 유지하면서 개인적인 사용 경험 개선과 신규 기능을 추가한 버전이에요. 변경 내역 전체는 [`docs/CHANGES.md`](docs/CHANGES.md)에서 확인할 수 있고, 이 README 하단에 요약이 있습니다.

---

[**홈페이지**][home] | [**다운로드**][download] | [**커뮤니티**][community] | [**후원**][donate] | [**로드맵**][roadmap] | [**기능 요청**][featurerequests] | [**버그 리포트**][bugreports]

## 지원 운영체제

- Linux; 대부분의 배포판; Intel 64-bit.
- Windows 10 이상; Intel 64-bit.
- macOS 10.15 이상; Intel · Apple Silicon.

## 설치 파일

원본 앱을 바로 설치해서 쓰고 싶다면 [다운로드 페이지][download]의 OS별 최신 인스톨러를 이용하세요. 이 포크 버전은 소스에서 직접 빌드해야 합니다 (아래 참고).

## 소스에서 직접 빌드하기

빌드 전 필요 (실행만 할 때는 불필요):
- [NodeJS](https://nodejs.org/en)
- [Yarn 1 (Classic)](https://classic.yarnpkg.com/lang/en/)

순서:
1. 이 저장소를 클론하거나 소스를 다운로드합니다.
2. 압축을 풀었다면 해당 폴더로 이동.
3. 아래 명령을 순서대로 실행:
    1. `yarn` (의존성 설치)
    2. `yarn run prod` (컴파일)
    3. `yarn run package` (패키징)

완료되면 `./dist` 폴더에 설치 가능한 패키지가 생성됩니다.

## 라이선스

Freeter는 자유 소프트웨어이며, [라이선스][license] 조건에 따라 재배포할 수 있습니다.

---

## 이 포크에서 추가한 기능

원본(`v2.7.1-beta`) 이후 이 포크에서 추가·개선된 항목들. 번호는 [`docs/CHANGES.md`](docs/CHANGES.md)의 섹션 번호와 일치하고, 괄호 안은 기능이 처음 도입된 날짜입니다.

1. 앱 아이덴티티 분리 — `appId` / `productName` / 데이터 폴더를 모두 분리해서 원본 Freeter와 동시 설치·실행 가능. *(2026-04-17)*
2. Electron 36 → 41 업그레이드 (내장 Chromium 136 → 146) + `yarn dev` 크로스플랫폼 수정. *(2026-04-17)*
3. Webpage 위젯 링크·팝업 동작 개선 — 같은 창 이동과 새 창/팝업을 구분해서 처리 (13번에서 재정립). *(2026-04-17)*
4. Webpage 위젯에서 마우스 앞/뒤 버튼(X1/X2) 지원 — 커서 아래 webview를 대상으로 내비게이션. *(2026-04-17)*
5. File 메뉴에 **Open Data Folder** 추가 — 프로젝트/위젯 데이터 폴더를 OS 탐색기로 바로 열기. *(2026-04-18)*
6. **Ctrl+Tab / Ctrl+Shift+Tab** — 브라우저 탭처럼 같은 프로젝트 내 워크플로우 순환 전환. *(2026-04-18)*
7. User Agent 정비 — Google 계정 등 일부 서비스에서 "안전하지 않은 브라우저" 로그인 차단을 피하도록 UA 조정. *(2026-04-18)*
8. Note 위젯 공유 데이터 키 — 여러 워크플로우에서 같은 노트를 공유하는 cross-workflow 동기화. *(2026-04-18)*
9. TodoList 위젯 프로젝트 단위 자동 동기화 — 같은 프로젝트 내 워크플로우들이 할 일 목록을 자동 공유. *(2026-04-18)*
10. `useSharedDataChangedEffect` 훅 추상화 (내부 리팩토링) — 공유 데이터 구독 패턴 통일. *(2026-04-18)*
11. Webpage 위젯 동적 타이틀 — 현재 페이지 제목·URL을 위젯 헤더에 자동 반영. *(2026-04-18)*
12. Webpage 위젯 헤더 텍스트 선택·복사 허용 — 동적 타이틀(페이지 제목·URL)을 드래그로 블록 선택. 다른 위젯은 원본 동작 유지. *(2026-04-18)*
13. Webpage 위젯 링크 처리 재정립 — 새 탭 클릭은 기본 브라우저로, 팝업(OAuth 등)은 내부 창 유지. *(2026-04-18)*
14. Top Bar 높이 60 → 48px 축소로 워크스페이스 세로 공간 확보. *(2026-04-18)*
15. 워크플로우 탭·셸프 아이템 가로 폭 축소 (`min-width` 조정). *(2026-04-18)*
16. 새 위젯 기본 이름 공란 처리 — 자동 `Type 1`, `Type 2` 대신 바로 비워두고 헤더엔 위젯 타입 이름이 자연스럽게 노출. *(2026-04-18)*
17. 위젯 최소 크기 세로 1칸 허용 — Note(1×1), Webpage/TodoList(2×1), Timer(1×1) 등 납작한 배치 가능. *(2026-04-18)*
18. TodoList 항목 줄바꿈 — 긴 내용이 `…`로 잘리지 않고 여러 줄로 펼쳐져 전체 노출. *(2026-04-18)*
19. Shelf 위젯 호버 팝업 세로 절반 축소 — 300×300 → 300×150. *(2026-04-18)*
20. 기본 글로벌 단축키 `Ctrl/Cmd+Shift+Space`로 변경 — 원본 Freeter(`Ctrl/Cmd+Shift+F`)와 동시 실행 시 충돌 방지. *(2026-04-18)*
21. Link/File Opener 위젯 자동 아이콘 — URL의 favicon, 파일·폴더의 OS 네이티브 아이콘을 버튼에 자동 표시해서 여러 개 놔도 한눈에 구분. 실패 시 기존 기본 SVG로 자연 폴백. *(2026-04-18)*
22. Link/File Opener 위젯 동적 타이틀 — 첫 URL의 호스트(`github.com`) 또는 첫 경로의 파일명(`report.pdf`)을 헤더에 자동 반영. 여러 개면 `(+N)` 표시, 사용자가 이름을 지정했으면 그쪽이 우선. *(2026-04-18)*
23. Webpage 위젯 액션바에 **Copy URL** 버튼 추가 — 타이틀바 오른쪽 아이콘 줄에서 한 번 클릭으로 현재 페이지 주소 복사. *(2026-04-18)*
24. Webpage 위젯 확대/축소 — `CmdOrCtrl+Shift+=` / `CmdOrCtrl+-` / `CmdOrCtrl+0`, `CmdOrCtrl+마우스 휠`로 단계적 zoom + 액션바 **돋보기 +/− 버튼**. 기존 컨텍스트 메뉴 프리셋과 동일한 사다리 사용. *(2026-04-18)*

부가적으로 OS 노출 라벨(트레이 툴팁, 윈도우 타이틀, 앱 메뉴, About 모달 등)도 **Freeter-SWH**로 일괄 교체해서 원본과 혼동되지 않게 했습니다.

[home]: https://freeter.io/
[download]: https://freeter.io/download
[community]: https://community.freeter.io/
[donate]: https://freeter.io/sponsor
[roadmap]: https://community.freeter.io/topic/2/planned-features
[featurerequests]: https://community.freeter.io/category/6/feature-requests
[bugreports]: https://community.freeter.io/category/7/bug-reports
[post-intro]: https://freeter.io/blog/boost-your-productivity-while-managing-multiple-projects/
[license]: https://github.com/FreeterApp/Freeter/blob/master/COPYING
[upstream]: https://github.com/FreeterApp/Freeter
