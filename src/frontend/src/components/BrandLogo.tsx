import logoUrl from '../assets/minepanel-logo.svg';

/** Decorative mark; the adjacent MinePanel wordmark supplies the brand name. */
export default function BrandLogo({ className = '', size = 24 }) {
  return <img src={logoUrl} className={className} width={size} height={size} alt="" aria-hidden="true" style={{ flexShrink: 0 }} />;
}
