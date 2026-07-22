-- Hand-edited: dedupe kyc_documents BEFORE the unique index is created below.
-- Non-transactional select/delete/insert in the old upload handler could let two concurrent
-- uploads of the same (provider_id, doc_type) both insert, leaving duplicate rows. A unique
-- index will fail to apply while duplicates exist, so keep only the newest row (by uploaded_at)
-- per (provider_id, doc_type) and drop the rest first.
--
-- NOTE: this DELETE does not clean up the private-bucket storage objects the discarded rows'
-- file_key columns pointed at — those objects are orphaned (unreferenced by any row) by this
-- one-shot migration. Acceptable here since this runs once against pre-fix data, but it is a
-- real storage leak; tracked as a cleanup chore in INVESTIGATION.md.
DELETE FROM "kyc_documents"
WHERE "id" NOT IN (
	SELECT DISTINCT ON (provider_id, doc_type) id
	FROM "kyc_documents"
	ORDER BY provider_id, doc_type, uploaded_at DESC
);
--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_documents_provider_doc_type_unique" ON "kyc_documents" USING btree ("provider_id","doc_type");
