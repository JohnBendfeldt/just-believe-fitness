import { useEffect, useRef, useState } from 'react';
import type { AthleteProfile, TrackPoint, ZoneId } from '../types/fitness';
import {
  ZONE_PALETTE,
  formatDuration,
  getHrZones,
  getPowerZones,
  resolveZone,
} from '../utils/zones';

interface LiveZoneGraphProps {
  points: TrackPoint[];
  profile: AthleteProfile;
  hrZoneSeconds: Record<ZoneId, number>;
  powerZoneSeconds: Record<ZoneId, number>;
  hasHrStream: boolean;
}

type GraphMode = 'combined' | 'hr' | 'power';

export function LiveZoneGraph({
  points,
  profile,
  hrZoneSeconds,
  powerZoneSeconds,
  hasHrStream,
}: LiveZoneGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<GraphMode>('combined');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(280, Math.floor(rect.width));
    const height = Math.max(140, Math.floor(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const powerZones = getPowerZones(profile.ftpWatts);
    const hrZones = getHrZones(profile.maxHrBpm);

    // Show most recent 240 seconds (4 minutes) of high-resolution bars
    const windowPoints = points.slice(-240);
    const padX = 10;
    const padTop = 14;
    const padBottom = 16;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;

    // Subtle horizontal reference lines (FTP & Splat threshold)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const maxPowerScale = Math.max(
      profile.ftpWatts * 1.45,
      ...windowPoints.map((p) => p.powerWatts),
      300
    );

    if (mode !== 'hr') {
      const ftpY = padTop + plotH * (1 - profile.ftpWatts / maxPowerScale);
      ctx.beginPath();
      ctx.moveTo(padX, ftpY);
      ctx.lineTo(width - padX, ftpY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.fillText(`FTP ${profile.ftpWatts}W`, padX + 4, Math.max(11, ftpY - 4));
    } else {
      const splatHr = Math.round(profile.maxHrBpm * 0.84);
      const minHr = 70;
      const maxHr = Math.max(profile.maxHrBpm + 6, 200);
      const splatY = padTop + plotH * (1 - (splatHr - minHr) / (maxHr - minHr));
      ctx.beginPath();
      ctx.moveTo(padX, splatY);
      ctx.lineTo(width - padX, splatY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.88)';
      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.fillText(`SPLAT ${splatHr} BPM`, padX + 4, Math.max(11, splatY - 4));
    }

    if (windowPoints.length === 0) {
      ctx.fillStyle = '#64748B';
      ctx.font = '500 13px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Start riding or enable Simulate Ride to stream color-coded zone bars',
        width / 2,
        height / 2
      );
      ctx.restore();
      return;
    }

    const slots = Math.max(60, windowPoints.length);
    const stepX = plotW / slots;

    // 1. Draw Garmin/OTF color-coded Power Bars (in 'combined' or 'power' mode)
    if (mode === 'combined' || mode === 'power') {
      const barW = Math.max(1.5, stepX - 1);
      windowPoints.forEach((pt, idx) => {
        const z = resolveZone(pt.powerWatts, powerZones);
        const ratio = Math.min(1, Math.max(0.02, pt.powerWatts / maxPowerScale));
        const bh = ratio * plotH;
        const bx = padX + idx * stepX;
        const by = padTop + plotH - bh;
        ctx.fillStyle = z.color;
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
  }, [points, profile, mode]);

  const activeZoneTotals = hasHrStream ? hrZoneSeconds : powerZoneSeconds;
  const totalTrackedSec = Math.max(
    1,
    Object.values(activeZoneTotals).reduce((a, b) => a + b, 0)
  );
  const orderedZones: ZoneId[] = [5, 4, 3, 2, 1];

  return (
    <section className="graph-panel" id="telemetry-timeline-panel">
      <div>
        <div className="graph-header">
          <h2 className="panel-heading">
            Live Intensity Timeline ({mode === 'hr' ? 'Garmin HR Zones' : mode === 'power' ? 'FTP Power Bars' : 'Power Bars + HR Line'})
          </h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              id="graph-mode-combined"
              className={`btn btn-sm ${mode === 'combined' ? 'btn-primary' : ''}`}
              onClick={() => setMode('combined')}
            >
              Power + HR
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
              Power Only
            </button>
          </div>
        </div>

        <div className="graph-canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
        <div className="graph-header" style={{ marginBottom: 0 }}>
          <h2 className="panel-heading">
            Time in {hasHrStream ? 'HR' : 'Power'} Zones
          </h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Z4 + Z5 = SPLATS
          </span>
        </div>

        <div className="zone-dist-list">
          {orderedZones.map((zId) => {
            const secs = activeZoneTotals[zId] || 0;
            const pct = Math.min(100, Math.round((secs / totalTrackedSec) * 100));
            const pal = ZONE_PALETTE[zId];
            return (
              <div className="zone-dist-row" key={zId}>
                <span className="zone-dist-name">
                  <span className="zone-swatch" style={{ backgroundColor: pal.color }} />
                  Zone {zId}
                </span>
                <div className="zone-dist-track">
                  <div
                    className="zone-dist-fill"
                    style={{
                      width: `${secs > 0 ? Math.max(4, pct) : 0}%`,
                      backgroundColor: pal.color,
                    }}
                  />
                </div>
                <span className="zone-dist-time tabular">{formatDuration(secs)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
