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
      label: 'Reader',
      title: 'Ein Reader für Karten, Abläufe und direkte Eingaben.',
      text: 'Kompakt, direkt und für den Einsatz am Spieltisch gedacht.',
      align: 'left',
    },
    {
      label: 'Erkennen',
      title: 'Kontaktlose Karten sofort erkennen.',
      text: 'Der Reader identifiziert Karten ohne Umweg und übergibt den nächsten Schritt direkt an das System.',
      align: 'right',
    },
    {
      label: 'Karte',
      title: 'Jede Karte kann eigene Inhalte und Aktionen auslösen.',
      text: 'So lassen sich Spiele und Abläufe passend zum Einsatzfall aufbauen.',
      align: 'left',
    },
    {
      label: 'Ablauf',
      title: 'Scannen, erkennen, weitermachen.',
      text: 'Ein Kartenkontakt reicht aus, damit der nächste Schritt sofort bereitsteht.',
      align: 'right',
    },
    {
      label: 'Display',
      title: 'Eingaben laufen direkt über das Display.',
      text: 'Auswählen, bestätigen und weiterspielen ohne zusätzliches Gerät.',
      align: 'right',
    },
    {
      label: 'Audio',
      title: 'Hinweise und Sounds kommen direkt aus dem Gerät.',
      text: 'Sprachhinweise und kurze Signale machen den Ablauf unmittelbar verständlich.',
      align: 'right',
    },
    {
      label: 'System',
      title: 'Alles in einem kompakten System.',
      text: 'NFC, Display und Audio greifen ohne zusätzlichen Ballast ineinander.',
      align: 'left',
    },
  ] as const;

  protected scrollRootElement() {
    return this.scrollRoot()?.nativeElement ?? null;
  }
}
