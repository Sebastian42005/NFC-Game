import { Component, input, NgModule } from '@angular/core';

@Component({
  selector: 'mat-progress-bar',
  standalone: true,
  template: `
    <div class="ui-progress-track">
      <div class="ui-progress-value" [style.width.%]="safeValue()"></div>
    </div>
  `,
})
export class MatProgressBar {
  readonly mode = input<'determinate' | 'indeterminate'>('determinate');
  readonly value = input<number>(0);

  safeValue(): number {
    const raw = this.value();
    if (!Number.isFinite(raw)) {
      return 0;
    }

    return Math.max(0, Math.min(100, raw));
  }
}

@NgModule({
  imports: [MatProgressBar],
  exports: [MatProgressBar],
})
export class MatProgressBarModule {}

