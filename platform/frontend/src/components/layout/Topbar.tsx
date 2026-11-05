interface TopbarProps {
  title: string;
  userEmail: string;
  onMenuToggle: () => void;
}

function initials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase();
}

export default function Topbar({ title, userEmail, onMenuToggle }: TopbarProps) {
  return (
    <header className="topbar">
      {/* Hamburger hanya tampil di mobile (lihat layout.css). */}
      <button
        type="button"
        className="topbar__menu"
        onClick={onMenuToggle}
        aria-label="Buka menu navigasi"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      <h1 className="topbar__title">{title}</h1>

      <div className="topbar__user">
        <span className="topbar__email caption">{userEmail}</span>
        <span className="topbar__avatar" aria-hidden="true">
          {initials(userEmail)}
        </span>
      </div>
    </header>
  );
}
