CREATE TABLE public.mpesa_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  per_txn_max numeric(12,2) NOT NULL DEFAULT 150000 CHECK (per_txn_max > 0),
  daily_payout_max numeric(14,2) NOT NULL DEFAULT 1000000 CHECK (daily_payout_max > 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.mpesa_settings (id) VALUES (1);
GRANT SELECT ON public.mpesa_settings TO authenticated;
GRANT ALL ON public.mpesa_settings TO service_role;
ALTER TABLE public.mpesa_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read mpesa settings" ON public.mpesa_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('C2B','B2C')),
  idempotency_key text NOT NULL UNIQUE,
  phone text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  account_ref text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('AWAITING_APPROVAL','PENDING','COMPLETED','FAILED','REJECTED')),
  initiated_by uuid NOT NULL,
  initiated_by_name text NOT NULL DEFAULT '',
  approved_by uuid,
  approved_by_name text,
  rejected_reason text,
  merchant_request_id text,
  checkout_request_id text UNIQUE,
  conversation_id text,
  originator_conversation_id text UNIQUE,
  receipt text,
  result_code integer,
  result_desc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT four_eyes CHECK (approved_by IS NULL OR approved_by <> initiated_by)
);
CREATE INDEX mpesa_tx_created_idx ON public.mpesa_transactions (created_at DESC);
GRANT SELECT ON public.mpesa_transactions TO authenticated;
GRANT ALL ON public.mpesa_transactions TO service_role;
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read mpesa transactions" ON public.mpesa_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.mpesa_transactions;