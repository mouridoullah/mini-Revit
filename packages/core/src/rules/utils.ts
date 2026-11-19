import { type RuleViolation, BimValidationError } from './types.js';

export function assertNoViolations(violations: readonly RuleViolation[]): void {
  const first = violations[0];
  if (first) {
    throw new BimValidationError(first.code, first.message, { offendingIds: first.offendingIds });
  }
}
