import { useTheme } from '../theme/ThemeProvider';

export default function KayaMascot({ size = 40, className = '', decorative = false }) {
  const { theme } = useTheme();

  return (
    <img
      className={`kaya-mascot ${className}`}
      src={theme === 'dark' ? '/brand/kaya-dark.svg' : '/brand/kaya.svg'}
      width={size}
      height={size}
      alt={decorative ? '' : 'Kaya AI assistant'}
      aria-hidden={decorative ? 'true' : undefined}
      draggable="false"
    />
  );
}
