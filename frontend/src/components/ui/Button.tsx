import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}) => {
  const variants = {
    primary: 'bg-coinbase-blue text-on-primary hover:bg-coinbase-blue-active transition-colors',
    secondary: 'bg-surface-strong text-ink hover:opacity-80 transition-colors',
    outline: 'border border-hairline bg-transparent text-ink hover:bg-surface-soft transition-colors',
    ghost: 'bg-transparent text-ink hover:bg-surface-soft transition-colors',
    destructive: 'bg-semantic-down text-on-primary hover:opacity-90 transition-colors',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded-pill',
    md: 'px-5 py-3 text-button rounded-pill',
    lg: 'px-6 py-4 text-lg rounded-pill',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold focus:outline-none focus:ring-2 focus:ring-coinbase-blue focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
};
