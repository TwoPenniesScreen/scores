// Hub tokens are checked by the branding service before admin requests reach this site.
export default async (request, context) => {
  const token = request.headers.get("X-TTP-Hub-Token");
  if (!token) return;
  if (!/^[A-Za-z0-9_.-]{40,2048}$/.test(token)) return new Response("Unauthorized", { status: 401 });
  let valid = false;
  try {
    const result = await fetch("https://ttp-brand.netlify.app/api/hub/verify", {
      method: "POST", headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(4000)
    });
    valid = result.ok;
  } catch {}
  if (!valid) return new Response("Unauthorized", { status: 401 });
  const password = Netlify.env.get("SCORES_ADMIN_PASSWORD") || Netlify.env.get("ADMIN_PASSWORD");
  if (!password) return new Response("Admin service unavailable", { status: 503 });
  const headers = new Headers(request.headers);
  headers.delete("X-TTP-Hub-Token");
  headers.set("X-Admin-Password", password);
  
  return context.next(new Request(request, { headers }));
};
export const config = { path: ["/api/*", "/.netlify/functions/*"] };
