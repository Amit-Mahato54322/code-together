create table if not exists public.rooms (
  id uuid primary key,
  code text not null default '',
  language varchar(32) not null default 'python',
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
