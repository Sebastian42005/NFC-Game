import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Output, ViewChild, input } from '@angular/core';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { FormsModule } from '@angular/forms';
import {
  BuilderExpressionMode,
  BuilderValidationResult,
  VariableSuggestion,
  VariableSuggestionGroup,
  validateBuilderExpression,
  variableKindLabel,
} from './flow-variable-suggestions';

type AutocompletePanel = 'main' | 'property';
type HighlightSegment = {
  text: string;
  kind?: VariableSuggestion['kind'] | 'unknown';
  title?: string;
};

let autocompleteInstanceId = 0;
const HIGHLIGHT_TOKEN_PATTERN = /\$[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?/g;

@Component({
  selector: 'nfc-builder-variable-input',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  templateUrl: './builder-variable-input.component.html',
  styleUrl: './builder-variable-input.component.scss',
  host: { class: 'block' },
})
export class BuilderVariableInputComponent {
  readonly label = input('');
  readonly value = input('');
  readonly placeholder = input('');
  readonly rows = input(1);
  readonly suggestions = input<VariableSuggestionGroup[]>([]);
  readonly validationMode = input<BuilderExpressionMode>('text');
  @Output() valueChange = new EventEmitter<string>();
  @Output() fieldBlur = new EventEmitter<void>();
  @ViewChild('field') private field?: ElementRef<HTMLInputElement | HTMLTextAreaElement>;
  @ViewChild('highlightLayer') private highlightLayer?: ElementRef<HTMLElement>;

  protected menuOpen = false;
  protected filteredGroups: VariableSuggestionGroup[] = [];
  protected validation: BuilderValidationResult = { status: 'idle', message: '' };
  protected overlayWidth = 0;
  protected submenuSide: 'left' | 'right' = 'right';
  protected readonly autocompleteOwner = `nfc-autocomplete-${++autocompleteInstanceId}`;
  protected readonly overlayPositions: ConnectedPosition[] = [
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -6,
    },
  ];
  private activePanel: AutocompletePanel = 'main';
  private activeMenuIndex = 0;
  private activePropertyIndex = 0;
  private openSubmenuToken = '';
  private triggerStart = -1;
  private triggerEnd = -1;

  protected multiline(): boolean {
    return this.rows() > 1;
  }

  protected variableKindLabel(kind: VariableSuggestion['kind']): string {
    return variableKindLabel(kind);
  }

  protected displayToken(token: string): string {
    return token.replace(/^\$/, '');
  }

  protected displayProperty(token: string): string {
    return token.split('.').pop() ?? this.displayToken(token);
  }

  protected highlightedSegments(): HighlightSegment[] {
    const value = this.value();
    if (!value) return [];

    const suggestions = this.variableLookup();
    const segments: HighlightSegment[] = [];
    let lastIndex = 0;

    for (const match of value.matchAll(HIGHLIGHT_TOKEN_PATTERN)) {
      const token = match[0];
      const index = match.index ?? 0;
      if (index > lastIndex) {
        segments.push({ text: value.slice(lastIndex, index) });
      }

      this.pushHighlightedTokenSegments(segments, token, suggestions);
      lastIndex = index + token.length;
    }

    if (lastIndex < value.length) {
      segments.push({ text: value.slice(lastIndex) });
    }

    return segments;
  }

  protected hasSubmenu(item: VariableSuggestion): boolean {
    return Boolean(item.properties?.length);
  }

  protected onValueChange(value: string): void {
    this.validation = { status: 'idle', message: '' };
    this.valueChange.emit(value);
    queueMicrotask(() => {
      const field = this.field?.nativeElement;
      if (field) {
        this.syncMenu(field);
        this.syncHighlightScroll(field);
      }
    });
  }

  protected syncHighlightScroll(field: HTMLInputElement | HTMLTextAreaElement): void {
    const layer = this.highlightLayer?.nativeElement;
    if (!layer) return;
    layer.scrollLeft = field.scrollLeft;
    layer.scrollTop = field.scrollTop;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.menuOpen) return;
    const items = this.filteredItems();
    if (!items.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveActive(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveActive(-1);
      return;
    }

    if (this.isSubmenuEnterKey(event.key)) {
      const item = this.activeMainItem();
      if (this.activePanel === 'main' && item?.properties?.length) {
        event.preventDefault();
        this.setOpenSubmenu(item.token);
        this.activePanel = 'property';
        this.activePropertyIndex = 0;
        this.scrollActiveOptionIntoView();
      }
      return;
    }

    if (this.isSubmenuExitKey(event.key)) {
      if (this.activePanel === 'property') {
        event.preventDefault();
        this.activePanel = 'main';
        this.scrollActiveOptionIntoView();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const active = this.activeSuggestion();
      if (active) this.insertSuggestion(active);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu();
    }
  }

  protected onKeyup(event: KeyboardEvent, field: HTMLInputElement | HTMLTextAreaElement): void {
    if (['Enter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    this.syncMenu(field);
  }

  protected syncMenu(field: HTMLInputElement | HTMLTextAreaElement): void {
    const caret = field.selectionStart ?? field.value.length;
    const triggerStart = field.value.lastIndexOf('$', caret - 1);
    if (triggerStart < 0) {
      this.closeMenu();
      return;
    }

    const fragment = field.value.slice(triggerStart + 1, caret);
    if (!/^[A-Za-z0-9_.]*$/.test(fragment)) {
      this.closeMenu();
      return;
    }

    this.triggerStart = triggerStart;
    this.triggerEnd = caret;
    this.overlayWidth = field.getBoundingClientRect().width;
    const previousToken = this.activeMainItem()?.token;
    this.filteredGroups = this.filterGroups(fragment.toLowerCase());
    this.menuOpen = this.filteredGroups.length > 0;
    this.syncActiveState(fragment.toLowerCase(), previousToken);
  }

  protected insertSuggestion(suggestion: VariableSuggestion): void {
    const current = this.value();
    const next = `${current.slice(0, this.triggerStart)}${suggestion.insertText}${current.slice(this.triggerEnd)}`;
    const caret = this.triggerStart + suggestion.insertText.length;
    this.valueChange.emit(next);
    this.closeMenu();
    setTimeout(() => {
      const field = this.field?.nativeElement;
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  }

  protected onBlur(): void {
    window.setTimeout(() => {
      if (!this.menuOpen) {
        this.validation = validateBuilderExpression(this.value(), this.suggestions(), this.validationMode());
        this.fieldBlur.emit();
      }
    }, 80);
  }

  protected isActiveMain(suggestion: VariableSuggestion): boolean {
    return this.activePanel === 'main' && this.activeMainItem()?.token === suggestion.token;
  }

  protected isActiveProperty(suggestion: VariableSuggestion): boolean {
    return this.activePanel === 'property' && this.activePropertyItem()?.token === suggestion.token;
  }

  protected openSubmenuItem(): VariableSuggestion | null {
    return this.menuItems().find((item) => item.token === this.openSubmenuToken && item.properties?.length) ?? null;
  }

  protected activateMain(suggestion: VariableSuggestion): void {
    const index = this.menuItems().findIndex((item) => item.token === suggestion.token);
    if (index < 0) return;
    this.activePanel = 'main';
    this.activeMenuIndex = index;
    this.activePropertyIndex = 0;
    this.setOpenSubmenu(suggestion.properties?.length ? suggestion.token : '');
    this.scrollActiveOptionIntoView();
  }

  protected activateProperty(suggestion: VariableSuggestion): void {
    const submenu = this.openSubmenuItem();
    const index = submenu?.properties?.findIndex((item) => item.token === suggestion.token) ?? -1;
    if (index < 0) return;
    this.activePanel = 'property';
    this.activePropertyIndex = index;
    this.scrollActiveOptionIntoView();
  }

  protected handleMainClick(suggestion: VariableSuggestion): void {
    if (suggestion.properties?.length) {
      this.activateMain(suggestion);
      return;
    }
    this.insertSuggestion(suggestion);
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this.filteredGroups = [];
    this.activePanel = 'main';
    this.activeMenuIndex = 0;
    this.activePropertyIndex = 0;
    this.setOpenSubmenu('');
    this.triggerStart = -1;
    this.triggerEnd = -1;
  }

  private filteredItems(): VariableSuggestion[] {
    return this.activePanel === 'property' ? this.submenuProperties() : this.menuItems();
  }

  private menuItems(): VariableSuggestion[] {
    return this.filteredGroups.flatMap((group) => group.items);
  }

  private submenuProperties(): VariableSuggestion[] {
    return this.openSubmenuItem()?.properties ?? [];
  }

  private activeMainItem(): VariableSuggestion | undefined {
    return this.menuItems()[this.activeMenuIndex];
  }

  private activePropertyItem(): VariableSuggestion | undefined {
    return this.submenuProperties()[this.activePropertyIndex];
  }

  private activeSuggestion(): VariableSuggestion | undefined {
    const property = this.activePanel === 'property' ? this.activePropertyItem() : undefined;
    if (property) return property;
    const item = this.activeMainItem();
    if (item?.properties?.length) {
      this.setOpenSubmenu(item.token);
      this.activePanel = 'property';
      this.activePropertyIndex = 0;
      this.scrollActiveOptionIntoView();
      return undefined;
    }
    return item;
  }

  private moveActive(direction: 1 | -1): void {
    if (this.activePanel === 'property') {
      const properties = this.submenuProperties();
      if (!properties.length) return;
      this.activePropertyIndex = (this.activePropertyIndex + direction + properties.length) % properties.length;
      this.scrollActiveOptionIntoView();
      return;
    }

    const items = this.menuItems();
    if (!items.length) return;
    this.activeMenuIndex = (this.activeMenuIndex + direction + items.length) % items.length;
    const item = this.activeMainItem();
    this.setOpenSubmenu(item?.properties?.length ? item.token : '');
    this.activePropertyIndex = 0;
    this.scrollActiveOptionIntoView();
  }

  private syncActiveState(fragment: string, previousToken?: string): void {
    const items = this.menuItems();
    if (!items.length) {
      this.closeMenu();
      return;
    }

    const previousIndex = items.findIndex((item) => item.token === previousToken);
    this.activeMenuIndex = previousIndex >= 0 ? previousIndex : 0;

    if (fragment.includes('.')) {
      const firstWithProperties = items.findIndex((item) => item.properties?.length);
      this.activeMenuIndex = firstWithProperties >= 0 ? firstWithProperties : 0;
      const item = this.activeMainItem();
      this.setOpenSubmenu(item?.properties?.length ? item.token : '');
      this.activePanel = this.openSubmenuToken ? 'property' : 'main';
      this.activePropertyIndex = 0;
      this.scrollActiveOptionIntoView();
      return;
    }

    this.activePanel = 'main';
    const active = this.activeMainItem();
    this.setOpenSubmenu(active?.properties?.length ? active.token : '');
    this.activePropertyIndex = 0;
    this.scrollActiveOptionIntoView();
  }

  private setOpenSubmenu(token: string): void {
    this.openSubmenuToken = token;
    if (token) this.updateSubmenuSide();
  }

  private isSubmenuEnterKey(key: string): boolean {
    return this.submenuSide === 'left' ? key === 'ArrowLeft' : key === 'ArrowRight';
  }

  private isSubmenuExitKey(key: string): boolean {
    return this.submenuSide === 'left' ? key === 'ArrowRight' : key === 'ArrowLeft';
  }

  private updateSubmenuSide(): void {
    const field = this.field?.nativeElement;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const mainWidth = this.overlayWidth || rect.width;
    const submenuWidth = 248;
    const gap = 8;
    const spaceRight = window.innerWidth - rect.left - mainWidth - gap;
    const spaceLeft = rect.left - gap;
    this.submenuSide = spaceRight < submenuWidth && spaceLeft >= submenuWidth ? 'left' : 'right';
  }

  private scrollActiveOptionIntoView(): void {
    window.setTimeout(() => {
      const token = this.activePanel === 'property' ? this.activePropertyItem()?.token : this.activeMainItem()?.token;
      if (!token) return;
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-autocomplete-owner="${this.autocompleteOwner}"] [data-autocomplete-token]`,
        ),
      );
      elements
        .find((element) => element.dataset['autocompleteToken'] === token)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  private filterGroups(fragment: string): VariableSuggestionGroup[] {
    const allGroups = this.suggestions();
    if (!fragment) return allGroups;
    return allGroups
      .map((group) => ({
        title: group.title,
        items: group.items
          .map((item) => this.filterItem(item, fragment))
          .filter((item): item is VariableSuggestion => item !== null),
      }))
      .filter((group) => group.items.length > 0);
  }

  private filterItem(item: VariableSuggestion, fragment: string): VariableSuggestion | null {
    const dotIndex = fragment.indexOf('.');
    const hasPropertyFragment = dotIndex >= 0;
    const rootFragment = hasPropertyFragment ? fragment.slice(0, dotIndex) : fragment;
    const propertyFragment = hasPropertyFragment ? fragment.slice(dotIndex + 1) : '';
    const root = item.token.slice(1).toLowerCase();
    const properties = item.properties ?? [];

    if (hasPropertyFragment) {
      if (!properties.length || !root.includes(rootFragment)) return null;
      const filteredProperties = properties.filter((property) =>
        this.propertyName(property).toLowerCase().includes(propertyFragment),
      );
      return filteredProperties.length ? { ...item, properties: filteredProperties } : null;
    }

    const rootMatches = root.includes(rootFragment);
    const filteredProperties = properties.filter((property) =>
      property.token.slice(1).toLowerCase().includes(rootFragment),
    );

    if (properties.length) {
      if (rootMatches) return { ...item, properties: filteredProperties.length ? filteredProperties : properties };
      if (filteredProperties.length) return { ...item, properties: filteredProperties };
      return null;
    }

    return rootMatches ? item : null;
  }

  private propertyName(item: VariableSuggestion): string {
    return item.token.split('.').pop() ?? item.token;
  }

  private pushHighlightedTokenSegments(
    segments: HighlightSegment[],
    token: string,
    suggestions: Map<string, VariableSuggestion>,
  ): void {
    const dotIndex = token.indexOf('.');
    if (dotIndex < 0) {
      this.pushHighlightedTokenSegment(segments, token, suggestions.get(token));
      return;
    }

    const rootToken = token.slice(0, dotIndex);
    const propertyToken = token.slice(dotIndex);
    this.pushHighlightedTokenSegment(segments, rootToken, suggestions.get(rootToken));
    this.pushHighlightedTokenSegment(segments, propertyToken, suggestions.get(token), token);
  }

  private pushHighlightedTokenSegment(
    segments: HighlightSegment[],
    text: string,
    suggestion: VariableSuggestion | undefined,
    titleToken = text,
  ): void {
    segments.push({
      text,
      kind: suggestion?.kind ?? 'unknown',
      title: suggestion
        ? `${titleToken} · ${this.variableKindLabel(suggestion.kind)}`
        : `${titleToken} · Unbekannte Variable`,
    });
  }

  private variableLookup(): Map<string, VariableSuggestion> {
    return new Map(
      this.suggestions().flatMap((group) =>
        group.items
          .flatMap((item) => [item, ...(item.properties ?? [])])
          .map((item) => [item.token, item] as const),
      ),
    );
  }
}
