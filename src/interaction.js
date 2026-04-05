/**
 * Mouse/touch interaction — drag to launch wavepackets, right-click to place sources.
 */

export class Interaction {
  constructor(canvas, N, dx, L) {
    this.canvas = canvas;
    this.N = N;
    this.dx = dx;
    this.L = L; // total grid size in atomic units

    this.sigma = 3.0; // wavepacket width in a0
    this.momentumScale = 0.5; // AU-to-momentum conversion (keep k < pi/dx ≈ 16)

    this.dragging = false;
    this.dragStart = null; // {x, y} in canvas pixels
    this.dragCurrent = null;

    // Callbacks
    this.onLaunch = null;  // (x0, y0, kx, ky, sigma)
    this.onPlace = null;   // (x, y) in atomic units
    this.onRemove = null;  // (x, y) in atomic units

    this._setupEvents();
  }

  /** Convert canvas pixel to atomic units */
  pixelToAU(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = (px - rect.left) / rect.width;
    const ny = 1.0 - (py - rect.top) / rect.height; // flip Y
    return { x: nx * this.L, y: ny * this.L };
  }

  /** Convert atomic units to canvas pixel */
  auToPixel(ax, ay) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (ax / this.L) * rect.width + rect.left,
      y: (1.0 - ay / this.L) * rect.height + rect.top,
    };
  }

  _setupEvents() {
    const c = this.canvas;

    // Prevent context menu on right click
    c.addEventListener('contextmenu', e => e.preventDefault());

    c.addEventListener('mousedown', e => {
      if (e.button === 0) {
        // Left click — start drag
        this.dragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dragCurrent = { x: e.clientX, y: e.clientY };
      } else if (e.button === 2) {
        // Right click — place or remove source
        const au = this.pixelToAU(e.clientX, e.clientY);
        // Try remove first; if nothing nearby, place new
        if (this.onRemove && this.onRemove(au.x, au.y)) {
          // removed
        } else if (this.onPlace) {
          this.onPlace(au.x, au.y);
        }
      }
    });

    c.addEventListener('mousemove', e => {
      if (this.dragging) {
        this.dragCurrent = { x: e.clientX, y: e.clientY };
      }
    });

    c.addEventListener('mouseup', e => {
      if (e.button === 0 && this.dragging) {
        this.dragging = false;
        if (this.onLaunch && this.dragStart) {
          const start = this.pixelToAU(this.dragStart.x, this.dragStart.y);
          const end = this.pixelToAU(e.clientX, e.clientY);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.5) { // minimum drag distance
            const kx = dx * this.momentumScale;
            const ky = dy * this.momentumScale;
            this.onLaunch(start.x, start.y, kx, ky, this.sigma);
          }
        }
        this.dragStart = null;
        this.dragCurrent = null;
      }
    });

    // Scroll to adjust sigma
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.sigma *= e.deltaY > 0 ? 0.9 : 1.1;
      this.sigma = Math.max(0.5, Math.min(10.0, this.sigma));
    }, { passive: false });

    // Touch support
    let touchStart = null;
    let longPressTimer = null;

    c.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
        this.dragging = true;
        this.dragStart = { x: t.clientX, y: t.clientY };
        this.dragCurrent = { x: t.clientX, y: t.clientY };

        // Long press to place source
        longPressTimer = setTimeout(() => {
          this.dragging = false;
          const au = this.pixelToAU(t.clientX, t.clientY);
          if (this.onRemove && this.onRemove(au.x, au.y)) {
            // removed
          } else if (this.onPlace) {
            this.onPlace(au.x, au.y);
          }
          touchStart = null;
        }, 500);
      }
    }, { passive: false });

    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (e.touches.length === 1 && this.dragging) {
        const t = e.touches[0];
        this.dragCurrent = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });

    c.addEventListener('touchend', e => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (this.dragging && touchStart && this.onLaunch) {
        const t = e.changedTouches[0];
        const start = this.pixelToAU(touchStart.x, touchStart.y);
        const end = this.pixelToAU(t.clientX, t.clientY);
        const ddx = end.x - start.x;
        const ddy = end.y - start.y;
        if (Math.hypot(ddx, ddy) > 0.5) {
          this.onLaunch(start.x, start.y, ddx * this.momentumScale, ddy * this.momentumScale, this.sigma);
        }
      }
      this.dragging = false;
      this.dragStart = null;
      this.dragCurrent = null;
      touchStart = null;
    });
  }

  /** Get drag arrow for SVG overlay (canvas pixel coords) */
  getDragArrow() {
    if (!this.dragging || !this.dragStart || !this.dragCurrent) return null;
    return {
      x1: this.dragStart.x,
      y1: this.dragStart.y,
      x2: this.dragCurrent.x,
      y2: this.dragCurrent.y,
    };
  }
}
