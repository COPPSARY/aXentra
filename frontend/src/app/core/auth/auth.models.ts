export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface AuthUser {
  userId: string | number;
  username: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  name?: string;
  email?: string | null;
  avatarPic?: string | null;
  companyName?: string | null;
  role?: string;
  permissions?: string[];
  allowedLocationIds?: number[];
  userLocations?: Array<{
    locationId?: number;
    locationName?: string;
    name?: string;
  }>;
  version?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  profileId: number;
  userId?: string | number | null;
  fullName: string;
  locationId?: number | null;
  locationName?: string | null;
  phone?: string | null;
  department?: string | null;
  remark?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  version?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileCreatePayload {
  locationId: number;
  fullName: string;
  phone: string;
  department?: string | null;
  remark?: string | null;
}

export interface ProfileUpdatePayload {
  version: number;
  locationId?: number;
  fullName?: string;
  phone?: string;
  department?: string | null;
  remark?: string | null;
}

export interface UserCreatePayload {
  username: string;
  password: string;
  role: 'admin' | 'super_admin';
  locationIds?: number[];
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarPic?: string | null;
}

export interface UserUpdatePayload {
  username?: string;
  password?: string;
  role?: 'admin' | 'super_admin';
  locationIds?: number[];
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarPic?: string | null;
  version?: number | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ApiMessageResponse {
  message: string;
}
