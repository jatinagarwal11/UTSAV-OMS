-- Security and performance hardening migration
-- Run once in Supabase SQL Editor for existing projects.

-- Orders policies
DROP POLICY IF EXISTS "Sales sees own orders" ON public.orders;
DROP POLICY IF EXISTS "Sales can create orders" ON public.orders;
DROP POLICY IF EXISTS "Sales can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Accounts and admin can create orders" ON public.orders;
DROP POLICY IF EXISTS "Kitchen can update order status" ON public.orders;
DROP POLICY IF EXISTS "Kitchen and accounts can update orders" ON public.orders;
DROP POLICY IF EXISTS "Sales can cancel own orders" ON public.orders;
DROP POLICY IF EXISTS "Admin full access orders" ON public.orders;

CREATE POLICY "Sales sees own orders"
  ON public.orders FOR SELECT USING (
    salesperson_id = auth.uid() OR public.get_my_role() IN ('admin', 'kitchen', 'accounts')
  );

CREATE POLICY "Sales can create own orders"
  ON public.orders FOR INSERT WITH CHECK (
    public.get_my_role() = 'sales'
    AND salesperson_id = auth.uid()
  );

CREATE POLICY "Accounts and admin can create orders"
  ON public.orders FOR INSERT WITH CHECK (
    public.get_my_role() IN ('accounts', 'admin')
  );

CREATE POLICY "Kitchen and accounts can update orders"
  ON public.orders FOR UPDATE USING (
    public.get_my_role() IN ('kitchen', 'accounts')
  );

CREATE POLICY "Sales can cancel own orders"
  ON public.orders FOR UPDATE
  USING (
    public.get_my_role() = 'sales'
    AND salesperson_id = auth.uid()
    AND status IN ('DRAFT', 'CONFIRMED')
  )
  WITH CHECK (
    salesperson_id = auth.uid()
    AND status = 'CANCELLED'
  );

CREATE POLICY "Admin full access orders"
  ON public.orders FOR ALL USING (public.get_my_role() = 'admin');

-- Status transition guard
CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_text text := COALESCE(public.get_my_role()::text, '');
  actor_id uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR role_text = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF role_text = 'kitchen' THEN
    IF (OLD.status = 'CONFIRMED' AND NEW.status = 'IN_PRODUCTION')
       OR (OLD.status = 'IN_PRODUCTION' AND NEW.status = 'READY') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Kitchen can only move CONFIRMED->IN_PRODUCTION or IN_PRODUCTION->READY';
  END IF;

  IF role_text = 'accounts' THEN
    IF (OLD.status = 'READY' AND NEW.status = 'BILLED')
       OR (OLD.status = 'BILLED' AND NEW.status = 'PAID')
       OR (OLD.status IN ('CONFIRMED', 'IN_PRODUCTION', 'READY', 'BILLED') AND NEW.status = 'CANCELLED') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Accounts status transition not allowed';
  END IF;

  IF role_text = 'sales' THEN
    IF actor_id = OLD.salesperson_id
       AND OLD.status IN ('DRAFT', 'CONFIRMED')
       AND NEW.status = 'CANCELLED' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Sales can only cancel own DRAFT or CONFIRMED orders';
  END IF;

  RAISE EXCEPTION 'Order status update not allowed for this role';
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_guard ON public.orders;
CREATE TRIGGER trg_orders_status_guard
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

-- Order items policies
DROP POLICY IF EXISTS "Read order items" ON public.order_items;
DROP POLICY IF EXISTS "Insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Admin manage order items" ON public.order_items;

CREATE POLICY "Read order items"
  ON public.order_items FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (
          o.salesperson_id = auth.uid()
          OR public.get_my_role() IN ('admin', 'accounts', 'kitchen')
        )
    )
  );

CREATE POLICY "Insert order items"
  ON public.order_items FOR INSERT WITH CHECK (
    public.get_my_role() IN ('sales', 'accounts', 'admin')
  );

CREATE POLICY "Admin manage order items"
  ON public.order_items FOR ALL USING (public.get_my_role() = 'admin');

-- Invoice policies
DROP POLICY IF EXISTS "Read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Accounts can manage invoices" ON public.invoices;

CREATE POLICY "Read invoices"
  ON public.invoices FOR SELECT USING (
    public.get_my_role() IN ('admin', 'accounts')
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = invoices.order_id
        AND o.salesperson_id = auth.uid()
    )
  );

CREATE POLICY "Accounts can manage invoices"
  ON public.invoices FOR ALL USING (
    public.get_my_role() IN ('accounts', 'admin')
  );

-- Payment policies
DROP POLICY IF EXISTS "Read payments" ON public.payments;
DROP POLICY IF EXISTS "Accounts can manage payments" ON public.payments;

CREATE POLICY "Read payments"
  ON public.payments FOR SELECT USING (
    public.get_my_role() IN ('admin', 'accounts')
    OR EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.orders o ON o.id = i.order_id
      WHERE i.id = payments.invoice_id
        AND o.salesperson_id = auth.uid()
    )
  );

CREATE POLICY "Accounts can manage payments"
  ON public.payments FOR ALL USING (
    public.get_my_role() IN ('accounts', 'admin')
  );

-- Audit log policies
DROP POLICY IF EXISTS "Anyone can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admin can read audit logs" ON public.audit_logs;

CREATE POLICY "Anyone can insert audit logs"
  ON public.audit_logs FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id IS NULL
      OR user_id = auth.uid()
      OR public.get_my_role() = 'admin'
    )
  );

CREATE POLICY "Admin can read audit logs"
  ON public.audit_logs FOR SELECT USING (public.get_my_role() = 'admin');
