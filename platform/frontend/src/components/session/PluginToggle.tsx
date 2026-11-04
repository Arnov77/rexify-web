import { useId } from 'react';

interface PluginToggleProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export default function PluginToggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: PluginToggleProps) {
  const id = useId();

  return (
    <div className="plugin-row">
      <div className="plugin-row__text">
        <label className="plugin-row__label" htmlFor={id}>
          {label}
        </label>
        <p className="plugin-row__desc">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={checked ? 'toggle toggle--on' : 'toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}