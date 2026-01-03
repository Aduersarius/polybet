# Format String Injection Fixes

## Overview
Fixed **format string injection** vulnerabilities identified by CodeQL in logging statements across the codebase.

## Severity: LOW
While these are valid security findings, the severity is LOW because:
- Values come from database (UUIDs, internal IDs), not direct user input
- Only affects log output, not code execution
- No security bypass or data exfiltration risk

## Why We Fixed It Anyway
✅ **Best practice** - Prevents future bugs if code changes
✅ **Code quality** - Follows secure coding standards
✅ **Silences warnings** - Removes CodeQL security alerts
✅ **Consistency** - All logging follows the same safe pattern

## Files Fixed

### 1. `lib/crypto-service.ts` (5 instances)
**Before:**
```typescript
console.error(`[WITHDRAWAL] Failed to create withdrawal request for user ${userId}:`, error);
console.error(`[WITHDRAWAL] Failed to update withdrawal status after successful transfer for ${withdrawalId}:`, dbError);
console.error(`[WITHDRAWAL] Withdrawal processing failed for ${withdrawalId}:`, error);
console.error(`[WITHDRAWAL] No balance found to refund for user ${withdrawal.userId}`);
console.error(`[WITHDRAWAL] CRITICAL: Failed to update withdrawal status and refund for ${withdrawalId}. Manual intervention required:`, refundError);
```

**After:**
```typescript
console.error('[WITHDRAWAL] Failed to create withdrawal request for user %s:', userId, error);
console.error('[WITHDRAWAL] Failed to update withdrawal status after successful transfer for %s:', withdrawalId, dbError);
console.error('[WITHDRAWAL] Withdrawal processing failed for %s:', withdrawalId, error);
console.error('[WITHDRAWAL] No balance found to refund for user %s', withdrawal.userId);
console.error('[WITHDRAWAL] CRITICAL: Failed to update withdrawal status and refund for %s. Manual intervention required:', withdrawalId, refundError);
```

### 2. `lib/event-image-blob.ts` (3 instances)
**Before:**
```typescript
console.error(`[SSRF] Failed to parse IP address ${address}:`, parseError);
console.error(`[Blob] SSRF protection blocked URL for ${eventId}: ${imageUrl}`);
console.error(`[Blob] Failed to upload image for event ${eventId}:`, error);
```

**After:**
```typescript
console.error('[SSRF] Failed to parse IP address %s:', address, parseError);
console.error('[Blob] SSRF protection blocked URL for %s: %s', eventId, imageUrl);
console.error('[Blob] Failed to upload image for event %s:', eventId, error);
```

### 3. `lib/hybrid-trading.ts` (1 instance)
**Before:**
```typescript
console.error(`[DEADLOCK] Detected deadlock for user ${userId}, event ${eventId}, option ${option}, side ${side}, amount ${amount}`);
```

**After:**
```typescript
console.error('[DEADLOCK] Detected deadlock for user %s, event %s, option %s, side %s, amount %s', userId, eventId, option, side, amount);
```

## The Vulnerability

### What is Format String Injection?
When using template literals in logging functions like `console.log()`, if a variable contains format specifiers (`%s`, `%d`, `%j`, etc.), it can cause:
- Garbled log output
- Missing information in logs
- Unexpected formatting behavior

### Example Attack (Theoretical)
```typescript
// Vulnerable
const userId = "%d%d%d";  // Malicious input
console.error(`Failed for user ${userId}`, someObject);
// Output: "Failed for user NaNNaNNaN" (someObject gets formatted as numbers)

// Fixed
console.error('Failed for user %s', userId, someObject);
// Output: "Failed for user %d%d%d" (literal string, then object)
```

## Pattern Used

### Old Pattern (Vulnerable)
```typescript
console.error(`Message with ${variable}`, additionalData);
```

### New Pattern (Safe)
```typescript
console.error('Message with %s', variable, additionalData);
```

## Verification

All instances fixed. Verified with:
```bash
grep -r "console\.error(\`.*\${" lib/
# No results found ✓
```

## Compliance

This fix addresses:
- **CWE-134** - Use of Externally-Controlled Format String
- **CodeQL Rule** - `js/tainted-format-string`

## Related Security Fixes

This was fixed alongside the **CRITICAL** SSRF vulnerability in `lib/event-image-blob.ts`. See `SSRF_PROTECTION.md` for details on that fix.

## Testing

No functional changes - logging output remains identical for normal operations. Only prevents potential format string issues if variables ever contain format specifiers.

## Author
Fixed: 2025-12-29
Security Level: **LOW** (Code Quality Improvement)
