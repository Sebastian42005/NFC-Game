import { Directive, NgModule } from '@angular/core';

@Directive({
  selector: 'button[mat-icon-button]',
  standalone: true,
  host: {
    class: 'ui-icon-button',
    type: 'button',
  },
})
export class MatIconButton {}

@NgModule({
  imports: [MatIconButton],
  exports: [MatIconButton],
})
export class MatButtonModule {}

