/*
# Add force_password_change column to profiles

1. Modified Tables
   - `profiles`: Added `force_password_change` boolean column (NOT NULL, default false)

2. Purpose
   - When an admin creates a new user, this flag is set to true
   - On first login, the user is forced to change their password
   - After changing, the flag is set back to false

3. Security
   - No RLS changes needed — existing profile policies cover this column
*/

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;
