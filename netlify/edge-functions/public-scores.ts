import { scoresHandler } from "../functions/scores.ts";

export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.searchParams.get("view") !== "display") return context.next();
  return scoresHandler(request, context);
};

export const config = { path: "/api/scores" };
