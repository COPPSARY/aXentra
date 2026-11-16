import { BadRequestError, ConflictError } from "./AppError.js";

export const parseExpectedVersion = (value: unknown, fieldName = "version"): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`${fieldName} must be a positive integer`);
  }

  return parsed;
};

export const throwOptimisticLockConflict = (resourceName: string): never => {
  throw new ConflictError(
    `${resourceName} was modified by another user. Please refresh and try again.`
  );
};
