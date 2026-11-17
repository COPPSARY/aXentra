import { openRealtimeStream } from "../services/realtime/service.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor } from "../middleware/requestContext.js";

export const stream = wrapAsync(async (req, res) => {
  await openRealtimeStream(req, res, getActor(req));
});
