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
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  plan: string;
  trial_ends_at: Date | null;
  plan_expires_at: Date | null;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

