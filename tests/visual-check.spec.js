import { test } from '@playwright/test';

// One-off visual check — launch a wavepacket at the proton and screenshot at several times
test('visual: wavepacket scattering off proton', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#sim', { state: 'visible', timeout: 10000 });

  const canvas = page.locator('#sim');
  const box = await canvas.boundingBox();

  // Launch a moderate-speed wavepacket from the left toward center proton
  const startX = box.x + box.width * 0.15;
  const startY = box.y + box.height * 0.5;
  const endX = box.x + box.width * 0.35;
  const endY = box.y + box.height * 0.48; // slight angle

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();

  // Screenshot at t ≈ 1s (early propagation)
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tests/visual-1s.png' });

  // Screenshot at t ≈ 3s (approaching proton)
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/visual-3s.png' });

  // Screenshot at t ≈ 6s (scattering)
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/visual-6s.png' });
});
