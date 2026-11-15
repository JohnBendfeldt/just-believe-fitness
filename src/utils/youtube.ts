export function buildYouTubeEmbedSrc(rawInput: string): string | null {
  const input = rawInput.trim();
  if (!input) return null;

  // Direct 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return `https://www.youtube.com/embed/${input}?autoplay=1&playsinline=1&rel=0`;
  }

  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    const listId = url.searchParams.get('list');
    let videoId = url.searchParams.get('v');

    if (!videoId && url.hostname.includes('youtu.be')) {
      videoId = url.pathname.replace(/^\//, '').split('/')[0] || null;
    }
    if (!videoId && url.pathname.includes('/shorts/')) {
      videoId = url.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    }
    if (!videoId && url.pathname.includes('/embed/')) {
      videoId = url.pathname.split('/embed/')[1]?.split('/')[0] || null;
    }
    if (!videoId && url.pathname.includes('/live/')) {
      videoId = url.pathname.split('/live/')[1]?.split('/')[0] || null;
    }

    if (videoId && listId) {
      return `https://www.youtube.com/embed/${videoId}?list=${encodeURIComponent(listId)}&autoplay=1&playsinline=1&rel=0`;
    }
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`;
    }
    if (listId) {
      return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}&autoplay=1&playsinline=1&rel=0`;
    }
  } catch {
    return null;
  }

  return null;
}
