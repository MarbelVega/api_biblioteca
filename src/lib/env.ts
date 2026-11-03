import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ISSUER: z.string().default('biblioteca-ureal-api'),
  JWT_AUDIENCE: z.string().default('biblioteca-ureal-clients'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(600),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 14),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ADMIN_EMAILS: z.string().default(''),
  ALLOWED_EMAIL_DOMAINS: z.string().default(''),
});

export type Env = z.infer<typeof schema> & {
  adminEmails: string[];
  allowedDomains: string[];
  isProd: boolean;
};

let cached: Env | undefined;

/** Lectura perezosa: valida al primer uso (no rompe `next build` sin .env). */
export function env(): Env {
  if (!cached) {
    const e = schema.parse(process.env);
    const list = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    cached = {
      ...e,
      adminEmails: list(e.ADMIN_EMAILS),
      allowedDomains: list(e.ALLOWED_EMAIL_DOMAINS),
      isProd: process.env.NODE_ENV === 'production',
    };
  }
  return cached;
}
