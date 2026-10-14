CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  actor_name text NOT NULL DEFAULT '',
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.stamp_audit_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.actor_id := auth.uid();
  NEW.created_at := now();
  SELECT p.full_name, p.email INTO NEW.actor_name, NEW.actor_email FROM public.profiles p WHERE p.id = NEW.actor_id;
  NEW.actor_name := coalesce(NEW.actor_name, '');
  NEW.actor_email := coalesce(NEW.actor_email, '');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_log_stamp BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_actor();

CREATE OR REPLACE FUNCTION public.block_audit_changes() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit entries are append-only'; END $$;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.block_audit_changes();

CREATE POLICY "Admins append audit" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')));
CREATE POLICY "Admins read audit" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;