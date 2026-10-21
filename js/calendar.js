// Equipment occupancy only. Personal booking details stay in the authenticated views.
window.CalendarUI = {
  date: '', view: '', itemId: '', category: '', location: '', bookings: [], request: 0,

  range(view = this.view, date = this.date) {
    if (view === 'list') return { from: date, to: dateAddDays(date,7) };
    const selected = new Date(date + 'T00:00:00Z');
    if (view === 'month') selected.setUTCDate(1);
    const start = dateAddDays(selected.toISOString().slice(0, 10), -(selected.getUTCDay() + 6) % 7);
    return { from: start, to: dateAddDays(start, view === 'month' ? 42 : 7) };
  },

  format(date, options = {}) {
    return new Date(date + 'T00:00:00Z').toLocaleDateString(window.LANG === 'en' ? 'en-GB' : 'th-TH',
      { timeZone: 'UTC', ...options });
  },

  open(itemId) {
    this.itemId = itemId; this.category = ''; this.location = '';
    const hash = '#calendar?item=' + encodeURIComponent(itemId);
    if (window.location.hash === hash) this.render();
    else window.location.hash = hash;
  },

  items() {
    return App.state.inventory.filter(item => (!this.category || item.category === this.category)
      && (!this.location || (this.location === 'Team Project 2' ? App._matchesTeamProject2(item) : item.location === this.location)));
  },

  render() {
    this.date ||= todayISO();
    this.view ||= window.matchMedia('(max-width: 700px)').matches ? 'list' : 'week';
    const linkedItem = new URLSearchParams(window.location.hash.split('?')[1] || '').get('item');
    if (linkedItem && linkedItem !== this.linkedItem) { this.itemId = linkedItem; this.linkedItem = linkedItem; }
    if (!linkedItem && this.linkedItem) { this.itemId = ''; this.linkedItem = ''; }
    const items = this.items();
    if (App.state.initLoaded && this.itemId && !items.some(item => item.id === this.itemId)) this.itemId = '';
    const locations = [...new Set(App.state.inventory.map(item => item.location).filter(Boolean))].sort();
    const option = (value, label, current) => `<option value="${escHtml(value)}" ${current === value ? 'selected' : ''}>${escHtml(label)}</option>`;
    document.getElementById('page-calendar').innerHTML = `<div class="calendar-page">
      <div class="calendar-heading"><div><h1>${t('nav.calendar')}</h1><p>${t('calendar.intro')}</p></div>
        <button class="btn btn-secondary" id="calendar-refresh" onclick="CalendarUI.refresh()">${t('mybook.refresh')}</button></div>
      <div class="calendar-filters">
        <label>${t('section.catLabel')}<select class="form-select" onchange="CalendarUI.filter('category',this.value)">
          ${option('', t('equip.filterAll'), this.category)}${Object.keys(CAT_CONFIG).map(id => option(id,t('cat.' + id + '.nameShort'),this.category)).join('')}</select></label>
        <label>${t('calendar.location')}<select class="form-select" onchange="CalendarUI.filter('location',this.value)">
          ${option('',t('equip.filterAll'),this.location)}${option('Team Project 2','Team Project 2',this.location)}${locations.filter(location => location !== 'Team Project 2').map(location => option(location,location,this.location)).join('')}</select></label>
        <label>${t('calendar.equipment')}<select class="form-select" id="calendar-item" onchange="CalendarUI.filter('itemId',this.value)">
          ${option('',t('calendar.allEquipment'),this.itemId)}${items.map(item => option(item.id,[item.name,item.model,item.location].filter(Boolean).join(' · '),this.itemId)).join('')}</select></label>
      </div>
      <div class="calendar-toolbar"><div class="calendar-date-controls">
        <button class="btn btn-secondary" onclick="CalendarUI.move(-1)" aria-label="${t('calendar.previous')}">‹</button>
        <button class="btn btn-secondary" onclick="CalendarUI.goToday()">${t('calendar.today')}</button>
        <button class="btn btn-secondary" onclick="CalendarUI.move(1)" aria-label="${t('calendar.next')}">›</button>
        <input class="form-input" type="date" value="${this.date}" aria-label="${t('calendar.chooseDate')}" onchange="CalendarUI.chooseDate(this.value)">
      </div><div class="calendar-views" role="group" aria-label="${t('calendar.view')}">
        ${['week','month','list'].map(view => `<button class="filter-chip ${this.view === view ? 'active' : ''}" aria-pressed="${this.view === view}" onclick="CalendarUI.setView('${view}')">${t('calendar.' + view)}</button>`).join('')}
      </div></div>
      <div class="calendar-legend"><span class="calendar-status approved">${t('calendar.approved')}</span><span class="calendar-status pending">${t('calendar.pending')}</span><span>${t('calendar.timezone')}</span></div>
      <p id="calendar-meta" class="calendar-meta" role="status"></p>
      <div id="calendar-body" aria-busy="true"></div>
    </div>`;
    this.load();
  },

  filter(key, value) {
    this[key] = value;
    if (key !== 'itemId') this.itemId = '';
    this.render();
  },
  setView(view) { this.view = view; this.render(); },
  chooseDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return;
    this.date = date; this.render();
  },
  goToday() { this.date = todayISO(); this.render(); },
  refresh() {
    if (App.state.initLoaded) return this.load(true);
    return App._refreshInventory(true).catch(() => showToast('error',t('toast.loadFail'),t('toast.loadFailHint')));
  },
  move(direction) {
    if (this.view === 'month') {
      const date = new Date(this.date + 'T00:00:00Z');
      date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + direction);
      this.date = date.toISOString().slice(0, 10);
    } else this.date = dateAddDays(this.date, direction * 7);
    this.render();
  },

  async load(refresh = false) {
    const request = ++this.request, body = document.getElementById('calendar-body');
    const meta = document.getElementById('calendar-meta'), button = document.getElementById('calendar-refresh');
    if (!body) return;
    body.setAttribute('aria-busy','true');
    body.innerHTML = `<p class="calendar-empty">${t(App.state.initError ? 'toast.loadFail' : 'catalog.loading')}</p>`;
    if (!App.state.initLoaded) { body.setAttribute('aria-busy','false'); return; }
    if (!this.items().length) {
      body.innerHTML = `<p class="calendar-empty">${t('equip.noResults')}</p>`;
      body.setAttribute('aria-busy','false'); meta.textContent = ''; return;
    }
    button.disabled = true;
    try {
      const range = this.range();
      const data = await apiGet('getCalendar', { ...range, ...(refresh ? {refresh:'1'} : {}) });
      if (!data || !Array.isArray(data.bookings)) throw new Error('Invalid calendar response');
      if (request !== this.request || document.getElementById('calendar-body') !== body) return;
      this.bookings = data.bookings;
      this.renderBody();
      meta.textContent = `${t('catalog.fetchedAt')} ${App._formatFetchTime(Date.now())} · ${t('calendar.note')}`;
    } catch (_) {
      if (request !== this.request || document.getElementById('calendar-body') !== body) return;
      body.innerHTML = `<div class="calendar-empty"><p>${t('toast.loadFail')}</p><button class="btn btn-secondary" onclick="CalendarUI.load(true)">${t('mybook.refresh')}</button></div>`;
      meta.textContent = '';
    } finally {
      if (request === this.request) { body.setAttribute('aria-busy','false'); button.disabled = false; }
    }
  },

  dayBookings(date) {
    const start = BookingRules.timestamp(date + 'T00:00:00'), end = start + 86400000;
    const ids = new Set(this.items().filter(item => !this.itemId || item.id === this.itemId).map(item => item.id));
    return this.bookings.filter(booking => ids.has(String(booking.ItemID))
      && BookingRules.pending.concat(BookingRules.approved).includes(booking.Status)
      && BookingRules.timestamp(booking.Start) < end && BookingRules.timestamp(booking.End) > start)
      .sort((a,b) => BookingRules.timestamp(a.Start) - BookingRules.timestamp(b.Start));
  },

  eventHTML(booking, date) {
    const item = App.state.inventory.find(item => item.id === String(booking.ItemID));
    const pending = BookingRules.pending.includes(booking.Status);
    const start = BookingRules.timestamp(booking.Start), end = BookingRules.timestamp(booking.End);
    const dayStart = BookingRules.timestamp(date + 'T00:00:00');
    const time = value => new Date(value).toLocaleTimeString('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});
    const label = `${start < dayStart ? '00:00' : time(start)}–${end >= dayStart + 86400000 ? '24:00' : time(end)}`;
    return `<div class="calendar-event ${pending ? 'pending' : 'approved'}"><strong>${escHtml(item?.name || '')}</strong>
      <span>${label} · ${t('calendar.quantity')} ${booking.Quantity}</span><span>${t(pending ? 'calendar.pending' : 'calendar.approved')}</span></div>`;
  },

  slotsHTML(date) {
    const item = App.state.inventory.find(item => item.id === this.itemId);
    if (!item || !BookingRules.businessDay(date, App.state.holidays)) return '';
    return `<details class="calendar-slots"><summary>${t('calendar.slots')}</summary>${Array.from({length:7},(_,index) => {
      const hour = index + 9, start = `${date}T${pad(hour)}:00:00`, end = `${date}T${pad(hour+1)}:00:00`;
      const remaining = BookingRules.availableQuantity(item.id,start,end,this.bookings,item.maxQty);
      const disabled = remaining < 1 || date < App._minBookingDate() || date > dateAddDays(todayISO(),180);
      return `<button ${disabled ? 'disabled' : ''} onclick="CalendarUI.book('${date}',${hour})"><span>${pad(hour)}:00–${pad(hour+1)}:00</span><span>${t('calendar.remaining')} ${remaining}</span></button>`;
    }).join('')}</details>`;
  },

  renderBody() {
    const {from,to} = this.range(), days = [];
    for (let date = from; date < to; date = dateAddDays(date,1)) days.push(date);
    const month = this.view === 'month';
    const header = month ? days.slice(0,7).map(date => `<div class="calendar-weekday">${this.format(date,{weekday:'short'})}</div>`).join('') : '';
    document.getElementById('calendar-body').innerHTML = `<h2 class="calendar-period">${month ? this.format(this.date,{month:'long',year:'numeric'}) : `${this.format(from,{day:'numeric',month:'short'})} – ${this.format(dateAddDays(to,-1),{day:'numeric',month:'short',year:'numeric'})}`}</h2>
      <div class="calendar-grid calendar-${this.view}">${header}${days.map(date => {
        const bookings = this.dayBookings(date), businessDay = BookingRules.businessDay(date,App.state.holidays);
        return `<section class="calendar-day ${date === todayISO() ? 'is-today' : ''} ${month && date.slice(0,7) !== this.date.slice(0,7) ? 'outside-month' : ''}">
          <h3><time datetime="${date}">${this.format(date,month ? {day:'numeric'} : {weekday:'short',day:'numeric',month:'short'})}</time></h3>
          ${!businessDay ? `<p class="calendar-day-note">${t('calendar.closed')}</p>` : ''}
          ${bookings.slice(0,month ? 2 : bookings.length).map(booking => this.eventHTML(booking,date)).join('')}
          ${month && bookings.length > 2 ? `<button class="calendar-more" onclick="CalendarUI.date='${date}';CalendarUI.setView('week')">+${bookings.length-2} ${t('toast.items')}</button>` : ''}
          ${!bookings.length ? `<p class="calendar-day-note">${t('calendar.noBookings')}</p>` : ''}
          ${month ? `<button class="calendar-more" onclick="CalendarUI.date='${date}';CalendarUI.setView('list')">${t('calendar.daySchedule')}</button>` : this.slotsHTML(date)}
        </section>`;
      }).join('')}</div>`;
  },

  async book(date, hour) {
    const item = App.state.inventory.find(item => item.id === this.itemId);
    if (!item) return;
    if (!App.state.user) { App._promptLogin(); return; }
    if (!App.state.cart.some(entry => entry.item.id === item.id)) App._addToCart(item.id);
    App._openCart();
    const key = 'ci_' + App.state.cart.findIndex(entry => entry.item.id === item.id);
    const field = document.getElementById(key + '_date');
    if (field._flatpickr) field._flatpickr.setDate(date,false); else field.value = date;
    await App._scheduleDateChanged(key,date);
    if (document.getElementById(key + '_date') !== field || field.value !== date) return;
    const slot = [...document.querySelectorAll('#' + key + '_slots .time-slot:not(:disabled)')].find(slot => slot.dataset.start === `${date}T${pad(hour)}:00:00`);
    if (slot) App._cartSelectSlot(slot,key);
  }
};
