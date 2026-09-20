/* Each signage repo keeps this small client locally; no shared script is required to render. */
(() => {
  const script = document.currentScript;
  const stage = document.querySelector(script?.dataset.themeStage || ".stage");
  const slot = script?.dataset.themeSlot;
  const page = script?.dataset.themePage;
  const configured = new URLSearchParams(location.search).get("themeService") || script?.dataset.themeService;
  if (!stage || !slot || !page || !configured) return;

  let origin;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "localhost")) return;
    origin = parsed.origin;
  } catch { return; }

  const endpoint = new URL("/api/theme", origin);
  endpoint.searchParams.set("slot", slot);
  endpoint.searchParams.set("page", page);
  let currentImage = null;
  let checking = false;
  let lastAttempt = 0;

  function applyOverlay(value) {
    const color = value?.color;
    const opacity = value?.opacity;
    if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) &&
        typeof opacity === "number" && Number.isFinite(opacity) && opacity >= 0 && opacity <= 0.6) {
      stage.style.setProperty("--theme-tint-color", color);
      stage.style.setProperty("--theme-tint-opacity", String(opacity));
    } else {
      stage.style.removeProperty("--theme-tint-color");
      stage.style.removeProperty("--theme-tint-opacity");
    }
  }

  function preload(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error("Image timed out")); }, 8000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error("Image failed")); };
      image.src = url;
    });
  }

  async function checkTheme() {
    if (checking || Date.now() - lastAttempt < 5 * 60 * 1000) return;
    checking = true;
    lastAttempt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) throw new Error("Theme unavailable");
      const data = await response.json();
      if (data.slot !== slot || data.timezone !== "Europe/London") throw new Error("Invalid theme");
      const next = data.theme?.background;
      if (!next) {
        stage.style.removeProperty("--theme-background");
        currentImage = null;
      } else {
        const imageUrl = new URL(next);
        if (imageUrl.origin !== origin || !/^\/assets\/[a-f0-9]{64}\.webp$/.test(imageUrl.pathname)) throw new Error("Invalid image URL");
        if (next !== currentImage) {
          await preload(next);
          stage.style.setProperty("--theme-background", `url("${next}")`);
          currentImage = next;
        }
      }
      applyOverlay(data.overlay);
    } catch { /* Keep the current image, or the bundled local background. */ }
    finally { clearTimeout(timer); checking = false; }
  }

  void checkTheme();
  setInterval(checkTheme, 5 * 60 * 1000);
  addEventListener("online", checkTheme);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void checkTheme(); });
})();
