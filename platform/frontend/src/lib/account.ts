import { apiRequest } from './api';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Server menaikkan token_version saat password berubah, jadi token lama mati.
// Token pengganti dikembalikan supaya sesi yang sedang dipakai tetap jalan.
export function changePassword(input: ChangePasswordInput): Promise<string> {
  return apiRequest<{ ok: boolean; token: string }>('/auth/password', {
    method: 'PATCH',
    body: {
      current_password: input.currentPassword,
      new_password: input.newPassword,
    },
  }).then((data) => data.token);
}
