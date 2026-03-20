# Work Log: password-policy

## Summary
Replaced predictable student-number-based password derivation with cryptographically secure random password generation across all user creation and password reset flows. Added server-side password strength validation for user-initiated password changes.

## Tasks Completed
- [x] Task #5: Changed initial password generation from predictable `deriveInitialPassword()` to secure `generateSecurePassword()` using `crypto.randomBytes`. Updated all 4 call sites (admin create user, member add, admin reset, member reset). Generated passwords are now returned to the admin and displayed in a toast with extended duration.
- [x] Task #6: Added server-side password strength validation in `updateUserPassword()` requiring minimum 8 characters with at least one uppercase letter, one lowercase letter, and one digit.

## Files Modified
- `lib/account.ts`: Added `generateSecurePassword()` using `crypto.randomBytes(12).toString('base64url').slice(0, 16)`. Marked `deriveInitialPassword()` as `@deprecated`.
- `app/admin/create-user.ts`: Replaced `deriveInitialPassword` with `generateSecurePassword` in `adminCreateUser()`. Changed `adminResetPassword()` to no longer accept a password parameter - it generates one internally. Both functions now return the generated password.
- `app/admin/users/_components/reset-password-button.tsx`: Removed `studentNumber` prop and `deriveInitialPassword` import. Now calls `adminResetPassword(userId)` without a password argument. Displays the new generated password in a toast (15s duration).
- `app/admin/users/page.tsx`: Removed `studentNumber` prop from `<ResetPasswordButton>` usage.
- `app/members/manage/actions.ts`: Replaced `deriveInitialPassword` with `generateSecurePassword` in `addMember()` and `resetPasswordMember()`. Both now return the generated password. Removed unnecessary profile lookup in `resetPasswordMember()`.
- `app/members/manage/_components/manage-members-client.tsx`: Updated password reset success handler to display the new generated password in a toast (15s duration). Updated dialog text.
- `app/members/manage/_components/add-member-dialog.tsx`: Updated success handler to display the initial password in a toast (15s duration).
- `app/settings/actions.ts`: Added `validatePasswordStrength()` with checks for minimum 8 chars, uppercase, lowercase, and digit. Returns Japanese error message on failure.

## Key Decisions
- Kept `deriveInitialPassword` as deprecated rather than deleting, since it was referenced in 4 files and removal could break other branches. Marked with `@deprecated` JSDoc.
- Used `randomBytes(12).toString('base64url').slice(0, 16)` for secure password generation - produces URL-safe characters, 16 chars long, ~72 bits of entropy.
- Changed `adminResetPassword` signature from `(userId, newPassword)` to `(userId)` to prevent client-side password generation entirely - passwords are now always generated server-side.
- Used 15-second toast duration for displaying generated passwords so admins have time to copy them.

## Issues Encountered
- Found duplicate `createAdminClient()` call after editing `resetPasswordMember()` in `app/members/manage/actions.ts`. Fixed by removing the original call that was above the replaced block.
