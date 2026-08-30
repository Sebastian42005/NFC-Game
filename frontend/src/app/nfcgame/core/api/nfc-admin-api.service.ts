import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import {
  AdminAccountSummaryDto,
  AdminDeviceSimulationEventRequest,
  AdminLoginRequest,
  AdminLoginResponse,
  AudioTestStatusDto,
  CardAssignRequest,
  DeviceClaimRequest,
  DeviceDto,
  DeviceEventResponse,
  DeviceNameRequest,
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
const publicApiBase = buildApiUrl('/public');

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

  updateDeviceName(id: string, request: DeviceNameRequest) {
    return this.http.patch<DeviceDto>(`${apiBase}/devices/${encodeURIComponent(id)}/name`, request);
  }

  deleteDevice(id: string) {
    return this.http.delete<void>(`${apiBase}/devices/${encodeURIComponent(id)}`);
  }

  simulateDeviceEvent(request: AdminDeviceSimulationEventRequest) {
    return this.http.post<DeviceEventResponse>(`${apiBase}/device-simulator/events`, request);
  }

  simulatorDeviceScreen(sessionId: string) {
    return this.http.get<DeviceEventResponse>(
      `${apiBase}/device-simulator/sessions/${encodeURIComponent(sessionId)}/screen`,
    );
  }

  uploadSettingsTestTone(blob: Blob, filename = 'settings-test-tone.webm') {
    const formData = new FormData();
    formData.append('file', blob, filename);
    return this.http
      .post<AudioTestStatusDto>(`${apiBase}/nfc-game/audio-test/upload`, formData)
      .pipe(map(resolveAudioTestStatus));
  }

  settingsTestToneStatus() {
    return this.http
      .get<AudioTestStatusDto>(`${apiBase}/nfc-game/audio-test/status`)
      .pipe(map(resolveAudioTestStatus));
  }

  gameTemplates() {
    return this.http.get<GameTemplateDto[]>(`${apiBase}/games`).pipe(map((games) => games.map(resolveGameImageUrl)));
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

  sounds() {
    return this.http.get<SoundDto[]>(`${publicApiBase}/sounds`).pipe(map((sounds) => sounds.map(resolveSoundUrl)));
  }

  soundOptions() {
    return this.http.get<SoundDto[]>(`${apiBase}/sounds/options`).pipe(map((sounds) => sounds.map(resolveSoundUrl)));
  }

  publicSounds() {
    return this.http.get<SoundDto[]>(`${publicApiBase}/sounds/public`).pipe(map((sounds) => sounds.map(resolveSoundUrl)));
  }

  uploadSound(blob: Blob, filename = 'sound.webm', name?: string) {
    const formData = new FormData();
    formData.append('file', blob, filename);
    if (name?.trim()) formData.append('name', name.trim());
    return this.http.post<SoundDto>(`${publicApiBase}/sounds/upload`, formData).pipe(map(resolveSoundUrl));
  }

  replaceSoundAudio(soundId: string, blob: Blob, filename = 'sound.wav', name?: string) {
    const formData = new FormData();
    formData.append('file', blob, filename);
    if (name?.trim()) formData.append('name', name.trim());
    return this.http
      .post<SoundDto>(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}/audio`, formData)
      .pipe(map(resolveSoundUrl));
  }

  soundAudio(soundId: string) {
    return this.http.get(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}/audio.wav`, {
      responseType: 'blob',
    });
  }

  updateSound(soundId: string, name: string) {
    return this.http.put<SoundDto>(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}`, { name }).pipe(map(resolveSoundUrl));
  }

  deleteSound(soundId: string) {
    return this.http.delete<void>(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}`);
  }

  publishSound(soundId: string) {
    return this.http.post<SoundDto>(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}/publish`, {}).pipe(map(resolveSoundUrl));
  }

  unpublishSound(soundId: string) {
    return this.http.post<SoundDto>(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}/unpublish`, {}).pipe(map(resolveSoundUrl));
  }

  addPublicSoundToLibrary(soundId: string) {
    return this.http.post<SoundDto>(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}/library`, {}).pipe(map(resolveSoundUrl));
  }

  ratePublicSound(soundId: string, rating: -1 | 0 | 1) {
    return this.http.post<SoundDto>(`${publicApiBase}/sounds/${encodeURIComponent(soundId)}/rating`, { rating }).pipe(map(resolveSoundUrl));
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

function resolveAudioTestStatus(status: AudioTestStatusDto): AudioTestStatusDto {
  return {
    ...status,
    audioUrl: resolveBackendAssetUrl(status.audioUrl),
  };
}
