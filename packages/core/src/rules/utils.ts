import { type RuleViolation, BimValidationError } from './types.js';

export function assertNoViolations(violations: readonly RuleViolation[]): void {
  const fatal = violations.find((v) => v.severity !== 'warning');
  if (fatal) {
    throw new BimValidationError(fatal.code, fatal.message, { offendingIds: fatal.offendingIds });
  }
}
