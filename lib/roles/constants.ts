export const ROLE_TYPES = {
  ADMIN: "admin",
  ACCOUNTING: "accounting",
  LEADER: "leader",
  GENERAL: "general",
} as const;

export type KnownRoleType = (typeof ROLE_TYPES)[keyof typeof ROLE_TYPES];
export type RoleType = KnownRoleType | (string & {});

export const ROLE_NAMES_JA = {
  ACCOUNTING: "会計",
  CHAIR: "部長",
  VICE_CHAIR: "副部長",
  PROVISIONAL_MEMBER: "仮部員",
  ALUMNI: "OB・OG",
} as const;

export type KnownRoleNameJa =
  (typeof ROLE_NAMES_JA)[keyof typeof ROLE_NAMES_JA];
export type RoleNameJa = KnownRoleNameJa | (string & {});

export const MANAGE_MEMBER_ROLE_NAMES = [
  ROLE_NAMES_JA.ACCOUNTING,
  ROLE_NAMES_JA.CHAIR,
  ROLE_NAMES_JA.VICE_CHAIR,
] as const;
