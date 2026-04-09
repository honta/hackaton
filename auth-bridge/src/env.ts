import { z } from 'zod';

const envSchema = z.object({
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_REDIRECT_URI: z.string().url(),
  AUTH_BRIDGE_PORT: z.coerce.number().int().positive().default(8787),
});

export type AuthBridgeEnv = z.infer<typeof envSchema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): AuthBridgeEnv {
  return envSchema.parse(source);
}
