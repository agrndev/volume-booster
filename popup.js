(() => {
  const DEFAULT_VOLUME = 100;
  const MAX_VOLUME = 600;
  const WARNING_THRESHOLD = 200;
  const DANGER_THRESHOLD = 400;

  const slider       = document.getElementById('volSlider');
  const volumeNumber = document.getElementById('volNum');
  const fill         = document.getElementById('sliderFill');
  const presets      = document.getElementById('presets');
  const resetButton  = document.getElementById('resetBtn');
  const warnBanner   = document.getElementById('warnBanner');
  const statusDot    = document.getElementById('statusDot');
  const statusText   = document.getElementById('statusText');
  const ticks        = document.getElementById('ticks');
  const visualizer   = document.getElementById('visualizer');

  // --- Build visualizer bars ---
  const BAR_COUNT = 20;
  const bars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'vis-bar';
    const dur = (0.4 + Math.random() * 0.7).toFixed(2);
    bar.style.setProperty('--dur', `${dur}s`);
    bar.style.height = `${20 + Math.random() * 80}%`;
    bar.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
    visualizer.appendChild(bar);
    bars.push(bar);
  }

  // --- Build tick marks ---
  const tickValues = [0, 100, 200, 300, 400, 500, 600];
  tickValues.forEach(v => {
    const t = document.createElement('div');
    t.className = 'tick';
    t.dataset.val = v;
    t.innerHTML = `<div class="tick-line"></div><div class="tick-label">${v === 600 ? 'MAX' : v + '%'}</div>`;
    ticks.appendChild(t);
  });

  function updateTicks(val) {
    ticks.querySelectorAll('.tick').forEach(t => {
      t.classList.toggle('current', parseInt(t.dataset.val) === val);
    });
  }

  // --- Core UI update ---
  function updateUI(pct) {
    const pctInt = Math.round(pct);
    volumeNumber.innerHTML = `${pctInt}<span class="volume-pct">%</span>`;

    // Color states
    volumeNumber.classList.toggle('warning', pct > WARNING_THRESHOLD && pct <= DANGER_THRESHOLD);
    volumeNumber.classList.toggle('danger',  pct > DANGER_THRESHOLD);
    fill.classList.toggle('warning',   pct > WARNING_THRESHOLD && pct <= DANGER_THRESHOLD);
    fill.classList.toggle('danger',    pct > DANGER_THRESHOLD);

    // Fill width (0-100% of track)
    const fillPct = (pct / MAX_VOLUME) * 100;
    fill.style.width = `${fillPct}%`;
    // fill.style.width = `calc(${fillPct} * (100% - 18px))`;

    // Warn banner
    warnBanner.classList.toggle('visible', pct > WARNING_THRESHOLD);

    // Preset highlight
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === pctInt);
    });

    // Ticks
    updateTicks(tickValues.includes(pctInt) ? pctInt : -1);

    // Visualizer animation
    const active = pct > 0;
    bars.forEach(b => b.classList.toggle('active', active));

    // Bar color mirror
    bars.forEach(b => {
      b.style.background = pct > DANGER_THRESHOLD ? 'var(--accent2)' : pct > WARNING_THRESHOLD ? 'var(--warn)' : 'var(--accent)';
    });

    // Status
    statusDot.classList.toggle('reduced', pct < DEFAULT_VOLUME);
    statusDot.classList.toggle('boosting', pct > DEFAULT_VOLUME);
    statusText.textContent = pct === DEFAULT_VOLUME 
      ? 'default'
      : pct > DEFAULT_VOLUME
        ? 'boosting'
        : 'reduced';
  }

  // --- Send gain to content script ---
  async function sendGain(pct) {
    const gain = pct / 100;
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      await browser.tabs.sendMessage(tab.id, { type: 'SET_GAIN', gain });
      await browser.runtime.sendMessage({ type: 'STORE_GAIN', tabId: tab.id, gain });
      updateUI(pct);
    } catch (e) {
      statusText.textContent = 'no media found';
      console.warn('[VOL+]', e);
    }
  }

  // --- Slider ---
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    updateUI(val);
    sendGain(val);
  });

  // --- Presets ---
  presets.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const val = parseInt(btn.dataset.val);
    slider.value = val;
    sendGain(val);
  });

  // --- Reset ---
  resetButton.addEventListener('click', () => {
    slider.value = DEFAULT_VOLUME;
    sendGain(DEFAULT_VOLUME);
  });

  // --- Load saved gain for this tab on popup open ---
  (async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // Try to get current gain from content script
      let pct = DEFAULT_VOLUME;
      try {
        const resp = await browser.tabs.sendMessage(tab.id, { type: 'GET_GAIN' });
        if (resp?.gain != null) pct = Math.round(resp.gain * 100);
      } catch {
        // Content script not running yet — use stored value
        const stored = await browser.runtime.sendMessage({ type: 'GET_STORED_GAIN', tabId: tab.id });
        if (stored?.gain != null) pct = Math.round(stored.gain * 100);
      }

      slider.value = pct;
      updateUI(pct);
    } catch (e) {
      console.warn('[VOL+] init error', e);
    }
  })();
})();
