import { SearchService, type SearchQuery } from "../services/searchService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor, getValidatedQuery } from "../middleware/requestContext.js";

export const search = wrapAsync(async (req, res) => {
  const data = await SearchService.search(getActor(req), getValidatedQuery<SearchQuery>(req));
  res.status(200).json(data);
});
