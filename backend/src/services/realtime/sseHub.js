const DEFAULT_HEARTBEAT_INTERVAL_MS = 25000;
const DEFAULT_RETRY_MS = 3000;

export class SseHub {
  constructor({
    shouldDeliverEvent,
    refreshUserContext = null,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    retryMs = DEFAULT_RETRY_MS,
  }) {
    if (typeof shouldDeliverEvent !== "function") {
      throw new Error("shouldDeliverEvent is required");
    }

    this.shouldDeliverEvent = shouldDeliverEvent;
    this.refreshUserContext = refreshUserContext;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.retryMs = retryMs;
    this.clients = new Map();
    this.nextClientId = 1;
    this.heartbeatTimer = null;
  }

  openStream(req, res, user) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const clientId = this.nextClientId++;
    this.clients.set(clientId, { id: clientId, user, res });
    this.startHeartbeat();

    req.socket?.setKeepAlive?.(true);

    res.write(`retry: ${this.retryMs}\n\n`);
    this.writeEvent(res, "ready", {
      clientId,
      timestamp: new Date().toISOString(),
    });

    const closeHandler = () => {
      this.removeClient(clientId);
    };

    req.on("close", closeHandler);
    res.on("close", closeHandler);
  }

  removeClient(clientId) {
    this.clients.delete(clientId);
    if (!this.clients.size) {
      this.stopHeartbeat();
    }
  }

  closeUserStreams(userId) {
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return 0;
    }

    let closedCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      if (Number(client.user?.userId) !== normalizedUserId) {
        continue;
      }

      this.writeEvent(client.res, "session_closed", {
        reason: "logout",
        timestamp: new Date().toISOString(),
      });
      client.res.end?.();
      this.removeClient(clientId);
      closedCount += 1;
    }

    return closedCount;
  }

  async broadcastChange(change) {
    for (const client of this.clients.values()) {
      await this.refreshClientContextIfNeeded(client, change);

      if (!this.shouldDeliverEvent(client.user, change)) {
        continue;
      }

      this.writeEvent(client.res, "change", change);
    }
  }

  broadcastEvent(eventName, payload) {
    for (const client of this.clients.values()) {
      this.writeEvent(client.res, eventName, payload);
    }
  }

  startHeartbeat() {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      this.broadcastEvent("heartbeat", {
        timestamp: new Date().toISOString(),
      });
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeat() {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  shutdown() {
    this.stopHeartbeat();
    this.clients.clear();
    this.nextClientId = 1;
  }

  async refreshClientContextIfNeeded(client, change) {
    if (typeof this.refreshUserContext !== "function") {
      return;
    }

    const userId = Number(client.user?.userId);
    const changeUserId = Number(change?.userId);
    const isUserScopeEvent = change?.table === "users" || change?.table === "user_locations";

    if (!Number.isInteger(userId) || userId <= 0) {
      return;
    }

    if (!isUserScopeEvent || changeUserId !== userId) {
      return;
    }

    client.user = await this.refreshUserContext(client.user);
  }

  writeEvent(res, eventName, payload) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}
