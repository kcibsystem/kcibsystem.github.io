function labBenchIllustration() {
  return `<svg class="lab-illustration" viewBox="0 0 560 410" fill="none" aria-hidden="true">
    <g stroke="var(--lab-guide)" stroke-width="1">
      <path d="M46 80H516M46 160H516M46 240H516M46 320H516M120 42V365M200 42V365M280 42V365M360 42V365M440 42V365"/>
    </g>
    <ellipse cx="298" cy="359" rx="204" ry="13" fill="var(--lab-shadow)"/>
    <g stroke="var(--lab-ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M91 346H166L156 356H82ZM123 60V346M115 60H131" fill="var(--lab-metal)"/>
      <path d="M123 112H237M123 174H187"/><rect x="116" y="104" width="14" height="16" rx="3" fill="var(--lab-metal)"/>
      <path d="M225 65H255V140C255 156 282 171 289 191A65 65 0 1 1 191 191C199 171 225 156 225 140Z" fill="var(--lab-glass)"/>
      <path d="M186 228C216 216 253 240 294 225A56 56 0 0 1 185 244Z" fill="var(--lab-liquid)" stroke="none"/>
      <path d="M185 228C223 215 253 241 294 225" stroke="var(--accent)"/>
      <path d="M219 65H261M225 76H255M224 92H234M224 104H231M224 116H234"/>
      <path d="M204 196C194 208 191 219 191 231M203 258L208 264" stroke="var(--lab-shine)" stroke-width="5"/>
      <path d="M248 53V31H325V56M240 53H256"/>
      <path d="M311 58H339V170L359 190V210H291V190L311 170Z" fill="var(--lab-glass)"/>
      <path d="M316 77H334M316 95H334M316 113H334M316 131H334M316 149H334M324 58V171L343 192" stroke="var(--lab-cool)"/>
      <path d="M302 208V229L349 269V287M314 210V223L361 263V287"/>
      <path d="M325 287H386M332 287V339Q332 350 343 350H373Q384 350 384 339V287" fill="var(--lab-glass)"/>
      <path d="M339 326Q359 318 377 326V339Q377 344 371 344H345Q339 344 339 339Z" fill="var(--lab-liquid)" stroke="none"/>
      <path d="M370 302H383M375 312H383M370 322H383"/>
      <rect x="176" y="298" width="128" height="49" rx="9" fill="var(--lab-metal)"/>
      <path d="M188 296H291M199 311H242M199 320H226"/>
      <circle cx="279" cy="323" r="10" fill="var(--lab-liquid)"/><path d="M279 317V323"/>
      <path d="M432 234H460V268L488 331Q496 349 478 349H416Q398 349 406 331L434 268V234" fill="var(--lab-glass)"/>
      <path d="M420 308H474L484 334Q489 343 478 343H416Q405 343 410 334Z" fill="var(--lab-cool)" fill-opacity=".3" stroke="none"/>
      <path d="M428 234H466M429 245H461M452 291H467M459 307H474M466 323H481"/>
      <path d="M62 357H510"/>
    </g>
    <g fill="var(--accent)"><circle cx="239" cy="250" r="3"/><circle cx="252" cy="239" r="2"/><circle cx="226" cy="260" r="2"/></g>
  </svg>`;
}

function uiIcon(name, size = 20) {
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
    instrument: '<path d="M9 3h6v3H9zM12 6v7m-4-3 4 3 3-3M8 13a5 5 0 0 0 8 5M6 21h14M9 18v3M17 8a7 7 0 0 1 1 11"/>',
    glassware: '<path d="M9 3h6M10 3v6l-6 10a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2L14 9V3M8 14h8"/>',
    scientific: '<path d="M5 4h14v4l-2 3v10H7V11L5 8zM7 8h10M10 15h4M10 18h4"/>',
    chemical: '<path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12zM9 15a3 3 0 0 0 3 3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-12 4h2m3 0h2"/>',
    location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
    list: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6m-6 4h6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    moon: '<path d="M20 14A8 8 0 0 1 10 4a8.5 8.5 0 1 0 10 10z"/>',
    building: '<path d="M4 21h16M6 21V8h12v13M4 8l8-5 8 5M9 12h1m4 0h1m-6 4h1m4 0h1"/>'
  };
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

// Apply the saved theme before styles paint, avoiding a light flash in dark mode.
try { document.documentElement.dataset.theme = localStorage.getItem('kcib_theme') === 'dark' ? 'dark' : 'light'; }
catch (_) { document.documentElement.dataset.theme = 'light'; }

function updateThemeControls() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = window.LANG === 'en' ? (dark ? 'Light theme' : 'Dark theme') : (dark ? 'ธีมสว่าง' : 'ธีมมืด');
  document.querySelectorAll('.theme-toggle').forEach(button => {
    button.innerHTML = uiIcon(dark ? 'sun' : 'moon');
    button.setAttribute('aria-label', label);
    button.title = label;
  });
}
function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('kcib_theme', theme); } catch (_) {}
  updateThemeControls();
}
document.addEventListener('DOMContentLoaded', updateThemeControls);
