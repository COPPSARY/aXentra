import { SearchService } from "../services/searchService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const search = wrapAsync(async (req, res) => {
  const data = await SearchService.search(req.user, req.query);
  res.status(200).json(data);
});
