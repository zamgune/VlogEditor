# 버전, 출처, 라이선스

확인일: 2026-09-27. npm registry 메타데이터, 각 배포 패키지 및 공식 문서를 확인했습니다.
직접 의존성은 정확한 버전, 전이 의존성은 `package-lock.json`으로 고정합니다. `npm ci` 사용.

| 구성 | 고정 버전 | 출처 / 라이선스 |
|---|---|---|
| Electron | 44.4.5 | https://releases.electronjs.org/release/v44.4.5 / MIT 및 동봉 Chromium notices |
| React / react-dom | 19.3.0 | https://react.dev / MIT |
| TypeScript | 7.0.2 | https://www.typescriptlang.org / Apache-2.0 |
| Vite | 8.3.1 | https://vite.dev / MIT |
| esbuild | 0.28.2 | https://esbuild.github.io / MIT |
| tsx | 4.23.15 | https://github.com/privatenumber/tsx / MIT |
| Zod | 4.6.5 | https://zod.dev / MIT |
| Playwright test | 1.63.0 | https://playwright.dev / Apache-2.0 |
| @types/node | 24.19.0 | DefinitelyTyped / MIT |
| @types/react, @types/react-dom | 19.3.0 | DefinitelyTyped / MIT |

개발 환경: Node.js 24.13.0, npm 11.6.2. Vite 8.3.1 engines는 `^20.19.0 || >=22.12.0`, Electron 패키지 engines는 `>=22.12.0`로 확인했습니다.
현재 Node 24.13.0에서 설치/타입 검사/번들/테스트가 통과했습니다. Electron 바이너리의 process.versions를 조회해 Electron 44.4.5 / Chromium 152.0.7977.130 / 내장 Node 24.21.0을 확인했습니다.
지원 목표는 Windows 10/11 x64이고 실제 실행 검증은 **Windows 11 Home 10.0.26200 x64** 한 대에서 수행했습니다. Windows 10은 미검증입니다.
Vite 요구사항: https://vite.dev/guide/ . Electron 보안 구성 근거: https://www.electronjs.org/docs/latest/tutorial/security .

## 네이티브 FFmpeg

- 빌드: **FFmpeg 9.0.2 essentials x64 static**, Gyan Doshi 배포.
- 출처: https://www.gyan.dev/ffmpeg/builds/
- 고정 다운로드: https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip
- 첫 실행 다운로드에는 같은 배포자가 운영하는 공식 GitHub 미러를 사용합니다: https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip (아래 SHA256으로 동일 파일 확인).
- ZIP SHA256: `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`
- ffmpeg.exe SHA256: `3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec`
- ffprobe.exe SHA256: `f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52`
- 배포 README에 명시된 소스: https://github.com/FFmpeg/FFmpeg/commit/946fcce07b
- 이 빌드의 표기 라이선스: **GPL v3** (`--enable-gpl --enable-version3`, libx264 포함).
- 원문 LICENSE/README/doc은 `vendor/ffmpeg/ffmpeg-9.0.2-essentials_build/`에 보존합니다.
- 배포 사이트는 Windows 10 이상을 요구한다고 안내합니다. 프로그램은 실제 검증한 Windows 11 버전만 검증 완료로 기록합니다.

공개 릴리스 0.3.0의 Windows ZIP에는 위 네이티브 FFmpeg 실행 파일을 포함하지 않습니다. 첫 실행 시 `setup-ffmpeg.ps1`이 배포자의 고정 URL에서 원본 ZIP을 직접 다운로드하고 SHA256을 확인한 뒤 LICENSE/README/doc과 함께 압축 해제합니다. Electron 런타임에 포함된 `ffmpeg.dll`은 Electron/Chromium의 동봉 고지를 따릅니다. 배포 ZIP에는 Electron의 LICENSE와 LICENSES.chromium.html, React/react-dom/scheduler/Zod의 라이선스, 아래 글꼴의 OFL을 함께 보관합니다.

## 얼굴 모델과 글꼴

얼굴 검출 모델은 아직 선택/다운로드/포함하지 않았습니다. 4단계 이전 MediaPipe 등 후보의 Windows 로컬 추론, 검출 품질, 모델별 라이선스와 재배포 조건을 확인하고 정확한 모델/파일 해시를 고정합니다. 현재 자동 검출이나 익명화 기능을 제공하지 않습니다.

UI는 Windows에 설치된 **맑은 고딕(Malgun Gothic) / Segoe UI**를 참조합니다. 글꼴 파일을 복사하거나 재배포하지 않습니다.
출처는 Microsoft Windows 시스템 글꼴이며 Windows 글꼴 사용 조건이 적용됩니다.
0.6 자막 출력에는 아래 가변 글꼴을 수정 없이 포함합니다. 2026-09-27 Google Fonts 공식 저장소에서 내려받아 파일 해시로 고정했습니다. 둘 다 SIL Open Font License 1.1이며, 원문 고지 및 라이선스를 `public/fonts/`에 동봉합니다.

| 파일 | 공식 출처 | SHA256 |
|---|---|---|
| NotoSansKR.ttf | https://github.com/google/fonts/tree/main/ofl/notosanskr | 194018E6B2B293A7964F037B25C0249CE1418BC9AB3C971060A03AA57861E252 |
| NotoSerifKR.ttf | https://github.com/google/fonts/tree/main/ofl/notoserifkr | 11F8D5DE6F1B79195EFBA3828AAA2EC95C1178F5AE976FB23C8D53250A9938F3 |

앱 번들 시 `NotoSansKR-OFL.txt`와 `NotoSerifKR-OFL.txt`를 폰트와 함께 보존합니다. 공유마당의 모든 글꼴이 동일 조건인 것은 아니므로, 다른 글꼴은 앱 포함·재배포 조건을 확인한 뒤 추가합니다.

## 마루 부리 (2026-10-05 추가)

사용자가 제공한 `MaruBuriTTF.zip`의 TTF 다섯 개를 수정 없이 포함합니다. 파일 메타데이터: Version 1.000, © NAVER Corp. © NAVER Cultural Foundation Corp.
[네이버 공식 라이선스 안내](https://help.naver.com/service/30016/contents/18088?osType=PC)에서 마루 부리의 SIL Open Font License 1.1 적용을 확인했습니다. 저작권 고지와 라이선스 전문은 `public/fonts/MaruBuri-OFL.txt`에 보존하며 빌드에도 함께 복사됩니다.

| 파일 | 앱 굵기 | SHA256 |
|---|---|---|
| MaruBuri-ExtraLight.ttf | 200 | E9562E5AD3EFB724E003BD29EF5FF363AF1A61C89612E3986DC39BF26978A2EB |
| MaruBuri-Light.ttf | 300 | D13423F5F1441DBA9B063AF14C073A46E435651FBD81299D9CCCC5A4CF3E0C07 |
| MaruBuri-Regular.ttf | 400 | 803429881927C79DBB49497274244E72B672C56E0503F28262503F77524CBA7A |
| MaruBuri-SemiBold.ttf | 600 | 2D86F0B4950955FB69F069C415D01A51BBBBCF03682D59A6ADAB7F5B05D16FE5 |
| MaruBuri-Bold.ttf | 700 | 13AA1058C135E8F0B2C41DE4E5E7866B18F970A15DB2B1A290227E52DC02ABA8 |

## 나눔손글씨 펜

사용자가 제공한 `nanum-pen/NanumPen.ttf`를 수정 없이 포함합니다. 파일 메타데이터: Nanum Pen Script / 나눔손글씨 펜, Regular, Copyright © 2010 NHN Corporation. Font designed by Sandoll Communications Inc.

[네이버 공식 라이선스 안내](https://help.naver.com/service/30016/contents/18088?osType=PC)에서 NanumPen의 SIL Open Font License 1.1 및 소프트웨어 번들 배포 조건을 확인했습니다(2026-10-05). 저작권 고지와 라이선스 전문은 `public/fonts/NanumPen-OFL.txt`에 동봉합니다.

SHA-256: `0E1E2CC07FD5C5D181936ECAF97363263A8D4AE6B6151039EA83CB9002B63152`

ExtraLight의 파일 내부 weight 값은 Light와 같은 300이지만 별도 서체를 선택할 수 있도록 CSS에서 200으로 연결합니다. 파일 자체는 변경하지 않았습니다.
