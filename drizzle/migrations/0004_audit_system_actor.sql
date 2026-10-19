CREATE OR REPLACE FUNCTION public.stamp_audit_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Signed-in callers are always stamped as themselves; only trusted server code (no JWT) may name the actor.
  IF auth.uid() IS NOT NULL OR NEW.actor_id IS NULL THEN
    NEW.actor_id := auth.uid();
  END IF;
  NEW.created_at := now();
  SELECT p.full_name, p.email INTO NEW.actor_name, NEW.actor_email FROM public.profiles p WHERE p.id = NEW.actor_id;
  NEW.actor_name := coalesce(NEW.actor_name, '');
  NEW.actor_email := coalesce(NEW.actor_email, '');
  RETURN NEW;
END $$;