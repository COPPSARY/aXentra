import { vi, type Mock } from "vitest";

/**
 * `vi.mocked(fn)` for a function replaced by `vi.mock`, with an untyped
 * return value.
 *
 * Unit tests stub repositories and services with only the fields the code
 * under test reads, not whole rows, so their return values are deliberately
 * not checked. Calls into the code under test are still fully typed, which is
 * what catches a test drifting from a changed signature.
 */
export const stub = <T extends (...args: any[]) => unknown>(fn: T) =>
  vi.mocked(fn) as unknown as Mock<(...args: Parameters<T>) => any>;

/**
 * A model or input object with only the fields a test needs.
 *
 * The keys and values given are checked against `T`; the missing fields are
 * not, because the code under test does not read them.
 */
export const partial = <T>(value: Partial<T>): T => value as T;
