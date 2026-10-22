const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const signinIds = ['g_id_signin_button', 'g_id_signin_mobile_button'];

function client(language = 'en') {
  const elements = new Map();
  function element(id, className = '') {
    const children = [], attributes = new Map();
    let html = '';
    return {
      id, className, dataset: {}, style: {}, hidden: false,
      setAttribute: (key, value) => attributes.set(key, String(value)),
      getAttribute: key => attributes.get(key),
      removeAttribute: key => attributes.delete(key),
      get innerHTML() { return html; },
      set innerHTML(value) {
        for (const child of children.splice(0)) {
          if (elements.get(child.id) === child) elements.delete(child.id);
        }
        html = value;
        for (const match of value.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
          const classes = match[0].match(/\bclass="([^"]*)"/);
          const child = element(match[1], classes ? classes[1] : '');
          children.push(child);
          elements.set(child.id, child);
        }
      }
    };
  }
  for (const id of ['nav-right', 'mobile-signin-slot', 'mobile-cart-btn', 'mobile-notif-btn']) {
    elements.set(id, element(id));
  }
  let reloads = 0;
  const context = vm.createContext({
    console, URL, URLSearchParams, uiIcon: () => '',
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    localStorage: { getItem: key => key === 'kcib_lang' ? language : null },
    location: { reload() { reloads++; } },
    document: {
      documentElement: {},
      getElementById: id => elements.get(id) || null,
      querySelectorAll: selector => selector === '.kcib-gsi-button'
        ? [...elements.values()].filter(el => el.className.split(/\s+/).includes('kcib-gsi-button')) : []
    },
    setInterval() { throw new Error('Sign-in should wait for the SDK load event, without polling'); },
    setTimeout() { throw new Error('Sign-in should wait for the SDK load event, without polling'); }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync('js/i18n.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace(/App\.boot\(\);\s*$/, ''), context);
  context.handleCredentialResponse = response => context.App.handleGoogleLogin(response);
  return { app: context.App, context, elements, reloads: () => reloads };
}

function loadSDK(context) {
  const initialized = [], rendered = [];
  context.google = { accounts: { id: {
    initialize(options) { initialized.push(options); },
    renderButton(node, options) {
      rendered.push({ node, options });
      node.innerHTML = '<iframe title="Sign in with Google"></iframe>';
    },
    prompt() { throw new Error('A fresh browser session must use the Google button popup'); }
  } } };
  return { initialized, rendered };
}

function sdkEvent(context, event) {
  const html = fs.readFileSync('index.html', 'utf8');
  const script = html.match(/<script\b[^>]*\bsrc="https:\/\/accounts\.google\.com\/gsi\/client"[^>]*>/);
  assert.ok(script, 'Google Identity Services script is present');
  const handler = script[0].match(new RegExp(`\\b${event}="([^"]+)"`));
  assert.ok(handler, `Google SDK has an ${event} handler`);
  vm.runInContext(handler[1], context);
}

test('a signed-out fresh browser gets real Google popup buttons on desktop and mobile', () => {
  const { app, context, elements } = client();
  const { initialized, rendered } = loadSDK(context);
  app._renderNavRight();

  assert.equal(app.state.user, null);
  assert.equal(initialized.length, 1);
  assert.equal(initialized[0].ux_mode, 'popup');
  assert.equal(initialized[0].auto_select, false);
  assert.equal(initialized[0].callback, context.handleCredentialResponse);
  assert.deepEqual(rendered.map(call => call.node.id), signinIds);
  for (const id of signinIds) assert.match(elements.get(id).className, /\bkcib-gsi-button\b/);
  for (const id of ['nav-right', 'mobile-signin-slot']) {
    assert.doesNotMatch(elements.get(id).innerHTML, /_doSignIn|kcib-signin-face|kcib-gsi-over/);
  }
  assert.doesNotMatch(fs.readFileSync('index.html', 'utf8'), /id="g_id_onload"/);

  const credentials = [];
  app.handleGoogleLogin = response => credentials.push(response);
  const response = { credential: 'fresh-browser-credential' };
  initialized[0].callback(response);
  assert.deepEqual(credentials, [response]);
});

test('late SDK arrival renders only current navigation nodes, once each', () => {
  const { app, context, elements } = client();
  app._renderNavRight();
  const stale = signinIds.map(id => elements.get(id));
  app._renderNavRight();
  const current = signinIds.map(id => elements.get(id));
  for (let i = 0; i < signinIds.length; i++) assert.notEqual(stale[i], current[i]);

  const { initialized, rendered } = loadSDK(context);
  sdkEvent(context, 'onload');
  app._renderGSI();
  assert.equal(initialized.length, 1);
  assert.deepEqual(rendered.map(call => call.node), current);
  assert.ok(rendered.every(call => !stale.includes(call.node)));

  app._renderNavRight();
  app._renderGSI();
  assert.equal(initialized.length, 1);
  assert.equal(rendered.length, 4);
  assert.deepEqual(rendered.slice(2).map(call => call.node), signinIds.map(id => elements.get(id)));
});

test('SDK failure gives localized recovery on both buttons and a later SDK load recovers', () => {
  for (const language of ['th', 'en']) {
    const { app, context, elements, reloads } = client(language);
    app._renderNavRight();
    const loading = signinIds.map(id => elements.get(id).innerHTML);
    assert.notEqual(context.t('auth.googleLoading'), 'auth.googleLoading');
    assert.ok(loading.every(html => html.includes(context.t('auth.googleLoading'))));
    sdkEvent(context, 'onerror');
    assert.equal(context._gsiLoadFailed, true);
    for (const [i, id] of signinIds.entries()) {
      const html = elements.get(id).innerHTML;
      assert.notEqual(html, loading[i]);
      assert.notEqual(context.t('auth.googleUnavailable'), 'auth.googleUnavailable');
      assert.ok(html.includes(context.t('auth.googleUnavailable')));
      assert.ok(html.includes(context.t('auth.googleRetry')));
      assert.match(html, /<button\b/);
      const reloadHandler = html.match(/\bonclick="([^"]*reload\([^\"]*)"/);
      assert.ok(reloadHandler, 'Failed sign-in offers reload');
      vm.runInContext(reloadHandler[1], context);
    }
    assert.equal(reloads(), 2);
    const { initialized, rendered } = loadSDK(context);
    sdkEvent(context, 'onload');
    assert.equal(initialized.length, 1);
    assert.deepEqual(rendered.map(call => call.node.id), signinIds);
    for (const id of signinIds) assert.match(elements.get(id).innerHTML, /<iframe/);
  }
});

test('the SDK can load before the app or sign-in slots and signed-in users create no buttons', () => {
  const early = vm.createContext({});
  early.window = early;
  assert.doesNotThrow(() => sdkEvent(early, 'onload'));
  assert.doesNotThrow(() => sdkEvent(early, 'onerror'));

  const { app, context } = client();
  const { initialized, rendered } = loadSDK(context);
  app._renderGSI();
  assert.equal(initialized.length, 0);
  assert.equal(rendered.length, 0);

  const signedIn = client();
  signedIn.app._renderNavRight();
  signedIn.app.state.user = { email: 'signed-in@kmitl.ac.th' };
  const unused = loadSDK(signedIn.context);
  signedIn.app._renderGSI();
  assert.equal(unused.initialized.length, 0);
  assert.equal(unused.rendered.length, 0);
});
