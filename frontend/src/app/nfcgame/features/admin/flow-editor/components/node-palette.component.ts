import { Component, EventEmitter, Output } from '@angular/core';
import { BuilderNodeType } from '../../../../shared/models/nfc-game.models';
import { builderNodeDragDataType, builderNodeTypes, categoryLabels, categoryThemeFor } from './node-types';

@Component({
  selector: 'nfc-node-palette',
  styleUrl: './node-palette.component.scss',
  templateUrl: './node-palette.component.html',
})
export class NodePaletteComponent {
  @Output() addNode = new EventEmitter<BuilderNodeType>();
  protected readonly labels = categoryLabels;
  protected readonly categories = Object.keys(categoryLabels);
  protected nodesFor(category: string) {
    return builderNodeTypes.filter((node) => node.category === category);
  }

  protected startDrag(event: DragEvent, node: BuilderNodeType) {
    event.dataTransfer?.setData(builderNodeDragDataType, node.type);
    event.dataTransfer?.setData('text/plain', node.label);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  protected categoryTint(category: string) {
    return categoryThemeFor(category).tint;
  }

  protected categoryBorder(category: string) {
    return categoryThemeFor(category).border;
  }

  protected categoryAccent(category: string) {
    return categoryThemeFor(category).accent;
  }

  protected shortDescription(description: string) {
    return description.length > 72 ? `${description.slice(0, 72)}...` : description;
  }
}
