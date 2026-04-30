-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tx-attachments', 'tx-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Attachments table
CREATE TABLE IF NOT EXISTS public.transaction_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_attachments_tx ON public.transaction_attachments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_attachments_uploader ON public.transaction_attachments(uploaded_by);

ALTER TABLE public.transaction_attachments ENABLE ROW LEVEL SECURITY;

-- Read: staff OR owner of the related customer account OR uploader (for pending uploads)
CREATE POLICY "tx_attach read"
  ON public.transaction_attachments FOR SELECT
  TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.transactions t
      JOIN public.accounts a ON a.id = t.customer_account_id
      WHERE t.id = transaction_attachments.transaction_id
        AND a.owner_user_id = auth.uid()
    )
  );

-- Insert: staff only, must record themselves as uploader
CREATE POLICY "tx_attach insert staff"
  ON public.transaction_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND uploaded_by = auth.uid()
  );

-- Update: staff (used to attach pending uploads to a transaction)
CREATE POLICY "tx_attach update staff"
  ON public.transaction_attachments FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Delete: staff
CREATE POLICY "tx_attach delete staff"
  ON public.transaction_attachments FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Storage object policies for the bucket
CREATE POLICY "tx-attach storage read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tx-attachments'
    AND (
      public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.transaction_attachments ta
        JOIN public.transactions t ON t.id = ta.transaction_id
        JOIN public.accounts a ON a.id = t.customer_account_id
        WHERE ta.storage_path = storage.objects.name
          AND a.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.transaction_attachments ta
        WHERE ta.storage_path = storage.objects.name
          AND ta.uploaded_by = auth.uid()
      )
    )
  );

CREATE POLICY "tx-attach storage insert staff"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tx-attachments'
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "tx-attach storage delete staff"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tx-attachments'
    AND public.is_staff(auth.uid())
  );