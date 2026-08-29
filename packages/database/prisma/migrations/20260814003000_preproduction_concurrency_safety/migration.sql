CREATE UNIQUE INDEX "group_memberships_one_active_per_contact_group"
  ON "group_memberships" ("group_id", "contact_id")
  WHERE "is_active" = true;

CREATE UNIQUE INDEX "outbound_records_provider_message_id_key"
  ON "outbound_records" ("provider_message_id");
