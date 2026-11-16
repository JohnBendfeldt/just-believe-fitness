import { useState } from 'react';
import {
  Bluetooth,
  CheckCircle2,
  Download,
  ExternalLink,
  Flame,
  Heart,
  Play,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { LiveTelemetry, SavedRide, StravaConfig, ZoneId } from '../types/fitness';
import { ZONE_PALETTE, formatDuration, metersToMiles } from '../utils/zones';
import { buildStravaAuthorizeUrl } from '../services/strava';

interface DeviceModalProps {
  isOpen: boolean;
  telemetry: LiveTelemetry;
  bleSupported: boolean;
  onConnectBike: () => void;
  onDisconnectBike: () => void;
  onConnectHr: () => void;
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
              Pairs directly with your Echelon EX-3 and Garmin Watch/Strap — no middleman bridge app
              to drop out.
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

        {/* Echelon EX-3 Card */}
        <div className="history-item">
          <div style={{ flex: '1 1 260px' }}>
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
              Echelon EX-3 Bike ({telemetry.bikeName || 'Not Paired'})
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Plug in the EX-3 so the blue light flashes, and make sure the Echelon Fit app is
              force-closed so the bike is free to pair directly.
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
            <button
              type="button"
              id="connect-bike-btn"
              className="btn btn-primary"
              disabled={!bleSupported || telemetry.bikeStatus === 'connecting'}
              onClick={onConnectBike}
            >
              <Bluetooth size={16} />
              {telemetry.bikeStatus === 'connecting' ? 'Scanning...' : 'Pair Echelon EX-3'}
            </button>
          )}
        </div>

        {/* Garmin Heart Rate Card */}
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
              Garmin Watch / HRM ({telemetry.hrName || 'Not Paired'})
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              On your Garmin watch: open <strong>Settings → Sensors / Wrist Heart Rate → Broadcast Heart Rate</strong> and press Start before tapping Pair.
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
            <button
              type="button"
              id="connect-hr-btn"
              className="btn btn-primary"
              disabled={!bleSupported || telemetry.hrStatus === 'connecting'}
              onClick={onConnectHr}
            >
              <Heart size={16} />
              {telemetry.hrStatus === 'connecting' ? 'Scanning...' : 'Pair Garmin HR'}
            </button>
          )}
        </div>

        {/* Interactive Demo Simulator */}
        <div className="history-item">
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontWeight: 700 }}>Interactive Ride Simulator</div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Stream realistic EX-3 resistance, cadence, watts, and Garmin heart rate off-bike to
              preview color shifts, Burn Points, PiP HUD, and Strava export.
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

interface HistoryAndStravaModalProps {
  isOpen: boolean;
  highlightedRide: SavedRide | null;
  rides: SavedRide[];
  stravaConfig: StravaConfig;
  uploadingRideId: string | null;
  uploadStatusText: string;
  onSaveStravaConfig: (next: StravaConfig) => void;
  onUploadRide: (ride: SavedRide) => void;
  onDownloadTcx: (ride: SavedRide) => void;
  onDeleteRide: (id: string) => void;
  onClose: () => void;
}

export function HistoryAndStravaModal({
  isOpen,
  highlightedRide,
  rides,
  stravaConfig,
  uploadingRideId,
  uploadStatusText,
  onSaveStravaConfig,
  onUploadRide,
  onDownloadTcx,
  onDeleteRide,
  onClose,
}: HistoryAndStravaModalProps) {
  const [clientId, setClientId] = useState(stravaConfig.clientId);
  const [clientSecret, setClientSecret] = useState(stravaConfig.clientSecret);
  const [showStravaSetup, setShowStravaSetup] = useState(!stravaConfig.accessToken);

  if (!isOpen) return null;

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

  const orderedZones: ZoneId[] = [5, 4, 3, 2, 1];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        style={{ width: 'min(720px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
        id="history-strava-modal"
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {highlightedRide ? 'Workout Summary & Strava Sync' : 'Ride History & Strava Sync'}
            </h2>
            <p className="modal-subtitle">
              Workouts save locally with 1-second Power, Cadence, and HR streams — download .TCX or
              push straight to Strava.
            </p>
          </div>
          <button type="button" className="btn btn-sm" id="close-history-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Highlighted Just-Completed Ride Card */}
        {highlightedRide && (
          <div
            style={{
              background: 'rgba(249, 115, 22, 0.09)',
              border: '1px solid rgba(249, 115, 22, 0.32)',
              borderRadius: '14px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
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

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {highlightedRide.stravaActivityId ? (
                <a
                  href={`https://www.strava.com/activities/${highlightedRide.stravaActivityId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-strava"
                >
                  <CheckCircle2 size={16} /> View on Strava <ExternalLink size={14} />
                </a>
              ) : (
                <button
                  type="button"
                  id="push-highlighted-strava"
                  className="btn btn-strava"
                  disabled={uploadingRideId === highlightedRide.id}
                  onClick={() => onUploadRide(highlightedRide)}
                >
                  <UploadCloud size={16} />
                  {uploadingRideId === highlightedRide.id
                    ? uploadStatusText || 'Uploading...'
                    : 'Push to Strava'}
                </button>
              )}

              <button
                type="button"
                id="download-highlighted-tcx"
                className="btn"
                onClick={() => onDownloadTcx(highlightedRide)}
              >
                <Download size={16} /> Download .TCX
              </button>
            </div>
          </div>
        )}

        {/* Strava OAuth Configuration Box */}
        <div className="zone-preview-table">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div>
              <strong style={{ fontSize: '0.86rem' }}>
                Strava Connection:{' '}
                {stravaConfig.accessToken ? (
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
              {showStravaSetup ? 'Hide API Settings' : 'Configure Strava'}
            </button>
          </div>

          {showStravaSetup && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
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
                2. Paste your Client ID &amp; Client Secret below (stored only in this browser) and
                tap <strong>Connect with Strava</strong>.
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
                {stravaConfig.accessToken && (
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

        {/* Saved Ride List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 className="panel-heading">Saved Local Workouts ({rides.length})</h3>
          {rides.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '12px 0' }}>
              No saved rides yet. Start a workout and tap Finish &amp; Save when you&apos;re done!
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
                    style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}
                  >
                    {new Date(r.startedAtIso).toLocaleDateString()} · {formatDuration(r.durationSec)}{' '}
                    · Avg {r.avgWatts}W ({r.avgWkg.toFixed(2)} W/kg) ·{' '}
                    {r.avgHr > 0 ? `${r.avgHr} bpm · ` : ''}
                    {Math.round(r.caloriesKcal)} kcal
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {r.stravaActivityId ? (
                    <a
                      href={`https://www.strava.com/activities/${r.stravaActivityId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-strava"
                    >
                      Strava <ExternalLink size={13} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-strava"
                      disabled={uploadingRideId === r.id}
                      onClick={() => onUploadRide(r)}
                    >
                      <UploadCloud size={14} />
                      {uploadingRideId === r.id ? 'Uploading...' : 'Strava'}
                    </button>
                  )}

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
