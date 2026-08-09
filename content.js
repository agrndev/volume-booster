(() => {
  if (window.volumeBoosterInjected) return;

  window.volumeBoosterInjected = true;

  const audioCtxMap = new WeakMap();

  let currentGain = 1.0;
  let activated = false;

  function disconnectElement(el) {
    const entry = audioCtxMap.get(el);

    if (entry) {
      try {
        entry.ctx.close();
      } catch (e) {}

      audioCtxMap.delete(el);
    }
  }

  function connectElement(el) {
    // IMPORTANT:
    // Never touch the Web Audio API until the user
    // has activated the volume booster.
    if (!activated) return;

    if (audioCtxMap.has(el)) return;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      const source = ctx.createMediaElementSource(el);
      const gainNode = ctx.createGain();

      gainNode.gain.value = currentGain;

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioCtxMap.set(el, {
        ctx,
        gainNode,
        source
      });

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

    } catch (e) {
      console.warn(
        '[VolumeBooster] Could not connect element:',
        e.message
      );
    }
  }

  function applyGainToAll(gain) {
    currentGain = gain;

    // The first SET_GAIN activates the booster.
    activated = true;

    document.querySelectorAll('audio, video').forEach(el => {
      connectElement(el);

      const entry = audioCtxMap.get(el);

      if (entry) {
        entry.gainNode.gain.setTargetAtTime(
          gain,
          entry.ctx.currentTime,
          0.01
        );

        if (entry.ctx.state === 'suspended') {
          entry.ctx.resume().catch(() => {});
        }
      }
    });
  }

  // Watch for dynamically added media elements.
  const observer = new MutationObserver((mutations) => {
    // Before activation, don't do anything with media.
    if (!activated) return;

    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        const els = node.matches?.('audio, video')
          ? [node]
          : [...node.querySelectorAll('audio, video')];

        els.forEach(el => {
          connectElement(el);

          const entry = audioCtxMap.get(el);

          if (entry) {
            entry.gainNode.gain.value = currentGain;
          }
        });
      });

      m.removedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        const els = node.matches?.('audio, video')
          ? [node]
          : [...node.querySelectorAll('audio, video')];

        els.forEach(disconnectElement);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Listen for messages from popup.
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== browser.runtime.id) return;

    if (msg.type === 'SET_GAIN') {
      applyGainToAll(msg.gain);

      return Promise.resolve({
        ok: true,
        gain: currentGain
      });
    }

    if (msg.type === 'GET_GAIN') {
      // This does NOT activate the booster.
      return Promise.resolve({
        gain: currentGain,
        activated
      });
    }

    if (msg.type === 'RESET') {
      // If the booster has never been activated,
      // RESET should not touch the tab's audio.
      if (!activated) {
        return Promise.resolve({
          ok: true,
          gain: 1.0,
          activated: false
        });
      }

      applyGainToAll(1.0);

      return Promise.resolve({
        ok: true,
        gain: currentGain,
        activated: true
      });
    }
  });

  // Handle media that starts playing AFTER activation.
  document.addEventListener('play', (e) => {
    if (!activated) return;

    if (e.target.matches?.('audio, video')) {
      connectElement(e.target);

      const entry = audioCtxMap.get(e.target);

      if (entry) {
        entry.gainNode.gain.value = currentGain;

        if (entry.ctx.state === 'suspended') {
          entry.ctx.resume().catch(() => {});
        }
      }
    }
  }, true);
})();
