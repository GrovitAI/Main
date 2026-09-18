-- Spell the restaurant "Le Laban", as its logo does — Task 100.
--
-- The logo reads LeLaban, but the tenant and the Central Kitchen branch were
-- recorded as "Le Leban". The tenant name is shown in the app header on every
-- screen and in the Finance subtitle; the branch name in the branch pickers.
--
-- Display only. Checked before writing: no function, trigger or policy, and
-- nothing in the app or API, finds a tenant or branch by its name. Bills,
-- reports and every link between rows use ids, which do not change.
--
-- Each update names the row by id AND by its old name, so it touches exactly
-- one row, and running it twice does nothing the second time.

UPDATE public.tenants
   SET name = 'Le Laban'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
   AND name = 'Le Leban';

UPDATE public.branches
   SET name = 'Le Laban Central Kitchen'
 WHERE id = 'cccccccc-0000-0000-0000-000000000001'
   AND name = 'Le Leban Central Kitchen';
