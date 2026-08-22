import { Component, NgModule } from '@angular/core';

@Component({
  selector: 'mat-form-field',
  standalone: true,
  template: `<div class="ui-form-field"><ng-content></ng-content></div>`,
})
export class MatFormField {}

@Component({
  selector: 'mat-label',
  standalone: true,
  template: `<label class="ui-form-label"><ng-content></ng-content></label>`,
})
export class MatLabel {}

@NgModule({
  imports: [MatFormField, MatLabel],
  exports: [MatFormField, MatLabel],
})
export class MatFormFieldModule {}
