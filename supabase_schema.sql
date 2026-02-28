-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users table (extends auth.users)
-- Note: Supabase handles auth.users automatically. We can create a public profile table if needed,
-- but for this app we can mostly rely on auth.users and store data by user_id.

-- 2. Results table
create table results (
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

-- 3. Vocabulary table
create table vocabulary (
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
  custom_image text, -- base64 string
  last_reviewed bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, character)
);

-- 4. Pronunciation History table
create table pronunciation_history (
  id text primary key, -- composite key from app: word_timestamp
  user_id uuid references auth.users(id) not null,
  word text not null,
  heard text,
  pinyin text,
  score integer,
  feedback text,
  audio text, -- base64
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Chat History table
create table chat_history (
  id text primary key, -- uuid from app
  user_id uuid references auth.users(id) not null,
  role text not null,
  text text,
  image text, -- base64
  audio text, -- base64
  grounding_urls jsonb,
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. User Goals table
create table user_goals (
  user_id uuid references auth.users(id) primary key,
  daily_words integer default 10,
  daily_minutes integer default 15,
  daily_speaking_minutes integer default 5,
  daily_pronunciation integer default 10,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Daily Stats table
create table daily_stats (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  date text not null, -- YYYY-MM-DD
  minutes_spent integer default 0,
  words_reviewed integer default 0,
  speaking_minutes integer default 0,
  unique(user_id, date)
);

-- 8. Global Audio Cache table
create table global_audio_cache (
  id uuid default uuid_generate_v4() primary key,
  text text not null,
  audio text not null, -- base64
  timestamp bigint not null,
  contributor uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for performance
create index results_user_timestamp_idx on results (user_id, timestamp desc);
create index vocabulary_user_level_idx on vocabulary (user_id, level);
create index pronunciation_user_word_idx on pronunciation_history (user_id, word);
create index chat_user_timestamp_idx on chat_history (user_id, timestamp);
create index daily_stats_user_date_idx on daily_stats (user_id, date);
create index global_audio_text_idx on global_audio_cache (text);

-- Row Level Security (RLS) Policies
alter table results enable row level security;
alter table vocabulary enable row level security;
alter table pronunciation_history enable row level security;
alter table chat_history enable row level security;
alter table user_goals enable row level security;
alter table daily_stats enable row level security;
alter table global_audio_cache enable row level security;

-- Policies
-- Results: Users can only see/insert their own
create policy "Users can view own results" on results for select using (auth.uid() = user_id);
create policy "Users can insert own results" on results for insert with check (auth.uid() = user_id);

-- Vocabulary: Users can only see/modify their own
create policy "Users can view own vocabulary" on vocabulary for select using (auth.uid() = user_id);
create policy "Users can insert own vocabulary" on vocabulary for insert with check (auth.uid() = user_id);
create policy "Users can update own vocabulary" on vocabulary for update using (auth.uid() = user_id);

-- Pronunciation: Users can only see/insert their own
create policy "Users can view own pronunciation" on pronunciation_history for select using (auth.uid() = user_id);
create policy "Users can insert own pronunciation" on pronunciation_history for insert with check (auth.uid() = user_id);

-- Chat: Users can only see/modify their own
create policy "Users can view own chat" on chat_history for select using (auth.uid() = user_id);
create policy "Users can insert own chat" on chat_history for insert with check (auth.uid() = user_id);
create policy "Users can update own chat" on chat_history for update using (auth.uid() = user_id);
create policy "Users can delete own chat" on chat_history for delete using (auth.uid() = user_id);

-- Goals: Users can only see/modify their own
create policy "Users can view own goals" on user_goals for select using (auth.uid() = user_id);
create policy "Users can insert own goals" on user_goals for insert with check (auth.uid() = user_id);
create policy "Users can update own goals" on user_goals for update using (auth.uid() = user_id);

-- Daily Stats: Users can only see/modify their own
create policy "Users can view own daily stats" on daily_stats for select using (auth.uid() = user_id);
create policy "Users can insert own daily stats" on daily_stats for insert with check (auth.uid() = user_id);
create policy "Users can update own daily stats" on daily_stats for update using (auth.uid() = user_id);

-- Global Audio: Everyone can read, authenticated users can insert
create policy "Everyone can read global audio" on global_audio_cache for select using (true);
create policy "Users can insert global audio" on global_audio_cache for insert with check (auth.uid() = contributor);
