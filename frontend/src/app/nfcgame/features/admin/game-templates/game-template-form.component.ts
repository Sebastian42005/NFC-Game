import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { MatTooltip } from '../../../../../shims/angular-material/tooltip';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import {
  DashboardMetricDisplayType,
  DashboardStatusDisplayType,
  GameBasicRequest,
  NfcCardDto,
} from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';
import {
  GameBuilderTemplateId,
  gameBuilderTemplates,
  pendingGameBuilderDraftKey,
  PendingGameBuilderDraft,
} from '../flow-editor/components/flow-templates';

@Component({
  selector: 'nfc-game-template-form',
  imports: [FormsModule, MatSelectModule, MatIcon, MatTooltip, NfcAdminShellComponent],
  templateUrl: './game-template-form.component.html',
})
export class NfcGameTemplateFormComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(NfcToastService);
  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly title = computed(() => (this.id ? 'Basisdaten bearbeiten' : 'Spiel als Entwurf anlegen'));
  protected readonly unassignedCards = signal<NfcCardDto[]>([]);
  protected readonly templates = gameBuilderTemplates;
  protected readonly selectedTemplateId = signal<GameBuilderTemplateId>('rounds');
  protected readonly error = signal<string | null>(null);
  protected readonly selectedImage = signal<{ file: File; previewUrl: string } | null>(null);
  protected readonly existingImagePreviewUrl = signal<string | null>(null);
  protected readonly metricDisplayOptions: { value: DashboardMetricDisplayType; label: string }[] = [
    { value: 'RACE_BAR', label: 'Rennbalken' },
    { value: 'COMPACT_LIST', label: 'Kompakte Liste' },
    { value: 'PODIUM', label: 'Podium' },
    { value: 'TILE_GRID', label: 'Kacheln' },
  ];
  protected readonly statusDisplayOptions: { value: DashboardStatusDisplayType; label: string }[] = [
    { value: 'PROGRESS_BAR', label: 'Balken' },
    { value: 'KPI', label: 'KPI' },
    { value: 'RING', label: 'Ring' },
    { value: 'PILL', label: 'Pill' },
  ];
  protected readonly form = signal<GameBasicRequest>({
    name: '',
    description: '',
    imageUrl: '',
    cardUid: this.route.snapshot.queryParamMap.get('cardUid') ?? '',
    active: true,
    globalWinnerPoints: 5,
    globalSecondPlacePoints: null,
    globalThirdPlacePoints: null,
    dashboardMetricSource: 'points',
    dashboardMetricLabel: 'Punkte',
    dashboardMetricSuffix: '',
    dashboardMetricSortDirection: 'DESC',
    dashboardMetricDisplayType: 'RACE_BAR',
    dashboardMetricMaxSource: '',
    dashboardStatusSource: 'currentRound',
    dashboardStatusLabel: 'Runde',
    dashboardStatusSuffix: '',
    dashboardStatusMaxSource: 'roundLimit',
    dashboardStatusDisplayType: 'PROGRESS_BAR',
  });
  protected readonly previewImageUrl = computed(() => this.selectedImage()?.previewUrl || this.existingImagePreviewUrl());
  protected readonly metricDisplayType = computed(() => (this.form().dashboardMetricDisplayType || 'RACE_BAR').toString().toUpperCase());
  protected readonly statusDisplayType = computed(() => (this.form().dashboardStatusDisplayType || 'PROGRESS_BAR').toString().toUpperCase());
  protected readonly previewMetricLabel = computed(() => this.form().dashboardMetricLabel?.trim() ?? '');
  protected readonly previewMetricSuffix = computed(() => this.form().dashboardMetricSuffix?.trim() || '');
  protected readonly previewMetricMax = computed(() => {
    const max = Number(this.form().dashboardMetricMaxSource ?? 0);
    return Number.isFinite(max) && max > 0 ? max : 0;
  });
  protected readonly previewStatusLabel = computed(() => this.form().dashboardStatusLabel?.trim() ?? '');
  protected readonly previewStatusSuffix = computed(() => this.form().dashboardStatusSuffix?.trim() || '');
  protected readonly previewHasTopStatus = computed(() => !!this.form().dashboardStatusSource?.trim());
  protected readonly previewHasStatusMax = computed(() => this.previewHasTopStatus() && !!this.form().dashboardStatusMaxSource?.trim());
  protected readonly previewStatusMax = computed(() => this.previewHasStatusMax() ? 5 : 0);
  protected readonly previewStatusProgress = computed(() => this.previewStatusMax() ? Math.min(100, Math.round((3 / this.previewStatusMax()) * 100)) : 100);
  protected readonly previewStatusValue = computed(() => {
    if (!this.previewHasTopStatus()) return '';
    const suffix = this.previewStatusSuffix();
    const value = this.previewStatusMax() ? `3 / ${this.previewStatusMax()}` : '3';
    return suffix ? `${value} ${suffix}` : value;
  });
  protected readonly previewRingStyle = computed(() => {
    const progress = this.previewStatusProgress();
    return `conic-gradient(var(--nfc-accent-strong) ${progress}%, var(--color-white-12) 0)`;
  });
  protected readonly previewTeams = computed(() => {
    const suffix = this.previewMetricSuffix();
    const direction = (this.form().dashboardMetricSortDirection ?? 'DESC').toString().toUpperCase();
    const values = [
      { name: 'Team Nord', value: 12 },
      { name: 'Team West', value: 8 },
      { name: 'Team Sued', value: 5 },
    ].sort((a, b) => direction === 'ASC' ? a.value - b.value : b.value - a.value);
    const max = Math.max(...values.map((team) => team.value));
    const min = Math.min(...values.map((team) => team.value));
    const range = max - min;
    const metricMax = this.previewMetricMax();
    return values.map((team, index) => ({
      ...team,
      rank: index + 1,
      percent: previewRaceBarPercent(team.value, metricMax, min, max, range, direction),
      isLeader: index === 0,
      displayValue: suffix ? `${team.value} ${suffix}` : `${team.value}`,
    }));
  });

  constructor() {
    void this.loadUnassignedCards();
    if (this.id) void this.load(this.id);
  }

  protected patch(value: Partial<GameBasicRequest>) {
    this.form.set({ ...this.form(), ...value });
  }

  protected selectTemplate(templateId: GameBuilderTemplateId) {
    this.selectedTemplateId.set(templateId);
    this.patch(dashboardMetricDefaults(templateId));
  }

  protected onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.error.set(null);
    if (!file) {
      this.selectedImage.set(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.error.set('Bitte wähle eine Bilddatei aus.');
      input.value = '';
      return;
    }
    this.selectedImage.set({ file, previewUrl: URL.createObjectURL(file) });
    this.patch({ imageUrl: '' });
  }

  protected async save() {
    this.error.set(null);
    try {
      if (!this.id) {
        const pendingDraft: PendingGameBuilderDraft = {
          basic: this.form(),
          templateId: this.selectedTemplateId(),
          image: await this.pendingImage(),
        };
        localStorage.setItem(pendingGameBuilderDraftKey, JSON.stringify(pendingDraft));
        await this.router.navigateByUrl('/nfc-game/admin/game-templates/new/flow');
        return;
      }

      let game = await firstValueFrom(this.api.updateGame(this.id, this.form()));
      const image = this.selectedImage();
      if (image) {
        game = await firstValueFrom(this.api.uploadGameImage(game.id, image.file, image.file.name));
      }
      this.toasts.success('Spiel wurde gespeichert.');
      await this.router.navigateByUrl(`/nfc-game/admin/game-templates/${game.id}/flow`);
    } catch {
      this.error.set('Spiel konnte nicht gespeichert werden.');
      this.toasts.error('Spiel konnte nicht gespeichert werden.');
    }
  }

  private async load(id: string) {
    const game = await firstValueFrom(this.api.getGame(id));
    const backendImageUrl = game.imageUrl?.includes('/api/public/games/') ? game.imageUrl : '';
    this.form.set({
      name: game.name,
      description: game.description,
      imageUrl: backendImageUrl ? '' : game.imageUrl,
      cardUid: game.cardUid ?? '',
      active: game.active,
      globalWinnerPoints: game.globalWinnerPoints ?? 5,
      globalSecondPlacePoints: game.globalSecondPlacePoints ?? null,
      globalThirdPlacePoints: game.globalThirdPlacePoints ?? null,
      dashboardMetricSource: game.dashboardMetricSource ?? '',
      dashboardMetricLabel: game.dashboardMetricLabel ?? '',
      dashboardMetricSuffix: game.dashboardMetricSuffix ?? '',
      dashboardMetricSortDirection: game.dashboardMetricSortDirection ?? 'DESC',
      dashboardMetricDisplayType: game.dashboardMetricDisplayType ?? 'RACE_BAR',
      dashboardMetricMaxSource: game.dashboardMetricMaxSource ?? '',
      dashboardStatusSource: game.dashboardStatusSource ?? '',
      dashboardStatusLabel: game.dashboardStatusLabel ?? '',
      dashboardStatusSuffix: game.dashboardStatusSuffix ?? '',
      dashboardStatusMaxSource: game.dashboardStatusMaxSource ?? '',
      dashboardStatusDisplayType: game.dashboardStatusDisplayType ?? 'PROGRESS_BAR',
    });
    this.existingImagePreviewUrl.set(game.imageUrl || null);
  }

  private async loadUnassignedCards() {
    this.unassignedCards.set(await firstValueFrom(this.api.unassignedCards()));
  }

  private async pendingImage() {
    const image = this.selectedImage();
    if (!image) return null;
    return {
      dataUrl: await this.readAsDataUrl(image.file),
      fileName: image.file.name,
      contentType: image.file.type,
    };
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}

function previewRaceBarPercent(value: number, metricMax: number, min: number, max: number, range: number, direction: string) {
  if (value <= 0) return 0;
  if (metricMax) return Math.max(0, Math.min(100, Math.round((value / metricMax) * 100)));
  if (range === 0) return 100;
  const relativeValue = direction === 'ASC' ? max - value : value - min;
  return Math.max(12, Math.round((relativeValue / range) * 88) + 12);
}

function dashboardMetricDefaults(templateId: GameBuilderTemplateId): Partial<GameBasicRequest> {
  switch (templateId) {
    case 'monopoly':
      return {
        dashboardMetricSource: 'money',
        dashboardMetricLabel: 'Geld',
        dashboardMetricSuffix: '€',
        dashboardMetricSortDirection: 'DESC',
        dashboardMetricDisplayType: 'COMPACT_LIST',
        dashboardMetricMaxSource: '',
        dashboardStatusSource: 'money',
        dashboardStatusLabel: 'Top-Konto',
        dashboardStatusSuffix: '€',
        dashboardStatusMaxSource: '',
        dashboardStatusDisplayType: 'KPI',
      };
    case 'cabo':
      return {
        dashboardMetricSource: 'points',
        dashboardMetricLabel: 'Punkte',
        dashboardMetricSuffix: 'Punkte',
        dashboardMetricSortDirection: 'ASC',
        dashboardMetricDisplayType: 'TILE_GRID',
        dashboardMetricMaxSource: 'pointLimit',
        dashboardStatusSource: 'points',
        dashboardStatusLabel: 'Niedrigster Wert',
        dashboardStatusSuffix: 'Punkte',
        dashboardStatusMaxSource: '',
        dashboardStatusDisplayType: 'PILL',
      };
    case 'rounds':
    case 'single_round':
      return {
        dashboardMetricSource: 'points',
        dashboardMetricLabel: 'Punkte',
        dashboardMetricSuffix: '',
        dashboardMetricSortDirection: 'DESC',
        dashboardMetricDisplayType: 'RACE_BAR',
        dashboardMetricMaxSource: '',
        dashboardStatusSource: 'currentRound',
        dashboardStatusLabel: 'Runde',
        dashboardStatusSuffix: '',
        dashboardStatusMaxSource: 'roundLimit',
        dashboardStatusDisplayType: 'PROGRESS_BAR',
      };
    case 'blank':
    default:
      return {
        dashboardMetricSource: 'points',
        dashboardMetricLabel: 'Punkte',
        dashboardMetricSuffix: '',
        dashboardMetricSortDirection: 'DESC',
        dashboardMetricDisplayType: 'RACE_BAR',
        dashboardMetricMaxSource: '',
        dashboardStatusSource: 'currentRound',
        dashboardStatusLabel: 'Runde',
        dashboardStatusSuffix: '',
        dashboardStatusMaxSource: 'roundLimit',
        dashboardStatusDisplayType: 'PROGRESS_BAR',
      };
  }
}
