import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`];
  if (block) classes.push('btn--block');
  if (className) classes.push(className);

  return (
    <button
      ref={ref}
      type="button"
      className={classes.join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
});

export default Button;