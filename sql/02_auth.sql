-- =====================================================================
--  Tablas de autenticación / autorización (NO las toca el seed, por lo
--  que los usuarios y sesiones sobreviven a un reseteo de los datos).
-- =====================================================================
create table if not exists app_user (
  id            uuid primary key default gen_random_uuid(),
  google_sub    text not null unique,            -- identificador estable de Google
  email         text not null,
  name          text,
  picture       text,
  role          text not null default 'lector'
                check (role in ('admin','bibliotecario','lector')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create index if not exists idx_app_user_email on app_user (lower(email));

-- Refresh tokens opacos: solo se guarda el hash SHA-256.
-- family_id agrupa la cadena de rotación para detectar reutilización.
create table if not exists refresh_token (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  family_id   uuid not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  replaced_by uuid,
  created_at  timestamptz not null default now(),
  ip          text,
  user_agent  text
);
create index if not exists idx_refresh_family on refresh_token (family_id);
create index if not exists idx_refresh_user   on refresh_token (user_id);
