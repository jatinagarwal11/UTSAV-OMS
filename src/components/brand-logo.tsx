interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

const dimensions: Record<NonNullable<BrandLogoProps['size']>, { width: number; height: number }> = {
  sm: { width: 112, height: 40 },
  md: { width: 160, height: 56 },
  lg: { width: 220, height: 78 },
};

export default function BrandLogo({ size = 'md', showName = false, className = '' }: BrandLogoProps) {
  const dim = dimensions[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="/utsav-logo.svg"
        alt="UTSAV logo"
        width={dim.width}
        height={dim.height}
        className="block h-auto max-w-full"
      />
      {showName && <span className="text-sm font-semibold tracking-wide text-[var(--text)]">UTSAV</span>}
    </div>
  );
}
