import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors ${error ? 'border-[var(--danger)]' : ''} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
