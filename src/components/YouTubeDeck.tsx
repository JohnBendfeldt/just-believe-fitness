import { useMemo, useState } from 'react';
import { ExternalLink, Maximize2, Minimize2, PictureInPicture2, Tv, X } from 'lucide-react';
import type { YouTubePreset } from '../services/storage';
import { buildYouTubeEmbedSrc } from '../utils/youtube';

export type YouTubeLayoutMode = 'closed' | 'split' | 'floating';

interface YouTubeDeckProps {
  layoutMode: YouTubeLayoutMode;
  onChangeLayoutMode: (mode: YouTubeLayoutMode) => void;
  currentUrl: string;
  presets: YouTubePreset[];
  onSelectUrl: (url: string) => void;
  onSavePreset: (title: string, url: string) => void;
  onLaunchHudPip: () => void;
  isHudPipActive: boolean;
}

export function YouTubeDeck({
  layoutMode,
  onChangeLayoutMode,
  currentUrl,
  presets,
  onSelectUrl,
  onSavePreset,
  onLaunchHudPip,
  isHudPipActive,
}: YouTubeDeckProps) {
  const [draftUrl, setDraftUrl] = useState(currentUrl);
  const [floatingLarge, setFloatingLarge] = useState(false);
  const embedSrc = useMemo(() => buildYouTubeEmbedSrc(currentUrl), [currentUrl]);

  const handleLoadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftUrl.trim()) {
      onSelectUrl(draftUrl.trim());
    }
  };

  if (layoutMode === 'closed') {
    return null;
  }

  if (layoutMode === 'floating') {
    return (
      <aside
        className={`youtube-floating-pip ${floatingLarge ? 'large' : ''}`}
        id="youtube-floating-player"
      >
        <div className="youtube-floating-bar">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Tv size={14} /> YouTube Mini-Player
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-sm"
              id="yt-float-size-toggle"
              onClick={() => setFloatingLarge((v) => !v)}
              title="Toggle mini player size"
            >
              {floatingLarge ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              id="yt-switch-to-split"
              onClick={() => onChangeLayoutMode('split')}
              title="Expand to Split Theater"
            >
              Split View
            </button>
            <button
              type="button"
              className="btn btn-sm"
              id="yt-close-floating"
              onClick={() => onChangeLayoutMode('closed')}
              title="Close YouTube player"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="youtube-frame-box" style={{ borderRadius: 0, border: 0 }}>
          {embedSrc ? (
            <iframe
              src={embedSrc}
              title="YouTube Ride Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 16 }}>
              Paste a valid YouTube link in Split View.
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <section className="youtube-split-card" id="youtube-split-theater">
      <div className="youtube-toolbar">
        <form
          onSubmit={handleLoadSubmit}
          style={{ display: 'flex', flex: '1 1 260px', gap: '8px', flexWrap: 'wrap' }}
        >
          <input
            id="youtube-url-input"
            className="youtube-url-input"
            type="text"
            placeholder="Paste YouTube video, Shorts, or playlist URL..."
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
          />
          <button type="submit" id="youtube-load-btn" className="btn btn-sm btn-primary">
            Play Video
          </button>
        </form>

        <button
          type="button"
          id="yt-switch-to-floating"
          className="btn btn-sm"
          onClick={() => onChangeLayoutMode('floating')}
          title="Shrink video to corner overlay"
        >
          <PictureInPicture2 size={15} /> Corner PiP
        </button>

        <button
          type="button"
          id="yt-popout-hud-pip"
          className={`btn btn-sm ${isHudPipActive ? 'btn-primary' : ''}`}
          onClick={onLaunchHudPip}
          title="Float JB Fitness gauges over the native YouTube app"
        >
          <ExternalLink size={15} /> {isHudPipActive ? 'HUD Floating' : 'Float HUD over YouTube App'}
        </button>

        <button
          type="button"
          id="yt-close-split"
          className="btn btn-sm"
          onClick={() => onChangeLayoutMode('closed')}
        >
          <X size={15} />
        </button>
      </div>

      <div className="youtube-frame-box">
        {embedSrc ? (
          <iframe
            src={embedSrc}
            title="YouTube Workout Theater"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              padding: '20px',
              textAlign: 'center',
            }}
          >
            Paste any YouTube link or choose a preset below to ride along.
          </div>
        )}
      </div>

      <div className="youtube-presets">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setDraftUrl(preset.videoIdOrUrl);
              onSelectUrl(preset.videoIdOrUrl);
            }}
          >
            {preset.title}
          </button>
        ))}
        <button
          type="button"
          id="youtube-save-favorite-btn"
          className="btn btn-sm"
          onClick={() => {
            if (!draftUrl.trim()) return;
            const name = window.prompt('Name for this YouTube ride bookmark:', 'Favorite Ride');
            if (name?.trim()) {
              onSavePreset(name.trim(), draftUrl.trim());
            }
          }}
        >
          + Save Current Link
        </button>
      </div>

      <p
        id="youtube-premium-tip"
        style={{
          margin: '8px 0 0',
          padding: '7px 10px',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.035)',
          border: '1px solid var(--hairline)',
          fontSize: '0.73rem',
          lineHeight: 1.4,
          color: 'var(--text-secondary)',
        }}
      >
        <strong>YouTube Premium ad-free tip:</strong> On <strong>Android/Desktop</strong>, tap{' '}
        <strong>Float HUD over YouTube App</strong> to watch inside your signed-in YouTube app.
        On <strong>iPhone</strong>, start your video in the YouTube app, swipe home into YouTube&apos;s
        ad-free PiP window, then switch back to Bluefy so Bluetooth stays live.
      </p>
    </section>
  );
}
