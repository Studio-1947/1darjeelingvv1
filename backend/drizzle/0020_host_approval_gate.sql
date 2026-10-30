-- Hosts registering from now on need an admin-verified KYC before their listings go public.
-- Existing rows take the default (false), which grandfathers every host who is already live.
ALTER TABLE "providers" ADD COLUMN "approval_required" boolean DEFAULT false NOT NULL;
