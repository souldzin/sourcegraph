BEGIN;

ALTER TABLE external_services ADD COLUMN IF NOT EXISTS unrestricted BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;