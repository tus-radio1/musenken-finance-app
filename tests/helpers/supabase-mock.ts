/**
 * Minimal chainable Supabase client mock for Server Action tests.
 *
 * Every `from(table)` chain is recorded as a QueryCall (operation, payload and
 * filters) and resolved through the caller-supplied resolver when awaited.
 */

import { vi } from "vitest";

export type QueryOp = "select" | "insert" | "update" | "delete" | "upsert" | "rpc";

export type QueryCall = {
  table: string;
  op: QueryOp;
  payload?: unknown;
  filters: Array<{ method: string; args: unknown[] }>;
};

export type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

export type QueryResolver = (call: QueryCall) => QueryResult;

const OP_METHODS: readonly QueryOp[] = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
];

const FILTER_METHODS = [
  "eq",
  "neq",
  "is",
  "in",
  "lte",
  "lt",
  "range",
  "gte",
  "match",
  "order",
  "limit",
  "single",
  "maybeSingle",
] as const;

export function createSupabaseMock(resolve: QueryResolver) {
  const calls: QueryCall[] = [];

  const from = (table: string) => {
    const call: QueryCall = { table, op: "select", filters: [] };
    let opSet = false;
    calls.push(call);

    const builder: Record<string, unknown> = {};
    for (const op of OP_METHODS) {
      builder[op] = (payload?: unknown) => {
        // `.insert(...).select("id")` keeps the insert as the operation.
        if (!opSet) {
          call.op = op;
          if (op !== "select" && op !== "delete") call.payload = payload;
          opSet = true;
        }
        return builder;
      };
    }
    for (const method of FILTER_METHODS) {
      builder[method] = (...args: unknown[]) => {
        call.filters.push({ method, args });
        return builder;
      };
    }
    builder.then = (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const result = resolve(call);
      return Promise.resolve({ data: null, error: null, ...result }).then(
        onFulfilled,
        onRejected,
      );
    };
    return builder;
  };

  const authAdmin = {
    createUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    deleteUser: vi.fn(async () => ({ data: {}, error: null })),
  };

  const client = {
    from: vi.fn(from),
    rpc: vi.fn(async (name: string, params: Record<string, unknown>) => {
      const call: QueryCall = { table: name, op: "rpc", payload: params, filters: [] };
      calls.push(call);
      return { data: null, error: null, ...resolve(call) };
    }),
    auth: { admin: authAdmin },
  };

  return { client, calls, authAdmin };
}

/** Whether the chain applied a filter `method`, optionally on `column`. */
export function hasFilter(call: QueryCall, method: string, column?: string) {
  return call.filters.some(
    (f) => f.method === method && (column === undefined || f.args[0] === column),
  );
}

/** Value of the first `.eq(column, value)` filter, if any. */
export function eqValue(call: QueryCall, column: string): unknown {
  return call.filters.find((f) => f.method === "eq" && f.args[0] === column)
    ?.args[1];
}

export function writesTo(calls: readonly QueryCall[], table: string) {
  return calls.filter((c) => c.table === table && c.op !== "select");
}
