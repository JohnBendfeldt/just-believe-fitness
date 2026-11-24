import { useEffect, useRef, useState } from 'react';
import type { AthleteProfile, SportMode, TrackPoint, ZoneId } from '../types/fitness';
import { ZoneDistributionList } from './ZoneDistributionList';
import {
  ZONE_PALETTE,
  getEffectiveRowFtpWatts,
  getHrZones,
  getPowerZones,
  resolveZone,
} from '../utils/zones';

interface LiveZoneGraphProps {
  points: TrackPoint[];
  profile: AthleteProfile;
  sport?: SportMode;
  hrZoneSeconds: Record<ZoneId, number>;
  powerZoneSeconds: Record<ZoneId, number>;
  hasHrStream: boolean;
}

type GraphMode = 'combined' | 'hr' | 'power';

export function LiveZoneGraph({
  points,
  profile,
  sport = 'cycling',
  hrZoneSeconds,
  powerZoneSeconds,
  hasHrStream,
}: LiveZoneGraphProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<GraphMode>('combined');
  const [canvasWidth, setCanvasWidth] = useState<number>(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (nextWidth > 0) {
        setCanvasWidth(nextWidth);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(240, canvasWidth || Math.floor(rect.width));
    const height = Math.max(136, Math.floor(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const effFtp = sport === 'rowing' ? getEffectiveRowFtpWatts(profile) : profile.ftpWatts;
    const powerZones = getPowerZones(effFtp);
    const hrZones = getHrZones(profile.maxHrBpm);

    // Show most recent 240 seconds (4 minutes) of high-resolution bars
    const windowPoints = points.slice(-240);
    const padX = 10;
    const padTop = 14;
    const padBottom = 16;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;

    // Subtle horizontal reference lines (FTP & Burn Zone threshold)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const maxPowerScale = Math.max(
      effFtp * 1.45,
      ...windowPoints.map((p) => p.powerWatts),
      300
    );

    if (mode !== 'hr') {
      const ftpY = padTop + plotH * (1 - effFtp / maxPowerScale);
      ctx.beginPath();
      ctx.moveTo(padX, ftpY);
      ctx.lineTo(width - padX, ftpY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
      ctx.font = '600 10px JetBrains Mono, monospace';
      const refLabel =
        sport === 'rowing'
          ? `ROW FTP ${effFtp}W`
          : sport === 'running'
            ? `RUN POWER`
            : `FTP ${effFtp}W`;
      ctx.fillText(refLabel, padX + 4, Math.max(11, ftpY - 4));
    } else {
      const burnHr = Math.round(profile.maxHrBpm * 0.84);
      const minHr = 70;
      const maxHr = Math.max(profile.maxHrBpm + 6, 200);
      const burnY = padTop + plotH * (1 - (burnHr - minHr) / (maxHr - minHr));
      ctx.beginPath();
      ctx.moveTo(padX, burnY);
      ctx.lineTo(width - padX, burnY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.88)';
      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.fillText(`BURN ${burnHr} BPM`, padX + 4, Math.max(11, burnY - 4));
    }

    if (windowPoints.length === 0) {
      ctx.restore();
      return;
    }

    const slots = Math.max(60, windowPoints.length);
    const stepX = plotW / slots;

    // 1. Draw JBF 5-zone color-coded Power/Pace Effort Bars (in 'combined' or 'power' mode)
    if (mode === 'combined' || mode === 'power') {
      const barW = Math.max(1.5, stepX - 1);
      windowPoints.forEach((pt, idx) => {
        const barColor =
          sport === 'running'
            ? ZONE_PALETTE[pt.powerZone].color
            : resolveZone(pt.powerWatts, powerZones).color;
        const ratio = Math.min(1, Math.max(0.02, pt.powerWatts / maxPowerScale));
        const bh = ratio * plotH;
        const bx = padX + idx * stepX;
        const by = padTop + plotH - bh;
        ctx.fillStyle = barColor;
        ctx.globalAlpha = mode === 'combined' ? 0.78 : 0.92;
        ctx.fillRect(bx, by, barW, bh);
      });
      ctx.globalAlpha = 1;
    }

    // 2. Draw Garmin-style color-coded Heart Rate Zone Graph
    if (mode === 'hr' || mode === 'combined') {
      const minHr = 70;
      const maxHr = Math.max(profile.maxHrBpm + 6, ...windowPoints.map((p) => p.heartRateBpm), 195);

      if (mode === 'hr') {
        // Color-coded vertical HR zone columns just like Garmin Connect HR Zone Charts
        const barW = Math.max(1.5, stepX - 0.8);
        windowPoints.forEach((pt, idx) => {
          if (pt.heartRateBpm <= 0) return;
          const z = resolveZone(pt.heartRateBpm, hrZones);
          const ratio = Math.min(1, Math.max(0.04, (pt.heartRateBpm - minHr) / (maxHr - minHr)));
          const bh = ratio * plotH;
          const bx = padX + idx * stepX;
          const by = padTop + plotH - bh;
          ctx.fillStyle = z.color;
          ctx.globalAlpha = 0.88;
          ctx.fillRect(bx, by, barW, bh);
        });
        ctx.globalAlpha = 1;
      } else {
        // Crisp elevated HR trace overlaid on Power bars
        ctx.lineWidth = 2.5;
        for (let i = 1; i < windowPoints.length; i++) {
          const prev = windowPoints[i - 1];
          const curr = windowPoints[i];
          if (prev.heartRateBpm <= 0 || curr.heartRateBpm <= 0) continue;
          const x1 = padX + (i - 1) * stepX + stepX / 2;
          const y1 =
            padTop +
            plotH * (1 - Math.max(0, (prev.heartRateBpm - minHr) / (maxHr - minHr)));
          const x2 = padX + i * stepX + stepX / 2;
          const y2 =
            padTop +
            plotH * (1 - Math.max(0, (curr.heartRateBpm - minHr) / (maxHr - minHr)));

          const z = resolveZone(curr.heartRateBpm, hrZones);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3.6;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          ctx.strokeStyle = z.color;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [points, profile, sport, mode, canvasWidth]);

  const activeZoneTotals = hasHrStream ? hrZoneSeconds : powerZoneSeconds;
  const effortLabel = sport === 'running' ? 'Pace' : 'Power';

  return (
    <section className="graph-panel" id="telemetry-timeline-panel">
      <div>
        <div className="graph-header">
          <h2 className="panel-heading">
            Live Intensity Timeline (
            {mode === 'hr'
              ? 'Garmin HR Zones'
              : mode === 'power'
                ? sport === 'running'
                  ? 'Run Effort Bars'
                  : 'FTP Power Bars'
                : `${effortLabel} + HR`}
            )
          </h2>
          <div className="graph-mode-tabs">
            <button
              type="button"
              id="graph-mode-combined"
              className={`btn btn-sm ${mode === 'combined' ? 'btn-primary' : ''}`}
              onClick={() => setMode('combined')}
            >
              {effortLabel} + HR
            </button>
            <button
              type="button"
              id="graph-mode-hr"
              className={`btn btn-sm ${mode === 'hr' ? 'btn-primary' : ''}`}
              onClick={() => setMode('hr')}
            >
              HR Zones
            </button>
            <button
              type="button"
              id="graph-mode-power"
              className={`btn btn-sm ${mode === 'power' ? 'btn-primary' : ''}`}
              onClick={() => setMode('power')}
            >
              {effortLabel} Only
            </button>
          </div>
        </div>

        <div className="graph-canvas-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} />
          {points.length === 0 && (
            <div className="graph-empty-hint">
              Tap <strong>Start Workout</strong> or <strong>Simulate</strong> to stream color-coded zone bars
            </div>
          )}
        </div>
      </div>

      <div className="graph-zone-col">
        <div className="graph-header" style={{ marginBottom: 0 }}>
          <h2 className="panel-heading">
            Time in {hasHrStream ? 'HR' : effortLabel} Zones
          </h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Z4 + Z5 = BURN PTS
          </span>
        </div>

        <ZoneDistributionList zoneSeconds={activeZoneTotals} />
      </div>
    </section>
  );
}
