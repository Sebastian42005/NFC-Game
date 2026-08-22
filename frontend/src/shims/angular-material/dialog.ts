import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  NgModule,
  Type,
} from '@angular/core';
import { Observable, Subject } from 'rxjs';

export const MAT_DIALOG_DATA = new InjectionToken<any>('MAT_DIALOG_DATA');

export type MatDialogConfig<D = unknown> = {
  data?: D;
  panelClass?: string | string[];
  backdropClass?: string | string[];
  width?: string;
  maxWidth?: string;
  autoFocus?: boolean;
};

export class MatDialogRef<T = unknown, R = any> {
  private readonly closed$ = new Subject<R | undefined>();
  private closeFn: (() => void) | null = null;
  componentRef: ComponentRef<T> | null = null;

  afterClosed(): Observable<R | undefined> {
    return this.closed$.asObservable();
  }

  _bindClose(closeFn: () => void): void {
    this.closeFn = closeFn;
  }

  close(result?: R): void {
    if (this.closed$.closed) {
      return;
    }

    this.closed$.next(result);
    this.closed$.complete();
    this.closeFn?.();
  }
}

@Injectable({ providedIn: 'root' })
export class MatDialog {
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);

  open<T, D = unknown, R = any>(
    component: Type<T>,
    config: MatDialogConfig<D> = {},
  ): MatDialogRef<T, R> {
    const dialogRef = new MatDialogRef<T, R>();
    const backdrop = document.createElement('div');
    backdrop.classList.add('ui-dialog-backdrop');

    this.applyClassList(backdrop, config.backdropClass);

    const panel = document.createElement('div');
    panel.classList.add('ui-dialog-panel');
    this.applyClassList(panel, config.panelClass);

    if (config.width) {
      panel.style.width = config.width;
    }
    if (config.maxWidth) {
      panel.style.maxWidth = config.maxWidth;
    }

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const injector = Injector.create({
      parent: this.envInjector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: config.data ?? null },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });

    const componentRef = createComponent(component, {
      environmentInjector: this.envInjector,
      elementInjector: injector,
    });

    dialogRef.componentRef = componentRef;
    this.appRef.attachView(componentRef.hostView);
    panel.appendChild(componentRef.location.nativeElement);

    if (config.autoFocus !== false) {
      queueMicrotask(() => {
        const focusable = panel.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
      });
    }

    const cleanup = () => {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
      backdrop.remove();
    };

    dialogRef._bindClose(cleanup);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        dialogRef.close();
      }
    });

    return dialogRef;
  }

  private applyClassList(element: HTMLElement, classList?: string | string[]): void {
    if (!classList) {
      return;
    }

    const classes = Array.isArray(classList) ? classList : [classList];
    for (const className of classes) {
      element.classList.add(className);
    }
  }
}

@NgModule({})
export class MatDialogModule {}
