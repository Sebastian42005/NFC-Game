export type CardType = 'PLAYER' | 'GAME' | 'UNKNOWN';
export type CardStatus = 'UNASSIGNED' | 'ASSIGNED' | 'DISABLED';
export type SessionStatus =
  | 'LOBBY'
  | 'CONFIGURING'
  | 'BUILDING_TEAMS'
  | 'READY'
  | 'RUNNING'
  | 'FINISHED'
  | 'RESET'
  | 'CANCELLED';
export type ScreenType =
  | 'MESSAGE'
  | 'MENU'
  | 'NUMBER_PICKER'
  | 'WAITING_FOR_SCAN'
  | 'TEAM_OVERVIEW'
  | 'BANKING_TRANSFER'
  | 'RESULT'
  | 'ERROR';
export type WinRuleType = 'FIRST_TO_WIN' | 'MOST_POINTS_AFTER_ROUNDS' | 'ROUND_WIN' | 'MANUAL';
export type RoundLimitType = 'NONE' | 'ROUNDS' | 'POINTS';
export type GamePublicationStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'BLOCKED';
export type DashboardMetricDisplayType = 'RACE_BAR' | 'COMPACT_LIST' | 'PODIUM' | 'TILE_GRID';
export type DashboardStatusDisplayType = 'PROGRESS_BAR' | 'KPI' | 'RING' | 'PILL';
export type DeviceEventType =
  | 'CARD_SCANNED'
  | 'GAME_CARD_SCANNED'
  | 'PLAYER_CARD_SCANNED'
  | 'TOUCH_MENU_SELECT'
  | 'TOUCH_NUMBER_SET'
  | 'TOUCH_CONFIRM'
  | 'JOYSTICK_LEFT'
  | 'JOYSTICK_RIGHT'
  | 'JOYSTICK_UP'
  | 'JOYSTICK_DOWN'
  | 'JOYSTICK_PRESS'
  | 'JOYSTICK_LONG_PRESS'
  | 'RESET_TRIGGERED';

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface AdminLoginResponse {
  authenticated: boolean;
  username?: string | null;
  role?: string | null;
  token?: string | null;
}

export interface TvLoginStartResponse {
  requestId: string;
  code: string;
  expiresAt: string;
}

export interface TvLoginStatusResponse {
  status: 'PENDING' | 'APPROVED' | 'EXPIRED' | 'UNKNOWN' | string;
  authenticated: boolean;
  username?: string | null;
  role?: string | null;
}

export interface AdminAccountSummaryDto {
  id: number;
  username: string;
  role: string;
  playerCount: number;
  cardCount: number;
  deviceCount: number;
  gameCount: number;
  sessionCount: number;
}

export interface PlayerDto {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  active: boolean;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerRequest {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  active: boolean;
}

export interface PlayerStatsDto {
  playerId: string;
  playerName?: string | null;
  gamesPlayed: number;
  gamesWon: number;
  roundsWon: number;
  totalPoints: number;
  winRate: number;
  updatedAt: string;
}

export interface GameTemplateDto {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  active: boolean;
  publicationStatus: GamePublicationStatus;
  blockedReason?: string | null;
  ratingAverage: number;
  ratingCount: number;
  myRating?: number | null;
  version: number;
  startNodeId?: string | null;
  cardUid?: string | null;
  allowTeams: boolean;
  minTeamSize: number;
  maxTeamSize: number;
  supportsRoundLimit: boolean;
  economyEnabled: boolean;
  startCapital: number;
  smallStep: number;
  largeStep: number;
  winRuleType: WinRuleType;
  globalWinnerPoints: number;
  globalSecondPlacePoints?: number | null;
  globalThirdPlacePoints?: number | null;
  dashboardMetricSource?: string | null;
  dashboardMetricLabel?: string | null;
  dashboardMetricSuffix?: string | null;
  dashboardMetricSortDirection?: 'ASC' | 'DESC' | string | null;
  dashboardMetricDisplayType?: DashboardMetricDisplayType | string | null;
  dashboardMetricMaxSource?: string | null;
  dashboardStatusSource?: string | null;
  dashboardStatusLabel?: string | null;
  dashboardStatusSuffix?: string | null;
  dashboardStatusMaxSource?: string | null;
  dashboardStatusDisplayType?: DashboardStatusDisplayType | string | null;
  ownedByCurrentAccount?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GameTemplateRequest = Omit<GameTemplateDto, 'id' | 'createdAt' | 'updatedAt' | 'blockedReason' | 'ratingAverage' | 'ratingCount' | 'myRating'>;

export interface GameBasicRequest {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  cardUid?: string | null;
  active: boolean;
  globalWinnerPoints: number;
  globalSecondPlacePoints?: number | null;
  globalThirdPlacePoints?: number | null;
  dashboardMetricSource?: string | null;
  dashboardMetricLabel?: string | null;
  dashboardMetricSuffix?: string | null;
  dashboardMetricSortDirection?: 'ASC' | 'DESC' | string | null;
  dashboardMetricDisplayType?: DashboardMetricDisplayType | string | null;
  dashboardMetricMaxSource?: string | null;
  dashboardStatusSource?: string | null;
  dashboardStatusLabel?: string | null;
  dashboardStatusSuffix?: string | null;
  dashboardStatusMaxSource?: string | null;
  dashboardStatusDisplayType?: DashboardStatusDisplayType | string | null;
}

export interface GameStatsDto {
  gameTemplateId: string;
  sessionsPlayed: number;
  activeSessions: number;
  lastSessionId?: string | null;
}

export interface NfcCardDto {
  id: string;
  cardUid: string;
  cardType: CardType;
  status: CardStatus;
  playerId?: string | null;
  gameTemplateId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardAssignRequest {
  cardUid: string;
  cardType: CardType;
  playerId?: string | null;
  gameTemplateId?: string | null;
}

export interface DeviceDto {
  id: string;
  name: string;
  active: boolean;
  linked?: boolean;
  accountUsername?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
}

export interface DeviceRequest {
  name: string;
  deviceKey: string;
  active: boolean;
}

export interface DeviceProvisioningDto extends DeviceDto {
  pairingCode: string;
  linked: boolean;
  accountUsername?: string | null;
  createdNow?: boolean;
}

export interface DeviceClaimRequest {
  pairingCode: string;
}

export interface AudioTestStatusDto {
  available: boolean;
  version: number;
  hasNewAudio: boolean;
  audioUrl?: string | null;
  uploadedAt?: string | null;
  originalFilename?: string | null;
  sizeBytes: number;
  lastPlayedAt?: string | null;
  lastPlayedDeviceId?: string | null;
}

export interface SoundDto {
  id: string;
  name: string;
  audioUrl?: string | null;
  publicationStatus: GamePublicationStatus;
  likeCount: number;
  dislikeCount: number;
  myRating?: number | null;
  ownedByCurrentAccount: boolean;
  sizeBytes: number;
  durationMs: number;
  version: number;
  originalFilename?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoundUpdateRequest {
  name: string;
}

export interface MenuItemDto {
  label: string;
  value: string;
}

export interface ScreenDto {
  screenType: ScreenType;
  title: string;
  subtitle?: string | null;
  lines: string[];
  menuItems: MenuItemDto[];
  selectedIndex?: number | null;
  numberValue?: number | null;
  context: Record<string, unknown>;
}

export interface DeviceEventRequest {
  deviceId: string;
  deviceKey: string;
  sessionId?: string | null;
  currentStateKey?: string | null;
  eventType: DeviceEventType;
  cardUid?: string | null;
  payload: Record<string, unknown>;
  occurredAt?: string | null;
}

export interface DeviceEventResponse {
  sessionId?: string | null;
  status?: SessionStatus | null;
  currentStateKey?: string | null;
  screen: ScreenDto;
  effects: string[];
  errors: string[];
  scannedCardType?: CardType | null;
  scannedPlayerName?: string | null;
}

export interface TeamMemberDto {
  playerId: string;
  playerName?: string | null;
  imageUrl?: string | null;
  joinedAt: string;
}

export interface TeamDto {
  id: string;
  name: string;
  teamOrder: number;
  targetSize: number;
  status: string;
  members: TeamMemberDto[];
  balance?: number | null;
  dashboardMetricValue?: number | null;
  placementRank?: number | null;
  roundGlobalPointsAwarded?: number;
  placementGlobalPointsAwarded?: number;
  globalPointsAwarded?: number;
}

export interface GameResultDto {
  winningTeamId?: string | null;
  endReason: string;
  createdAt: string;
}

export interface SessionRoundDto {
  roundNumber: number;
  winningTeamId?: string | null;
  awardedPointsPerMember: number;
  createdAt: string;
}

export interface ActiveSessionDto {
  id: string;
  gameTemplateId: string;
  gameName?: string | null;
  gameImageUrl?: string | null;
  moneyCurrency?: string | null;
  showBalancesOnDashboard?: boolean;
  dashboardMetricSource?: string;
  dashboardMetricLabel?: string;
  dashboardMetricSuffix?: string | null;
  dashboardMetricSortDirection?: 'ASC' | 'DESC' | string;
  dashboardMetricDisplayType?: DashboardMetricDisplayType | string;
  dashboardMetricMaxSource?: string | null;
  dashboardMetricMax?: number | null;
  dashboardStatusSource?: string;
  dashboardStatusLabel?: string;
  dashboardStatusSuffix?: string | null;
  dashboardStatusMaxSource?: string | null;
  dashboardStatusDisplayType?: DashboardStatusDisplayType | string;
  dashboardStatusValue?: number | null;
  dashboardStatusLimit?: number | null;
  deviceId: string;
  status: SessionStatus;
  currentStateKey: string;
  roundLimitType: RoundLimitType;
  roundLimit?: number | null;
  currentRoundNumber: number;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  teams: TeamDto[];
  rounds: SessionRoundDto[];
  result?: GameResultDto | null;
}

export type SessionDetailDto = ActiveSessionDto;

export interface SessionTimelineEventDto {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LeaderboardEntryDto {
  rank: number;
  rankLabel?: string;
  isTied?: boolean;
  tieSize?: number;
  tieReason?: string;
  tieBreakerLabel?: string;
  playerId: string;
  playerName?: string | null;
  imageUrl?: string | null;
  gamesPlayed: number;
  gamesWon: number;
  roundsWon: number;
  totalPoints: number;
  winRate: number;
}

export interface FlowStateDto {
  id?: string;
  stateKey: string;
  stateType: string;
  title: string;
  subtitle?: string | null;
  config: Record<string, unknown>;
  sortOrder: number;
}

export interface FlowTransitionDto {
  id?: string;
  fromStateKey: string;
  eventType: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  toStateKey: string;
  sortOrder: number;
}

export interface FlowDefinitionDto {
  id?: string;
  gameTemplateId?: string;
  version: number;
  active: boolean;
  startStateKey: string;
  createdAt?: string;
  states: FlowStateDto[];
  transitions: FlowTransitionDto[];
}

export type BuilderNodeCategory =
  | 'UI'
  | 'INPUT'
  | 'TEAM_SESSION'
  | 'SCORE_WINNER'
  | 'ECONOMY'
  | 'LOGIC';

export interface BuilderNodeType {
  type: string;
  label: string;
  category: BuilderNodeCategory;
  defaultTitle: string;
  defaultConfig: Record<string, unknown>;
  description?: string;
}

export interface FlowNodeDto {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
  uiConfig: Record<string, unknown>;
  order: number;
}

export interface FlowEdgeDto {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  eventType: string;
  conditionType?: string | null;
  conditionConfig: Record<string, unknown>;
  priority: number;
}

export interface GameFlowDto {
  gameTemplateId: string;
  startNodeId?: string | null;
  nodes: FlowNodeDto[];
  edges: FlowEdgeDto[];
}

export interface FlowValidationIssueDto {
  severity: 'ERROR' | 'WARNING';
  message: string;
  nodeId?: string | null;
  edgeId?: string | null;
}

export interface FlowValidationDto {
  valid: boolean;
  issues: FlowValidationIssueDto[];
}
