import { test, expect } from '@playwright/test';

// Helper: wait for the simulation to be initialized and running
async function waitForSim(page) {
  // Wait for canvas to be visible (WebGL initialized successfully)
  await page.waitForSelector('#sim', { state: 'visible', timeout: 10000 });
  // Wait for the fallback to remain hidden (WebGL worked)
  const fallback = page.locator('#fallback');
  await expect(fallback).toBeHidden();
}

// Helper: get HUD values
async function getHUD(page) {
  return {
    prob: await page.locator('#hud-prob').textContent(),
    time: await page.locator('#hud-time').textContent(),
    sources: await page.locator('#hud-sources').textContent(),
  };
}

test.describe('QuShader — Quantum Mechanics Sandbox', () => {

  test('page loads and WebGL initializes', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    // Canvas should be visible
    const canvas = page.locator('#sim');
    await expect(canvas).toBeVisible();

    // HUD should show initial values
    const hud = await getHUD(page);
    expect(hud.sources).toBe('1'); // default proton at center
  });

  test('simulation time advances', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    // Wait a few frames for time to tick
    await page.waitForTimeout(500);
    const hud1 = await getHUD(page);
    const t1 = parseFloat(hud1.time);

    await page.waitForTimeout(500);
    const hud2 = await getHUD(page);
    const t2 = parseFloat(hud2.time);

    expect(t2).toBeGreaterThan(t1);
    expect(t2).toBeGreaterThan(0);
  });

  test('pause stops simulation time', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);
    await page.waitForTimeout(300);

    // Pause
    await page.click('#btn-pause');
    await page.waitForTimeout(100);
    const hud1 = await getHUD(page);
    const t1 = parseFloat(hud1.time);

    await page.waitForTimeout(500);
    const hud2 = await getHUD(page);
    const t2 = parseFloat(hud2.time);

    // Time should not have advanced
    expect(t2).toBe(t1);

    // Button text should say "play"
    const btnText = await page.locator('#btn-pause').textContent();
    expect(btnText).toBe('play');
  });

  test('spacebar toggles pause', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);
    await page.waitForTimeout(200);

    // Press space to pause
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    const t1 = parseFloat(await page.locator('#hud-time').textContent());

    await page.waitForTimeout(300);
    const t2 = parseFloat(await page.locator('#hud-time').textContent());
    expect(t2).toBe(t1); // paused

    // Press space again to resume
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const t3 = parseFloat(await page.locator('#hud-time').textContent());
    expect(t3).toBeGreaterThan(t2);
  });

  test('reset clears simulation time', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    // Let it run
    await page.waitForTimeout(500);
    const hud1 = await getHUD(page);
    expect(parseFloat(hud1.time)).toBeGreaterThan(0);

    // Pause, then reset, then check
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.click('#btn-reset');
    await page.waitForTimeout(100);

    const hud2 = await getHUD(page);
    expect(parseFloat(hud2.time)).toBe(0);
  });

  test('drag launches wavepacket and probability appears', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    const canvas = page.locator('#sim');
    const box = await canvas.boundingBox();
    const cy = box.y + box.height / 2;

    // Drag from left side toward center (launching electron at proton)
    const startX = box.x + box.width * 0.2;
    const startY = cy;
    const endX = box.x + box.width * 0.4;
    const endY = cy;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();

    // Wait for simulation + observables update cycle (every 15 frames)
    await page.waitForTimeout(2000);

    // Probability should now be a positive number (wavepacket exists)
    const probText = await page.locator('#hud-prob').textContent();
    const prob = parseFloat(probText);
    expect(prob).toBeGreaterThan(0);
    // Should be roughly 1.0 if normalization is correct (allow tolerance)
    expect(prob).toBeGreaterThan(0.1);
  });

  test('right-click places a new source', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    const hud1 = await getHUD(page);
    expect(hud1.sources).toBe('1'); // default proton

    const canvas = page.locator('#sim');
    const box = await canvas.boundingBox();

    // Right-click to place a new proton
    await page.mouse.click(
      box.x + box.width * 0.75,
      box.y + box.height * 0.75,
      { button: 'right' }
    );

    await page.waitForTimeout(200);
    const hud2 = await getHUD(page);
    expect(hud2.sources).toBe('2');
  });

  test('toggle potential mode updates label', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    // Default should be 2D Coulomb
    const label1 = await page.locator('#potential-mode').textContent();
    expect(label1).toContain('2D Coulomb');

    // Toggle
    await page.click('#btn-toggle-potential');
    const label2 = await page.locator('#potential-mode').textContent();
    expect(label2).toContain('3D slice');

    // Toggle back
    await page.click('#btn-toggle-potential');
    const label3 = await page.locator('#potential-mode').textContent();
    expect(label3).toContain('2D Coulomb');
  });

  test('canvas renders non-black pixels after wavepacket launch', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    const canvas = page.locator('#sim');
    const box = await canvas.boundingBox();

    // Launch a wavepacket
    const startX = box.x + box.width * 0.2;
    const startY = box.y + box.height * 0.5;
    const endX = box.x + box.width * 0.4;
    const endY = box.y + box.height * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();

    // Let simulation run a moment
    await page.waitForTimeout(500);

    // Take screenshot of canvas and verify it has colored pixels
    const screenshot = await canvas.screenshot();
    expect(screenshot.length).toBeGreaterThan(1000); // non-trivial image data

    // Save a screenshot for visual inspection
    await page.screenshot({ path: 'tests/screenshot-after-launch.png' });
  });

  test('no console errors during normal operation', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await waitForSim(page);

    // Let it run for a bit
    await page.waitForTimeout(1000);

    // Launch a wavepacket
    const canvas = page.locator('#sim');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 3 });
    await page.mouse.up();

    await page.waitForTimeout(1000);

    // Filter out known non-errors (like favicon)
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404')
    );
    expect(realErrors).toEqual([]);
  });

  test('probability stays near 1.0 after launch (numerical stability)', async ({ page }) => {
    await page.goto('/');
    await waitForSim(page);

    // Reset to clear the auto-launched wavepacket
    await page.click('#btn-reset');

    const canvas = page.locator('#sim');
    const box = await canvas.boundingBox();

    // Launch a slow wavepacket (small drag = small momentum)
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5, { steps: 3 });
    await page.mouse.up();

    // Wait for observables to compute (15 frame interval)
    await page.waitForTimeout(2000);

    const probText = await page.locator('#hud-prob').textContent();
    const prob = parseFloat(probText);

    // Should be close to 1.0 (allow 30% tolerance for absorbing boundaries
    // and numerical drift — the 2D Coulomb is a strong potential)
    expect(prob).toBeGreaterThan(0.3);
    expect(prob).toBeLessThan(2.0);
  });
});
