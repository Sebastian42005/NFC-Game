import { Directive, NgModule } from '@angular/core';

@Directive({
  selector: 'input[matInput], textarea[matInput]',
  standalone: true,
  host: {
    class: 'ui-input',
  },
})
export class MatInput {}

@NgModule({
  imports: [MatInput],
  exports: [MatInput],
})
export class MatInputModule {}

