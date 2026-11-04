-- Nomor input user saat membuat session + mode connect yang dipilih (SPEC § Session Connect).
-- phone_number_input: nomor mentah dari form, dipakai bot sebagai PHONE_NUMBER untuk pairing code.
-- phone_number: tetap diisi hasil konfirmasi Baileys setelah connect.

ALTER TABLE sessions ADD COLUMN phone_number_input TEXT;
ALTER TABLE sessions ADD COLUMN connect_mode TEXT NOT NULL DEFAULT 'qr';
