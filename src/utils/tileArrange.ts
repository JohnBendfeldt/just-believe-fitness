import type { DragEvent } from 'react';

export interface TileArrangeBinding {
  tileId: string;
  label: string;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
}

export function getTileArrangeSectionProps(arrange?: TileArrangeBinding) {
  if (!arrange) return {};
  return {
    draggable: true,
    'data-arranging': 'true',
    'data-dragging': arrange.isDragging ? 'true' : undefined,
    'data-drag-over': arrange.isDragOver ? 'true' : undefined,
    onDragStart: arrange.onDragStart,
    onDragOver: arrange.onDragOver,
    onDragLeave: arrange.onDragLeave,
    onDrop: arrange.onDrop,
    onDragEnd: arrange.onDragEnd,
  };
}
