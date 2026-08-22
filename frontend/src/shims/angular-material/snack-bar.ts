import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  Type,
} from '@angular/core';
import { Observable, Subject } from 'rxjs';

export const MAT_SNACK_BAR_DATA = new InjectionToken<unknown>('MAT_SNACK_BAR_DATA');

export type MatSnackBarConfig<D = unknown> = {
  duration?: number;
  data?: D;
};

class MatSnackBarRef {
  private readonly dismissed$ = new Subject<void>();
  private closeFn: (() => void) | null = null;

  _bindClose(closeFn: () => void): void {
    this.closeFn = closeFn;
  }

  dismiss(): void {
    if (this.dismissed$.closed) {
      return;
    }

    this.dismissed$.next();
    this.dismissed$.complete();
    this.closeFn?.();
  }

  afterDismissed(): Observable<void> {
    return this.dismissed$.asObservable();
  }
}

@Injectable({ providedIn: 'root' })
export class MatSnackBar {
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);
  private currentRef: MatSnackBarRef | null = null;

  openFromComponent<T, D = unknown>(
    component: Type<T>,
    config: MatSnackBarConfig<D> = {},
  ): MatSnackBarRef {
    this.dismiss();

    const ref = new MatSnackBarRef();
    const container = document.createElement('div');
    container.classList.add('ui-snackbar-container');
    document.body.appendChild(container);

    const injector = Injector.create({
      parent: this.envInjector,
      providers: [{ provide: MAT_SNACK_BAR_DATA, useValue: config.data ?? null }],
    });

    const componentRef: ComponentRef<T> = createComponent(component, {
      environmentInjector: this.envInjector,
      elementInjector: injector,
    });

    this.appRef.attachView(componentRef.hostView);
    container.appendChild(componentRef.location.nativeElement);

    const cleanup = () => {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
      container.remove();
      if (this.currentRef === ref) {
        this.currentRef = null;
      }
    };

    ref._bindClose(cleanup);
    this.currentRef = ref;

    if (config.duration && config.duration > 0) {
      window.setTimeout(() => ref.dismiss(), config.duration);
    }

    return ref;
  }

  dismiss(): void {
    this.currentRef?.dismiss();
  }
}

