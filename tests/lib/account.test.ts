import { describe, it, expect } from "vitest";
import {
  deriveEntryYearYY,
  deriveInitialPassword,
  generateSecurePassword,
  deriveEmail,
  extractStudentNumberFromUser,
  createUserSchema,
} from "@/lib/account";

// ---------------------------------------------------------------------------
// deriveEntryYearYY
// ---------------------------------------------------------------------------

describe("deriveEntryYearYY", () => {
  it("extracts 2-digit entry year from 7-digit student number (digits 3-4)", () => {
    expect(deriveEntryYearYY("4623045")).toBe("23");
  });

  it("extracts entry year from another student number", () => {
    expect(deriveEntryYearYY("0119001")).toBe("19");
  });

  it("throws for non-7-digit input", () => {
    expect(() => deriveEntryYearYY("123456")).toThrow("学籍番号は7桁の数字です");
  });

  it("throws for empty string", () => {
    expect(() => deriveEntryYearYY("")).toThrow();
  });

  it("throws for alphabetic input", () => {
    expect(() => deriveEntryYearYY("abcdefg")).toThrow();
  });

  it("throws for 8-digit input", () => {
    expect(() => deriveEntryYearYY("12345678")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// deriveInitialPassword
// ---------------------------------------------------------------------------

describe("deriveInitialPassword", () => {
  it("derives password in format YYrc{studentNumber}", () => {
    expect(deriveInitialPassword("4623045")).toBe("23rc4623045");
  });

  it("derives password for another student number", () => {
    expect(deriveInitialPassword("0119001")).toBe("19rc0119001");
  });

  it("throws for invalid student number", () => {
    expect(() => deriveInitialPassword("123")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// generateSecurePassword
// ---------------------------------------------------------------------------

describe("generateSecurePassword", () => {
  it("returns a string of length 16", () => {
    const password = generateSecurePassword();
    expect(password).toHaveLength(16);
  });

  it("returns only base64url-safe characters", () => {
    const password = generateSecurePassword();
    // base64url uses A-Z, a-z, 0-9, -, _
    expect(password).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("generates different passwords on successive calls", () => {
    const passwords = new Set(
      Array.from({ length: 10 }, () => generateSecurePassword()),
    );
    // Extremely unlikely for 10 random 16-char passwords to collide
    expect(passwords.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// deriveEmail
// ---------------------------------------------------------------------------

describe("deriveEmail", () => {
  it("returns campus email when useCampusEmail is true", () => {
    expect(deriveEmail("1234567", true)).toBe("1234567@ed.tus.ac.jp");
  });

  it("returns placeholder email when useCampusEmail is false", () => {
    expect(deriveEmail("1234567", false)).toBe("1234567@no-mail.local");
  });
});

// ---------------------------------------------------------------------------
// extractStudentNumberFromUser
// ---------------------------------------------------------------------------

describe("extractStudentNumberFromUser", () => {
  it("extracts student number from user_metadata", () => {
    const user = {
      user_metadata: { student_number: "1234567" },
      email: "other@example.com",
    };
    expect(extractStudentNumberFromUser(user)).toBe("1234567");
  });

  it("falls back to email prefix when metadata is absent", () => {
    const user = {
      user_metadata: {},
      email: "1234567@ed.tus.ac.jp",
    };
    expect(extractStudentNumberFromUser(user)).toBe("1234567");
  });

  it("falls back to email prefix when metadata student_number is non-string", () => {
    const user = {
      user_metadata: { student_number: 1234567 },
      email: "7654321@ed.tus.ac.jp",
    };
    expect(extractStudentNumberFromUser(user)).toBe("7654321");
  });

  it("returns null when neither metadata nor email has student number", () => {
    const user = {
      user_metadata: {},
      email: "admin@example.com",
    };
    expect(extractStudentNumberFromUser(user)).toBeNull();
  });

  it("returns null for null user", () => {
    expect(extractStudentNumberFromUser(null)).toBeNull();
  });

  it("returns null when user_metadata is null", () => {
    const user = {
      user_metadata: null,
      email: "admin@example.com",
    };
    expect(extractStudentNumberFromUser(user)).toBeNull();
  });

  it("returns null when email is null", () => {
    const user = {
      user_metadata: {},
      email: null,
    };
    expect(extractStudentNumberFromUser(user)).toBeNull();
  });

  it("ignores invalid student number in metadata (wrong length)", () => {
    const user = {
      user_metadata: { student_number: "12345" },
      email: "7654321@ed.tus.ac.jp",
    };
    expect(extractStudentNumberFromUser(user)).toBe("7654321");
  });
});

// ---------------------------------------------------------------------------
// createUserSchema
// ---------------------------------------------------------------------------

describe("createUserSchema", () => {
  it("accepts valid user data", () => {
    const result = createUserSchema.safeParse({
      name: "Test User",
      student_number: "1234567",
      grade: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createUserSchema.safeParse({
      name: "",
      student_number: "1234567",
      grade: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid student number", () => {
    const result = createUserSchema.safeParse({
      name: "Test",
      student_number: "123",
      grade: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects grade 0", () => {
    const result = createUserSchema.safeParse({
      name: "Test",
      student_number: "1234567",
      grade: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects grade 5", () => {
    const result = createUserSchema.safeParse({
      name: "Test",
      student_number: "1234567",
      grade: 5,
    });
    expect(result.success).toBe(false);
  });

  it("defaults useCampusEmail to true", () => {
    const result = createUserSchema.safeParse({
      name: "Test",
      student_number: "1234567",
      grade: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.useCampusEmail).toBe(true);
    }
  });
});
