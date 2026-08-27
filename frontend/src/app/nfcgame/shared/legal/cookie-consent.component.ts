import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { legalOperator } from './legal.config';
import { LegalConsentService, OptionalConsentCategory } from './legal-consent.service';

@Component({
  selector: 'nfc-cookie-consent',
  imports: [RouterLink],
  templateUrl: './cookie-consent.component.html',
  styleUrl: './cookie-consent.component.scss',
})
export class NfcCookieConsentComponent {
  protected readonly consent = inject(LegalConsentService);
  protected readonly operator = legalOperator;
  protected readonly draft = signal({
    preferences: this.consent.preferences().preferences,
    statistics: this.consent.preferences().statistics,
    marketing: this.consent.preferences().marketing,
  });
  protected readonly showDetails = computed(() => this.consent.preferencesPanelVisible());

  protected acceptAll() {
    this.consent.acceptAll();
    this.syncDraft();
  }

  protected rejectOptional() {
    this.consent.rejectOptional();
    this.syncDraft();
  }

  protected saveSelection() {
    this.consent.saveSelection(this.draft());
  }

  protected openDetails() {
    this.syncDraft();
    this.consent.openPreferences();
  }

  protected closeDetails() {
    this.consent.closePreferences();
  }

  protected toggleCategory(category: OptionalConsentCategory, checked: boolean) {
    this.draft.update((current) => ({ ...current, [category]: checked }));
  }

  private syncDraft() {
    const preferences = this.consent.preferences();
    this.draft.set({
      preferences: preferences.preferences,
      statistics: preferences.statistics,
      marketing: preferences.marketing,
    });
  }
}
