import { useEffect, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  IconCpu,
  IconDownload,
  IconGear,
  IconHeart,
  IconLink,
  IconPersonPlus,
  IconRobot,
  type IconProps,
} from '../components/icons';
import { useAuth } from '../lib/auth';
import { withViewTransition } from '../lib/viewTransition';
import Logo from '../components/Logo';
import '../styles/landing.css';

const STEPS = [
  {
    num: '01',
    title: 'Daftar',
    text: 'Buat akun Rexify gratis. Cukup email dan password.',
  },
  {
    num: '02',
    title: 'Hubungkan WA',
    text: 'Scan QR atau pakai pairing code untuk menghubungkan nomor WhatsApp kamu.',
  },
  {
    num: '03',
    title: 'Bot jalan',
    text: 'Atur auto reply, plugin, dan fitur lainnya langsung dari dashboard web.',
  },
];

interface Feature {
  icon: ComponentType<IconProps>;
  tone: string;
  title: string;
  text: string;
}

const FEATURES: Feature[] = [
  {
    icon: IconRobot,
    tone: 'primary',
    title: 'Auto Reply',
    text: 'Balas pesan otomatis sesuai keyword yang kamu tentukan.',
  },
  {
    icon: IconCpu,
    tone: 'info',
    title: 'AI Chat',
    text: 'Bot bisa menjawab pertanyaan pakai AI, kapan saja.',
  },
  {
    icon: IconDownload,
    tone: 'success',
    title: 'Downloader',
    text: 'Download video atau audio langsung dari link yang dikirim.',
  },
  {
    icon: IconLink,
    tone: 'danger',
    title: 'Anti Link',
    text: 'Hapus link di grup otomatis supaya chat tetap bersih.',
  },
  {
    icon: IconPersonPlus,
    tone: 'warning',
    title: 'Pesan Sambutan',
    text: 'Sambut anggota baru di grup dengan pesan otomatis.',
  },
  {
    icon: IconGear,
    tone: 'primary',
    title: 'Mudah Dikonfigurasi',
    text: 'Atur semua fitur lewat dashboard web, tanpa sentuh kode.',
  },
];

interface Plan {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Trial',
    price: 'Gratis',
    period: '7 hari',
    features: ['1 bot', 'Semua fitur dasar', 'Masa aktif 7 hari'],
    cta: 'Mulai Gratis',
  },
  {
    name: 'Pro',
    price: 'Rp 5.000',
    period: '/bulan',
    features: ['2 bot', 'Semua fitur', 'Masa aktif 30 hari'],
    cta: 'Pilih Pro',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Rp 10.000',
    period: '/bulan',
    features: ['5 bot', 'Semua fitur', 'Masa aktif 30 hari'],
    cta: 'Pilih Enterprise',
  },
];

const FAQS = [
  {
    q: 'Rexify itu apa?',
    a: 'Tempat menjalankan bot WhatsApp tanpa menyentuh kode atau menyewa server sendiri. Kamu hubungkan nomor, lalu atur auto reply, AI chat, downloader, anti link, dan pesan sambutan dari satu dashboard.',
  },
  {
    q: 'Apakah Rexify resmi dari WhatsApp?',
    a: 'Bukan. Rexify pihak ketiga dan tidak berafiliasi dengan WhatsApp maupun Meta. Nomor terhubung lewat sesi perangkat tertaut, sama seperti saat memakai WhatsApp Web.',
  },
  {
    q: 'Bagaimana cara menghubungkan bot?',
    a: 'Daftar akun, buat bot di dashboard, lalu masukkan nomor WhatsApp. Tautkan lewat QR atau pairing code dari menu Perangkat Tertaut. Bot langsung aktif setelah terhubung.',
  },
  {
    q: 'Apakah data saya aman?',
    a: 'Sesi disimpan terenkripsi di server dan hanya dipakai untuk menjalankan bot milikmu. Kamu bisa memutus perangkat kapan saja dari dashboard atau langsung dari aplikasi WhatsApp.',
  },
  {
    q: 'Apakah nomor saya bisa diblokir WhatsApp?',
    a: 'Risiko itu ada pada semua bot WhatsApp tidak resmi, terutama kalau dipakai spam atau blast ke banyak nomor asing. Pakai sewajarnya, dan sebaiknya mulai dengan nomor cadangan.',
  },
  {
    q: 'Apakah bot aktif 24 jam?',
    a: 'Ya. Bot berjalan di server kami sehingga tetap aktif walau HP kamu mati atau kehabisan baterai, selama nomor WhatsApp masih tertaut.',
  },
  {
    q: 'Berapa bot yang bisa saya hubungkan?',
    a: 'Mengikuti paket yang kamu ambil: Trial 1 bot, Pro 2 bot, Enterprise 5 bot. Butuh slot tambahan? Upgrade kapan saja lewat dashboard tanpa mengulang pengaturan bot.',
  },
];

// Fade-in halus saat elemen masuk viewport.
function useRevealOnScroll() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

interface TransitionLinkProps {
  to: string;
  className?: string;
  children: ReactNode;
}

// Link yang memicu animasi transisi halaman sebelum navigasi.
function TransitionLink({ to, className, children }: TransitionLinkProps) {
  const navigate = useNavigate();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Biarkan perilaku default untuk klik tengah / modifier (buka tab baru).
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    withViewTransition(() => navigate(to));
  }

  return (
    <Link to={to} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useRevealOnScroll();

  // Sudah login: jangan tampilkan landing, langsung ke dashboard.
  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-container landing-nav__inner">
          <Link className="landing-brand" to="/">
            <Logo className="landing-brand__logo" />
            Rexify
          </Link>

          <div className="landing-nav__actions">
            <TransitionLink className="landing-btn landing-btn--ghost" to="/login">
              Masuk
            </TransitionLink>
            <TransitionLink className="landing-btn landing-btn--primary" to="/register">
              Coba Gratis
            </TransitionLink>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="landing-container hero__inner">
            <div className="hero__copy">
              <h1 className="hero__title">
                Bikin bot WhatsApp sendiri. Tanpa coding, tanpa ribet.
              </h1>
              <p className="hero__sub">
                Hubungkan nomor WhatsApp kamu, atur fiturnya, dan bot kamu langsung jalan.
                Semudah itu.
              </p>

              <div className="hero__cta">
                <TransitionLink className="landing-btn landing-btn--primary landing-btn--lg" to="/register">
                  Mulai Gratis 7 Hari
                </TransitionLink>
              </div>
            </div>
          </div>
        </section>
        <section className="landing-section" id="cara-kerja">
          <div className="landing-container">
            <div className="landing-section__head" data-reveal>
              <span className="landing-eyebrow">Cara kerja</span>
              <h2 className="landing-section__title">Tiga langkah, bot langsung jalan</h2>
              <p className="landing-section__sub">
                Tidak perlu install apa pun di komputer kamu. Semua dari browser.
              </p>
            </div>

            <div className="steps">
              {STEPS.map((step) => (
                <div className="step" key={step.num} data-reveal>
                  <span className="step__num">{step.num}</span>
                  <h3 className="step__title">{step.title}</h3>
                  <p className="step__text">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" id="fitur">
          <div className="landing-container">
            <div className="landing-section__head" data-reveal>
              <span className="landing-eyebrow">Fitur</span>
              <h2 className="landing-section__title">Semua yang bot kamu butuhkan</h2>
              <p className="landing-section__sub">
                Fitur siap pakai, tinggal nyalakan dari dashboard.
              </p>
            </div>

            <div className="features">
              {FEATURES.map(({ icon: Icon, tone, title, text }) => (
                <div className="feature" key={title} data-reveal>
                  <span className={`feature__icon feature__icon--${tone}`} aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <h3 className="feature__title">{title}</h3>
                  <p className="feature__text">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" id="harga">
          <div className="landing-container">
            <div className="landing-section__head" data-reveal>
              <span className="landing-eyebrow">Harga</span>
              <h2 className="landing-section__title">Mulai gratis, upgrade kalau butuh</h2>
              <p className="landing-section__sub">Coba semua fitur selama 7 hari.</p>
            </div>

            <div className="pricing">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={plan.popular ? 'price-card price-card--popular' : 'price-card'}
                  data-reveal
                >
                  {plan.popular && <span className="price-card__badge">Paling Populer</span>}
                  <h3 className="price-card__name">{plan.name}</h3>
                  <p className="price-card__price">
                    {plan.price} <span>{plan.period}</span>
                  </p>
                  <ul className="price-card__list">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <div className="price-card__cta">
                    <TransitionLink
                      className="landing-btn landing-btn--primary landing-btn--block"
                      to="/register"
                    >
                      {plan.cta}
                    </TransitionLink>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" id="faq">
          <div className="landing-container">
            <div className="landing-section__head" data-reveal>
              <span className="landing-eyebrow">FAQ</span>
              <h2 className="landing-section__title">Pertanyaan yang sering diajukan</h2>
              <p className="landing-section__sub">
                Belum ketemu jawabannya? Hubungi kami lewat dashboard setelah daftar.
              </p>
            </div>

            <div className="faq">
              {FAQS.map((item, index) => {
                const open = openFaq === index;
                return (
                  <div
                    className={open ? 'faq-item faq-item--open' : 'faq-item'}
                    key={item.q}
                    data-reveal
                  >
                    <button
                      type="button"
                      className="faq-item__question"
                      aria-expanded={open}
                      aria-controls={`faq-answer-${index}`}
                      onClick={() => setOpenFaq(open ? null : index)}
                    >
                      {item.q}
                      <span className="faq-item__icon" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </button>
                    <div
                      className="faq-item__answer"
                      id={`faq-answer-${index}`}
                      aria-hidden={!open}
                    >
                      <div className="faq-item__answer-inner">
                        <p>{item.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <section className="cta-band">
        <div className="landing-container cta-band__inner" data-reveal>
          <div>
            <h2 className="cta-band__title">Siap punya bot WhatsApp sendiri?</h2>
            <p className="cta-band__sub">Gratis 7 hari.</p>
          </div>
          <TransitionLink className="landing-btn landing-btn--primary landing-btn--lg" to="/register">
            Mulai Sekarang
          </TransitionLink>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__inner">
          <div className="landing-footer__left">
            <Logo size={24} className="landing-footer__logo" />
            <span>© 2026 Rexify</span>
          </div>
          <span>
            Dibuat dengan <IconHeart size={14} className="landing-footer__heart" /> oleh Arnov
          </span>
        </div>
      </footer>
    </div>
  );
}

