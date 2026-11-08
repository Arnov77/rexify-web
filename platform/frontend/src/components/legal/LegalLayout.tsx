import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../Logo';
import { LEGAL_UPDATED_AT } from '../../lib/legal';
import '../../styles/legal.css';

interface LegalLayoutProps {
  title: string;
  children: ReactNode;
  // Dokumen pasangannya: Syarat menunjuk Privasi, dan sebaliknya.
  other: { to: string; label: string };
}

export default function LegalLayout({ title, children, other }: LegalLayoutProps) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link className="legal-header__brand" to="/">
          <Logo size={28} className="legal-header__logo" />
          <span>Rexify</span>
        </Link>
        <Link className="legal-header__back" to="/">
          Kembali ke beranda
        </Link>
      </header>

      <main className="legal-doc">
        <h1 className="legal-doc__title">{title}</h1>
        <p className="legal-doc__meta">Berlaku sejak {LEGAL_UPDATED_AT}</p>
        {children}
      </main>

      <footer className="legal-footer">
        <nav className="legal-footer__links" aria-label="Dokumen lain">
          <Link to={other.to}>{other.label}</Link>
          <Link to="/login">Masuk ke dashboard</Link>
        </nav>
      </footer>
    </div>
  );
}
