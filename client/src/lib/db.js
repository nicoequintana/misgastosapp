/**
 * Capa de acceso a datos (Data Access Layer) para Supabase.
 *
 * Este archivo es un barrel de re-export: la implementación real vive en
 * client/src/lib/db/*, dividida por dominio (R1 — ver mejoras.md). Se
 * mantiene como punto de entrada único para no romper los imports
 * existentes en el resto de la app (`import { x } from '../lib/db'`).
 *
 * Cada función interactúa con una tabla específica. Las políticas RLS
 * de Supabase filtran automáticamente por user_id en las consultas de
 * lectura/escritura. Para inserciones, pasamos el user_id explícitamente.
 *
 * Convención de errores: todas las funciones hacen throw del error
 * para que el llamador (service/hook) pueda manejarlo apropiadamente.
 */

export * from './db/expenses';
export * from './db/categories';
export * from './db/incomes';
export * from './db/recurringIncomes';
export * from './db/profile';
export * from './db/stats';
export * from './db/notifications';
export * from './db/groups/index';

// calcularAgregadosGastos es el único helper interno que era público en el
// archivo original (usado directamente en tests) — se re-exporta desde acá.
export { calcularAgregadosGastos } from './db/_helpers';
