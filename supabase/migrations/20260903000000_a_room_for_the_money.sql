-- A conversation kind for the room a venue and a captain settle up in.
--
-- On its own because Postgres will not let a new enum value be used in the
-- transaction that added it. Everything that uses it is in the migration after
-- this one.
alter type conversation_kind add value if not exists 'venue';
