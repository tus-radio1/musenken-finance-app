import { describe, expect, it } from "vitest";
import { isDelegableRole, planRoleSync } from "@/lib/roles/assignment";
import type { RoleAssignment } from "@/lib/roles/types";

const general = (name: string): RoleAssignment => ({
  name,
  type: "general",
  accountingGroupId: null,
});

const ROLES: Record<string, RoleAssignment> = {
  member: general("仮部員"),
  alumni: general("OB・OG"),
  admin: { name: "Local Admin", type: "admin", accountingGroupId: null },
};

describe("isDelegableRole", () => {
  it("accepts a plain global general role", () => {
    expect(isDelegableRole(general("仮部員"))).toBe(true);
  });

  it.each<[string, RoleAssignment | undefined]>([
    ["missing role", undefined],
    ["admin type", { name: "x", type: "admin", accountingGroupId: null }],
    ["accounting type", { name: "x", type: "accounting", accountingGroupId: null }],
    ["unknown type", { name: "x", type: "auditor", accountingGroupId: null }],
    ["group role", { name: "general", type: "general", accountingGroupId: "g" }],
    ["management name", general("副部長")],
  ])("rejects %s", (_label, role) => {
    expect(isDelegableRole(role)).toBe(false);
  });
});

describe("planRoleSync", () => {
  it("returns only the diff and deduplicates requested ids", () => {
    const plan = planRoleSync({
      actorIsAdmin: false,
      currentRoleIds: ["member", "admin"],
      requestedRoleIds: ["admin", "alumni", "alumni"],
      roleById: ROLES,
    });

    expect(plan).toEqual({ ok: true, toAdd: ["alumni"], toRemove: ["member"] });
  });

  it("rejects unknown requested ids, including prototype keys", () => {
    for (const id of ["nope", "constructor"]) {
      const plan = planRoleSync({
        actorIsAdmin: true,
        currentRoleIds: [],
        requestedRoleIds: [id],
        roleById: ROLES,
      });
      expect(plan).toEqual({ ok: false, reason: "unknown_role" });
    }
  });

  it("blocks a non-admin from adding or removing a protected role", () => {
    const add = planRoleSync({
      actorIsAdmin: false,
      currentRoleIds: [],
      requestedRoleIds: ["admin"],
      roleById: ROLES,
    });
    const remove = planRoleSync({
      actorIsAdmin: false,
      currentRoleIds: ["admin"],
      requestedRoleIds: [],
      roleById: ROLES,
    });

    expect(add).toEqual({ ok: false, reason: "protected_role" });
    expect(remove).toEqual({ ok: false, reason: "protected_role" });
  });

  it("allows an admin to change protected roles", () => {
    const plan = planRoleSync({
      actorIsAdmin: true,
      currentRoleIds: ["admin"],
      requestedRoleIds: [],
      roleById: ROLES,
    });

    expect(plan).toEqual({ ok: true, toAdd: [], toRemove: ["admin"] });
  });
});
