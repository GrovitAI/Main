-- Demo reviewer login — Task 90. Run after 20260917000100_demo_tenant_seed.sql.
--
-- The auth user is created by hand in the Supabase dashboard (Authentication >
-- Users > Add user, with "Auto Confirm User" ticked) so that its password never
-- passes through a migration or a repository. This links that user to the demo
-- tenant as its owner. The owner role is what lets a reviewer open every
-- screen; tenant-scoped RLS is what keeps them inside the demo tenant.
--
-- Safe to run twice. Fails loudly if the auth user does not exist yet.

DO $$
DECLARE
  v_tenant constant uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_branch constant uuid := 'dddddddd-0000-0000-0000-0000000000b1';
  v_email  constant text := 'appreview@grovitai.com';
  v_user   uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Create the auth user % in the Supabase dashboard first.', v_email;
  END IF;

  IF EXISTS (SELECT 1 FROM public.staff WHERE auth_user_id = v_user) THEN
    RAISE NOTICE 'Demo owner already linked; nothing to do.';
    RETURN;
  END IF;

  INSERT INTO public.staff (tenant_id, branch_id, name, role, email, auth_user_id, status)
  VALUES (v_tenant, v_branch, 'App Review', 'owner', v_email, v_user, 'active');
END $$;
