-- Profile discovery fields for the social phase.
-- username is the stable search handle; display_name remains the human name.

alter table profiles
  add column username text,
  add column bio text,
  add column default_role text;

-- Unique case-insensitive handle. Null usernames are allowed until the user picks one.
create unique index profiles_username_lower_uidx
  on profiles (lower(btrim(username)))
  where username is not null;

alter table profiles
  add constraint profiles_username_format_check
  check (
    username is null
    or username ~ '^[a-zA-Z0-9_]{3,30}$'
  );
