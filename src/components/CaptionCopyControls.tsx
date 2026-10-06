export function CaptionCopyControls({ disabled, canCopy, canPaste, autoAfter, onAutoAfter, onCopy, onPaste }: {
  disabled: boolean; canCopy: boolean; canPaste: boolean; autoAfter: boolean; onAutoAfter(value: boolean): void; onCopy(): void; onPaste(): void;
}) {
  return <details className="caption-copy-options">
    <summary>자막 복사·붙여넣기 · Ctrl+C / V</summary>
    <div className="caption-object-actions">
      <button disabled={disabled || !canCopy} onClick={onCopy}>복사 <kbd>Ctrl+C</kbd></button>
      <button disabled={disabled || !canPaste} onClick={onPaste}>붙여넣기 <kbd>Ctrl+V</kbd></button>
    </div>
    <label><input type="checkbox" aria-label="복제할 때 뒤쪽 빈 시간에 자동 배치" checked={autoAfter} disabled={disabled} onChange={e => onAutoAfter(e.target.checked)} />뒤쪽 빈 시간에 자동 배치</label>
    <p className="hint">복제 버튼과 Ctrl+V에 함께 적용합니다. 같은 장면 뒤쪽에서 다른 자막과 겹치지 않는 구간을 찾고 길이를 유지합니다. 공간이 없거나 전체 제목이면 기존 시간에 복제합니다.</p>
    <p className="hint">문구 입력 중에는 글자만 복사·붙여넣기 합니다.</p>
  </details>;
}
