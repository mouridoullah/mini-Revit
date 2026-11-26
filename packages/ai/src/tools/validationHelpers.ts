import { ToolArgumentValidationError } from './ToolRegistry.js';

export const MAX_COORDINATE_MAGNITUDE_MM = 10_000_000;

export function asPlainObject(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ToolArgumentValidationError('Les paramètres de l’outil doivent être un objet JSON.');
  }
  return raw as Record<string, unknown>;
}

export function readRequiredString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new ToolArgumentValidationError(
      `Le paramètre requis "${key}" doit être une chaîne non vide.`,
    );
  }
  return val;
}

export function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new ToolArgumentValidationError(
      `Le paramètre optionnel "${key}" doit être une chaîne non vide.`,
    );
  }
  return val;
}

export function readOptionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'boolean') {
    throw new ToolArgumentValidationError(`Le paramètre optionnel "${key}" doit être un booléen.`);
  }
  return val;
}

export function readRequiredFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
  options?: { readonly min?: number; readonly max?: number },
): number {
  const val = obj[key];
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new ToolArgumentValidationError(
      `Le paramètre numérique requis "${key}" doit être un nombre fini.`,
    );
  }
  const min = options?.min ?? -MAX_COORDINATE_MAGNITUDE_MM;
  const max = options?.max ?? MAX_COORDINATE_MAGNITUDE_MM;
  if (val < min || val > max) {
    throw new ToolArgumentValidationError(
      `Le paramètre "${key}" (${val}) est hors bornes autorisées [${min}, ${max}].`,
    );
  }
  return val;
}

export function readOptionalFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
  options?: { readonly min?: number; readonly max?: number },
): number | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new ToolArgumentValidationError(
      `Le paramètre numérique optionnel "${key}" doit être un nombre fini.`,
    );
  }
  const min = options?.min ?? -MAX_COORDINATE_MAGNITUDE_MM;
  const max = options?.max ?? MAX_COORDINATE_MAGNITUDE_MM;
  if (val < min || val > max) {
    throw new ToolArgumentValidationError(
      `Le paramètre "${key}" (${val}) est hors bornes autorisées [${min}, ${max}].`,
    );
  }
  return val;
}

export function readOptionalEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const val = readOptionalString(obj, key);
  if (val === undefined) return undefined;
  if (!allowed.includes(val as T)) {
    throw new ToolArgumentValidationError(
      `Valeur invalide "${val}" pour "${key}". Valeurs autorisées : ${allowed.join(', ')}.`,
    );
  }
  return val as T;
}

export function normalizeDegrees(deg: number): number {
  const mod = ((deg % 360) + 360) % 360;
  return mod === 360 ? 0 : mod;
}
