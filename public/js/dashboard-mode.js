// Dashboard Mode — switches between Beginner and Trader views
// Beginner: simplified layout, AI digest first, progressive disclosure
// Trader: current full dashboard
(function () {
  var STORAGE_KEY = 'wavedge_dashboard_mode';
  var MODES = {
    beginner: { label: 'Beginner' },
    trader:   { label: 'Trader' }
  };

  function applyMode(mode) {
    if (!MODES[mode]) mode = 'beginner';
    document.documentElement.dataset.dashboardMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);

    // Update active state in switcher UI
    document.querySelectorAll('.dashboard-mode-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  // Apply saved preference on load
  var saved = localStorage.getItem(STORAGE_KEY) || 'beginner';
  document.documentElement.dataset.dashboardMode = saved;

  // Expose for nav-bar and other components
  window.__wavedgeDashboardModes = MODES;
  window.__wavedgeApplyDashboardMode = applyMode;
  window.__wavedgeCurrentDashboardMode = function () {
    return localStorage.getItem(STORAGE_KEY) || 'beginner';
  };
})();
