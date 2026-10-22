const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(id = '') {
  const attributes = new Map(), classes = new Set();
  return {
    id, dataset: {}, hidden: false, innerHTML: '', value: '',
    querySelectorAll: () => [],
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: key => attributes.get(key),
    removeAttribute: key => attributes.delete(key),
    classList: {
      contains: key => classes.has(key),
      add: key => classes.add(key),
      remove: key => classes.delete(key),
      toggle(key, active) { if (active) classes.add(key); else classes.delete(key); }
    },
    focus(options) { this.focusOptions = options; },
    scrollIntoView(options) { this.scrollOptions = options; }
  };
}

function client() {
  const elements = new Map();
  for (const id of ['home-search', 'equip-search-input', 'home-suggestions', 'equip-suggestions', 'home-grid', 'home-result-count', 'home-more', 'home-team-project-filter', 'equip-grid', 'equip-filters', 'page-home', 'page-equipment', 'page-info', 'page-calendar', 'calendar-body', 'calendar-meta', 'calendar-refresh', 'nav-right', 'mobile-cart-btn']) elements.set(id, element(id));
  const context = vm.createContext({
    console, URL, URLSearchParams, uiIcon: () => '', updateThemeControls: () => {},
    localStorage: { getItem: key => key === 'kcib_lang' ? 'th' : null },
    document: {
      documentElement: {}, getElementById: id => elements.get(id),
      querySelectorAll: selector => selector === '.search-suggestions'
        ? [elements.get('home-suggestions'), elements.get('equip-suggestions')]
        : selector === '[aria-autocomplete="list"]' ? [elements.get('home-search'), elements.get('equip-search-input')]
          : selector === '.page' ? [...elements.values()].filter(element => element.id.startsWith('page-')) : []
    }
  });
  context.window = context;
  context.matchMedia = () => ({ matches: false });
  context.location = { hash: '#home' };
  context.scrollY = 0;
  context.scrollTo = options => { context.scrollY = options.top; };
  vm.runInContext(fs.readFileSync('js/i18n.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/booking-rules.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace(/App\.boot\(\);\s*$/, ''), context);
  vm.runInContext(fs.readFileSync('js/calendar.js', 'utf8'), context);
  return { app: context.App, context, elements };
}

function homeInventory(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: 'item-' + index, name: 'Item ' + index, category: 'instrument', courseLimit: 'TEAM_PROJECT_2', maxQty: 1, available: true
  }));
}

function homeCardIds(elements) {
  return [...elements.get('home-grid').innerHTML.matchAll(/<article[^>]*data-item-id="([^"]+)"/g)].map(match => match[1]);
}

test('home starts with six cards and reveals six at a time, keeping full totals and focusing the new batch', () => {
  const { app, elements } = client();
  app.state.initLoaded = true;
  app.state.inventory = homeInventory(15);
  const cards = app.state.inventory.map(item => Object.assign(element(), { dataset: { itemId: item.id } }));
  elements.get('home-grid').querySelectorAll = () => cards.slice(0, homeCardIds(elements).length);
  app._renderHome();
  assert.match(elements.get('page-home').innerHTML, /onclick="App\._showMoreHome\(\)"/);
  assert.equal(homeCardIds(elements).length, 6);
  assert.equal(elements.get('home-result-count').textContent, 'แสดง 6 จาก 15 รายการ');
  assert.equal(elements.get('home-more').hidden, false);
  app._showMoreHome();
  assert.equal(homeCardIds(elements).length, 12);
  assert.equal(cards[6].focusOptions.preventScroll, true);
  assert.equal(elements.get('home-result-count').textContent, 'แสดง 12 จาก 15 รายการ');
  assert.equal(elements.get('home-more').hidden, false);
  app._showMoreHome();
  assert.equal(homeCardIds(elements).length, 15);
  assert.equal(cards[12].focusOptions.preventScroll, true);
  assert.equal(elements.get('home-result-count').textContent, 'แสดง 15 จาก 15 รายการ');
  assert.equal(elements.get('home-more').hidden, true);
});

test('home hides show more while loading, after a load failure, and when all or no matches fit', () => {
  const { app, elements } = client();
  for (const failed of [false, true]) {
    app.state.initError = failed;
    app._renderHomeGrid();
    assert.equal(elements.get('home-more').hidden, true);
    assert.equal(elements.get('home-result-count').textContent, '');
  }
  app.state.initLoaded = true;
  app.state.inventory = homeInventory(6);
  app._renderHomeGrid();
  assert.equal(elements.get('home-more').hidden, true);
  app._homeSearch = 'missing';
  app._renderHomeGrid();
  assert.equal(homeCardIds(elements).length, 0);
  assert.equal(elements.get('home-result-count').textContent, 'แสดง 0 จาก 0 รายการ');
  assert.equal(elements.get('home-more').hidden, true);
});

test('changing home search, category, Team Project or sort starts a fresh six-card result list', () => {
  const { app, elements } = client();
  app.state.initLoaded = true;
  app.state.inventory = homeInventory(18);
  for (const change of [
    () => app._onHomeSearch('Item'),
    () => app._setHomeCategory('instrument'),
    () => app._toggleHomeTeamProject2(),
    () => app._setHomeSort('nameDesc')
  ]) {
    app._showMoreHome();
    assert.equal(homeCardIds(elements).length, 12);
    change();
    assert.equal(homeCardIds(elements).length, 6);
    assert.equal(app._homeVisibleCount, 6);
    assert.equal(app._catalogItems('home').length, 18);
  }
  assert.equal(homeCardIds(elements)[0], 'item-17');
  app._showMoreHome();
  app._setHomeCategory('instrument');
  app._setHomeSort('nameDesc');
  assert.equal(homeCardIds(elements).length, 12);
});

test('a home suggestion beyond the visible batch reveals and focuses its card in sorted results', () => {
  const { app, elements } = client();
  app.state.initLoaded = true;
  app.state.inventory = homeInventory(15);
  app._homeSearch = elements.get('home-search').value = 'Item';
  app._homeSort = 'nameDesc';
  const grid = elements.get('home-grid'), card = element();
  card.dataset.itemId = 'item-1';
  grid.querySelectorAll = () => homeCardIds(elements).includes(card.dataset.itemId) ? [card] : [];
  app._renderHomeGrid();
  app._showSuggestions('home');
  assert.match(elements.get('home-suggestions').innerHTML, /data-item-id="item-1"/);
  assert.equal(homeCardIds(elements).includes('item-1'), false);
  app._selectSuggestion('item-1', 'home');
  assert.equal(homeCardIds(elements).includes('item-1'), true);
  assert.equal(app._homeVisibleCount, 18);
  assert.equal(card.classList.contains('eq-card-highlighted'), true);
  assert.equal(card.focusOptions.preventScroll, true);
  assert.equal(card.scrollOptions.block, 'center');
  assert.equal(elements.get('home-suggestions').hidden, true);
});

test('home keeps revealed cards across background refresh, cart updates, language changes and navigation', () => {
  const { app, context, elements } = client();
  app.state.initLoaded = true;
  app.state.inventory = homeInventory(15);
  elements.get('page-home').classList.add('active');
  app._renderHomeGrid();
  app._showMoreHome();
  app.state.inventory = homeInventory(18);
  app._refreshCatalogView();
  assert.equal(homeCardIds(elements).length, 12);
  assert.equal(elements.get('home-result-count').textContent, 'แสดง 12 จาก 18 รายการ');
  app.state.cart = [{ item: app.state.inventory[7] }];
  app._refreshCatalogView();
  assert.equal(homeCardIds(elements).length, 12);
  context.LANG = 'en';
  app._renderHome();
  assert.equal(homeCardIds(elements).length, 12);
  assert.equal(elements.get('home-result-count').textContent, 'Showing 12 of 18 items');
  context.location.hash = '#about';
  app._route();
  context.location.hash = '#home';
  app._route();
  assert.equal(homeCardIds(elements).length, 12);
});

test('returning from a calendar restores a home card from a revealed batch and its scroll position', () => {
  const { app, context, elements } = client(), calendar = context.CalendarUI;
  calendar.load = () => {};
  app.state.initLoaded = true;
  app.state.inventory = homeInventory(15);
  app._route();
  app._showMoreHome();
  const link = element();
  link.dataset.itemId = 'item-9';
  elements.get('home-grid').querySelectorAll = () => homeCardIds(elements).includes(link.dataset.itemId) ? [link] : [];
  context.scrollY = 1400;
  calendar.open('item-9');
  app._route();
  calendar.back();
  app._route();
  assert.equal(homeCardIds(elements).length, 12);
  assert.equal(homeCardIds(elements).includes('item-9'), true);
  assert.equal(context.scrollY, 1400);
  assert.equal(link.focusOptions.preventScroll, true);
});

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

test('pressing Team Project 2 twice clears selection and restores matching items in both catalogs', () => {
  const { app, elements } = client();
  app.state.initLoaded = true;
  app.state.inventory = [
    { id: 'team', name: 'GC Team', category: 'instrument', courseLimit: 'TEAM_PROJECT_2' },
    { id: 'other', name: 'GC Other', category: 'instrument' },
    { id: 'glass', name: 'GC Glass', category: 'glassware' }
  ];
  app._homeCategory = app._currentCategory = 'instrument';
  app._homeSearch = app._currentSearch = 'gc';
  app._homeSort = 'nameDesc';
  const button = elements.get('home-team-project-filter');
  app._toggleHomeTeamProject2();
  assert.equal(button.classList.contains('active'), true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(elements.get('home-grid').innerHTML, /data-item-id="other"/);
  app._toggleHomeTeamProject2();
  assert.equal(button.classList.contains('active'), false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.match(elements.get('home-grid').innerHTML, /data-item-id="other"/);
  assert.doesNotMatch(elements.get('home-grid').innerHTML, /data-item-id="glass"/);
  assert.equal(app._homeSearch, 'gc');
  assert.equal(app._homeSort, 'nameDesc');
  app._setLocationFilter('Team Project 2');
  assert.doesNotMatch(elements.get('equip-grid').innerHTML, /data-item-id="other"/);
  app._setLocationFilter('Team Project 2');
  assert.equal(app._currentLocationFilter, '');
  assert.match(elements.get('equip-grid').innerHTML, /data-item-id="other"/);
  assert.match(elements.get('equip-filters').innerHTML, /class="filter-chip " aria-pressed="false" data-location="Team Project 2"/);
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

test('sorting changes display order without changing inventory or bypassing filters', () => {
  const { app } = client();
  app.state.inventory = [
    {id:'2',name:'Item 10',location:'Room 2',maxQty:3,category:'instrument',courseLimit:'TEAM PROJECT 2'},
    {id:'1',name:'Item 2',location:'Room 1',maxQty:5,category:'instrument',courseLimit:'TEAM PROJECT 2'},
    {id:'3',name:'Item 1',location:'Room 1',maxQty:10,category:'glassware'}
  ];
  app._homeCategory = 'instrument';
  app._homeTeamProject2 = true;
  for (const [sort,expected] of [['default',['2','1']],['nameAsc',['1','2']],['nameDesc',['2','1']],['location',['1','2']],['stock',['1','2']]]) {
    app._homeSort = sort;
    assert.deepEqual(Array.from(app._sortHomeItems(app._catalogItems('home')),item=>item.id),expected);
  }
  assert.deepEqual(app.state.inventory.map(item=>item.id),['2','1','3']);
});

test('selected booking button uses the list icon and updates the separate mobile counter', () => {
  const { app, context, elements } = client();
  context.uiIcon = name => 'icon:' + name;
  app.state.cart = [{item:{id:'one'}}];
  app._renderNavRight();
  assert.match(elements.get('nav-right').innerHTML,/icon:list/);
  assert.match(elements.get('mobile-cart-btn').innerHTML,/icon:list/);
  assert.match(elements.get('mobile-cart-btn').getAttribute('aria-label'),/\(1\)/);
  assert.equal(elements.get('mobile-cart-btn').hidden,false);
  app.state.cart = [];
  app._renderNavRight();
  assert.equal(elements.get('mobile-cart-btn').hidden,true);
});

test('calendar date ranges start on Monday and moving months never skips February', () => {
  const { context } = client(), calendar = context.CalendarUI;
  assert.equal(calendar.range('week','2026-11-01').from,'2026-10-26');
  assert.equal(calendar.range('week','2026-11-02').to,'2026-11-09');
  const month = calendar.range('month','2026-11-01');
  assert.equal(month.from,'2026-10-26');
  assert.equal(month.to,'2026-12-07');
  calendar.render = () => {};
  calendar.date = '2027-01-31'; calendar.view = 'month';
  calendar.move(1);
  assert.equal(calendar.date,'2027-02-01');
  calendar.move(-1);
  assert.equal(calendar.date,'2027-01-01');
});

test('calendar handles overnight bookings, adjacent boundaries, status and equipment filters', () => {
  const { app, context } = client(), calendar = context.CalendarUI;
  app.state.inventory = [{id:'one',name:'<GC>',category:'instrument',maxQty:2},{id:'two',name:'Beaker',category:'glassware',maxQty:5}];
  calendar.itemId = 'one';
  const booking = {ItemID:'one',Start:'2026-10-22T15:00:00',End:'2026-10-23T10:00:00',Quantity:1,Status:'อนุมัติแล้ว'};
  calendar.bookings = [booking,{...booking,ItemID:'two'},{...booking,Status:'ปฏิเสธ'},{...booking,End:'2026-10-23T00:00:00'}];
  assert.equal(calendar.dayBookings('2026-10-23').length,1);
  const html = calendar.eventHTML(booking,'2026-10-23');
  assert.match(html,/00:00–10:00/);
  assert.match(html,/&lt;GC&gt;/);
  calendar.itemId = ''; calendar.category = 'glassware';
  assert.equal(calendar.dayBookings('2026-10-23').length,1);
  assert.equal(calendar.dayBookings('2026-10-23')[0].ItemID,'two');
});

test('calendar defaults to all items, keeps all when changing filters, and renders translated views', () => {
  const { app, context, elements } = client(), calendar = context.CalendarUI;
  calendar.load = () => {};
  calendar.render();
  assert.equal(calendar.itemId,'');
  app.state.initLoaded = true;
  app.state.inventory = [{id:'one',name:'GC',category:'instrument',location:'CCA Lab-1',maxQty:1}];
  calendar.render();
  assert.equal(calendar.itemId,'');
  calendar.filter('itemId','one');
  calendar.filter('category','instrument');
  assert.equal(calendar.itemId,'');
  calendar.filter('itemId','one');
  calendar.filter('location','CCA Lab-1');
  assert.equal(calendar.itemId,'');
  for (const lang of ['th','en']) {
    context.LANG = lang;
    for (const view of ['week','month','list']) {
      calendar.view = view; calendar.date = '2026-10-23';
      calendar.render(); calendar.renderBody();
      assert.doesNotMatch(elements.get('page-calendar').innerHTML,/calendar\.(intro|previous|week|equipment|note|allEquipment)/);
      assert.match(elements.get('calendar-body').innerHTML,new RegExp('calendar-' + view));
    }
  }
});

test('calendar card links select that item while opening the plain calendar returns to all', () => {
  const { app, context } = client(), calendar = context.CalendarUI;
  calendar.load = () => {};
  context.location.hash = '#calendar?item=one';
  calendar.render();
  assert.equal(calendar.itemId,'one');
  app.state.initLoaded = true;
  app.state.inventory = [{id:'one',name:'GC',category:'instrument'}];
  calendar.render();
  assert.equal(calendar.itemId,'one');
  context.location.hash = '#calendar';
  calendar.render();
  assert.equal(calendar.itemId,'');
  context.location.hash = '#calendar?item=missing';
  calendar.render();
  assert.equal(calendar.itemId,'');
});

test('calendar back returns to the same card, scroll position and catalog filters', () => {
  for (const page of ['home', 'instrument']) {
    const { app, context, elements } = client(), calendar = context.CalendarUI;
    calendar.load = () => {};
    app.state.initLoaded = true;
    app.state.inventory = [{ id: 'one', name: 'GC', category: 'instrument', courseLimit: 'TEAM_PROJECT_2' }];
    app._homeCategory = 'instrument';
    app._homeSearch = 'GC';
    app._homeSort = 'nameDesc';
    app._homeTeamProject2 = true;
    app._highlightedItem = 'one';
    context.location.hash = '#' + page;
    app._route();
    app._currentSearch = 'gc';
    app._currentLocationFilter = 'Team Project 2';
    elements.get('equip-search-input').value = 'GC';
    const link = element();
    link.dataset.itemId = 'one';
    elements.get(page === 'home' ? 'home-grid' : 'equip-grid').querySelectorAll = () => [link];
    context.scrollY = 890;
    calendar.open('one');
    app._route();
    assert.equal(context.scrollY, 0);
    assert.match(elements.get('page-calendar').innerHTML, new RegExp('href="#' + page + '" onclick="CalendarUI.back'));
    calendar.setView('month');
    calendar.filter('category', 'glassware');
    calendar.back();
    app._route();
    assert.equal(context.location.hash, '#' + page);
    assert.equal(context.scrollY, 890);
    assert.equal(link.focusOptions.preventScroll, true);
    if (page === 'home') {
      assert.equal(app._homeCategory, 'instrument');
      assert.equal(app._homeSearch, 'GC');
      assert.equal(app._homeSort, 'nameDesc');
      assert.equal(app._homeTeamProject2, true);
    } else {
      assert.equal(app._currentSearch, 'gc');
      assert.equal(app._currentLocationFilter, 'Team Project 2');
      assert.equal(elements.get('equip-search-input').value, 'GC');
    }
    assert.equal(app._highlightedItem, 'one');
    context.scrollY = 300;
    app._route();
    assert.equal(context.scrollY, 0);
  }
});

test('plain and directly linked calendars go back home without a stale card origin', () => {
  const { app, context, elements } = client(), calendar = context.CalendarUI;
  calendar.load = () => {};
  context.location.hash = '#instrument';
  calendar.open('one');
  calendar.render();
  context.location.hash = '#calendar';
  calendar.render();
  calendar.back();
  assert.equal(context.location.hash, '#home');
  app._route();
  assert.equal(context.scrollY, 0);
  context.location.hash = '#calendar?item=two';
  calendar.render();
  assert.match(elements.get('page-calendar').innerHTML, /href="#home" onclick="CalendarUI.back/);
  calendar.back();
  assert.equal(context.location.hash, '#home');
});

test('a late calendar response cannot replace a newer date selection; failed reads show retry', async () => {
  const { app, context, elements } = client(), calendar = context.CalendarUI;
  app.state.initLoaded = true; calendar.date = '2026-10-23'; calendar.view = 'week';
  app.state.inventory = [{id:'one',name:'GC',category:'instrument'}];
  const pending = [];
  context.apiGet = () => new Promise(resolve=>pending.push(resolve));
  let renders = 0; calendar.renderBody = () => { renders++; };
  const old = calendar.load();
  calendar.date = '2026-11-02';
  const fresh = calendar.load(true);
  pending[1]({bookings:[{ItemID:'new'}]}); await fresh;
  pending[0]({bookings:[{ItemID:'old'}]}); await old;
  assert.equal(calendar.bookings[0].ItemID,'new');
  assert.equal(renders,1);
  context.apiGet = async () => { throw new Error('Offline'); };
  await calendar.load(true);
  assert.match(elements.get('calendar-body').innerHTML,/CalendarUI.load\(true\)/);
  assert.equal(elements.get('calendar-refresh').disabled,false);
  assert.equal(elements.get('calendar-body').getAttribute('aria-busy'),'false');
  context.apiGet = async () => ({bookings:[]});
  await calendar.load();
  assert.equal(calendar.bookings.length,0);
  assert.equal(renders,2);
});

test('calendar filters and equivalent views share an in-flight read and reuse empty results with their actual fetch time', async () => {
  const { app, context, elements } = client(), calendar = context.CalendarUI;
  app.state.initLoaded = true; calendar.date = '2026-10-19'; calendar.view = 'week';
  app.state.inventory = [{id:'one',name:'GC',category:'instrument',location:'Lab 1'}];
  calendar.renderBody = () => {};
  context.calendarClock = 1000;
  vm.runInContext('Date.now = () => calendarClock',context);
  app._formatFetchTime = timestamp => String(timestamp);
  const calls = [];
  let resolveRead;
  context.apiGet = (action,params) => {
    calls.push({action,...params});
    return new Promise(resolve => { resolveRead = resolve; });
  };
  const first = calendar.load();
  calendar.filter('category','instrument');
  calendar.filter('location','Lab 1');
  calendar.filter('itemId','one');
  calendar.setView('list');
  const latest = calendar.load();
  assert.equal(calls.length,1);
  assert.equal(calls[0].action,'getCalendar');
  assert.equal(calls[0].from,'2026-10-19');
  assert.equal(calls[0].to,'2026-10-26');
  resolveRead({bookings:[]});
  await Promise.all([first,latest]);
  assert.equal(calendar.bookings.length,0);
  context.calendarClock = 10999;
  await calendar.load();
  assert.equal(calls.length,1);
  assert.match(elements.get('calendar-meta').textContent,/1000/);
});

test('calendar expires occupancy reads after ten seconds and refresh bypasses fresh data', async () => {
  const { app, context } = client(), calendar = context.CalendarUI;
  app.state.initLoaded = true; calendar.date = '2026-10-23'; calendar.view = 'week';
  app.state.inventory = [{id:'one',name:'GC',category:'instrument'}];
  calendar.renderBody = () => {};
  context.calendarClock = 1000;
  vm.runInContext('Date.now = () => calendarClock',context);
  const calls = [];
  context.apiGet = async (action,params) => {
    calls.push(params);
    return {bookings:[{ItemID:String(calls.length)}]};
  };
  await calendar.load();
  context.calendarClock = 11000;
  await calendar.load();
  assert.equal(calls.length,2);
  assert.equal(calendar.bookings[0].ItemID,'2');
  await calendar.refresh();
  assert.equal(calls.length,3);
  assert.equal(calls[2].refresh,'1');
  assert.equal(calendar.bookings[0].ItemID,'3');
});

test('a forced calendar refresh supersedes an older same-range request in both the UI and cache', async () => {
  const { app, context } = client(), calendar = context.CalendarUI;
  app.state.initLoaded = true; calendar.date = '2026-10-23'; calendar.view = 'week';
  app.state.inventory = [{id:'one',name:'GC',category:'instrument'}];
  calendar.renderBody = () => {};
  const pending = [];
  context.apiGet = () => new Promise(resolve => pending.push(resolve));
  const old = calendar.load();
  const fresh = calendar.load(true);
  const shared = calendar.load();
  assert.equal(pending.length,2);
  pending[1]({bookings:[{ItemID:'new'}]});
  await Promise.all([fresh,shared]);
  pending[0]({bookings:[{ItemID:'old'}]});
  await old;
  assert.equal(calendar.bookings[0].ItemID,'new');
  await calendar.load();
  assert.equal(pending.length,2);
  assert.equal(calendar.bookings[0].ItemID,'new');
});

test('calendar invalidation clears fresh data and prevents an outstanding read from restoring it', async () => {
  const { app, context } = client(), calendar = context.CalendarUI;
  app.state.initLoaded = true; calendar.date = '2026-10-23'; calendar.view = 'week';
  app.state.inventory = [{id:'one',name:'GC',category:'instrument'}];
  calendar.renderBody = () => {};
  const pending = [];
  context.apiGet = () => new Promise(resolve => pending.push(resolve));
  const first = calendar.load();
  pending[0]({bookings:[{ItemID:'initial'}]});
  await first;
  calendar.invalidate();
  const old = calendar.load();
  assert.equal(pending.length,2);
  calendar.invalidate();
  const fresh = calendar.load();
  assert.equal(pending.length,3);
  pending[2]({bookings:[{ItemID:'updated'}]});
  await fresh;
  pending[1]({bookings:[{ItemID:'stale'}]});
  await old;
  await calendar.load();
  assert.equal(pending.length,3);
  assert.equal(calendar.bookings[0].ItemID,'updated');
});

test('calendar booking requires sign-in and preselects the chosen date and available hour', async () => {
  const { app, context, elements } = client(), calendar = context.CalendarUI;
  const item = {id:'one',name:'GC',category:'instrument'};
  app.state.inventory = [item]; calendar.itemId = item.id;
  let loginPrompt = false, selected;
  app._promptLogin = () => { loginPrompt = true; };
  await calendar.book('2026-10-23',10);
  assert.equal(loginPrompt,true);
  assert.equal(app.state.cart.length,0);
  app.state.user = {email:'student@kmitl.ac.th'};
  app._addToCart = () => app.state.cart.push({item});
  app._openCart = () => {};
  const field = element();
  elements.set('ci_0_date',field);
  app._scheduleDateChanged = async () => {};
  const slot = {dataset:{start:'2026-10-23T10:00:00'}};
  context.document.querySelectorAll = () => [slot];
  app._cartSelectSlot = (value,key) => { selected = {value,key}; };
  await calendar.book('2026-10-23',10);
  assert.equal(field.value,'2026-10-23');
  assert.equal(selected.value,slot);
  assert.equal(selected.key,'ci_0');
  assert.equal(app.state.cart.length,1);
});

test('missing student IDs and advisors use the same warning toast and focus the missing field', async () => {
  const { app, context, elements } = client();
  app.state.user = {email:'student@kmitl.ac.th',role:'STUDENT'};
  let posts = 0;
  const notices = [];
  context.showToast = (...notice) => notices.push(notice);
  context.apiPost = async () => { posts++; return {success:true}; };
  for (const [fieldId,submit] of [['cart-student-id',()=>app._submitCart()],['prof-student-id',()=>app._saveProfile()]]) {
    const field = element(fieldId);
    field.reportValidity = () => { field.reported = true; return false; };
    field.focus = () => { field.focused = true; };
    elements.set(fieldId,field);
    for (const value of ['',' \t ']) {
      field.value = value;
      await submit();
      assert.equal(posts,0);
      assert.equal(field.focused,true);
      assert.equal(field.reported,undefined);
      assert.equal(notices.at(-1)[0],'warning');
      assert.match(notices.at(-1)[1],/รหัสนักศึกษา/);
      assert.equal(notices.at(-1)[2],'');
    }
    field.value = ' 66010380 ';
    assert.equal(app._readStudentId(fieldId),'66010380');
  }
  const advisor = element('cart-advisor');
  advisor.value = '';
  advisor.focus = () => { advisor.focused = true; };
  elements.set('cart-advisor',advisor);
  await app._submitCart();
  assert.equal(posts,0);
  assert.equal(advisor.focused,true);
  assert.equal(notices.at(-1)[0],'warning');
  assert.match(notices.at(-1)[1],/เลือกอาจารย์/);
  assert.equal(notices.at(-1)[2],'');
});

test('staff membership makes student ID optional even in a student role, while a role alone cannot bypass it', async () => {
  const { app, context, elements } = client();
  const notices = [];
  context.showToast = (...notice) => notices.push(notice);
  app.state.user = {email:'teacher@kmitl.ac.th',role:'STUDENT'};
  app.state.staffConfig = {ADVISORS:[{email:'teacher@kmitl.ac.th'}]};
  const field = element('prof-student-id');
  field.value = ' ';
  field.reportValidity = () => { field.reported = true; };
  elements.set('prof-student-id',field);
  assert.equal(app._requiresStudentId(),false);
  assert.equal(app._readStudentId('prof-student-id'),'');
  assert.equal(field.reported,undefined);
  assert.equal(notices.length,0);
  let payload;
  context.apiPost = async data => { payload = data; return {success:true}; };
  app.closeModal = () => {};
  await app._saveProfile();
  assert.equal(payload.studentId,'');
  assert.equal(payload.email,'teacher@kmitl.ac.th');
  let prompted = false;
  app._renderProfileModal = () => { prompted = true; };
  context.apiGet = async () => ({studentId:''});
  await app._loadProfile();
  assert.equal(prompted,false);
  app.state.user = {email:'student@kmitl.ac.th',role:'ADVISORS'};
  assert.equal(app._requiresStudentId(),true);
  assert.equal(app._readStudentId('prof-student-id'),null);
  assert.equal(field.reported,undefined);
  assert.equal(notices.at(-1)[0],'warning');
});
