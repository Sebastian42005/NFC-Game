import { Directive, HostBinding, Input, NgModule } from '@angular/core';

@Directive({
  selector: '[matTooltip]',
  standalone: true,
})
export class MatTooltip {
  @Input() matTooltip: string | null = null;

  @HostBinding('class.nfc-tooltip-trigger')
  get hasTooltip(): boolean {
    return !!this.matTooltip?.trim();
  }

  @HostBinding('attr.data-tooltip')
  get tooltipText(): string | null {
    return this.matTooltip;
  }
}

@NgModule({
  imports: [MatTooltip],
  exports: [MatTooltip],
})
export class MatTooltipModule {}
