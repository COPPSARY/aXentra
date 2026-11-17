import { BadRequestError } from "./AppError.js";

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 10;

const normalizePositiveInteger = (value, fieldName, fallbackValue) => {
  if (value === undefined || value === null || `${value}`.trim() === "") {
    return fallbackValue;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new BadRequestError(`${fieldName} must be a positive integer`);
  }

  return normalized;
};

export const parsePaginationQuery = (
  query = {},
  {
    defaultPage = DEFAULT_PAGE,
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
  } = {}
) => {
  const page = normalizePositiveInteger(query.page, "page", defaultPage);
  const requestedLimit = normalizePositiveInteger(query.limit, "limit", defaultLimit);
  const limit = Math.min(requestedLimit, maxLimit);

  return {
    page,
    limit,
    ...getPaginationRange(page, limit),
  };
};

export const getPaginationRange = (page, limit) => ({
  from: (page - 1) * limit,
  to: page * limit - 1,
});

export const buildPaginatedResponse = ({
  items,
  totalItems,
  page,
  limit,
}) => {
  const normalizedTotalItems = Number(totalItems) || 0;
  const totalPages = normalizedTotalItems > 0 ? Math.ceil(normalizedTotalItems / limit) : 0;

  return {
    page,
    limit,
    totalItems: normalizedTotalItems,
    totalPages,
    pageItems: items.length,
    items,
  };
};
