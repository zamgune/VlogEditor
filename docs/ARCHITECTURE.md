# 구조와 공통 규칙

## 코드 경계

- `src/shared/project.ts`: 버전 6 프로젝트 스키마(버전 1–5 마이그레이션), 프레임 연산, 분할/트림/리플/순서/히스토리. UI와 main이 함께 검증.
- `src/shared/narration.ts`: 녹음 메타데이터/구간, 겹친 음성 트랙 배치, 프레임과 오디오 샘플 매핑.
- `src/components/NarrationPanel.tsx`: 마이크 선택·레벨 표시, MediaRecorder 녹음과 저장 재시도, 음성 편집. `NarrationPlayback.tsx`: 타임라인 위치를 따르는 음성 재생.
- `electron/narration.ts`: 녹음 WebM을 영구 WAV로 정규화, 제한된 자산 등록과 SHA256 검증.
- `src/shared/canvas.ts`: 허용 비율/해상도, fit/fill/배경, 크롭/배치 사각형 계산, Chromium CSS와 FFmpeg 필터 공통 매핑.
- `src/shared/color.ts`: 밝기/대비/채도/따뜻함과 공통 RGB 행렬, SVG 및 FFmpeg 필터 생성.
- `src/components/Timeline.tsx`: pointer capture, 프레임 변환, rAF 드래그, 가장자리 자동 스크롤, 휠/가운데 버튼 이동, 확대 중심 유지. 본문/⠿ 드래그는 클립 순서 변경, 양끝은 트리밍, 눈금/재생선은 탐색.
- `src/shared/timeline.ts`: 화면 좌표와 프레임 변환, 원본 범위에 맞춘 트림, 각 클립 중간점을 기준으로 한 이동 삽입 위치 계산.
- `src/App.tsx`: 편집 화면과 브라우저 재생. renderer는 Node/일반 파일 시스템/셸 API를 받지 않음.
- `electron/preload.ts`: 기능별 메서드만 노출. 임의 IPC 채널이나 명령 실행은 노출하지 않음.
- `electron/main.ts`: 파일 선택, 프로젝트 저장, 복구, 작업 직렬화, 승인된 미디어 URL, sender 검증.
- `electron/media.ts`: ffprobe 검사, 정규화, 정확한 컷 렌더, 정지 이미지 추출, 출력 검증.
- `electron/process.ts`: shell:false + 인자 배열, stderr 수집, 제한된 stdout, 실행한 프로세스만 취소.
- `electron/storage.ts`: JSON 스키마 검증, 임시 파일 + fsync + rename, 직전 파일 `.bak`.

FFmpeg/ffprobe는 별도 프로세스입니다. 메인 화면에서 디코딩/인코딩 연산을 수행하지 않습니다.
긴 가져오기/출력은 동시에 하나만 실행하고 AbortController로 해당 자식 프로세스를 종료합니다.
OS 전체 FFmpeg 프로세스 이름을 검색하거나 일괄 종료하지 않습니다.

## 프레임과 소스 시간

프로젝트는 6개 비율 중 선택하며 새 작업은 1080×1920(9:16)입니다. 30fps, SDR은 고정합니다. 기존 1920×1080 프로젝트는 해당 비율을 유지합니다. 클립 구간은 **[inFrame, outFrame)** 정수 프레임입니다.
클립 길이 = outFrame − inFrame. 타임라인 시작 = 앞선 클립 길이의 합.
타임라인 f가 해당 클립에 속하면 sourceFrame = inFrame + f − timelineStart.
30fps 편집용 사본의 시간(초) = sourceFrame / 30. 오디오 48kHz에서는 프로젝트 프레임당 정확히 1600 샘플입니다.
영상은 trim start_frame/end_frame, 오디오는 atrim start_sample/end_sample을 동일 구간으로 자릅니다.

원본 time_base, start_time, 평균 fps, 회전, 해상도는 원본 메타데이터로 별도 보관합니다.
원본 프레임 번호를 프로젝트 프레임 번호로 간주하지 않습니다.
가져올 때 FFmpeg 기본 회전 보정, 영상 PTS 시작 정렬, fps=30, SAR 보정, 긴 변 1920px로 정규화합니다. 편집용 사본에 여백을 굽지 않으며 실제 displayWidth/displayHeight를 미디어에 기록합니다.
예상 원본 시각은 정규화 프레임/30 + 원본 시작 PTS이며, 실제 VFR 프레임 선택은 FFmpeg fps 필터가 원본 PTS에 따라 결정합니다.
회전/VFR 실촬영본의 시간/좌표 매핑 검증은 아직 완료되지 않았습니다. 얼굴 좌표 계층은 4단계 전에 추가하고 자동 테스트합니다.

현재 편집용 사본은 원본 비율/긴 변 1920px의 H.264 CRF18/AAC 192k, 최종 출력은 CRF20/AAC 192k입니다. 캐시 키 v3는 이전 16:9 여백 사본과 분리합니다.
출력에서 동일 사본을 재사용하여 디코더별 회전/프레임 선택 차이를 줄이지만 두 번 인코딩되는 품질 비용이 있습니다.
추후 원본 렌더/저해상도 프록시를 분리할 때 이 시간/좌표 매핑 계약을 유지합니다.

## 미리보기와 출력

재생: HTMLVideoElement에 편집용 사본을 제공합니다. 단조 증가 시계(performance.now)와 requestAnimationFrame으로 프로젝트 위치를 갱신하며 영상/별도 음성을 이 위치로 맞춥니다. 녹음도 같은 시작 시계를 사용하므로 클립 전환 지연이 누적되지 않습니다. 디코딩 지연이 있으면 화면이 현재 위치를 따라잡습니다.
하드 컷을 재생할 때 미디어 전환/시크 지연이 생길 수 있습니다. 이 경로를 프레임 정확한 재생이라고 표시하지 않습니다.
정지/한 프레임 이동: FFmpeg가 sourceFrame/30 시점의 프레임을 추출합니다. 느린 응답은 오래된 선택에 덮어쓰지 않도록 폐기합니다.
연속 드래그 중에는 브라우저 시크로 빠르게 표시하고 놓으면 정지 프레임을 추출합니다. 새 정지 요청이 들어오면 이전 FFmpeg 정지 요청을 취소하므로 프로세스가 누적되지 않습니다.
정지 미리보기는 선택한 출력 해상도의 절반(9:16은 540×960)으로 만듭니다. 테스트는 같은 크기로 줄인 출력 프레임과 픽셀을 비교합니다.
영상 보정 후 공통 사각형으로 crop/scale/pad합니다. contain은 전체 원본을 유지하고 cover는 목표 비율의 원본 사각형을 먼저 자릅니다. 크롭 위치는 남는 범위의 0–100%이며 YUV420용 짝수 픽셀로 맞춥니다. 여백은 보정과 분리한 단색 배경입니다.
클립별 inherit/contain/cover 및 x/y를 저장합니다. 프로젝트 fit 변경은 inherit 클립에 적용하고, 비율/여백 색은 프로젝트 전체에 적용합니다.
출력: 정규화 사본의 각 영상/오디오 구간을 필터에서 연결하고 CPU 인코딩합니다. 출력 codec/해상도/프레임 수를 검증한 뒤에만 완성 파일로 복사합니다.
실패/취소 임시 파일은 제거하며 기존 파일에는 COPYFILE_EXCL로 덮어쓰기를 금지합니다.

## 사용자 작업과 캐시

Electron userData(`%APPDATA%/VlogTool` 기본값):

- `work/recovery.vlog.json`와 `.bak`: 사용자 작업. 캐시 정리 대상이 아님.
- `recordings/`: 사용자 녹음 원본 WAV. 캐시 정리 대상이 아니며 삭제/Undo 시 파일을 자동 제거하지 않음.
- `cache/normalized/`: 재생성 가능한 정규화 사본. 현재 자동 정리 기능 없음.
- `logs/last-error.log`: 최근 처리 오류. 경로가 포함될 수 있으며 로컬에만 저장.

사용자가 고른 `.vlog.json`은 별도 저장합니다. 저장은 순서대로 처리하고 파일 교체 전에 임시 파일을 동기화합니다.
원본 fingerprint는 정규 경로/크기/mtime의 SHA256입니다. 내용 전체 해시는 아니므로 엄밀한 변조 검증을 의미하지 않습니다.
검증 스크립트에서는 내용 전체 SHA256으로 원본 불변을 확인합니다.
원본 누락/변경 상태는 알리고 내보내기를 제한합니다. 녹음은 프로젝트 명시 저장 시 옆 `.vlog.json.assets` 폴더에 복사하고 상대 경로로 기록합니다. 열 때 프로젝트 폴더 기준 절대 경로로 해석하고 SHA256을 확인합니다. 파일 재연결 UI는 아직 미구현입니다.

## 로컬 접근 경계

contextIsolation=true, nodeIntegration=false, sandbox=true, webSecurity=true.
로컬 `vlog://editor` 앱 리소스와 이미 가져온 미디어 ID만 요청할 수 있습니다. CSP로 원격 스크립트/콘텐츠를 차단합니다.
IPC는 현재 창의 mainFrame와 정확한 앱 URL을 확인하고 JSON/ID/범위를 검증합니다.
새 창/이동/webview, HTTP/HTTPS/WS/WSS 네트워크 요청을 차단합니다. 사용자가 마이크 확인/녹음을 시작한 동안 편집창 mainFrame의 오디오 권한만 허용합니다. 요청/검사 핸들러 모두를 적용하며 카메라와 다른 창의 장치 권한은 거부합니다.
등록된 녹음 ID는 `vlog://editor/narration/<id>`로 제공하며 임의 파일 경로를 URL로 노출하지 않습니다. 녹음 IPC는 최대 64MiB와 30분 길이를 검증하고 별도 UUID 파일을 사용합니다. 원본 WebM과 미완성 WAV는 성공/실패 후 정리합니다.
테스트 전용 `VLOGTOOL_TEST_DATA` 환경 변수는 테스트의 userData를 개발 작업과 분리합니다. UI로 설정할 수 없습니다.

## 자막 / 0.7

자막 스키마와 프레임 연산은 `src/shared/captions.ts`, 공통 Canvas 렌더러는 `caption-renderer.ts`, 숨김 렌더 창과 출력용 단일 PNG 시퀀스는 `electron/captions.ts`에서 관리합니다. 동일 글자 PNG와 프레임별 움직임 계산을 실제 미리보기와 FFmpeg 출력에 사용합니다. 명시적인 zOrder로 합성하고, 시간 겹침은 허용합니다. 영상 보정·맞춤 후 합성하므로 자막 색은 영상 색 보정의 영향을 받지 않습니다.

일반/강조는 클립과 원본 프레임 구간에 연결됩니다. 전체 제목은 clipId=null과 0/0 구간 표식으로 저장하고 현재 타임라인 전체에 표시합니다. 종류별 공통 스타일과 변경한 필드만의 overrides를 분리합니다. UI 배치는 로컬 설정이며 프로젝트 Undo에 포함하지 않습니다.

렌더 창은 앱과 같은 로컬 프로토콜·글꼴을 이용하지만 일반 편집 IPC를 호출할 권한은 없습니다. Bitmap/scene 요청은 메인에서 검증한 객체를 전달합니다. 자막 텍스트는 Canvas의 텍스트로만 처리합니다. 텍스트·스타일별 PNG 캐시는 64개로 제한하고, 위치와 움직임 변경은 글자 이미지 재생성 없이 합성 좌표/투명도/크기만 바꿉니다. 정적 구간은 합성 이미지를 재사용하고 움직이는 구간만 프레임별 출력합니다. 합성 장면 조회 캐시는 256개입니다. 출력용 자료는 작업별 UUID 하위 폴더에서 생성·정리합니다.

자세한 계약과 검증은 [UPDATE-0.7.md](UPDATE-0.7.md)를 참조합니다.
