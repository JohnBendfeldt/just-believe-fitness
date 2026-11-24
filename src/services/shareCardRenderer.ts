import type { SavedRide, ZoneDefinition, ZoneId } from '../types/fitness';
import {
  DEFAULT_ATHLETE_PROFILE,
  ZONE_PALETTE,
  computeSegmentedGaugeProgress,
  formatDuration,
  formatRowingSplit,
  formatRunningPacePerMile,
  getCadenceZones,
  getEffectiveRowFtpWatts,
  getEffectiveRunThresholdPaceSec,
  getHrZones,
  getPowerZones,
  getRowingStrokeRateZones,
  getRunningCadenceZones,
  getRunningSpeedZones,
  metersToMiles,
  mpsToMph,
  resolveZone,
  rowingWattsToSplitSecPer500m,
} from '../utils/zones';

export type ShareOverlayStyle = 'timeline' | 'rings' | 'minimal';

export interface ShareCardOptions {
  ride: SavedRide;
  photo: HTMLImageElement | null;
  overlayStyle: ShareOverlayStyle;
  customTitle?: string;
  customCaption?: string;
}

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  destW: number,
  destH: number
): void {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return;

  const scale = Math.max(destW / srcW, destH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (destW - drawW) / 2;
  const dy = (destH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawBrandMark(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  const colors = [
    ZONE_PALETTE[1].color,
    ZONE_PALETTE[2].color,
    ZONE_PALETTE[3].color,
    ZONE_PALETTE[4].color,
    ZONE_PALETTE[5].color,
  ];
  const heights = [18, 26, 36, 46, 56].map((h) => h * scale);
  const barW = 8 * scale;
  const gap = 5 * scale;
  const boxSize = 72 * scale;

  roundRectPath(ctx, x, y, boxSize, boxSize, 18 * scale);
  ctx.fillStyle = 'rgba(15, 20, 30, 0.88)';
  ctx.fill();
  ctx.lineWidth = 2 * scale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.stroke();

  const totalBarsW = colors.length * barW + (colors.length - 1) * gap;
  const startX = x + (boxSize - totalBarsW) / 2;
  const bottomY = y + boxSize - 12 * scale;

  colors.forEach((col, i) => {
    const bh = heights[i];
    roundRectPath(ctx, startX + i * (barW + gap), bottomY - bh, barW, bh, 4 * scale);
    ctx.fillStyle = col;
    ctx.fill();
  });
}

function drawBurnPill(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  topY: number,
  burnPoints: number
): void {
  const label = `🔥 ${burnPoints} BURN PTS`;
  ctx.font = '800 28px "Barlow Condensed", system-ui, sans-serif';
  const textW = ctx.measureText(label).width;
  const pillW = textW + 44;
  const pillH = 58;
  const x = rightX - pillW;

  roundRectPath(ctx, x, topY, pillW, pillH, 29);
  ctx.fillStyle = '#F97316';
  ctx.fill();

  ctx.fillStyle = '#140700';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + pillW / 2, topY + pillH / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }
  lines.push(current);
  return lines.slice(0, maxLines);
}

function drawSpeedometerRingOnCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  value: number,
  zones: ZoneDefinition[],
  valueText: string,
  unitText: string,
  labelText: string
): void {
  const active = resolveZone(value, zones);
  const pct = computeSegmentedGaugeProgress(value, zones);
  const startDeg = 140;
  const sweepDeg = 260;
  const segSweep = (sweepDeg - 4 * 4.5) / 5;

  for (let i = 0; i < 5; i++) {
    const z = zones[i];
    const a1 = ((startDeg + i * (segSweep + 4.5)) * Math.PI) / 180;
    const a2 = ((startDeg + i * (segSweep + 4.5) + segSweep) * Math.PI) / 180;
    const isActive = z.zone === active.zone && value > 0;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, a1, a2);
    ctx.strokeStyle = z.color;
    ctx.globalAlpha = isActive ? 1 : 0.32;
    ctx.lineWidth = isActive ? 20 : 13;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (value > 0) {
    const pointerAngle = ((startDeg + (pct / 100) * sweepDeg) * Math.PI) / 180;
    const px = cx + radius * Math.cos(pointerAngle);
    const py = cy + radius * Math.sin(pointerAngle);
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0B0E14';
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 64px "Barlow Condensed", system-ui, sans-serif';
  ctx.fillText(valueText, cx, cy + 12);

  ctx.fillStyle = active.color;
  ctx.font = '700 21px "Barlow Condensed", system-ui, sans-serif';
  ctx.fillText(unitText.toUpperCase(), cx, cy + 40);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(labelText.toUpperCase(), cx, cy + radius + 34);
  ctx.textAlign = 'left';
}

function drawStudioDarkArtwork(ctx: CanvasRenderingContext2D, ride: SavedRide): void {
  const bgGrad = ctx.createLinearGradient(0, 0, 0, SHARE_CARD_HEIGHT);
  bgGrad.addColorStop(0, '#0B0E14');
  bgGrad.addColorStop(0.5, '#111723');
  bgGrad.addColorStop(1, '#090C11');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  // Subtle ambient glow in Orange/Red Burn palette
  const glowColor = ride.burnPoints >= 12 ? ZONE_PALETTE[4].color : ZONE_PALETTE[3].color;
  const rad = ctx.createRadialGradient(540, 470, 40, 540, 470, 520);
  rad.addColorStop(0, `${glowColor}38`);
  rad.addColorStop(0.55, `${ZONE_PALETTE[5].color}14`);
  rad.addColorStop(1, 'rgba(11, 14, 20, 0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  // Subtle studio grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  for (let y = 120; y < SHARE_CARD_HEIGHT; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SHARE_CARD_WIDTH, y);
    ctx.stroke();
  }

  // Centerpiece Hero Stat Ring in Studio Mode (when no camera photo is used)
  const powerZones = getPowerZones(
    ride.athleteSnapshot.ftpWatts || DEFAULT_ATHLETE_PROFILE.ftpWatts
  );
  const avgZone = resolveZone(ride.avgWatts, powerZones);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.font = '800 170px "Barlow Condensed", system-ui, sans-serif';
  ctx.fillText('JUST BELIEVE', SHARE_CARD_WIDTH / 2, 470);

  const bikeTag = (ride.bikeLabel || 'Indoor Bike').toUpperCase();
  ctx.fillStyle = avgZone.color;
  ctx.font = '800 32px "JetBrains Mono", monospace';
  ctx.fillText(
    `${bikeTag} · ${ride.avgWkg.toFixed(2)} W/KG · NP ${ride.normalizedWatts}W`,
    SHARE_CARD_WIDTH / 2,
    535
  );
  ctx.restore();
}

export function renderRideShareCanvas(
  canvas: HTMLCanvasElement,
  options: ShareCardOptions
): void {
  const { ride, photo, overlayStyle, customTitle, customCaption } = options;
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  // 1. Background Layer (Camera/Gallery Photo OR Dark JBF Studio Artwork)
  if (photo) {
    drawCoverImage(ctx, photo, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

    // Top + Bottom Studio Readability Scrim (keeps middle clear for subject!)
    const topGrad = ctx.createLinearGradient(0, 0, 0, 340);
    topGrad.addColorStop(0, 'rgba(6, 9, 14, 0.84)');
    topGrad.addColorStop(0.65, 'rgba(6, 9, 14, 0.36)');
    topGrad.addColorStop(1, 'rgba(6, 9, 14, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, 340);

    const botStart = overlayStyle === 'minimal' ? 760 : 620;
    const botGrad = ctx.createLinearGradient(0, botStart, 0, SHARE_CARD_HEIGHT);
    botGrad.addColorStop(0, 'rgba(6, 9, 14, 0)');
    botGrad.addColorStop(0.32, 'rgba(6, 9, 14, 0.68)');
    botGrad.addColorStop(1, 'rgba(6, 9, 14, 0.94)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, botStart, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT - botStart);
  } else {
    drawStudioDarkArtwork(ctx, ride);
  }

  const displayTitle = (customTitle ?? ride.title).trim() || ride.title;
  const displayCaption = (customCaption ?? ride.notes ?? '').trim();
  const dateLabel = new Date(ride.startedAtIso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const miles = metersToMiles(ride.distanceMeters).toFixed(2);
  const kcal = Math.round(ride.caloriesKcal);

  // 2. Top Studio Header
  const padX = 56;
  drawBrandMark(ctx, padX, 54, 1);

  ctx.fillStyle = '#F97316';
  ctx.font = '800 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('JUST BELIEVE FITNESS · JBFIT.STUDIO', padX + 92, 84);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.fillText(dateLabel.toUpperCase(), padX + 92, 116);

  if (ride.burnPoints > 0) {
    drawBurnPill(ctx, SHARE_CARD_WIDTH - padX, 60, ride.burnPoints);
  }

  // Workout Title
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 58px "Barlow Condensed", system-ui, sans-serif';
  const titleLines = wrapTextLines(ctx, displayTitle.toUpperCase(), SHARE_CARD_WIDTH - padX * 2, 2);
  titleLines.forEach((line, idx) => {
    ctx.fillText(line, padX, 198 + idx * 58);
  });

  if (displayCaption) {
    const captionY = 198 + titleLines.length * 58 + 8;
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 26px "Plus Jakarta Sans", system-ui, sans-serif';
    const capLines = wrapTextLines(ctx, `"${displayCaption}"`, SHARE_CARD_WIDTH - padX * 2, 2);
    capLines.forEach((line, idx) => {
      ctx.fillText(line, padX, captionY + idx * 34);
    });
  }
  ctx.restore();

  const sport = ride.sport ?? 'cycling';
  const avgMph =
    ride.durationSec > 0 && ride.distanceMeters > 0
      ? mpsToMph(ride.distanceMeters / ride.durationSec)
      : 0;
  const avgRunPace = formatRunningPacePerMile(avgMph);
  const avgRowSplitSec =
    ride.avgSplitSecPer500m && ride.avgSplitSecPer500m > 0
      ? ride.avgSplitSecPer500m
      : ride.durationSec > 0 && ride.distanceMeters > 50
        ? (ride.durationSec / ride.distanceMeters) * 500
        : rowingWattsToSplitSecPer500m(ride.avgWatts);
  const avgRowSplitStr = formatRowingSplit(avgRowSplitSec);
  const rowDistMetersStr = `${Math.round(ride.distanceMeters).toLocaleString('en-US')} m`;

  // 3. Bottom Telemetry Overlay by Selected Style
  if (overlayStyle === 'minimal') {
    // Transparent Floating Strava-Style Sticker
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 18;

    const stats =
      sport === 'running'
        ? [
            {
              label: 'AVG PACE',
              val: `${avgRunPace} /MI`,
              sub: `${avgMph.toFixed(1)} mph · ${ride.avgWatts}W`,
            },
            {
              label: 'HEART RATE',
              val: ride.avgHr > 0 ? `${ride.avgHr} BPM` : `${ride.avgCadence} SPM`,
              sub:
                ride.maxHr > 0
                  ? `Max ${ride.maxHr} bpm`
                  : `Incline ${(ride.avgInclinePct ?? 0).toFixed(1)}%`,
            },
            {
              label: 'TIME · DIST',
              val: formatDuration(ride.durationSec),
              sub: `${miles} mi · ${kcal} kcal`,
            },
          ]
        : sport === 'rowing'
          ? [
              {
                label: 'AVG SPLIT',
                val: `${avgRowSplitStr}`,
                sub: `/500m · ${ride.avgWatts}W avg`,
              },
              {
                label: 'HEART RATE',
                val: ride.avgHr > 0 ? `${ride.avgHr} BPM` : `${ride.avgCadence} SPM`,
                sub: ride.maxHr > 0 ? `Max ${ride.maxHr} bpm` : `Max ${ride.maxWatts}W`,
              },
              {
                label: 'TIME · DIST',
                val: formatDuration(ride.durationSec),
                sub: `${rowDistMetersStr} · ${kcal} kcal`,
              },
            ]
          : [
              { label: 'AVG POWER', val: `${ride.avgWatts} W`, sub: `${ride.avgWkg.toFixed(2)} W/kg` },
              {
                label: 'HEART RATE',
                val: ride.avgHr > 0 ? `${ride.avgHr} BPM` : `MAX ${ride.maxWatts}W`,
                sub: ride.maxHr > 0 ? `Max ${ride.maxHr} bpm` : `NP ${ride.normalizedWatts}W`,
              },
              {
                label: 'TIME · DIST',
                val: formatDuration(ride.durationSec),
                sub: `${miles} mi · ${kcal} kcal`,
              },
            ];

    const baseY = 1165;
    const colW = (SHARE_CARD_WIDTH - padX * 2) / 3;

    stats.forEach((st, idx) => {
      const x = padX + idx * colW;
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(st.label, x, baseY - 78);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 72px "Barlow Condensed", system-ui, sans-serif';
      ctx.fillText(st.val, x, baseY - 12);

      ctx.fillStyle = '#F97316';
      ctx.font = '700 23px "JetBrains Mono", monospace';
      ctx.fillText(st.sub, x, baseY + 22);
    });
    ctx.restore();

    // 5-Zone Color Ribbon Along Bottom
    drawZoneDistributionStrip(ctx, ride, padX, 1245, SHARE_CARD_WIDTH - padX * 2, 22, true);
    return;
  }

  if (overlayStyle === 'rings') {
    // 3 Rounded Speedometer Rings Deck
    const cardY = 835;
    const cardH = 460;
    roundRectPath(ctx, padX, cardY, SHARE_CARD_WIDTH - padX * 2, cardH, 32);
    ctx.fillStyle = 'rgba(13, 18, 28, 0.84)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.stroke();

    const pwrZones = getPowerZones(
      sport === 'rowing'
        ? getEffectiveRowFtpWatts(ride.athleteSnapshot)
        : ride.athleteSnapshot.ftpWatts || DEFAULT_ATHLETE_PROFILE.ftpWatts
    );
    const runZones = getRunningSpeedZones(getEffectiveRunThresholdPaceSec(ride.athleteSnapshot));
    const cadZones =
      sport === 'running'
        ? getRunningCadenceZones()
        : sport === 'rowing'
          ? getRowingStrokeRateZones()
          : getCadenceZones();
    const hrZones = getHrZones(
      ride.athleteSnapshot.maxHrBpm || DEFAULT_ATHLETE_PROFILE.maxHrBpm
    );

    const innerW = SHARE_CARD_WIDTH - padX * 2;
    const centers = [padX + innerW * 0.18, padX + innerW * 0.5, padX + innerW * 0.82];
    const ringCy = cardY + 165;

    if (sport === 'running') {
      drawSpeedometerRingOnCanvas(
        ctx,
        centers[0],
        ringCy,
        108,
        avgMph,
        runZones,
        avgRunPace,
        '/MI',
        `Avg ${avgMph.toFixed(1)} MPH`
      );
      drawSpeedometerRingOnCanvas(
        ctx,
        centers[1],
        ringCy,
        108,
        ride.avgCadence,
        cadZones,
        ride.avgCadence > 0 ? `${ride.avgCadence}` : `${(ride.avgInclinePct ?? 0).toFixed(1)}`,
        ride.avgCadence > 0 ? 'SPM' : '% GRADE',
        ride.avgCadence > 0
          ? `Max ${ride.maxCadence} SPM`
          : `Max ${(ride.maxInclinePct ?? 0).toFixed(1)}%`
      );
    } else if (sport === 'rowing') {
      drawSpeedometerRingOnCanvas(
        ctx,
        centers[0],
        ringCy,
        108,
        ride.avgWatts,
        pwrZones,
        avgRowSplitStr,
        '/500M',
        `Avg ${ride.avgWatts}W`
      );
      drawSpeedometerRingOnCanvas(
        ctx,
        centers[1],
        ringCy,
        108,
        ride.avgCadence,
        cadZones,
        `${ride.avgCadence}`,
        'SPM',
        `Max ${ride.maxCadence} SPM`
      );
    } else {
      drawSpeedometerRingOnCanvas(
        ctx,
        centers[0],
        ringCy,
        108,
        ride.avgWatts,
        pwrZones,
        `${ride.avgWatts}`,
        'Watts',
        `Avg · ${ride.avgWkg.toFixed(2)} W/kg`
      );

      drawSpeedometerRingOnCanvas(
        ctx,
        centers[1],
        ringCy,
        108,
        ride.avgCadence,
        cadZones,
        `${ride.avgCadence}`,
        'RPM',
        `Max ${ride.maxCadence} RPM`
      );
    }

    drawSpeedometerRingOnCanvas(
      ctx,
      centers[2],
      ringCy,
      108,
      ride.avgHr,
      hrZones,
      ride.avgHr > 0 ? `${ride.avgHr}` : '--',
      'BPM',
      ride.maxHr > 0 ? `Max ${ride.maxHr} BPM` : 'BLE HR'
    );

    // Summary Footer inside Rings Card
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const distSummary = sport === 'rowing' ? rowDistMetersStr.toUpperCase() : `${miles} MI`;
    ctx.fillText(
      `${formatDuration(ride.durationSec)}   •   ${distSummary}   •   ${kcal} KCAL   •   MAX ${ride.maxWatts}W`,
      SHARE_CARD_WIDTH / 2,
      cardY + 375
    );
    ctx.textAlign = 'left';

    drawZoneDistributionStrip(ctx, ride, padX + 36, cardY + 404, innerW - 72, 18, false);
    return;
  }

  // Default: 'timeline' — Full JBF Glass Telemetry Card + Color-Coded 5-Zone Timeline Sparkline
  const panelY = 775;
  const panelH = 520;
  const panelW = SHARE_CARD_WIDTH - padX * 2;

  roundRectPath(ctx, padX, panelY, panelW, panelH, 32);
  ctx.fillStyle = 'rgba(13, 18, 28, 0.86)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();

  const metrics =
    sport === 'running'
      ? [
          {
            label: 'AVG PACE',
            val: `${avgRunPace}`,
            sub: `/mi · ${avgMph.toFixed(1)} mph`,
          },
          {
            label: 'HEART RATE',
            val: ride.avgHr > 0 ? `${ride.avgHr} bpm` : '--',
            sub: ride.maxHr > 0 ? `Max ${ride.maxHr} bpm` : `Avg ${ride.avgWatts}W`,
          },
          {
            label: 'DURATION',
            val: formatDuration(ride.durationSec),
            sub:
              ride.avgCadence > 0
                ? `Avg ${ride.avgCadence} spm`
                : `Inc ${(ride.avgInclinePct ?? 0).toFixed(1)}%`,
          },
          {
            label: 'DIST · WORK',
            val: `${miles} mi`,
            sub: `${kcal} kcal`,
          },
        ]
      : sport === 'rowing'
        ? [
            {
              label: 'AVG SPLIT',
              val: `${avgRowSplitStr}`,
              sub: `/500m · ${ride.avgWatts}W`,
            },
            {
              label: 'HEART RATE',
              val: ride.avgHr > 0 ? `${ride.avgHr} bpm` : '--',
              sub: ride.maxHr > 0 ? `Max ${ride.maxHr} bpm` : `Max ${ride.maxWatts}W`,
            },
            {
              label: 'DURATION',
              val: formatDuration(ride.durationSec),
              sub: `Avg ${ride.avgCadence} spm`,
            },
            {
              label: 'DIST · WORK',
              val: rowDistMetersStr,
              sub: `${kcal} kcal`,
            },
          ]
        : [
            {
              label: 'AVG POWER',
              val: `${ride.avgWatts}W`,
              sub: `${ride.avgWkg.toFixed(2)} W/kg · Max ${ride.maxWatts}W`,
            },
            {
              label: 'HEART RATE',
              val: ride.avgHr > 0 ? `${ride.avgHr} bpm` : '--',
              sub: ride.maxHr > 0 ? `Max ${ride.maxHr} bpm` : `NP ${ride.normalizedWatts}W`,
            },
            {
              label: 'DURATION',
              val: formatDuration(ride.durationSec),
              sub: `Avg ${ride.avgCadence} rpm`,
            },
            {
              label: 'DIST · WORK',
              val: `${miles} mi`,
              sub: `${kcal} kcal`,
            },
          ];

  const colWidth = (panelW - 72) / 4;
  metrics.forEach((m, i) => {
    const mx = padX + 36 + i * colWidth;
    const my = panelY + 52;

    ctx.fillStyle = '#94A3B8';
    ctx.font = '700 19px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(m.label, mx, my);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '800 56px "Barlow Condensed", system-ui, sans-serif';
    ctx.fillText(m.val, mx, my + 58);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = '600 19px "JetBrains Mono", monospace';
    ctx.fillText(m.sub, mx, my + 88);
  });

  // Color-Coded 5-Zone Ride Effort Sparkline
  const chartX = padX + 36;
  const chartY = panelY + 186;
  const chartW = panelW - 72;
  const chartH = 195;

  roundRectPath(ctx, chartX, chartY, chartW, chartH, 18);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.fill();

  const pts = ride.trackPoints;
  const barCount = Math.min(120, Math.max(24, pts.length));
  const gap = 3;
  const barW = (chartW - 28 - (barCount - 1) * gap) / barCount;
  const maxWattsRef = Math.max(
    ride.maxWatts,
    Math.round((ride.athleteSnapshot.ftpWatts || 257) * 1.2),
    180
  );

  if (pts.length > 1) {
    for (let i = 0; i < barCount; i++) {
      const idx = Math.min(pts.length - 1, Math.floor((i / barCount) * pts.length));
      const pt = pts[idx];
      const zoneId: ZoneId = ride.avgHr > 0 && pt.heartRateBpm > 0 ? pt.hrZone : pt.powerZone;
      const ratio = Math.max(0.12, Math.min(1, pt.powerWatts / maxWattsRef));
      const bh = ratio * (chartH - 36);
      const bx = chartX + 14 + i * (barW + gap);
      const by = chartY + chartH - 14 - bh;

      roundRectPath(ctx, bx, by, Math.max(2, barW), bh, 3);
      ctx.fillStyle = ZONE_PALETTE[zoneId].color;
      ctx.fill();
    }
  }

  ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
  ctx.font = '700 17px "JetBrains Mono", monospace';
  ctx.fillText('5-ZONE INTENSITY TIMELINE', chartX + 16, chartY + 26);

  // Bottom 5-Zone Distribution Bar + Zone Labels
  drawZoneDistributionStrip(ctx, ride, chartX, panelY + 412, chartW, 22, true);
}

function drawZoneDistributionStrip(
  ctx: CanvasRenderingContext2D,
  ride: SavedRide,
  x: number,
  y: number,
  w: number,
  h: number,
  showLabels: boolean
): void {
  const zones: ZoneId[] = [1, 2, 3, 4, 5];
  const secsMap = ride.avgHr > 0 ? ride.hrZoneSeconds : ride.powerZoneSeconds;
  const total = Math.max(
    1,
    zones.reduce((acc, z) => acc + (secsMap[z] || 0), 0)
  );

  let cursorX = x;
  zones.forEach((z) => {
    const secs = secsMap[z] || 0;
    const segW = (secs / total) * w;
    if (segW <= 0.5) return;
    ctx.fillStyle = ZONE_PALETTE[z].color;
    ctx.fillRect(cursorX, y, segW, h);
    cursorX += segW;
  });

  if (showLabels) {
    const labelY = y + h + 30;
    const slotW = w / 5;
    zones.forEach((z, idx) => {
      const secs = secsMap[z] || 0;
      const pct = Math.round((secs / total) * 100);
      const lx = x + idx * slotW;

      ctx.fillStyle = ZONE_PALETTE[z].color;
      ctx.beginPath();
      ctx.arc(lx + 7, labelY - 7, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.fillText(`Z${z} ${pct}%`, lx + 20, labelY);
    });
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode ride share image.'));
      },
      'image/png',
      0.95
    );
  });
}
