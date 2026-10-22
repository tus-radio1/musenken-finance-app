import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fake Supabase client
// ---------------------------------------------------------------------------

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

type QueryCall = {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  filters: Array<[string, unknown]>;
  payload?: unknown;
};

type QueryHandler = (call: QueryCall) => QueryResult;

const events: string[] = [];

function createFakeClient(handler: QueryHandler) {
  const storageUpload = vi.fn(
    async (...args: [path: string, file: unknown, options?: unknown]) => {
      const [path] = args;
      events.push(`upload:${path}`);
      return { data: { path }, error: null };
    },
  );
  const storageRemove = vi.fn(async (paths: string[]) => {
    events.push(`remove:${paths.join(",")}`);
    return { data: [], error: null };
  });

  function from(table: string) {
    const call: QueryCall = { table, op: "select", filters: [] };
    const run = () => {
      if (call.op === "update") events.push(`update:${table}`);
      return Promise.resolve({
        data: null,
        error: null,
        count: null,
        ...handler(call),
      });
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return builder;
      },
      delete: () => {
        call.op = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      },
      is: () => builder,
      lte: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      single: run,
      maybeSingle: run,
      then: (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => run().then(resolve, reject),
    };
    return builder;
  }

  return {
    client: {
      from,
      storage: {
        from: () => ({ upload: storageUpload, remove: storageRemove }),
      },
    },
    storageUpload,
    storageRemove,
  };
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TX_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

const state: {
  admin: ReturnType<typeof createFakeClient>;
  user: ReturnType<typeof createFakeClient>;
  access: { isAdmin: boolean; hasAccountingRole: boolean; roles: unknown[] };
} = {} as never;

vi.mock("@/utils/supabase/server", () => ({
  createAdminClient: () => state.admin.client,
  createClient: async () => state.user.client,
}));

vi.mock("@/lib/auth/context", () => ({
  resolveAuthContext: async () => ({
    ok: true,
    context: {
      supabase: state.user.client,
      userId: USER_ID,
      profileId: USER_ID,
    },
  }),
  resolveAuthWithRoles: async () => ({
    ok: true,
    context: {
      supabase: state.user.client,
      userId: USER_ID,
      profileId: USER_ID,
    },
    access: state.access,
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  uploadRateLimiter: { check: () => ({ success: true, resetAt: 0 }) },
}));

vi.mock("@/lib/system-config", () => ({
  ACCOUNTING_USER_ID_FALLBACK: "accounting-fallback",
  getAccountingUserId: async () => "accounting-user",
}));

vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { uploadReceiptAction, updateTransaction, createTransaction } =
  await import("@/app/actions");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function makeFile(type: string, size = 1024, name = "photo.webp"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeUploadForm(file: File, extra: Record<string, string> = {}) {
  const formData = new FormData();
  formData.append("file", file);
  for (const [key, value] of Object.entries(extra)) {
    formData.append(key, value);
  }
  return formData;
}

const OLD_PATH = `${USER_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
const NEW_PATH = `${USER_ID}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;

const baseValues = {
  date: new Date("2026-05-01T00:00:00+09:00"),
  type: "expense" as const,
  amount: 1000,
  description: "テスト",
  accounting_group_id: GROUP_ID,
  financial_account_id: ACCOUNT_ID,
};

/** Default DB: one transaction owned by the caller, referencing OLD_PATH. */
function defaultUserHandler(overrides: { updateError?: unknown } = {}) {
  return (call: QueryCall): QueryResult => {
    if (call.table === "transactions" && call.op === "select") {
      return {
        data: {
          accounting_group_id: GROUP_ID,
          created_by: USER_ID,
          approval_status: "pending",
          amount: -1000,
          receipt_url: OLD_PATH,
        },
      };
    }
    if (call.table === "transactions" && call.op === "update") {
      // The action requires the conditional UPDATE to report exactly one row.
      return overrides.updateError
        ? { error: overrides.updateError }
        : { data: [{ id: TX_ID }] };
    }
    if (call.table === "fiscal_years") return { data: { year: 2026 } };
    // An open group, so the group rule (item 4) never blocks these receipt tests.
    if (call.table === "accounting_groups") {
      return { data: { id: GROUP_ID, type: "general" } };
    }
    return {};
  };
}

/** Admin client reference-count queries: no remaining references by default. */
function referenceCountHandler(referencedPaths: string[] = []) {
  return (call: QueryCall): QueryResult => {
    const value = call.filters[0]?.[1];
    return { count: referencedPaths.includes(String(value)) ? 1 : 0 };
  };
}

beforeEach(() => {
  events.length = 0;
  state.admin = createFakeClient(referenceCountHandler());
  state.user = createFakeClient(defaultUserHandler());
  state.access = { isAdmin: false, hasAccountingRole: false, roles: [] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// uploadReceiptAction
// ---------------------------------------------------------------------------

describe("uploadReceiptAction", () => {
  it("ignores a client-chosen fileName and stores under a server-generated per-user path", async () => {
    const formData = makeUploadForm(makeFile("image/webp"), {
      fileName: "victim-receipt.webp",
    });

    const result = await uploadReceiptAction(formData);

    expect(result).toMatchObject({ success: true });
    const uploadedPath = state.admin.storageUpload.mock.calls[0]?.[0];
    expect(uploadedPath).not.toBe("victim-receipt.webp");
    expect(uploadedPath).toMatch(new RegExp(`^${USER_ID}/${UUID_PATTERN}\\.webp$`));
    expect(result).toMatchObject({ filePath: uploadedPath });
  });

  it("never overwrites an existing object (upsert disabled)", async () => {
    await uploadReceiptAction(
      makeUploadForm(makeFile("image/webp"), { fileName: "x.webp" }),
    );

    const options = state.admin.storageUpload.mock.calls[0]?.[2] as
      | { upsert?: boolean; contentType?: string }
      | undefined;
    expect(options?.upsert).not.toBe(true);
    expect(options?.contentType).toBe("image/webp");
  });

  it("never deletes a client-supplied existingPath", async () => {
    const formData = makeUploadForm(makeFile("image/webp"), {
      fileName: "mine.webp",
      existingPath: "someone-else/receipt.webp",
    });

    await uploadReceiptAction(formData);

    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });

  it("derives the extension from the validated MIME type, not the file name", async () => {
    const formData = makeUploadForm(
      makeFile("application/pdf", 2048, "evil.html"),
    );

    const result = await uploadReceiptAction(formData);

    expect(result).toMatchObject({ success: true });
    expect(state.admin.storageUpload.mock.calls[0]?.[0]).toMatch(/\.pdf$/);
  });

  it("rejects a disallowed MIME type without uploading", async () => {
    const result = await uploadReceiptAction(
      makeUploadForm(makeFile("text/html")),
    );

    expect(result).toHaveProperty("error");
    expect(state.admin.storageUpload).not.toHaveBeenCalled();
  });

  it("rejects a file above the 10MB limit and accepts one at the limit", async () => {
    const tooLarge = await uploadReceiptAction(
      makeUploadForm(makeFile("application/pdf", 10 * 1024 * 1024 + 1)),
    );
    const atLimit = await uploadReceiptAction(
      makeUploadForm(makeFile("application/pdf", 10 * 1024 * 1024)),
    );

    expect(tooLarge).toHaveProperty("error");
    expect(atLimit).toMatchObject({ success: true });
    expect(state.admin.storageUpload).toHaveBeenCalledTimes(1);
  });

  it("rejects a request without a file", async () => {
    const result = await uploadReceiptAction(new FormData());

    expect(result).toHaveProperty("error");
    expect(state.admin.storageUpload).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTransaction / createTransaction receipt handling (B3 + ownership)
// ---------------------------------------------------------------------------

describe("updateTransaction receipt replacement", () => {
  it("removes the old receipt (read from the DB) only after the record update succeeds", async () => {
    const result = await updateTransaction(TX_ID, {
      ...baseValues,
      receipt_url: NEW_PATH,
    });

    expect(result).toEqual({ success: true });
    expect(state.admin.storageRemove).toHaveBeenCalledWith([OLD_PATH]);
    expect(events.indexOf("update:transactions")).toBeLessThan(
      events.indexOf(`remove:${OLD_PATH}`),
    );
  });

  it("keeps the old receipt when the record update fails", async () => {
    state.user = createFakeClient(
      defaultUserHandler({ updateError: { message: "boom" } }),
    );

    const result = await updateTransaction(TX_ID, {
      ...baseValues,
      receipt_url: NEW_PATH,
    });

    expect(result).toHaveProperty("error");
    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });

  it("keeps the old receipt when another record still references it", async () => {
    state.admin = createFakeClient(referenceCountHandler([OLD_PATH]));

    await updateTransaction(TX_ID, { ...baseValues, receipt_url: NEW_PATH });

    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });

  it("keeps the old receipt when the reference check fails", async () => {
    state.admin = createFakeClient(() => ({ error: { message: "db down" } }));

    await updateTransaction(TX_ID, { ...baseValues, receipt_url: NEW_PATH });

    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });

  it.each([
    ["a legacy unprefixed path", "legacy_receipt.webp"],
    ["another user's path", "99999999-9999-4999-8999-999999999999/x.webp"],
  ])("never deletes %s even when the record stored it", async (_label, stored) => {
    state.user = createFakeClient((call) =>
      call.table === "transactions" && call.op === "select"
        ? {
            data: {
              accounting_group_id: GROUP_ID,
              created_by: USER_ID,
              approval_status: "pending",
              amount: -1000,
              receipt_url: stored,
            },
          }
        : defaultUserHandler()(call),
    );

    const result = await updateTransaction(TX_ID, {
      ...baseValues,
      receipt_url: NEW_PATH,
    });

    expect(result).toEqual({ success: true });
    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });

  it("allows re-submitting an unchanged legacy path", async () => {
    state.user = createFakeClient((call) =>
      call.table === "transactions" && call.op === "select"
        ? {
            data: {
              accounting_group_id: GROUP_ID,
              created_by: USER_ID,
              approval_status: "pending",
              amount: -1000,
              receipt_url: "legacy_receipt.webp",
            },
          }
        : defaultUserHandler()(call),
    );

    const result = await updateTransaction(TX_ID, {
      ...baseValues,
      receipt_url: "legacy_receipt.webp",
    });

    expect(result).toEqual({ success: true });
    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });

  it("does not touch storage when the receipt is unchanged", async () => {
    await updateTransaction(TX_ID, { ...baseValues });

    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });

  it("rejects pointing the record at another user's storage object", async () => {
    const result = await updateTransaction(TX_ID, {
      ...baseValues,
      receipt_url: "99999999-9999-4999-8999-999999999999/victim.webp",
    });

    expect(result).toHaveProperty("error");
    expect(events).not.toContain("update:transactions");
    expect(state.admin.storageRemove).not.toHaveBeenCalled();
  });
});

describe("createTransaction receipt ownership", () => {
  it("accepts a receipt path in the caller's prefix", async () => {
    state.user = createFakeClient((call) =>
      call.table === "fiscal_years"
        ? { data: { year: 2026 } }
        : call.table === "accounting_groups"
          ? { data: { id: GROUP_ID, type: "general" } }
          : {},
    );

    const result = await createTransaction(baseValues, NEW_PATH, TX_ID);

    expect(result).toEqual({ success: true });
  });

  it("rejects a receipt path outside the caller's prefix", async () => {
    const result = await createTransaction(
      baseValues,
      "someone-else/receipt.webp",
      TX_ID,
    );

    expect(result).toHaveProperty("error");
  });
});
