import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import {
  AdminAccountSummaryDto,
  AdminLoginRequest,
  AdminLoginResponse,
  CardAssignRequest,
  DeviceClaimRequest,
  DeviceDto,
  DeviceRequest,
  FlowValidationDto,
  GameBasicRequest,
  GameFlowDto,
  GameTemplateDto,
  GameTemplateRequest,
  NfcCardDto,
  PlayerDto,
  PlayerRequest,
  SoundDto,
} from '../../shared/models/nfc-game.models';
import { buildApiUrl, resolveBackendAssetUrl } from './nfc-api-url';

const apiBase = buildApiUrl('/admin');

@Injectable({ providedIn: 'root' })
export class NfcAdminApiService {
  private readonly http = inject(HttpClient);

  login(request: AdminLoginRequest) {
    return this.http.post<AdminLoginResponse>(`${apiBase}/auth/login`, request);
  }

  accounts() {
    return this.http.get<AdminAccountSummaryDto[]>(`${apiBase}/accounts`);
  }

  deleteAccount(id: number) {
    return this.http.delete<void>(`${apiBase}/accounts/${encodeURIComponent(id)}`);
  }

  players() {
    return this.http.get<PlayerDto[]>(`${apiBase}/players`).pipe(map((players) => players.map(resolvePlayerImageUrl)));
  }

  createPlayer(request: PlayerRequest) {
    return this.http.post<PlayerDto>(`${apiBase}/players`, request).pipe(map(resolvePlayerImageUrl));
  }

  updatePlayer(id: string, request: PlayerRequest) {
    return this.http.put<PlayerDto>(`${apiBase}/players/${encodeURIComponent(id)}`, request).pipe(map(resolvePlayerImageUrl));
  }

  updatePlayerActive(id: string, active: boolean) {
    return this.http.patch<PlayerDto>(`${apiBase}/players/${encodeURIComponent(id)}/active`, { active }).pipe(map(resolvePlayerImageUrl));
  }

  uploadPlayerImage(id: string, file: Blob, fileName = 'player-image') {
    const formData = new FormData();
    formData.append('file', file, fileName);
    return this.http.post<PlayerDto>(`${apiBase}/players/${encodeURIComponent(id)}/image`, formData).pipe(map(resolvePlayerImageUrl));
  }

  deletePlayer(id: string) {
    return this.http.delete<void>(`${apiBase}/players/${encodeURIComponent(id)}`);
  }

  deleteSession(id: string) {
    return this.http.delete<void>(`${apiBase}/sessions/${encodeURIComponent(id)}`);
  }

  cards() {
    return this.http.get<NfcCardDto[]>(`${apiBase}/cards`);
  }

  unassignedCards() {
    return this.http.get<NfcCardDto[]>(`${apiBase}/cards/unassigned`);
  }

  assignCard(request: CardAssignRequest) {
    return this.http.post<NfcCardDto>(`${apiBase}/cards/assign`, request);
  }

  deleteCard(id: string) {
    return this.http.delete<void>(`${apiBase}/cards/${encodeURIComponent(id)}`);
  }

  devices() {
    return this.http.get<DeviceDto[]>(`${apiBase}/devices`);
  }

  createDevice(request: DeviceRequest) {
    return this.http.post<DeviceDto>(`${apiBase}/devices`, request);
  }

  claimDevice(request: DeviceClaimRequest) {
    return this.http.post<DeviceDto>(`${apiBase}/devices/claim`, request);
  }

  updateDevice(id: string, request: DeviceRequest) {
    return this.http.put<DeviceDto>(`${apiBase}/devices/${encodeURIComponent(id)}`, request);
  }

  updateDeviceActive(id: string, active: boolean) {
    return this.http.patch<DeviceDto>(`${apiBase}/devices/${encodeURIComponent(id)}/active`, { active });
  }

  gameTemplates() {
    return this.http.get<GameTemplateDto[]>(`${apiBase}/games`).pipe(map((games) => games.map(resolveGameImageUrl)));
  }

  publicationRequests() {
    return this.http.get<GameTemplateDto[]>(`${apiBase}/games/publication-requests`).pipe(map((games) => games.map(resolveGameImageUrl)));
  }

  getGame(id: string) {
    return this.http.get<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}`).pipe(map(resolveGameImageUrl));
  }

  createGame(request: GameBasicRequest) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games`, request).pipe(map(resolveGameImageUrl));
  }

  updateGame(id: string, request: GameBasicRequest) {
    return this.http.put<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}`, request).pipe(map(resolveGameImageUrl));
  }

  uploadGameImage(id: string, file: Blob, fileName = 'game-image') {
    const formData = new FormData();
    formData.append('file', file, fileName);
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}/image`, formData).pipe(map(resolveGameImageUrl));
  }

  deleteGame(id: string) {
    return this.http.delete<void>(`${apiBase}/games/${encodeURIComponent(id)}`);
  }

  duplicateGame(id: string) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}/duplicate`, {}).pipe(map(resolveGameImageUrl));
  }

  requestPublication(id: string) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}/publication-request`, {}).pipe(map(resolveGameImageUrl));
  }

  approvePublication(id: string) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}/approve-publication`, {}).pipe(map(resolveGameImageUrl));
  }

  rejectPublication(id: string) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}/reject-publication`, {}).pipe(map(resolveGameImageUrl));
  }

  blockPublication(id: string, reason: string) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}/block-publication`, { reason }).pipe(map(resolveGameImageUrl));
  }

  unblockPublication(id: string) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(id)}/unblock-publication`, {}).pipe(map(resolveGameImageUrl));
  }

  createGameTemplate(request: GameTemplateRequest) {
    return this.http.post<GameTemplateDto>(`${apiBase}/game-templates`, request);
  }

  updateGameTemplate(id: string, request: GameTemplateRequest) {
    return this.http.put<GameTemplateDto>(`${apiBase}/game-templates/${encodeURIComponent(id)}`, request);
  }

  getFlow(gameTemplateId: string) {
    return this.http.get<GameFlowDto>(`${apiBase}/games/${encodeURIComponent(gameTemplateId)}/flow`);
  }

  saveFlow(gameTemplateId: string, request: GameFlowDto) {
    return this.http.put<GameFlowDto>(`${apiBase}/games/${encodeURIComponent(gameTemplateId)}/flow`, request);
  }

  validateFlow(gameTemplateId: string) {
    return this.http.post<FlowValidationDto>(`${apiBase}/games/${encodeURIComponent(gameTemplateId)}/validate`, {});
  }

  soundOptions() {
    return this.http.get<SoundDto[]>(`${apiBase}/sounds/options`).pipe(map((sounds) => sounds.map(resolveSoundUrl)));
  }
}

function resolveGameImageUrl(game: GameTemplateDto): GameTemplateDto {
  return {
    ...game,
    imageUrl: resolveBackendAssetUrl(game.imageUrl),
  };
}

function resolvePlayerImageUrl(player: PlayerDto): PlayerDto {
  return {
    ...player,
    imageUrl: resolveBackendAssetUrl(player.imageUrl),
  };
}

function resolveSoundUrl(sound: SoundDto): SoundDto {
  return {
    ...sound,
    audioUrl: resolveBackendAssetUrl(sound.audioUrl),
  };
}
