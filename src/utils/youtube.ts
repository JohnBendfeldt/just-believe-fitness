const SAFE_YT_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const SAFE_YT_LIST_ID = /^[a-zA-Z0-9_-]{2,128}$/;

export function buildYouTubeEmbedSrc(rawInput: string): string | null {
  const input = rawInput.trim();
  if (!input) return null;

  // Direct 11-char video ID
  if (SAFE_YT_VIDEO_ID.test(input)) {
    return `https://www.youtube.com/embed/${input}?autoplay=1&playsinline=1&rel=0`;
  }

  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    const rawListId = url.searchParams.get('list');
    const listId = rawListId && SAFE_YT_LIST_ID.test(rawListId) ? rawListId : null;
    let rawVideoId = url.searchParams.get('v');

    if (!rawVideoId && url.hostname.includes('youtu.be')) {
      rawVideoId = url.pathname.replace(/^\//, '').split('/')[0] || null;
    }
    if (!rawVideoId && url.pathname.includes('/shorts/')) {
      rawVideoId = url.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    }
    if (!rawVideoId && url.pathname.includes('/embed/')) {
      rawVideoId = url.pathname.split('/embed/')[1]?.split('/')[0] || null;
    }
    if (!rawVideoId && url.pathname.includes('/live/')) {
      rawVideoId = url.pathname.split('/live/')[1]?.split('/')[0] || null;
    }

    const videoId = rawVideoId && SAFE_YT_VIDEO_ID.test(rawVideoId) ? rawVideoId : null;

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
