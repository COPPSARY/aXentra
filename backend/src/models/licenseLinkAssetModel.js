export class LicenseLinkAsset {
  constructor({
    licenseLinkAssetId = null,
    assetId,
    softwareLicenseId,
    assignedAt = null,
    unassignedAt = null,
    createdAt = null,
    updatedAt = null,
    createdBy = null,
    updatedBy = null,
  }) {
    this.licenseLinkAssetId = licenseLinkAssetId;
    this.assetId = assetId;
    this.softwareLicenseId = softwareLicenseId;
    this.assignedAt = assignedAt;
    this.unassignedAt = unassignedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
  }

  static toInsertRow(link) {
    return {
      asset_id: link.assetId,
      software_license_id: link.softwareLicenseId,
      created_by: link.createdBy,
      updated_by: link.updatedBy,
      ...(link.assignedAt ? { assigned_at: link.assignedAt } : {}),
      ...(link.unassignedAt ? { unassigned_at: link.unassignedAt } : {}),
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new LicenseLinkAsset({
      licenseLinkAssetId: row.license_link_asset_id,
      assetId: row.asset_id,
      softwareLicenseId: row.software_license_id,
      assignedAt: row.assigned_at,
      unassignedAt: row.unassigned_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    });
  }
}
