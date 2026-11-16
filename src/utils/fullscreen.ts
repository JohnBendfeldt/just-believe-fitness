type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function isBrowserFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export async function enterBrowserFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isBrowserFullscreen()) return true;

  const root = document.documentElement as FullscreenElement;
  try {
    if (typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
    if (typeof root.webkitRequestFullscreen === 'function') {
      await root.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Ignore if blocked by browser permissions or already running as an installed standalone PWA
  }
  return false;
}

export async function exitBrowserFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!isBrowserFullscreen()) return;

  const doc = document as FullscreenDocument;
  try {
    if (typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen();
    } else if (typeof doc.webkitExitFullscreen === 'function') {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore fullscreen exit errors
  }
}

export async function toggleBrowserFullscreen(): Promise<boolean> {
  if (isBrowserFullscreen()) {
    await exitBrowserFullscreen();
    return false;
  }
  return enterBrowserFullscreen();
}
