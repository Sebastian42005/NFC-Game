import { Component, EventEmitter, input, Output } from '@angular/core';

@Component({
  selector: 'nfc-builder-toolbar',
  templateUrl: './builder-toolbar.component.html',
})
export class BuilderToolbarComponent {
  readonly eyebrow = input('Visual Builder');
  readonly title = input('Flow');
  readonly canRequestPublication = input(false);
  @Output() save = new EventEmitter<void>();
  @Output() validate = new EventEmitter<void>();
  @Output() requestPublication = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
}
