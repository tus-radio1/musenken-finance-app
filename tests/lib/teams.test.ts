import { describe, expect, it, vi } from "vitest";
import { buildRoleAccess } from "@/lib/roles/parse";
import type { RoleAssignment } from "@/lib/roles/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cache", () => ({ getAccountingGroups: vi.fn(async () => GROUPS) }));

const { selectVisibleTeams, getUserTeams } = await import("@/lib/teams");

const MINE = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const OTHER = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const OPEN = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const UNTYPED = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
const CLUB = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";
const RETIRED = "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6";

// Ordered by name, as getAccountingGroups returns them.
const GROUPS = [
  { id: MINE, name: "A班", is_active: true, type: "leader" },
  { id: OTHER, name: "B班", is_active: true, type: "leader" },
  { id: OPEN, name: "C全体", is_active: true, type: "general" },
  { id: UNTYPED, name: "D未分類", is_active: true, type: null },
  { id: CLUB, name: "部全体", is_active: true, type: "club" },
  { id: RETIRED, name: "Z旧班", is_active: false, type: "general" },
];

const role = (name: string, type: string, groupId: string | null = null): RoleAssignment => ({
  name,
  type,
  accountingGroupId: groupId,
});

const ids = (teams: Array<{ id: string }>) => teams.map((t) => t.id);

describe("selectVisibleTeams", () => {
  it("shows a member open groups first, then their own group", () => {
    const access = buildRoleAccess([role("general", "general", MINE)]);

    expect(ids(selectVisibleTeams(access, GROUPS))).toEqual([OPEN, UNTYPED, MINE]);
  });

  it("hides unrelated restricted groups and the club ledger from a leader", () => {
    const access = buildRoleAccess([role("leader", "leader", MINE)]);

    const teams = ids(selectVisibleTeams(access, GROUPS));
    expect(teams).not.toContain(OTHER);
    expect(teams).not.toContain(CLUB);
  });

  it.each(["部長", "副部長"])("shows %s the club ledger in getUserTeams", async (name) => {
    const access = buildRoleAccess([role(name, "general")]);
    expect(ids(await getUserTeams(access))).toEqual([MINE, OTHER, OPEN, UNTYPED, CLUB]);
  });

  it("shows 会計 and admins every active group including the club ledger", () => {
    for (const r of [role("会計", "accounting"), role("Local Admin", "admin")]) {
      expect(ids(selectVisibleTeams(buildRoleAccess([r]), GROUPS))).toEqual([
        MINE,
        OTHER,
        OPEN,
        UNTYPED,
        CLUB,
      ]);
    }
  });

  it("keeps the real group type", () => {
    const access = buildRoleAccess([role("会計", "accounting")]);

    const club = selectVisibleTeams(access, GROUPS).find((t) => t.id === CLUB);
    expect(club).toEqual({ id: CLUB, name: "部全体", type: "club" });
  });

  it("includes inactive groups only when asked (historical years)", () => {
    const access = buildRoleAccess([]);

    expect(ids(selectVisibleTeams(access, GROUPS))).not.toContain(RETIRED);
    expect(ids(selectVisibleTeams(access, GROUPS, { includeInactive: true }))).toContain(
      RETIRED,
    );
  });
});

describe("getUserTeams", () => {
  it("filters the cached groups for the given access", async () => {
    const access = buildRoleAccess([]);

    expect(ids(await getUserTeams(access))).toEqual([OPEN, UNTYPED]);
  });
});
