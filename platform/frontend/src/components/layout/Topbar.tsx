interface TopbarProps {
  title: string;
  userEmail: string;
}

function initials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase();
}

export default function Topbar({ title, userEmail }: TopbarProps) {
  return (
    <header className="topbar">
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