// Theme Switcher — loads/unloads theme CSS overrides
// Available themes: default, 8bit, glass, apple, light
(function () {
  const STORAGE_KEY = 'wavedge_theme';
  const THEMES = {
    default:  { label: 'Default',    file: null },
    terminal: { label: '8-Bit',      file: '/css/theme-terminal.css' },
    apple:    { label: 'Apple Glass', file: '/css/theme-apple.css' },
    glass:    { label: 'Glass',      file: '/css/theme-glass.css' },
    light:    { label: 'Light',      file: '/css/theme-light.css' },
  };

  let linkEl = null;

  function applyTheme(name) {
    if (!THEMES[name]) name = 'default';
    const theme = THEMES[name];

    if (linkEl) {
      linkEl.remove();
      linkEl = null;
    }

    if (theme.file) {
      linkEl = document.createElement('link');
      linkEl.rel = 'stylesheet';
      linkEl.href = theme.file;
      linkEl.id = 'theme-override';
      document.head.appendChild(linkEl);
    }

    localStorage.setItem(STORAGE_KEY, name);

    // Update active state in switcher UI
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === name);
    });
  }

  // Apply saved theme on load (before paint if possible)
  const saved = localStorage.getItem(STORAGE_KEY) || 'default';
  if (saved !== 'default' && THEMES[saved]) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = THEMES[saved].file;
    link.id = 'theme-override';
    document.head.appendChild(link);
    linkEl = link;
  }

  // Expose for nav-bar
  window.__wavedgeThemes = THEMES;
  window.__wavedgeApplyTheme = applyTheme;
  window.__wavedgeCurrentTheme = function () {
    return localStorage.getItem(STORAGE_KEY) || 'default';
  };
})();
