import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__text">{text}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}