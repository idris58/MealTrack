/**
 * Zero-framework enhancements for the prerendered public landing pages.
 * Kept external (not inline) because the production CSP allows 'self' scripts
 * but forbids inline script attributes. The markup mirrors the React toggles;
 * this file reproduces their visual states and behaviour.
 */
(function () {
  var STORAGE_KEY = "mealtrack:theme";
  var button = document.querySelector("[data-seo-theme]");
  var knob = button && button.querySelector("[data-seo-theme-knob]");
  var sun = button && button.querySelector("[data-seo-theme-sun]");
  var moon = button && button.querySelector("[data-seo-theme-moon]");

  function setClasses(el, add, remove) {
    if (!el) return;
    remove.forEach(function (c) { el.classList.remove(c); });
    add.forEach(function (c) { el.classList.add(c); });
  }

  function apply(theme) {
    var dark = theme === "dark";
    document.documentElement.classList.toggle("dark", dark);
    if (button) {
      button.setAttribute("aria-pressed", dark ? "true" : "false");
      button.setAttribute(
        "aria-label",
        dark ? "Switch to light mode" : "Switch to dark mode",
      );
    }
    if (dark) {
      setClasses(knob, ["translate-x-[1.15rem]"], []);
      setClasses(sun, ["rotate-90", "scale-0", "opacity-0"], ["rotate-0"]);
      setClasses(moon, ["rotate-0", "scale-100", "opacity-100"], ["-rotate-90", "opacity-0"]);
    } else {
      setClasses(knob, [], ["translate-x-[1.15rem]"]);
      setClasses(sun, ["rotate-0"], ["rotate-90", "scale-0", "opacity-0"]);
      setClasses(moon, ["-rotate-90", "opacity-0"], ["rotate-0", "scale-100", "opacity-100"]);
    }
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
