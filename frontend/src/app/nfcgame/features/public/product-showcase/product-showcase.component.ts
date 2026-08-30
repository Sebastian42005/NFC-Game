import { Component, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';
import { NfcProductViewerComponent } from './product-viewer.component';

type LocalizedText = {
  de: string;
  en: string;
};

type HardwareStep = {
  id: string;
  label: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
  align: 'left' | 'right';
};

type ShowcaseSection = {
  id: string;
  eyebrow: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
  image: string;
  imageAlt: LocalizedText;
  layout?: 'wide' | 'split' | 'compact';
  tags?: LocalizedText[];
};

type ProductNavItem = {
  href: string;
  label: LocalizedText;
};

@Component({
  selector: 'nfc-product-showcase',
  imports: [RouterLink, NfcProductViewerComponent],
  templateUrl: './product-showcase.component.html',
  styleUrl: './product-showcase.component.scss',
})
export class NfcProductShowcaseComponent {
  protected readonly scrollRoot = viewChild<ElementRef<HTMLElement>>('scrollRoot');
  private readonly i18n = inject(NfcI18nService);

  protected readonly customizePath = '/nfc-reader/customize';
  protected scrolled = false;

  protected readonly navItems: ProductNavItem[] = [
    { href: '#device', label: { de: 'Gerät', en: 'Device' } },
    { href: '#platform', label: { de: 'Plattform', en: 'Platform' } },
    { href: '#builder', label: { de: 'Game Builder', en: 'Game Builder' } },
    { href: '#game-night', label: { de: 'Spielabend', en: 'Game night' } },
  ];

  protected readonly hardwareSteps: HardwareStep[] = [
    {
      id: 'hero',
      label: { de: 'NFC Game System', en: 'NFC Game System' },
      title: { de: 'NFC Game System', en: 'NFC Game System' },
      text: {
        de: 'Ein gemeinsamer Spielabend mit echten Karten, einem Gerät in der Mitte des Tisches und einer Plattform, die alles zusammenhält.',
        en: 'A shared game night with real cards, one device at the center of the table and a platform that keeps everything together.',
      },
      align: 'left',
    },
    {
      id: 'cards',
      label: { de: 'Persönliche Karte', en: 'Personal card' },
      title: { de: 'Individuelle Spielerkarten', en: 'Personal player cards' },
      text: {
        de: 'Jeder Spieler bekommt seine eigene Karte - zum Einsteigen, Mitspielen und Wiedererkennen über viele Abende hinweg.',
        en: 'Each player gets their own card - for joining, playing and being recognized across many nights.',
      },
      align: 'right',
    },
    {
      id: 'scan',
      label: { de: 'NFC Scan', en: 'NFC scan' },
      title: { de: 'Kontaktlose Kartenerkennung', en: 'Contactless card recognition' },
      text: {
        de: 'Ein kurzer Scan reicht und das Spiel weiß, wer gerade dran ist, welche Karte gespielt wurde und was als Nächstes passiert.',
        en: 'One quick scan and the game knows whose turn it is, which card was played and what happens next.',
      },
      align: 'left',
    },
    {
      id: 'display',
      label: { de: 'Touch Display', en: 'Touch display' },
      title: { de: 'Direkte Interaktion', en: 'Direct interaction' },
      text: {
        de: 'Entscheidungen, Zahlen und kleine Aktionen passieren direkt am Reader - sichtbar für alle am Tisch.',
        en: 'Choices, numbers and small actions happen directly on the reader - visible to everyone at the table.',
      },
      align: 'right',
    },
    {
      id: 'audio',
      label: { de: 'Lautsprecher', en: 'Speaker' },
      title: { de: 'Integrierte Audioausgabe', en: 'Integrated audio output' },
      text: {
        de: 'Eigene Sounds, Hinweise und kleine Überraschungen können Teil deiner Spiele werden und direkt aus dem Gerät kommen.',
        en: 'Custom sounds, prompts and small surprises can become part of your games and play straight from the device.',
      },
      align: 'right',
    },
    {
      id: 'platform',
      label: { de: 'Hardware + Plattform', en: 'Hardware + platform' },
      title: { de: 'Mehr als ein Spielgerät.', en: 'More than a game device.' },
      text: {
        de: 'Der Reader ist der physische Einstieg in eine Plattform für Spiele, Spieler, Rankings und ganze Abende.',
        en: 'The reader is the physical entry point into a platform for games, players, rankings and complete nights.',
      },
      align: 'left',
    },
  ];

  protected readonly platformSections: ShowcaseSection[] = [
    {
      id: 'live-game',
      eyebrow: { de: 'Live Game', en: 'Live game' },
      title: { de: 'Live während des Spiels', en: 'Live during the game' },
      text: {
        de: 'Wenn am Tisch etwas passiert, sieht man es sofort: Scans, Punkte, Teams und Aktionen laufen live in der Plattform zusammen.',
        en: 'When something happens at the table, everyone sees it right away: scans, points, teams and actions come together live in the platform.',
      },
      image: '/product-site/game_in_progress_screen.png',
      imageAlt: { de: 'Live-Spielansicht der NFC Game Plattform', en: 'Live game view of the NFC Game platform' },
      layout: 'wide',
    },
    {
      id: 'player-profile',
      eyebrow: { de: 'Spielerprofil', en: 'Player profile' },
      title: { de: 'Langfristige Spielerstatistiken', en: 'Long-term player statistics' },
      text: {
        de: 'Aus jedem Abend wächst ein Profil: Siege, Punkte, Serien, Matchups und Auszeichnungen bleiben erhalten.',
        en: 'Every night builds a profile: wins, points, streaks, matchups and awards stay with each player.',
      },
      image: '/product-site/player_screen.png',
      imageAlt: { de: 'Spielerprofil mit Statistiken', en: 'Player profile with statistics' },
      layout: 'split',
    },
    {
      id: 'game-night',
      eyebrow: { de: 'Spielabend', en: 'Game night' },
      title: {
        de: 'Der gesamte Spieleabend in einer Übersicht.',
        en: 'The entire game night in one overview.',
      },
      text: {
        de: 'Aus einzelnen Spielen entsteht ein Abend mit Ergebnissen, Spielern, Highlights und Momenten, über die man später noch spricht.',
        en: 'Individual games become a night with results, players, highlights and moments people talk about later.',
      },
      image: '/product-site/game_night_screen.png',
      imageAlt: { de: 'Übersicht eines Spieleabends', en: 'Game night overview' },
      layout: 'wide',
      tags: [
        { de: 'Spiele', en: 'Games' },
        { de: 'Spieler', en: 'Players' },
        { de: 'Dauer', en: 'Duration' },
        { de: 'Podium', en: 'Podium' },
        { de: 'Punkte', en: 'Points' },
        { de: 'Highlights', en: 'Highlights' },
        { de: 'Awards', en: 'Awards' },
        { de: 'Siegesserien', en: 'Streaks' },
      ],
    },
    {
      id: 'results',
      eyebrow: { de: 'Resultate', en: 'Results' },
      title: {
        de: 'Ergebnisse werden automatisch Teil der Historie.',
        en: 'Every result becomes part of the history.',
      },
      text: {
        de: 'Der letzte Punkt, der knappe Sieg, das Comeback - alles bleibt mit dem Abend verbunden.',
        en: 'The final point, the close win, the comeback - it all stays connected to the night.',
      },
      image: '/product-site/winning_screen.png',
      imageAlt: { de: 'Gewinneransicht nach einem Spiel', en: 'Winner view after a game' },
      layout: 'compact',
    },
    {
      id: 'ranking',
      eyebrow: { de: 'Ranking', en: 'Ranking' },
      title: { de: 'Ein Ranking über mehrere Spiele hinweg.', en: 'One ranking across every game.' },
      text: {
        de: 'Wer dominiert Uno? Wer sammelt über Monate die meisten Punkte? Rankings machen aus einzelnen Abenden eine gemeinsame Geschichte.',
        en: 'Who dominates Uno? Who collects the most points over months? Rankings turn separate nights into a shared story.',
      },
      image: '/product-site/ranking_screen.png',
      imageAlt: { de: 'Ranking der NFC Game Plattform', en: 'Ranking of the NFC Game platform' },
      layout: 'split',
    },
  ];

  protected readonly builderSection: ShowcaseSection = {
    id: 'builder',
    eyebrow: { de: 'Game Builder', en: 'Game Builder' },
    title: { de: 'Eigene Spiele erstellen.', en: 'Create your own games.' },
    text: {
      de: 'Die Hardware bleibt gleich. Du bestimmst, wie sich dein Spiel anfühlt: Karten scannen, Punkte vergeben, Teams wechseln, Sounds auslösen und eigene Regeln ausprobieren.',
      en: 'The hardware stays the same. You decide how your game feels: scan cards, award points, switch teams, trigger sounds and try your own rules.',
    },
    image: '/product-site/game_builder.png',
    imageAlt: { de: 'Visueller Game Builder der NFC Game Plattform', en: 'Visual Game Builder of the NFC Game platform' },
    layout: 'wide',
  };

  protected readonly cardPossibilities: LocalizedText[] = [
    { de: 'Spielerkarte', en: 'Player card' },
    { de: 'Spielkarte', en: 'Game card' },
    { de: 'Teamkarte', en: 'Team card' },
    { de: 'Punkte', en: 'Points' },
    { de: 'Geld', en: 'Money' },
    { de: 'Aktion', en: 'Action' },
    { de: 'Quiz', en: 'Quiz' },
    { de: 'Eigenes Spiel', en: 'Custom game' },
  ];

  protected readonly mechanics: LocalizedText[] = [
    { de: 'NFC Karten', en: 'NFC cards' },
    { de: 'Teams', en: 'Teams' },
    { de: 'Punkte', en: 'Points' },
    { de: 'Geld', en: 'Money' },
    { de: 'Menüs', en: 'Menus' },
    { de: 'Zahleneingaben', en: 'Number inputs' },
    { de: 'Bedingungen', en: 'Conditions' },
    { de: 'Runden', en: 'Rounds' },
    { de: 'Sounds', en: 'Sounds' },
    { de: 'Gewinner', en: 'Winners' },
  ];

  protected readonly systemItems: LocalizedText[] = [
    { de: 'Ranking', en: 'Ranking' },
    { de: 'Spieler', en: 'Players' },
    { de: 'Spielabend', en: 'Game night' },
    { de: 'Spiele', en: 'Games' },
    { de: 'Game Builder', en: 'Game Builder' },
    { de: 'Live View', en: 'Live view' },
    { de: 'Audio', en: 'Audio' },
  ];

  protected readonly bundleItems: LocalizedText[] = [
    { de: '1x NFC Reader', en: '1x NFC Reader' },
    { de: '20x NFC Karten', en: '20x NFC cards' },
    { de: '1x Netzteil', en: '1x power supply' },
  ];

  protected readonly futureOptions: LocalizedText[] = [
    { de: 'Kartenaufbewahrung', en: 'Card storage' },
    { de: 'zusätzliche NFC Karten', en: 'additional NFC cards' },
    { de: 'weitere Zubehörteile', en: 'more accessories' },
  ];

  protected scrollRootElement() {
    return this.scrollRoot()?.nativeElement ?? null;
  }

  protected text(value: LocalizedText) {
    return this.i18n.pick(value.de, value.en);
  }

  @HostListener('window:scroll')
  protected updateNavState() {
    this.scrolled = window.scrollY > 20;
  }
}
