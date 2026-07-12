-- Add 'friends' tour visibility: readable by the creator's accepted friends
-- plus tour members. Public discovery stays on visibility = 'public'.

alter type visibility add value if not exists 'friends';
