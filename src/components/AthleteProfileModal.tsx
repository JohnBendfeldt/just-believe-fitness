import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { AthleteProfile, PowerCurveType } from '../types/fitness';
import {
  DEFAULT_ATHLETE_PROFILE,
  computeWattsPerKg,
  feetInchesToCm,
  formatPaceSeconds,
  formatRowingSplit,
  getEffectiveRowFtpWatts,
  getEffectiveRunThresholdPaceSec,
  getHrZones,
  getPowerZones,
  lbsToKg,
  rowingWattsToSplitSecPer500m,
} from '../utils/zones';

interface ClampedNumberInputProps {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  ariaLabel?: string;
  onCommit: (next: number) => void;
}

// Keeps the raw text while typing so clearing ("") or partial entries ("5" on the way to "52",
// or "0." on the way to "0.95") are never clamped or overwritten mid-keystroke.
// Commits live when within [min, max], and clamps only on blur / Enter.
function ClampedNumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  ariaLabel,
  onCommit,
}: ClampedNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [lastPropValue, setLastPropValue] = useState<number>(value);

  const roundToPrecision = (n: number): number => {
    if (decimals <= 0) return Math.round(n);
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
  };

  if (value !== lastPropValue) {
    setLastPropValue(value);
    const draftNum = draft !== null && draft.trim() !== '' ? Number(draft) : NaN;
    if (!Number.isFinite(draftNum) || roundToPrecision(draftNum) !== value) {
      setDraft(null);
    }
  }

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, roundToPrecision(parsed)));
      onCommit(clamped);
    }
    setDraft(null);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onChange={(e) => {
        const cleaned = e.target.value.replace(decimals > 0 ? /[^0-9.]/g : /[^0-9]/g, '');
        setDraft(cleaned);
        const parsed = Number(cleaned);
        if (cleaned.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
          onCommit(roundToPrecision(parsed));
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setDraft(null);
          onCommit(Math.min(max, roundToPrecision(value + step)));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setDraft(null);
          onCommit(Math.max(min, roundToPrecision(value - step)));
        }
      }}
    />
  );
}

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
  const runThresholdSec = getEffectiveRunThresholdPaceSec(profile);
  const runThrMin = Math.floor(runThresholdSec / 60);
  const runThrSec = runThresholdSec % 60;
  const rowFtpWatts = getEffectiveRowFtpWatts(profile);
  const rowFtpSplit = formatRowingSplit(rowingWattsToSplitSecPer500m(rowFtpWatts));

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
              All power gauges, pace &amp; split targets, heart rate burn zones, W/kg, and physics
              scale to your profile. Starter defaults (150W FTP, 9:00/mi Run Thr, 180 Max HR) are
              paced conservatively so new athletes don&apos;t overexert.
            </p>
          </div>
          <button type="button" className="btn btn-sm" id="close-athlete-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="athlete-name-input">Athlete Display Name</label>
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
              <ClampedNumberInput
                id="athlete-height-feet"
                min={4}
                max={7}
                value={profile.heightFeet}
                ariaLabel="Height feet"
                onCommit={(n) => updateField('heightFeet', n)}
              />
              <ClampedNumberInput
                id="athlete-height-inches"
                min={0}
                max={11}
                value={profile.heightInches}
                ariaLabel="Height inches"
                onCommit={(n) => updateField('heightInches', n)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="athlete-weight-lbs">Weight (lbs) · {weightKg} kg</label>
            <ClampedNumberInput
              id="athlete-weight-lbs"
              min={75}
              max={400}
              value={profile.weightLbs}
              onCommit={(n) => updateField('weightLbs', n)}
            />
          </div>

          <div className="field">
            <label htmlFor="athlete-ftp-watts">
              Bike FTP (Watts) · {thresholdWkg} W/kg
            </label>
            <ClampedNumberInput
              id="athlete-ftp-watts"
              min={60}
              max={550}
              value={profile.ftpWatts}
              onCommit={(n) => updateField('ftpWatts', n)}
            />
          </div>

          <div className="field">
            <label>
              Run Threshold Pace (min / sec) · {formatPaceSeconds(runThresholdSec)}/mi
            </label>
            <div className="height-inline">
              <ClampedNumberInput
                id="athlete-run-pace-min"
                min={4}
                max={18}
                value={runThrMin}
                ariaLabel="Run threshold pace minutes"
                onCommit={(m) => updateField('runThresholdPaceSecPerMile', m * 60 + runThrSec)}
              />
              <ClampedNumberInput
                id="athlete-run-pace-sec"
                min={0}
                max={59}
                value={runThrSec}
                ariaLabel="Run threshold pace seconds"
                onCommit={(s) => updateField('runThresholdPaceSecPerMile', runThrMin * 60 + s)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="athlete-row-ftp-watts">
              Row FTP (Watts) · {rowFtpSplit} /500m
            </label>
            <ClampedNumberInput
              id="athlete-row-ftp-watts"
              min={60}
              max={550}
              value={rowFtpWatts}
              onCommit={(n) => updateField('rowFtpWatts', n)}
            />
          </div>

          <div className="field">
            <label htmlFor="athlete-max-hr">Max Heart Rate (BPM)</label>
            <ClampedNumberInput
              id="athlete-max-hr"
              min={120}
              max={230}
              value={profile.maxHrBpm}
              onCommit={(n) => updateField('maxHrBpm', n)}
            />
          </div>

          <div className="field">
            <label htmlFor="athlete-resting-hr">Resting Heart Rate (BPM)</label>
            <ClampedNumberInput
              id="athlete-resting-hr"
              min={25}
              max={130}
              value={profile.restingHrBpm}
              onCommit={(n) => updateField('restingHrBpm', n)}
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
            <ClampedNumberInput
              id="athlete-watt-gain"
              step={0.05}
              decimals={2}
              min={0.5}
              max={1.5}
              value={profile.wattGain}
              onCommit={(n) => updateField('wattGain', n)}
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
