import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

/**
 * Input — text field primitive.
 *
 * Two visual variants drawn from the Figma frames:
 *   - outlined — white surface with a hairline border (login/signup modals)
 *   - filled   — tinted surface, borderless until focus (Submit Request form)
 *
 * Slots: label, helperText, errorText, iconLeft, iconRight.
 * Error state takes precedence over helper text. The wrapper owns the
 * border/focus ring so icons sit visually inside the field's border.
 */
const fieldContainerVariants = cva(
  'group/input flex items-center gap-2 transition-colors duration-150 ease-soft-out',
  {
    variants: {
      variant: {
        outlined:
          'border border-line bg-surface focus-within:border-brand-red-500 focus-within:ring-2 focus-within:ring-brand-red-500/20',
        filled:
          'border border-transparent bg-surface-subtle focus-within:bg-surface focus-within:border-brand-red-500',
      },
      state: {
        default: '',
        error:
          'border-brand-red-500 focus-within:border-brand-red-600 focus-within:ring-2 focus-within:ring-brand-red-500/30',
        disabled: 'opacity-60 cursor-not-allowed bg-surface-subtle',
      },
      inputSize: {
        sm: 'h-9 px-3 rounded text-body-sm',
        md: 'h-11 px-3.5 rounded-md text-body-sm',
        lg: 'h-12 px-4 rounded-md text-body-base',
      },
    },
    defaultVariants: {
      variant: 'outlined',
      state: 'default',
      inputSize: 'md',
    },
  },
);

export interface InputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    Pick<VariantProps<typeof fieldContainerVariants>, 'variant' | 'inputSize'> {
  label?: string;
  helperText?: string;
  errorText?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /**
   * Interactive trailing control (e.g. a password reveal button). Unlike
   * `iconRight`, it is NOT wrapped in `aria-hidden`, so the affordance stays in
   * the accessibility tree — pass a `<button>` with its own `aria-label`.
   */
  trailingAction?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helperText,
    errorText,
    iconLeft,
    iconRight,
    trailingAction,
    variant,
    inputSize,
    disabled,
    className,
    containerClassName,
    id,
    ...props
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const isError = Boolean(errorText);
  const state: 'default' | 'error' | 'disabled' = disabled
    ? 'disabled'
    : isError
      ? 'error'
      : 'default';

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label ? (
        <label htmlFor={inputId} className="text-body-sm font-medium text-ink-primary">
          {label}
        </label>
      ) : null}
      <div className={fieldContainerVariants({ variant, state, inputSize })}>
        {iconLeft ? (
          <span aria-hidden="true" className="inline-flex text-ink-tertiary">
            {iconLeft}
          </span>
        ) : null}
        <input
          id={inputId}
          ref={ref}
          disabled={disabled}
          aria-invalid={isError || undefined}
          aria-describedby={isError ? errorId : helperText ? helperId : undefined}
          className={cn(
            'flex-1 bg-transparent text-ink-primary placeholder:text-ink-tertiary focus:outline-none disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {iconRight ? (
          <span aria-hidden="true" className="inline-flex text-ink-tertiary">
            {iconRight}
          </span>
        ) : null}
        {trailingAction ? <span className="inline-flex">{trailingAction}</span> : null}
      </div>
      {isError ? (
        <p id={errorId} className="text-body-xs text-brand-red-500">
          {errorText}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-body-xs text-ink-tertiary">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
