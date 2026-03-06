create table if not exists user_api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  encrypted_key text not null,
  key_hint text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id)
);

alter table user_api_keys enable row level security;

create policy "Users can manage their own API key"
on user_api_keys
for all
using (auth.uid() = user_id);
