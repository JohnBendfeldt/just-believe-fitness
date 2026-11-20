import type { AthleteProfile, LiveTelemetry, ZoneDefinition } from '../types/fitness';
import {
  computeSegmentedGaugeProgress,
  computeWattsPerKg,
  formatBikeGearBadge,
  formatDuration,
  getCadenceZones,
  getHrZones,
  getPowerZones,
  resolveHeadlineEffortZone,
  resolveZone,
} from '../utils/zones';

export interface HudRenderSnapshot {
  telemetry: LiveTelemetry;
  profile: AthleteProfile;
  elapsedSec: number;
  burnPoints: number;
  gaugeMode?: 'rings' | 'bars';
  segmentLabel?: string;
  segmentRemainingSec?: number;
  segmentRemainingLabel?: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSegmentedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zones: ZoneDefinition[],
  activeZone: ZoneDefinition,
  progressPct: number,
  isLive: boolean
): void {
  const gap = 4;
  const segWidth = (width - gap * 4) / 5;

  for (let i = 0; i < 5; i++) {
    const z = zones[i];
    const sx = x + i * (segWidth + gap);
    const isActive = isLive && z.zone === activeZone.zone;
    const sy = isActive ? y - 2 : y;
    const sh = isActive ? height + 4 : height;

    ctx.globalAlpha = isActive ? 1 : 0.32;
    ctx.fillStyle = z.color;
    drawRoundedRect(ctx, sx, sy, segWidth, sh, 4);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (isLive) {
    const markerX = x + (Math.max(1, Math.min(99, progressPct)) / 100) * width;
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, markerX - 2.5, y - 5, 5, height + 10, 2.5);
    ctx.fill();
  }
}

function drawSpeedometerRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  zones: ZoneDefinition[],
  activeZone: ZoneDefinition,
  progressPct: number,
  isLive: boolean
): void {
  const startDeg = 140;
  const totalSweepDeg = 260;
  const gapDeg = 6;
  const segSweepDeg = (totalSweepDeg - gapDeg * 4) / 5;

  ctx.save();
  ctx.lineCap = 'round';

  for (let i = 0; i < 5; i++) {
    const z = zones[i];
    const a0 = ((startDeg + i * (segSweepDeg + gapDeg)) * Math.PI) / 180;
    const a1 = ((startDeg + i * (segSweepDeg + gapDeg) + segSweepDeg) * Math.PI) / 180;
    const isCurrent = isLive && z.zone === activeZone.zone;
    const isPassed = isLive && z.zone < activeZone.zone;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, a0, a1);
    ctx.strokeStyle = z.color;
    ctx.lineWidth = isCurrent ? 13 : 9;
    ctx.globalAlpha = isCurrent ? 1 : isPassed ? 0.55 : 0.25;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  if (isLive) {
    const needleRad = ((startDeg + (progressPct / 100) * totalSweepDeg) * Math.PI) / 180;
    const xIn = cx + (radius - 9) * Math.cos(needleRad);
    const yIn = cy + (radius - 9) * Math.sin(needleRad);
    const xOut = cx + (radius + 7) * Math.cos(needleRad);
    const yOut = cy + (radius + 7) * Math.sin(needleRad);

    ctx.beginPath();
    ctx.moveTo(xIn, yIn);
    ctx.lineTo(xOut, yOut);
    ctx.strokeStyle = '#0B0E13';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(xIn, yIn);
    ctx.lineTo(xOut, yOut);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.2;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders a high-contrast 640x360 JBF 5-Zone telemetry frame onto a <canvas>
 * so it can stream into native Picture-in-Picture (<video>) over YouTube on Android & Desktop.
 */
export function renderTelemetryHudCanvas(
  canvas: HTMLCanvasElement,
  snap: HudRenderSnapshot
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const {
    telemetry,
    profile,
    elapsedSec,
    burnPoints,
    gaugeMode = 'rings',
    segmentLabel,
    segmentRemainingSec,
    segmentRemainingLabel,
  } = snap;

  const hrZones = getHrZones(profile.maxHrBpm);
  const powerZones = getPowerZones(profile.ftpWatts);
  const cadenceZones = getCadenceZones();

  const activeHr = resolveZone(telemetry.heartRateBpm, hrZones);
  const activePower = resolveZone(telemetry.powerWatts, powerZones);
  const activeCadence = resolveZone(telemetry.cadenceRpm, cadenceZones);
  const { zoneDef: headline } = resolveHeadlineEffortZone(
    telemetry.heartRateBpm,
    telemetry.powerWatts,
    profile
  );

  // Matte obsidian background
  ctx.fillStyle = '#0B0E13';
  ctx.fillRect(0, 0, W, H);

  // Top solid zone header banner
  const bannerH = 64;
  ctx.fillStyle = headline.color;
  ctx.fillRect(0, 0, W, bannerH);

  ctx.fillStyle = headline.textOnFill;
  ctx.font = '700 21px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const leftText = segmentLabel
    ? `${headline.stageLabel}  ·  ${segmentLabel.toUpperCase()}`
    : `JUST BELIEVE FITNESS  ·  ${headline.stageLabel}`;
  ctx.fillText(leftText, 20, bannerH / 2, 340);

  // Timer / Distance Remaining + Burn Points badge on right of banner
  ctx.textAlign = 'right';
  ctx.font = '800 24px ui-monospace, SFMono-Regular, monospace';
  const timerStr = segmentRemainingLabel
    ? segmentRemainingLabel
    : typeof segmentRemainingSec === 'number'
      ? `${formatDuration(segmentRemainingSec)} LEFT`
      : formatDuration(elapsedSec);
  ctx.fillText(`${timerStr}   ★ ${burnPoints}`, W - 20, bannerH / 2);

  // Three side-by-side metric cards
  const pad = 16;
  const gap = 12;
  const cardY = bannerH + 14;
  const cardH = H - cardY - 14;
  const cardW = (W - pad * 2 - gap * 2) / 3;

  const ftpPct =
    profile.ftpWatts > 0 ? Math.round((telemetry.powerWatts / profile.ftpWatts) * 100) : 0;
  const wkg = computeWattsPerKg(telemetry.powerWatts, profile.weightLbs).toFixed(2);
  const hrPct =
    profile.maxHrBpm > 0 && telemetry.heartRateBpm > 0
      ? Math.round((telemetry.heartRateBpm / profile.maxHrBpm) * 100)
      : 0;

  const cards = [
    {
      label: 'POWER',
      value: `${Math.round(telemetry.powerWatts)}`,
      unit: 'WATTS',
      sub: `${ftpPct}% FTP · ${wkg} W/kg`,
      zones: powerZones,
      active: activePower,
      isLive: telemetry.powerWatts > 0,
      progress: computeSegmentedGaugeProgress(telemetry.powerWatts, powerZones),
    },
    {
      label: 'CADENCE',
      value: `${Math.round(telemetry.cadenceRpm)}`,
      unit: 'RPM',
      sub: formatBikeGearBadge(telemetry),
      zones: cadenceZones,
      active: activeCadence,
      isLive: telemetry.cadenceRpm > 0,
      progress: computeSegmentedGaugeProgress(telemetry.cadenceRpm, cadenceZones),
    },
    {
      label: 'HEART RATE',
      value: telemetry.heartRateBpm > 0 ? `${Math.round(telemetry.heartRateBpm)}` : '--',
      unit: 'BPM',
      sub:
        telemetry.heartRateBpm > 0
          ? `${hrPct}% MAX (${profile.maxHrBpm})`
          : telemetry.hrName
            ? `${telemetry.hrName.toUpperCase()} READY`
            : 'BLE HR IDLE',
      zones: hrZones,
      active: activeHr,
      isLive: telemetry.heartRateBpm > 0,
      progress: computeSegmentedGaugeProgress(telemetry.heartRateBpm, hrZones),
    },
  ];

  cards.forEach((c, idx) => {
    const cx = pad + idx * (cardW + gap);

    ctx.fillStyle = '#141922';
    drawRoundedRect(ctx, cx, cardY, cardW, cardH, 14);
    ctx.fill();

    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'left';
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(c.label, cx + 14, cardY + 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = c.isLive ? c.active.color : '#64748B';
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(c.isLive ? `Z${c.active.zone}` : 'IDLE', cx + cardW - 14, cardY + 22);

    if (gaugeMode === 'rings') {
      const ringCenterX = cx + cardW / 2;
      const ringCenterY = cardY + 122;
      drawSpeedometerRing(
        ctx,
        ringCenterX,
        ringCenterY,
        66,
        c.zones,
        c.active,
        c.progress,
        c.isLive
      );

      ctx.textAlign = 'center';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 48px system-ui, -apple-system, sans-serif';
      ctx.fillText(c.value, ringCenterX, ringCenterY - 4);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '700 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(c.unit, ringCenterX, ringCenterY + 28);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '600 12px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(c.sub, ringCenterX, cardY + cardH - 20);
    } else {
      ctx.fillStyle = c.active.color;
      drawRoundedRect(ctx, cx + 12, cardY + 34, cardW - 24, 5, 2.5);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 62px system-ui, -apple-system, sans-serif';
      ctx.fillText(c.value, cx + cardW / 2, cardY + 108);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '700 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(c.unit, cx + cardW / 2, cardY + 150);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 13px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(c.sub, cx + cardW / 2, cardY + 174);

      drawSegmentedBar(
        ctx,
        cx + 14,
        cardY + cardH - 34,
        cardW - 28,
        14,
        c.zones,
        c.active,
        c.progress,
        c.isLive
      );
    }
  });
}
