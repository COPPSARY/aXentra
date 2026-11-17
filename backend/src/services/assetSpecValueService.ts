import { BadRequestError, ConflictError, NotFoundError, findOrThrow } from "../utils/AppError.js";
import { AssetSpecValueRepository } from "../repositories/assetSpecValueRepository.js";
import { AssetTypeFieldRepository } from "../repositories/assetTypeFieldRepository.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { requirePermission } from "../utils/rbac.js";
import { buildLocationScope } from "../utils/locationScope.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { AssetService } from "./assetService.js";
import { ActivityLogService } from "./activityLogService.js";
import type { Actor } from "../types/auth.js";
import type {
  CreateAssetSpecValueInput,
  SpecValueInput,
  UpdateAssetSpecValueInput,
} from "../validators/assetSpecValue.js";

/** `Joi.date()` yields a `Date`; the column stores `YYYY-MM-DD`. */
const toDateColumn = (value: SpecValueInput["valueDate"]): string | undefined =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;

export class AssetSpecValueService {
  static async listAssetSpecValues(assetId: unknown, actor: Actor) {
    const asset = await AssetService.getAssetById(assetId, actor);
    const specs = await AssetSpecValueRepository.listByAssetId(asset.assetId);

    return {
      asset,
      specs,
    };
  }

  static async createAssetSpecValue(
    assetId: unknown,
    payload: CreateAssetSpecValueInput,
    actor: Actor
  ) {
    requirePermission(actor, "create", "assetSpecValue");

    const asset = await AssetService.getAssetById(assetId, actor);
    const field = await AssetTypeFieldRepository.findById(payload.fieldId, buildLocationScope(actor));
    if (!field || field.assetTypeId !== asset.assetTypeId || field.locationId !== asset.locationId) {
      throw new BadRequestError("Specification field does not belong to this asset type");
    }

    const existing = await AssetSpecValueRepository.findByAssetAndField({
      assetId: asset.assetId,
      fieldId: field.assetTypeFieldId,
    });
    if (existing) {
      throw new ConflictError("Specification value already exists for this field");
    }

    AssetValidation.assertFieldValueType(field, payload);

    const created = await AssetSpecValueRepository.create({
      assetId: asset.assetId,
      createdBy: actor.userId,
      spec: {
        fieldId: field.assetTypeFieldId,
        valueText:
          payload.valueText === undefined
            ? undefined
            : AssetValidation.normalizeNullableString(payload.valueText),
        valueNumber: payload.valueNumber,
        valueDate: toDateColumn(payload.valueDate),
        valueBoolean: payload.valueBoolean,
      },
    });

    await ActivityLogService.record({
      entityType: "asset_spec_value",
      entityId: created.assetSpecValueId,
      entityLabel: `${asset.assetName} · ${field.fieldLabel}`,
      action: "created",
      locationId: asset.locationId,
      actor,
      metadata: {
        assetId: asset.assetId,
        fieldId: field.assetTypeFieldId,
        fieldKey: field.fieldKey,
      },
    });

    return created;
  }

  static async getAssetSpecValue(assetSpecValueId: unknown, actor: Actor) {
    const normalizedSpecValueId = AssetValidation.toPositiveInteger(
      assetSpecValueId,
      "Asset specification value id"
    );
    const spec = await findOrThrow(
      () => AssetSpecValueRepository.findById(normalizedSpecValueId),
      "Asset specification value not found"
    );

    await AssetService.getAssetById(spec.assetId, actor);

    return spec;
  }

  static async updateAssetSpecValue(
    assetSpecValueId: unknown,
    payload: UpdateAssetSpecValueInput,
    actor: Actor
  ) {
    requirePermission(actor, "update", "assetSpecValue");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const spec = await AssetSpecValueService.getAssetSpecValue(assetSpecValueId, actor);
    const asset = await AssetService.getAssetById(spec.assetId, actor);
    const field = await AssetTypeFieldRepository.findById(spec.fieldId, buildLocationScope(actor));
    if (!field || field.assetTypeId !== asset.assetTypeId || field.locationId !== asset.locationId) {
      throw new BadRequestError("Specification field does not belong to this asset type");
    }

    AssetValidation.assertFieldValueType(field, payload);

    const updated = await AssetSpecValueRepository.update(spec.assetSpecValueId, {
      value_text:
        payload.valueText === undefined
          ? null
          : AssetValidation.normalizeNullableString(payload.valueText),
      value_number: payload.valueNumber ?? null,
      value_date: toDateColumn(payload.valueDate) ?? null,
      value_boolean: payload.valueBoolean ?? null,
      updated_by: actor.userId,
    }, expectedVersion);

    await ActivityLogService.record({
      entityType: "asset_spec_value",
      entityId: updated.assetSpecValueId,
      entityLabel: `${asset.assetName} · ${field.fieldLabel}`,
      action: "updated",
      locationId: asset.locationId,
      actor,
      metadata: {
        assetId: asset.assetId,
        fieldId: field.assetTypeFieldId,
        fieldKey: field.fieldKey,
      },
    });

    return updated;
  }

  static async deleteAssetSpecValue(assetSpecValueId: unknown, actor: Actor) {
    requirePermission(actor, "delete", "assetSpecValue");

    const spec = await AssetSpecValueService.getAssetSpecValue(assetSpecValueId, actor);
    const asset = await AssetService.getAssetById(spec.assetId, actor);
    const deleted = await AssetSpecValueRepository.deleteById(spec.assetSpecValueId);

    await ActivityLogService.record({
      entityType: "asset_spec_value",
      entityId: spec.assetSpecValueId,
      entityLabel: `${asset.assetName} · specification`,
      action: "deleted",
      locationId: asset.locationId,
      actor,
      metadata: { assetId: spec.assetId, fieldId: spec.fieldId },
    });

    return deleted;
  }
}
