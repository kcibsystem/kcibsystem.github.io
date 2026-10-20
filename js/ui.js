function uiIcon(name, size = 20) {
  const paths = {
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
