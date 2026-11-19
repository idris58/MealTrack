/**
 * Zero-framework enhancements for the prerendered public landing pages.
 * Kept external (not inline) because the production CSP allows 'self' scripts
 * but forbids inline script attributes.
 */
(function () {
  var STORAGE_KEY = "mealtrack:theme";
  var button = document.querySelector("[data-seo-theme]");

  function apply(theme) {
    var dark = theme === "dark";
    document.documentElement.classList.toggle("dark", dark);
    if (button) button.setAttribute("aria-pressed", dark ? "true" : "false");
  }

  var saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    /* storage disabled — light theme is the default */
  }
  apply(saved === "dark" ? "dark" : "light");

  if (button) {
    button.addEventListener("click", function () {
      var next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {
        /* keep in-memory only */
      }
    });
  }
})();
