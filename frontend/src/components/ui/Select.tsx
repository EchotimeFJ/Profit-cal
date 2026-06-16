import React from 'react';
import { cn } from '../../lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select: React.FC<SelectProps> = ({ className, ...props }) => {
  return (
    <select
      className={cn(
        'w-full px-4 py-4 bg-canvas border border-hairline rounded-xl text-ink focus:outline-none focus:ring-2 focus:ring-coinbase-blue focus:border-coinbase-blue transition-colors',
        className
      )}
      {...props}
    />
  );
};
