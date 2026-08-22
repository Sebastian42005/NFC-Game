import { Directive, HostBinding, Input, NgModule } from '@angular/core';

@Directive({
  selector: '[matTooltip]',
  standalone: true,
})
export class MatTooltip {
  @Input() matTooltip: string | null = null;

  @HostBinding('attr.title')
  get title(): string | null {
    return this.matTooltip;
  }
}

@NgModule({
  imports: [MatTooltip],
  exports: [MatTooltip],
})
export class MatTooltipModule {}

