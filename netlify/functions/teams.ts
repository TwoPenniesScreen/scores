import type { Config } from "@netlify/functions";
import { scoresHandler } from "./scores.ts";

export default scoresHandler;

export const config: Config = {
  path: "/api/teams",
};
