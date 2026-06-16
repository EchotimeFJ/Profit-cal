import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className, ...props }) => {
  return (
    <input
      className={cn(
        'w-full px-4 py-4 bg-canvas border border-hairline rounded-xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-coinbase-blue focus:border-coinbase-blue transition-colors',
        className
      )}
      {...props}
    />
  );
};
