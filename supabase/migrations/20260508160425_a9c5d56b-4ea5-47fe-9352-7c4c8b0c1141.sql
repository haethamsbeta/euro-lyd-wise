alter table public.account_groups
  add column if not exists group_type text not null default 'general',
  add column if not exists is_pinned boolean not null default false;

create index if not exists account_groups_is_pinned_idx
  on public.account_groups (is_pinned) where is_pinned;