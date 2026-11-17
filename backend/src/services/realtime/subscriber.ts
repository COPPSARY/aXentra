import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../utils/logger.js";
import type { PostgresChangePayload, RealtimeChange } from "./types.js";

/** The Supabase client methods the subscriber uses; tests pass a stand-in. */
export type RealtimeClient = Pick<SupabaseClient, "channel" | "removeChannel">;

export interface RealtimeSubscriberOptions {
  supabaseClient: RealtimeClient;
  hasCredentials: () => boolean;
  logger: Pick<Logger, "info" | "warn">;
  channelName: string;
  tables: readonly string[];
  mapPostgresChange: (payload: PostgresChangePayload) => Promise<RealtimeChange | null>;
  onChange: (change: RealtimeChange) => unknown;
}

export class RealtimeSubscriber {
  supabaseClient: RealtimeClient;
  hasCredentials: () => boolean;
  logger: Pick<Logger, "info" | "warn">;
  channelName: string;
  tables: readonly string[];
  mapPostgresChange: RealtimeSubscriberOptions["mapPostgresChange"];
  onChange: RealtimeSubscriberOptions["onChange"];
  channel: RealtimeChannel | null;
  initialized: boolean;

  constructor({
    supabaseClient,
    hasCredentials,
    logger,
    channelName,
    tables,
    mapPostgresChange,
    onChange,
  }: RealtimeSubscriberOptions) {
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

  async handlePayload(payload: PostgresChangePayload) {
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
