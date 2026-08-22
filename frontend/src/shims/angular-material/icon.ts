import { AfterViewInit, Directive, ElementRef, NgModule } from '@angular/core';

const ICON_MAP: Record<string, string> = {
  add: '+',
  add_a_photo: '📷',
  auto_fix_high: '✨',
  autorenew: '↻',
  check_circle: '✔',
  close: '✕',
  cloud_upload: '☁↑',
  content_paste: '📋',
  delete: '🗑',
  download: '⬇',
  drag_indicator: '⋮⋮',
  edit: '✎',
  image: '🖼',
  info: 'ℹ',
  open_in_new: '↗',
  play_arrow: '▶',
  progress_activity: '◌',
  dark_mode: '◐',
  person: '●',
  quiz: '?',
  search: '⌕',
  shuffle: '🔀',
  sunny: '☼',
  tune: '≡',
  tv: '▣',
  upload_file: '⤴',
  warning_amber: '⚠',
};

@Directive({
  selector: 'mat-icon',
  standalone: true,
  host: {
    class: 'mat-icon',
    '[attr.aria-hidden]': 'true',
  },
})
export class MatIcon implements AfterViewInit {
  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const host = this.elementRef.nativeElement;
    const iconName = (host.textContent ?? '').trim();
    const mapped = ICON_MAP[iconName] ?? iconName;

    host.textContent = mapped;
  }
}

@NgModule({
  imports: [MatIcon],
  exports: [MatIcon],
})
export class MatIconModule {}
