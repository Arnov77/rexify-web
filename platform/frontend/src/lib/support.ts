import { LEGAL_CONTACT_EMAIL } from './legal';

// Kontak resmi untuk tombol bantuan. Isi tanpa spasi, tanpa tanda +, dan tanpa @.
// Kosong = kanal itu TIDAK dirender, supaya user tidak diarahkan ke nomor/akun yang salah.
export const SUPPORT_WHATSAPP = ''; // contoh: '6281234567890'
export const SUPPORT_TELEGRAM = ''; // contoh: 'rexify_support'

export type SupportChannelId = 'whatsapp' | 'telegram' | 'email';

export interface SupportChannel {
  id: SupportChannelId;
  label: string;
  href: string;
  // Dipakai sebagai title dan aria-label, jadi tombol tetap terbaca tanpa teks.
  hint: string;
}

// Email selalu ada karena alamatnya sudah dipakai halaman legal dan pengiriman OTP.
export function supportChannels(): SupportChannel[] {
  const channels: SupportChannel[] = [];

  if (SUPPORT_WHATSAPP) {
    channels.push({
      id: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/${SUPPORT_WHATSAPP}`,
      hint: `Chat WhatsApp ${SUPPORT_WHATSAPP}`,
    });
  }

  if (SUPPORT_TELEGRAM) {
    channels.push({
      id: 'telegram',
      label: 'Telegram',
      href: `https://t.me/${SUPPORT_TELEGRAM}`,
      hint: `Chat Telegram @${SUPPORT_TELEGRAM}`,
    });
  }

  channels.push({
    id: 'email',
    label: 'Email',
    href: `mailto:${LEGAL_CONTACT_EMAIL}`,
    hint: `Email ${LEGAL_CONTACT_EMAIL}`,
  });

  return channels;
}
