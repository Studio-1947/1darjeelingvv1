-- Hand-edited: dedupe providers BEFORE the unique index is created below.
-- The old onboard handler was a non-transactional read-then-write (two concurrent onboards
-- could both read "no existing row" and both insert), and its conflict check only looked at
-- 'active'/'pending_payment' — a 'suspended' provider could slip through and onboard a second
-- time. Either path could leave more than one provider row for the same user_id. A unique index
-- will fail to apply while duplicates exist, so keep exactly one row per user_id and drop the
-- rest first: prefer an 'active' row, then 'suspended', then 'pending_payment', then anything
-- else, breaking ties within the same status by the newest `created_at`.
--
-- Deleting a duplicate provider row cascades to its kyc_documents (FK is ON DELETE CASCADE) —
-- intended, since an orphaned duplicate's KYC docs have no surviving provider to belong to. Note
-- this does NOT clean up the private-bucket storage objects those kyc_documents rows pointed at
-- (same class of gap as migration 0004 — see INVESTIGATION.md).
DELETE FROM "providers"
WHERE "id" NOT IN (
	SELECT DISTINCT ON (user_id) id
	FROM "providers"
	ORDER BY
		user_id,
		CASE status
			WHEN 'active' THEN 0
			WHEN 'suspended' THEN 1
			WHEN 'pending_payment' THEN 2
			ELSE 3
		END,
		created_at DESC
);
--> statement-breakpoint
CREATE UNIQUE INDEX "providers_user_id_unique" ON "providers" USING btree ("user_id");
