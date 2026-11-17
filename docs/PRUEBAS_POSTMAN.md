# Probar la API con Postman — paso a paso

Archivos: `postman/Biblioteca_UREAL.postman_collection.json` y `postman/Biblioteca_UREAL.local.postman_environment.json`.

## 0. Preparar el entorno

```bash
# Base de datos (los tres scripts, en orden)
docker exec -i postgres psql -U postgres -d biblioteca_ureal < sql/01_seed_biblioteca_ureal.sql
docker exec -i postgres psql -U postgres -d biblioteca_ureal < sql/02_auth.sql
docker exec -i postgres psql -U postgres -d biblioteca_ureal < sql/03_solicitudes.sql

cp .env.example .env.local     # completar GOOGLE_CLIENT_ID/SECRET, JWT_SECRET y ADMIN_EMAILS (su correo real)
npm install && npm run dev
```

Compruebe en el navegador `http://localhost:3000/api/health` → `{"status":"ok"}`.
Si responde `db_unavailable`, Postgres no está accesible con `DATABASE_URL`.

## 1. Importar en Postman

1. **Import** → arrastre los dos archivos de `postman/`.
2. Arriba a la derecha seleccione el entorno **Biblioteca UREAL - local**.
3. Ejecute **0 · Salud → Health**. Debe dar `200` y pasar 2 tests (pestaña *Test Results*).

## 2. Obtener un token (la API solo entra con Google)

La API no tiene usuario/contraseña. Hay dos formas de conseguir tokens para Postman.

### Opción B — copiar el refresh token del navegador (la más rápida)

1. Abra una **ventana de incógnito** en `http://localhost:3000` → *Continuar con Google*.
2. `F12` → **Application** (Chrome) / **Storage** (Firefox) → **Cookies** → `http://localhost:3000` → copie el valor de **`refresh_token`**.
3. **Cierre la ventana de incógnito sin volver a usarla.**
   Los refresh tokens rotan en cada uso; si el navegador y Postman usan el mismo token, la API detecta "reutilización" y revoca la sesión de ambos.
4. En Postman: *Environments* → pegue el valor en **`refresh_token`** (columna *Current value*) → **Save**.
5. Ejecute **1.2 Renovar tokens (refresh)** → `200`. Guarda `access_token` y `refresh_token` solos.
6. Ejecute **1.3 Mi perfil** → verá su correo y su **rol**.

Desde aquí la colección **renueva el access token sola** (dura 10 min) con un script *pre-request*; no tiene que repetir nada mientras el refresh token siga vigente (14 días, salvo logout o reutilización).

### Opción A — id_token de Google con OAuth 2.0 de Postman

1. En Google Cloud Console agregue `https://oauth.pstmn.io/v1/callback` como **URI de redirección autorizado** del mismo cliente OAuth.
2. En cualquier request → *Authorization* → *OAuth 2.0* → *Configure New Token*:
   Auth URL `https://accounts.google.com/o/oauth2/v2/auth`, Access Token URL `https://oauth2.googleapis.com/token`, Client ID/Secret de su `.env.local`, Scope `openid email profile`, Callback URL `https://oauth.pstmn.io/v1/callback`.
3. *Get New Access Token* y copie el **`id_token`** de la respuesta (según la versión de Postman aparece en el detalle del token).
4. Péguelo en la variable **`google_id_token`** y ejecute **1.1 Login con id_token de Google**.

> El `id_token` caduca en ~1 hora; úselo enseguida. Esta opción exige que el *audience* sea su `GOOGLE_CLIENT_ID`.

## 3. Elegir el rol con el que prueba

Un usuario nuevo entra como **lector**. Para ser administrador:

- ponga su correo en `ADMIN_EMAILS` (`.env.local`), reinicie `npm run dev` y vuelva a iniciar sesión; **o**
- en SQL: `update app_user set role = 'admin' where email = 'su@correo.com';` y vuelva a obtener tokens (el rol viaja dentro del JWT).

| Acción | lector | bibliotecario | admin |
|---|:--:|:--:|:--:|
| Leer catálogo (libros, autores, categorías…) | ✅ | ✅ | ✅ |
| Ver préstamos | solo los suyos | todos | todos |
| Ver estudiantes | ❌ 403 | ✅ | ✅ |
| Crear/editar (libros, préstamos, estudiantes…) | ❌ 403 | ✅ | ✅ |
| DELETE | ❌ 403 | ❌ 403 | ✅ |
| Crear solicitud de préstamo | ✅ (propia) | ✅ (a nombre de un estudiante) | ✅ |
| Aprobar/rechazar solicitudes, `/api/stats` | ❌ 403 | ✅ | ✅ |
| `/api/users` | ❌ 403 | ❌ 403 | ✅ |

## 4. Recorrido guiado

Ejecute las carpetas en orden (o **Run collection**, ver abajo). Cada request trae *tests* automáticos.

| Carpeta | Qué comprueba |
|---|---|
| 0 · Salud | API + BD arriba |
| 1 · Autenticación | login, rotación del refresh token, `/auth/me` |
| 2 · Catálogo | paginación (`page`, `limit`), búsqueda `q`, filtros, orden; crear/editar libro con autores N:M |
| 3 · Estudiantes | CRUD; correo duplicado → `409` |
| 4 · Préstamos | prestar → libro `disponible=false`; prestar de nuevo → `409`; devolver → libro disponible otra vez |
| 5 · Solicitudes | solicitar → duplicada `409` → aprobar (crea préstamo) → re-resolver `409` |
| 6 · Administración | `/api/stats`, usuarios y cambio de rol |
| 7 · Seguridad | sin token `401`, token `alg=none` `401`, `sort` inválido `400`, inyección SQL tratada como texto, campos extra `400`, JSON roto `400`, ids inexistentes `404/422` |
| 9 · Limpieza | borra lo creado (**requiere admin**) y cierra sesión |

**Run collection** (*Collection → Run*): desmarque **1.1** (solo sirve con la Opción A) y use un token **admin**; con otro rol fallarán, a propósito, los `DELETE` y `/users`.

Por consola: `npm i -g newman` y
`newman run postman/Biblioteca_UREAL.postman_collection.json -e postman/Biblioteca_UREAL.local.postman_environment.json`

### Probar el RBAC (403)

Cree un segundo entorno (p. ej. *Biblioteca UREAL - lector*) con el `refresh_token` de una cuenta lector y repita *Crear libro*, *Listar estudiantes*, *DELETE* y *Estadísticas*: todos deben dar `403`.
Para que un lector vea préstamos, su correo debe existir en la tabla `estudiante` (así se vinculan).

## 5. Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `401 Token inválido o expirado` | Venció el access token y no hay `refresh_token` válido: repita el paso 2 |
| `401 Refresh token inválido, expirado o reutilizado` | Se usó dos veces el mismo token (p. ej. navegador + Postman). Inicie sesión de nuevo |
| `403 Origen no permitido` | Solo ocurre con **cookies**. En Postman use siempre `Authorization: Bearer` |
| `403 Usuario desactivado` | `active=false` en `app_user` |
| `redirect_uri_mismatch` (Google) | La URI en Google Cloud debe ser exactamente `http://localhost:3000/api/auth/google/callback` |
| `500` al primer request | Falta una variable en `.env.local` (JWT_SECRET ≥ 32 caracteres, GOOGLE_*, DATABASE_URL) |
| `409 El libro no está disponible` | Es el comportamiento esperado: el libro tiene un préstamo activo |
| `409` al borrar un libro/estudiante | Tiene préstamos asociados (integridad referencial): borre primero los préstamos |
