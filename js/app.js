// ============================================================
// KCIB App v2.0 — Google Sheet backed, Google Login
// ============================================================

/* ====================================================
   CATEGORY CONFIG (display-only, not data source)
   ==================================================== */
const CAT_CONFIG = {
  instrument: {
    id: 'instrument', name: 'เครื่องมือ / เครื่องวิเคราะห์', nameShort: 'เครื่องมือ',
    nameEn: 'Instruments',
    icon: uiIcon('instrument'), bgColor: 'var(--cat-blue-bg)', textColor: 'var(--cat-blue)',
    desc: 'เครื่องมือวิเคราะห์และทดสอบสำหรับงานวิจัยและการเรียนการสอน',
    bookingType: 'timed', advanceDays: 3, weekdayOnly: true,
    hours: { start: 9, end: 16 }, maxHours: 3
  },
  glassware: {
    id: 'glassware', name: 'เครื่องแก้ว', nameShort: 'เครื่องแก้ว',
    nameEn: 'Glassware',
    icon: uiIcon('glassware'), bgColor: 'var(--cat-purple-bg)', textColor: 'var(--cat-purple)',
    desc: 'อุปกรณ์เครื่องแก้วสำหรับการทดลองในห้องปฏิบัติการ',
    bookingType: 'quantity'
  },
  scientific: {
    id: 'scientific', name: 'อุปกรณ์วิทยาศาสตร์', nameShort: 'อุปกรณ์วิทย์',
    nameEn: 'Scientific',
    icon: uiIcon('scientific'), bgColor: 'var(--cat-green-bg)', textColor: 'var(--cat-green)',
    desc: 'อุปกรณ์วิทยาศาสตร์ทั่วไป เช่น จุกยาง, แคลมป์, ขาตั้ง',
    bookingType: 'quantity'
  },
  chemical: {
    id: 'chemical', name: 'สารเคมี', nameShort: 'สารเคมี',
    nameEn: 'Chemicals',
    icon: uiIcon('chemical'), bgColor: 'var(--cat-orange-bg)', textColor: 'var(--cat-orange)',
    desc: 'สารเคมีสำหรับการทดลองในห้องปฏิบัติการ',
    bookingType: 'quantity'
  }
};

// ============================================================
// STATE
// ============================================================
window.App = {
  state: {
    user:        null,     // { email, name, picture, role, roleLabel }
    inventory:   [],       // raw items from GSheet
    holidays:    new Set(),// Set<"yyyy-MM-dd">
    staffConfig: {},       // { ROLE: [{email, name}] }
    bookings:    [],       // cached my-bookings
    cart:        [],       // cart items: { item, id }
    initLoaded:  false,
    initError:   false,
    profile:     null      // { studentId, educationLevel }
  },
  _allBookings: [],
  _notifCount: 0,


  /* -------------------------------------------------- BOOT */
  async boot() {
    // Try restore session
    this._restoreSession();

    // Attach navbar events
    this._initNavbar();
    updateThemeControls();

    // Hash routing
    window.addEventListener('hashchange', () => this._route());

    // The page is usable immediately; inventory loads in place.
    this._route();
    this._renderNavRight();
    this._renderGSI();

    // Load data from Apps Script
    try {
      await this._loadInit();
    } catch (e) {
      this.state.initError = true;
      console.error('Failed to load init data:', e);
      showToast('error', t('toast.loadFail'), t('toast.loadFailHint'));
    }

    // Route
    this._route();
    this._renderNavRight();
    this._renderGSI();

    // Load notification count in background (after UI ready)
    if (this.state.user) {
      setTimeout(() => this._loadNotifData(), 800);
    }
  },

  /* -------------------------------------------------- INIT DATA */
  async _loadInit() {
    const CACHE_KEY = 'kcib_init_v1';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Try cache first for instant load
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          this._applyInitData(data);
          // Refresh in background silently
          apiGet('init').then(fresh => {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: fresh }));
            this._applyInitData(fresh);
            if (!document.getElementById('modal-overlay').classList.contains('open')) this._route();
            this._renderNavRight();
          }).catch(() => {});
          return;
        }
      }
    } catch (_) {}

    const data = await apiGet('init');
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {}
    this._applyInitData(data);
  },

  _applyInitData(data) {
    const inv = data.inventory || [];
    this.state.inventory = inv.map(normalizeItem);

    const holidays = data.holidays || [];
    this.state.holidays = new Set(holidays.map(h => h.date).filter(Boolean));

    this.state.staffConfig = data.staffConfig || {};
    this.state.initLoaded  = true;
    this.state.initError   = false;

    // Re-determine role if user already logged in
    if (this.state.user) {
      this.state.user.role      = this._determineRole(this.state.user.email);
      this.state.user.roleLabel = this._roleLabel(this.state.user.role);
    }
  },

  /* -------------------------------------------------- GOOGLE LOGIN */
  handleGoogleLogin(response) {
    const credential = jwtDecode(response.credential);
    if (!credential) { showToast('error', t('toast.credError'), t('toast.credErrorDesc')); return; }

    const _email = (credential.email || '').toLowerCase().trim();
    const _isKmitl = credential.hd === 'kmitl.ac.th' || _email.endsWith('@kmitl.ac.th');
    const _staffCfg = this.state.staffConfig || {};
    const _isStaff = Object.values(_staffCfg).some(members =>
      members.some(m => (m.email || '').toLowerCase().trim() === _email)
    );
    if (!_isKmitl && !_isStaff) {
      showToast('error', 'ไม่สามารถเข้าสู่ระบบได้', 'ต้องใช้อีเมลสถาบัน @kmitl.ac.th เท่านั้น');
      return;
    }

    localStorage.setItem('kcib_token', response.credential);

    this.state.user = {
      email:     credential.email.toLowerCase().trim(),
      name:      credential.name || `${credential.given_name} ${credential.family_name}`,
      givenName: credential.given_name || '',
      picture:   credential.picture || '',
      role:      this._determineRole(credential.email),
    };
    this.state.user.roleLabel = this._roleLabel(this.state.user.role);

    this._renderNavRight();
    this._updateAuthLinks();
    showToast('success', t('toast.loginSuccess'), `${t('toast.welcome')} ${this.state.user.givenName}`);

    // Load profile + notification count in background
    setTimeout(() => this._loadProfile(), 300);
    setTimeout(() => this._loadNotifData(), 500);

    // Navigate to current page (refresh view)
    this._route();
  },

  logout() {
    localStorage.removeItem('kcib_token');
    this.state.user    = null;
    this.state.bookings = [];
    if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    this._renderNavRight();
    this._renderGSI();
    this._updateAuthLinks();
    showToast('info', t('toast.loggedOut'), '');
    this.navigate('home');
  },

  _restoreSession() {
    const token = localStorage.getItem('kcib_token');
    if (!token) return;
    const cred = jwtDecode(token);
    if (!cred || cred.exp * 1000 < Date.now()) {
      localStorage.removeItem('kcib_token');
      return;
    }
    this.state.user = {
      email:     cred.email.toLowerCase().trim(),
      name:      cred.name || `${cred.given_name} ${cred.family_name}`,
      givenName: cred.given_name || '',
      picture:   cred.picture || '',
      role:      'STUDENT', // will be updated after init loads
      roleLabel: 'นักศึกษา'
    };
  },

  /* -------------------------------------------------- ROLE */
  _determineRole(email) {
    const roles = BookingRules.rolesFor(email, this.state.staffConfig);
    const saved = localStorage.getItem('kcib_role_' + email.toLowerCase().trim());
    return roles.includes(saved) ? saved : (roles[0] || 'STUDENT');
  },

  _roleSwitcherHTML() {
    const user = this.state.user;
    const roles = user ? BookingRules.rolesFor(user.email, this.state.staffConfig) : [];
    if (roles.length < 2) return '';
    return `<label class="role-switcher">${t('role.switch')}
      <select onchange="App._switchRole(this.value)">
        ${roles.map(role => `<option value="${escHtml(role)}" ${role === user.role ? 'selected' : ''}>${t('role.' + role)}</option>`).join('')}
      </select></label>`;
  },

  _switchRole(role) {
    const user = this.state.user;
    if (!user || !BookingRules.rolesFor(user.email, this.state.staffConfig).includes(role)) return;
    user.role = role;
    user.roleLabel = this._roleLabel(role);
    localStorage.setItem('kcib_role_' + user.email, role);
    closeDropdown();
    this._renderNavRight();
    this._route();
    this._loadNotifData();
  },

  _roleLabel(role) {
    const map = {
      ADVISORS:        'อาจารย์ที่ปรึกษา',
      HEAD_DEPT:       'หัวหน้าภาควิชา',
      STAFF_FLOOR_1:   'เจ้าหน้าที่ห้องปฏิบัติการชั้น 1',
      STAFF_PROJECT_2: 'เจ้าหน้าที่ TEAM PROJECT 2',
      VIEWERS:         'ผู้ดูแลระบบ (Viewer)',
      STUDENT:         'นักศึกษา'
    };
    return map[role] || role;
  },

  _isStaff() {
    const r = this.state.user?.role;
    // VIEWERS ดูได้อย่างเดียว ถือเป็น staff ได้ (เข้า dashboard ได้) แต่ไม่มีปุ่มอนุมัติ
    return r && r !== 'STUDENT';
  },

  /* -------------------------------------------------- NAVBAR */
  _initNavbar() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') navClose();
    });
  },

  _renderNavRight() {
    const el = document.getElementById('nav-right');
    if (!el) return;
    const u    = this.state.user;
    const cart = this.state.cart;

    const svgCart = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3h3l2.5 12a2 2 0 0 0 2 1.5h8a2 2 0 0 0 2-1.5L22 7H7"/><circle cx="10" cy="20.5" r="1.3"/><circle cx="18" cy="20.5" r="1.3"/></svg>`;
    const svgBell = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.5 21a2 2 0 0 0 3 0"/></svg>`;
    const svgGoogle = `<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.17v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.17A11 11 0 0 0 1 12c0 1.77.42 3.45 1.17 4.95l3.67-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.17 7.05l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>`;

    const cartBtnHtml = cart.length > 0
      ? `<button class="cart-btn" onclick="App._openCart()" title="${t('cart.title')}">
           ${svgCart}
           <span class="cart-count">${cart.length}</span>
         </button>`
      : '';

    if (!u) {
      // Hide mobile notif bell when logged out
      const mobileNotifBtnOut = document.getElementById('mobile-notif-btn');
      if (mobileNotifBtnOut) mobileNotifBtnOut.style.display = 'none';

      el.innerHTML = `${cartBtnHtml}
        <div class="kcib-signin-wrap" title="Sign in with Google">
          <div class="kcib-signin-face" aria-hidden="true">
            ${svgGoogle}
            <span>Sign in with Google</span>
          </div>
          <div id="g_id_signin_button" class="kcib-gsi-over"></div>
        </div>`;
      this._renderGSI();
      // Mobile: show sign-in slot in the drawer
      const mobileSlot = document.getElementById('mobile-signin-slot');
      if (mobileSlot) {
        mobileSlot.innerHTML = `
          <button class="kcib-signin-btn" onclick="App._doSignIn();navClose();" style="width:100%;justify-content:center;margin:4px 0;">
            ${svgGoogle}
            <span>Sign in with Google</span>
          </button>`;
      }
    } else {
      // Mobile: show notif bell next to hamburger
      const mobileNotifBtn = document.getElementById('mobile-notif-btn');
      if (mobileNotifBtn) mobileNotifBtn.style.display = 'flex';

      // Mobile: show user card in the drawer
      const mobileSlot = document.getElementById('mobile-signin-slot');
      if (mobileSlot) {
        const av = u.picture
          ? `<img class="user-avatar-img" src="${u.picture}" alt="" referrerpolicy="no-referrer" style="width:36px;height:36px;">`
          : `<div class="user-avatar-init" style="width:36px;height:36px;font-size:15px;">${(u.givenName||u.name||'U').charAt(0).toUpperCase()}</div>`;
        mobileSlot.innerHTML = `
          <div class="mobile-user-card">
            ${av}
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.givenName||u.name.split(' ')[0]}</div>
              <div style="font-size:11px;color:var(--accent);font-weight:600;">${t('role.' + u.role)}</div>
            </div>
            <button onclick="navClose();App.logout();" class="mobile-logout-btn">${t('logout')}</button>
          </div>`;
      }

      const avatarHtml = u.picture
        ? `<img class="user-avatar-img" src="${u.picture}" alt="${u.givenName}" referrerpolicy="no-referrer">`
        : `<div class="user-avatar-init">${(u.givenName || u.name || 'U').charAt(0).toUpperCase()}</div>`;

      const notifCount = this._notifCount || 0;
      el.innerHTML = `
        ${cartBtnHtml}
        <button class="notif-btn" id="notif-btn" onclick="App._toggleNotifDropdown(event)" title="${t('notif.btnTitle')}">
          ${svgBell}
          <span class="notif-badge" id="notif-badge" style="display:${notifCount > 0 ? 'flex' : 'none'};">${notifCount}</span>
        </button>
        <div class="user-menu" id="user-menu-btn">
          ${avatarHtml}
          <div>
            <div class="user-name">${u.givenName || u.name.split(' ')[0]}</div>
            <div class="user-role">${t('role.' + u.role)}</div>
          </div>
          <div class="user-caret">▾</div>
        </div>`;

      document.getElementById('user-menu-btn').addEventListener('click', e => {
        e.stopPropagation();
        this._toggleUserDropdown();
      });
    }
    if (u) document.getElementById('mobile-signin-slot')?.insertAdjacentHTML('beforeend', this._roleSwitcherHTML());
    this._updateAuthLinks();
    // Mobile cart link visibility
    const mobileCartLink = document.getElementById('mobile-cart-link');
    if (mobileCartLink) {
      mobileCartLink.style.display = this.state.cart.length > 0 ? '' : 'none';
      mobileCartLink.textContent = ` ${t('cart.title')} (${this.state.cart.length})`;
    }
  },

  _toggleUserDropdown() {
    const existing = document.getElementById('user-dropdown');
    if (existing) { existing.remove(); return; }

    const u = this.state.user;
    if (!u) return;

    const isStaff = this._isStaff();
    const menu = document.createElement('div');
    menu.id = 'user-dropdown';
    menu.innerHTML = `
      <div class="dropdown-header">
        <div class="dropdown-user-name">${u.name}</div>
        <div class="dropdown-user-role">${t('role.' + u.role)}</div>
        <div class="dropdown-user-email">${u.email}</div>
      </div>
      ${this._roleSwitcherHTML()}
      <div class="dropdown-items">
        <div class="dropdown-item" onclick="closeDropdown();App.navigate('my-bookings');">
          <span>${uiIcon('list')}</span> ${t('menu.myBookings')}
        </div>
        <div class="dropdown-item" onclick="closeDropdown();App._renderProfileModal(true);">
          <span>${uiIcon('list')}</span> ${t('menu.editProfile')}
        </div>
        ${isStaff ? `
        <div class="dropdown-item" onclick="closeDropdown();App.navigate('dashboard');">
          <span>${uiIcon('list')}</span> ${t('menu.dashboard')}
        </div>
        <a class="dropdown-item" href="${window.GSHEET_URL||GSHEET_URL}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">
          <span>${uiIcon('list')}</span> ${t('menu.viewSheets')}
        </a>` : ''}
        <div class="dropdown-divider"></div>
        <div class="dropdown-item danger" onclick="closeDropdown();App.logout();">
          <span>${uiIcon('user')}</span> ${t('menu.logout')}
        </div>
      </div>`;
    document.body.appendChild(menu);

    // Align dropdown to the right edge of the user-menu button
    const menuBtn = document.getElementById('user-menu-btn');
    if (menuBtn) {
      menuBtn.classList.add('open');
      const rect = menuBtn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top  = (rect.bottom + 8) + 'px';
      menu.style.left = 'auto';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
    }

    setTimeout(() => {
      document.addEventListener('click', closeDropdown, { once: true });
    }, 0);
  },

  _updateAuthLinks() {
    const u  = this.state.user;
    const is = this._isStaff();
    document.querySelectorAll('.auth-only').forEach(el => {
      el.style.display = u ? '' : 'none';
    });
    document.querySelectorAll('.staff-only').forEach(el => {
      el.style.display = (u && is) ? '' : 'none';
    });
  },

  _renderGSI() {
    const el = document.getElementById('g_id_signin_button');
    if (!el) return;
    const tryRender = () => {
      if (window.google?.accounts?.id) {
        if (!App._gsiInitialized) {
          google.accounts.id.initialize({
            client_id: window.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID,
            callback:  handleCredentialResponse,
            auto_prompt: false
          });
          App._gsiInitialized = true;
        }
        google.accounts.id.renderButton(el, {
          theme: 'outline', size: 'large', shape: 'rectangular', text: 'signin_with', width: 220
        });
        clearInterval(timer);
      }
    };
    const timer = setInterval(tryRender, 60);
    tryRender();
  },

  _renderGSIMobile() {
    /* no-op: mobile uses kcib-signin-btn which triggers prompt() */
  },

  _doSignIn() {
    if (window.google?.accounts?.id) {
      google.accounts.id.prompt();
    } else {
      setTimeout(() => this._doSignIn(), 200);
    }
  },

  /* -------------------------------------------------- ROUTING */
  navigate(page) {
    window.location.hash = '#' + page;
  },

  _route() {
    const hash  = window.location.hash.slice(1) || 'home';
    const page  = hash.split('?')[0];
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));

    switch (page) {
      case 'home':        this._renderHome();             showPage('page-home');         break;
      case 'instrument':  this._renderEquipment('instrument'); showPage('page-equipment');  break;
      case 'glassware':   this._renderEquipment('glassware');  showPage('page-equipment');  break;
      case 'scientific':  this._renderEquipment('scientific'); showPage('page-equipment');  break;
      case 'chemical':    this._renderEquipment('chemical');   showPage('page-equipment');  break;
      case 'my-bookings': this._renderMyBookings();         showPage('page-my-bookings'); break;
      case 'dashboard':   this._renderDashboard();          showPage('page-dashboard');   break;
      default:            this._renderHome();             showPage('page-home');
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  /* ================================================== HOME PAGE */
  _renderHome() {
    const el   = document.getElementById('page-home');
    const inv  = this.state.inventory;
    const u    = this.state.user;

    const countFor = cat => inv.filter(i => i.category === cat).length;
    const availFor = cat => inv.filter(i => i.category === cat && i.available).length;

    el.innerHTML = `
      <!-- HERO -->
      <section class="hero" aria-labelledby="home-title">
        <div class="hero-inner">
        <div class="hero-eyebrow">${t('hero.eyebrow')}</div>
        <h1 class="hero-title" id="home-title">${t('hero.title1')}</h1>
        <p class="hero-department">${t('hero.title2')}</p>
        <p class="hero-sub">${t('hero.sub')}</p>
        ${u
          ? `<div class="hero-welcome">
               ${u.picture ? `<img src="${u.picture}" alt="" referrerpolicy="no-referrer">` : ''}
               ${t('hero.welcome')}, ${u.givenName || u.name.split(' ')[0]}
             </div>`
          : ''
        }
        <a href="#categories" class="hero-cta" onclick="document.getElementById('categories').scrollIntoView();return false;">${t('hero.cta')}</a>
        </div>
      </section>

      <!-- NOTICE -->
      <div class="notice-bar">${t('notice')}</div>

      <!-- STATS -->
      <section class="section">
        <div class="section-inner">
          <div class="stats-row">
            ${[
              { num: countFor('instrument'), label: t('stat.instrument') },
              { num: countFor('glassware'),  label: t('stat.glassware') },
              { num: countFor('scientific'), label: t('stat.scientific') },
              { num: inv.filter(i => i.available).length, label: t('stat.available') },
            ].map(s => `
              <div class="stat-card">
                <div class="stat-num">${this.state.initLoaded ? s.num : '—'}</div>
                <div class="stat-label">${s.label}</div>
              </div>`).join('')}
          </div>

          <h2 class="section-title" id="categories">${t('section.catTitle')}</h2>
          <p class="section-desc">
            ${t('section.catDesc')}<br>
            <span class="realtime-ts">
              <span class="realtime-dot"></span>
              ${t('section.updatedAt')}: ${new Date().toLocaleString(window.LANG === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })}${window.LANG === 'en' ? '' : 'น.'}
            </span>
          </p>

          <div class="cat-grid">
            ${Object.values(CAT_CONFIG).map(cat => {
              const name = t(`cat.${cat.id}.name`);
              const desc = t(`cat.${cat.id}.desc`);
              return `
              <a class="cat-card" href="#${cat.id}" onclick="App.navigate('${cat.id}');return false;">
                <div class="cat-card-top">
                  <div class="cat-icon" style="background:${cat.bgColor};color:${cat.textColor};">${cat.icon}</div>
                  <div class="cat-info">
                    <div class="cat-name">${name}</div>
                    <div class="cat-desc">${desc}</div>
                  </div>
                </div>
                <div class="cat-card-bottom">
                  <div class="cat-count">
                    <span class="cat-count-num">${this.state.initLoaded ? availFor(cat.id) : '—'}</span>
                    <span>${t('cat.availOf')} ${this.state.initLoaded ? countFor(cat.id) : '—'} ${t('cat.ready')}</span>
                  </div>
                  <div class="cat-arrow">→</div>
                </div>
              </a>`;
            }).join('')}
          </div>
        </div>
      </section>

      <!-- HOW TO -->
      <section class="section section-alt">
        <div class="section-inner">
          <h2 class="section-title">${t('section.howTitle')}</h2>
          <div class="steps-grid">
            ${[
              { n:'1', title: t('step1.title'), desc: t('step1.desc') },
              { n:'2', title: t('step2.title'), desc: t('step2.desc') },
              { n:'3', title: t('step3.title'), desc: t('step3.desc') },
              { n:'4', title: t('step4.title'), desc: t('step4.desc') },
            ].map(s => `
              <div class="step-card">
                <div class="step-num">${s.n}</div>
                <div class="step-title">${s.title}</div>
                <div class="step-desc">${s.desc}</div>
              </div>`).join('')}
          </div>
        </div>
      </section>
    `;
  },

  /* ================================================== EQUIPMENT PAGE */
  _currentCategory:        '',
  _currentFilter:          '',
  _currentSearch:          '',
  _currentLocationFilter:  '',

  _renderEquipment(catId) {
    this._currentCategory       = catId;
    this._currentFilter         = '';
    this._currentSearch         = '';
    this._currentLocationFilter = '';
    const cat = CAT_CONFIG[catId];
    if (!cat) { this.navigate('home'); return; }

    const el = document.getElementById('page-equipment');
    el.innerHTML = `
      <div class="bhead-banner">
        <div class="bh-inner">
          <h1 class="bh-title">
            ${t(`cat.${catId}.name`)}
            <span class="bh-title-en">${cat.nameEn}</span>
          </h1>
          <p class="bh-desc">${t(`cat.${catId}.desc`)}</p>
        </div>
      </div>
      <div class="equip-search-sticky">
        <div class="equip-controls">
          <button class="equip-back" onclick="App.navigate('home')">${t('equip.back')}</button>
          <div class="equip-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" placeholder="${t('equip.search')}" aria-label="${t('equip.search')}" id="equip-search-input"
              oninput="App._onSearch(this.value)">
          </div>
        </div>
      </div>
      <div id="equip-filters" class="equip-filters"></div>
      <div class="equip-content">
        <div class="equip-grid" id="equip-grid"></div>
      </div>`;

    if (!this.state.initLoaded) {
      document.getElementById('equip-grid').innerHTML = this.state.initError
        ? `<div class="equip-empty"><p>${t('toast.loadFail')}</p><button class="btn btn-secondary" onclick="location.reload()">${t('mybook.refresh')}</button></div>`
        : this._skeletonGrid(6);
      return;
    }
    this._renderLocationFilters();
    this._renderEquipGrid();
  },

  _renderLocationFilters() {
    const catId  = this._currentCategory;
    const items  = this.state.inventory.filter(i => i.category === catId);
    const filterEl = document.getElementById('equip-filters');
    if (!filterEl) return;

    // Fixed filters always shown
    const FIXED_FILTERS = [
      { label: 'Team Project 2', icon: '', match: (i) =>
          /team.?project.?2/i.test(i.courseLimit) || /team.?project.?2/i.test(i.location) },
      { label: 'CCA Lab-1', icon: '', match: (i) => /cca.?lab.?1/i.test(i.location) },
      { label: 'CCA Lab-3', icon: '', match: (i) => /cca.?lab.?3/i.test(i.location) },
    ];

    // Extra dynamic locations not covered by fixed filters
    const fixedLabels = new Set(FIXED_FILTERS.map(f => f.label.toLowerCase()));
    const dynamicLocs = [...new Set(items.map(i => i.location).filter(Boolean))]
      .sort()
      .filter(loc => !FIXED_FILTERS.some(f => f.match({ location: loc, courseLimit: '' }))
                     && !fixedLabels.has(loc.toLowerCase()));

    // Only show filters that have matching items
    const activeFixed = FIXED_FILTERS.filter(f => items.some(f.match));

    if (activeFixed.length === 0 && dynamicLocs.length === 0) return;

    const cur = this._currentLocationFilter;
    const chip = (label, icon, key) => {
      const on = cur === key;
      return `<div class="filter-chip ${on ? 'active' : ''}" onclick="App._setLocationFilter('${escHtml(key)}')">
        ${on ? `<span class="fc-tick">✓</span>` : ''}
        <span class="fc-icon">${icon}</span>
        <span class="fc-label">${escHtml(label)}</span>
      </div>`;
    };

    filterEl.innerHTML =
      chip(t('equip.filterAll'), '', '')
      + activeFixed.map(f => chip(f.label, f.icon, f.label)).join('')
      + dynamicLocs.map(loc => chip(loc, uiIcon('location'), loc)).join('');
  },

  _setLocationFilter(loc) {
    this._currentLocationFilter = loc;
    this._renderLocationFilters();
    this._renderEquipGrid();
  },

  _onSearch(val) {
    this._currentSearch = val.toLowerCase();
    this._renderEquipGrid();
  },

  _renderEquipGrid() {
    const catId  = this._currentCategory;
    const search = this._currentSearch;
    const cat    = CAT_CONFIG[catId];
    const grid   = document.getElementById('equip-grid');
    if (!grid) return;

    let items = this.state.inventory.filter(i => i.category === catId);

    if (this._currentLocationFilter) {
      const loc = this._currentLocationFilter;
      if (/^team.?project.?2$/i.test(loc)) {
        items = items.filter(i =>
          /team.?project.?2/i.test(i.courseLimit) || /team.?project.?2/i.test(i.location));
      } else if (/^cca.?lab/i.test(loc)) {
        items = items.filter(i => new RegExp(loc.replace(/-/g,'[- ]?'), 'i').test(i.location));
      } else {
        items = items.filter(i => i.location === loc);
      }
    }

    if (search) {
      items = items.filter(i =>
        i.name.toLowerCase().includes(search) ||
        (i.model   || '').toLowerCase().includes(search) ||
        (i.detail  || '').toLowerCase().includes(search) ||
        (i.id      || '').toLowerCase().includes(search)
      );
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="equip-empty" style="grid-column:1/-1;">
          <div class="equip-empty-icon">${cat.icon}</div>
          <div class="equip-empty-msg">${search ? t('equip.noResults') : t('equip.empty')}</div>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(item => this._equipCardHTML(item, cat)).join('');
  },

  _equipCardHTML(item, cat) {
    const isRAD    = item.isRAD;
    const inCart   = this.state.cart.some(c => c.item.id === item.id);
    const availBadge = item.available
      ? `<span class="eq-avail-badge available">${t('equip.available')}</span>`
      : `<span class="eq-avail-badge unavailable">${t('equip.unavailable')}</span>`;

    const unit = cat.bookingType === 'timed' ? t('equip.unit.timed') : t('equip.unit.qty');
    const qtyBadge = item.maxQty > 0
      ? `<div class="eq-qty-badge${item.maxQty <= 2 ? ' low' : ''}">
           ${item.maxQty <= 2 ? uiIcon('info') : uiIcon('check')} ${t('equip.inStock')}: ${item.maxQty} ${unit}
         </div>`
      : '';

    let bookBtnHtml;
    if (!item.available) {
      bookBtnHtml = `<button class="btn-book" disabled>${t('equip.unavailable')}</button>`;
    } else if (inCart) {
      bookBtnHtml = `<button class="btn-book" style="background:var(--success);" onclick="App._openCart()">${t('equip.inCart')}</button>`;
    } else {
      bookBtnHtml = `<button class="btn-book" onclick="App._addToCart('${escHtml(item.id)}')">${t('equip.addToCart')}</button>`;
    }

    return `
      <div class="eq-card">
        <div class="eq-card-head">
          <div class="eq-card-icon" style="background:${cat.bgColor};color:${cat.textColor};">${cat.icon}</div>
          <div class="eq-card-info">
            <div class="eq-card-name">${escHtml(item.name)}</div>
            ${item.id ? `<div class="eq-card-id">${escHtml(item.id)}</div>` : ''}
          </div>
          ${availBadge}
        </div>
        <div class="eq-card-body">
          ${item.location ? `<div class="eq-meta"><span class="eq-meta-icon">${uiIcon('location')}</span><span>${escHtml(item.location)}</span></div>` : ''}
          ${item.detail   ? `<div class="eq-detail">${escHtml(item.detail)}</div>` : ''}
          ${qtyBadge}
          ${isRAD         ? `<div class="eq-rad-badge">${t('form.radBadge')}</div>` : ''}
        </div>
        <div class="eq-card-foot">
          <div class="eq-model">${item.model ? escHtml(item.model) : ''}</div>
          ${bookBtnHtml}
        </div>
      </div>`;
  },

  _promptLogin() {
    showToast('info', t('toast.loginRequired'), t('toast.loginHint'));
  },

  _skeletonGrid(n) {
    return Array.from({ length: n }, () => `
      <div style="background:var(--surface);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-xs);">
        <div style="padding:20px;border-bottom:1px solid var(--border);display:flex;gap:14px;">
          <div class="skeleton" style="width:48px;height:48px;border-radius:8px;flex-shrink:0;"></div>
          <div style="flex:1;"><div class="skeleton" style="height:16px;width:70%;margin-bottom:8px;"></div><div class="skeleton" style="height:12px;width:40%;"></div></div>
        </div>
        <div style="padding:16px 20px;"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:12px;width:80%;"></div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;"><div class="skeleton" style="height:36px;width:72px;border-radius:8px;"></div></div>
      </div>`).join('');
  },

  /* ================================================== CART SYSTEM */
  _addToCart(itemId) {
    if (!this.state.user) {
      showToast('info', t('toast.loginRequired'), t('toast.loginHint'));
      return;
    }
    const item = this.state.inventory.find(i => i.id == itemId);
    if (!item) return;
    if (this.state.cart.some(c => c.item.id === item.id)) {
      showToast('info', t('toast.alreadyInCart'), item.name);
      return;
    }
    this.state.cart.push({ item });
    this._renderNavRight();
    this._renderEquipGrid(); // refresh card buttons
    showToast('success', t('toast.addedToCart'), `${item.name} — ${t('toast.addedHint')}`);
  },

  _removeFromCart(itemId) {
    this.state.cart = this.state.cart.filter(c => c.item.id != itemId);
    this._renderNavRight();
    // Refresh cart modal
    const modal = document.getElementById('modal-box');
    if (modal && modal.querySelector('.cart-modal-content')) {
      this._renderCartModal();
    }
    // Refresh grid if on equipment page
    if (document.getElementById('equip-grid')) this._renderEquipGrid();
  },

  _openCart() {
    if (this.state.cart.length === 0) {
      showToast('info', t('toast.cartEmpty'), t('toast.addFirst'));
      return;
    }
    if (!this.state.user) {
      showToast('info', t('toast.loginRequired'), '');
      return;
    }
    this._renderCartModal();
    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => this._initCartPickers(), 0);
  },

  _initCartPickers() {
    if (typeof flatpickr === 'undefined') return;
    const holidays     = Array.from(this.state.holidays);
    const disableWeekends = d => d.getDay() === 0 || d.getDay() === 6;
    const today        = todayISO();
    const maxDate      = dateAddDays(today, 180);

    this.state.cart.forEach((entry, idx) => {
      const item    = entry.item;
      const itemKey = `ci_${idx}`;
      const minDate = this._minBookingDate();
      const cfg = {
        minDate, maxDate,
        dateFormat: 'Y-m-d',
        disable: [disableWeekends, ...holidays],
        locale: typeof flatpickr.l10ns?.th !== 'undefined' ? 'th' : 'default'
      };

      if (item.isRAD) {
        const s = document.getElementById(`${itemKey}_start`);
        const e = document.getElementById(`${itemKey}_end`);
        if (s) flatpickr(s, cfg);
        if (e) flatpickr(e, cfg);
      } else {
        // All non-RAD: date + time slots
        const el = document.getElementById(`${itemKey}_date`);
        if (el) flatpickr(el, { ...cfg, onChange: (_, ds) => App._cartDateChange(itemKey, ds) });
      }
    });
  },

  _renderCartModal() {
    const box      = document.getElementById('modal-box');
    const advisors = this.state.staffConfig['ADVISORS'] || [];
    const today    = todayISO();
    const maxDate  = dateAddDays(today, 180);

    const advisorOpts = advisors.map(a =>
      `<option value="${escHtml(a.email)}">${escHtml(a.name)}</option>`
    ).join('');

    const itemsHtml = this.state.cart.map((entry, idx) => {
      const item    = entry.item;
    const cat     = CAT_CONFIG[item.category] || {};
    const isRAD   = item.isRAD;
      const isChemical = item.category === 'chemical';
      const itemKey = `ci_${idx}`;
      const minDate = this._minBookingDate();

      let dateFields = '';
      if (isRAD) {
        dateFields = `
          <div class="info-box accent" style="margin-bottom:10px;padding:10px 12px;font-size:12px;">${t('form.radBadge')}</div>
          <div class="form-row" style="margin-bottom:10px;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:12px;">${t('form.startDate')} <span class="required">*</span></label>
              <input type="date" class="form-input" id="${itemKey}_start" min="${minDate}" max="${maxDate}" onchange="App._applyDuration('${itemKey}')">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:12px;">${t('form.startTime')} <span class="required">*</span></label>
              <input type="time" class="form-input" id="${itemKey}_start_time" value="09:00" min="09:00" max="16:00" step="3600" onchange="App._applyDuration('${itemKey}')">
            </div>
          </div>
          <div class="form-row" style="margin-bottom:0;">
            <div class="form-group" style="margin-bottom:10px;">
              <label class="form-label" style="font-size:12px;">${t('form.endDate')} <span class="required">*</span></label>
              <input type="date" class="form-input" id="${itemKey}_end" min="${minDate}" max="${maxDate}" onchange="document.getElementById('${itemKey}_duration').value='custom'">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label class="form-label" style="font-size:12px;">${t('form.endTime')} <span class="required">*</span></label>
              <input type="time" class="form-input" id="${itemKey}_end_time" value="16:00" min="09:00" max="16:00" step="3600" onchange="document.getElementById('${itemKey}_duration').value='custom'">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="${itemKey}_duration">${t('form.duration')}</label>
            <select class="form-select" id="${itemKey}_duration" onchange="App._applyDuration('${itemKey}')">
              <option value="custom">${t('form.customDuration')}</option>
              ${[1, 2, 3].map(hours => `<option value="${hours}">${t('slot.' + hours + 'h')}</option>`).join('')}
            </select>
            <div class="form-hint">${t('form.hint3days')}</div>
          </div>`;
      } else {
        // All non-RAD items (instrument, glassware, scientific, chemical): date + time slots
        dateFields = `
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="font-size:12px;">${t('form.bookDate')} <span class="required">*</span></label>
            <input type="date" class="form-input" id="${itemKey}_date" min="${minDate}" max="${maxDate}"
              onchange="App._cartDateChange('${itemKey}', this.value)">
            <div class="form-hint">${t('form.hint3days')}</div>
          </div>
          <div id="${itemKey}_slots_group" style="display:none;margin-bottom:10px;">
            <label class="form-label" style="font-size:12px;">${t('form.timeSlot')} <span class="required">*</span></label>
            <div class="time-slots" id="${itemKey}_slots" style="flex-wrap:wrap;gap:6px;"></div>
          </div>
          ${!isChemical ? `
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="font-size:12px;">${t('form.qty')} <span class="required">*</span>
              ${item.maxQty > 0 ? `<span style="font-weight:400;color:var(--text-3);">(${t('form.inStock')} ${item.maxQty} ${t('equip.unit.qty')})</span>` : ''}
            </label>
            <input type="number" class="form-input" id="${itemKey}_qty" min="1" max="${item.maxQty || 9999}" value="1" placeholder="${t('form.qty.ph')}">
          </div>` : ''}
          ${isChemical && item.detail ? `
            <div class="cart-section-divider">${t('cart.div.chem')}</div>
            <div class="info-box" style="margin-bottom:10px;padding:10px 12px;font-size:12px;background:var(--bg);">
               ${escHtml(item.detail)}
            </div>
          ` : ''}`;
      }

      return `
        <div class="cart-item-section" id="cart-item-${itemKey}">
          <div class="cart-item-header">
            <div>
              <div class="cart-item-name">
                <span style="background:${cat.bgColor};color:${cat.textColor};padding:4px 8px;border-radius:6px;font-size:16px;">${cat.icon}</span>
                ${escHtml(item.name)}
              </div>
              ${item.location ? `<div class="cart-item-qty-info"> ${escHtml(item.location)}${item.maxQty > 0 ? ` · ${t('form.inStock')} ${item.maxQty} ${cat.bookingType === 'timed' ? t('equip.unit.timed') : t('equip.unit.qty')}` : ''}</div>` : ''}
            </div>
            <button class="btn-remove-cart" onclick="App._removeFromCart('${escHtml(item.id)}')">${t('cart.remove')}</button>
          </div>
          ${dateFields}
          ${isRAD && !isChemical ? `<div class="form-group">
            <label class="form-label" for="${itemKey}_qty">${t('form.qty')}</label>
            <input type="number" class="form-input" id="${itemKey}_qty" min="1" max="${item.maxQty}" value="1">
          </div>` : ''}
        </div>`;
    }).join('');

    box.innerHTML = `
      <div class="cart-modal-content">
        <div class="modal-head">
          <div class="modal-head-icon" style="background:var(--accent-light);color:var(--accent);font-size:20px;">${uiIcon('list')}</div>
          <div class="modal-head-info">
            <div class="modal-title">${t('cart.modal.title')} (${this.state.cart.length} ${t('toast.items')})</div>
            <div class="modal-subtitle">${t('cart.modal.subtitle')}</div>
          </div>
          <button class="modal-close" onclick="App.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="cart-section-divider">${t('cart.div.common')}</div>

          <div class="form-group">
            <label class="form-label">${t('cart.advisor.label')} <span class="required">*</span></label>
            <select class="form-select" id="cart-advisor">
              <option value="">${t('cart.advisor.ph')}</option>
              ${advisorOpts}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">${t('profile.studentId')}</label>
              <input class="form-input" id="cart-student-id" type="text"
                placeholder="${t('profile.studentIdPh')}"
                value="${escHtml(this.state.profile?.studentId || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">${t('profile.eduLevel')}</label>
              <select class="form-select" id="cart-edu-level">
                <option value="">${t('profile.bachelor')}</option>
                <option value="ปริญญาตรี" ${(this.state.profile?.educationLevel||'ปริญญาตรี')==='ปริญญาตรี'?'selected':''}>
                  ${t('profile.bachelor')}</option>
                <option value="ปริญญาโท" ${this.state.profile?.educationLevel==='ปริญญาโท'?'selected':''}>
                  ${t('profile.master')}</option>
                <option value="ปริญญาเอก" ${this.state.profile?.educationLevel==='ปริญญาเอก'?'selected':''}>
                  ${t('profile.doctoral')}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">${t('cart.course.label')}</label>
              <select class="form-select" id="cart-course"
                onchange="document.getElementById('cart-course-other').style.display=this.value==='__other__'?'block':'none'">
                <option value="โครงงานวิศวกรรมเคมี">${t('course.seniorProject')}</option>
                <option value="TEAM PROJECT 2">${t('course.tp2')}</option>
                <option value="วิทยานิพนธ์">${t('course.thesis')}</option>
                <option value="__other__">${t('course.other')}</option>
              </select>
              <input class="form-input" id="cart-course-other" type="text"
                placeholder="${t('course.otherPh')}"
                style="display:none;margin-top:6px;">
            </div>
            <div class="form-group">
              <label class="form-label">${t('cart.note.label')}</label>
              <textarea class="form-textarea" id="cart-note" placeholder="${t('cart.note.ph')}" style="min-height:44px;"></textarea>
            </div>
          </div>

          <div class="cart-section-divider">${t('cart.div.items')}</div>
          ${itemsHtml}
        </div>
        <div class="modal-foot" style="justify-content:space-between;">
          <button class="btn btn-secondary" onclick="App._clearCart()">
            ${t('cart.clearBtn')}
          </button>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">${t('cart.cancelBtn')}</button>
            <button class="btn btn-primary" id="cart-submit-btn" onclick="App._submitCart()">
              ${t('cart.confirmBtn')} (${this.state.cart.length})
            </button>
          </div>
        </div>
      </div>`;

    // Pre-fill advisor if user is an advisor
    const u = this.state.user;
    if (u?.role === 'ADVISORS') {
      const sel = document.getElementById('cart-advisor');
      if (sel) {
        const opt = Array.from(sel.options).find(o => o.value === u.email);
        if (opt) opt.selected = true;
      }
    }
  },

  async _cartDateChange(itemKey, dateStr) {
    const slotsGroup = document.getElementById(`${itemKey}_slots_group`);
    const slotsEl    = document.getElementById(`${itemKey}_slots`);
    if (!slotsGroup || !slotsEl) return;
    slotsEl.innerHTML = '';

    if (!dateStr) { slotsGroup.style.display = 'none'; return; }
    if (dateStr < this._minBookingDate() || dateStr > dateAddDays(todayISO(), 180) || !BookingRules.businessDay(dateStr, this.state.holidays)) {
      slotsGroup.style.display = 'none';
      showToast('warning', t('toast.invalidDate'), t('form.hint3days'));
      return;
    }

    // Fetch all bookings once for conflict display
    if (this._allBookings.length === 0) {
      try { this._allBookings = await apiGet('getAllBookings'); } catch (_) {}
    }
    if (document.getElementById(`${itemKey}_date`)?.value !== dateStr) return;

    const idx  = parseInt(itemKey.replace('ci_', ''));
    const item = this.state.cart[idx]?.item;
    const maxQty = (item?.maxQty) || 1;

    slotsGroup.style.display = '';
    const slots = [];
    for (const hours of [1, 2, 3]) {
      for (let h = 9; h + hours <= 16; h++)
        slots.push({ start:`${pad(h)}:00`, end:`${pad(h+hours)}:00`, label:`${pad(h)}:00 – ${pad(h+hours)}:00 ${t('slot.' + hours + 'h')}` });
    }
    slots.sort((a,b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

    slotsEl.innerHTML = slots.map(s => {
      const remaining = BookingRules.availableQuantity(item?.id, `${dateStr}T${s.start}:00`, `${dateStr}T${s.end}:00`, this._allBookings, maxQty);
      const full = remaining < 1;
      return `<button type="button" class="time-slot${full ? ' disabled' : ''}" ${full ? 'disabled' : ''}
        onclick="App._cartSelectSlot(this, '${itemKey}')" data-start="${dateStr}T${s.start}:00" data-end="${dateStr}T${s.end}:00">${s.label}${full ? ` ${t('slot.full')}` : ''}</button>`;
    }).join('');
  },

  _cartSelectSlot(el, itemKey) {
    document.querySelectorAll(`#${itemKey}_slots .time-slot`).forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
  },

  _applyDuration(key) {
    const startDate = document.getElementById(key + '_start')?.value;
    const startTime = document.getElementById(key + '_start_time')?.value || '09:00';
    const hours = Number(document.getElementById(key + '_duration')?.value);
    if (!startDate || !hours) return;
    const endHour = Number(startTime.slice(0, 2)) + hours;
    if (endHour > 16) {
      showToast('warning', t('toast.invalidDate'), t('validation.time'));
      document.getElementById(key + '_duration').value = 'custom';
      return;
    }
    document.getElementById(key + '_end').value = startDate;
    document.getElementById(key + '_end_time').value = pad(endHour) + ':00';
  },

  async _submitCart() {
    const u = this.state.user;
    if (!u) return;
    const btn            = document.getElementById('cart-submit-btn');
    const advisor        = document.getElementById('cart-advisor')?.value;
    const _courseRaw     = document.getElementById('cart-course')?.value || 'โครงงานวิศวกรรมเคมี';
    const course         = _courseRaw === '__other__'
      ? (document.getElementById('cart-course-other')?.value.trim() || t('course.other'))
      : _courseRaw;
    const note           = document.getElementById('cart-note')?.value || '';
    const studentId      = document.getElementById('cart-student-id')?.value || '';
    const educationLevel = document.getElementById('cart-edu-level')?.value || 'ปริญญาตรี';

    if (!advisor) { showToast('warning', t('toast.selectAdvisor'), ''); return; }

    // Collect per-item data and validate
    const submissions = [];
    for (let idx = 0; idx < this.state.cart.length; idx++) {
      const { item } = this.state.cart[idx];
      const cat     = CAT_CONFIG[item.category] || {};
      const isRAD   = item.isRAD;
      const isChemical = item.category === 'chemical';
      const key     = `ci_${idx}`;
      let start = '', end = '', quantity = '', chemDetail = '';

      if (isRAD) {
        const sd = document.getElementById(`${key}_start`)?.value;
        const st = document.getElementById(`${key}_start_time`)?.value || '09:00';
        const ed = document.getElementById(`${key}_end`)?.value;
        const et = document.getElementById(`${key}_end_time`)?.value   || '16:00';
        if (!sd || !ed) { showToast('warning', `${t('toast.selectDate')} "${item.name}"`, ''); return; }
        start = `${sd}T${st}:00`;
        end   = `${ed}T${et}:00`;
        if (!isChemical) quantity = document.getElementById(`${key}_qty`)?.value || '1';
      } else {
        // All non-RAD: date + time slot
        const slot = document.querySelector(`#${key}_slots .time-slot.selected`);
        if (!slot) { showToast('warning', `${t('toast.selectSlot')} "${item.name}"`, ''); return; }
        start = slot.dataset.start;
        end   = slot.dataset.end;
        if (!isChemical) quantity = document.getElementById(`${key}_qty`)?.value || '1';
        if (isChemical && item.detail) chemDetail = item.detail;
      }

      const invalid = BookingRules.validate(item, start, end, Number(quantity || 1), this.state.holidays);
      if (invalid) { showToast('warning', item.name, t('validation.' + invalid)); return; }
      submissions.push({ item, category: item.category, start, end, quantity,
        bookingNote: chemDetail ? `[${chemDetail}] ${note}`.trim() : note });
    }

    btn.classList.add('btn-loading');
    btn.disabled = true;
    let successCount = 0;
    const submittedIds = new Set();
    const errors = [];

    for (const s of submissions) {
      try {
        const result = await apiPost({
          action: 'submitBooking',
          email:  u.email,
          name:   u.name,
          category:       s.category,
          itemId:         s.item.id,
          itemName:       s.item.name,
          course,
          quantity:       s.quantity,
          start:          s.start,
          end:            s.end,
          note:           s.bookingNote,
          advisorEmail:   advisor,
          studentId,
          educationLevel
        });
        if (result.success) { successCount++; submittedIds.add(s.item.id); }
        else errors.push(`${s.item.name}: ${result.error || t('toast.credError')}`);
      } catch (e) {
        errors.push(`${s.item.name}: ${e.message}`);
      }
    }

    btn.classList.remove('btn-loading');
    btn.disabled = false;

    if (successCount > 0) {
      this.state.cart     = this.state.cart.filter(entry => !submittedIds.has(entry.item.id));
      this.state.bookings = [];
      this._allBookings   = [];
      this.closeModal();
      this._renderNavRight();
      showToast('success', `${t('toast.submitOk')} ${successCount} ${t('toast.items')}!`, errors.length > 0 ? errors.join('\n') : '');
    }
    if (errors.length > 0 && successCount === 0) {
      showToast('error', t('toast.submitFail'), errors.join('\n'));
    }
  },

  _clearCart() {
    if (!confirm(t('confirm.clearCart'))) return;
    this.state.cart = [];
    this.closeModal();
    this._renderNavRight();
    if (document.getElementById('equip-grid')) this._renderEquipGrid();
    showToast('info', t('toast.cartCleared'), '');
  },

  _minBookingDate() {
    return BookingRules.minDate(this.state.holidays);
  },

  /* ================================================== NOTIFICATIONS */
  async _loadNotifData() {
    const u = this.state.user;
    if (!u) return;
    try {
      if (this._isStaff()) {
        if (this._allBookings.length === 0) {
          this._allBookings = await apiGet('getAllBookings');
        }
        this._notifCount = this._allBookings.filter(b => this._canAct(b)).length;
      } else {
        if (this.state.bookings.length === 0) {
          this.state.bookings = await apiGet('getMyBookings', { email: u.email });
        }
        const seen = JSON.parse(localStorage.getItem('kcib_notif_seen') || '{}');
        this._notifCount = this.state.bookings.filter(b =>
          b.BookingID &&
          BookingRules.approved.concat(STATUS_REJ).includes(b.Status) &&
          seen[b.BookingID] !== b.Status
        ).length;
      }
      this._updateNotifBadge();
    } catch (e) { /* silent fail */ }
  },

  _updateNotifBadge() {
    const count = this._notifCount || 0;
    const val   = count > 99 ? '99+' : count;
    const show  = count > 0 ? 'flex' : 'none';
    ['notif-badge', 'mobile-notif-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = val; el.style.display = show; }
    });
  },

  _markNotifsRead() {
    if (!this._isStaff()) {
      const seen = {};
      this.state.bookings.forEach(b => { if (b.BookingID) seen[b.BookingID] = b.Status; });
      localStorage.setItem('kcib_notif_seen', JSON.stringify(seen));
    }
    this._notifCount = 0;
    this._updateNotifBadge();
  },

  _toggleNotifDropdown(e) {
    e.stopPropagation();
    const existing = document.getElementById('notif-dropdown');
    if (existing) { existing.remove(); return; }

    const u = this.state.user;
    if (!u) return;

    const isStaff = this._isStaff();
    let items = [];

    if (isStaff) {
      items = this._allBookings.filter(b => this._canAct(b)).slice(0, 10).map(b => ({
        icon: uiIcon('clock'),
        title: b.ItemName || '-',
        desc:  `${b.Name || '-'} · ${b.Status || '-'}`,
        action: () => { this.navigate('dashboard'); },
        unread: true
      }));
    } else {
      const seen = JSON.parse(localStorage.getItem('kcib_notif_seen') || '{}');
      items = this.state.bookings.filter(b =>
        b.BookingID && BookingRules.approved.concat(STATUS_REJ).includes(b.Status) && seen[b.BookingID] !== b.Status
      ).slice(0, 10).map(b => ({
        icon: BookingRules.approved.includes(b.Status) ? uiIcon('check') : uiIcon('close'),
        title: b.ItemName || '-',
        desc:  b.Status || '-',
        action: () => { this.navigate('my-bookings'); },
        unread: true
      }));
    }

    const dropdown = document.createElement('div');
    dropdown.id = 'notif-dropdown';
    dropdown.className = 'notif-dropdown';
    dropdown.innerHTML = `
      <div class="notif-dropdown-head">
        <span class="notif-dropdown-title">${t('notif.header')}</span>
        ${items.length > 0 ? `<button class="notif-mark-read" onclick="App._markNotifsRead();document.getElementById('notif-dropdown')?.remove();">${t('notif.markRead')}</button>` : ''}
      </div>
      <div class="notif-list">
        ${items.length > 0 ? items.map((n, i) => `
          <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="notifItems[${i}]()">
            <div class="notif-item-icon">${n.icon}</div>
            <div class="notif-item-body">
              <div class="notif-item-title">${escHtml(n.title)}</div>
              <div class="notif-item-desc">${escHtml(n.desc)}</div>
            </div>
          </div>`).join('') : `<div class="notif-empty">${t('notif.empty')}</div>`}
      </div>`;

    document.body.appendChild(dropdown);

    // Position below the notif button
    const btn = document.getElementById('notif-btn');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      dropdown.style.top  = (rect.bottom + 8) + 'px';
      dropdown.style.right = (window.innerWidth - rect.right) + 'px';
    }

    // Wire up click handlers
    const notifItems = items.map(n => () => {
      dropdown.remove();
      n.action();
    });
    window.notifItems = notifItems;

    setTimeout(() => {
      document.addEventListener('click', () => dropdown.remove(), { once: true });
    }, 0);
  },

  /* ================================================== MY BOOKINGS */
  _myBookingsFilter: 'all',

  async _renderMyBookings() {
    const el = document.getElementById('page-my-bookings');
    const u  = this.state.user;

    if (!u) {
      el.innerHTML = `
        <div style="max-width:700px;margin:0 auto;padding:60px 20px;">
          <div class="bk-empty">
            <div class="bk-empty-icon"></div>
            <div class="bk-empty-title">${t('mybook.loginFirst')}</div>
            <div class="bk-empty-desc">${t('mybook.loginDesc')}</div>
          </div>
        </div>`;
      return;
    }

    this._myBookingsFilter = 'all';
    el.innerHTML = `
      <div class="bk-page">
        <div id="bk-filter-bar" class="bk-filter-bar"></div>
        <div id="bookings-list">${this._skeletonBookings(3)}</div>
      </div>`;

    await this._fetchAndRenderMyBookings();
  },

  async _refreshMyBookings() {
    this.state.bookings = [];
    const listEl = document.getElementById('bookings-list');
    if (listEl) listEl.innerHTML = this._skeletonBookings(3);
    await this._fetchAndRenderMyBookings();
  },

  async _fetchAndRenderMyBookings() {
    const u = this.state.user;
    if (!u) return;
    const listEl = document.getElementById('bookings-list');
    if (!listEl) return;
    try {
      if (this.state.bookings.length === 0) {
        this.state.bookings = await apiGet('getMyBookings', { email: u.email });
        // Recompute notification count with fresh data
        if (!this._isStaff()) {
          const seen = JSON.parse(localStorage.getItem('kcib_notif_seen') || '{}');
          this._notifCount = this.state.bookings.filter(b =>
            b.BookingID && BookingRules.approved.concat(STATUS_REJ).includes(b.Status) && seen[b.BookingID] !== b.Status
          ).length;
          this._updateNotifBadge();
        }
      }
      this._renderBookingsList();
    } catch (e) {
      listEl.innerHTML = `<div class="bk-empty"><div class="bk-empty-icon">${uiIcon('info')}</div><div class="bk-empty-title">${t('mybook.loadFail')}</div><div class="bk-empty-desc">${escHtml(e.message)}</div></div>`;
    }
  },

  _renderBookingsList() {
    const bookings   = this.state.bookings;
    const filterBar  = document.getElementById('bk-filter-bar');
    const listEl     = document.getElementById('bookings-list');
    if (!filterBar || !listEl) return;

    const f = this._myBookingsFilter;
    const counts = {
      all:      bookings.length,
      pending:  bookings.filter(b => BookingRules.pending.includes(b.Status || '')).length,
      approved: bookings.filter(b => BookingRules.approved.includes(b.Status)).length,
      rejected: bookings.filter(b => [STATUS_REJ, STATUS_CAN].includes(b.Status || '')).length,
    };

    filterBar.innerHTML = [
      { id: 'all',      label: t('mybook.tab.all') },
      { id: 'pending',  label: t('mybook.tab.pending') },
      { id: 'approved', label: t('mybook.tab.approved') },
      { id: 'rejected', label: t('mybook.tab.rejected') },
    ].map(tab => `
      <div class="bk-filter-tab ${f === tab.id ? 'active' : ''}"
           onclick="App._setMyBookingsFilter('${tab.id}')">
        ${tab.label}
        ${counts[tab.id] > 0 ? `<span class="bk-filter-count">${counts[tab.id]}</span>` : ''}
      </div>`).join('') +
      `<button class="btn btn-secondary btn-sm" onclick="App._refreshMyBookings()" style="margin-left:auto;"> ${t('mybook.refresh')}</button>`;

    let filtered = bookings;
    if (f === 'pending')  filtered = bookings.filter(b => BookingRules.pending.includes(b.Status || ''));
    if (f === 'approved') filtered = bookings.filter(b => BookingRules.approved.includes(b.Status));
    if (f === 'rejected') filtered = bookings.filter(b => [STATUS_REJ, STATUS_CAN].includes(b.Status || ''));

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="bk-empty">
          <div class="bk-empty-icon">${uiIcon('box')}</div>
          <div class="bk-empty-title">${t('mybook.empty')}</div>
          <div class="bk-empty-desc">${t('mybook.emptyDesc')}</div>
          <button class="btn btn-primary" onclick="App.navigate('instrument')">${t('mybook.bookNow')}</button>
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map(b => this._bookingItemHTML(b, false)).join('');
  },

  _setMyBookingsFilter(filter) {
    this._myBookingsFilter = filter;
    this._renderBookingsList();
  },

  _bookingItemHTML(b, showStudentName) {
    const { badge, icon } = statusStyle(b.Status || '');
    const cat  = CAT_CONFIG[String(b.Category || '').toLowerCase()] || {};
    const steps = this._wfSteps();
    const cur   = this._wfStep(b.Status || '');
    const isRej = b.Status === STATUS_REJ || b.Status === STATUS_CAN;
    const start = b.Start ? formatDateTime(b.Start) : '-';
    const end   = b.End   ? formatDateTime(b.End)   : '-';

    const progressHtml = steps.map((step, i) => {
      let state = 'waiting';
      if (isRej) {
        state = i === 0 ? 'done' : (i === cur ? 'rejected' : 'waiting');
      } else if (i < cur) state = 'done';
      else if (i === cur) state = 'current';

        const circleInner = state === 'done' ? uiIcon('check', 16) : state === 'rejected' ? uiIcon('close', 16) : step.icon;
      return `
        ${i > 0 ? `<div class="bk-prog-line ${(i <= cur && !isRej) ? 'done' : ''}"></div>` : ''}
        <div class="bk-prog-step ${state}">
          <div class="bk-prog-circle">${circleInner}</div>
          <div class="bk-prog-label">${step.label}</div>
        </div>`;
    }).join('');

    const isCancellable = ![STATUS_REJ, STATUS_CAN].includes(b.Status || '');

    return `
      <div class="bk-item">
        <div class="bk-item-head">
          <div>
            <div class="bk-item-title">${cat.icon || uiIcon('box')} ${escHtml(b.ItemName || '-')}</div>
            <div class="bk-item-meta">
              <span>${escHtml(b.BookingID || '')}</span>
              ${showStudentName ? `<span>·  ${escHtml(b.Name || '-')}</span>` : ''}
            </div>
          </div>
          <span class="booking-badge ${badge}">${icon} ${escHtml(statusDisplay(b.Status || ''))}</span>
        </div>
        <div class="bk-item-body">
          <div class="bk-meta-row">
            <span class="bk-meta-item"> ${start}</span>
            ${end !== start && end !== '-' ? `<span class="bk-meta-item"> ${end}</span>` : ''}
            <span class="bk-meta-item"> ${escHtml(b.Course || t('course.general'))}</span>
            ${b.CurrentApproverName ? `<span class="bk-meta-item"> ${escHtml(b.CurrentApproverName)}</span>` : ''}
          </div>
          <div class="bk-progress">${progressHtml}</div>
          ${BookingRules.approved.includes(b.Status) ? `<div class="form-hint">${b.StaffAcknowledgedAt ? t('dash.acknowledged') : t('dash.awaitingAck')}</div>` : ''}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            ${isCancellable ? `<button class="btn-cancel" onclick="App._cancelBooking('${escHtml(b.BookingID)}')">${t('mybook.cancel')}</button>` : ''}
          </div>
        </div>
      </div>`;
  },

  _wfSteps() {
    return [
      { icon: uiIcon('list', 16), label: t('bk.step.submit') },
      { icon: uiIcon('user', 16), label: t('bk.step.advisor') },
      { icon: uiIcon('building', 16), label: t('bk.step.head') },
      { icon: uiIcon('check', 16), label: t('bk.step.done') },
    ];
  },

  _wfStep(status) {
    switch (status) {
      case STATUS_P1:  return 1;
      case STATUS_P2:  return 2;
      case STATUS_P3:  return 3;
      case STATUS_OK:  return 3;
      case STATUS_REJ: return 3;
      case STATUS_CAN: return 1;
      default:         return 0;
    }
  },

  async _cancelBooking(bookingId) {
    if (!confirm(t('confirm.cancelBook'))) return;
    const u = this.state.user;
    try {
      await apiPost({ action: 'cancelBooking', bookingId, email: u.email });
      this.state.bookings = [];
      showToast('success', t('toast.cancelOk'), '');
      this._fetchAndRenderMyBookings();
    } catch (e) {
      showToast('error', t('toast.cancelFail'), e.message);
    }
  },

  _skeletonBookings(n) {
    return Array.from({ length: n }, () => `
      <div style="background:var(--surface);border-radius:var(--radius);border:1.5px solid var(--border);margin-bottom:14px;overflow:hidden;">
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;">
          <div style="flex:1;"><div class="skeleton" style="height:14px;width:55%;margin-bottom:8px;"></div><div class="skeleton" style="height:12px;width:35%;"></div></div>
          <div class="skeleton" style="height:24px;width:90px;border-radius:999px;"></div>
        </div>
        <div style="padding:14px 18px;"><div class="skeleton" style="height:12px;width:80%;margin-bottom:10px;"></div><div class="skeleton" style="height:30px;width:100%;border-radius:4px;"></div></div>
      </div>`).join('');
  },

  /* ================================================== DASHBOARD */
  _allBookings: [],

  async _renderDashboard() {
    const el = document.getElementById('page-dashboard');
    const u  = this.state.user;

    if (!u || !this._isStaff()) {
      el.innerHTML = `
        <div style="max-width:700px;margin:0 auto;padding:60px 20px;">
          <div class="bk-empty">
            <div class="bk-empty-icon">${uiIcon('user')}</div>
            <div class="bk-empty-title">${t('dash.noAccess')}</div>
            <div class="bk-empty-desc">${t('dash.noAccessDesc')}</div>
          </div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="dash-v2-page">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
          <h1 style="font-size:22px;font-weight:800;">${t('dash.title')}</h1>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a class="btn btn-secondary btn-sm" href="${window.GSHEET_URL||GSHEET_URL}" target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><polyline points="9 9 10 9"/></svg>
              ${t('dash.viewSheets')}
            </a>
            <button class="btn btn-secondary btn-sm" onclick="App._loadDashboard()">${t('dash.refresh')}</button>
          </div>
        </div>
        <div id="dash-stats" class="dash-v2-stats">
          ${Array.from({length:4}, () => `
            <div class="dash-v2-stat-card">
              <div class="skeleton" style="width:48px;height:48px;border-radius:var(--radius-sm);flex-shrink:0;"></div>
              <div style="flex:1;"><div class="skeleton" style="height:26px;width:50%;margin-bottom:6px;"></div><div class="skeleton" style="height:12px;width:70%;"></div></div>
            </div>`).join('')}
        </div>
        <div id="dash-tabs" class="dash-v2-tab-nav" style="display:none;">
          <button class="dash-v2-tab-btn active" onclick="App._switchDashTab('pending', this)">
            ${t('dash.tab.pending')} <span id="dash-needs-badge" style="background:var(--danger);color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;margin-left:4px;display:none;"></span>
          </button>
          <button class="dash-v2-tab-btn" onclick="App._switchDashTab('all', this)">${t('dash.tab.all')}</button>
        </div>
        <div id="dash-content">
          <div class="skeleton" style="height:300px;border-radius:var(--radius);"></div>
        </div>
      </div>`;

    await this._loadDashboard();
  },

  async _loadDashboard() {
    try {
      this._allBookings = await apiGet('getAllBookings');
      this._renderDashStats();
      this._renderDashTabContent('pending');
      document.getElementById('dash-tabs').style.display = '';
      // Recompute staff notification count
      this._notifCount = this._allBookings.filter(b => this._canAct(b)).length;
      this._updateNotifBadge();
    } catch (e) {
      showToast('error', t('toast.dashFail'), e.message);
    }
  },

  _renderDashStats() {
    const el  = document.getElementById('dash-stats');
    if (!el) return;
    const all     = this._allBookings;
    const total   = all.length;
    const pending = all.filter(b => BookingRules.pending.includes(b.Status || '')).length;
    const approv  = all.filter(b => BookingRules.approved.includes(b.Status)).length;
    const needsMe = all.filter(b => this._canAct(b)).length;

    const badge = document.getElementById('dash-needs-badge');
    if (badge) {
      badge.textContent = needsMe;
      badge.style.display = needsMe > 0 ? '' : 'none';
    }

    el.innerHTML = [
      { icon: uiIcon('list'), bg: 'var(--info-bg)', color: 'var(--info)',    num: total,   label: t('dash.stat.total') },
      { icon: uiIcon('clock'), bg: 'var(--warning-bg)', color: 'var(--warning)', num: pending, label: t('dash.stat.pending') },
      { icon: uiIcon('check'), bg: 'var(--success-bg)', color: 'var(--success)', num: approv,  label: t('dash.stat.approved') },
      { icon: uiIcon('info'), bg: 'var(--danger-bg)', color: 'var(--danger)',  num: needsMe, label: t('dash.stat.needsMe') },
    ].map(s => `
      <div class="dash-v2-stat-card">
        <div class="dash-v2-stat-icon" style="background:${s.bg};color:${s.color};">${s.icon}</div>
        <div class="dash-v2-stat-info">
          <div class="dash-v2-stat-num" style="color:${s.color};">${s.num}</div>
          <div class="dash-v2-stat-label">${s.label}</div>
        </div>
      </div>`).join('');
  },

  _switchDashTab(tab, btn) {
    document.querySelectorAll('.dash-v2-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this._renderDashTabContent(tab);
  },

  _renderDashTabContent(tab) {
    const el   = document.getElementById('dash-content');
    if (!el) return;
    const all   = this._allBookings;
    const items = tab === 'pending'
      ? all.filter(b => this._canAct(b))
      : all.slice().reverse().slice(0, 200);

    if (items.length === 0) {
      el.innerHTML = `<div class="bk-empty"><div class="bk-empty-icon">${uiIcon('check')}</div><div class="bk-empty-title">${t('dash.pending.none')}</div></div>`;
      return;
    }

    // Bulk action bar (only on pending tab)
    const bulkBar = tab === 'pending' && items.some(b => this._canApprove(b)) ? `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--warning-bg);border-bottom:1px solid var(--warning-border);gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:700;color:var(--warning-text);">
           ${items.length} ${t('dash.pending.waiting')}
        </span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" style="background:var(--success-bg);color:var(--success);border:1px solid var(--success-border);font-weight:700;"
            onclick="App._approveAllPending()"> ${t('dash.approveAll')} (${items.length})</button>
          <button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border);font-weight:700;"
            onclick="App._rejectAllPending()"> ${t('dash.rejectAll')} (${items.length})</button>
        </div>
      </div>` : '';

    const rows = items.map(b => {
      const { badge } = statusStyle(b.Status || '');
      const cat     = CAT_CONFIG[String(b.Category || '').toLowerCase()] || {};
      const start   = b.Start ? String(b.Start).substring(0, 16).replace('T', ' ') : '-';
      const canAct  = this._canApprove(b);

      // Step label
      const stepLabel = {
        [STATUS_P1]: t('dash.status.p1'),
        [STATUS_P2]: t('dash.status.p2'),
        [STATUS_P3]: t('dash.status.p3'),
      }[b.Status] || escHtml(statusDisplay(b.Status || '-'));

      return `
        <tr>
          <td>
            <div style="font-weight:700;font-size:14px;">${cat.icon || ''} ${escHtml(b.ItemName || '-')}</div>
            <div style="font-size:12px;color:var(--text-3);">${escHtml(b.BookingID || '')}</div>
          </td>
          <td>
            <div style="font-size:14px;">${escHtml(b.Name || '-')}</div>
            <div style="font-size:11px;color:var(--text-3);">${escHtml(b.Email || '-')}</div>
          </td>
          <td style="font-size:13px;">${escHtml(b.Course || '-')}</td>
          <td style="font-size:13px;">${start}</td>
          <td><span class="booking-badge ${badge}">${stepLabel}</span></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${canAct ? `
                <button class="btn btn-sm" style="background:var(--success-bg);color:var(--success);border:1px solid var(--success-border);"
                  onclick="App._approveBooking('${escHtml(b.BookingID)}')">${t('dash.approve')}</button>
                <button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border);"
                  onclick="App._rejectBooking('${escHtml(b.BookingID)}')">${t('dash.reject')}</button>
              ` : this._canAcknowledge(b) ? `<button class="btn btn-secondary btn-sm" onclick="App._acknowledgeBooking('${escHtml(b.BookingID)}')">${t('dash.acknowledge')}</button>`
                : `<span style="font-size:12px;color:var(--text-3);">${b.StaffAcknowledgedAt ? t('dash.acknowledged') : escHtml(b.CurrentApproverName || '-')}</span>`}
            </div>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="dash-v2-table-wrap">
        ${bulkBar}
        <table class="dash-v2-table">
          <thead>
            <tr>
              <th>${t('dash.col.equipment')}</th>
              <th>${t('dash.col.booker')}</th>
              <th>${t('dash.col.course')}</th>
              <th>${t('dash.col.datetime')}</th>
              <th>${t('dash.col.status')}</th>
              <th>${t('dash.col.action')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  _canApprove(b) {
    const u = this.state.user;
    return !!u && BookingRules.canApprove(b, u.email, u.role, this.state.staffConfig);
  },

  _canAcknowledge(b) {
    const u = this.state.user;
    return !!u && BookingRules.canAcknowledge(b, u.email, u.role, this.state.staffConfig);
  },

  _canAct(b) {
    return this._canApprove(b) || this._canAcknowledge(b);
  },

  async _acknowledgeBooking(bookingId) {
    try {
      await apiPost({ action: 'acknowledgeBooking', bookingId });
      showToast('success', t('dash.acknowledged'), '');
      await this._loadDashboard();
    } catch (error) {
      showToast('error', t('toast.submitFail'), error.message);
    }
  },

  async _approveBooking(bookingId) {
    if (!confirm(t('confirm.approve'))) return;
    const u = this.state.user;
    try {
      const result = await apiPost({ action: 'approveBooking', bookingId, staffEmail: u?.email });
      if (!result.success) throw new Error(result.error || t('toast.credError'));
      showToast('success', t('toast.approveOk'), '');
      this._allBookings = [];
      await this._loadDashboard();
    } catch (e) {
      showToast('error', t('toast.approveFail'), e.message);
    }
  },

  async _rejectBooking(bookingId) {
    if (!confirm(t('confirm.reject'))) return;
    const u = this.state.user;
    try {
      const result = await apiPost({ action: 'rejectBooking', bookingId, staffEmail: u?.email });
      if (!result.success) throw new Error(result.error || t('toast.credError'));
      showToast('info', t('toast.rejectOk'), '');
      this._allBookings = [];
      await this._loadDashboard();
    } catch (e) {
      showToast('error', t('toast.rejectFail'), e.message);
    }
  },

  async _approveAllPending() {
    const u = this.state.user;
    const pending = this._allBookings.filter(b => this._canApprove(b));
    if (pending.length === 0) return;
    if (!confirm(`${t('confirm.approveAll')} ${pending.length} ${t('toast.items')}?`)) return;

    let ok = 0, fail = 0;
    showToast('info', `${t('toast.approving')} ${pending.length} ${t('toast.items')}...`, '');
    for (const b of pending) {
      try {
        const r = await apiPost({ action: 'approveBooking', bookingId: b.BookingID, staffEmail: u?.email });
        if (r.success) ok++; else fail++;
      } catch { fail++; }
    }
    this._allBookings = [];
    await this._loadDashboard();
    showToast('success', `${t('toast.approveOk')} ${ok} ${t('toast.items')}${fail > 0 ? ` (${t('toast.failCount')} ${fail})` : ''}`, '');
  },

  async _rejectAllPending() {
    const u = this.state.user;
    const pending = this._allBookings.filter(b => this._canApprove(b));
    if (pending.length === 0) return;
    if (!confirm(`${t('confirm.rejectAll')} ${pending.length} ${t('toast.items')}?`)) return;

    let ok = 0, fail = 0;
    showToast('info', `${t('toast.rejecting')} ${pending.length} ${t('toast.items')}...`, '');
    for (const b of pending) {
      try {
        const r = await apiPost({ action: 'rejectBooking', bookingId: b.BookingID, staffEmail: u?.email });
        if (r.success) ok++; else fail++;
      } catch { fail++; }
    }
    this._allBookings = [];
    await this._loadDashboard();
    showToast('info', `${t('toast.rejectOk')} ${ok} ${t('toast.items')}${fail > 0 ? ` (${t('toast.failCount')} ${fail})` : ''}`, '');
  },

  /* ================================================== MODAL */
  /* -------------------------------------------------- USER PROFILE */
  async _loadProfile() {
    const u = this.state.user;
    if (!u) return;
    try {
      const res = await apiGet('getProfile', { email: u.email });
      this.state.profile = res;
      if (!res.studentId) this._renderProfileModal(false);
    } catch (_) {}
  },

  _renderProfileModal(isEdit) {
    const p = this.state.profile || {};
    const levels = ['ปริญญาตรี', 'ปริญญาโท', 'ปริญญาเอก'];
    const opts = levels.map(lv =>
      `<option value="${lv}" ${(p.educationLevel||'ปริญญาตรี')===lv?'selected':''}>${t('profile.'+({
        'ปริญญาตรี':'bachelor','ปริญญาโท':'master','ปริญญาเอก':'doctoral'}[lv]))}</option>`
    ).join('');
    this.openModal(`
      <div class="modal-card">
        <div class="modal-head">
          <h2 class="modal-title">${t('profile.title')}</h2>
          ${isEdit ? `<button class="modal-close" onclick="App.closeModal()">✕</button>` : ''}
        </div>
        <div class="modal-body">
          ${!isEdit ? `<p style="color:var(--text-muted);margin-bottom:16px;font-size:14px;">${t('profile.completeDesc')}</p>` : ''}
          <div class="form-group">
            <label class="form-label">${t('profile.studentId')}</label>
            <input class="form-input" id="prof-student-id" type="text"
              placeholder="${t('profile.studentIdPh')}"
              value="${escHtml(p.studentId||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('profile.eduLevel')}</label>
            <select class="form-select" id="prof-edu-level">${opts}</select>
          </div>
        </div>
        <div class="modal-foot" style="justify-content:flex-end;gap:10px;">
          ${!isEdit ? `<button class="btn btn-secondary" onclick="App.closeModal()">${t('profile.skip')}</button>` : ''}
          <button class="btn btn-primary" onclick="App._saveProfile()">
            ${t('profile.save')}
          </button>
        </div>
      </div>`);
  },

  async _saveProfile() {
    const studentId      = document.getElementById('prof-student-id')?.value.trim() || '';
    const educationLevel = document.getElementById('prof-edu-level')?.value || 'ปริญญาตรี';
    const u = this.state.user;
    if (!u) return;
    try {
      await apiPost({ action: 'saveProfile', email: u.email, studentId, educationLevel });
      this.state.profile = { studentId, educationLevel };
      this.closeModal();
      showToast('success', t('profile.title'), t('profile.save'));
    } catch (err) {
      showToast('error', t('toast.submitFail'), err.message || '');
    }
  },

  openModal(html) {
    const box = document.getElementById('modal-box');
    if (!box) return;
    box.innerHTML = html;
    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
};

/* ====================================================
   STATUS CONSTANTS
   ==================================================== */
const STATUS_P1  = 'รอที่ปรึกษาอนุมัติ';
const STATUS_P2  = 'รออนุมัติขั้นที่ 2';   // หัวหน้าภาค (VIEWERS)
const STATUS_P3  = 'รออนุมัติขั้นที่ 3';   // เจ้าหน้าที่ (STAFF_PROJECT_2 / STAFF_FLOOR_1)
const STATUS_OK  = 'อนุมัติแล้ว';
const STATUS_REJ = 'ปฏิเสธ';
const STATUS_CAN = 'ยกเลิก';

/* ====================================================
   UTILITY FUNCTIONS
   ==================================================== */
function normalizeItem(raw) {
  const detail  = String(raw.Detail || raw.detail || '');
  const catRaw  = String(raw.Category || raw.category || '');
  const cat     = catRaw.toLowerCase();

  // Map Thai/English category strings → internal key
  let catKey = 'instrument';
  if      (cat.includes('แก้ว')    || cat.includes('glass'))      catKey = 'glassware';
  else if (cat.includes('สารเคมี') || cat.includes('chemical'))   catKey = 'chemical';
  else if (cat.includes('วิทยาศาสตร์') || cat.includes('scientific') || cat.includes('อุปกรณ์')) catKey = 'scientific';
  // เครื่องมือ / เครื่องมือวิเคราะห์ / instrument → default 'instrument' ✓

  // Use MaxQuantity to determine availability (no Available column in sheet)
  const maxQty = parseInt(String(raw.MaxQuantity || raw.maxQuantity || 0)) || 0;

  // No ID column → fall back to _row (row number from sheet)
  const id = String(raw.ID || raw.Id || raw.id || raw.ItemID || raw._row || '');

  return {
    id,
    name:        String(raw.ItemName || raw.Name || raw.name || ''),
    category:    catKey,
    detail,
    location:    String(raw.Location || raw.location || ''),
    available:   maxQty > 0,
    model:       String(raw.ItemBrand || raw.Model || raw.model || ''),
    maxQty,
    courseLimit: String(raw.CourseLimit || raw.courselimit || ''),
    isRAD:       BookingRules.allowsDateTime(raw)
  };
}

function statusStyle(status) {
  switch (status) {
    case STATUS_P1:  return { cls: 'pending',   badge: 'status-pending-1', icon: uiIcon('clock') };
    case STATUS_P2:  return { cls: 'pending',   badge: 'status-pending-2', icon: uiIcon('clock') };
    case STATUS_P3:  return { cls: 'approved',  badge: 'status-approved',  icon: uiIcon('check') };
    case STATUS_OK:  return { cls: 'approved',  badge: 'status-approved',  icon: uiIcon('check') };
    case STATUS_REJ: return { cls: 'rejected',  badge: 'status-rejected',  icon: uiIcon('close') };
    case STATUS_CAN: return { cls: 'cancelled', badge: 'status-cancelled', icon: '' };
    default:         return { cls: '',          badge: 'status-cancelled', icon: '' };
  }
}

function statusDisplay(status) {
  const map = {
    [STATUS_P1]: t('bk.status.p1'),
    [STATUS_P2]: t('bk.status.p2'),
    [STATUS_P3]: t('bk.status.p3'),
    [STATUS_OK]: t('bk.status.ok'),
    [STATUS_REJ]: t('bk.status.rej'),
    [STATUS_CAN]: t('bk.status.can'),
  };
  return map[status] || status || 'N/A';
}

function jwtDecode(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

function apiGet(func, params = {}) {
  if (!SCRIPT_URL || SCRIPT_URL.includes('YOUR_')) {
    return Promise.reject(new Error('กรุณาตั้งค่า SCRIPT_URL ในไฟล์ index.html'));
  }
  const url = new URL(SCRIPT_URL);
  url.searchParams.set('func', func);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return fetch(url.toString())
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(d => { if (d && d.error) throw new Error(d.error); return d; });
}

function apiPost(payload) {
  if (!SCRIPT_URL || SCRIPT_URL.includes('YOUR_')) {
    return Promise.reject(new Error('กรุณาตั้งค่า SCRIPT_URL ในไฟล์ index.html'));
  }
  return fetch(SCRIPT_URL, {
    method:  'POST',
    body:    JSON.stringify({ ...payload, idToken: localStorage.getItem('kcib_token'), activeRole: window.App?.state.user?.role }),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  }).then(r => r.json())
    .then(d => { if (d && d.error) throw new Error(d.error); return d; });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayISO() {
  return BookingRules.today();
}

function dateAddDays(isoDate, days) {
  return BookingRules.addDays(isoDate, days);
}

function pad(n)  { return String(n).padStart(2, '0'); }
function pad2(t) { return t.length === 4 ? '0' + t : t; } // "9:00" → "09:00"

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Bangkok'
    });
  } catch { return String(isoStr).substring(0, 16).replace('T', ' '); }
}

function showPage(id) {
  document.getElementById(id)?.classList.add('active');
}

/* ====================================================
   TOAST
   ==================================================== */
function showToast(type, title, msg, duration = 4000) {
  const icons = { success: uiIcon('check'), error: uiIcon('close'), warning: uiIcon('info'), info: uiIcon('info') };
  const el    = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-icon">${icons[type] || uiIcon('info')}</div>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escHtml(msg)}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => {
    el.style.opacity  = '0';
    el.style.transform = 'translateX(120%)';
    setTimeout(() => el.remove(), 350);
  }, duration);
}

/* ====================================================
   NAVBAR HELPERS (global for onclick)
   ==================================================== */
function _navOutsideClick(e) {
  const links = document.getElementById('nav-links');
  const ham   = document.getElementById('nav-hamburger');
  if (links?.contains(e.target) || ham?.contains(e.target)) return;
  navClose();
}

function navToggle() {
  const links = document.getElementById('nav-links');
  const ham   = document.getElementById('nav-hamburger');
  const over  = document.getElementById('nav-overlay');
  if (!links) return;
  const open = links.classList.toggle('open');
  document.body.style.overflow = open ? 'hidden' : '';
  ham?.classList.toggle('open', open);
  ham?.setAttribute('aria-expanded', String(open));
  over?.classList.toggle('active', open);
  if (open) {
    // delay so the toggle-click itself doesn't immediately close
    setTimeout(() => document.addEventListener('click', _navOutsideClick), 10);
  } else {
    document.removeEventListener('click', _navOutsideClick);
  }
}

function navClose() {
  document.getElementById('nav-links')?.classList.remove('open');
  document.getElementById('nav-hamburger')?.classList.remove('open');
  document.getElementById('nav-hamburger')?.setAttribute('aria-expanded', 'false');
  document.getElementById('nav-overlay')?.classList.remove('active');
  document.removeEventListener('click', _navOutsideClick);
  if (!document.getElementById('modal-overlay')?.classList.contains('open')) document.body.style.overflow = '';
}

function closeDropdown() {
  document.getElementById('user-dropdown')?.remove();
  document.getElementById('user-menu-btn')?.classList.remove('open');
}

/* ====================================================
   BOOT
   ==================================================== */
App.boot();
