create table if not exists nfc_sound (
    id uuid primary key,
    name varchar(255) not null,
    account_id bigint not null,
    active boolean not null default true,
    publication_status varchar(40) not null default 'DRAFT',
    source_sound_id uuid,
    wav_content bytea,
    content_type varchar(120) not null default 'audio/wav',
    original_filename varchar(255),
    size_bytes bigint not null default 0,
    duration_ms bigint not null default 0,
    version bigint not null default 1,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create index if not exists idx_nfc_sound_account on nfc_sound(account_id);
create index if not exists idx_nfc_sound_publication on nfc_sound(publication_status, active);

create table if not exists nfc_sound_rating (
    id uuid primary key,
    sound_id uuid not null,
    account_id bigint not null,
    rating integer not null,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint uk_nfc_sound_rating_sound_account unique (sound_id, account_id),
    constraint chk_nfc_sound_rating_value check (rating in (-1, 1))
);

create index if not exists idx_nfc_sound_rating_sound on nfc_sound_rating(sound_id);
create index if not exists idx_nfc_sound_rating_account on nfc_sound_rating(account_id);

create table if not exists nfc_device_sound_command (
    id uuid primary key,
    device_id uuid not null,
    sound_id uuid not null,
    session_id uuid,
    version bigint not null default 1,
    created_at timestamp with time zone not null default now(),
    played_at timestamp with time zone
);

create index if not exists idx_nfc_device_sound_command_device on nfc_device_sound_command(device_id);
create index if not exists idx_nfc_device_sound_command_session on nfc_device_sound_command(session_id);
