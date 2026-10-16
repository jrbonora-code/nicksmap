-- Email/password identities. Users created through the allowlisted email flow carry no
-- GitHub identity, so the three GitHub columns become optional. A GitHub identity is
-- still all-or-nothing: either every GitHub column is set or none is.
alter table "auth_user" alter column "githubId" drop not null;
alter table "auth_user" alter column "githubLogin" drop not null;
alter table "auth_user" alter column "githubMfa" drop not null;
alter table "auth_user" add constraint "auth_user_identity_shape" check (
  ("githubId" is null and "githubLogin" is null and "githubMfa" is null)
  or ("githubId" is not null and "githubLogin" is not null and "githubMfa" is not null)
);
