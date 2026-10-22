import { describe, expect, it } from "vitest";
import {
  buildRoleAccess,
  normalizeJoined,
  parseRoleAssignments,
  toRoleAssignment,
} from "@/lib/roles/parse";

const GROUP_ID = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

describe("normalizeJoined", () => {
  it("wraps an embedded object in an array", () => {
    expect(normalizeJoined({ name: "会計" })).toEqual([{ name: "会計" }]);
  });

  it("returns an embedded array as a copy", () => {
    const rows = [{ name: "a" }, { name: "b" }];
    const result = normalizeJoined(rows);
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it("returns an empty array for null and undefined", () => {
    expect(normalizeJoined(null)).toEqual([]);
    expect(normalizeJoined(undefined)).toEqual([]);
  });
});

describe("toRoleAssignment", () => {
  it("maps columns to the camelCase assignment", () => {
    expect(
      toRoleAssignment({ name: "leader", type: "leader", accounting_group_id: GROUP_ID }),
    ).toEqual({ name: "leader", type: "leader", accountingGroupId: GROUP_ID });
  });

  it("turns missing fields into values that match no known role", () => {
    expect(toRoleAssignment({})).toEqual({
      name: "",
      type: "",
      accountingGroupId: null,
    });
  });
});

describe("parseRoleAssignments", () => {
  it("flattens object, array and null relations", () => {
    const roles = parseRoleAssignments([
      { roles: { name: "会計", type: "accounting", accounting_group_id: null } },
      {
        roles: [
          { name: "leader", type: "leader", accounting_group_id: GROUP_ID },
          { name: "Local Admin", type: "admin", accounting_group_id: null },
        ],
      },
      { roles: null },
      {},
    ]);

    expect(roles).toEqual([
      { name: "会計", type: "accounting", accountingGroupId: null },
      { name: "leader", type: "leader", accountingGroupId: GROUP_ID },
      { name: "Local Admin", type: "admin", accountingGroupId: null },
    ]);
  });

  it("returns no roles for null or empty input", () => {
    expect(parseRoleAssignments(null)).toEqual([]);
    expect(parseRoleAssignments([])).toEqual([]);
  });
});

describe("buildRoleAccess", () => {
  it("detects admin by type and 会計 by name", () => {
    const access = buildRoleAccess([
      { name: "Local Admin", type: "admin", accountingGroupId: null },
      { name: "会計", type: "general", accountingGroupId: null },
    ]);

    expect(access.isAdmin).toBe(true);
    expect(access.hasAccountingRole).toBe(true);
  });

  it("does not treat a role named admin or typed accounting as those roles", () => {
    const access = buildRoleAccess([
      { name: "admin", type: "general", accountingGroupId: null },
      { name: "経理", type: "accounting", accountingGroupId: null },
    ]);

    expect(access.isAdmin).toBe(false);
    expect(access.hasAccountingRole).toBe(false);
  });

  it("grants member management to 部長 / 副部長 / 会計 and admin only", () => {
    const manager = (name: string) =>
      buildRoleAccess([{ name, type: "general", accountingGroupId: null }]);

    expect(manager("部長").canManageMembers).toBe(true);
    expect(manager("副部長").canManageMembers).toBe(true);
    expect(manager("会計").canManageMembers).toBe(true);
    expect(manager("仮部員").canManageMembers).toBe(false);
    expect(
      buildRoleAccess([{ name: "x", type: "admin", accountingGroupId: null }])
        .canManageMembers,
    ).toBe(true);
  });

  it("collects every role type per group", () => {
    const access = buildRoleAccess([
      { name: "general", type: "general", accountingGroupId: GROUP_ID },
      { name: "leader", type: "leader", accountingGroupId: GROUP_ID },
      { name: "会計", type: "accounting", accountingGroupId: null },
    ]);

    expect(access.groupRoleTypes).toEqual({ [GROUP_ID]: ["general", "leader"] });
  });

  it("returns an empty context for no roles", () => {
    expect(buildRoleAccess([])).toEqual({
      roles: [],
      isAdmin: false,
      hasAccountingRole: false,
      canManageMembers: false,
      groupRoleTypes: {},
    });
  });
});
