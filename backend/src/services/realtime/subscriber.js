export class RealtimeSubscriber {
  constructor({
    supabaseClient,
    hasCredentials,
    logger,
    channelName,
    tables,
    mapPostgresChange,
    onChange,
  }) {
    if (!supabaseClient) {
      throw new Error("supabaseClient is required");
    }
    if (typeof hasCredentials !== "function") {
      throw new Error("hasCredentials is required");
    }
    if (!logger) {
      throw new Error("logger is required");
    }
    if (!Array.isArray(tables) || !tables.length) {
      throw new Error("tables are required");
    }
    if (typeof mapPostgresChange !== "function") {
      throw new Error("mapPostgresChange is required");
    }
    if (typeof onChange !== "function") {
      throw new Error("onChange is required");
    }

    this.supabaseClient = supabaseClient;
    this.hasCredentials = hasCredentials;
    this.logger = logger;
    this.channelName = channelName;
    this.tables = tables;
    this.mapPostgresChange = mapPostgresChange;
    this.onChange = onChange;
    this.channel = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!this.hasCredentials()) {
      this.logger.warn("Realtime service skipped because Supabase credentials are missing");
      return;
    }

    let channel = this.supabaseClient.channel(this.channelName);

    for (const table of this.tables) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        (payload) => {
          void this.handlePayload(payload);
        }
      );
    }

    this.channel = channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this.logger.info("Realtime service subscribed to Supabase changes");
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        this.logger.warn("Realtime service channel status changed", { status });
      }
    });

    this.initialized = true;
  }

  async handlePayload(payload) {
    const change = await this.mapPostgresChange(payload);
    if (!change) {
      return;
    }

    await this.onChange(change);
  }

  async shutdown() {
    this.initialized = false;

    if (!this.channel) {
      return;
    }

    await this.supabaseClient.removeChannel?.(this.channel);
    this.channel = null;
  }
}
