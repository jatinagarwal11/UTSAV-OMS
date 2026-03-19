import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={3}
          className={`w-full px-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors resize-y ${error ? 'border-[var(--danger)]' : ''} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
