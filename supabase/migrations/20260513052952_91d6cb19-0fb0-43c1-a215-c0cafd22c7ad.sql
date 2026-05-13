UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'audio/mpeg','audio/wav','audio/mp4','audio/ogg','audio/flac','audio/aac','audio/x-m4a',
  'video/mp4','video/webm','video/x-matroska','video/x-msvideo','video/quicktime','video/3gpp',
  'image/jpeg','image/png','image/webp','application/octet-stream'
]
WHERE id = 'temp-uploads';