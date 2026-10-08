import { scoresHandler } from "../functions/scores.ts";

export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.searchParams.get("view") !== "display") return context.next();
  const response = await scoresHandler(request, context);
  const headers = new Headers(response.headers);
  headers.set("X-TTP-Runtime", "edge");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const config = { path: "/api/scores" };
