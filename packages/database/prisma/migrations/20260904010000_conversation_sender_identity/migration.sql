ALTER TABLE "conversation_messages"
ADD COLUMN "sender_phone_number_id" TEXT;

CREATE INDEX "conversation_messages_sender_phone_number_id_idx"
ON "conversation_messages"("sender_phone_number_id");
