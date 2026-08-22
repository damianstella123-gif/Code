/*
# Fix growth_areas/growth_objectives SELECT policies for manager draft visibility

## Problem
The original ga_select and go_select policies only let a manager see their
report's rows when stato = 'condiviso'. This means a manager who just created
a draft (creato_da = 'capo', stato = 'bozza') for their report cannot see it
until after sharing — a bug preventing normal workflow.

## Fix
A manager should see their report's rows where EITHER:
- stato = 'condiviso' (shared with the person), OR
- creato_da = 'capo' (the manager authored it — their own draft)

This lets the manager see and work on drafts they created before sharing them,
while still hiding those drafts from the person until stato becomes 'condiviso'.

## Policies changed
- ga_select on growth_areas — DROP + recreate with corrected manager clause
- go_select on growth_objectives — DROP + recreate with corrected manager clause

## Policies NOT changed
- ga_insert, ga_update, ga_delete — already correct
- go_insert, go_update, go_delete — already correct
- gn_select, gn_insert, gn_delete — already correct
*/

-- ============================================================
-- 1. Fix ga_select — growth_areas
-- ============================================================
DROP POLICY IF EXISTS "ga_select" ON growth_areas;
CREATE POLICY "ga_select" ON growth_areas FOR SELECT TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR (
    person_id = auth.uid()
    AND (stato = 'condiviso' OR creato_da = 'persona')
  )
  OR (
    -- Manager can see condiviso rows AND their own authored drafts
    (stato = 'condiviso' OR creato_da = 'capo')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = growth_areas.person_id
        AND p.responsabile_id = auth.uid()
    )
  )
);

-- ============================================================
-- 2. Fix go_select — growth_objectives
-- ============================================================
DROP POLICY IF EXISTS "go_select" ON growth_objectives;
CREATE POLICY "go_select" ON growth_objectives FOR SELECT TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR EXISTS (
    SELECT 1 FROM growth_areas ga
    WHERE ga.id = growth_objectives.area_id
      AND ga.person_id = auth.uid()
      AND (ga.stato = 'condiviso' OR ga.creato_da = 'persona')
  )
  OR EXISTS (
    SELECT 1 FROM growth_areas ga
    JOIN profiles p ON p.id = ga.person_id
    WHERE ga.id = growth_objectives.area_id
      AND (ga.stato = 'condiviso' OR ga.creato_da = 'capo')
      AND p.responsabile_id = auth.uid()
  )
);
