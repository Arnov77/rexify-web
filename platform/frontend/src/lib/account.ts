import { apiRequest } from './api';

export interface ChangePasswordInput {
  // Kosong untuk akun Google-only yang baru membuat password pertama.
  currentPassword?: string;
  newPassword: string;
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return apiRequest<{ ok: boolean }>('/auth/password', {
    method: 'PATCH',
    body: {
      current_password: input.currentPassword,
      new_password: input.newPassword,
    },
  }).then(() => undefined);
}
