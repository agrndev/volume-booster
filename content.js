(() => {
  if (window.volumeBoosterInjected) return;

  window.volumeBoosterInjected = true;

  const audioCtxMap = new WeakMap();
  let currentGain = 1.0;

  function disconnectElement(el) {
    const entry = audioCtxMap.get(el);
    if (entry) {
      entry.ctx.close();
      audioCtxMap.delete(el);
    }
  }

  function connectElement(el) {
    if (audioCtxMap.has(el)) return;

    try {
      const ctx = new(window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(el);
      const gainNode = ctx.createGain();
      gainNode.gain.value = currentGain;

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioCtxMap.set(el, { ctx, gainNode, source });

      // Resume context if suspended (browsers require user gesture)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    } catch (e) {
      // Element may already be connected to another AudioContext — skip
      console.warn('[VolumeBooster] Could not connect element:', e.message);
    }
  }

  function applyGainToAll(gain) {
    currentGain = gain;
    document.querySelectorAll('audio, video').forEach(el => {
      connectElement(el);
      const entry = audioCtxMap.get(el);
      if (entry) {
        entry.gainNode.gain.setTargetAtTime(gain, entry.ctx.currentTime, 0.01);
        if (entry.ctx.state === 'suspended') entry.ctx.resume();
      }
    });
  }

  // Watch for dynamically added media elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const els = node.matches?.('audio, video') ? [node] : [...node.querySelectorAll('audio, video')];
        els.forEach(el => {
          connectElement(el);
          const entry = audioCtxMap.get(el);
          if (entry) entry.gainNode.gain.value = currentGain;
        });
      });
      m.removedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const els = node.matches?.('audio, video') ? [node] : [...node.querySelectorAll('audio, video')];
        els.forEach(disconnectElement);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial pass
  document.querySelectorAll('audio, video').forEach(connectElement);

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== browser.runtime.id) return;

    if (msg.type === 'SET_GAIN') {
      applyGainToAll(msg.gain);
      return Promise.resolve({ ok: true, gain: currentGain });
    }
    if (msg.type === 'GET_GAIN') {
      return Promise.resolve({ gain: currentGain });
    }
    if (msg.type === 'RESET') {
      applyGainToAll(1.0);
      return Promise.resolve({ ok: true });
    }
  });

  // Also apply gain when media starts playing (handles lazy-loaded media)
  document.addEventListener('play', (e) => {
    if (e.target.matches?.('audio, video')) {
      connectElement(e.target);
      const entry = audioCtxMap.get(e.target);
      if (entry) {
        entry.gainNode.gain.value = currentGain;
        if (entry.ctx.state === 'suspended') entry.ctx.resume();
      }
    }
  }, true);
})();
