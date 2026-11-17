import { BadRequestError, ConflictError } from "./AppError.js";

export const parseExpectedVersion = (value: unknown, fieldName = "version"): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`${fieldName} must be a positive integer`);
  }

  return parsed;
};

// A function declaration (not an arrow) so callers get control-flow narrowing after it.
export function throwOptimisticLockConflict(resourceName: string): never {
  throw new ConflictError(
    `${resourceName} was modified by another user. Please refresh and try again.`
  );
}
