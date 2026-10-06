import { useEffect, useState } from 'react';
import type { TaskProgress } from '../shared/api';
import './task-progress.css';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function TaskProgressDialog({ progress }: { progress?: TaskProgress }) {
  const [started] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => clearInterval(timer);
  }, [started]);
  const status = progress?.exportStatus;
  const stage = status?.stage;
  const percent = status ? status.stagePercent : progress?.percent;
  const step = stage === 'captions' || stage === 'prepare' ? 0 : stage === 'encode' ? 1 : 2;
  return <div className="task-overlay" role="dialog" aria-modal="true" aria-labelledby="task-heading">
    <div className="task-card">
      <span className="eyebrow">{progress?.kind === 'export' ? 'MP4 내보내기' : '작업 진행'}</span>
      <h2 id="task-heading">{cancelling ? '작업 취소 중…' : progress?.message ?? '작업 준비 중'}</h2>
      {status && <ol className="export-steps" aria-label="내보내기 단계">{['자막·꾸미기', '영상 만들기', '확인·저장'].map((label, i) => <li key={label} className={i === step ? 'current' : i < step ? 'complete' : ''} aria-current={i === step ? 'step' : undefined}>{i < step ? '✓' : i + 1} {label}</li>)}</ol>}
      <progress aria-label={status ? '현재 단계 진행률' : '작업 진행률'} value={percent} max="100" />
      <div><span>{percent === undefined ? '처리 중…' : `${status ? '현재 단계 ' : ''}${Math.floor(percent)}%`}</span><span className="task-elapsed">경과 {clock(elapsed)}</span></div>
      {status?.stage === 'encode' && <p className="task-frames">영상 {(Math.min(status.renderedFrames ?? 0, status.totalFrames ?? 0) / 30).toFixed(1)}초 / {((status.totalFrames ?? 0) / 30).toFixed(1)}초 처리</p>}
      {(stage === 'verify' || stage === 'save') && <p>영상 생성이 끝났습니다. 파일 확인과 저장을 마무리하고 있습니다.</p>}
      <div className="task-actions"><span>완료될 때까지 이 창을 열어 두세요.</span><button disabled={cancelling} onClick={() => { setCancelling(true); void window.editor.cancelTask(); }}>작업 취소</button></div>
    </div>
  </div>;
}
