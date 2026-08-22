import {
  AfterContentInit,
  AfterViewInit,
  Component,
  ContentChildren,
  Directive,
  ElementRef,
  Input,
  NgModule,
  OnChanges,
  OnDestroy,
  QueryList,
} from '@angular/core';
import { Subscription } from 'rxjs';

let autoIdCounter = 0;

@Directive({
  selector: 'mat-option',
  standalone: true,
})
export class MatOption {
  @Input() value: string | null = null;
}

@Component({
  selector: 'mat-autocomplete',
  standalone: true,
  exportAs: 'matAutocomplete',
  template: `
    <datalist [id]="id">
      @for (value of optionValues; track value) {
        <option [value]="value"></option>
      }
    </datalist>
  `,
  host: {
    style: 'display: none;',
  },
})
export class MatAutocomplete implements AfterContentInit, OnDestroy {
  readonly id = `ui-autocomplete-${++autoIdCounter}`;
  optionValues: string[] = [];
  private readonly updateSub = new Subscription();

  @ContentChildren(MatOption, { descendants: true })
  private readonly options!: QueryList<MatOption>;

  ngAfterContentInit(): void {
    this.rebuildValues();
    this.updateSub.add(this.options.changes.subscribe(() => this.rebuildValues()));
  }

  ngOnDestroy(): void {
    this.updateSub.unsubscribe();
  }

  private rebuildValues(): void {
    this.optionValues = this.options
      .toArray()
      .map((option) => (option.value ?? '').trim())
      .filter((value) => value.length > 0);
  }
}

@Directive({
  selector: 'input[matAutocomplete]',
  standalone: true,
})
export class MatAutocompleteTrigger implements AfterViewInit, OnChanges {
  @Input('matAutocomplete') matAutocomplete: MatAutocomplete | null = null;

  constructor(private readonly host: ElementRef<HTMLInputElement>) {}

  ngAfterViewInit(): void {
    this.bindAutocomplete();
  }

  ngOnChanges(): void {
    this.bindAutocomplete();
  }

  private bindAutocomplete(): void {
    if (!this.matAutocomplete) {
      return;
    }

    this.host.nativeElement.setAttribute('list', this.matAutocomplete.id);
  }
}

@NgModule({
  imports: [MatAutocomplete, MatOption, MatAutocompleteTrigger],
  exports: [MatAutocomplete, MatOption, MatAutocompleteTrigger],
})
export class MatAutocompleteModule {}
