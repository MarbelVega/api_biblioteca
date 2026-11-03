-- =====================================================================
--  biblioteca_ureal - Script Maestro de Seed (Base de Datos Semilla)
--  Materia: Base de Datos (SIS102-4) - Ingeniería de Sistemas
--  Plataforma: Supabase (PostgreSQL)
--  Semestre: Cuarto
--
--  PROPÓSITO
--  La base de datos semilla que se construye y mejora en cada laboratorio.
--  Este script crea el esquema completo y carga los datos de prueba que
--  se usan como punto de partida en todos los laboratorios.
--
--  CÓMO USARLO
--  1. Abrir Supabase -> SQL Editor.
--  2. Ejecutar este script UNA sola vez para inicializar la base.
--  3. Ejecutarlo de nuevo SOLO si se desea resetear los datos.
--
--  NOTA: Este script es la versión FINAL (normalizada) del esquema.
--  Al inicio del curso se construye de forma incremental laboratorio
--  a laboratorio; consulte el lab correspondiente para el recorrido
--  paso a paso.
-- =====================================================================

-- =====================================================================
-- 0. LIMPIEZA (idempotente: permite ejecutar el script varias veces)
-- =====================================================================
drop table if exists detalle_prestamo  cascade;
drop table if exists prestamo          cascade;
drop table if exists libro_autor       cascade;
drop table if exists libro             cascade;
drop table if exists categoria         cascade;
drop table if exists autor             cascade;
drop table if exists editorial         cascade;
drop table if exists estudiante        cascade;
drop table if exists carrera           cascade;
drop table if exists tipo_usuario      cascade;

-- =====================================================================
-- 1. TABLAS BASE
-- =====================================================================

-- Catálogo de carreras de la universidad
create table carrera (
  id_carrera  serial primary key,
  nombre      varchar(120) not null unique,
  sigla       varchar(10)  not null unique
);

-- Catálogo de tipos de usuario (estudiante, docente, administrativo)
create table tipo_usuario (
  id_tipo  serial primary key,
  nombre   varchar(40) not null unique
);

-- Estudiantes / usuarios de la biblioteca
create table estudiante (
  id_estudiante serial primary key,
  nombre        varchar(120) not null,
  apellido      varchar(120) not null,
  email         varchar(150) not null unique,
  id_carrera    integer references carrera(id_carrera),
  id_tipo       integer references tipo_usuario(id_tipo),
  activo        boolean not null default true,
  fecha_registro date not null default current_date
);

-- Catálogo de editoriales
create table editorial (
  id_editorial serial primary key,
  nombre       varchar(150) not null unique,
  pais         varchar(60)
);

-- Autores
create table autor (
  id_autor serial primary key,
  nombre   varchar(120) not null,
  pais     varchar(60)
);

-- Categorías temáticas de los libros
create table categoria (
  id_categoria serial primary key,
  nombre       varchar(80) not null unique
);

-- Libros
create table libro (
  id_libro      serial primary key,
  titulo        varchar(200) not null,
  anio          integer,
  isbn          varchar(30) unique,
  paginas       integer,
  id_categoria  integer references categoria(id_categoria),
  id_editorial  integer references editorial(id_editorial),
  disponible    boolean not null default true
);

-- Relación muchos a muchos: un libro puede tener varios autores
create table libro_autor (
  id_libro integer references libro(id_libro) on delete cascade,
  id_autor integer references autor(id_autor) on delete cascade,
  primary key (id_libro, id_autor)
);

-- Préstamos de libros
create table prestamo (
  id_prestamo     serial primary key,
  id_estudiante   integer not null references estudiante(id_estudiante),
  id_libro        integer not null references libro(id_libro),
  fecha_prestamo  date not null default current_date,
  fecha_devolucion date,
  estado          varchar(20) not null default 'prestado'
    check (estado in ('prestado','devuelto','vencido','perdido'))
);

-- =====================================================================
-- 2. DATOS DE PRUEBA (SEED)
-- =====================================================================

-- Carreras
insert into carrera(nombre, sigla) values
('Ingeniería de Sistemas','IS'),
('Ingeniería Industrial','II'),
('Administración de Empresas','ADM'),
('Contaduría Pública','CONT'),
('Derecho','DR');

-- Tipos de usuario
insert into tipo_usuario(nombre) values
('Estudiante'),
('Docente'),
('Administrativo');

-- Estudiantes
insert into estudiante(nombre, apellido, email, id_carrera, id_tipo) values
('Ana','López','ana.lopez@ureal.edu',1,1),
('Juan','Pérez','juan.perez@ureal.edu',2,1),
('María','García','maria.garcia@ureal.edu',3,1),
('Carlos','Ramírez','carlos.ramirez@ureal.edu',1,1),
('Lucía','Fernández','lucia.fernandez@ureal.edu',4,1),
('Pedro','Sánchez','pedro.sanchez@ureal.edu',5,2),
('Valeria','Torres','valeria.torres@ureal.edu',2,1),
('Diego','Flores','diego.flores@ureal.edu',1,3);

-- Editoriales
insert into editorial(nombre, pais) values
('Pearson','Estados Unidos'),
('McGraw-Hill','Estados Unidos'),
('Cengage Learning','Reino Unido'),
('Alfaomega','México'),
('O''Reilly','Estados Unidos');

-- Autores
insert into autor(nombre, pais) values
('Gabriel García Márquez','Colombia'),
('Mario Vargas Llosa','Perú'),
('Abraham Silberschatz','Estados Unidos'),
('Ramez Elmasri','Estados Unidos'),
('Thomas Connolly','Reino Unido'),
('C. J. Date','Reino Unido'),
('Isabel Allende','Chile'),
('Jorge Luis Borges','Argentina');

-- Categorías
insert into categoria(nombre) values
('Literatura'),
('Bases de Datos'),
('Programación'),
('Redes'),
('Matemáticas'),
('Administración'),
('Derecho');

-- Libros
insert into libro(titulo, anio, isbn, paginas, id_categoria, id_editorial) values
('Cien Años de Soledad',1967,'978-0-306-40615-7',417,1,4),
('La Ciudad y los Perros',1963,'978-0-452-28424-4',382,1,4),
('Fundamentos de Bases de Datos',2019,'978-0-07-802210-9',1272,2,2),
('Sistemas de Bases de Datos',2015,'978-1-292-06118-4',1444,2,3),
('Introducción a los Sistemas de Bases de Datos',2003,'978-0-321-19784-9',983,2,1),
('Database System Concepts',2019,'978-0-07-802215-9',1344,2,2),
('La Casa de los Espíritus',1982,'978-0-553-38001-0',368,1,3),
('Ficciones',1944,'978-0-7923-2788-9',174,1,4),
('Programación en C',2005,'978-0-13-110362-7',960,3,1),
('Redes de Computadoras',2015,'978-0-13-212695-3',960,4,1),
('Álgebra Lineal',2015,'978-0-321-94007-0',640,5,1),
('Administración Moderna',2010,'978-0-07-353012-1',650,6,2);

-- Relación libro-autor (muchos a muchos)
insert into libro_autor(id_libro, id_autor) values
(1,1),   -- Cien Años -> García Márquez
(2,2),   -- Ciudad y los Perros -> Vargas Llosa
(3,3),   -- Fundamentos de BD -> Silberschatz
(3,4),   -- Fundamentos de BD -> Elmasri
(4,5),   -- Sistemas de BD -> Connolly
(5,6),   -- Introducción BD -> Date
(6,3),   -- DB System Concepts -> Silberschatz
(7,7),   -- Casa de los Espíritus -> Allende
(8,8),   -- Ficciones -> Borges
(9,1),-- Programación en C (sin autor asignado)
(10,2),
(11,3),
(12,4);

-- Préstamos
insert into prestamo(id_estudiante, id_libro, fecha_prestamo, fecha_devolucion, estado) values
(1,1,'2026-03-02','2026-03-10','devuelto'),
(1,3,'2026-03-15',null,'prestado'),
(2,1,'2026-03-04','2026-03-12','devuelto'),
(3,2,'2026-02-20','2026-02-28','devuelto'),
(4,6,'2026-03-01','2026-03-15','devuelto'),
(5,4,'2026-03-10',null,'prestado'),
(1,8,'2026-02-10','2026-02-20','devuelto'),
(2,7,'2026-03-18',null,'prestado'),
(6,12,'2026-03-05',null,'vencido'),
(7,10,'2026-03-14',null,'prestado'),
(3,5,'2026-02-25','2026-03-06','devuelto'),
(4,11,'2026-03-20',null,'prestado');

-- =====================================================================
-- 3. VERIFICACIÓN
-- =====================================================================
-- Descomente las siguientes consultas para comprobar la carga de datos.

-- select 'Carreras', count(*) from carrera
-- union all select 'Estudiantes', count(*) from estudiante
-- union all select 'Libros', count(*) from libro
-- union all select 'Autores', count(*) from autor
-- union all select 'Préstamos', count(*) from prestamo;
