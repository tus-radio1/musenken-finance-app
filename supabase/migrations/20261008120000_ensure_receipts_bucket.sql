-- Ensure local and newly provisioned projects have the public bucket expected by
-- the application. Existing production buckets are intentionally left unchanged.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'receipts',
  'receipts',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/tiff',
    'image/bmp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;
