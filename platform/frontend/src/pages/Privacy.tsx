import { Link } from 'react-router-dom';
import LegalLayout from '../components/legal/LegalLayout';
import {
  LEGAL_ACCOUNT_RETENTION,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
} from '../lib/legal';

export default function Privacy() {
  return (
    <LegalLayout
      title="Kebijakan Privasi"
      other={{ to: '/terms', label: 'Syarat dan Ketentuan' }}
    >
      <section className="legal-section">
        <h2>1. Ringkasan</h2>
        <p>
          Rexify dijalankan oleh {LEGAL_ENTITY}. Kami
          mengumpulkan data yang diperlukan untuk menjalankan bot WhatsApp milikmu: identitas akun,
          setelan bot, kredensial sesi WhatsApp, log aktivitas plugin, dan catatan pembayaran. Kami
          tidak menjual data pengguna.
        </p>
        <p>
          Rincian lengkapnya ada di bawah. Ketentuan pemakaian layanan ada di{' '}
          <Link to="/terms">Syarat dan Ketentuan</Link>.
        </p>
      </section>

      <section className="legal-section">
        <h2>2. Data yang kami kumpulkan</h2>
        <p>Data akun:</p>
        <ul>
          <li>alamat email dan hash password (password asli tidak pernah disimpan);</li>
          <li>status verifikasi email, paket aktif, tanggal trial, dan tanggal berakhir paket;</li>
          <li>
            bila kamu masuk lewat Google: ID akun Google, alamat email, dan status verifikasi email
            dari Google.
          </li>
        </ul>
        <p>Data bot yang kamu buat:</p>
        <ul>
          <li>label bot, nomor WhatsApp yang kamu masukkan, nomor yang benar-benar terhubung, mode koneksi, status, dan waktu terhubung;</li>
          <li>kredensial sesi WhatsApp hasil tautan perangkat, disimpan di server tempat bot berjalan;</li>
          <li>
            setelan bot: auto reply, pesan sambutan, plugin yang aktif atau dimatikan, limit, daftar
            antilink, paket premium, prefix, zona waktu, serta API key dan token GitHub yang kamu
            isi sendiri.
          </li>
        </ul>
        <p>Data aktivitas:</p>
        <ul>
          <li>
            log plugin: nama plugin, pemicu, status, dan waktu. Kolom pemicu bisa memuat potongan
            pesan yang memicu plugin tersebut;
          </li>
          <li>log proses bot (keluaran teks program) di server bot, yang bisa kamu lihat lewat panel Console;</li>
          <li>riwayat perubahan setelan bot: jenis perubahan, detailnya, dan email akun yang mengubah.</li>
        </ul>
        <p>Data pembayaran:</p>
        <ul>
          <li>nomor pesanan, paket, nominal, status, metode pembayaran, dan tautan gambar QR;</li>
          <li>
            data instrumen pembayaran diproses Midtrans. Kami tidak menerima atau menyimpan nomor
            kartu, PIN, atau kode OTP bank.
          </li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>3. Untuk apa data dipakai</h2>
        <ul>
          <li>menjalankan bot dan menerapkan setelan yang kamu simpan;</li>
          <li>masuk ke akun, mengirim kode verifikasi email, dan memulihkan password;</li>
          <li>menagih paket berbayar dan memperpanjang masa aktif;</li>
          <li>menjaga keamanan layanan, termasuk mencatat perubahan setelan bot;</li>
          <li>menjawab pertanyaan dukungan yang kamu kirim;</li>
          <li>memenuhi kewajiban hukum yang berlaku.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>4. Pihak ketiga yang ikut memproses</h2>
        <ul>
          <li>Google, bila kamu memilih masuk dengan akun Google;</li>
          <li>Midtrans, untuk membuat dan memverifikasi pembayaran QRIS atau GoPay;</li>
          <li>penyedia layanan email, untuk mengirim kode verifikasi dan reset password;</li>
          <li>penyedia server dan basis data tempat platform serta bot berjalan;</li>
          <li>WhatsApp, karena bot berjalan di atas akun WhatsApp milikmu.</li>
        </ul>
        <p>
          Masing-masing pihak punya kebijakan privasi sendiri. Kami hanya mengirim data yang perlu
          untuk fungsi tersebut, misalnya nominal dan nomor pesanan ke Midtrans.
        </p>
      </section>

      <section className="legal-section">
        <h2>5. Cookie dan penyimpanan di browser</h2>
        <ul>
          <li>
            <span className="mono">rexify_google_state</span>: cookie sesi login Google, hanya
            berlaku 10 menit dan dihapus setelah kamu kembali ke aplikasi;
          </li>
          <li>
            <span className="mono">rexify-token</span>: token sesi di localStorage, berlaku 30 hari,
            dihapus saat kamu keluar;
          </li>
          <li>
            <span className="mono">rexify-theme</span>: pilihan mode gelap atau terang;
          </li>
          <li>
            <span className="mono">rexify.console.session</span>: ID bot yang panel Console-nya
            terakhir kamu buka.
          </li>
        </ul>
        <p>
          Kami tidak memakai cookie iklan atau pelacak pihak ketiga. Halaman memuat font Inter dan
          JetBrains Mono dari Google Fonts, sehingga Google menerima alamat IP browser saat font
          dimuat. Kalau browser memblokir localStorage, kamu tetap bisa masuk, hanya saja pilihan
          tema dan panel Console tidak tersimpan setelah halaman ditutup.
        </p>
      </section>

      <section className="legal-section">
        <h2>6. Masa simpan dan penghapusan</h2>
        <p>
          Data disimpan selama akun kamu aktif. Menghapus sebuah bot akan menghapus setelan, log
          plugin, dan kredensial sesi WhatsApp bot tersebut dari server, sehingga bot itu perlu
          ditautkan ulang kalau dibuat kembali.
        </p>
        <p>
          Untuk menghapus seluruh akun, kirim permintaan ke{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. Setelah
          diverifikasi, data akun dihapus dalam {LEGAL_ACCOUNT_RETENTION}. Salinan di cadangan
          berkala bisa masih ada sampai siklus cadangan berikutnya selesai.
        </p>
      </section>

      <section className="legal-section">
        <h2>7. Keamanan</h2>
        <ul>
          <li>password dan kode verifikasi email disimpan sebagai hash, bukan teks asli;</li>
          <li>sesi login memakai token bertanda tangan dengan masa berlaku terbatas;</li>
          <li>akses ke basis data dibatasi dan memakai koneksi terenkripsi;</li>
          <li>
            API key dan token yang kamu isi di setelan bot disimpan di basis data dan ditulis ke
            berkas konfigurasi bot, jadi isi hanya kredensial yang memang ingin dipakai bot.
          </li>
        </ul>
        <p>
          Tidak ada sistem yang sepenuhnya bebas risiko. Kalau kamu menduga akunmu dipakai orang
          lain, segera ganti password dan hubungi kami.
        </p>
      </section>

      <section className="legal-section">
        <h2>8. Hak kamu</h2>
        <p>
          Kamu berhak meminta salinan data akunmu, meminta perbaikan data yang keliru, meminta
          penghapusan, atau menanyakan cara data dipakai. Kirim permintaan ke{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. Kami bisa meminta
          bukti kepemilikan akun sebelum memproses permintaan.
        </p>
      </section>

      <section className="legal-section">
        <h2>9. Anak-anak</h2>
        <p>
          Layanan ini bukan untuk anak di bawah 13 tahun. Kami tidak sengaja mengumpulkan data anak.
          Kalau kamu mengetahui ada akun anak di layanan ini, hubungi kami supaya datanya dihapus.
        </p>
      </section>

      <section className="legal-section">
        <h2>10. Perubahan kebijakan dan kontak</h2>
        <p>
          Kebijakan ini bisa berubah mengikuti fitur baru atau aturan yang berlaku. Perubahan
          penting kami beritahukan lewat email akun atau halaman dashboard, dan tanggal berlaku di
          bagian atas halaman ikut diperbarui.
        </p>
        <p>
          Pertanyaan tentang data pribadi bisa dikirim ke{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
