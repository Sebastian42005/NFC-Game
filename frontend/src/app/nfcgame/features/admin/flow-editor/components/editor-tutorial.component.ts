import { Component, input } from '@angular/core';
import { builderNodeTypes, categoryLabels } from './node-types';

@Component({
  selector: 'nfc-editor-tutorial',
  templateUrl: './editor-tutorial.component.html',
})
export class EditorTutorialComponent {
  readonly compact = input(false);
  protected readonly labels = categoryLabels;
  protected readonly categories = Object.keys(categoryLabels);
  protected readonly dynamicMenuExample = '$teams, Bank';
  protected readonly amountExample = '$amount';
  protected readonly livesExample = '$lives';
  protected readonly currentMinusAmountExample = '$current - $amount';
  protected readonly currentPlusAmountExample = '$current + $amount';
  protected readonly currentPlusScoreExample = '$current + $score';
  protected readonly timelineExample = '$payer hat $receiver $amount$currency überwiesen.';

  protected nodesFor(category: string) {
    return builderNodeTypes.filter((node) => node.category === category);
  }
}
