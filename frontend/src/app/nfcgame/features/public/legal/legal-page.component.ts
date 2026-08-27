import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { legalOperator, legalStorageEntries } from '../../../shared/legal/legal.config';
import { LegalConsentService } from '../../../shared/legal/legal-consent.service';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

type LegalPageKind = 'impressum' | 'datenschutz' | 'cookies' | 'nutzungsbedingungen';

@Component({
  selector: 'nfc-legal-page',
  imports: [RouterLink, NfcPublicShellComponent],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
})
export class NfcLegalPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly consent = inject(LegalConsentService);
  protected readonly operator = legalOperator;
  protected readonly storageEntries = legalStorageEntries;
  protected readonly pageKind = toSignal(
    this.route.data.pipe(map((data) => (data['legalPage'] as LegalPageKind | undefined) ?? 'datenschutz')),
    { initialValue: 'datenschutz' as LegalPageKind },
  );
  protected readonly pageTitle = computed(() => {
    const kind = this.pageKind();
    if (kind === 'impressum') return 'Impressum';
    if (kind === 'cookies') return 'Cookie-Richtlinie';
    if (kind === 'nutzungsbedingungen') return 'Nutzungsbedingungen';
    return 'Datenschutzerklärung';
  });

  protected openCookieSettings() {
    this.consent.openPreferences();
  }
}
