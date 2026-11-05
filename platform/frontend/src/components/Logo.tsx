import logoUrl from '../assets/rexify-logo.png';

interface LogoProps {
  size?: number;
  className?: string;
}

// Logo Rexify — PNG transparan bergradasi ungu.
export default function Logo({ size = 32, className }: LogoProps) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
