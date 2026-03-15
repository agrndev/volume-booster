const tab_gains = {};

browser.tabs.onRemoved.addListener((tabId) => {
  delete tab_gains[tabId];
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    delete tab_gains[tabId];
  }
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'STORE_GAIN' && msg.tabId) {
    tab_gains[msg.tabId] = msg.gain;
  }
  if (msg.type === 'GET_STORED_GAIN' && msg.tabId) {
    return Promise.resolve({ gain: tab_gains[msg.tabId] ?? 1.0 });
  }
});
