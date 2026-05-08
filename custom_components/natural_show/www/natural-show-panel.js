/**
 * Natural Show — Full-Page Configuration Panel
 * Registered as a custom HA panel at /natural-show
 *
 * Layout:
 *   ┌─ Header (title · instance selector · Back · Save) ─────────────┐
 *   │  Brightness chart   (full width, real-time)                     │
 *   │  Color-temp strip   (full width, real-time)                     │
 *   ├─ Settings (left 60%) ──────┬─ Lights tree (right 40%) ─────────┤
 *   │  Brightness                │  ▼ Living Room                    │
 *   │  Color Temp                │     ☑ Ceiling Light               │
 *   │  Sunrise / Sunset          │  ▶ Kitchen                        │
 *   │  Sleep Mode                │  ▶ Bedroom                        │
 *   │  ▶ Advanced (collapsible)  │                                   │
 *   └────────────────────────────┴───────────────────────────────────┘
 */

// ─────────────────────────────────────────────────────────────────────────────
// Math utilities  (JS port of color_and_brightness.py)
// ─────────────────────────────────────────────────────────────────────────────
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function lerp(x, x1, x2, y1, y2) {
  return x2 === x1 ? y1 : y1 + (y2 - y1) * (x - x1) / (x2 - x1);
}

function findAB(x1, x2, y1, y2) {
  const atanh = z => Math.log((1 + z) / (1 - z)) / 2;
  const a = (atanh(2 * y2 - 1) - atanh(2 * y1 - 1)) / (x2 - x1);
  return { a, b: x1 - atanh(2 * y1 - 1) / a };
}

function scaledTanh(x, x1, x2, y1 = 0.05, y2 = 0.95, yMin = 0, yMax = 100) {
  const { a, b } = findAB(x1, x2, y1, y2);
  return yMin + (yMax - yMin) * 0.5 * (Math.tanh(a * (x - b)) + 1);
}

function sunPosition(hour, sunriseH, sunsetH) {
  const noonH = (sunriseH + sunsetH) / 2;
  let midnightH = sunsetH + (sunriseH + 24 - sunsetH) / 2;
  if (midnightH >= 24) midnightH -= 24;
  const shift = h => ((h - midnightH) + 24) % 24;
  const [tS, riseS, noonS, setS] = [hour, sunriseH, noonH, sunsetH].map(shift);
  if (tS < riseS)       return -(1 - Math.pow(tS / riseS, 2));
  else if (tS <= noonS) return   1 - Math.pow((tS - noonS) / (noonS - riseS), 2);
  else if (tS <= setS)  return   1 - Math.pow((tS - noonS) / (noonS - setS), 2);
  else                  return -(1 - Math.pow((tS - 24) / (24 - setS), 2));
}

function closestSunEvent(hour, sunriseH, sunsetH) {
  const wd = (a, b) => { const d = a - b; return d > 12 ? d - 24 : d < -12 ? d + 24 : d; };
  const dr = Math.abs(wd(hour, sunriseH)), ds = Math.abs(wd(hour, sunsetH));
  return dr <= ds ? { event: 'sunrise', distHours: wd(hour, sunriseH) }
                  : { event: 'sunset',  distHours: wd(hour, sunsetH) };
}

function brightnessAtHour(hour, p) {
  if (p.isSleep) return p.sleepBrightness;
  if (p.brightnessMode === 'default') {
    const pos = sunPosition(hour, p.sunriseH, p.sunsetH);
    return pos > 0 ? p.maxBrightness
                   : (p.maxBrightness - p.minBrightness) * (1 + pos) + p.minBrightness;
  }
  const { event, distHours } = closestSunEvent(hour, p.sunriseH, p.sunsetH);
  const ds = distHours * 3600;
  if (p.brightnessMode === 'linear') {
    const b = event === 'sunrise'
      ? lerp(ds, -p.darkTimeSec, p.lightTimeSec, p.minBrightness, p.maxBrightness)
      : lerp(ds, -p.lightTimeSec, p.darkTimeSec, p.maxBrightness, p.minBrightness);
    return clamp(b, p.minBrightness, p.maxBrightness);
  }
  if (p.brightnessMode === 'tanh') {
    const b = event === 'sunrise'
      ? scaledTanh(ds, -p.darkTimeSec, p.lightTimeSec, 0.05, 0.95, p.minBrightness, p.maxBrightness)
      : scaledTanh(ds, -p.lightTimeSec, p.darkTimeSec, 0.95, 0.05, p.minBrightness, p.maxBrightness);
    return clamp(b, p.minBrightness, p.maxBrightness);
  }
  return p.maxBrightness;
}

function colorTempAtHour(hour, p) {
  const pos = sunPosition(hour, p.sunriseH, p.sunsetH);
  if (pos > 0) return Math.round(((p.maxColorTemp - p.minColorTemp) * pos + p.minColorTemp) / 5) * 5;
  if (!p.adaptUntilSleep || pos === 0) return p.minColorTemp;
  return Math.round((Math.abs(p.minColorTemp - p.sleepColorTemp) * Math.abs(1 + pos) + p.sleepColorTemp) / 5) * 5;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Default options
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_OPTIONS = {
  lights: [],
  min_brightness: 1, max_brightness: 100,
  min_color_temp: 2000, max_color_temp: 5500,
  prefer_rgb_color: false,
  transition_until_sleep: false,
  sunrise_time: '', min_sunrise_time: '', max_sunrise_time: '', sunrise_offset: 0,
  sunset_time: '',  min_sunset_time: '',  max_sunset_time: '',  sunset_offset: 0,
  brightness_mode: 'default',
  brightness_mode_time_dark: 900, brightness_mode_time_light: 3600,
  sleep_brightness: 1,
  sleep_rgb_or_color_temp: 'color_temp',
  sleep_color_temp: 1000, sleep_rgb_color: [255, 56, 0], sleep_transition: 1,
  interval: 90, transition: 45, initial_transition: 1,
  take_over_control: true, take_over_control_mode: 'pause_all',
  detect_non_ha_changes: false, autoreset_control_seconds: 0,
  only_once: false, adapt_only_on_bare_turn_on: false,
  separate_turn_on_commands: false, send_split_delay: 0, adapt_delay: 0,
  skip_redundant_commands: false,
  intercept: true, multi_light_intercept: true,
  include_config_in_attributes: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles — uses HA CSS custom properties for full theme compatibility
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
  :host {
    display: block;
    height: 100vh;
    overflow-y: auto;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
    font-family: var(--primary-font-family, 'Roboto', sans-serif);
    font-size: 14px;
    scrollbar-width: thin;
  }
  * { box-sizing: border-box; }

  /* ── Header ── */
  .hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 16px;
    background: var(--card-background-color);
    border-bottom: 1px solid var(--divider-color);
    flex-wrap: wrap;
    position: sticky; top: 0; z-index: 100;
    box-shadow: 0 2px 4px rgba(0,0,0,.1);
  }
  .hdr-title { font-size: 18px; font-weight: 500; white-space: nowrap; }
  .hdr-select {
    flex: 1; min-width: 160px; max-width: 320px;
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
    border-radius: 4px;
    padding: 8px 10px; font-size: 14px; cursor: pointer;
    font-family: var(--primary-font-family, inherit);
  }
  .hdr-actions { display: flex; gap: 8px; margin-left: auto; align-items: center; }
  mwc-button {
    --mdc-theme-primary: var(--primary-color);
    --mdc-theme-on-primary: var(--text-primary-color, #fff);
  }

  /* ── Main body ── */
  .body { padding: 16px 16px 40px; max-width: 1600px; margin: 0 auto; }

  /* ── Charts ── */
  .charts { margin-bottom: 16px; }
  .chart-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: .5px;
    color: var(--secondary-text-color); margin-bottom: 4px;
  }
  canvas { display: block; width: 100%; border-radius: 8px; }
  #cvs-bright { margin-bottom: 8px; }

  /* ── Two-column grid ── */
  .grid {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 14px;
    align-items: start;
  }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }

  /* ── ha-card ── */
  ha-card { display: block; margin-bottom: 12px; }
  ha-card .card-content { padding: 16px; }

  /* ── Fields ── */
  .field { margin-bottom: 14px; }
  .field:last-child { margin-bottom: 0; }
  .field-lbl {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 6px; color: var(--secondary-text-color); font-size: 13px;
  }
  .field-val { color: var(--primary-color); font-weight: 600; }
  input[type=range] {
    width: 100%; accent-color: var(--primary-color); cursor: pointer;
  }
  ha-textfield { width: 100%; display: block; }
  select.field-select {
    width: 100%; padding: 8px 10px;
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
    border-radius: 4px; font-size: 14px; cursor: pointer;
    font-family: var(--primary-font-family, inherit);
  }
  select.field-select:focus { outline: 2px solid var(--primary-color); outline-offset: -2px; }
  .toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid var(--divider-color);
    gap: 8px;
  }
  .toggle-row:last-child { border-bottom: none; }
  ha-switch { flex-shrink: 0; }
  .field-hint {
    font-size: 12px;
    color: var(--disabled-text-color, var(--secondary-text-color));
    margin-top: 4px;
  }

  /* ── Advanced collapsible ── */
  .adv-toggle {
    width: 100%; background: none; border: none;
    color: var(--primary-color); font-size: 13px; font-weight: 600;
    text-align: left; padding: 10px 0; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    font-family: var(--primary-font-family, inherit);
  }
  .adv-body { display: none; }
  .adv-body.open { display: block; }

  /* ── Lights tree ── */
  .tree { max-height: 560px; overflow-y: auto; scrollbar-width: thin; }
  .area-block { border-bottom: 1px solid var(--divider-color); }
  .area-block:last-child { border-bottom: none; }
  .area-head {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; cursor: pointer; user-select: none;
    border-radius: 4px; transition: background .1s;
  }
  .area-head:hover { background: var(--secondary-background-color); }
  .area-arr { font-size: 9px; color: var(--disabled-text-color, var(--secondary-text-color)); width: 10px; }
  .area-name { flex: 1; font-weight: 500; }
  .area-badge {
    font-size: 11px; padding: 2px 7px; border-radius: 10px;
    background: var(--secondary-background-color); color: var(--secondary-text-color);
  }
  .area-badge.sel { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .area-lights { padding: 2px 0 8px 28px; display: none; }
  .area-lights.open { display: block; }
  .sel-all-row {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px; font-size: 12px; color: var(--secondary-text-color);
    cursor: pointer; border-bottom: 1px solid var(--divider-color); margin-bottom: 3px;
  }
  .light-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; cursor: pointer; border-radius: 4px; transition: background .1s;
  }
  .light-row:hover { background: var(--secondary-background-color); }
  .light-name { flex: 1; }
  .light-eid { font-size: 11px; color: var(--disabled-text-color, var(--secondary-text-color)); font-family: monospace; }
  .sel-count { text-align: right; font-size: 12px; color: var(--secondary-text-color); margin-top: 10px; }
  input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--primary-color); cursor: pointer; flex-shrink: 0; }

  /* ── Toast ── */
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--card-background-color);
    border: 1px solid var(--primary-color); color: var(--primary-color);
    padding: 10px 22px; border-radius: 8px; font-size: 13px; font-weight: 600;
    z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .3s;
    white-space: nowrap; box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.2));
  }
  .toast.show { opacity: 1; }
  .toast.err { border-color: var(--error-color); color: var(--error-color); }

  /* ── Empty state ── */
  .empty { text-align: center; padding: 60px 20px; color: var(--secondary-text-color); font-size: 15px; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Panel element
// ─────────────────────────────────────────────────────────────────────────────
class NaturalShowPanel extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass         = null;
    this._entries      = [];
    this._selId        = null;
    this._options      = { ...DEFAULT_OPTIONS };
    this._areas        = [];
    this._areaLights   = {};
    this._selLights    = new Set();
    this._expandedAreas = new Set();
    this._ready        = false;
    this._saving       = false;
    this._raf          = null;
  }

  set hass(h) {
    this._hass = h;
    if (!this._ready) { this._ready = true; this._init(); }
  }
  set panel(_) {}
  set narrow(_) {}

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  async _init() {
    this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="empty">⏳  Loading Natural Show…</div>`;
    try {
      await Promise.all([this._loadEntries(), this._loadAreaData()]);
    } catch (e) {
      this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="empty">❌ ${e.message}</div>`;
      return;
    }

    this._render();
    this._bindEvents();

    const params = new URLSearchParams(window.location.search);
    const preId  = params.get('entry_id');
    if (preId && this._entries.find(e => e.entry_id === preId)) {
      await this._selectEntry(preId);
    } else if (this._entries.length > 0) {
      await this._selectEntry(this._entries[0].entry_id);
    }
  }

  async _loadEntries() {
    this._entries = await this._hass.callWS({ type: 'config_entries/get', domain: 'natural_show' }) || [];
  }

  async _loadAreaData() {
    const [areas, entities, devices] = await Promise.all([
      this._hass.callWS({ type: 'config/area_registry/list' }),
      this._hass.callWS({ type: 'config/entity_registry/list' }),
      this._hass.callWS({ type: 'config/device_registry/list' }),
    ]);
    const devArea = {};
    for (const d of devices) if (d.area_id) devArea[d.id] = d.area_id;

    this._areas = [...areas].sort((a, b) => a.name.localeCompare(b.name));
    this._areaLights = {};
    for (const a of this._areas) this._areaLights[a.area_id] = { name: a.name, lights: [] };
    this._areaLights['__other__'] = { name: 'Other / Unassigned', lights: [] };

    for (const ent of entities) {
      if (!ent.entity_id.startsWith('light.')) continue;
      const areaId = ent.area_id || devArea[ent.device_id];
      const bucket = (areaId && this._areaLights[areaId]) ? areaId : '__other__';
      const state  = this._hass.states[ent.entity_id];
      this._areaLights[bucket].lights.push({
        entity_id: ent.entity_id,
        name: ent.name || state?.attributes?.friendly_name || ent.entity_id,
      });
    }
    for (const b of Object.values(this._areaLights)) b.lights.sort((a, z) => a.name.localeCompare(z.name));
  }

  async _selectEntry(id) {
    this._selId = id;
    if (!this._entries.find(e => e.entry_id === id)) return;

    try {
      const result = await this._hass.callApi('GET', `natural_show/config/${id}`);
      this._options = { ...DEFAULT_OPTIONS, ...(result.options || {}) };
    } catch (e) {
      console.warn('[NaturalShowPanel] could not load options:', e);
      this._options = { ...DEFAULT_OPTIONS };
    }

    for (const k of ['sunrise_time','sunset_time','min_sunrise_time','max_sunrise_time','min_sunset_time','max_sunset_time']) {
      if (!this._options[k] || this._options[k] === 'None') this._options[k] = '';
    }
    this._selLights = new Set(this._options.lights || []);
    this._applyOptionsToForm();
    this._scheduleDraw();
    this._renderTree();
    const sel = this.shadowRoot.getElementById('inst-sel');
    if (sel) sel.value = id;
  }

  // ── Render skeleton ────────────────────────────────────────────────────────

  _render() {
    const instOpts = this._entries.map(e =>
      `<option value="${this._e(e.entry_id)}">${this._e(e.title)}</option>`
    ).join('');

    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>

      <div class="hdr">
        <span class="hdr-title">🌞 Natural Show</span>
        <select class="hdr-select" id="inst-sel">
          <option value="">— select instance —</option>
          ${instOpts}
        </select>
        <div class="hdr-actions">
          <mwc-button id="btn-back" label="Back"></mwc-button>
          <mwc-button id="btn-save" label="Save &amp; Apply" raised></mwc-button>
        </div>
      </div>

      <div class="body">
        ${this._entries.length === 0
          ? `<div class="empty">No Natural Show instances found.<br>Add one in <b>Settings → Devices &amp; Services → Add Integration → Natural Show</b>.</div>`
          : `
            <div class="charts">
              <div class="chart-label">Brightness — 24 h preview</div>
              <canvas id="cvs-bright" height="220"></canvas>
              <div class="chart-label" style="margin-top:8px">Color Temperature</div>
              <canvas id="cvs-ct" height="72"></canvas>
            </div>

            <div class="grid">
              <div class="settings-col">
                ${this._tplBrightness()}
                ${this._tplColorTemp()}
                ${this._tplSunriseSunset()}
                ${this._tplSleep()}
                ${this._tplAdvanced()}
              </div>
              <div class="lights-col">
                <ha-card header="💡 Lights">
                  <div class="card-content">
                    <div class="tree" id="tree"></div>
                    <div class="sel-count" id="sel-count">0 lights selected</div>
                  </div>
                </ha-card>
              </div>
            </div>
          `
        }
      </div>
      <div class="toast" id="toast"></div>
    `;
  }

  // ── Setting section templates ──────────────────────────────────────────────

  _tplBrightness() {
    const o = this._options;
    return `
      <ha-card header="☀️ Brightness">
        <div class="card-content">
          <div class="field">
            <div class="field-lbl">Minimum <span class="field-val" id="v-min-b">${o.min_brightness}%</span></div>
            <input type="range" id="min-b" min="1" max="100" value="${o.min_brightness}">
          </div>
          <div class="field">
            <div class="field-lbl">Maximum <span class="field-val" id="v-max-b">${o.max_brightness}%</span></div>
            <input type="range" id="max-b" min="1" max="100" value="${o.max_brightness}">
          </div>
          <div class="field">
            <div class="field-lbl">Brightness Mode</div>
            <select class="field-select" id="b-mode">
              <option value="default" ${o.brightness_mode==='default'?'selected':''}>Default (sun position)</option>
              <option value="linear"  ${o.brightness_mode==='linear' ?'selected':''}>Linear</option>
              <option value="tanh"    ${o.brightness_mode==='tanh'   ?'selected':''}>Tanh (smooth S-curve)</option>
            </select>
          </div>
          <div id="ramp-wrap" ${o.brightness_mode==='default'?'style="display:none"':''}>
            <div class="field">
              <div class="field-lbl">Ramp — Dark (before/after sun event) <span class="field-val" id="v-ramp-d">${this._fmtMin(o.brightness_mode_time_dark)}</span></div>
              <input type="range" id="ramp-d" min="60" max="18000" step="60" value="${o.brightness_mode_time_dark}">
            </div>
            <div class="field">
              <div class="field-lbl">Ramp — Light (after/before sun event) <span class="field-val" id="v-ramp-l">${this._fmtMin(o.brightness_mode_time_light)}</span></div>
              <input type="range" id="ramp-l" min="60" max="18000" step="60" value="${o.brightness_mode_time_light}">
            </div>
          </div>
        </div>
      </ha-card>`;
  }

  _tplColorTemp() {
    const o = this._options;
    return `
      <ha-card header="🌡️ Color Temperature">
        <div class="card-content">
          <div class="field">
            <div class="field-lbl">Warmest (minimum K) <span class="field-val" id="v-min-ct">${o.min_color_temp} K</span></div>
            <input type="range" id="min-ct" min="1000" max="6500" step="100" value="${o.min_color_temp}">
          </div>
          <div class="field">
            <div class="field-lbl">Coolest (maximum K) <span class="field-val" id="v-max-ct">${o.max_color_temp} K</span></div>
            <input type="range" id="max-ct" min="1000" max="10000" step="100" value="${o.max_color_temp}">
          </div>
          <div class="toggle-row">
            <span>Prefer RGB color over color temperature</span>
            <ha-switch id="pref-rgb" ${o.prefer_rgb_color?'checked':''}></ha-switch>
          </div>
          <div class="toggle-row">
            <span>Transition toward sleep color after sunset</span>
            <ha-switch id="til-sleep" ${o.transition_until_sleep?'checked':''}></ha-switch>
          </div>
        </div>
      </ha-card>`;
  }

  _tplSunriseSunset() {
    const o = this._options;
    return `
      <ha-card header="🌅 Sunrise &amp; Sunset">
        <div class="card-content">
          <div class="field-hint" style="margin-bottom:14px">Leave blank to use your location's actual sunrise/sunset.</div>
          <div class="field">
            <ha-textfield id="sr-time" label="Fixed Sunrise Time (HH:MM:SS)" placeholder="07:00:00" value="${this._e(o.sunrise_time)}"></ha-textfield>
          </div>
          <div class="field">
            <div class="field-lbl">Sunrise Offset <span class="field-val" id="v-sr-off">${this._fmtSec(o.sunrise_offset)}</span></div>
            <input type="range" id="sr-off" min="-7200" max="7200" step="60" value="${o.sunrise_offset}">
            <div class="field-hint">Negative = earlier, positive = later</div>
          </div>
          <div class="field">
            <ha-textfield id="ss-time" label="Fixed Sunset Time (HH:MM:SS)" placeholder="20:00:00" value="${this._e(o.sunset_time)}"></ha-textfield>
          </div>
          <div class="field">
            <div class="field-lbl">Sunset Offset <span class="field-val" id="v-ss-off">${this._fmtSec(o.sunset_offset)}</span></div>
            <input type="range" id="ss-off" min="-7200" max="7200" step="60" value="${o.sunset_offset}">
          </div>
          <button class="adv-toggle" id="sun-adv-toggle">▶ Min/Max sunrise/sunset times</button>
          <div class="adv-body" id="sun-adv-body">
            <div class="field">
              <ha-textfield id="min-sr" label="Earliest Sunrise (HH:MM:SS)" placeholder="06:00:00" value="${this._e(o.min_sunrise_time)}"></ha-textfield>
            </div>
            <div class="field">
              <ha-textfield id="max-sr" label="Latest Sunrise (HH:MM:SS)" placeholder="09:00:00" value="${this._e(o.max_sunrise_time)}"></ha-textfield>
            </div>
            <div class="field">
              <ha-textfield id="min-ss" label="Earliest Sunset (HH:MM:SS)" placeholder="17:00:00" value="${this._e(o.min_sunset_time)}"></ha-textfield>
            </div>
            <div class="field">
              <ha-textfield id="max-ss" label="Latest Sunset (HH:MM:SS)" placeholder="21:00:00" value="${this._e(o.max_sunset_time)}"></ha-textfield>
            </div>
          </div>
        </div>
      </ha-card>`;
  }

  _tplSleep() {
    const o = this._options;
    return `
      <ha-card header="😴 Sleep Mode">
        <div class="card-content">
          <div class="field">
            <div class="field-lbl">Sleep Brightness <span class="field-val" id="v-sl-b">${o.sleep_brightness}%</span></div>
            <input type="range" id="sl-b" min="1" max="100" value="${o.sleep_brightness}">
          </div>
          <div class="field">
            <div class="field-lbl">Sleep Color Type</div>
            <select class="field-select" id="sl-type">
              <option value="color_temp" ${o.sleep_rgb_or_color_temp==='color_temp'?'selected':''}>Color Temperature</option>
              <option value="rgb_color"  ${o.sleep_rgb_or_color_temp==='rgb_color' ?'selected':''}>RGB Color</option>
            </select>
          </div>
          <div class="field">
            <div class="field-lbl">Sleep Color Temperature <span class="field-val" id="v-sl-ct">${o.sleep_color_temp} K</span></div>
            <input type="range" id="sl-ct" min="1000" max="6500" step="100" value="${o.sleep_color_temp}">
          </div>
          <div class="field">
            <div class="field-lbl">Sleep Transition <span class="field-val" id="v-sl-tr">${o.sleep_transition} s</span></div>
            <input type="range" id="sl-tr" min="0" max="60" step="1" value="${o.sleep_transition}">
          </div>
        </div>
      </ha-card>`;
  }

  _tplAdvanced() {
    const o = this._options;
    return `
      <ha-card>
        <div class="card-content">
          <button class="adv-toggle" id="adv-toggle">▶ Advanced Settings</button>
          <div class="adv-body" id="adv-body">
            <div class="field">
              <div class="field-lbl">Adaptation Interval <span class="field-val" id="v-intv">${o.interval} s</span></div>
              <input type="range" id="intv" min="10" max="600" step="5" value="${o.interval}">
            </div>
            <div class="field">
              <div class="field-lbl">Transition Duration <span class="field-val" id="v-trans">${o.transition} s</span></div>
              <input type="range" id="trans" min="0" max="300" step="1" value="${o.transition}">
            </div>
            <div class="field">
              <div class="field-lbl">Initial Transition <span class="field-val" id="v-init-tr">${o.initial_transition} s</span></div>
              <input type="range" id="init-tr" min="0" max="60" step="1" value="${o.initial_transition}">
            </div>
            <div class="field">
              <div class="field-lbl">Take Over Control Mode</div>
              <select class="field-select" id="toc-mode">
                <option value="pause_all"     ${o.take_over_control_mode==='pause_all'    ?'selected':''}>Pause all attributes</option>
                <option value="pause_changed" ${o.take_over_control_mode==='pause_changed'?'selected':''}>Pause only changed attribute</option>
              </select>
            </div>
            <div class="field">
              <div class="field-lbl">Auto-reset control after <span class="field-val" id="v-autoreset">${o.autoreset_control_seconds===0?'disabled':o.autoreset_control_seconds+' s'}</span></div>
              <input type="range" id="autoreset" min="0" max="7200" step="60" value="${o.autoreset_control_seconds}">
            </div>
            <div class="field">
              <div class="field-lbl">Adapt Delay <span class="field-val" id="v-adel">${o.adapt_delay} s</span></div>
              <input type="range" id="adel" min="0" max="30" step="0.5" value="${o.adapt_delay}">
              <div class="field-hint">Wait after turn-on before applying changes (prevents flicker)</div>
            </div>
            <div class="field">
              <div class="field-lbl">Split Command Delay <span class="field-val" id="v-ssdel">${o.send_split_delay} ms</span></div>
              <input type="range" id="ssdel" min="0" max="5000" step="50" value="${o.send_split_delay}">
            </div>
            <div class="toggle-row"><span>Take over control</span><ha-switch id="toc" ${o.take_over_control?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Detect non-HA changes</span><ha-switch id="det-nha" ${o.detect_non_ha_changes?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Only adapt once (on turn-on)</span><ha-switch id="only-once" ${o.only_once?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Adapt only on bare turn-on</span><ha-switch id="bare-ton" ${o.adapt_only_on_bare_turn_on?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Separate turn-on commands</span><ha-switch id="sep-ton" ${o.separate_turn_on_commands?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Skip redundant commands</span><ha-switch id="skip-red" ${o.skip_redundant_commands?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Intercept turn-on calls</span><ha-switch id="intercept" ${o.intercept?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Intercept multi-light turn-on calls</span><ha-switch id="multi-int" ${o.multi_light_intercept?'checked':''}></ha-switch></div>
            <div class="toggle-row"><span>Include config in attributes</span><ha-switch id="inc-attr" ${o.include_config_in_attributes?'checked':''}></ha-switch></div>
          </div>
        </div>
      </ha-card>`;
  }

  // ── Tree ───────────────────────────────────────────────────────────────────

  _renderTree() {
    const tree = this.shadowRoot.getElementById('tree');
    if (!tree) return;

    const buckets = [
      ...this._areas.map(a => ({ id: a.area_id, ...this._areaLights[a.area_id] })),
      { id: '__other__', ...this._areaLights['__other__'] },
    ].filter(b => b && b.lights && b.lights.length > 0);

    if (!buckets.length) {
      tree.innerHTML = '<div class="field-hint" style="padding:12px">No light entities found.</div>';
      return;
    }

    tree.innerHTML = buckets.map(bucket => {
      const n = bucket.lights.filter(l => this._selLights.has(l.entity_id)).length;
      const expanded = this._expandedAreas.has(bucket.id) || n > 0;
      const rows = bucket.lights.map(l => `
        <label class="light-row">
          <input type="checkbox" class="lcb" data-eid="${this._e(l.entity_id)}" ${this._selLights.has(l.entity_id)?'checked':''}>
          <span class="light-name">${this._e(l.name)}</span>
          <span class="light-eid">${this._e(l.entity_id)}</span>
        </label>`).join('');
      return `
        <div class="area-block">
          <div class="area-head" data-area="${this._e(bucket.id)}">
            <span class="area-arr">${expanded?'▼':'▶'}</span>
            <span class="area-name">${this._e(bucket.name)}</span>
            <span class="area-badge ${n?'sel':''}" data-badge="${this._e(bucket.id)}">${n}/${bucket.lights.length}</span>
          </div>
          <div class="area-lights ${expanded?'open':''}" data-bucket="${this._e(bucket.id)}">
            <label class="sel-all-row">
              <input type="checkbox" class="sel-all" data-area="${this._e(bucket.id)}">
              <span>Select all in ${this._e(bucket.name)}</span>
            </label>
            ${rows}
          </div>
        </div>`;
    }).join('');

    tree.querySelectorAll('.sel-all').forEach(cb => {
      const b = this._areaLights[cb.dataset.area];
      if (!b) return;
      const k = b.lights.filter(l => this._selLights.has(l.entity_id)).length;
      cb.checked       = k === b.lights.length && b.lights.length > 0;
      cb.indeterminate = k > 0 && k < b.lights.length;
    });

    this._bindTree(tree);
    this._updateSelCount();
  }

  _bindTree(tree) {
    tree.querySelectorAll('.area-head').forEach(h => {
      h.addEventListener('click', e => {
        if (e.target.closest('.lcb,.sel-all')) return;
        const id = h.dataset.area;
        const body = h.nextElementSibling;
        const arr  = h.querySelector('.area-arr');
        const open = body.classList.toggle('open');
        arr.textContent = open ? '▼' : '▶';
        open ? this._expandedAreas.add(id) : this._expandedAreas.delete(id);
      });
    });

    tree.querySelectorAll('.lcb').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.checked ? this._selLights.add(cb.dataset.eid) : this._selLights.delete(cb.dataset.eid);
        this._refreshBadge(cb.closest('.area-block'));
        this._updateSelCount();
      });
    });

    tree.querySelectorAll('.sel-all').forEach(cb => {
      cb.addEventListener('change', () => {
        const b = this._areaLights[cb.dataset.area];
        if (!b) return;
        b.lights.forEach(l => cb.checked ? this._selLights.add(l.entity_id) : this._selLights.delete(l.entity_id));
        cb.closest('.area-lights').querySelectorAll('.lcb').forEach(l => { l.checked = cb.checked; });
        this._refreshBadge(cb.closest('.area-block'));
        this._updateSelCount();
      });
    });
  }

  _refreshBadge(block) {
    if (!block) return;
    const id = block.querySelector('.area-head')?.dataset.area;
    const b  = this._areaLights[id];
    if (!b) return;
    const n   = b.lights.filter(l => this._selLights.has(l.entity_id)).length;
    const bdg = block.querySelector(`[data-badge="${id}"]`);
    if (bdg) { bdg.textContent = `${n}/${b.lights.length}`; bdg.classList.toggle('sel', n > 0); }
    const sa = block.querySelector('.sel-all');
    if (sa) { sa.checked = n === b.lights.length && b.lights.length > 0; sa.indeterminate = n > 0 && n < b.lights.length; }
  }

  _updateSelCount() {
    const el = this.shadowRoot.getElementById('sel-count');
    if (el) el.textContent = `${this._selLights.size} light${this._selLights.size !== 1 ? 's' : ''} selected`;
  }

  // ── Theme helpers ──────────────────────────────────────────────────────────

  _themeColor(varName, fallback) {
    return getComputedStyle(this).getPropertyValue(varName).trim() || fallback;
  }

  // ── Charts ─────────────────────────────────────────────────────────────────

  _simParams() {
    const sr  = this.shadowRoot;
    const gv  = id => { const e = sr.getElementById(id); return e ? +e.value : null; };
    const gs  = id => { const e = sr.getElementById(id); return e ? e.value.trim() : ''; };
    const pt  = str => { if (!str) return null; const p = str.split(':').map(Number); return p[0] + (p[1]||0)/60; };
    return {
      sunriseH:       pt(gs('sr-time')) ?? 6.5,
      sunsetH:        pt(gs('ss-time')) ?? 20.0,
      minBrightness:  gv('min-b')    ?? this._options.min_brightness,
      maxBrightness:  gv('max-b')    ?? this._options.max_brightness,
      minColorTemp:   gv('min-ct')   ?? this._options.min_color_temp,
      maxColorTemp:   gv('max-ct')   ?? this._options.max_color_temp,
      sleepBrightness:gv('sl-b')     ?? this._options.sleep_brightness,
      sleepColorTemp: gv('sl-ct')    ?? this._options.sleep_color_temp,
      brightnessMode: gs('b-mode')   || this._options.brightness_mode,
      darkTimeSec:    gv('ramp-d')   ?? this._options.brightness_mode_time_dark,
      lightTimeSec:   gv('ramp-l')   ?? this._options.brightness_mode_time_light,
      adaptUntilSleep:sr.getElementById('til-sleep')?.checked ?? this._options.transition_until_sleep,
      isSleep: false,
    };
  }

  _scheduleDraw() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); });
  }

  _draw() {
    const p = this._simParams();
    const bc = this.shadowRoot.getElementById('cvs-bright');
    const cc = this.shadowRoot.getElementById('cvs-ct');
    if (bc) this._drawBright(bc, p);
    if (cc) this._drawCT(cc, p);
  }

  _drawBright(canvas, p) {
    const DPR = window.devicePixelRatio || 1;
    const W   = canvas.parentElement.clientWidth;
    const H   = 220;
    canvas.width  = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const pad = { t: 24, r: 16, b: 36, l: 46 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;

    const chartBg  = this._themeColor('--card-background-color', '#1e293b');
    const gridCol  = this._themeColor('--divider-color', 'rgba(255,255,255,.08)');
    const labelCol = this._themeColor('--secondary-text-color', '#9ca3af');

    ctx.fillStyle = chartBg; ctx.fillRect(0, 0, W, H);

    // Sky gradient background
    const sky = ctx.createLinearGradient(pad.l, 0, pad.l + cW, 0);
    const sr = p.sunriseH / 24, ss = p.sunsetH / 24;
    sky.addColorStop(0,           '#050d1a');
    sky.addColorStop(sr - 0.02,   '#0d1b2a');
    sky.addColorStop(sr,          '#c47a3b');
    sky.addColorStop(sr + 0.04,   '#6db3de');
    sky.addColorStop(0.5,         '#87ceeb');
    sky.addColorStop(ss - 0.04,   '#6db3de');
    sky.addColorStop(ss,          '#c05f2b');
    sky.addColorStop(ss + 0.02,   '#0d1b2a');
    sky.addColorStop(1,           '#050d1a');
    ctx.fillStyle = sky; ctx.globalAlpha = 0.35;
    ctx.fillRect(pad.l, pad.t, cW, cH);
    ctx.globalAlpha = 1;

    // Grid
    ctx.strokeStyle = gridCol; ctx.lineWidth = 1;
    for (let b = 0; b <= 100; b += 25) {
      const y = pad.t + cH - (b / 100) * cH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    }
    for (let h = 0; h <= 24; h += 4) {
      const x = pad.l + (h / 24) * cW;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + cH); ctx.stroke();
    }

    // Sunrise/sunset markers
    [[p.sunriseH, '#f59e0b', 'Rise'], [p.sunsetH, '#ef4444', 'Set']].forEach(([h, c, lbl]) => {
      const x = pad.l + (h / 24) * cW;
      ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + cH); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = c; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(lbl, x, pad.t + cH + 24); ctx.restore();
    });

    // All three brightness curves
    const curves = [
      { mode: 'default', color: '#60a5fa', label: 'Default' },
      { mode: 'linear',  color: '#34d399', label: 'Linear'  },
      { mode: 'tanh',    color: '#f97316', label: 'Tanh'    },
    ];
    curves.forEach(({ mode, color, label }, idx) => {
      const active = mode === p.brightnessMode;
      ctx.globalAlpha = active ? 1 : 0.25;
      ctx.strokeStyle = color; ctx.lineWidth = active ? 2.5 : 1.2;
      ctx.beginPath();
      for (let i = 0; i <= cW; i++) {
        const h = (i / cW) * 24;
        const b = brightnessAtHour(h, { ...p, brightnessMode: mode });
        const y = pad.t + cH - (b / 100) * cH;
        i === 0 ? ctx.moveTo(pad.l + i, y) : ctx.lineTo(pad.l + i, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      const lx = pad.l + 8 + idx * 90, ly = pad.t + 12;
      ctx.strokeStyle = color; ctx.lineWidth = active ? 2.5 : 1.2; ctx.globalAlpha = active ? 1 : 0.35;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = active ? color : labelCol;
      ctx.font = active ? 'bold 10px sans-serif' : '10px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(label, lx + 22, ly + 4);
    });

    // Y axis
    ctx.fillStyle = labelCol; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    for (let b = 0; b <= 100; b += 25) ctx.fillText(`${b}%`, pad.l - 6, pad.t + cH - (b/100)*cH + 4);
    // X axis
    ctx.textAlign = 'center';
    for (let h = 0; h <= 24; h += 4) ctx.fillText(`${h}h`, pad.l + (h/24)*cW, pad.t + cH + 14);
  }

  _drawCT(canvas, p) {
    const DPR = window.devicePixelRatio || 1;
    const W   = canvas.parentElement.clientWidth;
    const H   = 72;
    canvas.width  = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const pad = { t: 10, r: 16, b: 24, l: 46 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;

    const chartBg  = this._themeColor('--card-background-color', '#1e293b');
    const labelCol = this._themeColor('--secondary-text-color', '#9ca3af');

    ctx.fillStyle = chartBg; ctx.fillRect(0, 0, W, H);

    const img = ctx.createImageData(Math.ceil(cW * DPR), Math.ceil(cH * DPR));
    for (let i = 0; i < Math.ceil(cW); i++) {
      const h = (i / cW) * 24;
      const [r, g, b] = colorTempToRGB(colorTempAtHour(h, p));
      for (let j = 0; j < Math.ceil(cH); j++) {
        const di = Math.round(i * DPR), dj = Math.round(j * DPR);
        for (let dy = 0; dy < DPR; dy++) {
          for (let dx = 0; dx < DPR; dx++) {
            const off = ((dj + dy) * Math.ceil(cW * DPR) + (di + dx)) * 4;
            img.data[off] = r; img.data[off+1] = g; img.data[off+2] = b; img.data[off+3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, pad.l * DPR, pad.t * DPR);

    // Frame
    ctx.strokeStyle = this._themeColor('--divider-color', 'rgba(255,255,255,.15)');
    ctx.lineWidth = 1; ctx.strokeRect(pad.l, pad.t, cW, cH);

    // Sun markers
    [[p.sunriseH, '#f59e0b'], [p.sunsetH, '#ef4444']].forEach(([h, c]) => {
      const x = pad.l + (h/24)*cW;
      ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t+cH); ctx.stroke();
      ctx.restore();
    });

    // Kelvin labels
    const [rn,gn,bn] = colorTempToRGB(p.minColorTemp);
    const [rx,gx,bx] = colorTempToRGB(p.maxColorTemp);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = `rgb(${rn},${gn},${bn})`; ctx.textAlign = 'left';  ctx.fillText(`${p.minColorTemp}K`, 2, pad.t + cH/2 + 4);
    ctx.fillStyle = `rgb(${rx},${gx},${bx})`; ctx.textAlign = 'right'; ctx.fillText(`${p.maxColorTemp}K`, W-2, pad.t + cH/2 + 4);

    // X axis
    ctx.fillStyle = labelCol; ctx.textAlign = 'center';
    for (let h = 0; h <= 24; h += 4) ctx.fillText(`${h}h`, pad.l+(h/24)*cW, pad.t+cH+14);
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  _bindEvents() {
    const sr = this.shadowRoot;
    sr.getElementById('btn-back')?.addEventListener('click', () => {
      const ref = document.referrer;
      if (ref && new URL(ref).hostname === window.location.hostname) history.back();
      else window.location.href = '/config/integrations';
    });
    sr.getElementById('btn-save')?.addEventListener('click', () => this._save());
    sr.getElementById('inst-sel')?.addEventListener('change', e => {
      if (e.target.value) this._selectEntry(e.target.value);
    });

    const mkCollapse = (toggleId, bodyId) => {
      sr.getElementById(toggleId)?.addEventListener('click', () => {
        const body = sr.getElementById(bodyId);
        if (!body) return;
        body.classList.toggle('open');
        const open = body.classList.contains('open');
        sr.getElementById(toggleId).textContent = (open ? '▼' : '▶') + sr.getElementById(toggleId).textContent.slice(1);
      });
    };
    mkCollapse('adv-toggle', 'adv-body');
    mkCollapse('sun-adv-toggle', 'sun-adv-body');

    sr.getElementById('b-mode')?.addEventListener('change', e => {
      const wrap = sr.getElementById('ramp-wrap');
      if (wrap) wrap.style.display = e.target.value === 'default' ? 'none' : '';
      this._scheduleDraw();
    });

    const sliders = ['min-b','max-b','ramp-d','ramp-l','min-ct','max-ct','sl-b','sl-ct','sr-off','ss-off'];
    sliders.forEach(id => {
      const el = sr.getElementById(id);
      if (!el) return;
      const lblId = 'v-' + id;
      el.addEventListener('input', e => {
        const lbl = sr.getElementById(lblId);
        if (lbl) {
          const v = +e.target.value;
          if (id.endsWith('-b') || id === 'sl-b')  lbl.textContent = v + '%';
          else if (id.endsWith('-ct') || id === 'sl-ct') lbl.textContent = v + ' K';
          else if (id === 'ramp-d' || id === 'ramp-l')   lbl.textContent = this._fmtMin(v);
          else if (id === 'sr-off' || id === 'ss-off')    lbl.textContent = this._fmtSec(v);
        }
        this._scheduleDraw();
      });
    });

    ['sr-time','ss-time'].forEach(id => {
      sr.getElementById(id)?.addEventListener('input', () => this._scheduleDraw());
    });

    sr.getElementById('til-sleep')?.addEventListener('change', () => this._scheduleDraw());

    [['intv','v-intv',v=>v+' s'],['trans','v-trans',v=>v+' s'],['init-tr','v-init-tr',v=>v+' s'],
     ['autoreset','v-autoreset',v=>+v===0?'disabled':v+' s'],
     ['adel','v-adel',v=>v+' s'],['ssdel','v-ssdel',v=>v+' ms']].forEach(([id, lbl, fmt]) => {
      sr.getElementById(id)?.addEventListener('input', e => {
        const el = sr.getElementById(lbl);
        if (el) el.textContent = fmt(e.target.value);
      });
    });
  }

  // ── Apply options → form ───────────────────────────────────────────────────

  _applyOptionsToForm() {
    const sr = this.shadowRoot;
    const set = (id, v) => { const e = sr.getElementById(id); if (e) e.value = v; };
    const chk = (id, v) => { const e = sr.getElementById(id); if (e) e.checked = !!v; };
    const lbl = (id, v) => { const e = sr.getElementById(id); if (e) e.textContent = v; };
    const o   = this._options;

    set('min-b', o.min_brightness);   lbl('v-min-b', o.min_brightness + '%');
    set('max-b', o.max_brightness);   lbl('v-max-b', o.max_brightness + '%');
    set('b-mode', o.brightness_mode);
    const rw = sr.getElementById('ramp-wrap');
    if (rw) rw.style.display = o.brightness_mode === 'default' ? 'none' : '';
    set('ramp-d', o.brightness_mode_time_dark);  lbl('v-ramp-d', this._fmtMin(o.brightness_mode_time_dark));
    set('ramp-l', o.brightness_mode_time_light); lbl('v-ramp-l', this._fmtMin(o.brightness_mode_time_light));

    set('min-ct', o.min_color_temp);  lbl('v-min-ct', o.min_color_temp + ' K');
    set('max-ct', o.max_color_temp);  lbl('v-max-ct', o.max_color_temp + ' K');
    chk('pref-rgb', o.prefer_rgb_color);
    chk('til-sleep', o.transition_until_sleep);

    set('sr-time', o.sunrise_time); set('ss-time', o.sunset_time);
    set('sr-off', o.sunrise_offset);  lbl('v-sr-off', this._fmtSec(o.sunrise_offset));
    set('ss-off', o.sunset_offset);   lbl('v-ss-off', this._fmtSec(o.sunset_offset));
    set('min-sr', o.min_sunrise_time); set('max-sr', o.max_sunrise_time);
    set('min-ss', o.min_sunset_time);  set('max-ss', o.max_sunset_time);

    set('sl-b', o.sleep_brightness);  lbl('v-sl-b', o.sleep_brightness + '%');
    set('sl-type', o.sleep_rgb_or_color_temp);
    set('sl-ct', o.sleep_color_temp); lbl('v-sl-ct', o.sleep_color_temp + ' K');
    set('sl-tr', o.sleep_transition); lbl('v-sl-tr', o.sleep_transition + ' s');

    set('intv', o.interval);          lbl('v-intv', o.interval + ' s');
    set('trans', o.transition);       lbl('v-trans', o.transition + ' s');
    set('init-tr', o.initial_transition); lbl('v-init-tr', o.initial_transition + ' s');
    set('toc-mode', o.take_over_control_mode);
    set('autoreset', o.autoreset_control_seconds);
    lbl('v-autoreset', o.autoreset_control_seconds === 0 ? 'disabled' : o.autoreset_control_seconds + ' s');
    set('adel', o.adapt_delay);       lbl('v-adel', o.adapt_delay + ' s');
    set('ssdel', o.send_split_delay); lbl('v-ssdel', o.send_split_delay + ' ms');
    chk('toc', o.take_over_control);
    chk('det-nha', o.detect_non_ha_changes);
    chk('only-once', o.only_once);
    chk('bare-ton', o.adapt_only_on_bare_turn_on);
    chk('sep-ton', o.separate_turn_on_commands);
    chk('skip-red', o.skip_redundant_commands);
    chk('intercept', o.intercept);
    chk('multi-int', o.multi_light_intercept);
    chk('inc-attr', o.include_config_in_attributes);
  }

  // ── Read form → options ────────────────────────────────────────────────────

  _readForm() {
    const sr  = this.shadowRoot;
    const gv  = id => { const e = sr.getElementById(id); return e ? +e.value : null; };
    const gs  = id => { const e = sr.getElementById(id); return e ? e.value.trim() : null; };
    const gc  = id => { const e = sr.getElementById(id); return e ? e.checked : null; };
    const orN = v => (v === '' || v == null) ? 'None' : v;

    this._options = {
      ...this._options,
      lights: [...this._selLights],
      min_brightness: gv('min-b') ?? this._options.min_brightness,
      max_brightness: gv('max-b') ?? this._options.max_brightness,
      brightness_mode: gs('b-mode') ?? this._options.brightness_mode,
      brightness_mode_time_dark:  gv('ramp-d') ?? this._options.brightness_mode_time_dark,
      brightness_mode_time_light: gv('ramp-l') ?? this._options.brightness_mode_time_light,
      min_color_temp: gv('min-ct') ?? this._options.min_color_temp,
      max_color_temp: gv('max-ct') ?? this._options.max_color_temp,
      prefer_rgb_color: gc('pref-rgb') ?? this._options.prefer_rgb_color,
      transition_until_sleep: gc('til-sleep') ?? this._options.transition_until_sleep,
      sunrise_time: orN(gs('sr-time')), sunrise_offset: gv('sr-off') ?? this._options.sunrise_offset,
      sunset_time:  orN(gs('ss-time')), sunset_offset:  gv('ss-off') ?? this._options.sunset_offset,
      min_sunrise_time: orN(gs('min-sr')), max_sunrise_time: orN(gs('max-sr')),
      min_sunset_time:  orN(gs('min-ss')), max_sunset_time:  orN(gs('max-ss')),
      sleep_brightness: gv('sl-b') ?? this._options.sleep_brightness,
      sleep_rgb_or_color_temp: gs('sl-type') ?? this._options.sleep_rgb_or_color_temp,
      sleep_color_temp: gv('sl-ct') ?? this._options.sleep_color_temp,
      sleep_transition: gv('sl-tr') ?? this._options.sleep_transition,
      interval: gv('intv') ?? this._options.interval,
      transition: gv('trans') ?? this._options.transition,
      initial_transition: gv('init-tr') ?? this._options.initial_transition,
      take_over_control: gc('toc') ?? this._options.take_over_control,
      take_over_control_mode: gs('toc-mode') ?? this._options.take_over_control_mode,
      detect_non_ha_changes: gc('det-nha') ?? this._options.detect_non_ha_changes,
      autoreset_control_seconds: gv('autoreset') ?? this._options.autoreset_control_seconds,
      only_once: gc('only-once') ?? this._options.only_once,
      adapt_only_on_bare_turn_on: gc('bare-ton') ?? this._options.adapt_only_on_bare_turn_on,
      separate_turn_on_commands: gc('sep-ton') ?? this._options.separate_turn_on_commands,
      send_split_delay: gv('ssdel') ?? this._options.send_split_delay,
      adapt_delay: gv('adel') ?? this._options.adapt_delay,
      skip_redundant_commands: gc('skip-red') ?? this._options.skip_redundant_commands,
      intercept: gc('intercept') ?? this._options.intercept,
      multi_light_intercept: gc('multi-int') ?? this._options.multi_light_intercept,
      include_config_in_attributes: gc('inc-attr') ?? this._options.include_config_in_attributes,
    };
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async _save() {
    if (this._saving || !this._selId) return;
    this._saving = true;
    const btn = this.shadowRoot.getElementById('btn-save');
    if (btn) { btn.setAttribute('label', 'Saving…'); btn.disabled = true; }

    try {
      this._readForm();
      await this._hass.callApi('PUT', `natural_show/config/${this._selId}`, { options: this._options });
      this._toast('✅ Saved and applied!');
      const flowId = new URLSearchParams(window.location.search).get('flow_id');
      if (flowId) {
        try {
          await this._hass.callWS({ type: 'config_entries/options/flow/configure', flow_id: flowId, user_input: {} });
        } catch (_) { /* flow may have timed out */ }
      }
    } catch (err) {
      console.error('[NaturalShowPanel] save:', err);
      this._toast('❌ ' + (err.message || 'Save failed'), true);
    } finally {
      this._saving = false;
      if (btn) { btn.setAttribute('label', 'Save & Apply'); btn.disabled = false; }
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  _toast(msg, isErr = false) {
    const t = this.shadowRoot.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
  }

  _e(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  _fmtMin(sec)  { return Math.round(+sec / 60) + ' min'; }
  _fmtSec(sec)  { const v = +sec; return v === 0 ? '0 s' : (v > 0 ? '+' : '') + v + ' s'; }
}

customElements.define('natural-show-panel', NaturalShowPanel);
console.info('%c NATURAL-SHOW-PANEL %c loaded ', 'background:#0ea5e9;color:#fff;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px','background:#1e3a5f;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0');
