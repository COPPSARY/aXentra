import type { AssetStatus } from "../utils/constants.js";
import type { ImageBundleItem } from "../utils/imageBundle.js";

/** A `Asset` row as stored in the database. */
export interface AssetRow {
  asset_id: number;
  asset_name: string;
  product_id: number | null;
  asset_type_id: number;
  location_id: number;
  description: string | null;
  remark: string | null;
  mac_address: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  status: AssetStatus;
  loanable: boolean;
  warranty_expiry_date: string | null;
  loan_to_profile_id: number | null;
  file_id: number | null;
  display_image: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
  images: ImageBundleItem[];
}

/** Constructor input for `Asset`. */
export interface AssetProps {
  assetId?: number | null;
  assetName: string;
  productId?: number | null;
  assetTypeId: number;
  locationId: number;
  description?: string | null;
  remark?: string | null;
  macAddress?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  status: AssetStatus;
  loanable?: boolean;
  warrantyExpiryDate?: string | null;
  loanToProfileId?: number | null;
  fileId?: number | null;
  displayImage?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
  images?: ImageBundleItem[];
}

export class Asset {
  /** Primary key. Unset only on an instance built for insert. */
  assetId: number;
  assetName: string;
  productId: number | null;
  assetTypeId: number;
  locationId: number;
  description: string | null;
  remark: string | null;
  macAddress: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  status: AssetStatus;
  loanable: boolean;
  warrantyExpiryDate: string | null;
  loanToProfileId: number | null;
  fileId: number | null;
  displayImage: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;
  images: ImageBundleItem[];

  constructor({
    assetId = null,
    assetName,
    productId = null,
    assetTypeId,
    locationId,
    description = null,
    remark = null,
    macAddress = null,
    serialNumber = null,
    assetTag = null,
    status,
    loanable = true,
    warrantyExpiryDate = null,
    loanToProfileId = null,
    fileId = null,
    displayImage = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
    images = [],
  }: AssetProps) {
    this.assetId = assetId as number;
    this.assetName = assetName;
    this.productId = productId;
    this.assetTypeId = assetTypeId;
    this.locationId = locationId;
    this.description = description;
    this.remark = remark;
    this.macAddress = macAddress;
    this.serialNumber = serialNumber;
    this.assetTag = assetTag;
    this.status = status;
    this.loanable = loanable;
    this.warrantyExpiryDate = warrantyExpiryDate;
    this.loanToProfileId = loanToProfileId;
    this.fileId = fileId;
    this.displayImage = displayImage;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
    this.images = Array.isArray(images) ? images : [];
  }

  static toInsertRow(asset: AssetProps) {
    return {
      asset_name: asset.assetName,
      product_id: asset.productId,
      asset_type_id: asset.assetTypeId,
      location_id: asset.locationId,
      description: asset.description,
      remark: asset.remark,
      mac_address: asset.macAddress,
      serial_number: asset.serialNumber,
      asset_tag: asset.assetTag,
      status: asset.status,
      loanable: asset.loanable,
      warranty_expiry_date: asset.warrantyExpiryDate,
      loan_to_profile_id: asset.loanToProfileId,
      file_id: asset.fileId,
      display_image: asset.displayImage,
      created_by: asset.createdBy,
      updated_by: asset.updatedBy,
      images: asset.images,
    };
  }

  static fromRow(row: AssetRow): Asset;
  static fromRow(row: AssetRow | null | undefined): Asset | null;
  static fromRow(row: AssetRow | null | undefined): Asset | null {
    if (!row) {
      return null;
    }

    return new Asset({
      assetId: row.asset_id,
      assetName: row.asset_name,
      productId: row.product_id,
      assetTypeId: row.asset_type_id,
      locationId: row.location_id,
      description: row.description,
      remark: row.remark,
      macAddress: row.mac_address,
      serialNumber: row.serial_number,
      assetTag: row.asset_tag,
      status: row.status,
      loanable: row.loanable ?? null,
      warrantyExpiryDate: row.warranty_expiry_date,
      loanToProfileId: row.loan_to_profile_id ?? null,
      fileId: row.file_id,
      displayImage: row.display_image,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
      images: Array.isArray(row.images) ? row.images : [],
    });
  }
}
