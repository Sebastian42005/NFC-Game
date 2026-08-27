export type LegalOperator = {
  siteName: string;
  operatorName: string;
  legalForm: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  vatId: string;
  companyRegister: string;
  registerCourt: string;
  supervisoryAuthority: string;
  professionalTitle: string;
  memberState: string;
  responsibleForContent: string;
  dataProtectionOfficer: string;
  dataProtectionAuthority: string;
  dataProtectionAuthorityUrl: string;
  hostingProvider: string;
  hostingProviderAddress: string;
  lastUpdated: string;
};

export type LegalStorageEntry = {
  name: string;
  type: string;
  provider: string;
  purpose: string;
  duration: string;
  category: 'Notwendig' | 'Präferenzen' | 'Statistik' | 'Marketing';
};

export const legalOperator: LegalOperator = {
  siteName: 'NFC Arena',
  operatorName: 'TODO: Betreibername eintragen',
  legalForm: 'TODO: Rechtsform eintragen, z. B. Einzelunternehmen, GmbH, Verein',
  streetAddress: 'TODO: Straße und Hausnummer eintragen',
  postalCode: 'TODO: PLZ eintragen',
  city: 'TODO: Ort eintragen',
  country: 'TODO: Land eintragen',
  email: 'TODO: E-Mail-Adresse eintragen',
  phone: 'TODO: Telefonnummer eintragen',
  vatId: 'TODO: USt-IdNr. eintragen oder "nicht vorhanden"',
  companyRegister: 'TODO: Firmenbuch-/Handelsregisternummer eintragen oder "nicht vorhanden"',
  registerCourt: 'TODO: Registergericht/Firmenbuchgericht eintragen oder "nicht vorhanden"',
  supervisoryAuthority: 'TODO: zuständige Aufsichts-/Gewerbebehörde eintragen',
  professionalTitle: 'TODO: Berufsbezeichnung/Kammer eintragen oder "nicht anwendbar"',
  memberState: 'TODO: Mitgliedstaat der Verleihung eintragen oder "nicht anwendbar"',
  responsibleForContent: 'TODO: Verantwortliche Person für Inhalte eintragen',
  dataProtectionOfficer: 'TODO: Datenschutzbeauftragte Person eintragen oder "nicht bestellt"',
  dataProtectionAuthority: 'TODO: zuständige Datenschutzaufsichtsbehörde eintragen',
  dataProtectionAuthorityUrl: 'TODO: URL der Datenschutzaufsichtsbehörde eintragen',
  hostingProvider: 'TODO: Hosting-Provider eintragen',
  hostingProviderAddress: 'TODO: Anschrift des Hosting-Providers eintragen',
  lastUpdated: '27.08.2026',
};

export const legalStorageEntries: LegalStorageEntry[] = [
  {
    name: 'NFC_GAME_ACCESS_TOKEN',
    type: 'HttpOnly-Cookie',
    provider: legalOperator.siteName,
    purpose: 'Hält angemeldete Admin-, Account- oder TV-Sessions aufrecht.',
    duration: 'Bis zum Logout oder bis zum konfigurierten Ablauf der Session.',
    category: 'Notwendig',
  },
  {
    name: 'nfc-game-cookie-consent',
    type: 'localStorage',
    provider: legalOperator.siteName,
    purpose: 'Speichert, welche optionalen Kategorien akzeptiert oder abgelehnt wurden.',
    duration: 'Bis zur Änderung oder Löschung im Browser.',
    category: 'Notwendig',
  },
  {
    name: 'nfc-game-theme, nfc-game-theme-mode, nfc-game-accent-color',
    type: 'localStorage',
    provider: legalOperator.siteName,
    purpose: 'Merkt sich freiwillig gewählte Darstellungsoptionen.',
    duration: 'Bis zur Änderung oder Löschung im Browser.',
    category: 'Präferenzen',
  },
  {
    name: 'nfc-game-language',
    type: 'localStorage',
    provider: legalOperator.siteName,
    purpose: 'Merkt sich die freiwillig gewählte Sprache der Oberfläche.',
    duration: 'Bis zur Änderung oder Löschung im Browser.',
    category: 'Präferenzen',
  },
  {
    name: 'nfc-game-auth',
    type: 'localStorage',
    provider: legalOperator.siteName,
    purpose: 'Speichert eine lokale Anmeldeanzeige, damit die Oberfläche den Status schneller darstellen kann.',
    duration: 'Bis zum Logout oder bis zur Löschung im Browser.',
    category: 'Notwendig',
  },
  {
    name: 'nfc-game-builder-pending-draft',
    type: 'localStorage',
    provider: legalOperator.siteName,
    purpose: 'Bewahrt lokale Spielbuilder-Entwürfe vorübergehend auf, wenn diese Funktion genutzt wird.',
    duration: 'Bis zum Speichern, Verwerfen oder zur Löschung im Browser.',
    category: 'Notwendig',
  },
  {
    name: 'nfc-admin-sidebar-collapsed',
    type: 'localStorage',
    provider: legalOperator.siteName,
    purpose: 'Merkt sich, ob die Admin-Sidebar ein- oder ausgeklappt angezeigt wird.',
    duration: 'Bis zur Änderung oder Löschung im Browser.',
    category: 'Präferenzen',
  },
];
