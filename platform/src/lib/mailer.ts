import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.zoho.com',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export type OtpMailType = 'verify' | 'reset';

// Satu fungsi untuk dua alur: subjek dan kalimat aksi menyesuaikan jenis OTP.
export async function sendOtpEmail(to: string, otp: string, type: OtpMailType): Promise<void> {
  const subject =
    type === 'verify' ? 'Kode Verifikasi Email Rexify' : 'Kode Reset Password Rexify';
  const action = type === 'verify' ? 'verifikasi email' : 'reset password';

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'Rexify <support@rexapi.my.id>',
    to,
    subject,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
  <h2 style="margin-bottom:8px">Rexify</h2>
  <p>Gunakan kode berikut untuk ${action}:</p>
  <div style="font-size:36px;font-weight:700;letter-spacing:12px;padding:24px;background:#f5f5f7;border-radius:8px;text-align:center;margin:24px 0">
    ${otp}
  </div>
  <p style="color:#666;font-size:14px">Kode berlaku 15 menit. Jangan bagikan kode ini ke siapapun.</p>
  <p style="color:#999;font-size:12px">Jika kamu tidak meminta kode ini, abaikan email ini.</p>
</div>`.trim(),
  });
}
