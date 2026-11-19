import { supportChannels } from '../../lib/support';

interface SupportLinksProps {
  collapsed: boolean;
  // Dipakai sidebar mobile: drawer ditutup setelah salah satu kanal dipilih.
  onNavigate?: () => void;
}

// Kanal yang belum diisi di lib/support.ts tidak dirender, jadi tidak ada tombol mati.
export default function SupportLinks({ collapsed, onNavigate }: SupportLinksProps) {
  const channels = supportChannels();
  if (channels.length === 0) return null;

  return (
    <div className="support-links">
      {!collapsed && <p className="support-links__title">Bantuan</p>}
      <div className="support-links__row">
        {channels.map((channel) => {
          const external = channel.href.startsWith('http');
          return (
            <a
              key={channel.id}
              className="support-link"
              href={channel.href}
              title={channel.hint}
              aria-label={channel.hint}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer noopener' : undefined}
              onClick={onNavigate}
            >
              {channel.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
