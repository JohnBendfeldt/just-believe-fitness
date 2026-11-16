import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Camera,
  Check,
  Download,
  Image as ImageIcon,
  Share2,
  Sparkles,
  UserSquare2,
} from 'lucide-react';
import type { SavedRide } from '../types/fitness';
import {
  canvasToPngBlob,
  renderRideShareCanvas,
  type ShareOverlayStyle,
} from '../services/shareCardRenderer';

interface RidePhotoStudioProps {
  ride: SavedRide;
  onSaveRideMeta: (updatedRide: SavedRide) => Promise<void> | void;
  onSyncRemoteMeta?: (updatedRide: SavedRide) => Promise<void> | void;
}

export function RidePhotoStudio({
  ride,
  onSaveRideMeta,
  onSyncRemoteMeta,
}: RidePhotoStudioProps) {
  const [title, setTitle] = useState<string>(ride.title);
  const [notes, setNotes] = useState<string>(ride.notes || '');
  const [overlayStyle, setOverlayStyle] = useState<ShareOverlayStyle>('timeline');
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const [metaSavedTick, setMetaSavedTick] = useState<boolean>(false);
  const [sharingBusy, setSharingBusy] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rearCamInputRef = useRef<HTMLInputElement | null>(null);
  const selfieCamInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderRideShareCanvas(canvas, {
      ride,
      photo: photoImg,
      overlayStyle,
      customTitle: title,
      customCaption: notes,
    });
  }, [ride, photoImg, overlayStyle, title, notes]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhotoImg(img);
    };
    img.src = objectUrl;
    e.target.value = '';
  };

  const commitMetaChanges = async (pushRemote = false) => {
    const trimmedTitle = title.trim() || ride.workoutName;
    const trimmedNotes = notes.trim();
    if (trimmedTitle === ride.title && trimmedNotes === (ride.notes || '') && !pushRemote) {
      return;
    }
    const updated: SavedRide = {
      ...ride,
      title: trimmedTitle,
      notes: trimmedNotes || undefined,
    };
    await onSaveRideMeta(updated);
    if (pushRemote && onSyncRemoteMeta) {
      await onSyncRemoteMeta(updated);
    }
    setMetaSavedTick(true);
    window.setTimeout(() => setMetaSavedTick(false), 2000);
  };

  const handleDownloadPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await commitMetaChanges(false);
    const blob = await canvasToPngBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jbf-${ride.id}-stats.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleShareOrSavePhoto = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSharingBusy(true);
    try {
      await commitMetaChanges(false);
      const blob = await canvasToPngBlob(canvas);
      const file = new File([blob], `jbf-${ride.id}-stats.png`, { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          title: title.trim() || ride.title,
          text: notes.trim() || `${ride.burnPoints} Burn Points on Just Believe Fitness!`,
          files: [file],
        });
      } else {
        await handleDownloadPng();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      await handleDownloadPng();
    } finally {
      setSharingBusy(false);
    }
  };

  const hasRemoteSync = Boolean(ride.stravaActivityId || ride.garminActivityId);

  return (
    <div className="photo-studio-box">
      {/* Editable Title & Post-Ride Description (Sent to Strava & Garmin + Shown on Card) */}
      <div className="photo-meta-fields">
        <div className="field">
          <label htmlFor={`ride-title-input-${ride.id}`}>Workout Title (Strava &amp; Garmin)</label>
          <input
            id={`ride-title-input-${ride.id}`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void commitMetaChanges(false)}
            placeholder="Workout title"
          />
        </div>
        <div className="field">
          <label htmlFor={`ride-notes-input-${ride.id}`}>
            Post-Ride Notes / Photo Caption (Optional)
          </label>
          <input
            id={`ride-notes-input-${ride.id}`}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void commitMetaChanges(false)}
            placeholder="e.g. Crushed the final All-Out blocks! Felt strong."
          />
        </div>
        {hasRemoteSync && onSyncRemoteMeta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void commitMetaChanges(true)}
            >
              <Check size={14} /> Update Title &amp; Notes on Synced Activity
            </button>
            {metaSavedTick && (
              <span style={{ fontSize: '0.75rem', color: '#12B981', fontWeight: 700 }}>
                Saved!
              </span>
            )}
          </div>
        )}
      </div>

      {/* Photo & Stat Overlay Studio */}
      <div className="photo-studio-grid">
        <div className="photo-canvas-frame">
          <canvas ref={canvasRef} className="photo-preview-canvas" />
        </div>

        <div className="photo-studio-controls">
          <div>
            <div className="photo-control-heading">1. Background Photo</div>
            <div className="photo-btn-row">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => rearCamInputRef.current?.click()}
              >
                <Camera size={14} /> Take Photo
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => selfieCamInputRef.current?.click()}
              >
                <UserSquare2 size={14} /> Selfie
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon size={14} /> Gallery
              </button>
              {photoImg && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPhotoImg(null)}
                >
                  <Sparkles size={14} /> Studio Dark
                </button>
              )}
            </div>

            {/* Hidden Native Camera / Gallery File Inputs */}
            <input
              ref={rearCamInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <input
              ref={selfieCamInputRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          <div>
            <div className="photo-control-heading">2. Stat Overlay Style</div>
            <div className="photo-btn-row">
              <button
                type="button"
                className={`btn btn-sm ${overlayStyle === 'timeline' ? 'btn-primary' : ''}`}
                onClick={() => setOverlayStyle('timeline')}
              >
                Timeline Card
              </button>
              <button
                type="button"
                className={`btn btn-sm ${overlayStyle === 'rings' ? 'btn-primary' : ''}`}
                onClick={() => setOverlayStyle('rings')}
              >
                Speedo Rings
              </button>
              <button
                type="button"
                className={`btn btn-sm ${overlayStyle === 'minimal' ? 'btn-primary' : ''}`}
                onClick={() => setOverlayStyle('minimal')}
              >
                Clean Sticker
              </button>
            </div>
          </div>

          <div>
            <div className="photo-control-heading">3. Save / Attach to Strava</div>
            <div className="photo-btn-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={sharingBusy}
                onClick={() => void handleShareOrSavePhoto()}
              >
                <Share2 size={15} /> {sharingBusy ? 'Preparing...' : 'Share / Save Photo'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleDownloadPng()}
              >
                <Download size={15} /> PNG
              </button>
            </div>
            <p className="photo-helper-tip">
              Tip: Save or share this 1080×1350 stat photo, push your workout to{' '}
              <strong>Garmin + Strava</strong>, then tap <strong>View on Strava</strong> →{' '}
              <em>Add Photo</em> to attach it!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
