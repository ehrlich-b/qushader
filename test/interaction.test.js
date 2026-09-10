/**
 * Tests for the Interaction coordinate-transform math and plain public state
 * (src/interaction.js).
 *
 * Scoped strictly to pure math plus public fields/methods -- no DOM, no real
 * mouse/touch/wheel event dispatch. The "canvas" is a plain stub exposing
 * only addEventListener/removeEventListener/getBoundingClientRect, exactly as
 * the constructor needs (it registers listeners and stores state but never
 * reads back from the DOM at construction time).
 *
 * Run with: node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Interaction } from '../src/interaction.js';

// The ONLY canvas-shaped object this suite is allowed to use (per task spec).
function stubCanvas(rect) {
  return {
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return rect; },
  };
}

const RECT = { left: 100, top: 50, width: 800, height: 400 };
const L = 100;

function makeInteraction(rect = RECT, N = 512, dx = 0.2, length = L) {
  return new Interaction(stubCanvas(rect), N, dx, length);
}

// ---------------------------------------------------------------------------
// 1. Construction via the stub succeeds, sigma defaults to 3.0
// ---------------------------------------------------------------------------
test('Interaction constructs with the stub and defaults sigma to 3.0', () => {
  const it = makeInteraction();
  assert.equal(it.sigma, 3.0);
  assert.equal(it.L, L);
  assert.equal(it.dragging, false);
  assert.equal(it.dragStart, null);
  assert.equal(it.dragCurrent, null);
});

// ---------------------------------------------------------------------------
// 2. Hand-derived pixelToAU at a known interior point
// ---------------------------------------------------------------------------
test('pixelToAU(300, 150) => {x:25, y:75} (hand-derived)', () => {
  const it = makeInteraction();
  // nx = (300 - 100) / 800 = 0.25
  // ny = 1 - (150 - 50) / 400 = 1 - 0.25 = 0.75
  // x  = 0.25 * 100 = 25,  y = 0.75 * 100 = 75
  assert.deepEqual(it.pixelToAU(300, 150), { x: 25, y: 75 });
});

// ---------------------------------------------------------------------------
// 3. Y-flip boundary checks: TOP of canvas -> y = L, BOTTOM -> y = 0
// ---------------------------------------------------------------------------
test('pixelToAU Y-flip: top edge -> y=L, bottom edge -> y=0', () => {
  const it = makeInteraction();
  // Top of canvas: py = rect.top = 50 -> ny = 1 - 0 = 1 -> y = L = 100.
  assert.deepEqual(it.pixelToAU(100, RECT.top), { x: 0, y: L });
  assert.equal(it.pixelToAU(300, RECT.top).y, L);
  // Bottom of canvas: py = rect.top + rect.height = 450 -> ny = 1 - 1 = 0 -> y = 0.
  assert.equal(it.pixelToAU(300, RECT.top + RECT.height).y, 0);
  assert.equal(it.pixelToAU(100, RECT.top + RECT.height).y, 0);
});

// ---------------------------------------------------------------------------
// 4. Round-trip identity: auToPixel(pixelToAU(p)) == p (pure algebra, 1e-9)
// ---------------------------------------------------------------------------
test('auToPixel(pixelToAU(p)) recovers p for interior points', () => {
  const it = makeInteraction();
  const points = [
    [100, 50],        // top-left corner of the rect
    [899.9, 449.9],   // near bottom-right corner
    [300, 150],       // the hand-derived point
    [505.5, 273.25],  // arbitrary
    [100.1, 449.9],   // near bottom-left
    [444.444, 111.333],
  ];
  assert.ok(points.length >= 5, 'must cover at least 5 distinct pairs');
  for (const [px, py] of points) {
    const back = it.auToPixel(...Object.values(it.pixelToAU(px, py)));
    assert.ok(
      Math.abs(back.x - px) < 1e-9 && Math.abs(back.y - py) < 1e-9,
      `round-trip (${px}, ${py}) -> (${back.x}, ${back.y})`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. getDragArrow: null when not dragging; exact passthrough when dragging
// ---------------------------------------------------------------------------
test('getDragArrow: null by default, exact {x1,y1,x2,y2} when dragging', () => {
  const it = makeInteraction();
  assert.equal(it.getDragArrow(), null);

  it.dragging = true;
  it.dragStart = { x: 10, y: 20 };
  it.dragCurrent = { x: 50, y: 90 };
  assert.deepEqual(it.getDragArrow(), { x1: 10, y1: 20, x2: 50, y2: 90 });
});

// ---------------------------------------------------------------------------
// 6. Sigma clamp math (replicated verbatim from the wheel handler, no event)
// ---------------------------------------------------------------------------
test('sigma clamp math: multiplier then clamp keeps sigma inside [0.5, 10.0]', () => {
  // Scroll up (deltaY <= 0) multiplies by 1.1, then clamps to <= 10.0.
  let sigma = 10.0;
  sigma *= -1 > 0 ? 0.9 : 1.1; // replicate: e.deltaY = -1 <= 0 -> * 1.1
  sigma = Math.max(0.5, Math.min(10.0, sigma)); // 11.0 -> clamped to 10.0
  assert.equal(sigma, 10.0, 'sigma must clamp at 10.0, not 11.0');

  // Scroll down (deltaY > 0) multiplies by 0.9, then clamps to >= 0.5.
  sigma = 0.5;
  sigma *= 1 > 0 ? 0.9 : 1.1; // replicate: e.deltaY = 1 > 0 -> * 0.9
  sigma = Math.max(0.5, Math.min(10.0, sigma)); // 0.45 -> clamped to 0.5
  assert.equal(sigma, 0.5, 'sigma must clamp at 0.5, not 0.45');
});
