import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { FileModel, type FileModelRow } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type RowUpdates,
} from "./repositoryHelpers.js";

export class FileRepository {
  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
  }: {
    page?: number;
    limit?: number;
    locationScope?: LocationScope;
  } = {}) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("files")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("file_id", { ascending: false })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch paginated files");
    return {
      items: (data || []).map((row) => FileModel.fromRow(row)),
      totalItems: Number(count) || 0,
    };
  }

  static async create(file: FileModel) {
    const { data, error } = await supabase
      .from("files")
      .insert(file.toInsertRow())
      .select("*")
      .single<FileModelRow>();

    unwrapRepositoryError(error, "Failed to create file metadata");
    return FileModel.fromRow(data);
  }

  static async findById(fileId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("files")
      .select("*")
      .eq("file_id", fileId)
      .maybeSingle<FileModelRow>();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch file");
    return FileModel.fromRow(data);
  }

  static async update(
    fileId: number,
    updates: RowUpdates,
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
    let query = supabase
      .from("files")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("file_id", fileId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle<FileModelRow>();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update file");

    if (!data) {
      throwOptimisticLockConflict("File");
    }

    return FileModel.fromRow(data);
  }

  static async delete(fileId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("files")
      .delete()
      .eq("file_id", fileId);

    query = applyLocationScope(query, locationScope);

    const { error } = await query;
    unwrapRepositoryError(error, "Failed to delete file");
  }
}
