-- =====================================================================
--  Solicitudes de préstamo (autoservicio del lector).
--  El lector solicita un libro; el personal (bibliotecario/admin) la
--  aprueba (crea el préstamo) o la rechaza.
--
--  OJO: el seed (01_...) hace DROP ... CASCADE de libro/estudiante, lo que
--  elimina las FK de esta tabla. Si reinicia el seed, ejecute antes:
--     drop table if exists solicitud_prestamo;
--  y vuelva a correr este script.
-- =====================================================================
create table if not exists solicitud_prestamo (
  id_solicitud     serial primary key,
  id_estudiante    integer not null references estudiante(id_estudiante) on delete cascade,
  id_libro         integer not null references libro(id_libro) on delete cascade,
  estado           varchar(20) not null default 'pendiente'
                   check (estado in ('pendiente','aprobada','rechazada','cancelada')),
  nota             varchar(300),
  fecha_solicitud  timestamptz not null default now(),
  fecha_resolucion timestamptz,
  id_prestamo      integer references prestamo(id_prestamo) on delete set null,
  resuelto_por     uuid references app_user(id) on delete set null
);
-- Un estudiante no puede tener dos solicitudes pendientes del mismo libro
create unique index if not exists uq_solicitud_pendiente
  on solicitud_prestamo (id_estudiante, id_libro) where estado = 'pendiente';
create index if not exists idx_solicitud_estado on solicitud_prestamo (estado, fecha_solicitud);

-- El seed original deja libro.disponible = true aunque existan préstamos activos.
-- Sincroniza la bandera con los préstamos 'prestado'/'vencido'/'perdido' (idempotente).
update libro l set disponible = not exists (
  select 1 from prestamo p where p.id_libro = l.id_libro and p.estado <> 'devuelto');
