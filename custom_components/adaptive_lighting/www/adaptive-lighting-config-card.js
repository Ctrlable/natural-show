/**
 * Adaptive Lighting Config Card
 * Custom Lovelace card for Home Assistant
 *
 * Features:
 *  - Area/room expandable tree with per-light checkboxes
 *  - Standard entity picker for individual selection
 *  - Live circadian preview simulator (brightness + color temp charts)
 *  - Pre-selects configured lights when editing an existing instance
 *  - Persistent save via custom backend API (with runtime fallback)
 */

// ============================================================
//  Math utilities — JS port of color_and_brightness.py
// ============================================================

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(x, x1, x2, y1, y2) {
  if (x2 === x1) return y1;
  return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
}

function findAB(x1, x2, y1, y2) {
  const atanh = z => Math.log((1 + z) / (1 - z)) / 2;
  const a = (atanh(2 * y2 - 1) - atanh(2 * y1 - 1)) / (x2 - x1);
  const b = x1 - (atanh(2 * y1 - 1) / a);
  return { a, b };
}

function scaledTanh(x, x1, x2, y1 = 0.05, y2 = 0.95, yMin = 0, yMax = 100) {
  const { a, b } = findAB(x1, x2, y1, y2);
  return yMin + (yMax - yMin) * 0.5 * (Math.tanh(a * (x - b)) + 1);
}

/**
 * Sun position in [-1, 1]:
 *   -1 = solar midnight (deepest night)
 *    0 = sunrise or sunset
 *   +1 = solar noon
 *
 * Mirrors the parabolic formula in SunEvents.sun_position().
 */
function sunPosition(hour, sunriseH, sunsetH) {
  const noonH = (sunriseH + sunsetH) / 2;
  let midnightH = sunsetH + (sunriseH + 24 - sunsetH) / 2;
  if (midnightH >= 24) midnightH -= 24;

  // Rotate frame so midnight == 0
  const shift = h => ((h - midnightH) + 24) % 24;
  const tS = shift(hour);
  const riseS = shift(sunriseH);
  const noonS = shift(noonH);
  const setS  = shift(sunsetH);

  if (tS < riseS) {
    // Midnight → Sunrise: -1 → 0
    return -(1 - Math.pow(tS / riseS, 2));
  } else if (tS <= noonS) {
    // Sunrise → Noon: 0 → 1
    return 1 - Math.pow((tS - noonS) / (noonS - riseS), 2);
  } else if (tS <= setS) {
    // Noon → Sunset: 1 → 0
    return 1 - Math.pow((tS - noonS) / (noonS - setS), 2);
  } else {
    // Sunset → Midnight: 0 → -1
    return -(1 - Math.pow((tS - 24) / (24 - setS), 2));
  }
}

/** Signed distance (hours) from `hour` to the nearest sunrise or sunset. */
function closestSunEvent(hour, sunriseH, sunsetH) {
  const wrapDist = (a, b) => {
    const d = a - b;
    if (d > 12)  return d - 24;
    if (d < -12) return d + 24;
    return d;
  };
  const dr = Math.abs(wrapDist(hour, sunriseH));
  const ds = Math.abs(wrapDist(hour, sunsetH));
  if (dr <= ds) return { event: 'sunrise', distHours: wrapDist(hour, sunriseH) };
  return { event: 'sunset', distHours: wrapDist(hour, sunsetH) };
}

function brightnessAtHour(hour, params) {
  const { sunriseH, sunsetH, minBrightness, maxBrightness,
          brightnessMode, darkTimeSec, lightTimeSec,
          isSleep, sleepBrightness } = params;

  if (isSleep) return sleepBrightness;

  if (brightnessMode === 'default') {
    const pos = sunPosition(hour, sunriseH, sunsetH);
    if (pos > 0) return maxBrightness;
    return (maxBrightness - minBrightness) * (1 + pos) + minBrightness;
  }

  const { event, distHours } = closestSunEvent(hour, sunriseH, sunsetH);
  const distSec = distHours * 3600;

  if (brightnessMode === 'linear') {
    const b = event === 'sunrise'
      ? lerp(distSec, -darkTimeSec,  lightTimeSec, minBrightness, maxBrightness)
      : lerp(distSec, -lightTimeSec, darkTimeSec,  maxBrightness, minBrightness);
    return clamp(b, minBrightness, maxBrightness);
  }

  if (brightnessMode === 'tanh') {
    const b = event === 'sunrise'
      ? scaledTanh(distSec, -darkTimeSec,  lightTimeSec, 0.05, 0.95, minBrightness, maxBrightness)
      : scaledTanh(distSec, -lightTimeSec, darkTimeSec,  0.95, 0.05, minBrightness, maxBrightness);
    return clamp(b, minBrightness, maxBrightness);
  }

  return maxBrightness;
}

function colorTempAtHour(hour, params) {
  const { sunriseH, sunsetH, minColorTemp, maxColorTemp,
          adaptUntilSleep, sleepColorTemp } = params;
  const pos = sunPosition(hour, sunriseH, sunsetH);

  if (pos > 0) {
    return Math.round(((maxColorTemp - minColorTemp) * pos + minColorTemp) / 5) * 5;
  }
  if (!adaptUntilSleep || pos === 0) return minColorTemp;
  // adaptUntilSleep: blend toward sleep color temp below horizon
  return Math.round(
    (Math.abs(minColorTemp - sleepColorTemp) * Math.abs(1 + pos) + sleepColorTemp) / 5
  ) * 5;
}

/** Approximate Kelvin → sRGB (Tanner Helland algorithm). */
function colorTempToRGB(kelvin) {
  const t = kelvin / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = clamp(99.4708025861 * Math.log(t) - 161.1195681661, 0, 255);
    b = t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307, 0, 255);
  } else {
    r = clamp(329.698727446 * Math.pow(t - 60, -0.1332047592), 0, 255);
    g = clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492), 0, 255);
    b = 255;
  }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// ============================================================
//  Custom Element
// ============================================================

const CARD_VERSION = '1.0.0';
const AL_DOMAIN    = 'adaptive_lighting';
const CARD_TAG     = 'adaptive-lighting-config-card';

class AdaptiveLightingConfigCard extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass          = null;
    this._config        = {};
    this._initialized   = false;
    this._areas         = [];
    this._areaLights    = {};   // area_id → { name, lights[] }
    this._selectedSwitch = null;
    this._selectedLights = new Set();
    this._activeTab     = 'lights';
    this._expandedAreas = new Set();
    this._simParams     = this._defaultSimParams();
  }

  // ---- Lovelace interface ----

  static getConfigElement() {
    return document.createElement(`${CARD_TAG}-editor`);
  }

  static getStubConfig() {
    return {};
  }

  getCardSize() { return 9; }

  setConfig(config) {
    this._config = config || {};
    if (config && config.entity) {
      this._selectedSwitch = config.entity;
    }
  }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    if (firstSet) {
      this._bootstrap();
    } else {
      this._onHassUpdate();
    }
  }

  get hass() { return this._hass; }

  // ---- Bootstrap ----

  async _bootstrap() {
    if (this._initialized) return;
    this._initialized = true;

    if (!this._selectedSwitch) {
      const sw = this._findALSwitches();
      if (sw.length) this._selectedSwitch = sw[0].entity_id;
    }

    this._render();
    await this._loadAreaData();
    this._syncFromSwitch();
    this._renderTree();
    if (this._activeTab === 'preview') this._drawCharts();
  }

  _onHassUpdate() {
    if (!this._initialized) return;
    this._syncFromSwitch();
  }

  // ---- Data helpers ----

  _findALSwitches() {
    if (!this._hass) return [];
    return Object.values(this._hass.states)
      .filter(s => s.attributes && s.attributes.configuration !== undefined
                && s.entity_id.startsWith('switch.'))
      .map(s => ({
        entity_id: s.entity_id,
        name: s.attributes.friendly_name || s.entity_id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async _loadAreaData() {
    try {
      const [areas, entities, devices] = await Promise.all([
        this._hass.callWS({ type: 'config/area_registry/list' }),
        this._hass.callWS({ type: 'config/entity_registry/list' }),
        this._hass.callWS({ type: 'config/device_registry/list' }),
      ]);

      const devArea = {};
      for (const d of devices) {
        if (d.area_id) devArea[d.id] = d.area_id;
      }

      this._areas = [...areas].sort((a, b) => a.name.localeCompare(b.name));
      this._areaLights = {};

      for (const area of this._areas) {
        this._areaLights[area.area_id] = { name: area.name, lights: [] };
      }
      this._areaLights['__other__'] = { name: 'Other / Unassigned', lights: [] };

      for (const ent of entities) {
        if (!ent.entity_id.startsWith('light.')) continue;
        if (!this._hass.states[ent.entity_id]) continue;

        const areaId = ent.area_id || devArea[ent.device_id];
        const bucket = (areaId && this._areaLights[areaId]) ? areaId : '__other__';
        const state  = this._hass.states[ent.entity_id];
        this._areaLights[bucket].lights.push({
          entity_id: ent.entity_id,
          name: ent.name || state.attributes.friendly_name || ent.entity_id,
        });
      }

      for (const bucket of Object.values(this._areaLights)) {
        bucket.lights.sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (err) {
      console.error('[AL Card] Failed to load area data:', err);
    }
  }

  _syncFromSwitch() {
    if (!this._selectedSwitch) return;
    const state = this._hass?.states[this._selectedSwitch];
    if (!state) return;

    const conf = state.attributes?.configuration || {};

    if (Array.isArray(conf.lights)) {
      this._selectedLights = new Set(conf.lights);
      this._renderTree();
    }

    this._simParams = {
      sunriseH:       this._parseTime(conf.sunrise_time)     ?? 6.5,
      sunsetH:        this._parseTime(conf.sunset_time)      ?? 20.0,
      minBrightness:  conf.min_brightness                    ?? 1,
      maxBrightness:  conf.max_brightness                    ?? 100,
      minColorTemp:   conf.min_color_temp                    ?? 2000,
      maxColorTemp:   conf.max_color_temp                    ?? 6500,
      sleepBrightness:conf.sleep_brightness                  ?? 1,
      sleepColorTemp: conf.sleep_color_temp                  ?? 2000,
      brightnessMode: conf.brightness_mode                   ?? 'default',
      darkTimeSec:    conf.brightness_mode_time_dark         ?? 10800,
      lightTimeSec:   conf.brightness_mode_time_light        ?? 1800,
      adaptUntilSleep:conf.adapt_until_sleep                 ?? false,
      isSleep:        false,
    };

    this._applySimParamsToControls();
    if (this._activeTab === 'preview') this._drawCharts();
  }

  _parseTime(str) {
    if (!str) return null;
    const parts = str.split(':').map(Number);
    return parts[0] + (parts[1] || 0) / 60;
  }

  _hourLabel(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${hh}:${mm.toString().padStart(2, '0')}`;
  }

  _defaultSimParams() {
    return {
      sunriseH: 6.5, sunsetH: 20.0,
      minBrightness: 1, maxBrightness: 100,
      minColorTemp: 2000, maxColorTemp: 6500,
      sleepBrightness: 1, sleepColorTemp: 2000,
      brightnessMode: 'default',
      darkTimeSec: 10800, lightTimeSec: 1800,
      adaptUntilSleep: false, isSleep: false,
    };
  }

  // ---- Full render ----

  _render() {
    const switches = this._findALSwitches();
    const opts = switches.map(s =>
      `<option value="${s.entity_id}" ${s.entity_id === this._selectedSwitch ? 'selected' : ''}>
        ${this._esc(s.name)}
      </option>`
    ).join('');

    this.shadowRoot.innerHTML = `
      <style>${CSS_STYLES}</style>
      <ha-card>
        <div class="header">
          <div class="header-left">
            <span class="header-icon">🌞</span>
            <span class="header-title">Adaptive Lighting</span>
          </div>
          <select class="switch-select" id="switch-select">
            <option value="">— select instance —</option>
            ${opts}
          </select>
        </div>

        <div class="tabs">
          <button class="tab active" data-tab="lights">💡 Lights</button>
          <button class="tab"        data-tab="preview">📈 Preview</button>
        </div>

        <!-- LIGHTS TAB -->
        <div class="tab-pane" id="pane-lights">
          <div class="pane-label">Select lights for this program</div>
          <div id="light-tree" class="tree-box">
            <div class="placeholder">Loading areas…</div>
          </div>
          <div class="action-row">
            <span class="sel-count" id="sel-count">0 lights selected</span>
            <button class="btn-save" id="btn-save">Save selection</button>
          </div>
        </div>

        <!-- PREVIEW TAB -->
        <div class="tab-pane hidden" id="pane-preview">
          <div class="sim-grid">
            <div class="sim-field">
              <label>Sunrise <b id="lbl-sunrise">${this._hourLabel(6.5)}</b></label>
              <input type="range" id="sim-sunrise" min="0" max="12" step="0.25" value="6.5">
            </div>
            <div class="sim-field">
              <label>Sunset <b id="lbl-sunset">${this._hourLabel(20)}</b></label>
              <input type="range" id="sim-sunset" min="12" max="24" step="0.25" value="20">
            </div>
            <div class="sim-field">
              <label>Min brightness <b id="lbl-min-b">1%</b></label>
              <input type="range" id="sim-min-b" min="1" max="100" value="1">
            </div>
            <div class="sim-field">
              <label>Max brightness <b id="lbl-max-b">100%</b></label>
              <input type="range" id="sim-max-b" min="1" max="100" value="100">
            </div>
            <div class="sim-field">
              <label>Min color temp <b id="lbl-min-ct">2000 K</b></label>
              <input type="range" id="sim-min-ct" min="1000" max="6500" step="50" value="2000">
            </div>
            <div class="sim-field">
              <label>Max color temp <b id="lbl-max-ct">6500 K</b></label>
              <input type="range" id="sim-max-ct" min="1000" max="6500" step="50" value="6500">
            </div>
            <div class="sim-field mode-field">
              <label>Brightness mode</label>
              <select id="sim-mode">
                <option value="default">Default (sun-based)</option>
                <option value="linear">Linear</option>
                <option value="tanh">Tanh (smooth S-curve)</option>
              </select>
            </div>
          </div>

          <div class="chart-block">
            <div class="chart-label">Brightness over 24 h</div>
            <canvas id="cvs-bright"></canvas>
          </div>
          <div class="chart-block">
            <div class="chart-label">Color temperature over 24 h</div>
            <canvas id="cvs-ct"></canvas>
          </div>

          <div class="sim-summary" id="sim-summary"></div>
        </div>
      </ha-card>
    `;

    this._bindEvents();
  }

  // ---- Light tree ----

  _renderTree() {
    const box = this.shadowRoot.getElementById('light-tree');
    if (!box) return;

    const buckets = [
      ...this._areas
        .map(a => [a.area_id, this._areaLights[a.area_id]])
        .filter(([, d]) => d && d.lights.length),
      ['__other__', this._areaLights['__other__']],
    ].filter(([, d]) => d && d.lights.length);

    if (!buckets.length) {
      box.innerHTML = '<div class="placeholder">No light entities found.</div>';
      return;
    }

    box.innerHTML = buckets.map(([areaId, data]) => {
      const selCount = data.lights.filter(l => this._selectedLights.has(l.entity_id)).length;
      const total    = data.lights.length;
      const expanded = this._expandedAreas.has(areaId) || selCount > 0;
      const rows     = data.lights.map(l => `
        <label class="light-row">
          <input type="checkbox" class="lcb" data-eid="${l.entity_id}"
                 ${this._selectedLights.has(l.entity_id) ? 'checked' : ''}>
          <span class="li-icon">💡</span>
          <span class="li-name">${this._esc(l.name)}</span>
          <span class="li-eid">${l.entity_id}</span>
        </label>`).join('');

      return `
        <div class="area-block">
          <div class="area-head" data-area="${areaId}">
            <span class="arr">${expanded ? '▼' : '▶'}</span>
            <span class="area-icon">🏠</span>
            <span class="area-name">${this._esc(data.name)}</span>
            <span class="area-badge ${selCount ? 'has-sel' : ''}" data-badge="${areaId}">
              ${selCount}/${total}
            </span>
          </div>
          <div class="area-body" ${expanded ? '' : 'style="display:none"'}>
            <label class="sel-all-row">
              <input type="checkbox" class="sel-all" data-area="${areaId}">
              <span>Select all in ${this._esc(data.name)}</span>
            </label>
            ${rows}
          </div>
        </div>`;
    }).join('');

    // Fix indeterminate state (can't be set via innerHTML)
    box.querySelectorAll('.sel-all').forEach(cb => {
      const d = this._areaLights[cb.dataset.area];
      if (!d) return;
      const n = d.lights.filter(l => this._selectedLights.has(l.entity_id)).length;
      cb.checked       = n === d.lights.length && d.lights.length > 0;
      cb.indeterminate = n > 0 && n < d.lights.length;
    });

    this._bindTreeEvents(box);
    this._updateSelCount();
  }

  _bindTreeEvents(box) {
    // Area header toggle
    box.querySelectorAll('.area-head').forEach(head => {
      head.addEventListener('click', e => {
        if (e.target.closest('.lcb, .sel-all')) return;
        const id   = head.dataset.area;
        const body = head.nextElementSibling;
        const arr  = head.querySelector('.arr');
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        arr.textContent = open ? '▼' : '▶';
        if (open) this._expandedAreas.add(id);
        else      this._expandedAreas.delete(id);
      });
    });

    // Individual light checkbox
    box.querySelectorAll('.lcb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this._selectedLights.add(cb.dataset.eid);
        else            this._selectedLights.delete(cb.dataset.eid);
        this._refreshAreaBadge(cb.closest('.area-block'));
        this._updateSelCount();
      });
    });

    // Select-all checkbox
    box.querySelectorAll('.sel-all').forEach(cb => {
      cb.addEventListener('change', () => {
        const d = this._areaLights[cb.dataset.area];
        if (!d) return;
        d.lights.forEach(l => {
          if (cb.checked) this._selectedLights.add(l.entity_id);
          else            this._selectedLights.delete(l.entity_id);
        });
        cb.closest('.area-body').querySelectorAll('.lcb').forEach(lcb => {
          lcb.checked = cb.checked;
        });
        this._refreshAreaBadge(cb.closest('.area-block'));
        this._updateSelCount();
      });
    });
  }

  _refreshAreaBadge(block) {
    if (!block) return;
    const head  = block.querySelector('.area-head');
    const areaId = head?.dataset.area;
    const d     = this._areaLights[areaId];
    if (!d) return;
    const n     = d.lights.filter(l => this._selectedLights.has(l.entity_id)).length;
    const badge = block.querySelector(`[data-badge="${areaId}"]`);
    if (badge) {
      badge.textContent = `${n}/${d.lights.length}`;
      badge.classList.toggle('has-sel', n > 0);
    }
    const sa = block.querySelector('.sel-all');
    if (sa) {
      sa.checked       = n === d.lights.length && d.lights.length > 0;
      sa.indeterminate = n > 0 && n < d.lights.length;
    }
  }

  _updateSelCount() {
    const el = this.shadowRoot.getElementById('sel-count');
    if (el) el.textContent = `${this._selectedLights.size} light${this._selectedLights.size !== 1 ? 's' : ''} selected`;
  }

  // ---- Simulator ----

  _applySimParamsToControls() {
    const p = this._simParams;
    const set = (id, v) => { const el = this.shadowRoot.getElementById(id); if (el) el.value = v; };
    const lbl = (id, v) => { const el = this.shadowRoot.getElementById(id); if (el) el.textContent = v; };

    set('sim-sunrise', p.sunriseH);       lbl('lbl-sunrise', this._hourLabel(p.sunriseH));
    set('sim-sunset',  p.sunsetH);        lbl('lbl-sunset',  this._hourLabel(p.sunsetH));
    set('sim-min-b',   p.minBrightness);  lbl('lbl-min-b',   `${Math.round(p.minBrightness)}%`);
    set('sim-max-b',   p.maxBrightness);  lbl('lbl-max-b',   `${Math.round(p.maxBrightness)}%`);
    set('sim-min-ct',  p.minColorTemp);   lbl('lbl-min-ct',  `${p.minColorTemp} K`);
    set('sim-max-ct',  p.maxColorTemp);   lbl('lbl-max-ct',  `${p.maxColorTemp} K`);
    set('sim-mode',    p.brightnessMode);
  }

  _drawCharts() {
    this._drawBrightnessChart();
    this._drawColorTempChart();
    this._renderSimSummary();
  }

  _drawBrightnessChart() {
    const canvas = this.shadowRoot.getElementById('cvs-bright');
    if (!canvas) return;

    const DPR = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth || 560;
    const H   = 220;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const pad = { t: 24, r: 16, b: 36, l: 46 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;
    const p   = this._simParams;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    // Subtle sky-gradient background
    const sky = ctx.createLinearGradient(pad.l, 0, pad.l + cW, 0);
    sky.addColorStop(0,                            '#050d1a');
    sky.addColorStop(p.sunriseH / 24 - 0.02,      '#0d1b2a');
    sky.addColorStop(p.sunriseH / 24,              '#c47a3b');
    sky.addColorStop(p.sunriseH / 24 + 0.04,       '#6db3de');
    sky.addColorStop(0.5,                          '#87ceeb');
    sky.addColorStop(p.sunsetH / 24 - 0.04,        '#6db3de');
    sky.addColorStop(p.sunsetH / 24,               '#c05f2b');
    sky.addColorStop(p.sunsetH / 24 + 0.02,        '#0d1b2a');
    sky.addColorStop(1,                            '#050d1a');
    ctx.fillStyle = sky;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(pad.l, pad.t, cW, cH);
    ctx.globalAlpha = 1;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 1;
    for (let b = 0; b <= 100; b += 25) {
      const y = pad.t + cH - (b / 100) * cH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    }
    for (let h = 0; h <= 24; h += 4) {
      const x = pad.l + (h / 24) * cW;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + cH); ctx.stroke();
    }

    // Sunrise / sunset dashed markers
    [[p.sunriseH, '#f59e0b', 'Rise'], [p.sunsetH, '#ef4444', 'Set']].forEach(([h, color, lbl]) => {
      const x = pad.l + (h / 24) * cW;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + cH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle   = color;
      ctx.font        = '10px sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillText(lbl, x, pad.t + cH + 24);
    });

    // Brightness curves — draw inactive modes faintly, active boldly
    const curves = [
      { mode: 'default', color: '#60a5fa', label: 'Default' },
      { mode: 'linear',  color: '#34d399', label: 'Linear'  },
      { mode: 'tanh',    color: '#f97316', label: 'Tanh'    },
    ];
    curves.forEach(({ mode, color, label }, idx) => {
      const isActive = mode === p.brightnessMode;
      ctx.globalAlpha = isActive ? 1 : 0.28;
      ctx.strokeStyle = color;
      ctx.lineWidth   = isActive ? 2.5 : 1.2;
      ctx.beginPath();
      for (let i = 0; i <= cW; i++) {
        const hour  = (i / cW) * 24;
        const b     = brightnessAtHour(hour, { ...p, brightnessMode: mode });
        const x     = pad.l + i;
        const y     = pad.t + cH - (b / 100) * cH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Legend
      const lx = pad.l + 8 + idx * 90;
      const ly = pad.t + 12;
      ctx.strokeStyle = color;
      ctx.lineWidth   = isActive ? 2.5 : 1.2;
      ctx.globalAlpha = isActive ? 1 : 0.35;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle   = isActive ? color : '#6b7280';
      ctx.font        = isActive ? 'bold 10px sans-serif' : '10px sans-serif';
      ctx.textAlign   = 'left';
      ctx.fillText(label, lx + 22, ly + 4);
    });

    // Y-axis
    ctx.fillStyle = '#9ca3af';
    ctx.font      = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let b = 0; b <= 100; b += 25) {
      const y = pad.t + cH - (b / 100) * cH;
      ctx.fillText(`${b}%`, pad.l - 6, y + 4);
    }

    // X-axis
    ctx.textAlign = 'center';
    for (let h = 0; h <= 24; h += 4) {
      const x = pad.l + (h / 24) * cW;
      ctx.fillText(`${h}h`, x, pad.t + cH + 14);
    }
  }

  _drawColorTempChart() {
    const canvas = this.shadowRoot.getElementById('cvs-ct');
    if (!canvas) return;

    const DPR = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth || 560;
    const H   = 72;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const pad = { t: 10, r: 16, b: 24, l: 46 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;
    const p   = this._simParams;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    // Color temperature gradient bar
    const img = ctx.createImageData(cW, cH);
    for (let i = 0; i < cW; i++) {
      const hour = (i / cW) * 24;
      const k    = colorTempAtHour(hour, p);
      const [r, g, b] = colorTempToRGB(k);
      for (let j = 0; j < cH; j++) {
        const off = (j * cW + i) * 4;
        img.data[off]     = r;
        img.data[off + 1] = g;
        img.data[off + 2] = b;
        img.data[off + 3] = 255;
      }
    }
    ctx.putImageData(img, pad.l, pad.t);

    // Frame
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(pad.l, pad.t, cW, cH);

    // Sunrise/sunset markers
    [[p.sunriseH, '#f59e0b'], [p.sunsetH, '#ef4444']].forEach(([h, color]) => {
      const x = pad.l + (h / 24) * cW;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + cH); ctx.stroke();
      ctx.setLineDash([]);
    });

    // X-axis
    ctx.fillStyle = '#9ca3af';
    ctx.font      = '11px sans-serif';
    ctx.textAlign = 'center';
    for (let h = 0; h <= 24; h += 4) {
      const x = pad.l + (h / 24) * cW;
      ctx.fillText(`${h}h`, x, pad.t + cH + 14);
    }

    // Kelvin range labels
    const [rMin, gMin, bMin] = colorTempToRGB(p.minColorTemp);
    const [rMax, gMax, bMax] = colorTempToRGB(p.maxColorTemp);
    ctx.textAlign  = 'left';
    ctx.fillStyle  = `rgb(${rMin},${gMin},${bMin})`;
    ctx.font       = '10px sans-serif';
    ctx.fillText(`${p.minColorTemp}K`, 2, pad.t + cH / 2 + 4);
    ctx.textAlign  = 'right';
    ctx.fillStyle  = `rgb(${rMax},${gMax},${bMax})`;
    ctx.fillText(`${p.maxColorTemp}K`, W - 2, pad.t + cH / 2 + 4);
  }

  _renderSimSummary() {
    const el = this.shadowRoot.getElementById('sim-summary');
    if (!el) return;
    const p     = this._simParams;
    const noonH = (p.sunriseH + p.sunsetH) / 2;
    const dayLen = p.sunsetH - p.sunriseH;
    const hh = Math.floor(dayLen);
    const mm = Math.round((dayLen - hh) * 60);
    el.innerHTML = `
      <div class="summary-grid">
        <span>☀ Sunrise: ${this._hourLabel(p.sunriseH)}</span>
        <span>🌤 Solar noon: ${this._hourLabel(noonH)}</span>
        <span>🌇 Sunset: ${this._hourLabel(p.sunsetH)}</span>
        <span>🕐 Day length: ${hh}h ${mm}m</span>
      </div>`;
  }

  // ---- Event binding ----

  _bindEvents() {
    const root = this.shadowRoot;

    // Tab switching
    root.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        root.querySelectorAll('.tab').forEach(t =>
          t.classList.toggle('active', t.dataset.tab === this._activeTab));
        root.querySelectorAll('.tab-pane').forEach(pane =>
          pane.classList.toggle('hidden', pane.id !== `pane-${this._activeTab}`));
        if (this._activeTab === 'preview') {
          // Wait one frame so canvas has its rendered width
          requestAnimationFrame(() => this._drawCharts());
        }
      });
    });

    // Switch selector
    const sel = root.getElementById('switch-select');
    if (sel) {
      sel.addEventListener('change', async e => {
        this._selectedSwitch = e.target.value || null;
        this._selectedLights.clear();
        this._syncFromSwitch();
        this._renderTree();
      });
    }

    // Save button
    const btn = root.getElementById('btn-save');
    if (btn) btn.addEventListener('click', () => this._saveLights());

    // Simulator sliders / selects
    const INPUTS = [
      ['sim-sunrise', v => { this._simParams.sunriseH     = +v; root.getElementById('lbl-sunrise').textContent = this._hourLabel(+v); }],
      ['sim-sunset',  v => { this._simParams.sunsetH      = +v; root.getElementById('lbl-sunset').textContent  = this._hourLabel(+v); }],
      ['sim-min-b',   v => { this._simParams.minBrightness= +v; root.getElementById('lbl-min-b').textContent   = `${Math.round(+v)}%`; }],
      ['sim-max-b',   v => { this._simParams.maxBrightness= +v; root.getElementById('lbl-max-b').textContent   = `${Math.round(+v)}%`; }],
      ['sim-min-ct',  v => { this._simParams.minColorTemp = +v; root.getElementById('lbl-min-ct').textContent  = `${+v} K`; }],
      ['sim-max-ct',  v => { this._simParams.maxColorTemp = +v; root.getElementById('lbl-max-ct').textContent  = `${+v} K`; }],
      ['sim-mode',    v => { this._simParams.brightnessMode = v; }],
    ];
    INPUTS.forEach(([id, fn]) => {
      const el = root.getElementById(id);
      if (el) el.addEventListener('input', e => { fn(e.target.value); this._drawCharts(); });
    });
  }

  // ---- Save ----

  async _saveLights() {
    if (!this._selectedSwitch) {
      this._toast('Select an Adaptive Lighting instance first', 'warn');
      return;
    }
    const btn = this.shadowRoot.getElementById('btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      const entryId = await this._resolveEntryId(this._selectedSwitch);
      if (entryId) {
        // Persistent save via custom backend endpoint
        await this._hass.callApi('PUT', `adaptive_lighting/config/${entryId}`, {
          lights: [...this._selectedLights],
        });
        this._toast('Light selection saved (persistent) ✓', 'ok');
      } else {
        // Runtime-only fallback
        await this._hass.callService(AL_DOMAIN, 'change_switch_settings', {
          entity_id: this._selectedSwitch,
          use_defaults: 'current',
          lights: [...this._selectedLights],
        });
        this._toast('Updated (runtime only — will reset on restart)', 'warn');
      }
    } catch (err) {
      console.error('[AL Card] save error', err);
      this._toast(`Error: ${err.message || err}`, 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save selection'; }
    }
  }

  async _resolveEntryId(entityId) {
    try {
      const entries = await this._hass.callApi('GET', 'config/config_entries/entry');
      const slug = entityId.replace(/^switch\.adaptive_lighting_/, '').replace(/_/g, ' ');
      const hit  = entries.find(e =>
        e.domain === AL_DOMAIN &&
        (e.title.toLowerCase() === slug.toLowerCase() ||
         e.title.toLowerCase().replace(/\s+/g, '_') === slug.toLowerCase().replace(/\s+/g, '_'))
      );
      return hit?.entry_id ?? null;
    } catch {
      return null;
    }
  }

  // ---- Utility ----

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _toast(msg, type = 'ok') {
    const colors = { ok: '#10b981', warn: '#f59e0b', err: '#ef4444' };
    const el = Object.assign(document.createElement('div'), {
      textContent: msg,
    });
    Object.assign(el.style, {
      position: 'fixed', top: '16px', right: '16px', zIndex: '99999',
      background: colors[type], color: '#fff', padding: '10px 18px',
      borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,.4)',
      fontSize: '13px', fontWeight: '600',
      animation: 'none',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }
}

// ============================================================
//  Card styles (injected into shadow DOM)
// ============================================================

const CSS_STYLES = `
  :host { display: block; }

  ha-card {
    background: var(--card-background-color, #111827);
    color: var(--primary-text-color, #f3f4f6);
    border-radius: 12px;
    overflow: hidden;
    font-family: var(--paper-font-body1_-_font-family, sans-serif);
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 14px 20px;
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .header-left { display: flex; align-items: center; gap: 8px; }
  .header-icon { font-size: 22px; }
  .header-title { font-size: 16px; font-weight: 700; letter-spacing: .3px; }

  .switch-select {
    background: rgba(255,255,255,.1);
    color: var(--primary-text-color, #f3f4f6);
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 13px;
    cursor: pointer;
    min-width: 180px;
    max-width: 280px;
  }

  /* Tabs */
  .tabs {
    display: flex;
    background: rgba(0,0,0,.25);
    border-bottom: 1px solid rgba(255,255,255,.07);
    padding: 0 16px;
  }
  .tab {
    padding: 10px 18px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(255,255,255,.45);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: color .15s, border-color .15s;
  }
  .tab:hover  { color: rgba(255,255,255,.8); }
  .tab.active { color: #38bdf8; border-bottom-color: #38bdf8; }

  /* Panes */
  .tab-pane { padding: 18px 20px 20px; }
  .tab-pane.hidden { display: none; }

  .pane-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: rgba(255,255,255,.38);
    margin-bottom: 10px;
  }

  /* Tree */
  .tree-box {
    border: 1px solid rgba(255,255,255,.09);
    border-radius: 10px;
    overflow: hidden;
    max-height: 420px;
    overflow-y: auto;
    background: rgba(0,0,0,.18);
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,.15) transparent;
  }

  .area-block { border-bottom: 1px solid rgba(255,255,255,.05); }
  .area-block:last-child { border-bottom: none; }

  .area-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    cursor: pointer;
    user-select: none;
    transition: background .12s;
  }
  .area-head:hover { background: rgba(255,255,255,.04); }

  .arr { font-size: 9px; color: rgba(255,255,255,.3); width: 10px; }
  .area-icon { font-size: 15px; }
  .area-name { flex: 1; font-size: 13px; font-weight: 500; }

  .area-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(255,255,255,.07);
    color: rgba(255,255,255,.3);
  }
  .area-badge.has-sel { background: rgba(56,189,248,.18); color: #38bdf8; }

  .area-body {
    padding: 2px 0 8px 32px;
    background: rgba(0,0,0,.12);
  }

  .sel-all-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    font-size: 11px;
    color: rgba(255,255,255,.38);
    cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,.04);
    margin-bottom: 3px;
  }

  .light-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    cursor: pointer;
    border-radius: 6px;
    transition: background .1s;
  }
  .light-row:hover { background: rgba(255,255,255,.04); }

  .li-icon { font-size: 13px; }
  .li-name { flex: 1; font-size: 13px; }
  .li-eid  { font-size: 10px; color: rgba(255,255,255,.25); font-family: monospace; }

  input[type="checkbox"] {
    width: 15px; height: 15px;
    accent-color: #38bdf8;
    cursor: pointer;
    flex-shrink: 0;
  }

  .placeholder {
    padding: 28px;
    text-align: center;
    color: rgba(255,255,255,.3);
    font-style: italic;
    font-size: 13px;
  }

  /* Action row */
  .action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,.07);
  }
  .sel-count { font-size: 12px; color: rgba(255,255,255,.45); }

  .btn-save {
    background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
    color: #fff;
    border: none;
    padding: 9px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: transform .15s, box-shadow .15s, opacity .15s;
  }
  .btn-save:hover   { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(14,165,233,.45); }
  .btn-save:active  { transform: translateY(0); }
  .btn-save:disabled{ opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }

  /* Simulator */
  .sim-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 20px;
    margin-bottom: 18px;
  }
  .sim-field { display: flex; flex-direction: column; gap: 5px; }
  .sim-field.mode-field {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
  .sim-field label {
    font-size: 12px;
    color: rgba(255,255,255,.55);
    display: flex;
    justify-content: space-between;
  }
  .sim-field label b { color: #38bdf8; font-weight: 600; }
  .sim-field input[type="range"] { accent-color: #38bdf8; cursor: pointer; width: 100%; }
  .sim-field select {
    background: rgba(255,255,255,.09);
    color: #f3f4f6;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .chart-block { margin-bottom: 10px; }
  .chart-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: rgba(255,255,255,.3);
    margin-bottom: 4px;
  }
  canvas {
    display: block;
    width: 100%;
    border-radius: 8px;
    background: #111827;
  }

  .sim-summary { margin-top: 10px; }
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    font-size: 12px;
    color: rgba(255,255,255,.45);
    padding: 10px 12px;
    background: rgba(0,0,0,.2);
    border-radius: 8px;
  }
`;

// ============================================================
//  Register
// ============================================================

customElements.define(CARD_TAG, AdaptiveLightingConfigCard);

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: 'Adaptive Lighting Config',
    description: 'Area/room light picker + circadian preview for Adaptive Lighting',
    preview: false,
    documentationURL: 'https://github.com/Ctrlable/adaptive-lighting',
  });
}

console.info(
  `%c ADAPTIVE-LIGHTING-CONFIG-CARD %cv${CARD_VERSION} `,
  'background:#0ea5e9;color:#fff;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px',
  'background:#1e3a5f;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0',
);
