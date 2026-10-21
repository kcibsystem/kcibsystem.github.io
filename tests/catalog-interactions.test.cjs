const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(id = '') {
  const attributes = new Map(), classes = new Set();
  return {
    id, dataset: {}, hidden: false, innerHTML: '',
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: key => attributes.get(key),
    removeAttribute: key => attributes.delete(key),
    classList: {
      contains: key => classes.has(key),
      toggle(key, active) { if (active) classes.add(key); else classes.delete(key); }
    },
    focus(options) { this.focusOptions = options; },
    scrollIntoView(options) { this.scrollOptions = options; }
  };
}

function client() {
  const elements = new Map();
  for (const id of ['home-search', 'equip-search-input', 'home-suggestions', 'equip-suggestions', 'home-grid', 'page-home', 'page-info']) elements.set(id, element(id));
  const context = vm.createContext({
    console, URL, uiIcon: () => '', updateThemeControls: () => {},
    localStorage: { getItem: () => null },
    document: {
      documentElement: {}, getElementById: id => elements.get(id),
      querySelectorAll: selector => selector === '.search-suggestions'
        ? [elements.get('home-suggestions'), elements.get('equip-suggestions')]
        : selector === '[aria-autocomplete="list"]' ? [elements.get('home-search'), elements.get('equip-search-input')] : []
    }
  });
  context.window = context;
  context.matchMedia = () => ({ matches: false });
  context.location = { hash: '#home' };
  vm.runInContext(fs.readFileSync('js/i18n.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace(/App\.boot\(\);\s*$/, ''), context);
  return { app: context.App, context, elements };
}

test('Team Project 2 combines with category and search consistently in both catalogs', () => {
  const { app } = client();
  app.state.inventory = [
    { id: 'gc', name: 'GC', category: 'instrument', courseLimit: 'TEAM_PROJECT_2', location: 'CCA Lab-1', model: 'Shimadzu' },
    { id: 'glass', name: 'Glass', category: 'glassware', location: 'Team   Project 2' },
    { id: 'other', name: 'GC', category: 'instrument', location: 'CCA Lab-3' }
  ];
  app._homeTeamProject2 = true;
  assert.deepEqual(Array.from(app._catalogItems('home'), item => item.id), ['gc', 'glass']);
  app._homeCategory = 'instrument';
  app._homeSearch = 'shimadzu';
  assert.deepEqual(Array.from(app._catalogItems('home'), item => item.id), ['gc']);
  app._currentCategory = 'instrument';
  app._currentLocationFilter = 'Team Project 2';
  app._currentSearch = 'CCA Lab-1';
  assert.deepEqual(Array.from(app._catalogItems('equip'), item => item.id), ['gc']);
  app._currentSearch = 'absent';
  assert.equal(app._catalogItems('equip').length, 0);
});

test('selecting a suggestion focuses and scrolls to that exact card, preserving its highlight on render', () => {
  const { app, context, elements } = client();
  const cards = [element(), element()];
  cards.forEach((card, i) => { card.dataset.itemId = String(i); });
  cards[0].classList.toggle('eq-card-highlighted', true);
  elements.get('home-grid').querySelectorAll = () => cards;
  app._selectSuggestion('1', 'home');
  assert.equal(cards[0].classList.contains('eq-card-highlighted'), false);
  assert.equal(cards[1].classList.contains('eq-card-highlighted'), true);
  assert.equal(cards[0].scrollOptions, undefined);
  assert.equal(cards[1].focusOptions.preventScroll, true);
  assert.equal(cards[1].scrollOptions.block, 'center');
  assert.equal(cards[1].scrollOptions.behavior, 'smooth');
  assert.equal(elements.get('home-suggestions').hidden, true);
  assert.match(app._equipCardHTML({ id: '1', name: 'GC', maxQty: 1 }, { bookingType: 'timed' }), /eq-card-highlighted/);
  context.matchMedia = () => ({ matches: true });
  app._selectSuggestion('1', 'home');
  assert.equal(cards[1].scrollOptions.behavior, 'instant');
});

test('suggestions show matching names, brands and rooms, escape inventory text, and close for an empty query', () => {
  const { app, elements } = client();
  const input = elements.get('home-search'), list = elements.get('home-suggestions');
  app.state.initLoaded = true;
  app.state.inventory = [{ id: 'gc', name: '<GC>', model: 'Shimadzu', location: 'CCA Lab-1', category: 'instrument' }];
  app._homeSearch = input.value = 'shimadzu';
  app._showSuggestions('home');
  assert.equal(list.hidden, false);
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  assert.match(list.innerHTML, /&lt;GC&gt;/);
  assert.match(list.innerHTML, /Shimadzu · CCA Lab-1/);
  app._homeSearch = input.value = 'absent';
  app._showSuggestions('home');
  assert.match(list.innerHTML, /suggestion-empty/);
  assert.doesNotMatch(list.innerHTML, /data-item-id/);
  app._homeSearch = input.value = '';
  app._showSuggestions('home');
  assert.equal(list.hidden, true);
});

test('keyboard arrows select suggestions, Enter activates the selection, and Escape closes the list', () => {
  const { app, elements } = client();
  const input = elements.get('home-search'), list = elements.get('home-suggestions');
  const options = [element('first'), element('second')];
  options.forEach((option, i) => { option.dataset.itemId = String(i); });
  list.querySelectorAll = () => options;
  const key = name => app._suggestionKeydown({ key: name, target: input, preventDefault() {} }, 'home');
  key('ArrowDown'); key('ArrowDown');
  assert.equal(input.getAttribute('aria-activedescendant'), 'second');
  let selected;
  app._selectSuggestion = id => { selected = id; };
  key('Enter');
  assert.equal(selected, '1');
  key('Escape');
  assert.equal(list.hidden, true);
  assert.equal(input.getAttribute('aria-expanded'), 'false');
});

test('brand scrolls to the top even on the current home hash; information pages render in Thai and English', () => {
  const { app, context, elements } = client();
  elements.get('page-home').classList.toggle('active', true);
  context.navClose = () => {};
  context.scrollTo = options => { context.lastScroll = options; };
  app.goHome();
  assert.equal(context.lastScroll.top, 0);
  assert.equal(context.location.hash, '#home');
  for (const language of ['th', 'en']) {
    context.LANG = language;
    for (const page of ['about', 'privacy', 'terms']) {
      app._renderInfoPage(page);
      assert.match(elements.get('page-info').innerHTML, /<h1>/);
      assert.doesNotMatch(elements.get('page-info').innerHTML, /info\.(about|privacy|terms)\./);
    }
  }
});
