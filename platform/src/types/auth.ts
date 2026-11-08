export interface JWTPayload {
  userId: string;
  email: string;
  plan: string;
}

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
  trial_ends_at: Date | null;
  plan_expires_at: Date | null;
  email_verified: boolean;
  // false untuk akun yang hanya masuk lewat Google (password_hash NULL).
  has_password: boolean;
  // true kalau akun tertaut ke akun Google.
  has_google: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  // null untuk akun yang dibuat lewat Google (tidak punya password).
  password_hash: string | null;
  plan: string;
  trial_ends_at: Date | null;
  plan_expires_at: Date | null;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

