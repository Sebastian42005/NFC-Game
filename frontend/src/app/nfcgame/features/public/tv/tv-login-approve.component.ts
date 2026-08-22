import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-tv-login-approve',
  imports: [FormsModule, NfcPublicShellComponent, RouterLink],
  templateUrl: './tv-login-approve.component.html',
})
export class NfcTvLoginApproveComponent {
  protected readonly auth = inject(NfcAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly requestId = signal(this.route.snapshot.paramMap.get('requestId') ?? '');
  protected readonly code = signal(this.route.snapshot.queryParamMap.get('code') ?? '');
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly loading = signal(false);
  protected readonly approved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly authDisabled = computed(() => !this.username().trim() || !this.password());

  constructor() {
    void this.auth.refresh().catch(() => null);
  }

  protected async login() {
    await this.runAuth(() => this.auth.login(this.username().trim(), this.password()));
  }

  protected async register() {
    await this.runAuth(() => this.auth.register(this.username().trim(), this.password()));
  }

  protected async approve() {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.approveTvLogin(this.requestId(), this.code());
      this.approved.set(true);
      window.setTimeout(() => void this.router.navigateByUrl('/nfc-game'), 1800);
    } catch {
      this.error.set('Der TV-Code konnte nicht bestätigt werden.');
    } finally {
      this.loading.set(false);
    }
  }

  private async runAuth(action: () => Promise<{ authenticated: boolean }>) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await action();
      if (!response.authenticated) throw new Error('not-authenticated');
      await this.approve();
    } catch {
      this.error.set('Login oder Registrierung fehlgeschlagen.');
    } finally {
      this.loading.set(false);
    }
  }
}
