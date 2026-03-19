import type { OrderStatus, PaymentStatus } from '@/lib/types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--bg-hover)] text-[var(--text-secondary)]',
  success: 'bg-green-50 text-[var(--success)] border-green-200',
  warning: 'bg-amber-50 text-[var(--warning)] border-amber-200',
  danger: 'bg-red-50 text-[var(--danger)] border-red-200',
  info: 'bg-[var(--bg-active)] text-[var(--text)]',
};

const orderStatusVariant: Record<OrderStatus, BadgeVariant> = {
  DRAFT: 'default',
  CONFIRMED: 'info',
  IN_PRODUCTION: 'warning',
  READY: 'success',
  BILLED: 'info',
  PAID: 'success',
  CANCELLED: 'danger',
};

const paymentStatusVariant: Record<PaymentStatus, BadgeVariant> = {
  unpaid: 'danger',
  partial: 'warning',
  paid: 'success',
};

export function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${variantStyles[variant]}`}>
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={orderStatusVariant[status]}>{status.replace('_', ' ')}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={paymentStatusVariant[status]}>{status.toUpperCase()}</Badge>;
}
