import { Component, ElementRef, viewChild } from '@angular/core';
import { NfcProductViewerComponent } from './product-viewer.component';

@Component({
  selector: 'nfc-product-showcase',
  imports: [NfcProductViewerComponent],
  templateUrl: './product-showcase.component.html',
  styleUrl: './product-showcase.component.scss',
})
export class NfcProductShowcaseComponent {
  protected readonly scrollRoot = viewChild<ElementRef<HTMLElement>>('scrollRoot');
  protected readonly steps = [
    {
      label: 'Hero',
      title: 'NFC Interaction, simplified.',
      text: 'Ein kompakter Reader für physische Karten, digitale Abläufe und direkte Eingaben.',
      align: 'left',
    },
    {
      label: 'NFC Close-up',
      title: 'Kontaktlose Kartenerkennung',
      text: 'Schnelle Identifikation und direkte Verarbeitung im Spielablauf.',
      align: 'right',
    },
    {
      label: 'Karte',
      title: 'Individuelle Karten',
      text: 'Eigene Designs und Funktionen für unterschiedliche Anwendungen.',
      align: 'left',
    },
    {
      label: 'Scan',
      title: 'Scan. Identify. Continue.',
      text: 'Der Reader erkennt die Karte und übergibt den nächsten Schritt direkt an das System.',
      align: 'right',
    },
    {
      label: 'Display',
      title: 'Direkte Interaktion',
      text: 'Eingaben und Entscheidungen erfolgen unmittelbar über das integrierte Display.',
      align: 'right',
    },
    {
      label: 'Lautsprecher',
      title: 'Integrierte Audioausgabe',
      text: 'Sprachhinweise und Sounds werden direkt über den integrierten Lautsprecher ausgegeben.',
      align: 'right',
    },
    {
      label: 'Finale',
      title: 'Eine zentrale Schnittstelle',
      text: 'NFC, Display und Audio in einem kompakten System.',
      align: 'left',
    },
  ] as const;

  protected scrollRootElement() {
    return this.scrollRoot()?.nativeElement ?? null;
  }
}
