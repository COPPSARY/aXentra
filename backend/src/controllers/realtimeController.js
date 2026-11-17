import { openRealtimeStream } from "../services/realtime/service.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const stream = wrapAsync(async (req, res) => {
  await openRealtimeStream(req, res, req.user);
});
