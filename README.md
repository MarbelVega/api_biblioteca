# API REST Biblioteca UREAL (Next.js + PostgreSQL + Google SSO + JWT)

## 1. Base de datos (Docker)

```bash
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=mysecretpassword \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql \
  postgres:18

docker exec -it postgres psql -U postgres -c "create database biblioteca_ureal"
docker exec -i postgres psql -U postgres -d biblioteca_ureal < sql/01_seed_biblioteca_ureal.sql
docker exec -i postgres psql -U postgres -d biblioteca_ureal < sql/02_auth.sql
```

> En las imágenes de PostgreSQL 18 el volumen se monta en `/var/lib/postgresql` (ya no en `/var/lib/postgresql/data`).
> `01_seed...` es el seed original con la corrección `O\''Reilly` -> `O''Reilly`.

## 2. Google OAuth

Google Cloud Console -> APIs y servicios -> Credenciales -> ID de cliente OAuth (Aplicación web).
URI de redirección autorizado: `http://localhost:3000/api/auth/google/callback
`

## 3. Ejecutar

```bash
cp .env.example .env.local   # completar GOOGLE_*, JWT_SECRET, ADMIN_EMAILS
npm install
npm run dev
```

Abrir http://localhost:3000 -> "Iniciar sesión con Google".

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/auth/google` | público (inicia SSO) |
| GET | `/api/auth/google/callback` | público (Google redirige aquí) |
| POST | `/api/auth/google/token` `{id_token}` | público (clientes SPA/móvil) |
| POST | `/api/auth/refresh` | refresh token (cookie o `{refresh_token}`) |
| POST | `/api/auth/logout` | revoca la sesión |
| GET | `/api/auth/me` | autenticado |
| GET/PATCH | `/api/users`, `/api/users/:uuid` | admin |
| GET/POST | `/api/{recurso}` | ver roles abajo |
| GET/PUT/PATCH/DELETE | `/api/{recurso}/:id` | ver roles abajo |

Recursos: `carreras`, `tipos-usuario`, `estudiantes`, `editoriales`, `autores`, `categorias`, `libros`, `prestamos`.

Listados: `?page=1&limit=20&sort=titulo&order=asc&q=texto` + filtros (`?id_categoria=2&disponible=true`).

## Roles (RBAC)

| Rol | Permisos |
|---|---|
| lector | Lee catálogo y **solo sus propios préstamos** (enlazados por correo con `estudiante`) |
| bibliotecario | Lectura + crear/editar todo, incluido `estudiantes` |
| admin | Todo, incluido DELETE y gestión de usuarios |

Los nuevos usuarios entran como `lector`; los correos de `ADMIN_EMAILS` entran como `admin`.

## Ejemplos

```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/libros?q=datos&limit=5"

curl -X POST http://localhost:3000/api/libros \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Seguridad en BD","anio":2024,"id_categoria":2,"id_editorial":4,"autores":[3,4]}'

curl -X PATCH http://localhost:3000/api/prestamos/2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"estado":"devuelto"}'   # fija fecha_devolucion y libera el libro
```

## Modelo de seguridad

- **SSO**: Authorization Code + PKCE (S256), `state` y `nonce` en cookie firmada de 10 min; el `id_token` se verifica con el JWKS de Google (firma, iss, aud, exp, nonce, `email_verified`, dominio/`hd` opcional).
- **JWT de acceso**: HS256, 10 min, con iss/aud/jti; la verificación fija el algoritmo.
- **Refresh tokens**: opacos, guardados como hash SHA-256, con rotación en cada uso y detección de reutilización (revoca toda la familia).
- **Cookies**: httpOnly, Secure en producción, SameSite=Strict; el refresh solo viaja a `/api/auth`. Con cookies, las mutaciones exigen `Origin` válido (CSRF).
- **SQL**: solo consultas parametrizadas; columnas, orden y filtros salen de una lista blanca; validación con Zod `.strict()`.
- **Otros**: rate limiting en endpoints de auth, cabeceras de seguridad, `Cache-Control: no-store`, errores de PostgreSQL mapeados a 409/422.

## Notas de producción

- El rate limiter es en memoria: usar Redis/Upstash con varias instancias.
- El access token es stateless: una desactivación de usuario surte efecto en <= 10 min (los refresh se revocan al instante).
- Rotar `JWT_SECRET` invalida todas las sesiones; para varios servicios considere RS256/EdDSA.
- Detrás de un proxy, confiar en `x-forwarded-for` solo si el proxy es de confianza.
