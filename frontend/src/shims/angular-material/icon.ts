import { Directive, NgModule } from '@angular/core';

@Directive({
  selector: 'mat-icon',
  standalone: true,
  host: {
    class: 'mat-icon material-icons',
    '[attr.aria-hidden]': 'true',
  },
})
export class MatIcon {}

@NgModule({
  imports: [MatIcon],
  exports: [MatIcon],
})
export class MatIconModule {}
