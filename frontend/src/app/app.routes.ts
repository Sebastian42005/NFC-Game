import { Routes } from '@angular/router';
import { nfcAdminGuard, nfcAdminRoleGuard } from './nfcgame/core/auth/nfc-admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'nfc-game', pathMatch: 'full' },
  {
    path: 'nfc-reader',
    loadComponent: () =>
      import('./nfcgame/features/public/product-showcase/product-showcase.component').then(
        (m) => m.NfcProductShowcaseComponent,
      ),
  },
  {
    path: 'product',
    redirectTo: 'nfc-reader',
    pathMatch: 'full',
  },
  {
    path: 'nfc-game',
    loadComponent: () =>
      import('./nfcgame/features/public/dashboard/dashboard.component').then((m) => m.NfcDashboardComponent),
  },
  {
    path: 'nfc-game/sessions/:id',
    loadComponent: () =>
      import('./nfcgame/features/public/sessions/session-detail.component').then((m) => m.NfcSessionDetailComponent),
  },
  {
    path: 'nfc-game/product',
    redirectTo: 'nfc-reader',
    pathMatch: 'full',
  },
  {
    path: 'nfc-game/leaderboard',
    loadComponent: () =>
      import('./nfcgame/features/public/leaderboard/leaderboard.component').then((m) => m.NfcLeaderboardComponent),
  },
  {
    path: 'nfc-game/game-night',
    loadComponent: () =>
      import('./nfcgame/features/public/game-night/game-night.component').then((m) => m.NfcGameNightComponent),
  },
  {
    path: 'nfc-game/game-night/:id',
    loadComponent: () =>
      import('./nfcgame/features/public/game-night/game-night.component').then((m) => m.NfcGameNightComponent),
  },
  {
    path: 'nfc-game/players',
    loadComponent: () =>
      import('./nfcgame/features/public/players/player-list.component').then((m) => m.NfcPlayerListComponent),
  },
  {
    path: 'nfc-game/players/:id',
    loadComponent: () =>
      import('./nfcgame/features/public/players/player-detail.component').then((m) => m.NfcPlayerDetailComponent),
  },
  {
    path: 'nfc-game/games',
    loadComponent: () =>
      import('./nfcgame/features/public/games/game-list.component').then((m) => m.NfcGameListComponent),
  },
  {
    path: 'nfc-game/games/:id',
    loadComponent: () =>
      import('./nfcgame/features/public/games/game-detail.component').then((m) => m.NfcGameDetailComponent),
  },
  {
    path: 'nfc-game/sounds',
    loadComponent: () =>
      import('./nfcgame/features/public/sounds/sound-library.component').then((m) => m.NfcSoundLibraryComponent),
  },
  {
    path: 'nfc-game/settings',
    redirectTo: 'nfc-game/admin/settings',
    pathMatch: 'full',
  },
  {
    path: 'nfc-game/simulation',
    loadComponent: () =>
      import('./nfcgame/features/public/simulation/simulation.component').then((m) => m.NfcSimulationComponent),
  },
  {
    path: 'nfc-game/history',
    loadComponent: () =>
      import('./nfcgame/features/public/history/history.component').then((m) => m.NfcHistoryComponent),
  },
  {
    path: 'nfc-game/tv',
    loadComponent: () =>
      import('./nfcgame/features/public/tv/tv-view.component').then((m) => m.NfcTvViewComponent),
  },
  {
    path: 'nfc-game/tv-login/:requestId',
    loadComponent: () =>
      import('./nfcgame/features/public/tv/tv-login-approve.component').then((m) => m.NfcTvLoginApproveComponent),
  },
  {
    path: 'nfc-game/legal',
    redirectTo: 'nfc-game/legal/datenschutz',
    pathMatch: 'full',
  },
  {
    path: 'nfc-game/legal/impressum',
    data: { legalPage: 'impressum' },
    loadComponent: () =>
      import('./nfcgame/features/public/legal/legal-page.component').then((m) => m.NfcLegalPageComponent),
  },
  {
    path: 'nfc-game/legal/datenschutz',
    data: { legalPage: 'datenschutz' },
    loadComponent: () =>
      import('./nfcgame/features/public/legal/legal-page.component').then((m) => m.NfcLegalPageComponent),
  },
  {
    path: 'nfc-game/legal/cookies',
    data: { legalPage: 'cookies' },
    loadComponent: () =>
      import('./nfcgame/features/public/legal/legal-page.component').then((m) => m.NfcLegalPageComponent),
  },
  {
    path: 'nfc-game/legal/nutzungsbedingungen',
    data: { legalPage: 'nutzungsbedingungen' },
    loadComponent: () =>
      import('./nfcgame/features/public/legal/legal-page.component').then((m) => m.NfcLegalPageComponent),
  },
  {
    path: 'nfc-game/admin/login',
    loadComponent: () =>
      import('./nfcgame/features/admin/login/admin-login.component').then((m) => m.NfcAdminLoginComponent),
  },
  {
    path: 'nfc-game/admin',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/admin-dashboard.component').then((m) => m.NfcAdminDashboardComponent),
  },
  {
    path: 'nfc-game/admin/players',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/players/admin-players.component').then((m) => m.NfcAdminPlayersComponent),
  },
  {
    path: 'nfc-game/admin/players/new',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/players/player-form.component').then((m) => m.NfcPlayerFormComponent),
  },
  {
    path: 'nfc-game/admin/players/:id',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/players/player-form.component').then((m) => m.NfcPlayerFormComponent),
  },
  {
    path: 'nfc-game/admin/cards',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/cards/admin-cards.component').then((m) => m.NfcAdminCardsComponent),
  },
  {
    path: 'nfc-game/admin/devices',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/devices/admin-devices.component').then((m) => m.NfcAdminDevicesComponent),
  },
  {
    path: 'nfc-game/admin/settings',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/settings/admin-settings.component').then((m) => m.NfcAdminSettingsComponent),
  },
  {
    path: 'nfc-game/admin/audio-test',
    canActivate: [nfcAdminRoleGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/audio-test/audio-test.component').then((m) => m.NfcAudioTestComponent),
  },
  {
    path: 'nfc-game/admin/accounts',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/accounts/admin-accounts.component').then((m) => m.NfcAdminAccountsComponent),
  },
  {
    path: 'nfc-game/admin/game-templates',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/game-templates/admin-game-templates.component').then(
        (m) => m.NfcAdminGameTemplatesComponent,
      ),
  },
  {
    path: 'nfc-game/admin/sounds',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/sounds/admin-sound-library.component').then(
        (m) => m.NfcAdminSoundLibraryComponent,
      ),
  },
  {
    path: 'nfc-game/admin/game-templates/new/flow',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/flow-editor/flow-editor.component').then((m) => m.NfcFlowEditorComponent),
  },
  {
    path: 'nfc-game/admin/game-templates/new',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/game-templates/game-template-form.component').then(
        (m) => m.NfcGameTemplateFormComponent,
      ),
  },
  {
    path: 'nfc-game/admin/game-templates/:id/flow',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/flow-editor/flow-editor.component').then((m) => m.NfcFlowEditorComponent),
  },
  {
    path: 'nfc-game/admin/game-templates/:id',
    canActivate: [nfcAdminGuard],
    loadComponent: () =>
      import('./nfcgame/features/admin/game-templates/game-template-form.component').then(
        (m) => m.NfcGameTemplateFormComponent,
      ),
  },
  { path: '**', redirectTo: 'nfc-game' },
];
