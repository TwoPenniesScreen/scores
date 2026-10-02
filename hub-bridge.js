/* Receives a admin hub token in the URL fragment, then removes it. */
(() => {
  const match = /^#hub=([A-Za-z0-9_.-]+)$/.exec(location.hash);
  if (match) {
    try { localStorage.setItem("ttpHubToken", match[1]); } catch {}
    history.replaceState(null, "", location.pathname + location.search);
  }
  let token = "";
  try { token = localStorage.getItem("ttpHubToken") || ""; } catch {}
  window.ttpHubToken = token;
  if (!token) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin !== location.origin || !(/^\/api\//.test(url.pathname) || /^\/\.netlify\/functions\//.test(url.pathname))) return originalFetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("X-TTP-Hub-Token", token);
    return originalFetch(input, { ...init, headers });
  };
})();
