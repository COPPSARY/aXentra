export const unwrapRepositoryError = (error, context) => {
  if (!error) return;
  error.message = `${context}: ${error.message}`;
  throw error;
};

export const applyLocationScope = (query, locationScope, column = "location_id") => {
  if (!Array.isArray(locationScope)) {
    return query;
  }

  if (!locationScope.length) {
    return query.eq(column, -1);
  }

  return query.in(column, locationScope);
};
