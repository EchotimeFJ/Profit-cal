import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card: React.FC<CardProps> = ({ className, ...props }) => {
  return (
    <div
      className={cn(
        'bg-canvas border border-hairline rounded-xl shadow-soft',
        className
      )}
      {...props}
    />
  );
};

export const CardHeader: React.FC<CardProps> = ({ className, ...props }) => {
  return <div className={cn('p-xl border-b border-hairline', className)} {...props} />;
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  ...props
}) => {
  return <h3 className={cn('text-title-md font-semibold text-ink', className)} {...props} />;
};

export const CardContent: React.FC<CardProps> = ({ className, ...props }) => {
  return <div className={cn('p-xl', className)} {...props} />;
};
