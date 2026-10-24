import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser, getCurrentRoles, resolveAuthWithRoles } from "@/lib/auth/context";
import { getCurrentProfile, getSidebarData } from "@/lib/sidebar-data";
import { createSupabaseMock } from "../helpers/supabase-mock";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
// Use React's actual RSC cache implementation with a fresh request dispatcher.
// The default Node export intentionally does not cache outside an RSC render.
vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return require(require.resolve("react").replace(/index\.js$/, "react.react-server.js"));
});

type CacheDispatcher = { getCacheForType<T>(factory: () => T): T };
const internals = (React as unknown as {
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { A: CacheDispatcher | null };
}).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function newRequest(): void {
  const values = new Map<unknown, unknown>();
  internals.A = {
    getCacheForType<T>(factory: () => T): T {
      if (!values.has(factory)) values.set(factory, factory());
      return values.get(factory) as T;
    },
  };
}

function mockClient(roleError: unknown = null, roleRows: unknown = [
  { roles: { name: "会計", type: "accounting", accounting_group_id: null } },
]) {
  const mock = createSupabaseMock(() => ({ data: roleRows, error: roleError }));
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: "user-a", email: "1234567@ed.tus.ac.jp", user_metadata: {} } },
    error: null,
  });
  const client = { ...mock.client, auth: { ...mock.client.auth, getUser } };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return { ...mock, getUser };
}

beforeEach(() => {
  vi.clearAllMocks();
  newRequest();
});

describe("per-render auth snapshots", () => {
  it("shares concurrent auth and role calls in one render", async () => {
    const { client, getUser } = mockClient();
    const [authA, authB, rolesA, rolesB] = await Promise.all([
      getCurrentUser(), getCurrentUser(), getCurrentRoles(), getCurrentRoles(),
    ]);
    expect(authA).toBe(authB);
    expect(rolesA).toBe(rolesB);
    expect(rolesA.hasAccountingRole).toBe(true);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("user_roles");
  });

  it("fetches a new auth and role snapshot for each request", async () => {
    const { client, getUser } = mockClient();
    await getCurrentRoles();
    newRequest();
    getUser.mockResolvedValue({ data: { user: { id: "user-b", user_metadata: {} } }, error: null });
    expect((await getCurrentUser())?.profileId).toBe("user-b");
    await getCurrentRoles();
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it("throws on role lookup errors for every consumer instead of returning empty roles", async () => {
    const { client } = mockClient({ message: "database unavailable" }, null);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(getCurrentRoles()).rejects.toThrow("Role lookup failed");
      await expect(getCurrentRoles()).rejects.toThrow("Role lookup failed");
      expect(client.from).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it("preserves rejected auth errors", async () => {
    const { getUser, client } = mockClient();
    getUser.mockRejectedValue(new Error("auth unavailable"));
    await expect(getCurrentUser()).rejects.toThrow("auth unavailable");
    await expect(getCurrentRoles()).rejects.toThrow("auth unavailable");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated role consumers before querying roles", async () => {
    const { getUser, client } = mockClient();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getCurrentUser()).toBeNull();
    await expect(getCurrentRoles()).rejects.toThrow("Authentication required");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("keeps malformed role data fail-closed", async () => {
    mockClient(null, [{ roles: null }, { roles: { name: null, type: "unknown" } }]);
    const access = await getCurrentRoles();
    expect(access.isAdmin).toBe(false);
    expect(access.hasAccountingRole).toBe(false);
    expect(access.canManageMembers).toBe(false);
  });

  it("keeps action auth and roles fresh even within a render dispatcher", async () => {
    const { getUser, client } = mockClient();
    await getCurrentRoles();
    await resolveAuthWithRoles();
    await resolveAuthWithRoles();
    expect(getUser).toHaveBeenCalledTimes(3);
    expect(client.from).toHaveBeenCalledTimes(3);
  });
});


describe("server sidebar data", () => {
  function sidebarClient(failingTable?: string) {
    const mock = createSupabaseMock((call) => {
      if (call.table === failingTable) return { error: new Error("lookup failed") };
      if (call.table === "profiles") return { data: { name: "Member" } };
      if (call.table === "user_roles") return { data: [
        { roles: { name: "会計", type: "accounting", accounting_group_id: null } },
      ] };
      return { data: [{ id: "pending-id", name: "Pending", status: "pending" }] };
    });
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-a", user_metadata: {} } } });
    vi.mocked(createClient).mockResolvedValue({
      ...mock.client, auth: { ...mock.client.auth, getUser },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    return { ...mock, getUser };
  }

  it("shares profile and roles with page consumers and includes pending subsidies", async () => {
    const { calls, getUser } = sidebarClient();
    const [data, profileA, profileB, access] = await Promise.all([
      getSidebarData(), getCurrentProfile(), getCurrentProfile(), getCurrentRoles(),
    ]);
    expect(profileA).toBe(profileB);
    expect(data.userProfile?.full_name).toBe("Member");
    expect(data.roleNames).toEqual(["会計"]);
    expect(data.access).toBe(access);
    expect(data.pendingSubsidies[0].id).toBe("pending-id");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.table).sort()).toEqual(["profiles", "subsidy_items", "user_roles"]);
  });

  it.each(["profiles", "subsidy_items"])("propagates %s errors", async (table) => {
    sidebarClient(table);
    await expect(getSidebarData()).rejects.toThrow("lookup failed");
  });
});
