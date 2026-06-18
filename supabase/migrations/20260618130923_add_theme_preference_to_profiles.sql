ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system';
