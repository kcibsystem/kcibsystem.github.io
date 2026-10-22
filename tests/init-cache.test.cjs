const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client(cached) {
  const now = 1800000000000;
  const storage = new Map(cached === undefined ? [] : [['kcib_init_v1', cached]]);
  const calls = [];
  const data = { inventory: [], holidays: [{ date: '2026-12-31' }], staffConfig: {} };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: Clock, URL, console, uiIcon: () => '', SCRIPT_URL: 'https://mock.invalid/exec',
    localStorage: { getItem: () => null },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async url => { calls.push(new URL(url)); return { ok: true, json: async () => data }; }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync('js/booking-rules.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace(/App\.boot\(\);\s*$/, ''), context);
  const app = context.App;
  app._updateInventoryMeta = app._refreshCatalogView = app._renderNavRight = () => {};
  return { app, now, calls, storage, data };
}

test('fresh init cache renders immediately without a background network request', async () => {
  const cachedData = { inventory: [], holidays: [{ date: '2026-11-01' }], staffConfig: {} };
  const freshAt = 1800000000000 - 60000;
  const { app, calls } = client(JSON.stringify({ ts: freshAt, data: cachedData }));
  await app._loadInit();
  assert.equal(calls.length, 0);
  assert.equal(app.state.initLoaded, true);
  assert.equal(app.state.inventoryFetchedAt, freshAt);
  assert.equal(app.state.holidays.has('2026-11-01'), true);
});

test('missing, expired, malformed and future init caches fetch current data', async () => {
  for (const cached of [
    undefined, '{',
    JSON.stringify({ ts: 1800000000000 - 300000, data: {} }),
    JSON.stringify({ ts: 1800000000000 + 1000, data: {} }),
    JSON.stringify({ ts: '1800000000000', data: {} })
  ]) {
    const { app, calls, now, storage } = client(cached);
    await app._loadInit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].searchParams.get('func'), 'init');
    assert.equal(app.state.inventoryFetchedAt, now);
    assert.equal(app.state.holidays.has('2026-12-31'), true);
    assert.equal(JSON.parse(storage.get('kcib_init_v1')).ts, now);
    await app._loadInit();
    assert.equal(calls.length, 1);
  }
});

test('explicit inventory refresh bypasses the server cache and replaces the session snapshot', async () => {
  const { app, calls, now, storage } = client(JSON.stringify({ ts: 1800000000000 - 1000, data: {} }));
  await app._loadInit();
  await app._refreshInventory(true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('refresh'), '1');
  assert.equal(JSON.parse(storage.get('kcib_init_v1')).ts, now);
});
