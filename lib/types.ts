/**
 * Shared application-level type definitions.
 *
 * ActionResult<T> models the discriminated-union return shape
 * used by all Server Actions in this app.
 */

/**
 * Standard return type for Server Actions.
 *
 * Success variant: `{ success: true }` with optional `data`, `filePath`, `initialPassword`.
 * Error variant: `{ error: string }`.
 */
export type ActionResult<T = void> =
  | ({ success: true } & (T extends void
      ? Record<string, never>
      : { data?: T }) & {
      filePath?: string;
      initialPassword?: string;
    })
  | { error: string };
