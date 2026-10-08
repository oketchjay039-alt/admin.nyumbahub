create type public.app_role as enum ('super_admin', 'admin');
create type public.mail_priority as enum ('normal', 'high', 'urgent');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "Users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'super_admin'));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  department text not null default 'Operations',
  title text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Admins read directory" on public.profiles for select to authenticated using (true);

create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  body text not null,
  priority mail_priority not null default 'normal',
  confidential boolean not null default false,
  labels text[] not null default '{}',
  to_label text not null default '',
  created_at timestamptz not null default now()
);
create index on public.mail_messages (thread_id);

create table public.mail_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.mail_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  starred boolean not null default false,
  archived boolean not null default false,
  unique (message_id, user_id)
);
create index on public.mail_recipients (user_id);

create table public.mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.mail_messages(id) on delete cascade,
  path text not null,
  name text not null,
  size bigint not null default 0,
  mime text
);

create or replace function public.can_read_message(_message_id uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.mail_messages m where m.id = _message_id and m.sender_id = _user)
      or exists (select 1 from public.mail_recipients r where r.message_id = _message_id and r.user_id = _user)
$$;

grant select on public.mail_messages, public.mail_attachments to authenticated;
grant select, update on public.mail_recipients to authenticated;
grant all on public.mail_messages, public.mail_recipients, public.mail_attachments to service_role;
alter table public.mail_messages enable row level security;
alter table public.mail_recipients enable row level security;
alter table public.mail_attachments enable row level security;

create policy "Read own mail" on public.mail_messages for select to authenticated
  using (public.can_read_message(id, auth.uid()));
create policy "Read own recipient rows" on public.mail_recipients for select to authenticated
  using (user_id = auth.uid() or public.can_read_message(message_id, auth.uid()));
create policy "Update own recipient rows" on public.mail_recipients for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Read attachments of own mail" on public.mail_attachments for select to authenticated
  using (public.can_read_message(message_id, auth.uid()));

alter publication supabase_realtime add table public.mail_recipients;

create policy "Upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'mail-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Read own uploads or attachments" on storage.objects for select to authenticated
  using (bucket_id = 'mail-attachments' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.mail_attachments a where a.path = name and public.can_read_message(a.message_id, auth.uid()))
  ));