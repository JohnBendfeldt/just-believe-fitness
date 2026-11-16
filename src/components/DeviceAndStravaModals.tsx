import { useState } from 'react';
import {
  Bluetooth,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  Flame,
  Heart,
  Play,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  GarminConfig,
  LiveTelemetry,
  SavedRide,
  StravaConfig,
  ZoneId,
} from '../types/fitness';
import { ZONE_PALETTE, formatDuration, metersToMiles } from '../utils/zones';
import { buildStravaAuthorizeUrl } from '../services/strava';
import {
  loginGarminConnect,
  verifyGarminConnectMfa,
} from '../services/garminConnect';
import { RidePhotoStudio } from './RidePhotoStudio';

interface DeviceModalProps {
  isOpen: boolean;
  telemetry: LiveTelemetry;
  bleSupported: boolean;
  onConnectBike: (acceptAllDevices?: boolean) => void;
  onDisconnectBike: () => void;
  onConnectHr: (acceptAllDevices?: boolean) => void;
  onDisconnectHr: () => void;
  onToggleSimulation: () => void;
  onClose: () => void;
}

export function DeviceConnectionModal({
  isOpen,
  telemetry,
  bleSupported,
  onConnectBike,
  onDisconnectBike,
  onConnectHr,
  onDisconnectHr,
  onToggleSimulation,
  onClose,
}: DeviceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} id="device-connection-modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Direct Bluetooth Sensors</h2>
            <p className="modal-subtitle">
              Pairs directly with any Echelon bike, FTMS smart bike or trainer, power pedals, or
              cadence pod — plus any Bluetooth heart rate monitor — with zero bridge apps or
              paywalls.
            </p>
          </div>
          <button type="button" className="btn btn-sm" id="close-device-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {!bleSupported && (
          <div
            style={{
              background: 'rgba(249, 115, 22, 0.14)',
              border: '1px solid rgba(249, 115, 22, 0.38)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '0.82rem',
            }}
          >
            Web Bluetooth requires Chrome on your Android phone/tablet (or Chrome/Edge on desktop).
            You can still test everything right now using <strong>Simulate Ride</strong> below!
          </div>
        )}

        {/* Universal Stationary Bike Card (All Echelon Models + Other Bike Brands) */}
        <div className="history-item" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <span
                className={`status-dot ${
                  telemetry.bikeConnected
                    ? 'connected'
                    : telemetry.bikeStatus === 'connecting' ||
                        telemetry.bikeStatus === 'reconnecting'
                      ? 'connecting'
                      : ''
                }`}
              />
              Stationary Bike ({telemetry.bikeName || 'Echelon · FTMS · Power · Cadence'})
            </div>
            <p style={{ margin: '5px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong>Echelon Bikes:</strong> Connect Sport, Sport-s, EX-15, Prime, EX-1, EX-3,
              EX-4s, EX-5, EX-5s, EX-7s, EX-8s &amp; GT+ (auto-detects flywheel curve &amp; knob vs.
              motorized resistance).
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong>Other Brands:</strong> Works with standard Bluetooth FTMS bikes &amp; trainers
              (Schwinn IC4, Bowflex C6, Yesoul, Merach, Domyos, Keiser M3i, Stages, Wattbike,
              Concept2 BikeErg, Renpho, Wahoo KICKR, Tacx, Zwift Ride), power pedals
              (Assioma/Rally), or any spin bike with a BLE cadence sensor.
            </p>
            <p
              style={{
                margin: '6px 0 0',
                padding: '6px 9px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--hairline)',
                fontSize: '0.74rem',
                color: 'var(--text-secondary)',
              }}
            >
              <strong>Tip:</strong> Force-close the official Echelon/brand app (and put built-in{' '}
              <code>s</code>-series screens in sleep/freestyle) so Bluetooth is free. Avoid updating
              firmware in the official Echelon app so your bike stays unlocked for direct offline
              Bluetooth.
            </p>
          </div>
          {telemetry.bikeConnected ? (
            <button
              type="button"
              id="disconnect-bike-btn"
              className="btn btn-danger btn-sm"
              onClick={onDisconnectBike}
            >
              Disconnect
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                id="connect-bike-btn"
                className="btn btn-primary"
                disabled={!bleSupported || telemetry.bikeStatus === 'connecting'}
                onClick={() => onConnectBike(false)}
              >
                <Bluetooth size={16} />
                {telemetry.bikeStatus === 'connecting' ? 'Scanning...' : 'Pair Bike'}
              </button>
              <button
                type="button"
                id="connect-bike-all-btn"
                className="btn btn-sm"
                disabled={!bleSupported || telemetry.bikeStatus === 'connecting'}
                onClick={() => onConnectBike(true)}
                title="Show all nearby Bluetooth devices if your bike uses a custom name"
              >
                Scan All BLE
              </button>
            </div>
          )}
        </div>

        {/* Universal BLE Heart Rate Monitor Card (Any Brand) */}
        <div className="history-item">
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <span
                className={`status-dot ${
                  telemetry.hrConnected
                    ? 'connected'
                    : telemetry.hrStatus === 'connecting' || telemetry.hrStatus === 'reconnecting'
                      ? 'connecting'
                      : ''
                }`}
              />
              Heart Rate Monitor ({telemetry.hrName || 'Any BLE Strap / Watch'})
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Works with <strong>any Bluetooth HR sensor</strong>: Polar, Wahoo TICKR, WHOOP,
              Coospo, Scosche, COROS, Suunto, or Garmin (on watches, enable{' '}
              <strong>Broadcast Heart Rate</strong> first).
            </p>
          </div>
          {telemetry.hrConnected ? (
            <button
              type="button"
              id="disconnect-hr-btn"
              className="btn btn-danger btn-sm"
              onClick={onDisconnectHr}
            >
              Disconnect
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                id="connect-hr-btn"
                className="btn btn-primary"
                disabled={!bleSupported || telemetry.hrStatus === 'connecting'}
                onClick={() => onConnectHr(false)}
              >
                <Heart size={16} />
                {telemetry.hrStatus === 'connecting' ? 'Scanning...' : 'Pair Heart Rate'}
              </button>
              <button
                type="button"
                id="connect-hr-all-btn"
                className="btn btn-sm"
                disabled={!bleSupported || telemetry.hrStatus === 'connecting'}
                onClick={() => onConnectHr(true)}
                title="Show all nearby Bluetooth devices if your watch hides its HR service icon"
              >
                Scan All BLE
              </button>
            </div>
          )}
        </div>

        {/* Interactive Demo Simulator */}
        <div className="history-item">
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontWeight: 700 }}>Interactive Ride Simulator</div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Stream realistic stationary bike gear, cadence, watts, and heart rate off-bike to
              preview color shifts, Burn Points, PiP HUD, photo stat cards, and Garmin/Strava
              export.
            </p>
          </div>
          <button
            type="button"
            id="modal-toggle-sim-btn"
            className={`btn ${telemetry.isSimulating ? 'btn-danger' : ''}`}
            onClick={onToggleSimulation}
          >
            <Play size={15} />
            {telemetry.isSimulating ? 'Stop Simulator' : 'Enable Simulator'}
          </button>
        </div>
      </div>
    </div>
  );
}

export type CloudUploadTarget = 'strava' | 'garmin' | 'both';

interface HistoryAndStravaModalProps {
  isOpen: boolean;
  highlightedRide: SavedRide | null;
  onSelectHighlightedRide: (ride: SavedRide | null) => void;
  rides: SavedRide[];
  stravaConfig: StravaConfig;
  garminConfig: GarminConfig;
  uploadingRideId: string | null;
  uploadStatusText: string;
  onSaveStravaConfig: (next: StravaConfig) => void;
  onSaveGarminConfig: (next: GarminConfig) => void;
  onUploadRide: (ride: SavedRide, target: CloudUploadTarget) => void;
  onUpdateRideMeta: (updated: SavedRide) => Promise<void> | void;
  onSyncRemoteMeta: (updated: SavedRide) => Promise<void> | void;
  onDownloadTcx: (ride: SavedRide) => void;
  onDeleteRide: (id: string) => void;
  onNotify: (msg: string) => void;
  onClose: () => void;
}

export function HistoryAndStravaModal({
  isOpen,
  highlightedRide,
  onSelectHighlightedRide,
  rides,
  stravaConfig,
  garminConfig,
  uploadingRideId,
  uploadStatusText,
  onSaveStravaConfig,
  onSaveGarminConfig,
  onUploadRide,
  onUpdateRideMeta,
  onSyncRemoteMeta,
  onDownloadTcx,
  onDeleteRide,
  onNotify,
  onClose,
}: HistoryAndStravaModalProps) {
  const [clientId, setClientId] = useState(stravaConfig.clientId);
  const [clientSecret, setClientSecret] = useState(stravaConfig.clientSecret);
  const [showStravaSetup, setShowStravaSetup] = useState(false);

  // Garmin Connect SSO & MFA State
  const [showGarminSetup, setShowGarminSetup] = useState(false);
  const [garminEmail, setGarminEmail] = useState(garminConfig.email || '');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminMfaState, setGarminMfaState] = useState<unknown | null>(null);
  const [garminMfaCode, setGarminMfaCode] = useState('');
  const [garminAuthBusy, setGarminAuthBusy] = useState(false);
  const [showPhotoStudio, setShowPhotoStudio] = useState(true);

  if (!isOpen) return null;

  const isStravaConnected = Boolean(stravaConfig.accessToken);
  const isGarminConnected = Boolean(garminConfig.tokens);
  const callbackDomain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  const handleConnectStrava = () => {
    const next: StravaConfig = {
      ...stravaConfig,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    };
    onSaveStravaConfig(next);
    if (!next.clientId) return;
    window.location.href = buildStravaAuthorizeUrl(next.clientId);
  };

  const handleDisconnectStrava = () => {
    onSaveStravaConfig({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
  };

  const handleGarminSignIn = async () => {
    if (!garminEmail.trim() || !garminPassword) return;
    setGarminAuthBusy(true);
    try {
      const res = await loginGarminConnect(garminEmail, garminPassword);
      if (res.mfaRequired) {
        setGarminMfaState(res.mfaState);
        onNotify('Enter the 6-digit verification code Garmin sent to finish connecting.');
      } else {
        onSaveGarminConfig(res.config);
        setGarminPassword('');
        setShowGarminSetup(false);
        onNotify(`Garmin Connect linked as ${res.config.athleteName}!`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Garmin sign-in failed.');
    } finally {
      setGarminAuthBusy(false);
    }
  };

  const handleGarminVerifyMfa = async () => {
    if (!garminMfaState || !garminMfaCode.trim()) return;
    setGarminAuthBusy(true);
    try {
      const cfg = await verifyGarminConnectMfa(garminMfaState, garminMfaCode, garminEmail);
      onSaveGarminConfig(cfg);
      setGarminMfaState(null);
      setGarminMfaCode('');
      setGarminPassword('');
      setShowGarminSetup(false);
      onNotify(`Garmin Connect linked as ${cfg.athleteName}!`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Garmin MFA verification failed.');
    } finally {
      setGarminAuthBusy(false);
    }
  };

  const handleDisconnectGarmin = () => {
    onSaveGarminConfig({});
    setGarminMfaState(null);
    onNotify('Disconnected Garmin Connect.');
  };

  const orderedZones: ZoneId[] = [5, 4, 3, 2, 1];

  const renderSyncButtonsForRide = (ride: SavedRide, isHero: boolean) => {
    const isBusy = uploadingRideId === ride.id;
    const hasStrava = Boolean(ride.stravaActivityId);
    const hasGarmin = Boolean(ride.garminUploadedAtIso || ride.garminActivityId);
    const btnSize = isHero ? '' : 'btn-sm';

    return (
      <>
        {/* 1-Click Push to BOTH Garmin + Strava (Zwift-style!) when both are connected */}
        {isGarminConnected && isStravaConnected && !hasStrava && !hasGarmin && (
          <button
            type="button"
            id={isHero ? 'push-both-btn' : undefined}
            className={`btn btn-primary ${btnSize}`}
            disabled={isBusy}
            onClick={() => onUploadRide(ride, 'both')}
          >
            <UploadCloud size={15} />
            {isBusy ? uploadStatusText || 'Syncing...' : 'Push to Garmin + Strava'}
          </button>
        )}

        {/* Garmin Connect Button / View Link */}
        {hasGarmin ? (
          ride.garminActivityId ? (
            <a
              href={`https://connect.garmin.com/modern/activity/${ride.garminActivityId}`}
              target="_blank"
              rel="noreferrer"
              className={`btn btn-garmin ${btnSize}`}
            >
              <CheckCircle2 size={14} /> Garmin <ExternalLink size={13} />
            </a>
          ) : (
            <span className={`btn btn-garmin ${btnSize}`} style={{ opacity: 0.9 }}>
              <CheckCircle2 size={14} /> Garmin Synced
            </span>
          )
        ) : (
          <button
            type="button"
            id={isHero ? 'push-highlighted-garmin' : undefined}
            className={`btn btn-garmin ${btnSize}`}
            disabled={isBusy}
            onClick={() => onUploadRide(ride, 'garmin')}
          >
            <UploadCloud size={15} />
            {isBusy && !isStravaConnected
              ? uploadStatusText || 'Uploading...'
              : isHero
                ? 'Push to Garmin'
                : 'Garmin'}
          </button>
        )}

        {/* Strava Button / View Link */}
        {hasStrava ? (
          <a
            href={`https://www.strava.com/activities/${ride.stravaActivityId}`}
            target="_blank"
            rel="noreferrer"
            className={`btn btn-strava ${btnSize}`}
          >
            <CheckCircle2 size={14} /> Strava <ExternalLink size={13} />
          </a>
        ) : (
          <button
            type="button"
            id={isHero ? 'push-highlighted-strava' : undefined}
            className={`btn btn-strava ${btnSize}`}
            disabled={isBusy}
            onClick={() => onUploadRide(ride, 'strava')}
          >
            <UploadCloud size={15} />
            {isBusy && !isGarminConnected
              ? uploadStatusText || 'Uploading...'
              : isHero
                ? 'Push to Strava'
                : 'Strava'}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        style={{ width: 'min(780px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
        id="history-strava-modal"
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {highlightedRide
                ? 'Workout Summary, Photo Card & Cloud Sync'
                : 'Ride History · Garmin & Strava Sync'}
            </h2>
            <p className="modal-subtitle">
              Snap a post-ride stat photo, customize your notes, and push to Garmin Connect, Strava,
              or both at once.
            </p>
          </div>
          <button type="button" className="btn btn-sm" id="close-history-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Highlighted Ride Summary + Photo Overlay Studio */}
        {highlightedRide && (
          <div
            style={{
              background: 'rgba(249, 115, 22, 0.08)',
              border: '1px solid rgba(249, 115, 22, 0.32)',
              borderRadius: '14px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{highlightedRide.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {formatDuration(highlightedRide.durationSec)} ·{' '}
                  {metersToMiles(highlightedRide.distanceMeters).toFixed(2)} mi ·{' '}
                  {Math.round(highlightedRide.caloriesKcal)} kcal
                </div>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#F97316',
                  color: '#140700',
                  fontWeight: 800,
                  padding: '6px 12px',
                  borderRadius: '999px',
                  fontSize: '0.88rem',
                }}
              >
                <Flame size={16} /> {highlightedRide.burnPoints} BURN PTS
              </div>
            </div>

            <div className="summary-metrics-grid">
              <div className="stat-tile">
                <span className="stat-tile-label">Avg / NP Power</span>
                <span className="stat-tile-val tabular">
                  {highlightedRide.avgWatts}W / {highlightedRide.normalizedWatts}W
                </span>
                <span className="stat-tile-sub">{highlightedRide.avgWkg.toFixed(2)} W/kg</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Max Power</span>
                <span className="stat-tile-val tabular">{highlightedRide.maxWatts}W</span>
                <span className="stat-tile-sub">Avg Res {highlightedRide.avgResistance}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Heart Rate</span>
                <span className="stat-tile-val tabular">
                  {highlightedRide.avgHr > 0 ? `${highlightedRide.avgHr} bpm` : '--'}
                </span>
                <span className="stat-tile-sub">
                  Max {highlightedRide.maxHr > 0 ? `${highlightedRide.maxHr} bpm` : '--'}
                </span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Cadence</span>
                <span className="stat-tile-val tabular">{highlightedRide.avgCadence} rpm</span>
                <span className="stat-tile-sub">Max {highlightedRide.maxCadence} rpm</span>
              </div>
            </div>

            <div className="zone-dist-list">
              {orderedZones.map((zId) => {
                const secs =
                  (highlightedRide.avgHr > 0
                    ? highlightedRide.hrZoneSeconds[zId]
                    : highlightedRide.powerZoneSeconds[zId]) || 0;
                const pct = Math.min(
                  100,
                  Math.round((secs / Math.max(1, highlightedRide.durationSec)) * 100)
                );
                return (
                  <div className="zone-dist-row" key={zId}>
                    <span className="zone-dist-name">
                      <span
                        className="zone-swatch"
                        style={{ backgroundColor: ZONE_PALETTE[zId].color }}
                      />
                      Zone {zId}
                    </span>
                    <div className="zone-dist-track">
                      <div
                        className="zone-dist-fill"
                        style={{
                          width: `${secs > 0 ? Math.max(4, pct) : 0}%`,
                          backgroundColor: ZONE_PALETTE[zId].color,
                        }}
                      />
                    </div>
                    <span className="zone-dist-time tabular">{formatDuration(secs)}</span>
                  </div>
                );
              })}
            </div>

            {/* Cloud Push + Photo Toggle + TCX Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {renderSyncButtonsForRide(highlightedRide, true)}

              <button
                type="button"
                className={`btn ${showPhotoStudio ? 'btn-primary' : ''}`}
                onClick={() => setShowPhotoStudio((v) => !v)}
              >
                <Camera size={15} /> {showPhotoStudio ? 'Hide Photo Studio' : 'Create Stat Photo'}
              </button>

              <button
                type="button"
                id="download-highlighted-tcx"
                className="btn"
                onClick={() => onDownloadTcx(highlightedRide)}
              >
                <Download size={16} /> .TCX
              </button>
            </div>

            {uploadingRideId === highlightedRide.id && uploadStatusText && (
              <div style={{ fontSize: '0.8rem', color: '#fb923c', fontWeight: 600 }}>
                {uploadStatusText}
              </div>
            )}

            {/* Embedded Camera / Gallery + Stat Overlay Compositor & Title/Notes Editor */}
            {showPhotoStudio && (
              <RidePhotoStudio
                key={highlightedRide.id}
                ride={highlightedRide}
                onSaveRideMeta={onUpdateRideMeta}
                onSyncRemoteMeta={onSyncRemoteMeta}
              />
            )}
          </div>
        )}

        {/* Dual Cloud Connections: Garmin Connect & Strava */}
        <div style={{ display: 'grid', gap: '10px' }}>
          {/* Garmin Connect Box */}
          <div className="zone-preview-table">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.86rem' }}>
                  Garmin Connect:{' '}
                  {isGarminConnected ? (
                    <span style={{ color: '#0EA5E9' }}>
                      Connected ({garminConfig.athleteName || garminConfig.email})
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Not Connected</span>
                  )}
                </strong>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                id="toggle-garmin-setup-btn"
                onClick={() => setShowGarminSetup((v) => !v)}
              >
                {showGarminSetup ? 'Hide Garmin Settings' : 'Configure Garmin'}
              </button>
            </div>

            {showGarminSetup && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginTop: '8px',
                }}
              >
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <ShieldCheck
                    size={13}
                    style={{ verticalAlign: '-2px', marginRight: '4px', color: '#0EA5E9' }}
                  />
                  Signs in directly with Garmin SSO via your private Netlify function and stores{' '}
                  <strong>only rolling OAuth session tokens</strong> in this browser (your Garmin
                  password is never saved). When both Garmin and Strava are linked, JBF uploads in
                  import mode so Garmin won&apos;t double-post a duplicate to Strava!
                </p>

                {!garminMfaState ? (
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="garmin-email-input">Garmin Connect Email</label>
                      <input
                        id="garmin-email-input"
                        type="email"
                        placeholder="you@example.com"
                        value={garminEmail}
                        onChange={(e) => setGarminEmail(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="garmin-password-input">Garmin Password (Not Stored)</label>
                      <input
                        id="garmin-password-input"
                        type="password"
                        placeholder="Used once to obtain OAuth token"
                        value={garminPassword}
                        onChange={(e) => setGarminPassword(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="garmin-mfa-input">
                      Garmin 2FA Verification Code (Check Email / SMS)
                    </label>
                    <input
                      id="garmin-mfa-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="6-digit code"
                      value={garminMfaCode}
                      onChange={(e) => setGarminMfaCode(e.target.value)}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!garminMfaState ? (
                    <button
                      type="button"
                      id="connect-garmin-btn"
                      className="btn btn-garmin btn-sm"
                      disabled={garminAuthBusy || !garminEmail.trim() || !garminPassword}
                      onClick={() => void handleGarminSignIn()}
                    >
                      {garminAuthBusy ? 'Signing in...' : 'Connect Garmin Account'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        id="verify-garmin-mfa-btn"
                        className="btn btn-garmin btn-sm"
                        disabled={garminAuthBusy || !garminMfaCode.trim()}
                        onClick={() => void handleGarminVerifyMfa()}
                      >
                        {garminAuthBusy ? 'Verifying...' : 'Verify 2FA Code'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setGarminMfaState(null)}
                      >
                        Back
                      </button>
                    </>
                  )}
                  {isGarminConnected && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleDisconnectGarmin}
                    >
                      Disconnect Garmin
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Strava OAuth Configuration Box */}
          <div className="zone-preview-table">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.86rem' }}>
                  Strava Connection:{' '}
                  {isStravaConnected ? (
                    <span style={{ color: '#12B981' }}>
                      Connected ({stravaConfig.athleteName || 'Authorized'})
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Not Connected</span>
                  )}
                </strong>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                id="toggle-strava-setup-btn"
                onClick={() => setShowStravaSetup((v) => !v)}
              >
                {showStravaSetup ? 'Hide Strava Settings' : 'Configure Strava'}
              </button>
            </div>

            {showStravaSetup && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginTop: '8px',
                }}
              >
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  1. Create a free Personal API app at{' '}
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#fb923c' }}
                  >
                    strava.com/settings/api
                  </a>{' '}
                  and set <strong>Authorization Callback Domain</strong> to{' '}
                  <code>{callbackDomain}</code>.<br />
                  2. Paste your Client ID &amp; Client Secret below (stored only in this browser)
                  and tap <strong>Connect with Strava</strong>.
                </p>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="strava-client-id">Strava Client ID</label>
                    <input
                      id="strava-client-id"
                      type="text"
                      placeholder="e.g. 128491"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="strava-client-secret">
                      Strava Client Secret (or set in Netlify Env)
                    </label>
                    <input
                      id="strava-client-secret"
                      type="password"
                      placeholder="Optional if STRAVA_CLIENT_SECRET is set on Netlify"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    id="authorize-strava-btn"
                    className="btn btn-strava btn-sm"
                    disabled={!clientId.trim()}
                    onClick={handleConnectStrava}
                  >
                    Connect with Strava
                  </button>
                  {isStravaConnected && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleDisconnectStrava}
                    >
                      Disconnect Strava
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Saved Ride List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 className="panel-heading">Saved Local Workouts ({rides.length})</h3>
          {rides.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '12px 0' }}>
              No saved rides yet. Start a workout and tap Save when you&apos;re done!
            </div>
          ) : (
            rides.map((r) => (
              <div className="history-item" key={r.id}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                    {r.title}{' '}
                    <span style={{ color: '#f97316', fontSize: '0.8rem' }}>
                      · ★ {r.burnPoints} Burn pts
                    </span>
                  </div>
                  <div
                    className="tabular"
                    style={{
                      fontSize: '0.76rem',
                      color: 'var(--text-secondary)',
                      marginTop: '2px',
                    }}
                  >
                    {new Date(r.startedAtIso).toLocaleDateString()} · {formatDuration(r.durationSec)}{' '}
                    · Avg {r.avgWatts}W ({r.avgWkg.toFixed(2)} W/kg) ·{' '}
                    {r.avgHr > 0 ? `${r.avgHr} bpm · ` : ''}
                    {Math.round(r.caloriesKcal)} kcal
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {renderSyncButtonsForRide(r, false)}

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      onSelectHighlightedRide(r);
                      setShowPhotoStudio(true);
                    }}
                    title="Create stat overlay photo or edit title & notes"
                  >
                    <Camera size={14} /> Photo
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onDownloadTcx(r)}
                    title="Download .TCX file"
                  >
                    <Download size={14} /> .TCX
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => onDeleteRide(r.id)}
                    title="Delete ride"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
