import { Link } from 'react-router-dom';
import LegalLayout from '../components/legal/LegalLayout';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
  LEGAL_JURISDICTION,
  LEGAL_REFUND,
} from '../lib/legal';

export default function Terms() {
  return (
    <LegalLayout
      title="Syarat dan Ketentuan"
      other={{ to: '/privacy', label: 'Kebijakan Privasi' }}
    >
      <section className="legal-section">
        <h2>1. Penerimaan ketentuan</h2>
        <p>
          Rexify dijalankan oleh {LEGAL_ENTITY} (selanjutnya
          disebut &quot;kami&quot;). Dengan membuat akun, masuk lewat Google, atau memakai layanan,
          kamu menyetujui ketentuan ini beserta{' '}
          <Link to="/privacy">Kebijakan Privasi</Link>. Kalau kamu tidak setuju, jangan memakai
          layanan.
        </p>
      </section>

      <section className="legal-section">
        <h2>2. Akun kamu</h2>
        <p>
          Akun bisa dibuat dengan email dan password, atau dengan akun Google. Satu akun dipakai
          untuk satu orang. Kamu bertanggung jawab menjaga akses ke email dan perangkatmu, karena
          seluruh bot di dalam akun dikendalikan dari situ.
        </p>
        <p>
          Data yang kamu isi harus benar. Kalau kamu memakai akun Google untuk masuk, kami memakai
          alamat email dari akun itu sebagai identitas akun di Rexify.
        </p>
      </section>

      <section className="legal-section">
        <h2>3. Layanan yang kami sediakan</h2>
        <p>
          Rexify menjalankan bot WhatsApp di server kami dan menyediakan dashboard untuk mengatur
          auto reply, sambutan, plugin command, limit, antilink, dan paket premium.
        </p>
        <p>
          Nomor WhatsApp dihubungkan lewat sesi perangkat tertaut, sama seperti memakai WhatsApp
          Web. Rexify bukan produk resmi WhatsApp dan tidak berafiliasi dengan WhatsApp atau Meta.
          Konsekuensinya: WhatsApp dapat membatasi atau memblokir nomor yang menjalankan bot, dan
          risiko itu ada di pihakmu.
        </p>
        <p>
          Layanan bergantung pada pihak lain (WhatsApp, Google, Midtrans, penyedia email, dan
          penyedia server). Gangguan di pihak tersebut bisa membuat bot berhenti sementara, dan
          kami tidak menjanjikan layanan selalu tersedia tanpa henti.
        </p>
      </section>

      <section className="legal-section">
        <h2>4. Paket, masa trial, dan pembayaran</h2>
        <p>
          Akun baru mendapat masa trial 7 hari sejak akun dibuat, dengan kuota 1 bot. Setelah masa
          itu, akun tanpa paket berbayar tidak bisa memakai layanan sampai paket diaktifkan.
        </p>
        <ul>
          <li>Free (trial): 1 bot, seluruh fitur berjalan dengan tanda air Rexify pada pesan bot.</li>
          <li>Pro: 2 bot, masa aktif 30 hari per pembelian, tanpa tanda air.</li>
          <li>Enterprise: 5 bot, masa aktif 30 hari per pembelian, tanpa tanda air.</li>
        </ul>
        <p>
          Nominal yang berlaku adalah harga yang tampil di halaman Billing saat kamu membayar.
          Pembayaran diproses Midtrans lewat QRIS atau GoPay. Setelah pembayaran lunas, masa aktif
          ditambahkan 30 hari, dihitung dari tanggal berakhir yang masih aktif bila ada.
        </p>
        <p>
          Pengembalian dana: {LEGAL_REFUND}
        </p>
      </section>

      <section className="legal-section">
        <h2>5. Kewajiban kamu</h2>
        <p>Dengan memakai Rexify, kamu setuju untuk tidak:</p>
        <ul>
          <li>mengirim pesan massal yang tidak diminta, spam, atau pesan berantai;</li>
          <li>memakai bot untuk penipuan, penipuan investasi, perjudian, atau konten yang melanggar hukum;</li>
          <li>melecehkan, mengancam, atau menyebarkan data pribadi orang lain;</li>
          <li>melanggar ketentuan layanan WhatsApp atau hak pihak lain;</li>
          <li>mencoba mengakses akun, bot, atau data milik pengguna lain;</li>
          <li>menyalahgunakan kuota, API key, atau mencoba menembus batas paket.</li>
        </ul>
        <p>
          Pelanggaran bisa membuat bot dihentikan atau akun ditangguhkan tanpa pengembalian dana.
        </p>
      </section>

      <section className="legal-section">
        <h2>6. Penangguhan dan penghentian</h2>
        <p>
          Kamu bisa berhenti kapan saja: hapus bot dari dashboard, atau minta penghapusan akun
          lewat <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
        <p>
          Kami bisa menangguhkan atau menutup akun yang melanggar ketentuan ini, dipakai untuk
          aktivitas ilegal, atau membahayakan layanan dan pengguna lain. Bila memungkinkan, kami
          memberi tahu alasannya lewat email akun.
        </p>
      </section>

      <section className="legal-section">
        <h2>7. Batasan tanggung jawab</h2>
        <p>
          Layanan disediakan sebagaimana adanya. Sejauh diizinkan hukum yang berlaku, kami tidak
          bertanggung jawab atas kehilangan pesan, kontak, atau riwayat chat di akun WhatsApp kamu,
          kehilangan keuntungan, atau kerugian tidak langsung lain yang timbul dari pemakaian
          layanan.
        </p>
        <p>
          Bila tanggung jawab kami tetap ada, nilainya dibatasi sebesar biaya berbayar yang kamu
          bayarkan ke Rexify dalam 3 bulan terakhir sebelum kejadian.
        </p>
      </section>

      <section className="legal-section">
        <h2>8. Perubahan ketentuan</h2>
        <p>
          Ketentuan ini bisa berubah mengikuti perkembangan fitur atau aturan yang berlaku.
          Perubahan penting kami beritahukan lewat email akun atau halaman dashboard, dan tanggal
          berlaku di bagian atas halaman ini ikut diperbarui. Memakai layanan setelah perubahan
          berarti kamu menyetujui versi terbaru.
        </p>
      </section>

      <section className="legal-section">
        <h2>9. Hukum yang berlaku dan kontak</h2>
        <p>
          Ketentuan ini tunduk pada hukum {LEGAL_JURISDICTION}. Pertanyaan tentang ketentuan ini
          bisa dikirim ke <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
