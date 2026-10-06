import type { CaptionSnapResult, CaptionSnapTarget } from '../shared/caption-snap';
import './caption-snap.css';

export function CaptionSnapGuides({ result, targets, width, height, scale, enabled }: {
  result?: CaptionSnapResult; targets: CaptionSnapTarget[]; width: number; height: number; scale: number; enabled: boolean;
}) {
  const cap = 4 / scale;
  return <div className={`caption-guides caption-smart-guides ${width * scale < 180 ? 'compact' : ''} ${Math.min(width, height) * scale < 140 ? 'tiny' : ''}`} aria-hidden="true">
    <svg className="caption-snap-lines" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {targets.filter(t => result?.targetIds.includes(t.id)).map(t => <rect key={t.id} className="caption-snap-target" x={t.left} y={t.top} width={t.width} height={t.height} />)}
      {result?.guides.map((g, i) => <g key={i} data-testid={g.gap === undefined ? 'caption-snap-alignment' : 'caption-snap-gap'}>
        <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
        {g.gap !== undefined && (g.x1 === g.x2
          ? <><line x1={g.x1 - cap} x2={g.x1 + cap} y1={g.y1} y2={g.y1} /><line x1={g.x2 - cap} x2={g.x2 + cap} y1={g.y2} y2={g.y2} /></>
          : <><line x1={g.x1} x2={g.x1} y1={g.y1 - cap} y2={g.y1 + cap} /><line x1={g.x2} x2={g.x2} y1={g.y2 - cap} y2={g.y2 + cap} /></>)}
      </g>)}
    </svg>
    {result?.guides.filter(g => g.gap !== undefined).map((g, i) => <div className={`caption-snap-gap-label ${g.x1 === g.x2 ? 'vertical' : ''}`} key={i}
      style={{ left: `${(g.x1 + g.x2) / 2 / width * 100}%`, top: `${(g.y1 + g.y2) / 2 / height * 100}%` }}>{Math.round(g.gap!)} px</div>)}
    <span>{result?.guides.length ? `${result.equalGap ? '같은 간격' : result.targetIds.length ? '자막 기준 정렬' : '화면 기준 정렬'} · Alt로 해제` : enabled ? 'Alt · 자석 잠시 해제' : '자석 꺼짐'}</span>
  </div>;
}
