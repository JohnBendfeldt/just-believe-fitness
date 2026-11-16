import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

export interface RecordedCanvasCall {
  op: string;
  args: unknown[];
}

const canvasCallMap = new WeakMap<HTMLCanvasElement, RecordedCanvasCall[]>();

export function getRecordedCanvasCalls(canvas: HTMLCanvasElement): RecordedCanvasCall[] {
  return canvasCallMap.get(canvas) ?? [];
}

function createMock2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const calls: RecordedCanvasCall[] = [];
  canvasCallMap.set(canvas, calls);

  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };

  const gradientStub = {
    addColorStop: record('gradient.addColorStop'),
  };

  const ctx = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '16px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    clearRect: record('clearRect'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    drawImage: record('drawImage'),
    setLineDash: record('setLineDash'),
    translate: record('translate'),
    scale: record('scale'),
    rotate: record('rotate'),
    measureText: (text: string) => ({
      width: text.length * 9,
    }),
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ op: 'createLinearGradient', args });
      return gradientStub;
    },
    createRadialGradient: (...args: unknown[]) => {
      calls.push({ op: 'createRadialGradient', args });
      return gradientStub;
    },
  };

  return ctx as unknown as CanvasRenderingContext2D;
}

// Polyfill 2D canvas rendering & PNG Blob export in jsdom
HTMLCanvasElement.prototype.getContext = function getContextPatched(
  this: HTMLCanvasElement,
  contextId: string
) {
  if (contextId === '2d') {
    return createMock2dContext(this);
  }
  return null;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = function toBlobPatched(
  this: HTMLCanvasElement,
  callback: BlobCallback,
  type = 'image/png'
) {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const blob = new Blob([pngHeader], { type });
  callback(blob);
};

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:jbf-test-object-url';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}

// Stub HTMLMediaElement playback in jsdom so pre-rendered Coach MP3 cues never log unimplemented warnings
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});
