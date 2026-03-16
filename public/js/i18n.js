/**
 * Lightweight i18n module for Wavedge.
 * No dependencies — works with vanilla JS + Web Components.
 *
 * Usage:
 *   await window.i18n.init();
 *   window.i18n.t('nav.dashboard');              // "Dashboard"
 *   window.i18n.t('time.mAgo', { n: 5 });       // "5m ago"
 *   window.i18n.t('feed.historicalTooltip', { samples: 3, plural: 's' }); // interpolation
 */
(function () {
  'use strict';

  const SUPPORTED_LOCALES = ['en', 'zh-tw', 'ja', 'ko'];
  const DEFAULT_LOCALE = 'en';
  const STORAGE_KEY = 'preferred-locale';

  let _locale = DEFAULT_LOCALE;
  let _messages = {};
  let _fallback = {};
  let _ready = false;

  /**
   * Detect locale from URL path, localStorage, or browser language.
   * Priority: URL path > localStorage > navigator.language > 'en'
   */
  function detectLocale() {
    // 1. URL path: /zh-tw/dashboard → 'zh-tw'
    const pathMatch = window.location.pathname.match(/^\/(zh-tw|ja|ko)(?:\/|$)/);
    if (pathMatch && SUPPORTED_LOCALES.includes(pathMatch[1])) {
      return pathMatch[1];
    }

    // 2. localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      return stored;
    }

    // 3. navigator.language / Accept-Language
    const browserLang = (navigator.language || '').toLowerCase();
    if (browserLang.startsWith('zh')) return 'zh-tw';
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('ko')) return 'ko';

    // 4. Fallback
    return DEFAULT_LOCALE;
  }

  /**
   * Load a locale JSON file synchronously (for initial load)
   * or asynchronously (for lazy loading).
   */
  function loadLocaleSync(locale) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/locales/${locale}.json`, false);
      xhr.send();
      if (xhr.status === 200) return JSON.parse(xhr.responseText);
    } catch (err) {
      console.warn(`[i18n] Failed to load locale "${locale}":`, err.message);
    }
    return {};
  }

  async function loadLocale(locale) {
    try {
      const resp = await fetch(`/locales/${locale}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn(`[i18n] Failed to load locale "${locale}":`, err.message);
      return {};
    }
  }

  /**
   * Translate a key, with optional {variable} interpolation.
   * Falls back to English, then to the key itself.
   *
   * @param {string} key - Dot-namespaced key, e.g. 'nav.dashboard'
   * @param {Object} [params] - Interpolation values, e.g. { n: 5 }
   * @returns {string}
   */
  function t(key, params) {
    let str = _messages[key] || _fallback[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return str;
  }

  /**
   * Switch locale: save preference and redirect to locale subdirectory.
   */
  function setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) return;
    localStorage.setItem(STORAGE_KEY, locale);

    // Strip existing locale prefix from path
    let path = window.location.pathname.replace(/^\/(zh-tw|ja|ko)(\/|$)/, '/');

    // Add new locale prefix (skip for 'en' which uses root)
    if (locale !== DEFAULT_LOCALE) {
      path = '/' + locale + (path === '/' ? '' : path);
    }

    window.location.href = path + window.location.search + window.location.hash;
  }

  /**
   * Initialize i18n synchronously: detect locale, load English fallback,
   * then load target locale. Uses sync XHR so t() works immediately
   * when components render in connectedCallback.
   */
  function init() {
    _locale = detectLocale();

    // Load English as fallback (sync — local file, fast)
    _fallback = loadLocaleSync('en');

    if (_locale !== 'en') {
      // Load target locale sync so t() works immediately
      _messages = loadLocaleSync(_locale);
    } else {
      _messages = _fallback;
    }

    // Set <html lang>
    document.documentElement.lang = _locale === 'zh-tw' ? 'zh-Hant' : _locale;

    _ready = true;
    return Promise.resolve();
  }

  // Public API
  window.i18n = {
    init,
    t,
    setLocale,
    detectLocale,
    get locale() { return _locale; },
    get ready() { return _ready; },
    SUPPORTED_LOCALES,
    LOCALE_LABELS: {
      'en': 'English',
      'zh-tw': '繁體中文',
      'ja': '日本語',
      'ko': '한국어'
    }
  };
})();
