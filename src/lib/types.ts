// Database types matching supabase-schema.sql
export type UserRole = 'admin' | 'sales' | 'kitchen' | 'accounts';

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PRODUCTION' | 'READY' | 'BILLED' | 'PAID' | 'CANCELLED';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other';

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  commission_percent: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  category?: Category;
}

export interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface Recipe {
  id: string;
  product_id: string;
  ingredients: RecipeIngredient[];
  steps: string;
  notes: string | null;
  created_at: string;
  product?: Product;
}

export interface Order {
  id: string;
  order_number: number;
  salesperson_id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_factory_order: boolean;
  status: OrderStatus;
  qr_code: string | null;
  created_at: string;
  updated_at: string;
  salesperson?: Profile;
  order_items?: OrderItem[];
  invoices?: Invoice[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  product?: Product;
}

export interface Invoice {
  id: string;
  order_id: string;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  status: PaymentStatus;
  created_at: string;
  order?: Order;
  payments?: Payment[];
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount_paid: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profile?: Profile;
}
