// Font Size Preference — scales the root font size
// Sizes: small (14px), medium (16px, default), large (18px)
(function () {
  var STORAGE_KEY = 'wavedge_font_size';
  var SIZES = {
    small:  { label: 'Small',  px: 14 },
    medium: { label: 'Medium', px: 16 },
    large:  { label: 'Large',  px: 18 }
  };

  function applyFontSize(size) {
    if (!SIZES[size]) size = 'medium';
    document.documentElement.style.fontSize = SIZES[size].px + 'px';
    document.documentElement.dataset.fontSize = size;
    localStorage.setItem(STORAGE_KEY, size);

    // Update active state in switcher UI
    document.querySelectorAll('.font-size-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.size === size);
    });
  }

  // Apply saved preference on load (before paint)
  var saved = localStorage.getItem(STORAGE_KEY) || 'medium';
  if (SIZES[saved]) {
    document.documentElement.style.fontSize = SIZES[saved].px + 'px';
    document.documentElement.dataset.fontSize = saved;
  }

  // Expose for nav-bar
  window.__wavedgeFontSizes = SIZES;
  window.__wavedgeApplyFontSize = applyFontSize;
  window.__wavedgeCurrentFontSize = function () {
    return localStorage.getItem(STORAGE_KEY) || 'medium';
  };
})();
