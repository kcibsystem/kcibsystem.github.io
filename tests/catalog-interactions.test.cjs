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
  for (const id of ['home-search', 'equip-search-input', 'home-suggestions', 'equip-suggestions', 'home-grid', 'page-home', 'page-info', 'page-calendar', 'calendar-body', 'calendar-meta', 'calendar-refresh', 'nav-right', 'mobile-cart-btn']) elements.set(id, element(id));
  const context = vm.createContext({
    console, URL, URLSearchParams, uiIcon: () => '', updateThemeControls: () => {},
    localStorage: { getItem: key => key === 'kcib_lang' ? 'th' : null },
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
  vm.runInContext(fs.readFileSync('js/booking-rules.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace(/App\.boot\(\);\s*$/, ''), context);
  vm.runInContext(fs.readFileSync('js/calendar.js', 'utf8'), context);
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
  await calendar.load();
  assert.match(elements.get('calendar-body').innerHTML,/CalendarUI.load\(true\)/);
  assert.equal(elements.get('calendar-refresh').disabled,false);
  assert.equal(elements.get('calendar-body').getAttribute('aria-busy'),'false');
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
