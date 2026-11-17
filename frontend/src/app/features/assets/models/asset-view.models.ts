export type AssetStatus =
  | 'In Storage'
  | 'Loaned'
  | 'In Repair'
  | 'Damaged'
  | 'Lost'
  | 'Disposed';

export type AssetViewMode = 'list' | 'grid';

export interface AssetStatusCount {
  label: AssetStatus;
  value: number;
}

export type AssetCategoryIcon =
  | 'router'
  | 'switch'
  | 'accessPoint'
  | 'laptop'
  | 'desktop'
  | 'firewall'
  | 'monitor'
  | 'networkDevice'
  | 'projector'
  | 'printer'
  | 'server'
  | 'ups'
  | 'workstation'
  | 'creativeCloud'
  | 'microsoft'
  | 'figma'
  | 'video'
  | 'windows'
  | 'shield'
  | 'cad'
  | 'github';

export interface AssetCategoryCard {
  assetTypeId: number;
  name: string;
  total: number;
  icon: AssetCategoryIcon;
  iconSource?: 'builtIn' | 'initials' | 'uploaded';
  iconImageUrl?: string | null;
  iconInitials?: string;
  iconInitialsBg?: string;
  iconInitialsText?: string;
  statuses: AssetStatusCount[];
  favorite?: boolean;
}

export interface AssetTypeSummaryResponse {
  assetType: {
    assetTypeId: number;
    name: string;
    typeKey?: string | null;
    locationId?: number | null;
    gridFieldIds?: number[];
    fileId?: number | null;
    iconUrl?: string | null;
    imageUrl?: string | null;
    fileUrl?: string | null;
    createdBy?: number | null;
    updatedBy?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  totalItems: number;
  filteredItems: number;
  statusFilter: AssetStatus | null;
  statusCounts: Partial<Record<AssetStatus, number>>;
}

export interface AssetTypeRecord {
  assetTypeId: number;
  name: string;
  typeKey?: string | null;
  locationId?: number | null;
  gridFieldIds?: number[];
  version?: number | null;
}

export interface AssetRecord {
  assetId: number;
  assetName: string;
  locationId?: number | null;
  locationName?: string | null;
  productId: number | null;
  assetTypeId: number;
  description: string | null;
  remark: string | null;
  ipAddress: string | null;
  serialNumber: string | null;
  barcode: string | null;
  status: AssetStatus;
  loanable?: boolean | null;
  warrantyExpiryDate: string | null;
  assignedUserId: number | null;
  assignedUserName?: string | null;
  assignedUsername?: string | null;
  fileId: number | null;
  createdBy: number | null;
  createdByName?: string | null;
  createdByUsername?: string | null;
  updatedBy: number | null;
  updatedByName?: string | null;
  updatedByUsername?: string | null;
  version?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  displayImage?: string | null;
  images?: AssetAlbumItem[] | null;
}

export interface AssetAlbumItem {
  imageId?: string | number | null;
  fileName?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  order?: number | null;
  uploadedAt?: string | null;
  publicUrl?: string | null;
}

export type AssetGridSpecValue = string | number | boolean | null;

export interface AssetGridSpec {
  fieldId: number;
  fieldKey: string;
  label: string;
  value: AssetGridSpecValue;
  displayValue: string | null;
}

export interface AssetGridRecord extends AssetRecord {
  displayImage: string | null;
  images: AssetAlbumItem[];
  productName: string | null;
  gridSpecs: AssetGridSpec[];
}

export interface AssetTypeAssetsResponse extends AssetTypeSummaryResponse {
  productFilter?: number[] | null;
  page: number;
  limit: number;
  totalPages: number;
  pageItems: number;
  assets: AssetGridRecord[];
}

export type AssetTypeFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select';

export interface AssetTypeField {
  assetTypeFieldId: number;
  assetTypeId: number;
  fieldKey: string;
  fieldLabel: string;
  fieldType: AssetTypeFieldType;
  isRequired: boolean;
  options: string[] | null;
  sortOrder: number;
  version?: number | null;
  createdBy?: number | string | null;
  updatedBy?: number | string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AssetTypeFieldCreatePayload {
  fieldKey?: string;
  fieldLabel: string;
  fieldType: AssetTypeFieldType;
  locationId?: number;
  isRequired?: boolean;
  options?: string[] | null;
  sortOrder?: number;
}

export type AssetTypeFieldUpdatePayload = Partial<AssetTypeFieldCreatePayload> & {
  version?: number | null;
};

export interface AssetTypeFieldsResponse {
  assetType: {
    assetTypeId: number;
    name: string;
  };
  fields: AssetTypeField[];
}

export interface AssetSpecValue {
  assetSpecValueId: number;
  assetId: number;
  fieldId: number;
  version?: number | null;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  valueBoolean: boolean | null;
}

export interface AssetSpecsResponse {
  asset: AssetRecord;
  specs: AssetSpecValue[];
}

export interface AssetProduct {
  productId: number;
  assetTypeId: number;
  productName: string;
  manufacturer: string | null;
  cost: number;
  version?: number | null;
}

export interface AssetTypeProductsResponse {
  assetType: {
    assetTypeId: number;
    name: string;
  };
  products: AssetProduct[];
}

export interface AssetProductCreatePayload {
  locationId?: number;
  productName: string;
  manufacturer?: string | null;
  cost?: number;
}

export interface AssetTypeCreatePayload {
  name: string;
  locationId?: number;
}

export type AssetTypeUpdatePayload = Partial<AssetTypeCreatePayload> & {
  gridFieldIds?: number[];
  version?: number | null;
};

export interface AssetUpdatePayload {
  assetName?: string;
  version?: number | null;
  locationId?: number | null;
  productId?: number | null;
  description?: string | null;
  remark?: string | null;
  ipAddress?: string | null;
  serialNumber?: string | null;
  barcode?: string | null;
  status?: AssetStatus;
  loanable?: boolean;
  warrantyExpiryDate?: string | null;
  assignedUserId?: number | null;
  loanToUserId?: number | null;
  fileId?: number | null;
  displayImage?: File;
  albumImages?: File[];
  replaceImages?: boolean;
}

export interface AssetCreatePayload extends AssetUpdatePayload {
  assetTypeId: number;
  assetName: string;
  status: AssetStatus;
}

export type AssetProductUpdatePayload = Partial<AssetProductCreatePayload> & {
  version?: number | null;
};

export interface ActivityLogItem {
  activityLogId: number;
  occurredAt: string;
  entityType: string;
  entityId: number | null;
  entityLabel: string | null;
  action: string;
  status: string | null;
  locationId: number | null;
  locationName: string | null;
  actorUserId: number | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
}

export interface ActivityLogListResponse {
  activities: ActivityLogItem[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}
