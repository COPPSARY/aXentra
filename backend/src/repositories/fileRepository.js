import { supabase } from "../config/supabase.js";
import { FileModel } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { applyLocationScope, unwrapRepositoryError } from "./repositoryHelpers.js";

export class FileRepository {
  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
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
      items: (data || []).map(FileModel.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async create(file) {
    const { data, error } = await supabase
      .from("files")
      .insert(file.toInsertRow())
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to create file metadata");
    return FileModel.fromRow(data);
  }

  static async findById(fileId, locationScope = null) {
    let query = supabase
      .from("files")
      .select("*")
      .eq("file_id", fileId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch file");
    return FileModel.fromRow(data);
  }

  static async update(fileId, updates, expectedVersion, locationScope = null) {
    let query = supabase
      .from("files")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("file_id", fileId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update file");

    if (!data) {
      throwOptimisticLockConflict("File");
    }

    return FileModel.fromRow(data);
  }

  static async delete(fileId, locationScope = null) {
    let query = supabase
      .from("files")
      .delete()
      .eq("file_id", fileId);

    query = applyLocationScope(query, locationScope);

    const { error } = await query;
    unwrapRepositoryError(error, "Failed to delete file");
  }
}
