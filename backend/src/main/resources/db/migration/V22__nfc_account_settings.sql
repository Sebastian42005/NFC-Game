create table if not exists nfc_account_settings (
    id uuid primary key,
    account_id bigint not null,
    accent_color varchar(7) not null default '#00B8FF',
    theme_mode varchar(24) not null default 'SYSTEM',
    display_brightness integer not null default 80,
    display_timeout varchar(24) not null default 'FIVE_MINUTES',
    device_volume integer not null default 80,
    sounds_enabled boolean not null default true,
    settings_version bigint not null default 1,
    test_sound_version bigint not null default 0,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint uk_nfc_account_settings_account unique (account_id),
    constraint chk_nfc_account_settings_accent check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
    constraint chk_nfc_account_settings_brightness check (display_brightness between 0 and 100),
    constraint chk_nfc_account_settings_volume check (device_volume between 0 and 100),
    constraint chk_nfc_account_settings_theme check (theme_mode in ('DARK', 'LIGHT', 'SYSTEM')),
    constraint chk_nfc_account_settings_timeout check (display_timeout in ('NEVER', 'ONE_MINUTE', 'FIVE_MINUTES', 'TEN_MINUTES'))
);

create index if not exists idx_nfc_account_settings_account on nfc_account_settings(account_id);
