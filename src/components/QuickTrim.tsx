import './trim.css';
export function QuickTrim({ disabled, canStart, canEnd, onTrim }: { disabled: boolean; canStart: boolean; canEnd: boolean; onTrim(edge: 'start' | 'end'): void }) {
  return <div className="quick-trim">
    <button disabled={disabled || !canStart} title="재생선이 있는 장면의 앞부분을 잘라냅니다 · Q" onClick={() => onTrim('start')}>앞부분 자르기 <kbd>Q</kbd></button>
    <button disabled={disabled || !canEnd} title="재생선의 현재 프레임까지 남기고 뒷부분을 잘라냅니다 · W" onClick={() => onTrim('end')}>뒷부분 자르기 <kbd>W</kbd></button>
  </div>;
}
