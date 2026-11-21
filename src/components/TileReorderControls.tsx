import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { TileArrangeBinding } from '../utils/tileArrange';

export function TileArrangeGrip() {
  return <GripVertical size={13} className="tile-arrange-grip" aria-hidden="true" />;
}

export function TileArrangeArrows({ arrange }: { arrange: TileArrangeBinding }) {
  return (
    <span
      className="tile-arrange-arrows"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="tile-nudge-btn"
        disabled={!arrange.canMoveEarlier}
        onClick={(e) => {
          e.stopPropagation();
          arrange.onMoveEarlier();
        }}
        aria-label={`Move ${arrange.label} earlier`}
        title={`Move ${arrange.label} earlier`}
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        className="tile-nudge-btn"
        disabled={!arrange.canMoveLater}
        onClick={(e) => {
          e.stopPropagation();
          arrange.onMoveLater();
        }}
        aria-label={`Move ${arrange.label} later`}
        title={`Move ${arrange.label} later`}
      >
        <ChevronRight size={14} />
      </button>
    </span>
  );
}
