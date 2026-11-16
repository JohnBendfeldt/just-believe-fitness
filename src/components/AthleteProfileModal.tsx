import { RotateCcw, X } from 'lucide-react';
import type { AthleteProfile, PowerCurveType } from '../types/fitness';
import {
  DEFAULT_ATHLETE_PROFILE,
  computeWattsPerKg,
  feetInchesToCm,
  getHrZones,
  getPowerZones,
  lbsToKg,
} from '../utils/zones';

interface AthleteProfileModalProps {
  isOpen: boolean;
  profile: AthleteProfile;
  onChangeProfile: (next: AthleteProfile) => void;
  onClose: () => void;
}

export function AthleteProfileModal({
  isOpen,
  profile,
  onChangeProfile,
  onClose,
}: AthleteProfileModalProps) {
  if (!isOpen) return null;

  const hrZones = getHrZones(profile.maxHrBpm);
  const powerZones = getPowerZones(profile.ftpWatts);
  const thresholdWkg = computeWattsPerKg(profile.ftpWatts, profile.weightLbs).toFixed(2);
  const weightKg = lbsToKg(profile.weightLbs).toFixed(1);
  const heightCm = Math.round(feetInchesToCm(profile.heightFeet, profile.heightInches));

  const updateField = <K extends keyof AthleteProfile>(key: K, val: AthleteProfile[K]) => {
    onChangeProfile({
      ...profile,
      [key]: val,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} id="athlete-profile-modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Athlete Stats &amp; Zone Orientation</h2>
            <p className="modal-subtitle">
              All power gauges, heart rate burn zones, workout targets, W/kg, and speed physics
              scale to your profile. Starter defaults (150W FTP, 180 Max HR — roughly{' '}
              <code>220 − age</code>) are paced conservatively so new riders don&apos;t overexert.
            </p>
          </div>
          <button type="button" className="btn btn-sm" id="close-athlete-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="athlete-name-input">Rider Display Name</label>
            <input
              id="athlete-name-input"
              type="text"
              value={profile.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Height (ft / in) · {heightCm} cm</label>
            <div className="height-inline">
              <input
                id="athlete-height-feet"
                type="number"
                min={4}
                max={7}
                value={profile.heightFeet}
                onChange={(e) =>
                  updateField(
                    'heightFeet',
                    Math.max(
                      4,
                      Math.min(7, Number(e.target.value) || DEFAULT_ATHLETE_PROFILE.heightFeet)
                    )
                  )
                }
                aria-label="Height feet"
              />
              <input
                id="athlete-height-inches"
                type="number"
                min={0}
                max={11}
                value={profile.heightInches}
                onChange={(e) =>
                  updateField(
                    'heightInches',
                    Math.max(0, Math.min(11, Number(e.target.value) || 0))
                  )
                }
                aria-label="Height inches"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="athlete-weight-lbs">Weight (lbs) · {weightKg} kg</label>
            <input
              id="athlete-weight-lbs"
              type="number"
              min={75}
              max={400}
              value={profile.weightLbs}
              onChange={(e) =>
                updateField(
                  'weightLbs',
                  Math.max(
                    75,
                    Math.min(400, Number(e.target.value) || DEFAULT_ATHLETE_PROFILE.weightLbs)
                  )
                )
              }
            />
          </div>

          <div className="field">
            <label htmlFor="athlete-ftp-watts">
              FTP (Watts) · {thresholdWkg} W/kg
            </label>
            <input
              id="athlete-ftp-watts"
              type="number"
              min={60}
              max={550}
              value={profile.ftpWatts}
              onChange={(e) =>
                updateField(
                  'ftpWatts',
                  Math.max(
                    60,
                    Math.min(550, Number(e.target.value) || DEFAULT_ATHLETE_PROFILE.ftpWatts)
                  )
                )
              }
            />
          </div>

          <div className="field">
            <label htmlFor="athlete-max-hr">Max Heart Rate (BPM)</label>
            <input
              id="athlete-max-hr"
              type="number"
              min={120}
              max={230}
              value={profile.maxHrBpm}
              onChange={(e) =>
                updateField(
                  'maxHrBpm',
                  Math.max(
                    120,
                    Math.min(230, Number(e.target.value) || DEFAULT_ATHLETE_PROFILE.maxHrBpm)
                  )
                )
              }
            />
          </div>

          <div className="field">
            <label htmlFor="athlete-resting-hr">Resting Heart Rate (BPM)</label>
            <input
              id="athlete-resting-hr"
              type="number"
              min={32}
              max={105}
              value={profile.restingHrBpm}
              onChange={(e) =>
                updateField(
                  'restingHrBpm',
                  Math.max(
                    32,
                    Math.min(105, Number(e.target.value) || DEFAULT_ATHLETE_PROFILE.restingHrBpm)
                  )
                )
              }
            />
          </div>

          <div className="field">
            <label htmlFor="athlete-power-curve">Bike Power Curve (Non-Power-Meter)</label>
            <select
              id="athlete-power-curve"
              value={profile.powerCurve}
              onChange={(e) => updateField('powerCurve', e.target.value as PowerCurveType)}
            >
              <option value="auto">Auto-Detect by Paired Bike (Recommended)</option>
              <option value="ex3-vector">Echelon EX-3 / EX-4s / EX-5 / EX-8s (Heavy Flywheel)</option>
              <option value="sport-compact">
                Echelon Connect Sport / EX-15 / Prime / GT+ (Compact)
              </option>
              <option value="echelon-official">Echelon App Classic Freeride Curve</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="athlete-watt-gain">
              Watt Calibration Scale ({profile.wattGain.toFixed(2)}x)
            </label>
            <input
              id="athlete-watt-gain"
              type="number"
              step={0.05}
              min={0.5}
              max={1.5}
              value={profile.wattGain}
              onChange={(e) =>
                updateField(
                  'wattGain',
                  Math.max(0.5, Math.min(1.5, Number(e.target.value) || 1.0))
                )
              }
            />
          </div>
        </div>

        <div className="zone-preview-table">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.74rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            <span>LIVE CALIBRATED ZONES</span>
            <span>
              Threshold: {profile.ftpWatts}W ({thresholdWkg} W/kg) · Burn HR ≥{' '}
              {hrZones[3].minValue} bpm
            </span>
          </div>

          {powerZones.map((pz, idx) => {
            const hz = hrZones[idx];
            return (
              <div className="zone-preview-row tabular" key={pz.zone}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontWeight: 700 }}>
                  <span className="zone-swatch" style={{ backgroundColor: pz.color }} />
                  Z{pz.zone} {pz.key.toUpperCase()}
                </span>
                <span>
                  Power: {pz.minValue}
                  {pz.zone < 5 ? `–${pz.maxValue} W` : '+ W'}
                </span>
                <span>
                  HR: {hz.minValue}
                  {hz.zone < 5 ? `–${hz.maxValue} bpm` : `–${profile.maxHrBpm}+ bpm`}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            id="reset-athlete-defaults"
            onClick={() => onChangeProfile({ ...DEFAULT_ATHLETE_PROFILE })}
          >
            <RotateCcw size={14} /> Reset to Starter Defaults (5&apos;8&quot;, 165#, 150W, 180 HR)
          </button>
          <button type="button" className="btn btn-primary" id="save-athlete-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
