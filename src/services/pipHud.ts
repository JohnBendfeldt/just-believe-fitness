import type { AthleteProfile, LiveTelemetry, ZoneDefinition } from '../types/fitness';
import {
  computeSegmentedGaugeProgress,
  computeWattsPerKg,
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
  splatPoints: number;
  segmentLabel?: string;
  segmentRemainingSec?: number;
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
  progressPct: number
): void {
  const gap = 4;
  const segWidth = (width - gap * 4) / 5;

  for (let i = 0; i < 5; i++) {
    const z = zones[i];
    const sx = x + i * (segWidth + gap);
    const isActive = z.zone === activeZone.zone;
    const sy = isActive ? y - 2 : y;
    const sh = isActive ? height + 4 : height;

    ctx.globalAlpha = isActive ? 1 : 0.34;
    ctx.fillStyle = z.color;
    drawRoundedRect(ctx, sx, sy, segWidth, sh, 4);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Needle marker
  const markerX = x + (Math.max(1, Math.min(99, progressPct)) / 100) * width;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, markerX - 2.5, y - 5, 5, height + 10, 2.5);
  ctx.fill();
}

/**
 * Renders a high-contrast 640x360 Orangetheory + Garmin telemetry frame onto a <canvas>
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
  const { telemetry, profile, elapsedSec, splatPoints, segmentLabel, segmentRemainingSec } = snap;

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
  const bannerH = 68;
  ctx.fillStyle = headline.color;
  ctx.fillRect(0, 0, W, bannerH);

  ctx.fillStyle = headline.textOnFill;
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const leftText = segmentLabel
    ? `${headline.otfName}  ·  ${segmentLabel.toUpperCase()}`
    : `JB FITNESS  ·  ${headline.otfName}`;
  ctx.fillText(leftText, 20, bannerH / 2, 360);

  // Timer + Splat badge on right of banner
  ctx.textAlign = 'right';
  ctx.font = '800 26px ui-monospace, SFMono-Regular, monospace';
  const timerStr =
    typeof segmentRemainingSec === 'number'
      ? `${formatDuration(segmentRemainingSec)} LEFT`
      : formatDuration(elapsedSec);
  ctx.fillText(`${timerStr}   ★ ${splatPoints}`, W - 20, bannerH / 2);

  // Three side-by-side metric cards
  const pad = 16;
  const gap = 12;
  const cardY = bannerH + 16;
  const cardH = H - cardY - 16;
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
      progress: computeSegmentedGaugeProgress(telemetry.powerWatts, powerZones),
    },
    {
      label: 'CADENCE',
      value: `${Math.round(telemetry.cadenceRpm)}`,
      unit: 'RPM',
      sub: `EX-3 RES ${telemetry.resistance}/32`,
      zones: cadenceZones,
      active: activeCadence,
      progress: computeSegmentedGaugeProgress(telemetry.cadenceRpm, cadenceZones),
    },
    {
      label: 'HEART RATE',
      value: telemetry.heartRateBpm > 0 ? `${Math.round(telemetry.heartRateBpm)}` : '--',
      unit: 'BPM',
      sub: telemetry.heartRateBpm > 0 ? `${hrPct}% MAX (${profile.maxHrBpm})` : 'GARMIN IDLE',
      zones: hrZones,
      active: activeHr,
      progress: computeSegmentedGaugeProgress(telemetry.heartRateBpm, hrZones),
    },
  ];

  cards.forEach((c, idx) => {
    const cx = pad + idx * (cardW + gap);

    // Subtle elevated dark slate surface
    ctx.fillStyle = '#141922';
    drawRoundedRect(ctx, cx, cardY, cardW, cardH, 14);
    ctx.fill();

    // Solid top zone color bar inside card
    ctx.fillStyle = c.active.color;
    drawRoundedRect(ctx, cx + 12, cardY + 12, cardW - 24, 6, 3);
    ctx.fill();

    // Label
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'left';
    ctx.font = '700 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(c.label, cx + 14, cardY + 36);

    ctx.textAlign = 'right';
    ctx.fillStyle = c.active.color;
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Z${c.active.zone}`, cx + cardW - 14, cardY + 36);

    // Big numeric value
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '800 66px system-ui, -apple-system, sans-serif';
    ctx.fillText(c.value, cx + cardW / 2, cardY + 108);

    // Unit + athlete-oriented subtitle
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '700 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(c.unit, cx + cardW / 2, cardY + 152);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 13px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(c.sub, cx + cardW / 2, cardY + 176);

    // Garmin-style 5-zone color bar at bottom of card
    drawSegmentedBar(
      ctx,
      cx + 14,
      cardY + cardH - 34,
      cardW - 28,
      14,
      c.zones,
      c.active,
      c.progress
    );
  });
}
