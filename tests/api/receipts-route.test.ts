import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks: session check and service-role storage client
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0000-4000-8000-00000000000a";
const SIGNED_URL =
  "https://project.supabase.co/storage/v1/object/sign/receipts/a.png?token=t";

type SignResult = { data: { signedUrl: string } | null; error: unknown };

const state = {
  authenticated: true,
  signResult: { data: { signedUrl: SIGNED_URL }, error: null } as SignResult,
};

const storageFrom = vi.fn();
const createSignedUrl = vi.fn();
const createAdminClient = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/utils/supabase/server", () => ({
  createAdminClient: () => createAdminClient(),
  createClient: async () => ({}),
}));

vi.mock("@/lib/auth/context", () => ({
  resolveAuthContext: async () =>
    state.authenticated
      ? { ok: true, context: { userId: USER_ID, profileId: USER_ID } }
      : { ok: false, error: "認証が必要です" },
}));

const { GET } = await import("@/app/api/receipts/route");
const { RECEIPT_SIGNED_URL_TTL_SECONDS } = await import("@/lib/receipt-signing");

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/receipts${query}`);
}

beforeEach(() => {
  state.authenticated = true;
  state.signResult = { data: { signedUrl: SIGNED_URL }, error: null };
  createSignedUrl.mockReset();
  createSignedUrl.mockImplementation(async () => state.signResult);
  storageFrom.mockReset();
  storageFrom.mockImplementation(() => ({ createSignedUrl }));
  createAdminClient.mockReset();
  createAdminClient.mockImplementation(() => ({
    storage: { from: storageFrom },
  }));
});

describe("GET /api/receipts", () => {
  it("returns 401 and signs nothing when unauthenticated", async () => {
    state.authenticated = false;

    const response = await GET(request(`?path=${USER_ID}/a.png`));

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("sign");
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("redirects an authenticated member to a short-lived signed URL", async () => {
    const response = await GET(
      request(`?path=${encodeURIComponent(`${USER_ID}/a.png`)}`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(SIGNED_URL);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(storageFrom).toHaveBeenCalledWith("receipts");
    expect(createSignedUrl).toHaveBeenCalledWith(
      `${USER_ID}/a.png`,
      RECEIPT_SIGNED_URL_TTL_SECONDS,
    );
  });

  it("lets any member open another member's or a legacy root file", async () => {
    const other = "b0000000-0000-4000-8000-00000000000b/x.pdf";
    expect((await GET(request(`?path=${encodeURIComponent(other)}`))).status).toBe(302);
    expect((await GET(request("?path=legacy.pdf"))).status).toBe(302);
  });

  it.each(["", "?path=", "?path=..%2Fsecret.png", "?path=%2Fa.png", "?path=a%2F%2Fb.png"])(
    "returns 400 without signing for invalid query %j",
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      expect(createSignedUrl).not.toHaveBeenCalled();
    },
  );

  it("returns 404 when the object does not exist", async () => {
    state.signResult = {
      data: null,
      error: { message: "Object not found", status: 400, statusCode: "404" },
    };

    const response = await GET(request("?path=missing.png"));

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("returns 502 without leaking storage details when signing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.signResult = {
      data: null,
      error: { message: "internal storage detail", status: 500 },
    };

    const response = await GET(request("?path=a.png"));

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("internal storage detail");
  });
});
