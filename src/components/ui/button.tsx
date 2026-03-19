import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base = 'inline-flex items-center justify-center font-medium transition-colors rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90',
  secondary: 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] hover:bg-[var(--bg-hover)]',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
  danger: 'bg-[var(--danger)] text-white hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = 'Button';
export default Button;
