alter table nfc_account_settings
    add column if not exists language varchar(8) not null default 'DE';

alter table nfc_account_settings
    drop constraint if exists chk_nfc_account_settings_language;

alter table nfc_account_settings
    add constraint chk_nfc_account_settings_language check (language in ('DE', 'EN'));
