import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import {
  COMPETITIONS,
  DEFAULT_SETTINGS,
  publicCompetition,
  sanitiseSettings,
} from "./_shared/catalog.js";

const COOKIE_NAME = "scores_admin";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function store() {
  return getStore({ name: "scores", consistency: "strong" });
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function adminPassword() {
  return Netlify.env.get("SCORES_ADMIN_PASSWORD") || Netlify.env.get("ADMIN_PASSWORD") || "";
}

function sign(timestamp: string, password: string) {
  return createHmac("sha256", password).update(`two-pennies-scores:${timestamp}`).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function isAuthenticated(request: Request, password: string) {
  if (!password) return false;
  const token = cookieValue(request, COOKIE_NAME);
  const [timestamp, signature] = token.split(".");
  const issuedAt = Number(timestamp);
  if (!issuedAt || !signature) return false;
  if (Date.now() - issuedAt > THIRTY_DAYS_SECONDS * 1000) return false;
  return safeEqual(signature, sign(timestamp, password));
}

function setCookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function readSettings() {
  try {
    return sanitiseSettings((await store().get("settings", { type: "json" })) || DEFAULT_SETTINGS);
  } catch (error) {
    console.warn("Unable to read settings", error);
    return sanitiseSettings(DEFAULT_SETTINGS);
  }
}

async function readHealth() {
  try {
    return (await store().get("health", { type: "json" })) || null;
  } catch (error) {
    console.warn("Unable to read health", error);
    return null;
  }
}

export default async function handler(request: Request) {
  const password = adminPassword();
  const authenticated = isAuthenticated(request, password);

  if (request.method === "GET") {
    return response({
      ok: true,
      configured: Boolean(password),
      authenticated,
      settings: await readSettings(),
      competitions: COMPETITIONS.map(publicCompetition),
      health: authenticated ? await readHealth() : null,
    });
  }

  if (request.method === "POST") {
    if (!password) return response({ ok: false, error: "Set SCORES_ADMIN_PASSWORD in Netlify first." }, 503);
    const body = await request.json().catch(() => ({})) as any;
    const supplied = String(body.password || "");
    if (!safeEqual(supplied, password)) return response({ ok: false, error: "Incorrect password" }, 401);
    const timestamp = String(Date.now());
    return response(
      { ok: true, authenticated: true },
      200,
      { "set-cookie": setCookie(request, `${timestamp}.${sign(timestamp, password)}`, THIRTY_DAYS_SECONDS) },
    );
  }

  if (request.method === "PUT") {
    if (!authenticated) return response({ ok: false, error: "Sign in again to save settings" }, 401);
    const body = await request.json().catch(() => ({}));
    const settings = sanitiseSettings(body);
    await store().setJSON("settings", settings);
    return response({ ok: true, settings });
  }

  if (request.method === "DELETE") {
    return response(
      { ok: true, authenticated: false },
      200,
      { "set-cookie": setCookie(request, "", 0) },
    );
  }

  return response({ ok: false, error: "Method not allowed" }, 405, { allow: "GET, POST, PUT, DELETE" });
}

export const config: Config = {
  path: "/api/settings",
};
