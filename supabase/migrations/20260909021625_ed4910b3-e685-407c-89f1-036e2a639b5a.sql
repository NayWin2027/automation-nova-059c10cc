create table if not exists public.tts_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  status text not null default 'processing',
  audio_base64 text,
  mime_type text,
  sample_rate int,
  segment_timestamps jsonb,
  error text,
  created_at timestamptz not null default now()
);

grant select on public.tts_jobs to authenticated;
grant all on public.tts_jobs to service_role;

alter table public.tts_jobs enable row level security;

create policy "Users can view their own tts jobs"
  on public.tts_jobs for select
  using (auth.uid() = user_id);