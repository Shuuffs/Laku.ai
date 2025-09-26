-- Add quantity column to storage table
ALTER TABLE storage ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
