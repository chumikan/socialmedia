-- Keep applied migrations intact; remove dependent views before their tables.
DROP VIEW message_documents;
DROP VIEW conversation_documents;
DROP TABLE messages;
DROP TABLE conversations;
-- Table-owned indexes (including primary keys and conversation pair uniqueness)
-- are removed automatically. Other notification types are preserved.
DELETE FROM notifications WHERE type = 'message';
