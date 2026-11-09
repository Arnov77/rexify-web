// Umur token akses. Tidak ada refresh token: user login ulang setelah kedaluwarsa.
// Pencabutan lebih cepat tetap bisa lewat users.token_version (lihat authMiddleware).
export const JWT_EXPIRES_IN = '7d';
