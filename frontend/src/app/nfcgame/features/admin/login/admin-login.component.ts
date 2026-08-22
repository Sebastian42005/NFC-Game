import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { NfcThemeService } from '../../../shared/ui/nfc-theme.service';

@Component({
  selector: 'nfc-admin-login',
  imports: [FormsModule],
  templateUrl: './admin-login.component.html',
})
export class NfcAdminLoginComponent {
  private readonly auth = inject(NfcAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(NfcThemeService);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly theme = this.themeService.theme;
  protected readonly themeLabel = computed(() => (this.theme() === 'dark' ? 'Light Mode' : 'Dark Mode'));

  protected toggleTheme() {
    this.themeService.toggle();
  }

  protected async submit() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.auth.login(this.username().trim(), this.password());
      if (!response.authenticated) {
        throw new Error('not-authenticated');
      }
      await this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirectTo') || '/nfc-game/admin');
    } catch {
      this.error.set('Login fehlgeschlagen.');
    } finally {
      this.loading.set(false);
    }
  }
}
