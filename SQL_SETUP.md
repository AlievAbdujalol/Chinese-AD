# Database Setup Required

It looks like your Supabase project is missing the required tables. This causes the "404" errors you see in the console.

## How to Fix

1.  **Copy the SQL Code below.**
2.  Go to your [Supabase Dashboard](https://supabase.com/dashboard).
3.  Open your project.
4.  Go to the **SQL Editor** (icon on the left sidebar).
5.  Click **"New Query"**.
6.  **Paste** the code and click **"Run"**.

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Results table
create table if not exists results (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  type text not null check (type in ('quiz', 'exam')),
  score integer not null,
  total integer not null,
  level text not null,
  date text not null,
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Vocabulary table
create table if not exists vocabulary (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  character text not null,
  pinyin text,
  translation text,
  example_sentence text,
  example_pinyin text,
  example_translation text,
  level text,
  rating text check (rating in ('hard', 'good', 'easy')),
  bookmarked boolean default false,
  custom_image text,
  last_reviewed bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, character)
);

-- 3. Pronunciation History table
create table if not exists pronunciation_history (
  id text primary key,
  user_id uuid references auth.users(id) not null,
  word text not null,
  heard text,
  pinyin text,
  score integer,
  feedback text,
  audio text,
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Chat History table
create table if not exists chat_history (
  id text primary key,
  user_id uuid references auth.users(id) not null,
  role text not null,
  text text,
  image text,
  audio text,
  grounding_urls jsonb,
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. User Goals table
create table if not exists user_goals (
  user_id uuid references auth.users(id) primary key,
  daily_words integer default 10,
  daily_minutes integer default 15,
  daily_speaking_minutes integer default 5,
  daily_pronunciation integer default 10,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Daily Stats table
create table if not exists daily_stats (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  date text not null,
  minutes_spent integer default 0,
  words_reviewed integer default 0,
  speaking_minutes integer default 0,
  unique(user_id, date)
);

-- 7. Global Audio Cache table
create table if not exists global_audio_cache (
  id uuid default uuid_generate_v4() primary key,
  text text not null,
  audio text not null,
  timestamp bigint not null,
  contributor uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index if not exists results_user_timestamp_idx on results (user_id, timestamp desc);
create index if not exists vocabulary_user_level_idx on vocabulary (user_id, level);
create index if not exists pronunciation_user_word_idx on pronunciation_history (user_id, word);
create index if not exists chat_user_timestamp_idx on chat_history (user_id, timestamp);
create index if not exists daily_stats_user_date_idx on daily_stats (user_id, date);
create index if not exists global_audio_text_idx on global_audio_cache (text);

-- RLS Policies (Security)
alter table results enable row level security;
alter table vocabulary enable row level security;
alter table pronunciation_history enable row level security;
alter table chat_history enable row level security;
alter table user_goals enable row level security;
alter table daily_stats enable row level security;
alter table global_audio_cache enable row level security;

-- Create policies (safe to run multiple times as long as names are unique or we drop first, but 'if not exists' is harder for policies. 
-- For simplicity, we assume clean slate or ignore errors if they exist.
-- Better to drop and recreate to be safe.)

drop policy if exists "Users can view own results" on results;
create policy "Users can view own results" on results for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own results" on results;
create policy "Users can insert own results" on results for insert with check (auth.uid() = user_id);

drop policy if exists "Users can view own vocabulary" on vocabulary;
create policy "Users can view own vocabulary" on vocabulary for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own vocabulary" on vocabulary;
create policy "Users can insert own vocabulary" on vocabulary for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own vocabulary" on vocabulary;
create policy "Users can update own vocabulary" on vocabulary for update using (auth.uid() = user_id);

drop policy if exists "Users can view own pronunciation" on pronunciation_history;
create policy "Users can view own pronunciation" on pronunciation_history for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own pronunciation" on pronunciation_history;
create policy "Users can insert own pronunciation" on pronunciation_history for insert with check (auth.uid() = user_id);

drop policy if exists "Users can view own chat" on chat_history;
create policy "Users can view own chat" on chat_history for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own chat" on chat_history;
create policy "Users can insert own chat" on chat_history for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own chat" on chat_history;
create policy "Users can update own chat" on chat_history for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own chat" on chat_history;
create policy "Users can delete own chat" on chat_history for delete using (auth.uid() = user_id);

drop policy if exists "Users can view own goals" on user_goals;
create policy "Users can view own goals" on user_goals for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own goals" on user_goals;
create policy "Users can insert own goals" on user_goals for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own goals" on user_goals;
create policy "Users can update own goals" on user_goals for update using (auth.uid() = user_id);

drop policy if exists "Users can view own daily stats" on daily_stats;
create policy "Users can view own daily stats" on daily_stats for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own daily stats" on daily_stats;
create policy "Users can insert own daily stats" on daily_stats for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own daily stats" on daily_stats;
create policy "Users can update own daily stats" on daily_stats for update using (auth.uid() = user_id);

drop policy if exists "Everyone can read global audio" on global_audio_cache;
create policy "Everyone can read global audio" on global_audio_cache for select using (true);
drop policy if exists "Users can insert global audio" on global_audio_cache;
create policy "Users can insert global audio" on global_audio_cache for insert with check (auth.uid() = contributor);
```
