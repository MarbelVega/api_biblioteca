import { z } from 'zod';
import type { Resource } from './crud';
import { HttpError } from './http';

const ALL = ['admin', 'bibliotecario', 'lector'] as const;
const STAFF = ['admin', 'bibliotecario'] as const;
const ADMIN = ['admin'] as const;

const str = (max: number) => z.string().trim().min(1).max(max);
const optStr = (max: number) => z.string().trim().max(max).nullable().optional();
const fk = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');
const catalogAccess = { read: [...ALL], write: [...STAFF], remove: [...ADMIN] };

const resources: Record<string, Resource> = {
  carreras: {
    table: 'carrera', pk: 'id_carrera',
    schema: z.object({ nombre: str(120), sigla: str(10) }),
    sortable: ['id_carrera', 'nombre', 'sigla'], searchable: ['nombre', 'sigla'],
    access: catalogAccess,
  },
  'tipos-usuario': {
    table: 'tipo_usuario', pk: 'id_tipo',
    schema: z.object({ nombre: str(40) }),
    sortable: ['id_tipo', 'nombre'], searchable: ['nombre'],
    access: catalogAccess,
  },
  estudiantes: {
    table: 'estudiante', pk: 'id_estudiante',
    schema: z.object({
      nombre: str(120), apellido: str(120),
      email: z.string().trim().toLowerCase().email().max(150),
      id_carrera: fk.nullable().optional(), id_tipo: fk.nullable().optional(),
      activo: z.boolean().optional(), fecha_registro: date.optional(),
    }),
    sortable: ['id_estudiante', 'nombre', 'apellido', 'email', 'fecha_registro'],
    searchable: ['nombre', 'apellido', 'email'], filterable: ['id_carrera', 'id_tipo', 'activo'],
    // Datos personales: solo personal de biblioteca
    access: { read: [...STAFF], write: [...STAFF], remove: [...ADMIN] },
  },
  editoriales: {
    table: 'editorial', pk: 'id_editorial',
    schema: z.object({ nombre: str(150), pais: optStr(60) }),
    sortable: ['id_editorial', 'nombre', 'pais'], searchable: ['nombre', 'pais'], filterable: ['pais'],
    access: catalogAccess,
  },
  autores: {
    table: 'autor', pk: 'id_autor',
    schema: z.object({ nombre: str(120), pais: optStr(60) }),
    sortable: ['id_autor', 'nombre', 'pais'], searchable: ['nombre', 'pais'], filterable: ['pais'],
    access: catalogAccess,
  },
  categorias: {
    table: 'categoria', pk: 'id_categoria',
    schema: z.object({ nombre: str(80) }),
    sortable: ['id_categoria', 'nombre'], searchable: ['nombre'],
    access: catalogAccess,
  },
  libros: {
    table: 'libro', pk: 'id_libro',
    schema: z.object({
      titulo: str(200),
      anio: z.number().int().min(0).max(new Date().getFullYear() + 1).nullable().optional(),
      isbn: optStr(30),
      paginas: z.number().int().positive().nullable().optional(),
      id_categoria: fk.nullable().optional(), id_editorial: fk.nullable().optional(),
      disponible: z.boolean().optional(),
      autores: z.array(fk).max(50).optional(), // N:M → libro_autor
    }),
    virtual: ['autores'],
    sortable: ['id_libro', 'titulo', 'anio', 'paginas'], searchable: ['titulo', 'isbn'],
    filterable: ['id_categoria', 'id_editorial', 'disponible', 'anio'],
    selectSql: `select t.*, coalesce((
        select json_agg(json_build_object('id_autor', a.id_autor, 'nombre', a.nombre) order by a.nombre)
          from libro_autor la join autor a on a.id_autor = la.id_autor
         where la.id_libro = t.id_libro), '[]'::json) as autores
      from libro t`,
    access: catalogAccess,
    afterWrite: async (c, id, d) => {
      if (d.autores === undefined) return;
      await c.query('delete from libro_autor where id_libro = $1', [id]);
      const ids = [...new Set<number>(d.autores)];
      if (ids.length) {
        await c.query('insert into libro_autor (id_libro, id_autor) select $1, unnest($2::int[])', [id, ids]);
      }
    },
  },
  prestamos: {
    table: 'prestamo', pk: 'id_prestamo',
    schema: z.object({
      id_estudiante: fk, id_libro: fk,
      fecha_prestamo: date.optional(), fecha_devolucion: date.nullable().optional(),
      estado: z.enum(['prestado', 'devuelto', 'vencido', 'perdido']).optional(),
    }),
    sortable: ['id_prestamo', 'fecha_prestamo', 'fecha_devolucion', 'estado'],
    filterable: ['id_estudiante', 'id_libro', 'estado'],
    access: { read: [...ALL], write: [...STAFF], remove: [...ADMIN] },
    // Un lector solo ve sus propios préstamos (se enlaza por correo con `estudiante`)
    scope: (user, param) =>
      user.role === 'lector'
        ? `t.id_estudiante in (select id_estudiante from estudiante where lower(email) = lower(${param(user.email)}))`
        : null,
    beforeCreate: async (c, d) => {
      const { rows } = await c.query('select disponible from libro where id_libro = $1 for update', [d.id_libro]);
      if (!rows[0]) throw new HttpError(422, 'El libro indicado no existe');
      if (!rows[0].disponible) throw new HttpError(409, 'El libro no está disponible');
    },
    beforeUpdate: async (_c, prev, d) => {
      if (d.estado === 'devuelto' && d.fecha_devolucion === undefined && !prev.fecha_devolucion) {
        d.fecha_devolucion = new Date().toISOString().slice(0, 10);
      }
    },
    // Mantiene libro.disponible sincronizado con el estado del préstamo
    afterWrite: async (c, id, _d, prev) => {
      const { rows } = await c.query('select id_libro, estado from prestamo where id_prestamo = $1', [id]);
      const cur = rows[0];
      if (prev && prev.id_libro !== cur.id_libro) {
        await c.query('update libro set disponible = true where id_libro = $1', [prev.id_libro]);
      }
      await c.query('update libro set disponible = $2 where id_libro = $1', [cur.id_libro, cur.estado === 'devuelto']);
    },
  },
};

export function getResource(slug: string): Resource {
  const r = Object.prototype.hasOwnProperty.call(resources, slug) ? resources[slug] : undefined;
  if (!r) throw new HttpError(404, 'Recurso no encontrado');
  return r;
}
export const resourceNames = Object.keys(resources);
