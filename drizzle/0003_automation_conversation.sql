-- Add conversation support to automations
-- This allows automations to persist their execution history to a conversation,
-- giving the agent context across runs and allowing users to view/interact with automation runs.

-- Add automationId to conversation table to identify automation conversations
-- (these are filtered from the regular chat sidebar)
ALTER TABLE "conversation" ADD COLUMN "automation_id" uuid;--> statement-breakpoint

-- Add conversationId to automation table to link to persistent conversation
ALTER TABLE "automation" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint

-- Add foreign key constraint for automation.conversation_id -> conversation.id
ALTER TABLE "automation" ADD CONSTRAINT "automation_conversation_id_conversation_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
