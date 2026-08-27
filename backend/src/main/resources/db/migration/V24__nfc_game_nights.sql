create table if not exists nfc_game_night (
    id uuid primary key,
    account_id bigint not null,
    name varchar(120),
    scoring_system varchar(24) not null,
    theme varchar(24) not null,
    status varchar(24) not null,
    started_at timestamptz not null,
    ended_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

alter table nfc_game_session
    add column if not exists game_night_id uuid;

create index if not exists idx_nfc_game_night_account_status
    on nfc_game_night(account_id, status);

create index if not exists idx_nfc_game_night_account_started
    on nfc_game_night(account_id, started_at);

create index if not exists idx_nfc_game_session_game_night
    on nfc_game_session(game_night_id);

create unique index if not exists uk_nfc_game_night_one_active_per_account
    on nfc_game_night(account_id)
    where status = 'ACTIVE';
