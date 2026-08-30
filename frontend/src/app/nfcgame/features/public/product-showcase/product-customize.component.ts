import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';

type LocalizedText = {
  de: string;
  en: string;
};

type ReaderColor = {
  id: string;
  label: LocalizedText;
  tone: string;
};

type PurchaseOption = {
  id: string;
  title: LocalizedText;
  text: LocalizedText;
};

@Component({
  selector: 'nfc-product-customize',
  imports: [RouterLink],
  templateUrl: './product-customize.component.html',
  styleUrl: './product-customize.component.scss',
})
export class NfcProductCustomizeComponent {
  private readonly i18n = inject(NfcI18nService);

  protected readonly selectedColor = signal('white');
  protected readonly additionalCards = signal(0);
  protected readonly selectedOptions = signal<Set<string>>(new Set());
  protected readonly orderSent = signal(false);

  protected readonly bundleItems: LocalizedText[] = [
    { de: '1x NFC Reader', en: '1x NFC Reader' },
    { de: '20x persönliche NFC Karten', en: '20x personal NFC cards' },
    { de: '1x Netzteil', en: '1x power supply' },
    { de: 'Zugang zur NFC Game Plattform', en: 'Access to the NFC Game platform' },
  ];

  protected readonly readerColors: ReaderColor[] = [
    { id: 'white', label: { de: 'Weiß', en: 'White' }, tone: 'is-white' },
    { id: 'graphite', label: { de: 'Graphit', en: 'Graphite' }, tone: 'is-graphite' },
    { id: 'sand', label: { de: 'Sand', en: 'Sand' }, tone: 'is-sand' },
  ];

  protected readonly options: PurchaseOption[] = [
    {
      id: 'card-storage',
      title: { de: 'Kartenaufbewahrung', en: 'Card storage' },
      text: {
        de: 'Ein Platz für eure Karten, damit der nächste Abend sofort starten kann.',
        en: 'A home for your cards, so the next night can start instantly.',
      },
    },
    {
      id: 'sound-pack',
      title: { de: 'Sound Setup', en: 'Sound setup' },
      text: {
        de: 'Vorbereitet für eigene Jingles, Ansagen und Sounds im Game Builder.',
        en: 'Prepared for custom jingles, announcements and sounds in the Game Builder.',
      },
    },
  ];

  protected readonly selectedColorLabel = computed(
    () => this.readerColors.find((color) => color.id === this.selectedColor())?.label ?? this.readerColors[0].label,
  );
  protected readonly selectedColorTone = computed(
    () => this.readerColors.find((color) => color.id === this.selectedColor())?.tone ?? this.readerColors[0].tone,
  );

  protected readonly totalCards = computed(() => 20 + this.additionalCards());

  protected readonly selectedOptionList = computed(() =>
    this.options.filter((option) => this.selectedOptions().has(option.id)),
  );

  protected readonly hasCustomSelection = computed(
    () => this.selectedColor() !== 'white' || this.additionalCards() > 0 || this.selectedOptionList().length > 0,
  );

  protected text(value: LocalizedText) {
    return this.i18n.pick(value.de, value.en);
  }

  protected selectColor(colorId: string) {
    this.selectedColor.set(colorId);
    this.orderSent.set(false);
  }

  protected setAdditionalCards(cards: number) {
    this.additionalCards.set(Math.max(0, Math.min(80, cards)));
    this.orderSent.set(false);
  }

  protected toggleOption(optionId: string) {
    this.selectedOptions.update((current) => {
      const next = new Set(current);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
    this.orderSent.set(false);
  }

  protected submitOrder() {
    this.orderSent.set(true);
  }
}
