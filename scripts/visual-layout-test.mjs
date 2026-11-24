#!/usr/bin/env node
/**
 * Real Headless Browser Visual & Layout Geometry Verification Suite.
 *
 * Renders the compiled production build (dist/) in real Chromium across Desktop,
 * Tablet, Phone Portrait, and Phone Landscape viewports under default and heavily
 * customized tile/icon layouts (3, 4, 5, and 6 active tiles, No-HR Speed/Distance
 * presets, reversed topbar icons & workout controls, Bars mode, Focus mode, Split
 * YouTube, Customize Modal, and Inline Arrange Mode) and asserts strict geometric
 * layout invariants:
 *   - Zero horizontal overflow
 *   - Zero overlapping tiles, buttons, or controls
 *   - Zero viewport clipping
 *   - Uniform row heights & 100% row-fill symmetry (zero orphan grid holes)
 *   - Single-row mobile brand header (no dropped utility icon row)
 *   - Exact rendered reading order matches customized layout preferences
 *   - Live interactive persistence across page reload & clean Reset to Default
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SCREENSHOT_DIR = process.env.SAVE_VISUAL_SCREENSHOTS
  ? path.resolve(process.env.SAVE_VISUAL_SCREENSHOTS)
  : null;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

function findChromiumExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      const normalized = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
      let filePath = path.join(rootDir, normalized === '/' ? 'index.html' : normalized);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(rootDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind static test server'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function maybeCapture(page, filename) {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: false });
}

async function auditLayout(page, label, opts = {}) {
  const report = await page.evaluate((options) => {
    const errors = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0.5 && r.height > 0.5;
    };

    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        id: el.id || '',
        tileId: el.getAttribute('data-tile-id') || '',
        actionId:
          el.getAttribute('data-action-id') ||
          el.getAttribute('data-arrange-topbar-id') ||
          '',
        controlId:
          el.getAttribute('data-control-id') ||
          el.getAttribute('data-arrange-control-id') ||
          '',
        statId: el.getAttribute('data-stat-id') || '',
      };
    };

    const checkNoOverlap = (rects, groupName) => {
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 1.5 && overlapY > 1.5) {
            errors.push(
              `${groupName}: elements overlap (${a.tileId || a.actionId || a.controlId || a.id} vs ${b.tileId || b.actionId || b.controlId || b.id})`
            );
          }
        }
      }
    };

    const checkInViewportX = (rects, groupName) => {
      for (const r of rects) {
        if (r.left < -1.5 || r.right > vw + 1.5) {
          errors.push(
            `${groupName}: element "${r.tileId || r.actionId || r.controlId || r.id}" clipped horizontally [${Math.round(r.left)}, ${Math.round(r.right)}] outside [0, ${vw}]`
          );
        }
      }
    };

    const groupRows = (rects) => {
      const sorted = [...rects].sort((a, b) =>
        Math.abs(a.top - b.top) <= 6 ? a.left - b.left : a.top - b.top
      );
      const rows = [];
      for (const r of sorted) {
        const row = rows.find((grp) => Math.abs(grp[0].top - r.top) <= 6);
        if (row) row.push(r);
        else rows.push([r]);
      }
      for (const row of rows) row.sort((a, b) => a.left - b.left);
      return rows;
    };

    const checkGridSymmetry = (containerSel, childSel, groupName, minW, minH) => {
      const container = document.querySelector(containerSel);
      if (!container || !isVisible(container)) return [];
      const containerRect = container.getBoundingClientRect();
      const items = Array.from(container.querySelectorAll(childSel)).filter(isVisible);
      const rects = items.map(rectOf);

      checkNoOverlap(rects, groupName);
      checkInViewportX(rects, groupName);

      for (const r of rects) {
        if (r.width < minW || r.height < minH) {
          errors.push(
            `${groupName}: element "${r.tileId || r.statId || r.id}" too small (${Math.round(r.width)}x${Math.round(r.height)}, min ${minW}x${minH})`
          );
        }
      }

      const rows = groupRows(rects);
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const firstH = row[0].height;
        const firstW = row[0].width;
        for (const item of row) {
          if (Math.abs(item.height - firstH) > 3) {
            errors.push(
              `${groupName} row ${rIdx + 1}: uneven heights (${Math.round(item.height)}px vs ${Math.round(firstH)}px)`
            );
          }
          if (Math.abs(item.width - firstW) > 3) {
            errors.push(
              `${groupName} row ${rIdx + 1}: uneven widths (${Math.round(item.width)}px vs ${Math.round(firstW)}px)`
            );
          }
        }
        // Every row in a symmetric grid must span full container width (no orphan holes!)
        const leftGap = Math.abs(row[0].left - containerRect.left);
        const rightGap = Math.abs(containerRect.right - row[row.length - 1].right);
        if (leftGap > 4 || rightGap > 4) {
          errors.push(
            `${groupName} row ${rIdx + 1}: orphan gap detected (leftGap=${Math.round(leftGap)}px, rightGap=${Math.round(rightGap)}px, items=${row.length})`
          );
        }
      }

      return rows.flat().map((r) => r.tileId || r.statId || r.id);
    };

    // 1. Global horizontal overflow check
    const docOverflow = document.documentElement.scrollWidth - vw;
    if (docOverflow > 1) {
      errors.push(`Page overflows horizontally by ${Math.round(docOverflow)}px (scrollWidth=${document.documentElement.scrollWidth}, innerWidth=${vw})`);
    }

    // 2. Topbar header cleanliness & mobile single-row utility alignment
    const brandImg = document.querySelector('.brand-logo-img');
    const brandTitle = document.querySelector('.brand-title');
    const layoutBtn = document.getElementById('customize-layout-btn');
    const githubBtn = document.getElementById('topbar-github-link');
    const topbarActionsEl = document.querySelector('.topbar-actions');
    if (isVisible(brandImg) && isVisible(layoutBtn) && isVisible(githubBtn)) {
      const br = brandImg.getBoundingClientRect();
      const lr = layoutBtn.getBoundingClientRect();
      const gr = githubBtn.getBoundingClientRect();
      if (Math.abs(lr.top - gr.top) > 4) {
        errors.push(`Topbar utility buttons wrapped unevenly (layout top=${Math.round(lr.top)}, github top=${Math.round(gr.top)})`);
      }
      if (vw < 600 && Math.abs(lr.top - br.top) > 12) {
        errors.push(`Mobile portrait header wrapped utility buttons onto a second row (brand top=${Math.round(br.top)}, layout top=${Math.round(lr.top)})`);
      }
      if (vw < 600 && isVisible(brandTitle) && brandTitle.scrollWidth > brandTitle.clientWidth + 2) {
        errors.push(`Mobile portrait brand title is truncated (scrollWidth=${brandTitle.scrollWidth} > clientWidth=${brandTitle.clientWidth})`);
      }
      if (
        vw >= 1400 &&
        !document.querySelector('.app-shell.arranging-layout') &&
        isVisible(topbarActionsEl)
      ) {
        const tar = topbarActionsEl.getBoundingClientRect();
        if (Math.abs(lr.top - tar.top) > 12) {
          errors.push(
            `Desktop 1440px topbar wrapped utility icons onto a separate row (actions top=${Math.round(tar.top)}, utility top=${Math.round(lr.top)})`
          );
        }
      }
      checkInViewportX([rectOf(layoutBtn), rectOf(githubBtn)], 'topbar-utility-btns');
    }

    // 3. Topbar actions layout & mobile 2-col row balance
    const topbarActions = document.querySelector('.topbar-actions');
    let visualTopbarOrder = [];
    if (topbarActions && isVisible(topbarActions)) {
      const children = Array.from(topbarActions.children).filter(isVisible);
      const rects = children.map(rectOf);
      checkNoOverlap(rects, 'topbar-actions');
      checkInViewportX(rects, 'topbar-actions');
      for (const r of rects) {
        if (r.width < 28 || r.height < 26) {
          errors.push(`topbar-actions: button too small (${Math.round(r.width)}x${Math.round(r.height)})`);
        }
      }
      const rows = groupRows(rects);
      visualTopbarOrder = rows.flat().map((r) => r.actionId).filter(Boolean);

      if (vw < 600) {
        const cr = topbarActions.getBoundingClientRect();
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const rightGap = Math.abs(cr.right - row[row.length - 1].right);
          if (rightGap > 5) {
            errors.push(
              `Mobile topbar-actions row ${rIdx + 1}: orphan half-row gap (${Math.round(rightGap)}px unused on right)`
            );
          }
        }
      }
    }

    // 4. Transport controls overlap & clipping check
    const transportControls = document.querySelector('.transport-controls');
    let visualTransportOrder = [];
    if (transportControls && isVisible(transportControls)) {
      const children = Array.from(transportControls.children).filter(isVisible);
      const rects = children.map(rectOf);
      checkNoOverlap(rects, 'transport-controls');
      checkInViewportX(rects, 'transport-controls');
      const rows = groupRows(rects);
      visualTransportOrder = rows.flat().map((r) => r.controlId).filter(Boolean);
    }

    // 5. Main metrics grid geometry & visual reading order
    const visualMainTileOrder = options.skipMainGrid
      ? []
      : checkGridSymmetry('.metrics-grid', ':scope > [data-tile-id]', 'metrics-grid', 130, 110);

    // 6. Focus Mode 4-grid geometry (when open)
    const focusModal = document.getElementById('focus-workout-modal');
    let visualFocusTileOrder = [];
    if (focusModal && isVisible(focusModal)) {
      visualFocusTileOrder = checkGridSymmetry(
        '.focus-four-grid',
        ':scope > [data-tile-id]',
        'focus-four-grid',
        125,
        105
      );
      const focusTopbarActions = focusModal.querySelector('.focus-topbar-actions');
      if (focusTopbarActions && isVisible(focusTopbarActions)) {
        const fBtns = Array.from(focusTopbarActions.children).filter(isVisible).map(rectOf);
        checkNoOverlap(fBtns, 'focus-topbar-actions');
        checkInViewportX(fBtns, 'focus-topbar-actions');
      }
    }

    // 7. Secondary strip (when visible)
    const secStrip = document.querySelector('.secondary-strip');
    let visualSecondaryOrder = [];
    if (secStrip && isVisible(secStrip)) {
      const items = Array.from(secStrip.querySelectorAll(':scope > [data-stat-id]')).filter(isVisible);
      const rects = items.map(rectOf);
      checkNoOverlap(rects, 'secondary-strip');
      checkInViewportX(rects, 'secondary-strip');
      visualSecondaryOrder = groupRows(rects).flat().map((r) => r.statId);
    }

    // 8. Customize Layout Modal (when open)
    const layoutModal = document.getElementById('customize-layout-modal');
    if (layoutModal && isVisible(layoutModal)) {
      const mr = layoutModal.getBoundingClientRect();
      if (mr.left < -1 || mr.right > vw + 1 || mr.height > vh + 1) {
        errors.push(`customize-layout-modal escapes viewport (${Math.round(mr.width)}x${Math.round(mr.height)} in ${vw}x${vh})`);
      }
      const modalOverflow = layoutModal.scrollWidth - layoutModal.clientWidth;
      if (modalOverflow > 2) {
        errors.push(`customize-layout-modal overflows horizontally by ${Math.round(modalOverflow)}px`);
      }
      const presetBtns = Array.from(layoutModal.querySelectorAll('.layout-preset-btn'))
        .filter(isVisible)
        .map(rectOf);
      checkNoOverlap(presetBtns, 'layout-presets');
      checkInViewportX(presetBtns, 'layout-presets');

      const orderRows = Array.from(layoutModal.querySelectorAll('.layout-order-row'))
        .filter(isVisible)
        .map(rectOf);
      checkNoOverlap(orderRows, 'layout-order-rows');
      checkInViewportX(orderRows, 'layout-order-rows');
    }

    return {
      errors,
      visualMainTileOrder,
      visualFocusTileOrder,
      visualTopbarOrder,
      visualTransportOrder,
      visualSecondaryOrder,
    };
  }, opts);

  if (report.errors.length > 0) {
    throw new Error(`[Visual Audit Failed: ${label}]\n  - ${report.errors.join('\n  - ')}`);
  }

  if (opts.expectedMainTiles) {
    assert.deepEqual(
      report.visualMainTileOrder,
      opts.expectedMainTiles,
      `${label}: expected visual main tiles ${JSON.stringify(opts.expectedMainTiles)}, got ${JSON.stringify(report.visualMainTileOrder)}`
    );
  }
  if (opts.expectedFocusTiles) {
    assert.deepEqual(
      report.visualFocusTileOrder,
      opts.expectedFocusTiles,
      `${label}: expected visual focus tiles ${JSON.stringify(opts.expectedFocusTiles)}, got ${JSON.stringify(report.visualFocusTileOrder)}`
    );
  }
  if (opts.expectedTopbarActions) {
    assert.deepEqual(
      report.visualTopbarOrder,
      opts.expectedTopbarActions,
      `${label}: expected visual topbar actions ${JSON.stringify(opts.expectedTopbarActions)}, got ${JSON.stringify(report.visualTopbarOrder)}`
    );
  }
  if (opts.expectedTransportControls) {
    assert.deepEqual(
      report.visualTransportOrder,
      opts.expectedTransportControls,
      `${label}: expected visual transport controls ${JSON.stringify(opts.expectedTransportControls)}, got ${JSON.stringify(report.visualTransportOrder)}`
    );
  }
  if (opts.expectedSecondaryStats) {
    assert.deepEqual(
      report.visualSecondaryOrder,
      opts.expectedSecondaryStats,
      `${label}: expected visual secondary stats ${JSON.stringify(opts.expectedSecondaryStats)}, got ${JSON.stringify(report.visualSecondaryOrder)}`
    );
  }

  return report;
}

async function seedLayoutAndReload(page, url, prefs, extra = {}) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ prefsPayload, gaugeMode }) => {
      window.localStorage.clear();
      window.sessionStorage.setItem('jbf-ble-banner-dismissed', '1');
      if (prefsPayload) {
        window.localStorage.setItem('jbf_layout_prefs_v1', JSON.stringify(prefsPayload));
      }
      if (gaugeMode) {
        window.localStorage.setItem('jbf_gauge_mode_v1', gaugeMode);
      }
    },
    { prefsPayload: prefs, gaugeMode: extra.gaugeMode || 'rings' }
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.metrics-grid > [data-tile-id]');
}

async function run() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error('dist/index.html not found — run `npm run build` before `npm run test:visual`.');
  }

  const executablePath = findChromiumExecutable();
  const { server, url } = await startStaticServer(DIST_DIR);
  let browser;
  let passedChecks = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const SCENARIOS = [
      {
        name: 'default-6-tiles',
        prefs: null,
        expectedDesktop: ['power', 'cadence', 'hr', 'stats', 'interval', 'zones'],
        expectedPortrait: ['power', 'cadence', 'hr', 'stats'],
        expectedLandscape: ['power', 'cadence', 'hr'],
        expectedFocus: ['power', 'cadence', 'hr', 'stats'],
        expectedTopbar: ['sensors', 'youtube', 'pip', 'simulate', 'history'],
        expectedTransport: ['gaugeMode', 'focus', 'rideAction', 'audio'],
      },
      {
        name: 'no-hr-speed-distance-6',
        prefs: {
          tileOrder: ['power', 'cadence', 'speed', 'distance', 'stats', 'interval'],
          secondaryStatOrder: ['speed', 'distance', 'calories', 'avgPower', 'burnTime'],
          topbarActionOrder: ['sensors', 'youtube', 'pip', 'simulate', 'history'],
          transportControlOrder: ['gaugeMode', 'focus', 'rideAction', 'audio'],
        },
        simulate: true,
        workoutId: 'jbf-23-burn',
        expectedDesktop: ['power', 'cadence', 'speed', 'distance', 'stats', 'interval'],
        expectedPortrait: ['power', 'cadence', 'speed', 'distance'],
        expectedLandscape: ['power', 'cadence', 'speed'],
        expectedFocus: ['power', 'cadence', 'speed', 'distance'],
        expectedTopbar: ['sensors', 'youtube', 'pip', 'simulate', 'history'],
        expectedTransport: ['gaugeMode', 'focus', 'rideAction', 'audio'],
      },
      {
        name: 'clean-4-tiles-custom-icons',
        prefs: {
          tileOrder: ['power', 'cadence', 'speed', 'distance'],
          secondaryStatOrder: ['calories', 'avgPower', 'burnTime', 'speed', 'distance'],
          topbarActionOrder: ['history', 'pip', 'sensors', 'youtube', 'simulate'],
          transportControlOrder: ['audio', 'rideAction', 'focus', 'gaugeMode'],
        },
        expectedDesktop: ['power', 'cadence', 'speed', 'distance'],
        expectedPortrait: ['power', 'cadence', 'speed', 'distance'],
        expectedLandscape: ['power', 'cadence', 'speed'],
        expectedFocus: ['power', 'cadence', 'speed', 'distance'],
        expectedTopbar: ['history', 'pip', 'sensors', 'youtube', 'simulate'],
        expectedTransport: ['audio', 'rideAction', 'focus', 'gaugeMode'],
        expectedSecondary: ['calories', 'avgPower', 'burnTime', 'speed', 'distance'],
      },
      {
        name: 'custom-5-tiles-balanced-rows',
        prefs: {
          tileOrder: ['distance', 'power', 'speed', 'calories', 'avgPower'],
          secondaryStatOrder: ['burnTime', 'avgPower', 'calories', 'distance', 'speed'],
          topbarActionOrder: ['youtube', 'simulate', 'history', 'pip', 'sensors'],
          transportControlOrder: ['rideAction', 'gaugeMode', 'audio', 'focus'],
        },
        expectedDesktop: ['distance', 'power', 'speed', 'calories', 'avgPower'],
        expectedPortrait: ['distance', 'power', 'speed', 'calories'],
        expectedLandscape: ['distance', 'power', 'speed'],
        expectedFocus: ['distance', 'power', 'speed', 'calories'],
        expectedTopbar: ['youtube', 'simulate', 'history', 'pip', 'sensors'],
        expectedTransport: ['rideAction', 'gaugeMode', 'audio', 'focus'],
        expectedSecondary: ['burnTime', 'avgPower', 'calories', 'distance', 'speed'],
      },
      {
        name: 'minimal-3-tiles',
        prefs: {
          tileOrder: ['power', 'speed', 'distance'],
          secondaryStatOrder: ['calories', 'avgPower', 'burnTime', 'speed', 'distance'],
          topbarActionOrder: ['pip', 'sensors', 'youtube', 'simulate', 'history'],
          transportControlOrder: ['focus', 'rideAction', 'gaugeMode', 'audio'],
        },
        expectedDesktop: ['power', 'speed', 'distance'],
        expectedPortrait: ['power', 'speed', 'distance'],
        expectedLandscape: ['power', 'speed', 'distance'],
        expectedFocus: ['power', 'speed', 'distance'],
        expectedTopbar: ['pip', 'sensors', 'youtube', 'simulate', 'history'],
        expectedTransport: ['focus', 'rideAction', 'gaugeMode', 'audio'],
        expectedSecondary: ['calories', 'avgPower', 'burnTime', 'speed', 'distance'],
      },
    ];

    // 1. Audit every layout scenario across all 4 responsive viewports (Rings + Focus Mode)
    for (const scenario of SCENARIOS) {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await seedLayoutAndReload(page, url, scenario.prefs);

        if (scenario.workoutId) {
          await page.selectOption('#workout-template-select', scenario.workoutId);
        }
        if (scenario.simulate) {
          await page.click('#toggle-sim-quick-btn');
          await page.waitForSelector('#simulator-controls-bar');
        }

        const expectedMainTiles =
          vp.name === 'phone-portrait'
            ? scenario.expectedPortrait
            : vp.name === 'phone-landscape'
              ? scenario.expectedLandscape
              : scenario.expectedDesktop;

        await auditLayout(page, `${scenario.name} @ ${vp.name}`, {
          expectedMainTiles,
          expectedTopbarActions: scenario.expectedTopbar,
          expectedTransportControls: scenario.expectedTransport,
          expectedSecondaryStats: scenario.expectedSecondary,
        });
        passedChecks++;

        if (
          (scenario.name === 'no-hr-speed-distance-6' && (vp.name === 'desktop' || vp.name === 'phone-portrait')) ||
          (scenario.name === 'custom-5-tiles-balanced-rows' && (vp.name === 'desktop' || vp.name === 'phone-portrait')) ||
          (scenario.name === 'clean-4-tiles-custom-icons' && (vp.name === 'desktop' || vp.name === 'phone-portrait'))
        ) {
          await maybeCapture(page, `${scenario.name}-${vp.name}.png`);
        }

        // Open Focus Mode and verify its layout & tile order on this viewport too
        await page.click('#open-focus-mode-btn');
        await page.waitForSelector('#focus-workout-modal');
        await auditLayout(page, `${scenario.name} Focus Mode @ ${vp.name}`, {
          skipMainGrid: true,
          expectedFocusTiles: scenario.expectedFocus,
        });
        passedChecks++;

        if (scenario.name === 'no-hr-speed-distance-6' && vp.name === 'phone-portrait') {
          await maybeCapture(page, `focus-no-hr-${vp.name}.png`);
        }

        await page.click('#close-focus-modal-btn');
        await page.waitForSelector('#focus-workout-modal', { state: 'detached' });
      }
    }

    // 2. Audit Bars Mode with No-HR custom gauges across Desktop & Phone Portrait
    const noHrPrefs = SCENARIOS[1].prefs;
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedLayoutAndReload(page, url, noHrPrefs, { gaugeMode: 'bars' });
      await auditLayout(page, `bars-mode-no-hr @ ${vp.name}`, {
        expectedMainTiles: ['power', 'cadence', 'speed'],
        expectedSecondaryStats: noHrPrefs.secondaryStatOrder,
      });
      passedChecks++;
    }

    // 3. Audit Split YouTube Mode with customized tiles on Desktop & Tablet
    for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedLayoutAndReload(page, url, noHrPrefs);
      await page.click('#toggle-youtube-btn');
      await page.waitForSelector('.studio-workspace.split-youtube');
      await auditLayout(page, `split-youtube-no-hr @ ${vp.name}`, {
        expectedMainTiles:
          vp.name === 'desktop'
            ? ['power', 'cadence', 'speed', 'distance']
            : ['power', 'cadence', 'speed'],
      });
      passedChecks++;
    }

    // 4. Audit Customize Layout Modal (both tabs + Swap-In picker) & Inline Arrange Mode across ALL 4 viewports
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedLayoutAndReload(page, url, null);

      await page.click('#customize-layout-btn');
      await page.waitForSelector('#customize-layout-modal');
      await page.click('#swap-tile-speed');
      await auditLayout(page, `customize-modal-tiles @ ${vp.name}`, { skipMainGrid: true });
      passedChecks++;

      if (vp.name === 'desktop' || vp.name === 'phone-portrait') {
        await maybeCapture(page, `customize-modal-tiles-${vp.name}.png`);
      }

      await page.click('#layout-tab-controls');
      await page.waitForSelector('#layout-panel-controls');
      await auditLayout(page, `customize-modal-controls @ ${vp.name}`, { skipMainGrid: true });
      passedChecks++;

      // Enter Inline Arrange Mode and audit live screen geometry
      await page.click('#start-inline-arrange-btn');
      await page.waitForSelector('#arrange-mode-banner');
      await auditLayout(page, `inline-arrange-mode @ ${vp.name}`);
      passedChecks++;

      if (vp.name === 'desktop' || vp.name === 'phone-portrait') {
        await maybeCapture(page, `arrange-mode-${vp.name}.png`);
      }

      await page.click('#finish-arrange-layout-btn');
      await page.waitForSelector('#arrange-mode-banner', { state: 'detached' });
    }

    // 5. Full Interactive E2E: Click Customize -> Swap HR for Distance -> Move Distance to #1 ->
    //    Move YouTube to #1 -> Reload page -> Verify visual positions persist -> Reset to Default
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedLayoutAndReload(page, url, null);
    await page.click('#customize-layout-btn');
    await page.click('#swap-tile-distance');
    await page.click('#swap-distance-into-hr');
    await page.click('#cockpit-tiles-order-list-up-distance');
    await page.click('#cockpit-tiles-order-list-up-distance');
    await page.click('#layout-tab-controls');
    await page.click('#topbar-actions-order-list-up-youtube');
    await page.click('#save-layout-done-btn');

    await auditLayout(page, 'interactive-custom-order-before-reload', {
      expectedMainTiles: ['distance', 'power', 'cadence', 'stats', 'interval', 'zones'],
      expectedTopbarActions: ['youtube', 'sensors', 'pip', 'simulate', 'history'],
    });
    passedChecks++;

    // Reload and verify rendered coordinates persisted
    await page.reload({ waitUntil: 'networkidle' });
    await auditLayout(page, 'interactive-custom-order-after-reload', {
      expectedMainTiles: ['distance', 'power', 'cadence', 'stats', 'interval', 'zones'],
      expectedTopbarActions: ['youtube', 'sensors', 'pip', 'simulate', 'history'],
    });
    passedChecks++;

    // Reset to Default and verify restored coordinates
    await page.click('#customize-layout-btn');
    await page.click('#reset-layout-defaults-btn');
    await page.click('#save-layout-done-btn');
    await auditLayout(page, 'interactive-reset-default', {
      expectedMainTiles: ['power', 'cadence', 'hr', 'stats', 'interval', 'zones'],
      expectedTopbarActions: ['sensors', 'youtube', 'pip', 'simulate', 'history'],
    });
    passedChecks++;

    // 6. Audit Multi-Sport Modes (Running & Rowing + Simulators + Focus Mode) on Desktop & Phone Portrait
    for (const sport of [
      { id: 'running', btn: '#sport-mode-running-btn', workout: 'run-distance-5k' },
      { id: 'rowing', btn: '#sport-mode-rowing-btn', workout: 'row-distance-2k' },
    ]) {
      for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await seedLayoutAndReload(page, url, null);
        await page.click(sport.btn);
        await page.selectOption('#workout-template-select', sport.workout);
        await page.click('#toggle-sim-quick-btn');
        await page.waitForSelector('#simulator-controls-bar');
        await auditLayout(page, `sport-${sport.id} @ ${vp.name}`);
        passedChecks++;

        await page.click('#open-focus-mode-btn');
        await page.waitForSelector('#focus-workout-modal');
        await auditLayout(page, `sport-${sport.id}-focus @ ${vp.name}`, { skipMainGrid: true });
        passedChecks++;
        await page.click('#close-focus-modal-btn');
        await page.waitForSelector('#focus-workout-modal', { state: 'detached' });
      }
    }

    assert.equal(
      pageErrors.length,
      0,
      `Uncaught browser runtime errors occurred:\n${pageErrors.join('\n')}`
    );

    console.log(
      `✓ Visual & Layout Geometry Suite passed (${passedChecks} viewport/layout audits, 0 overlaps, 0 overflows, 0 orphan gaps, 0 runtime errors)`
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
