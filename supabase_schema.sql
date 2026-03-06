-- Create the table for storing encrypted API keys
create table if not exists user_api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  provider text not null,
  encrypted_key text not null,
  key_hint text not null,
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

-- Enable Row Level Security
alter table user_api_keys enable row level security;

-- Create policies
create policy "Users can view their own keys"
  on user_api_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert their own keys"
  on user_api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own keys"
  on user_api_keys for update
  using (auth.uid() = user_id);

create policy "Users can delete their own keys"
  on user_api_keys for delete
  using (auth.uid() = user_id);
