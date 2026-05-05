ALTER TABLE public.account_group_members
  ADD CONSTRAINT account_group_members_holder_account_id_fkey
  FOREIGN KEY (holder_account_id) REFERENCES public.holder_accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS account_group_members_account_idx
  ON public.account_group_members(holder_account_id);