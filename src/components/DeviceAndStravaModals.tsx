import { useEffect, useRef, useState } from 'react';
import {
  Bluetooth,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Flame,
  Heart,
  KeyRound,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import type {
  GarminConfig,
  GarminImportedProfile,
  LiveTelemetry,
  SavedRide,
  StravaConfig,
  ZoneId,
} from '../types/fitness';
import { ZONE_PALETTE, computeWattsPerKg, formatDuration, metersToMiles } from '../utils/zones';
import { buildStravaAuthorizeUrl } from '../services/strava';
import {
  fetchGarminServerStatus,
  syncGarminPersonalApi,
  verifyGarminSessionTokens,
} from '../services/garminConnect';
import type { FitDevicePresetId } from '../services/fitExporter';
import {
  FIT_DEVICE_PRESETS,
  convertTcxXmlToFitBytes,
  downloadFitBytes,
  downloadRideFit,
} from '../services/fitExporter';
import { loadFitDevicePreset, saveFitDevicePreset } from '../services/storage';
import { RidePhotoStudio } from './RidePhotoStudio';
import { getBluetoothUnsupportedMessage } from '../utils/browserSupport';

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
            {getBluetoothUnsupportedMessage()}
            {' '}You can still test everything right now using <strong>Simulate Ride</strong> below!
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
              EX-4s, EX-4s+, EX-5, EX-5s, EX-7s, EX-8s, EX-Pro &amp; GT+ — including{' '}
              <strong>automatic offline unlock for locked Echelon firmware</strong> (auto-detects
              flywheel curve &amp; knob vs. motorized resistance).
            </p>
            {telemetry.bikeConnected && telemetry.bikeUnlockStatus === 'unlocking' && (
              <p
                id="bike-unlock-status"
                style={{
                  margin: '6px 0 0',
                  padding: '6px 9px',
                  borderRadius: '8px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                }}
              >
                Unlocking locked Echelon firmware directly over Bluetooth...
              </p>
            )}
            {telemetry.bikeConnected && telemetry.bikeUnlockStatus === 'unlocked' && (
              <p
                id="bike-unlock-status"
                style={{
                  margin: '6px 0 0',
                  padding: '6px 9px',
                  borderRadius: '8px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                }}
              >
                Locked Echelon firmware unlocked directly — live metrics active.
              </p>
            )}
            {telemetry.bikeConnected && telemetry.bikeUnlockStatus === 'failed' && (
              <p
                id="bike-unlock-status"
                style={{
                  margin: '6px 0 0',
                  padding: '6px 9px',
                  borderRadius: '8px',
                  background: 'rgba(249, 115, 22, 0.14)',
                  border: '1px solid rgba(249, 115, 22, 0.42)',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                }}
              >
                <strong>Firmware lock didn&apos;t confirm:</strong> Unplug the bike for 10 seconds
                so its Bluetooth LED flashes fresh, then tap <strong>Disconnect</strong> and{' '}
                <strong>Pair Bike</strong> again.
              </p>
            )}
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
              <code>s</code>-series screens in sleep/freestyle) so Bluetooth is free. Locked
              Echelon firmware (<code>0xF0 0xE0</code>) unlocks automatically offline — if metrics
              stay at 0, power-cycle the bike for 10s and reconnect. Avoid unnecessary firmware
              updates in the Echelon app in case future updates add stricter locks.
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
                disabled={!bleSupported}
                onClick={() => onConnectBike(false)}
              >
                <Bluetooth size={16} />
                {telemetry.bikeStatus === 'connecting' ? 'Scan Again' : 'Pair Bike'}
              </button>
              <button
                type="button"
                id="connect-bike-all-btn"
                className="btn btn-sm"
                disabled={!bleSupported}
                onClick={() => onConnectBike(true)}
                title="Show all nearby Bluetooth devices if your bike uses a custom name"
              >
                Scan All BLE
              </button>
              {(telemetry.bikeStatus === 'connecting' ||
                telemetry.bikeStatus === 'reconnecting') && (
                <button
                  type="button"
                  id="cancel-bike-scan-btn"
                  className="btn btn-danger btn-sm"
                  onClick={onDisconnectBike}
                  title="Cancel Bluetooth scan"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* Universal BLE Heart Rate Monitor Card (Any Brand) */}
        <div className="history-item" style={{ alignItems: 'flex-start' }}>
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
              Coospo, Scosche, COROS, Suunto, Garmin (enable <strong>Broadcast Heart Rate</strong>{' '}
              on Garmin watches), and <strong>Apple Watch</strong> (via an HR broadcast app).
            </p>
            <p
              id="apple-watch-hr-tip"
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
              <strong>Apple Watch:</strong> Apple Watch doesn&apos;t broadcast standard Bluetooth
              heart rate natively — just open an HR broadcast app on your Apple Watch &amp; iPhone
              (such as <strong>HeartCast</strong>, <strong>ECHO Heart Rate</strong>, or{' '}
              <strong>BlueHeart</strong>) to broadcast live heart rate, then tap{' '}
              <strong>Pair Heart Rate</strong> here.
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
                disabled={!bleSupported}
                onClick={() => onConnectHr(false)}
              >
                <Heart size={16} />
                {telemetry.hrStatus === 'connecting' ? 'Scan Again' : 'Pair Heart Rate'}
              </button>
              <button
                type="button"
                id="connect-hr-all-btn"
                className="btn btn-sm"
                disabled={!bleSupported}
                onClick={() => onConnectHr(true)}
                title="Show all nearby Bluetooth devices if your watch hides its HR service icon"
              >
                Scan All BLE
              </button>
              {(telemetry.hrStatus === 'connecting' || telemetry.hrStatus === 'reconnecting') && (
                <button
                  type="button"
                  id="cancel-hr-scan-btn"
                  className="btn btn-danger btn-sm"
                  onClick={onDisconnectHr}
                  title="Cancel heart rate Bluetooth scan"
                >
                  Cancel
                </button>
              )}
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
  currentFtpWatts?: number;
  stravaConfig: StravaConfig;
  garminConfig: GarminConfig;
  uploadingRideId: string | null;
  uploadStatusText: string;
  onSaveStravaConfig: (next: StravaConfig) => void;
  onSaveGarminConfig: (next: GarminConfig) => void;
  onImportAthleteStats?: (imported: GarminImportedProfile) => void;
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
  currentFtpWatts,
  stravaConfig,
  garminConfig,
  uploadingRideId,
  uploadStatusText,
  onSaveStravaConfig,
  onSaveGarminConfig,
  onImportAthleteStats,
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

  // Garmin Connect Personal API & Optional Desktop Session Token State
  const [showGarminSetup, setShowGarminSetup] = useState(false);
  const [garminAuthBusy, setGarminAuthBusy] = useState(false);
  const [garminTokenJson, setGarminTokenJson] = useState('');
  const [showGarminTokenPaste, setShowGarminTokenPaste] = useState(false);
  const [garminPersonalKey, setGarminPersonalKey] = useState(garminConfig.personalApiKey || '');
  const [hasServerPersonalKey, setHasServerPersonalKey] = useState(false);
  const [garminPersonalBusy, setGarminPersonalBusy] = useState(false);
  const [showPhotoStudio, setShowPhotoStudio] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [fitPreset, setFitPreset] = useState<FitDevicePresetId>(() => loadFitDevicePreset());
  const tcxFileInputRef = useRef<HTMLInputElement | null>(null);
  const modalCardRef = useRef<HTMLDivElement | null>(null);

  const handleSelectFitPreset = (next: FitDevicePresetId) => {
    setFitPreset(next);
    saveFitDevicePreset(next);
  };

  const handleConvertTcxUpload = async (file: File) => {
    try {
      const xmlText = await file.text();
      const { bytes, ride } = convertTcxXmlToFitBytes(xmlText, fitPreset, file.name);
      const outName = file.name.replace(/\.tcx$/i, '') + '.fit';
      downloadFitBytes(bytes, outName);
      onNotify(
        `Converted ${file.name} -> ${outName} (${ride.trackPoints.length}s · ${ride.avgWatts}W avg · ${FIT_DEVICE_PRESETS[fitPreset].label}).`
      );
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Could not convert .TCX file to .FIT.');
    }
  };

  useEffect(() => {
    if (!isOpen || !showGarminSetup) return;
    let active = true;
    void fetchGarminServerStatus()
      .then((status) => {
        if (active) setHasServerPersonalKey(status.hasServerPersonalApiKey);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, showGarminSetup]);

  if (!isOpen) return null;

  const isStravaConnected = Boolean(stravaConfig.accessToken);
  const isGarminConnected = Boolean(garminConfig.tokens);
  const isPersonalApiLinked = Boolean(
    garminConfig.personalApiKey || garminConfig.lastPersonalSyncAtIso
  );
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

  const handleDisconnectGarmin = () => {
    onSaveGarminConfig({});
    setGarminPersonalKey('');
    setGarminTokenJson('');
    onNotify('Disconnected Garmin Connect.');
  };

  const handleSyncPersonalApi = async () => {
    setGarminPersonalBusy(true);
    try {
      const res = await syncGarminPersonalApi(garminPersonalKey);
      onSaveGarminConfig(res.config);
      const importedEntries: string[] = [];
      if (
        res.importedProfile.heightFeet !== undefined &&
        res.importedProfile.heightInches !== undefined
      ) {
        importedEntries.push(
          `${res.importedProfile.heightFeet}'${res.importedProfile.heightInches}"`
        );
      }
      if (res.importedProfile.weightLbs !== undefined) {
        importedEntries.push(`${res.importedProfile.weightLbs} lbs`);
      }
      if (res.importedProfile.maxHrBpm !== undefined) {
        importedEntries.push(`${res.importedProfile.maxHrBpm} Max HR`);
      }
      if (res.importedProfile.restingHrBpm !== undefined) {
        importedEntries.push(`${res.importedProfile.restingHrBpm} RHR`);
      }
      if (res.importedProfile.ftpWatts !== undefined) {
        importedEntries.push(`${res.importedProfile.ftpWatts}W FTP`);
      }
      if (Object.keys(res.importedProfile).length > 0) {
        onImportAthleteStats?.(res.importedProfile);
      }
      const summary = importedEntries.length > 0 ? ` (${importedEntries.join(', ')})` : '';
      onNotify(
        `Synced Garmin Personal API for ${res.athleteName}: ${res.recentActivities.length} recent workouts loaded${summary}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Garmin Personal API sync failed.');
    } finally {
      setGarminPersonalBusy(false);
    }
  };

  const handleVerifyGarminTokens = async () => {
    if (!garminTokenJson.trim()) return;
    setGarminAuthBusy(true);
    try {
      const cfg = await verifyGarminSessionTokens(garminTokenJson, garminConfig.email);
      onSaveGarminConfig(cfg);
      setGarminTokenJson('');
      setShowGarminTokenPaste(false);
      setShowGarminSetup(false);
      onNotify(`Garmin upload session verified as ${cfg.athleteName}!`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Garmin session token verification failed.');
    } finally {
      setGarminAuthBusy(false);
    }
  };

  const handleCopyGarminTokens = async () => {
    if (!garminConfig.tokens) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(garminConfig.tokens));
      onNotify('Copied Garmin session token JSON to clipboard.');
    } catch {
      onNotify('Could not copy automatically — export tokens via `npm run garmin:token`.');
    }
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
            {isBusy ? 'Syncing...' : isHero ? 'Push to Garmin + Strava' : 'Garmin + Strava'}
          </button>
        )}

        {/* Garmin Connect Button / View Link (only shown when already synced or upload token is linked) */}
        {hasGarmin ? (
          ride.garminActivityId ? (
            <a
              href={`https://connect.garmin.com/modern/activity/${ride.garminActivityId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-garmin ${btnSize}`}
            >
              <CheckCircle2 size={14} /> Garmin <ExternalLink size={13} />
            </a>
          ) : (
            <span className={`btn btn-garmin ${btnSize}`} style={{ opacity: 0.9 }}>
              <CheckCircle2 size={14} /> Garmin Synced
            </span>
          )
        ) : isGarminConnected ? (
          <button
            type="button"
            id={isHero ? 'push-highlighted-garmin' : undefined}
            className={`btn btn-garmin ${btnSize}`}
            disabled={isBusy}
            onClick={() => onUploadRide(ride, 'garmin')}
          >
            <UploadCloud size={15} />
            {isBusy && !isStravaConnected
              ? 'Syncing...'
              : isHero
                ? 'Push to Garmin'
                : 'Garmin'}
          </button>
        ) : null}

        {/* Strava Button / View Link */}
        {hasStrava ? (
          <a
            href={`https://www.strava.com/activities/${ride.stravaActivityId}`}
            target="_blank"
            rel="noopener noreferrer"
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
              ? 'Syncing...'
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
        ref={modalCardRef}
        className="modal-card"
        style={{ width: 'min(780px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
        id="history-strava-modal"
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {highlightedRide
                ? 'Workout Summary, Photo Card & Sync'
                : 'Ride History · Strava & Garmin'}
            </h2>
            <p className="modal-subtitle">
              Snap a post-ride stat photo, sync directly to Strava, or download .FIT files to upload
              to Garmin Connect.
            </p>
          </div>
          <button type="button" className="btn btn-sm" id="close-history-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Highlighted Ride Summary + Photo Overlay Studio */}
        {highlightedRide && (
          <div className="hero-ride-card">
            <div className="hero-ride-head">
              <div style={{ minWidth: 0 }}>
                <div className="hero-ride-title">{highlightedRide.title}</div>
                <div className="history-stat-chips tabular">
                  <span>{formatDuration(highlightedRide.durationSec)}</span>
                  <span>{metersToMiles(highlightedRide.distanceMeters).toFixed(2)} mi</span>
                  <span>{Math.round(highlightedRide.caloriesKcal)} kcal</span>
                </div>
              </div>
              {highlightedRide.burnPoints > 0 && (
                <div className="hero-burn-badge">
                  <Flame size={15} /> {highlightedRide.burnPoints} BURN PTS
                </div>
              )}
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

            {highlightedRide.ftpTestResult ? (
              (() => {
                const res = highlightedRide.ftpTestResult;
                const delta = res.estimatedFtpWatts - res.previousFtpWatts;
                const deltaText =
                  delta > 0 ? `+${delta}W` : delta < 0 ? `${delta}W` : 'Matches current';
                const newWkg = computeWattsPerKg(
                  res.estimatedFtpWatts,
                  highlightedRide.athleteSnapshot.weightLbs
                ).toFixed(2);
                const alreadyApplied = currentFtpWatts === res.estimatedFtpWatts;
                return (
                  <div
                    id="ftp-result-banner"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(249, 115, 22, 0.14)',
                      border: '1px solid rgba(249, 115, 22, 0.42)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <strong
                        style={{
                          fontSize: '0.84rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          color: '#fb923c',
                        }}
                      >
                        <Zap size={14} />
                        {res.isDedicatedTest
                          ? '20-Min FTP Test Result'
                          : 'New 20-Min FTP Breakthrough!'}
                      </strong>
                      <span
                        className="tabular"
                        style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}
                      >
                        20-min avg <strong>{res.avg20MinWatts}W</strong> × 95% ={' '}
                        <strong>{res.estimatedFtpWatts}W FTP</strong> ({newWkg} W/kg · {deltaText}{' '}
                        vs {res.previousFtpWatts}W)
                      </span>
                    </div>
                    {alreadyApplied ? (
                      <span
                        id="ftp-applied-badge"
                        className="btn btn-sm"
                        style={{
                          borderColor: 'rgba(34, 197, 94, 0.45)',
                          color: '#4ade80',
                          cursor: 'default',
                        }}
                      >
                        <CheckCircle2 size={14} /> FTP Set to {res.estimatedFtpWatts}W
                      </span>
                    ) : (
                      <button
                        type="button"
                        id="apply-new-ftp-btn"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          onImportAthleteStats?.({ ftpWatts: res.estimatedFtpWatts });
                          onNotify(
                            `FTP updated to ${res.estimatedFtpWatts}W (${newWkg} W/kg)! Power zones and workout targets recalculated.`
                          );
                        }}
                      >
                        <Zap size={14} /> Update My FTP to {res.estimatedFtpWatts}W
                      </button>
                    )}
                  </div>
                );
              })()
            ) : highlightedRide.workoutName === '20-Min FTP Test' ? (
              <p
                id="ftp-incomplete-note"
                style={{
                  margin: 0,
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--hairline)',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Complete at least 19–20 minutes on the <strong>20-Min FTP Test</strong> to
                auto-calculate an official FTP update (95% of your 20-min average watts).
              </p>
            ) : null}

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

            {/* Cloud Push + Photo Toggle + FIT/TCX Actions */}
            <div className="hero-ride-actions">
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
                id="download-highlighted-fit"
                className="btn btn-garmin"
                onClick={() => downloadRideFit(highlightedRide, fitPreset)}
                title={`Download Garmin .FIT file (${FIT_DEVICE_PRESETS[fitPreset].label})`}
              >
                <Download size={16} /> .FIT
              </button>

              {!isGarminConnected && !highlightedRide.garminActivityId && (
                <a
                  href="https://connect.garmin.com/modern/import-data"
                  target="_blank"
                  rel="noopener noreferrer"
                  id="open-garmin-import-link"
                  className="btn"
                  title="Open Garmin Connect Import in your browser to upload the downloaded .FIT file"
                >
                  Garmin Import <ExternalLink size={14} />
                </a>
              )}

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
              <div className="sync-status-line" role="status">
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

        {/* Saved Local Workouts — Front & Center */}
        <div className="history-section">
          <h3 className="panel-heading">Saved Local Workouts ({rides.length})</h3>
          {rides.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '10px 0' }}>
              No saved rides yet. Start a workout and tap Stop &amp; Save when you&apos;re done!
            </div>
          ) : (
            rides.map((r) => {
              const isConfirmingDelete = confirmDeleteId === r.id;
              return (
                <div className="history-item history-ride-card" key={r.id}>
                  <div className="history-ride-head">
                    <div className="history-ride-meta">
                      <div className="history-ride-title">{r.title}</div>
                      {r.burnPoints > 0 && (
                        <div className="history-ride-burn">
                          <Flame size={12} /> {r.burnPoints} Burn pts
                        </div>
                      )}
                      <div className="history-stat-chips tabular">
                        <span>{new Date(r.startedAtIso).toLocaleDateString()}</span>
                        <span>{formatDuration(r.durationSec)}</span>
                        <span>
                          {r.avgWatts}W ({r.avgWkg.toFixed(2)} W/kg)
                        </span>
                        {r.avgHr > 0 && <span>{r.avgHr} bpm</span>}
                        <span>{Math.round(r.caloriesKcal)} kcal</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`btn btn-sm btn-danger history-delete-btn ${
                        isConfirmingDelete ? 'confirming' : ''
                      }`}
                      onClick={() => {
                        if (isConfirmingDelete) {
                          setConfirmDeleteId(null);
                          onDeleteRide(r.id);
                        } else {
                          setConfirmDeleteId(r.id);
                          window.setTimeout(() => {
                            setConfirmDeleteId((curr) => (curr === r.id ? null : curr));
                          }, 4000);
                        }
                      }}
                      title={isConfirmingDelete ? 'Tap again to permanently delete' : 'Delete ride'}
                      aria-label={isConfirmingDelete ? 'Confirm delete ride' : 'Delete ride'}
                    >
                      <Trash2 size={14} />
                      {isConfirmingDelete && <span>Delete?</span>}
                    </button>
                  </div>

                  <div className="history-ride-actions">
                    {renderSyncButtonsForRide(r, false)}

                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        onSelectHighlightedRide(r);
                        setShowPhotoStudio(true);
                        modalCardRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
                      }}
                      title="Create stat overlay photo or edit title & notes"
                    >
                      <Camera size={14} /> Photo
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => downloadRideFit(r, fitPreset)}
                      title={`Download .FIT file (${FIT_DEVICE_PRESETS[fitPreset].label})`}
                    >
                      <Download size={14} /> .FIT
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onDownloadTcx(r)}
                      title="Download .TCX file"
                    >
                      <Download size={14} /> .TCX
                    </button>
                  </div>

                  {uploadingRideId === r.id && uploadStatusText && (
                    <div className="sync-status-line" role="status">
                      {uploadStatusText}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Cloud Sync & Export Settings */}
        <div className="history-section">
          <h3 className="panel-heading">Cloud Sync &amp; Export Settings</h3>

          {/* Strava OAuth Configuration Box */}
          <div className="zone-preview-table">
            <div className="settings-card-head">
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
                id="strava-setup-panel"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginTop: '10px',
                }}
              >
                <div className="garmin-callout-box">
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fb923c' }}>
                    1-Click Strava Sync (Use Your Own Free Personal API Key)
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Strava caps shared free apps to a small number of connected athletes. Creating
                    your own free Personal API app (~2 minutes, stored only in this browser) gives
                    you reliable 1-click uploads with no shared-app limit:
                  </p>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    1. Open{' '}
                    <a
                      href="https://www.strava.com/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#fb923c' }}
                    >
                      strava.com/settings/api
                    </a>{' '}
                    and set <strong>Authorization Callback Domain</strong> to{' '}
                    <code>{callbackDomain}</code>.<br />
                    2. Paste <strong>both</strong> your <strong>Client ID</strong> and{' '}
                    <strong>Client Secret</strong> below and tap{' '}
                    <strong>Connect with Strava</strong>.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <a
                      href="/jbf-strava-icon.png"
                      download="jbf-strava-icon.png"
                      id="download-strava-app-icon"
                      className="btn btn-sm"
                    >
                      <Download size={14} /> Download App Icon (.PNG · 256×256)
                    </a>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      Upload this PNG on Strava&apos;s &ldquo;Update App Icon&rdquo; page (SVGs are
                      rejected).
                    </span>
                  </div>

                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="strava-client-id">Your Strava Client ID</label>
                      <input
                        id="strava-client-id"
                        type="text"
                        placeholder="e.g. 128491"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="strava-client-secret">Your Strava Client Secret</label>
                      <input
                        id="strava-client-secret"
                        type="password"
                        placeholder="Paste your personal Client Secret"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      id="authorize-strava-btn"
                      className="btn btn-strava btn-sm"
                      disabled={!clientId.trim() || !clientSecret.trim()}
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
                    {Boolean(clientId.trim()) !== Boolean(clientSecret.trim()) && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Enter both your Client ID and Client Secret to connect.
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--hairline)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>
                    <strong>Prefer no API setup?</strong> Tap <strong>.FIT</strong> or{' '}
                    <strong>.TCX</strong> on any saved ride and upload it straight to Strava.
                  </span>
                  <a
                    href="https://www.strava.com/upload/select"
                    target="_blank"
                    rel="noopener noreferrer"
                    id="open-strava-manual-upload-link"
                    className="btn btn-sm"
                  >
                    Open Strava Upload <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Garmin Connect Box */}
          <div className="zone-preview-table">
            <div className="settings-card-head">
              <div>
                <strong style={{ fontSize: '0.86rem' }}>
                  Garmin Connect:{' '}
                  {isGarminConnected ? (
                    <span style={{ color: '#0EA5E9' }}>
                      Upload Ready (
                      {(garminConfig.athleteName &&
                      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                        garminConfig.athleteName.trim()
                      )
                        ? garminConfig.athleteName
                        : garminConfig.email) || 'Linked'}
                      )
                    </span>
                  ) : isPersonalApiLinked ? (
                    <span style={{ color: '#12B981' }}>
                      Profile &amp; History Synced (
                      {garminConfig.athleteName &&
                      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                        garminConfig.athleteName.trim()
                      )
                        ? garminConfig.athleteName
                        : 'Personal API'}
                      )
                    </span>
                  ) : (
                    <span style={{ color: '#38BDF8' }}>Ready via .FIT Upload</span>
                  )}
                </strong>
                {isGarminConnected && isPersonalApiLinked && (
                  <span
                    style={{
                      marginLeft: '8px',
                      fontSize: '0.72rem',
                      color: '#12B981',
                      fontWeight: 600,
                    }}
                  >
                    · Personal API Linked
                  </span>
                )}
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
                  gap: '12px',
                  marginTop: '10px',
                }}
              >
                {/* Section A: Recommended Mobile & Desktop .FIT Upload (Zero Passwords / Zero Rate Limits) */}
                <div className="garmin-callout-box">
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38BDF8' }}>
                    <ShieldCheck size={13} style={{ verticalAlign: '-2px', marginRight: '5px' }} />
                    Recommended: Upload Workouts via .FIT (Works on Phone &amp; Desktop)
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Tap <strong>.FIT</strong> on any workout above, then open Garmin Connect Import
                    in your browser to upload it with full Power, Cadence, Heart Rate &amp; Garmin
                    Training Load — no password sharing and zero cloud rate limits.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <a
                      href="https://connect.garmin.com/modern/import-data"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-garmin btn-sm"
                    >
                      Open Garmin Connect Import <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                {/* Section B: Official Garmin Personal API (GCDC_... · Profile & History, Zero Rate Limits) */}
                <div className="garmin-callout-box garmin-callout-green">
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34D399' }}>
                    <KeyRound size={13} style={{ verticalAlign: '-2px', marginRight: '5px' }} />
                    Garmin Personal API Key (Profile &amp; History Sync · No Rate Limits)
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Uses Garmin&apos;s official read-only Personal API (<code>GCDC_...</code>) to
                    import your weight, height, Max HR, FTP, and recent Garmin activities without
                    passwords.
                    {hasServerPersonalKey &&
                      ' Server GARMIN_PERSONAL_API_KEY detected in environment — leave blank to use it or override below.'}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                    }}
                  >
                    <div className="field" style={{ flex: '1 1 240px' }}>
                      <label htmlFor="garmin-personal-key-input">
                        Garmin Personal API Key (<code>GCDC_...</code>)
                      </label>
                      <input
                        id="garmin-personal-key-input"
                        type="password"
                        placeholder={
                          hasServerPersonalKey
                            ? 'Using server GARMIN_PERSONAL_API_KEY (or paste override)'
                            : 'GCDC_...'
                        }
                        value={garminPersonalKey}
                        onChange={(e) => setGarminPersonalKey(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      id="sync-garmin-personal-api-btn"
                      className="btn btn-sm"
                      disabled={
                        garminPersonalBusy || (!garminPersonalKey.trim() && !hasServerPersonalKey)
                      }
                      onClick={() => void handleSyncPersonalApi()}
                    >
                      <RefreshCw size={14} />
                      {garminPersonalBusy ? 'Syncing...' : 'Sync Profile & Garmin History'}
                    </button>
                  </div>
                </div>

                {/* Section C: Optional Advanced Desktop Session Token (collapsed by default) */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    id="toggle-garmin-token-paste-btn"
                    className="btn btn-sm"
                    onClick={() => setShowGarminTokenPaste((v) => !v)}
                  >
                    {showGarminTokenPaste
                      ? 'Hide Advanced Token Paste'
                      : 'Advanced: Desktop Session Token'}
                  </button>
                  {isGarminConnected && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void handleCopyGarminTokens()}
                    >
                      <Copy size={13} /> Copy Session Token
                    </button>
                  )}
                  {(isGarminConnected || isPersonalApiLinked) && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleDisconnectGarmin}
                    >
                      Disconnect Garmin
                    </button>
                  )}
                </div>

                {showGarminTokenPaste && (
                  <div className="garmin-callout-box">
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Desktop power users can enable 1-click Garmin uploads by running{' '}
                      <code>npm run garmin:token</code> on a home computer and pasting the
                      resulting single-line JSON below:
                    </p>
                    <div className="field">
                      <label htmlFor="garmin-token-json-input">Garmin Session Token JSON</label>
                      <textarea
                        id="garmin-token-json-input"
                        rows={3}
                        placeholder='{"oauth1":...,"oauth2":...}'
                        value={garminTokenJson}
                        onChange={(e) => setGarminTokenJson(e.target.value)}
                        style={{
                          width: '100%',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          background: 'var(--bg-canvas)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--hairline-strong)',
                          borderRadius: '8px',
                          padding: '8px',
                        }}
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        id="verify-garmin-token-btn"
                        className="btn btn-garmin btn-sm"
                        disabled={garminAuthBusy || !garminTokenJson.trim()}
                        onClick={() => void handleVerifyGarminTokens()}
                      >
                        {garminAuthBusy ? 'Verifying...' : 'Verify & Link Session Token'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FIT Export & Existing TCX -> FIT Converter */}
          <div className="zone-preview-table fit-preset-card">
            <div className="field" style={{ flex: '1 1 240px' }}>
              <label htmlFor="fit-device-preset-select">Garmin .FIT Device Header</label>
              <select
                id="fit-device-preset-select"
                value={fitPreset}
                onChange={(e) => handleSelectFitPreset(e.target.value as FitDevicePresetId)}
              >
                {(Object.keys(FIT_DEVICE_PRESETS) as FitDevicePresetId[]).map((key) => (
                  <option key={key} value={key}>
                    {FIT_DEVICE_PRESETS[key].label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {FIT_DEVICE_PRESETS[fitPreset].description}
              </span>
            </div>

            <div className="fit-convert-wrap">
              <input
                ref={tcxFileInputRef}
                id="convert-tcx-file-input"
                type="file"
                accept=".tcx,.xml"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleConvertTcxUpload(file);
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                id="convert-tcx-to-fit-btn"
                className="btn btn-sm"
                onClick={() => tcxFileInputRef.current?.click()}
                title="Convert any existing .TCX ride file into a Garmin .FIT file locally in your browser"
              >
                <FileUp size={14} /> Convert .TCX → .FIT
              </button>
            </div>
          </div>
        </div>

        {/* Recent Garmin Connect History (Synced via Official Garmin Personal API) */}
        {garminConfig.recentActivities && garminConfig.recentActivities.length > 0 && (
          <div className="history-section">
            <h3 className="panel-heading">
              Recent Garmin Connect Activities ({garminConfig.recentActivities.length})
            </h3>
            {garminConfig.recentActivities.map((act) => (
              <div className="history-item history-garmin-card" key={act.activityId}>
                <div className="history-ride-meta">
                  <div className="history-ride-title">{act.name}</div>
                  <div className="history-garmin-type">{act.typeKey.replace(/_/g, ' ')}</div>
                  <div className="history-stat-chips tabular">
                    <span>
                      {act.startedAtLocal
                        ? new Date(act.startedAtLocal.replace(' ', 'T')).toLocaleDateString()
                        : 'Recent'}
                    </span>
                    <span>{formatDuration(act.durationSec)}</span>
                    <span>{metersToMiles(act.distanceMeters).toFixed(2)} mi</span>
                    {act.avgWatts && <span>{act.avgWatts}W avg</span>}
                    {act.avgHr && <span>{act.avgHr} bpm</span>}
                    {act.caloriesKcal > 0 && <span>{act.caloriesKcal} kcal</span>}
                  </div>
                </div>
                <a
                  href={`https://connect.garmin.com/modern/activity/${act.activityId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-garmin btn-sm history-garmin-open-btn"
                >
                  Open in Garmin <ExternalLink size={13} />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
