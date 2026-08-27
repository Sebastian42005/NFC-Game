import { Injectable, signal } from '@angular/core';

export type OptionalConsentCategory = 'preferences' | 'statistics' | 'marketing';

export type LegalConsentPreferences = {
  version: number;
  updatedAt: string;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
};

const consentStorageKey = 'nfc-game-cookie-consent';
const currentConsentVersion = 1;

@Injectable({ providedIn: 'root' })
export class LegalConsentService {
  private readonly storedConsent = this.readStoredConsent();
  private readonly preferencesState = signal<LegalConsentPreferences>(this.storedConsent ?? this.defaultConsent());
  private readonly bannerVisibleState = signal(!this.storedConsent);
  private readonly preferencesPanelVisibleState = signal(false);

  readonly preferences = this.preferencesState.asReadonly();
  readonly bannerVisible = this.bannerVisibleState.asReadonly();
  readonly preferencesPanelVisible = this.preferencesPanelVisibleState.asReadonly();

  acceptAll() {
    this.save({
      preferences: true,
      statistics: true,
      marketing: true,
    });
  }

  rejectOptional() {
    this.save({
      preferences: false,
      statistics: false,
      marketing: false,
    });
  }

  saveSelection(selection: Pick<LegalConsentPreferences, OptionalConsentCategory>) {
    this.save(selection);
  }

  openPreferences() {
    this.preferencesPanelVisibleState.set(true);
    this.bannerVisibleState.set(true);
  }

  closePreferences() {
    this.preferencesPanelVisibleState.set(false);
    if (this.hasStoredConsent()) {
      this.bannerVisibleState.set(false);
    }
  }

  hasConsent(category: OptionalConsentCategory) {
    return this.preferencesState()[category];
  }

  private save(selection: Pick<LegalConsentPreferences, OptionalConsentCategory>) {
    const preferences: LegalConsentPreferences = {
      version: currentConsentVersion,
      updatedAt: new Date().toISOString(),
      preferences: selection.preferences,
      statistics: selection.statistics,
      marketing: selection.marketing,
    };
    this.preferencesState.set(preferences);
    this.writeStoredConsent(preferences);
    this.preferencesPanelVisibleState.set(false);
    this.bannerVisibleState.set(false);
    this.notifyConsentChange(preferences);
  }

  private defaultConsent(): LegalConsentPreferences {
    return {
      version: currentConsentVersion,
      updatedAt: '',
      preferences: false,
      statistics: false,
      marketing: false,
    };
  }

  private hasStoredConsent(): boolean {
    return this.readStoredConsent() !== null;
  }

  private readStoredConsent(): LegalConsentPreferences | null {
    try {
      const raw = localStorage.getItem(consentStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<LegalConsentPreferences>;
      if (parsed.version !== currentConsentVersion) return null;
      return {
        version: currentConsentVersion,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        preferences: parsed.preferences === true,
        statistics: parsed.statistics === true,
        marketing: parsed.marketing === true,
      };
    } catch {
      return null;
    }
  }

  private writeStoredConsent(preferences: LegalConsentPreferences) {
    try {
      localStorage.setItem(consentStorageKey, JSON.stringify(preferences));
    } catch {
      // Consent still applies for the current page view if browser storage is unavailable.
    }
  }

  private notifyConsentChange(preferences: LegalConsentPreferences) {
    try {
      window.dispatchEvent(new CustomEvent('nfc-consent-changed', { detail: preferences }));
    } catch {
      // Non-browser contexts do not need cross-script consent notifications.
    }
  }
}
