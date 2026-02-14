/* ============================================================
   MEMENTO MORI — INTERACTIVE APP
   Modules: Settings, Renderer, App
   ============================================================ */

; (function () {
  'use strict';

  /* --------------------------------------------------------
     SETTINGS MODULE
     Handles localStorage persistence and state management
  -------------------------------------------------------- */
  class Settings {
    constructor() {
      this.defaults = {
        theme: 'dark',        // 'dark' | 'light'
        accentColor: '#f28c38',
        dotSize: 3.5,
        glowEnabled: true,
        showClock: true,
      };
      this.state = this.load();
      this.apply();
    }

    load() {
      const saved = localStorage.getItem('memento_settings');
      return saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults };
    }

    save() {
      localStorage.setItem('memento_settings', JSON.stringify(this.state));
      this.apply();
    }

    reset() {
      this.state = { ...this.defaults };
      this.save();
    }

    update(key, value) {
      this.state[key] = value;
      this.save();
    }

    get(key) {
      return this.state[key];
    }

    apply() {
      // 1. Theme
      document.documentElement.setAttribute('data-theme', this.state.theme);

      // 2. Accent Color
      document.documentElement.style.setProperty('--accent-color', this.state.accentColor);

      // 3. Clock Visibility
      const clockContainer = document.getElementById('clock-container');
      if (this.state.showClock) {
        clockContainer.classList.remove('hidden');
      } else {
        clockContainer.classList.add('hidden');
      }
    }
  }

  /* --------------------------------------------------------
     RENDERER MODULE
     Handles Canvas drawing and animation loop
  -------------------------------------------------------- */
  class Renderer {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.settings = settings;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.animFrame = null;

      // Configuration constants
      this.cols = 7;
      this.dotGapX = 28;
      this.dotGapY = 14;

      // Animation state
      this.startTime = performance.now();

      // Data
      this.grid = [];
    }

    resize() {
      // Calculate required size based on grid
      if (!this.grid.length) return;

      const rows = this.grid.length;
      const width = this.cols * this.dotGapX;
      const height = rows * this.dotGapY;

      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.canvas.width = width * this.dpr;
      this.canvas.height = height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    buildGrid(year, currentDayOfYear) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      const totalDays = isLeap ? 366 : 365;

      // 0 = Sun, but we want 0 = Mon. So shift:
      // JS Day: 0(Sun), 1(Mon)...
      // Target: 0(Mon)... 6(Sun)
      let startDay = new Date(year, 0, 1).getDay(); // 0=Sun
      let offset = (startDay + 6) % 7; // 0=Mon

      const totalCells = offset + totalDays;
      const rows = Math.ceil(totalCells / this.cols);

      this.grid = [];
      let dayCount = 1;

      for (let r = 0; r < rows; r++) {
        const rowData = [];
        for (let c = 0; c < this.cols; c++) {
          const idx = r * this.cols + c;
          if (idx < offset || dayCount > totalDays) {
            rowData.push(null);
          } else {
            let status = 'future';
            if (dayCount < currentDayOfYear) status = 'past';
            else if (dayCount === currentDayOfYear) status = 'today';

            rowData.push({ day: dayCount, status });
            dayCount++;
          }
        }
        this.grid.push(rowData);
      }

      this.resize();
    }

    draw(timestamp) {
      const { dotSize, glowEnabled, accentColor } = this.settings.state;
      const elapsed = timestamp - this.startTime;

      // Clear
      this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);

      // Styles
      // We get colors from CSS variables for full theme support
      const styleInfo = getComputedStyle(document.documentElement);
      const pastColor = styleInfo.getPropertyValue('--dot-past').trim();
      const futureColor = styleInfo.getPropertyValue('--dot-future').trim();
      // Accent color is already applied to CSS var, but we also have it in settings
      // We'll use the settings one for JS drawing to be responsive

      const radius = parseFloat(dotSize);
      const gapX = this.dotGapX;
      const gapY = this.dotGapY;
      const halfX = gapX / 2;
      const halfY = gapY / 2;

      this.grid.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (!cell) return;

          const cx = halfX + c * gapX;
          const cy = halfY + r * gapY;

          this.ctx.beginPath();
          this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);

          if (cell.status === 'past') {
            this.ctx.fillStyle = pastColor;
            this.ctx.fill();
          } else if (cell.status === 'future') {
            this.ctx.fillStyle = futureColor;
            this.ctx.fill();
          } else if (cell.status === 'today') {
            // Glow effect
            if (glowEnabled) {
              const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.002);
              const maxGlow = radius * 3;

              const grad = this.ctx.createRadialGradient(cx, cy, radius, cx, cy, maxGlow);
              // Convert hex to rgba for gradient
              // Simple hack: assume accentColor is hex.
              // For robustness, we just use globalalpha or similar, but let's try a simple approach
              this.ctx.globalAlpha = 0.3 * pulse;
              this.ctx.fillStyle = accentColor;
              this.ctx.beginPath();
              this.ctx.arc(cx, cy, maxGlow, 0, Math.PI * 2);
              this.ctx.fill();
              this.ctx.globalAlpha = 1.0;
            }

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2); // slightly larger
            this.ctx.fillStyle = accentColor;
            this.ctx.fill();

            // Core shine
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = accentColor;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
          }
        });
      });

      this.animFrame = requestAnimationFrame(this.draw.bind(this));
    }

    start() {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      this.startTime = performance.now();
      this.draw(this.startTime);
    }

    stop() {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
    }
  }

  /* --------------------------------------------------------
     APP CONTROLLER
     glues everything together
  -------------------------------------------------------- */
  class App {
    constructor() {
      this.settings = new Settings();
      this.canvas = document.getElementById('calendar-canvas');
      this.renderer = new Renderer(this.canvas, this.settings);

      this.clockEl = document.getElementById('clock');
      this.dateEl = document.getElementById('date-display');

      this.initUI();
      this.startClock();
      this.updateCalendar();

      // Handle window resize
      window.addEventListener('resize', () => {
        this.renderer.resize();
      });

      // Start render loop
      this.renderer.start();
    }

    now() {
      const d = new Date();
      return {
        date: d,
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        hours: d.getHours(),
        minutes: d.getMinutes(),
      };
    }

    dayOfYear(date) {
      const start = new Date(date.getFullYear(), 0, 0);
      const diff = date - start;
      const oneDay = 1000 * 60 * 60 * 24;
      return Math.floor(diff / oneDay);
    }

    startClock() {
      const update = () => {
        const { date, hours, minutes } = this.now();
        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        const timeStr = `${hh}:${mm}`;

        if (this.clockEl.textContent !== timeStr) {
          this.clockEl.textContent = timeStr;
        }

        // Date: "Monday, 14 February 2026"
        const dateStr = date.toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        if (this.dateEl.textContent !== dateStr) {
          this.dateEl.textContent = dateStr;
        }
      };

      update();
      setInterval(update, 1000);

      // Check for midnight refresh
      setInterval(() => {
        const n = new Date();
        if (n.getHours() === 0 && n.getMinutes() === 0 && n.getSeconds() === 0) {
          this.updateCalendar();
        }
      }, 1000);
    }

    updateCalendar() {
      const { date, year } = this.now();
      const doy = this.dayOfYear(date);
      this.renderer.buildGrid(year, doy);
    }

    initUI() {
      // Toggle Panel
      const btn = document.getElementById('settings-toggle');
      const panel = document.getElementById('settings-panel');
      const close = document.getElementById('settings-close');

      const toggleFn = () => panel.classList.toggle('hidden');
      btn.addEventListener('click', toggleFn);
      close.addEventListener('click', toggleFn);

      // Inputs
      const s = this.settings;

      // Helper to bind input to setting
      const bind = (id, key, event = 'input', transform = v => v) => {
        const el = document.getElementById(id);
        if (!el) return;

        // Init value
        if (el.type === 'checkbox') el.checked = s.get(key);
        else el.value = s.get(key);

        // Listener
        el.addEventListener(event, (e) => {
          const val = el.type === 'checkbox' ? el.checked : transform(e.target.value);
          s.update(key, val);
          s.apply(); // Apply CSS/globals
          // If renderer needs update (like size or color for drawing), specific check:
          // Just let renderer read from reference next frame?
          // Settings passed by reference, so next draw() frame will pick up changes instantly!
        });
      };

      bind('theme-toggle', 'theme', 'change', v => v ? 'light' : 'dark'); // Checkbox logic: checked=light?
      // Wait, let's check logic:
      // UI: Toggle Switch. Label: "Dark / Light".
      // Let's assume unchecked = dark, checked = light.
      const themeToggle = document.getElementById('theme-toggle');
      themeToggle.checked = s.get('theme') === 'light';
      themeToggle.addEventListener('change', (e) => {
        s.update('theme', e.target.checked ? 'light' : 'dark');
        s.apply();
      });

      bind('accent-color', 'accentColor');
      bind('dot-size', 'dotSize');
      bind('glow-toggle', 'glowEnabled', 'change');
      bind('clock-toggle', 'showClock', 'change');

      // Reset
      document.getElementById('reset-settings').addEventListener('click', () => {
        s.reset();
        // Refresh inputs
        themeToggle.checked = s.get('theme') === 'light';
        document.getElementById('accent-color').value = s.get('accentColor');
        document.getElementById('dot-size').value = s.get('dotSize');
        document.getElementById('glow-toggle').checked = s.get('glowEnabled');
        document.getElementById('clock-toggle').checked = s.get('showClock');
      });
    }
  }

  // Start
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
  });

})();
