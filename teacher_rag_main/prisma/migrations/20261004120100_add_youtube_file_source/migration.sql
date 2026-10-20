-- The Prisma schema already declares FileSource.youtube but no earlier migration added it,
-- so databases built only from migrations rejected YouTube files. IF NOT EXISTS keeps this a no-op elsewhere.
ALTER TYPE "FileSource" ADD VALUE IF NOT EXISTS 'youtube';
