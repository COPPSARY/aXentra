/** A `LicenseLinkAsset` row as stored in the database. */
export interface LicenseLinkAssetRow {
  license_link_asset_id: number;
  asset_id: number;
  software_license_id: number;
  assigned_at: string | null;
  unassigned_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

/** Constructor input for `LicenseLinkAsset`. */
export interface LicenseLinkAssetProps {
  licenseLinkAssetId?: number | null;
  assetId: number;
  softwareLicenseId: number;
  assignedAt?: string | null;
  unassignedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
}

export class LicenseLinkAsset {
  /** Primary key. Unset only on an instance built for insert. */
  licenseLinkAssetId: number;
  assetId: number;
  softwareLicenseId: number;
  assignedAt: string | null;
  unassignedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: number | null;
  updatedBy: number | null;

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
  }: LicenseLinkAssetProps) {
    this.licenseLinkAssetId = licenseLinkAssetId as number;
    this.assetId = assetId;
    this.softwareLicenseId = softwareLicenseId;
    this.assignedAt = assignedAt;
    this.unassignedAt = unassignedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
  }

  static toInsertRow(link: LicenseLinkAssetProps) {
    return {
      asset_id: link.assetId,
      software_license_id: link.softwareLicenseId,
      created_by: link.createdBy,
      updated_by: link.updatedBy,
      ...(link.assignedAt ? { assigned_at: link.assignedAt } : {}),
      ...(link.unassignedAt ? { unassigned_at: link.unassignedAt } : {}),
    };
  }

  static fromRow(row: LicenseLinkAssetRow): LicenseLinkAsset;
  static fromRow(row: LicenseLinkAssetRow | null | undefined): LicenseLinkAsset | null;
  static fromRow(row: LicenseLinkAssetRow | null | undefined): LicenseLinkAsset | null {
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
