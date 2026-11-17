import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  findOrThrow,
} from "../utils/AppError.js";
import { AssetTypeRepository } from "../repositories/assetTypeRepository.js";
import { AssetTypeFieldRepository } from "../repositories/assetTypeFieldRepository.js";
import { generateFieldKey } from "../utils/fieldKeyGenerator.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { requirePermission } from "../utils/rbac.js";
import {
  assertActorCanAccessLocation,
  buildLocationScope,
  buildLocationScopeWithOptionalLocationId,
} from "../utils/locationScope.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { applyMappedUpdates } from "./updateHelpers.js";
import { ActivityLogService } from "./activityLogService.js";

function normalizeFieldLabel(label) {
  return label.trim().toLowerCase();
}

export class AssetTypeFieldService {
  static async listAssetTypeFields(assetTypeId, actor, query = {}) {
    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const locationScope = buildLocationScopeWithOptionalLocationId(
      actor,
      query.locationId
    );
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );

    const fields = await AssetTypeFieldRepository.listByAssetTypeId(
      normalizedAssetTypeId,
      locationScope
    );
    return {
      assetType,
      fields,
    };
  }

  static async createAssetTypeField(assetTypeId, payload, actor) {
    requirePermission(actor, "create", "assetTypeField");

    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const locationScope = buildLocationScope(actor);
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );

    const locationId = assertActorCanAccessLocation(
      actor,
      payload.locationId ?? assetType.locationId
    );
    if (assetType.locationId !== locationId) {
      throw new NotFoundError("Asset type not found");
    }

    const fieldLabel = payload.fieldLabel.trim();
    const fieldType = payload.fieldType;
    const isRequired = payload.isRequired ?? false;
    const sortOrder = payload.sortOrder ?? 0;
    const options = payload.options ?? null;

    // Auto-generate field_key from field_label
    const fieldKey = generateFieldKey(fieldLabel);
    if (!fieldKey) {
      throw new BadRequestError("Field label must contain at least one alphanumeric character");
    }

    const existingFields = await AssetTypeFieldRepository.listByAssetTypeId(
      normalizedAssetTypeId,
      locationScope
    );
    const normalizedFieldLabel = normalizeFieldLabel(fieldLabel);
    const duplicateLabel = existingFields.find(
      (f) => normalizeFieldLabel(f.fieldLabel) === normalizedFieldLabel
    );
    if (duplicateLabel) {
      throw new ConflictError(
        `Field label '${fieldLabel}' already exists in this asset type`
      );
    }

    // Check if field_key already exists
    const duplicateField = existingFields.find(
      (f) => f.fieldKey.toLowerCase() === fieldKey.toLowerCase()
    );
    if (duplicateField) {
      throw new ConflictError(`Field with key '${fieldKey}' already exists in this asset type`);
    }

    if (fieldType === "select") {
      if (!Array.isArray(options) || options.length === 0) {
        throw new BadRequestError("Select field type requires at least one option");
      }
    } else if (options !== null) {
      throw new BadRequestError("Options are only allowed when fieldType is select");
    }

    const created = await AssetTypeFieldRepository.create({
      assetTypeId: normalizedAssetTypeId,
      locationId,
      fieldKey,
      fieldLabel,
      fieldType,
      isRequired,
      options,
      sortOrder,
      createdBy: actor.userId,
    });

    await ActivityLogService.record({
      entityType: "asset_type_field",
      entityId: created.assetTypeFieldId,
      entityLabel: created.fieldLabel,
      action: "created",
      locationId: created.locationId,
      actor,
      metadata: {
        assetTypeId: created.assetTypeId,
        fieldKey: created.fieldKey,
        fieldType: created.fieldType,
      },
    });

    return created;
  }

  static async getAssetTypeField(assetTypeId, fieldId, actor) {
    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const locationScope = buildLocationScope(actor);
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );

    const normalizedFieldId = AssetValidation.toPositiveInteger(fieldId, "Asset type field id");
    const field = await AssetTypeFieldRepository.findById(normalizedFieldId, locationScope);
    if (!field || field.assetTypeId !== normalizedAssetTypeId) {
      throw new NotFoundError("Asset type field not found");
    }

    return field;
  }

  static async updateAssetTypeField(assetTypeId, fieldId, payload, actor) {
    requirePermission(actor, "update", "assetTypeField");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const existingField = await AssetTypeFieldService.getAssetTypeField(assetTypeId, fieldId, actor);
    const nextFieldType = payload.fieldType ?? existingField.fieldType;
    const nextOptions = Object.prototype.hasOwnProperty.call(payload, "options")
      ? payload.options
      : existingField.options;

    if (nextFieldType === "select") {
      if (!Array.isArray(nextOptions) || nextOptions.length === 0) {
        throw new BadRequestError("Select field type requires at least one option");
      }
    } else if (nextOptions !== null) {
      throw new BadRequestError("Options are only allowed when fieldType is select");
    }

    const updates = {
      updated_by: actor.userId,
    };

    // field_key is immutable - cannot be edited after creation
    if (payload.fieldKey !== undefined) {
      throw new BadRequestError("Field key cannot be modified after creation");
    }

    applyMappedUpdates(payload, updates, [
      {
        payloadKey: "fieldLabel",
        dbKey: "field_label",
        transform: (value) => value.trim(),
      },
      {
        payloadKey: "fieldType",
        dbKey: "field_type",
      },
      {
        payloadKey: "isRequired",
        dbKey: "is_required",
      },
      {
        payloadKey: "options",
        dbKey: "options_json",
        includeMode: "hasOwn",
      },
    ]);

    if (payload.fieldLabel !== undefined) {
      const nextFieldLabel = payload.fieldLabel.trim();
      const locationScope = buildLocationScope(actor);
      const existingFields = await AssetTypeFieldRepository.listByAssetTypeId(
        existingField.assetTypeId,
        locationScope
      );
      const normalizedNextFieldLabel = normalizeFieldLabel(nextFieldLabel);
      const duplicateLabel = existingFields.find(
        (field) =>
          field.assetTypeFieldId !== existingField.assetTypeFieldId &&
          normalizeFieldLabel(field.fieldLabel) === normalizedNextFieldLabel
      );

      if (duplicateLabel) {
        throw new ConflictError(
          `Field label '${nextFieldLabel}' already exists in this asset type`
        );
      }
    }

    const updated = await AssetTypeFieldRepository.update(
      existingField.assetTypeFieldId,
      updates,
      expectedVersion,
      buildLocationScope(actor)
    );

    await ActivityLogService.record({
      entityType: "asset_type_field",
      entityId: updated.assetTypeFieldId,
      entityLabel: updated.fieldLabel,
      action: "updated",
      locationId: updated.locationId,
      actor,
      metadata: {
        assetTypeId: updated.assetTypeId,
        changedFields: Object.keys(updates).filter((key) => key !== "updated_by"),
      },
    });

    return updated;
  }

  static async deleteAssetTypeField(assetTypeId, fieldId, actor) {
    requirePermission(actor, "delete", "assetTypeField");

    const field = await AssetTypeFieldService.getAssetTypeField(assetTypeId, fieldId, actor);
    const locationScope = buildLocationScope(actor);
    const assetType = await AssetTypeRepository.findById(field.assetTypeId, locationScope);
    const gridFieldIds = assetType?.gridFieldIds || [];
    const nextGridFieldIds = gridFieldIds.filter(
      (gridFieldId) => Number(gridFieldId) !== Number(field.assetTypeFieldId)
    );

    if (nextGridFieldIds.length !== gridFieldIds.length) {
      // ponytail: two writes; use a database transaction if atomic deletion becomes required.
      await AssetTypeRepository.update(
        assetType.assetTypeId,
        { gridFieldIds: nextGridFieldIds, updatedBy: actor.userId },
        assetType.version,
        locationScope
      );
    }

    const deleted = await AssetTypeFieldRepository.deleteById(
      field.assetTypeFieldId,
      locationScope
    );

    await ActivityLogService.record({
      entityType: "asset_type_field",
      entityId: field.assetTypeFieldId,
      entityLabel: field.fieldLabel,
      action: "deleted",
      locationId: field.locationId,
      actor,
      metadata: { assetTypeId: field.assetTypeId, fieldKey: field.fieldKey },
    });

    return deleted;
  }
}
