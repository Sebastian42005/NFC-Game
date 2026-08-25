#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <driver/i2s.h>

#include <MFRC522v2.h>
#include <MFRC522DriverPinSimple.h>
#include <MFRC522DriverSPI.h>
#include <MFRC522Debug.h>

#include <esp_system.h>

struct MenuLayout {
int startX = 12;
int startY = 58;
int itemW = 296;
int itemH = 52;
int gapX = 8;
int gapY = 8;
int cols = 1;
int rows = 1;
int pageStart = 0;
int pageSize = 8;
int visibleItems = 0;
bool paged = false;
bool hasNextButton = false;
int nextX = 0;
int nextY = 0;
int nextW = 0;
int nextH = 0;
int textSize = 1;
};

// =====================================================
// Network / Backend
// =====================================================
static const char *BACKEND_BASE_URL = "https://projects.sebi4.com";
static const bool DISPLAY_INVERT_COLORS = true;
static const char *FIRMWARE_VERSION = "1.0.1";
static const unsigned long OTA_CHECK_INTERVAL_MS = 24UL * 60UL * 60UL * 1000UL;
static const unsigned long DEVICE_LINK_CHECK_INTERVAL_MS = 5000;
static const unsigned long DEVICE_SETTINGS_POLL_INTERVAL_MS = 2000;

// =====================================================
// Device identity
// =====================================================
static const char *DEVICE_PREF_NAMESPACE = "nfcgameid";
static const char *DEVICE_PREF_ID = "id";
static const char *DEVICE_PREF_KEY = "key";

// =====================================================
// WiFi provisioning
// =====================================================
static const char *WIFI_PREF_NAMESPACE = "nfcgamewifi";
static const char *WIFI_PREF_SSID = "ssid";
static const char *WIFI_PREF_PASSWORD = "password";
static const char *SETUP_AP_SSID = "NfcGameDevice-Setup";
static const byte DNS_PORT = 53;
static const uint16_t SETUP_WEB_PORT = 80;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
static const int MAX_SCANNED_WIFI_NETWORKS = 20;

// =====================================================
// Display / Touch
// =====================================================
static const int TFT_CS_PIN   = 15;
static const int TFT_DC_PIN   = 27;
static const int TFT_RST_PIN  = 33;

static const int TOUCH_CS_PIN = 21;

// SPI Bus 1 for Display + Touch
static const int DISP_SCK_PIN  = 18;
static const int DISP_MISO_PIN = 19;
static const int DISP_MOSI_PIN = 23;

// =====================================================
// NFC / RC522: own second SPI bus
// =====================================================
static const int NFC_SCK_PIN  = 14;
static const int NFC_MISO_PIN = 32;
static const int NFC_MOSI_PIN = 13;
static const int NFC_SS_PIN   = 25;
static const int NFC_RST_PIN  = 26;

// MIFARE Classic data block for generated UUID
static const byte CARD_UUID_BLOCK = 4;

// =====================================================
// Audio / MAX98357 I2S
// =====================================================
static const int AUDIO_I2S_BCLK_PIN = 22;
static const int AUDIO_I2S_LRC_PIN = 16;
static const int AUDIO_I2S_DOUT_PIN = 17;
static const unsigned long AUDIO_POLL_INTERVAL_MS = 5000;
static const i2s_port_t AUDIO_I2S_PORT = I2S_NUM_1;
static const int AUDIO_DMA_BUFFER_COUNT = 8;
static const int AUDIO_DMA_BUFFER_LEN = 512;
static const int AUDIO_VOLUME_DIVISOR = 2;
static const uint32_t AUDIO_PREROLL_SILENCE_MS = 20;
static const uint32_t AUDIO_FADE_IN_MS = 20;
static const uint32_t AUDIO_SHUTDOWN_SILENCE_MS = 40;

static_assert(AUDIO_VOLUME_DIVISOR >= 1, "Audio volume divisor must be at least 1");

// =====================================================
// Objects
// =====================================================
TFT_eSPI tft = TFT_eSPI();
XPT2046_Touchscreen ts(TOUCH_CS_PIN);
WiFiClient wifiClient;
WiFiClientSecure wifiClientSecure;
Preferences wifiPreferences;
Preferences devicePreferences;
WebServer setupServer(SETUP_WEB_PORT);
DNSServer dnsServer;

SPIClass nfcSPI(HSPI);
MFRC522DriverPinSimple nfcSsPin(NFC_SS_PIN);
MFRC522DriverSPI nfcDriver(nfcSsPin, nfcSPI);
MFRC522 mfrc522(nfcDriver);
MFRC522::MIFARE_Key mifareKey;

// =====================================================
// Display size in landscape, rotation 1
// =====================================================
static const int SCREEN_W = 320;
static const int SCREEN_H = 240;

// =====================================================
// Touch calibration
// =====================================================
int touchMinX = 200;
int touchMaxX = 3900;
int touchMinY = 200;
int touchMaxY = 3900;

bool swapXY  = true;
bool invertX = false;
bool invertY = true;

// =====================================================
// UI constants
// =====================================================
// Dark Mode Theme: nur Schwarz, Tuerkis, Weiss/Grau.
// Keine Rot-, Magenta-, Orange- oder Gruentoene.
uint16_t COLOR_BG = 0x0000;               // Schwarz
uint16_t COLOR_PANEL = 0x0106;            // Sehr dunkles Tuerkis
uint16_t COLOR_PANEL_INNER = 0x0188;      // Dunkles Tuerkis
uint16_t COLOR_LINE = 0x03EF;             // Gedimmtes Tuerkis
uint16_t COLOR_TEXT = 0xFFFF;             // Weiss
uint16_t COLOR_MUTED = 0xBDF7;            // Helles Grau / weiches Weiss
uint16_t COLOR_ACCENT = 0x07FF;           // Helles Tuerkis / Cyan
uint16_t COLOR_SELECTED = 0x032C;         // Auswahl in dunklem Tuerkis

// Statusfarben bleiben ebenfalls im Theme.
uint16_t COLOR_WARN = COLOR_ACCENT;
uint16_t COLOR_ERROR = COLOR_TEXT;
uint16_t COLOR_OK = COLOR_ACCENT;

static const int MAX_MENU_ITEMS = 24;
static const int MAX_LINES = 7;
static const int MAX_UI_PREDICTIONS = 8;
static const int MAX_ALLOWED_CARD_UIDS = 80;
static const unsigned long SCREEN_REFRESH_INTERVAL_MS = 1000;

// =====================================================
// Runtime state
// =====================================================
String sessionId = "";
String currentStateKey = "";
String lastStoredUuid = "-";
String lastRawUid = "";
String statusText = "Starte...";
String lastError = "";
String lastScannedPlayerName = "";
bool lastScanWasPlayer = false;
unsigned long lastCardSeenAt = 0;
unsigned long lastScreenRefreshAt = 0;
unsigned long finishedScreenAt = 0;
bool autoReturnToStartPending = false;
String transientFooterText = "";
unsigned long transientFooterUntil = 0;
int menuPageStart = 0;
bool localTeamSizeActive = false;
int localTeamSizeValue = 1;
bool localNumberActive = false;
int localNumberValue = 1;
int numberPickerSmallStep = 1;
int numberPickerLargeStep = 5;
static const int NUMBER_PICKER_MIN_VALUE = 1;
static const int NUMBER_PICKER_MAX_VALUE = 9999;
int numberPickerMinValue = NUMBER_PICKER_MIN_VALUE;
int numberPickerMaxValue = NUMBER_PICKER_MAX_VALUE;
bool localNumberTyping = false;
bool localNumberInputEmpty = false;
bool wifiSetupMode = false;
bool wifiCredentialsAvailable = false;
bool wifiConnectionFailed = false;
bool wifiShowNewForm = false;
bool setupRoutesConfigured = false;
String savedWifiSsid = "";
String savedWifiPassword = "";
String deviceId = "";
String deviceKey = "";
String pairingCode = "";
String linkedAccountUsername = "";
String scannedWifiSsids[MAX_SCANNED_WIFI_NETWORKS];
int scannedWifiRssis[MAX_SCANNED_WIFI_NETWORKS];
int scannedWifiCount = 0;
bool wifiScanDone = false;
bool deviceRegistered = false;
bool deviceLinked = false;
bool deviceCreatedInBackend = false;
bool pairingCodeScreenVisible = false;
String lastDrawnPairingCode = "";
String lastDrawnPairingFooterText = "";
unsigned long lastDeviceLinkCheckAt = 0;
unsigned long lastOtaCheckAt = 0;
int lastOtaProgressPercent = -1;
unsigned long lastAudioPollAt = 0;
unsigned long lastSettingsPollAt = 0;
unsigned long lastDisplayActivityAt = 0;
long lastKnownGameSoundVersion = 0;
long lastKnownAudioTestVersion = 0;
long lastKnownTestSoundVersion = 0;
bool startupAudioPlaybackAttempted = false;
bool displayAwake = true;

enum WifiRecoveryChoice {
WIFI_RECOVERY_RETRY,
WIFI_RECOVERY_NEW
};

struct ScreenState {
String screenType = "MESSAGE";
String title = "Bereit";
String subtitle = "Backend verbinden...";
String nodeType = "";
String sessionStatus = "";
String teamName = "";
String lines[MAX_LINES];
int lineCount = 0;
String menuLabels[MAX_MENU_ITEMS];
String menuValues[MAX_MENU_ITEMS];
int menuCount = 0;
int selectedIndex = -1;
int numberValue = 1;
bool hasNumberValue = false;
bool isTeamSizeSetup = false;
bool canStartGame = false;
int completedTeamCount = 0;
int teamPlayerCount = 0;
int teamTargetSize = 0;
int teamRemainingSlots = 0;
String effects = "";
String backendStatus = "OFFLINE";
};

struct UiPrediction {
bool active = false;
String eventType = "";
String matchValue = "";
int matchIndex = -1;
String targetStateKey = "";
String status = "";
String screenJson = "";
};

struct AudioTestMetadata {
bool available = false;
bool hasNewAudio = false;
long version = 0;
String audioUrl = "";
};

struct DeviceSettings {
String accentColor = "#00B8FF";
String themeMode = "SYSTEM";
String effectiveTheme = "DARK";
int displayBrightness = 80;
unsigned long displayTimeoutMs = 5UL * 60UL * 1000UL;
int deviceVolume = 80;
bool soundsEnabled = true;
long settingsVersion = 0;
long testSoundVersion = 0;
};

ScreenState screen;
UiPrediction uiPredictions[MAX_UI_PREDICTIONS];
int uiPredictionCount = 0;
String allowedPlayerCardUids[MAX_ALLOWED_CARD_UIDS];
int allowedPlayerCardUidCount = 0;
String allowedGameCardUids[MAX_ALLOWED_CARD_UIDS];
int allowedGameCardUidCount = 0;
DeviceSettings deviceSettings;

static const size_t CAP_SESSION_ID = 96;
static const size_t CAP_STATE_KEY = 96;
static const size_t CAP_STATUS_TEXT = 96;
static const size_t CAP_LAST_ERROR = 144;
static const size_t CAP_LAST_UUID = 64;
static const size_t CAP_PLAYER_NAME = 64;
static const size_t CAP_TRANSIENT_FOOTER = 96;
static const size_t CAP_SCREEN_TYPE = 40;
static const size_t CAP_SCREEN_TITLE = 80;
static const size_t CAP_SCREEN_SUBTITLE = 140;
static const size_t CAP_SCREEN_NODE_TYPE = 40;
static const size_t CAP_SCREEN_SESSION_STATUS = 40;
static const size_t CAP_SCREEN_LINE = 96;
static const size_t CAP_MENU_LABEL = 64;
static const size_t CAP_MENU_VALUE = 64;
static const size_t CAP_PREDICTION_EVENT = 32;
static const size_t CAP_PREDICTION_SCREEN_JSON = 1800;
static const size_t CAP_EFFECTS = 160;
static const size_t CAP_BACKEND_STATUS = 40;
static const size_t CAP_WIFI_SSID = 64;
static const size_t CAP_WIFI_PASSWORD = 128;
static const size_t CAP_DEVICE_ID = 56;
static const size_t CAP_DEVICE_KEY = 40;
static const size_t CAP_PAIRING_CODE = 12;
static const size_t CAP_ACCOUNT_USERNAME = 48;
static const size_t CAP_AUDIO_URL = 256;
static const size_t CAP_COLOR_HEX = 8;

void reserveStringCapacity(String &value, size_t capacity) {
if (capacity == 0) return;
value.reserve(capacity);
}

void setStringLimited(String &target, const char *value, size_t maxLen) {
target = "";

if (maxLen == 0 || value == nullptr) {
return;
}

reserveStringCapacity(target, maxLen + 1);

for (size_t i = 0; i < maxLen && value[i] != '\0'; i++) {
target += value[i];
}
}

void setStatusTextLimited(const String &value) {
setStringLimited(statusText, value.c_str(), CAP_STATUS_TEXT - 1);
}

void setLastErrorLimited(const String &value) {
setStringLimited(lastError, value.c_str(), CAP_LAST_ERROR - 1);
}

void setLastUuidLimited(const String &value) {
setStringLimited(lastStoredUuid, value.c_str(), CAP_LAST_UUID - 1);
}

void setTransientFooterLimited(const String &value) {
setStringLimited(transientFooterText, value.c_str(), CAP_TRANSIENT_FOOTER - 1);
}

void setLinkedAccountUsernameLimited(const String &value) {
setStringLimited(linkedAccountUsername, value.c_str(), CAP_ACCOUNT_USERNAME - 1);
}

void setLastRawUidLimited(const String &value) {
setStringLimited(lastRawUid, value.c_str(), CAP_LAST_UUID - 1);
}

bool ensureWifiConnected(bool showStatus = true);

void initStringCapacities() {
reserveStringCapacity(sessionId, CAP_SESSION_ID);
reserveStringCapacity(currentStateKey, CAP_STATE_KEY);
reserveStringCapacity(lastStoredUuid, CAP_LAST_UUID);
reserveStringCapacity(lastRawUid, CAP_LAST_UUID);
reserveStringCapacity(statusText, CAP_STATUS_TEXT);
reserveStringCapacity(lastError, CAP_LAST_ERROR);
reserveStringCapacity(lastScannedPlayerName, CAP_PLAYER_NAME);
reserveStringCapacity(transientFooterText, CAP_TRANSIENT_FOOTER);
reserveStringCapacity(savedWifiSsid, CAP_WIFI_SSID);
reserveStringCapacity(savedWifiPassword, CAP_WIFI_PASSWORD);
reserveStringCapacity(deviceId, CAP_DEVICE_ID);
reserveStringCapacity(deviceKey, CAP_DEVICE_KEY);
reserveStringCapacity(pairingCode, CAP_PAIRING_CODE);
reserveStringCapacity(linkedAccountUsername, CAP_ACCOUNT_USERNAME);
reserveStringCapacity(deviceSettings.accentColor, CAP_COLOR_HEX);
reserveStringCapacity(deviceSettings.themeMode, CAP_SCREEN_TYPE);
reserveStringCapacity(deviceSettings.effectiveTheme, CAP_SCREEN_TYPE);

reserveStringCapacity(screen.screenType, CAP_SCREEN_TYPE);
reserveStringCapacity(screen.title, CAP_SCREEN_TITLE);
reserveStringCapacity(screen.subtitle, CAP_SCREEN_SUBTITLE);
reserveStringCapacity(screen.nodeType, CAP_SCREEN_NODE_TYPE);
reserveStringCapacity(screen.sessionStatus, CAP_SCREEN_SESSION_STATUS);
reserveStringCapacity(screen.teamName, CAP_SCREEN_LINE);
reserveStringCapacity(screen.effects, CAP_EFFECTS);
reserveStringCapacity(screen.backendStatus, CAP_BACKEND_STATUS);

for (int i = 0; i < MAX_LINES; i++) {
reserveStringCapacity(screen.lines[i], CAP_SCREEN_LINE);
}

for (int i = 0; i < MAX_MENU_ITEMS; i++) {
reserveStringCapacity(screen.menuLabels[i], CAP_MENU_LABEL);
reserveStringCapacity(screen.menuValues[i], CAP_MENU_VALUE);
}

for (int i = 0; i < MAX_UI_PREDICTIONS; i++) {
reserveStringCapacity(uiPredictions[i].eventType, CAP_PREDICTION_EVENT);
reserveStringCapacity(uiPredictions[i].matchValue, CAP_MENU_VALUE);
reserveStringCapacity(uiPredictions[i].targetStateKey, CAP_STATE_KEY);
reserveStringCapacity(uiPredictions[i].status, CAP_BACKEND_STATUS);
reserveStringCapacity(uiPredictions[i].screenJson, CAP_PREDICTION_SCREEN_JSON);
}

for (int i = 0; i < MAX_ALLOWED_CARD_UIDS; i++) {
reserveStringCapacity(allowedPlayerCardUids[i], CAP_LAST_UUID);
reserveStringCapacity(allowedGameCardUids[i], CAP_LAST_UUID);
}
}

void clearUiHints() {
uiPredictionCount = 0;

for (int i = 0; i < MAX_UI_PREDICTIONS; i++) {
uiPredictions[i].active = false;
uiPredictions[i].eventType = "";
uiPredictions[i].matchValue = "";
uiPredictions[i].matchIndex = -1;
uiPredictions[i].targetStateKey = "";
uiPredictions[i].status = "";
uiPredictions[i].screenJson = "";
}
}

void clearAllowedCards() {
allowedPlayerCardUidCount = 0;
allowedGameCardUidCount = 0;

for (int i = 0; i < MAX_ALLOWED_CARD_UIDS; i++) {
allowedPlayerCardUids[i] = "";
allowedGameCardUids[i] = "";
}
}

String randomUuidString() {
uint8_t bytes[16];

for (int i = 0; i < 16; i += 4) {
uint32_t value = esp_random();
bytes[i] = value & 0xFF;
bytes[i + 1] = (value >> 8) & 0xFF;
bytes[i + 2] = (value >> 16) & 0xFF;
bytes[i + 3] = (value >> 24) & 0xFF;
}

bytes[6] = (bytes[6] & 0x0F) | 0x40;
bytes[8] = (bytes[8] & 0x3F) | 0x80;

char buffer[37];
snprintf(
buffer,
sizeof(buffer),
"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
bytes[0],
bytes[1],
bytes[2],
bytes[3],
bytes[4],
bytes[5],
bytes[6],
bytes[7],
bytes[8],
bytes[9],
bytes[10],
bytes[11],
bytes[12],
bytes[13],
bytes[14],
bytes[15]
);
return String(buffer);
}

void saveDeviceIdentity(const String &id, const String &key) {
devicePreferences.begin(DEVICE_PREF_NAMESPACE, false);
devicePreferences.putString(DEVICE_PREF_ID, id);
devicePreferences.putString(DEVICE_PREF_KEY, key);
devicePreferences.end();

deviceId = id;
deviceKey = key;
}

void loadOrCreateDeviceIdentity() {
devicePreferences.begin(DEVICE_PREF_NAMESPACE, true);
String savedId = devicePreferences.getString(DEVICE_PREF_ID, "");
String savedKey = devicePreferences.getString(DEVICE_PREF_KEY, "");
devicePreferences.end();

if (savedId.length() == 0 || savedKey.length() == 0) {
savedId = "reader-" + randomUuidString();
savedKey = randomUuidString();
saveDeviceIdentity(savedId, savedKey);
Serial.println("Neue Device Identity erstellt");
} else {
deviceId = savedId;
deviceKey = savedKey;
Serial.println("Device Identity geladen");
}

Serial.print("Device ID: ");
Serial.println(deviceId);
}

// =====================================================
// Drawing helpers
// =====================================================
String safeText(String text) {
text.replace("ä", "ae");
text.replace("Ä", "Ae");
text.replace("ö", "oe");
text.replace("Ö", "Oe");
text.replace("ü", "ue");
text.replace("Ü", "Ue");
text.replace("ß", "ss");
text.replace("€", "EUR");
return text;
}

String fitText(String text, int maxChars) {
text = safeText(text);

if (maxChars <= 2) {
return text.substring(0, max(0, maxChars));
}

if (text.length() <= maxChars) return text;

return text.substring(0, maxChars - 2) + "..";
}

void drawTextLine(
const String &text,
int x,
int y,
int maxChars,
uint16_t color,
int textSize,
uint16_t bgColor = COLOR_BG
) {
tft.setTextColor(color, bgColor);
tft.setTextSize(textSize);
tft.setCursor(x, y);
tft.print(fitText(text, maxChars));
}

void drawTextLineBuffer(
const char *text,
int x,
int y,
int maxChars,
uint16_t color,
int textSize,
uint16_t bgColor = COLOR_BG
) {
if (text == nullptr) return;

String displayText = fitText(String(text), maxChars);

tft.setTextColor(color, bgColor);
tft.setTextSize(textSize);
tft.setCursor(x, y);
tft.print(displayText);
}

void drawRightTextLine(
const String &text,
int rightX,
int y,
int maxChars,
uint16_t color,
int textSize,
uint16_t bgColor = COLOR_BG
) {
String displayText = fitText(text, maxChars);
int textW = displayText.length() * 6 * textSize;
int x = max(0, rightX - textW);

tft.setTextColor(color, bgColor);
tft.setTextSize(textSize);
tft.setCursor(x, y);
tft.print(displayText);
}

void drawButton(
int x,
int y,
int w,
int h,
const String &label,
uint16_t border,
uint16_t fill,
uint16_t textColor,
int textSize = 2
) {
String displayLabel = safeText(label);

tft.fillRoundRect(x, y, w, h, 8, fill);
tft.drawRoundRect(x, y, w, h, 8, border);

tft.setTextColor(textColor, fill);
tft.setTextSize(textSize);

int textW = displayLabel.length() * 6 * textSize;
int textH = 8 * textSize;
int textX = x + (w - textW) / 2;
int textY = y + (h - textH) / 2;

if (textX < x + 4) textX = x + 4;

tft.setCursor(textX, textY);
tft.print(displayLabel);
}

int menuPageSize() {
return screen.menuCount > 8 ? 7 : 8;
}

bool isMenuLikeScreen() {
return screen.screenType == "MENU"
|| (screen.screenType == "WAITING_FOR_SCAN" && screen.menuCount > 0);
}

int normalizedMenuPageStart(int start) {
if (screen.menuCount <= 0) return 0;

int pageSize = max(1, menuPageSize());

if (start < 0) start = 0;
if (start >= screen.menuCount) start = 0;

return (start / pageSize) * pageSize;
}

void normalizeMenuPage(bool resetToSelected) {
if (!isMenuLikeScreen() || screen.menuCount <= 0) {
menuPageStart = 0;
return;
}

int pageSize = max(1, menuPageSize());

if (resetToSelected && screen.selectedIndex >= 0 && screen.selectedIndex < screen.menuCount) {
menuPageStart = (screen.selectedIndex / pageSize) * pageSize;
return;
}

menuPageStart = normalizedMenuPageStart(menuPageStart);
}

void advanceMenuPage() {
if (screen.menuCount <= 0) {
menuPageStart = 0;
return;
}

int pageSize = max(1, menuPageSize());
menuPageStart += pageSize;

if (menuPageStart >= screen.menuCount) {
menuPageStart = 0;
}

menuPageStart = normalizedMenuPageStart(menuPageStart);
}

int menuPageCount() {
if (screen.menuCount <= 0) return 1;

int pageSize = max(1, menuPageSize());
return (screen.menuCount + pageSize - 1) / pageSize;
}

int currentMenuPageNumber() {
if (screen.menuCount <= 0) return 1;

int pageSize = max(1, menuPageSize());
return normalizedMenuPageStart(menuPageStart) / pageSize + 1;
}

void buildMenuLayout(MenuLayout &layout) {
normalizeMenuPage(false);

layout.paged = screen.menuCount > 8;
layout.pageSize = max(1, menuPageSize());
layout.pageStart = normalizedMenuPageStart(menuPageStart);
layout.visibleItems = min(layout.pageSize, max(0, screen.menuCount - layout.pageStart));
layout.hasNextButton = layout.paged;

int slotCount = layout.visibleItems + (layout.hasNextButton ? 1 : 0);
if (slotCount <= 0) slotCount = 1;

layout.startX = 12;
layout.startY = screen.subtitle.length() > 0 ? 74 : 58;
layout.gapX = 8;
layout.gapY = slotCount <= 4 ? 10 : 6;

const int areaW = SCREEN_W - 24;
const int areaBottom = SCREEN_H - 22;
const int availableH = max(42, areaBottom - layout.startY);

if (slotCount <= 2) {
layout.cols = 1;
} else {
layout.cols = 2;
}

layout.rows = (slotCount + layout.cols - 1) / layout.cols;
layout.itemW = (areaW - (layout.cols - 1) * layout.gapX) / layout.cols;
layout.itemH = (availableH - (layout.rows - 1) * layout.gapY) / layout.rows;
layout.itemH = constrain(layout.itemH, 30, 88);

if (slotCount == 1) {
layout.itemH = min(layout.itemH, 88);
}

layout.textSize = layout.itemH >= 54 && layout.itemW >= 128 ? 2 : 1;

if (layout.hasNextButton) {
int nextSlot = layout.visibleItems;
int col = nextSlot % layout.cols;
int row = nextSlot / layout.cols;

layout.nextX = layout.startX + col * (layout.itemW + layout.gapX);
layout.nextY = layout.startY + row * (layout.itemH + layout.gapY);
layout.nextW = layout.itemW;
layout.nextH = layout.itemH;

}
}

int uiTeamSizeValue() {
return localTeamSizeActive ? localTeamSizeValue : max(1, screen.numberValue);
}

void redrawNumberValueOnly();

int uiNumberPickerValue() {
if (localNumberActive && localNumberInputEmpty) {
return numberPickerMinValue;
}

int value = localNumberActive ? localNumberValue : max(numberPickerMinValue, screen.numberValue);
return constrain(value, numberPickerMinValue, numberPickerMaxValue);
}

String uiNumberPickerDisplayValue() {
if (localNumberActive && localNumberInputEmpty) {
return "";
}

if (localNumberActive) {
return String(constrain(localNumberValue, 0, NUMBER_PICKER_MAX_VALUE));
}

return String(uiNumberPickerValue());
}

void setLocalNumberValue(int value, bool typing, bool inputEmpty = false) {
localNumberValue = constrain(value, 0, NUMBER_PICKER_MAX_VALUE);
localNumberActive = true;
localNumberTyping = typing;
localNumberInputEmpty = inputEmpty;
}

void appendNumberDigit(int digit) {
int current = (localNumberTyping && !localNumberInputEmpty) ? localNumberValue : 0;
long next = static_cast<long>(current) * 10 + digit;

if (next > NUMBER_PICKER_MAX_VALUE) {
next = NUMBER_PICKER_MAX_VALUE;
}

setLocalNumberValue(static_cast<int>(next), true, false);
redrawNumberValueOnly();
}

void backspaceNumberDigit() {
int current = (localNumberTyping && !localNumberInputEmpty) ? localNumberValue : 0;
int next = current / 10;

setLocalNumberValue(next, true, next == 0);
redrawNumberValueOnly();
}

void clearNumberInput() {
setLocalNumberValue(0, true, true);
redrawNumberValueOnly();
}

bool useNumberStepper() {
return screen.screenType == "NUMBER_PICKER"
&& !screen.isTeamSizeSetup
&& numberPickerMaxValue - numberPickerMinValue < 10;
}

int contextIntOr(JsonObject context, const char *primaryKey, const char *secondaryKey, const char *thirdKey, int fallback) {
if (context.isNull()) return fallback;

JsonVariant value = context[primaryKey];
if (!value.isNull()) return value.as<int>();

value = context[secondaryKey];
if (!value.isNull()) return value.as<int>();

value = context[thirdKey];
if (!value.isNull()) return value.as<int>();

return fallback;
}

bool contextBoolOr(JsonObject context, const char *primaryKey, const char *secondaryKey, bool fallback) {
if (context.isNull()) return fallback;

JsonVariant value = context[primaryKey];
if (!value.isNull()) return value.as<bool>();

value = context[secondaryKey];
if (!value.isNull()) return value.as<bool>();

return fallback;
}

bool isTeamPlayerScanScreen() {
return screen.screenType == "WAITING_FOR_SCAN"
&& screen.sessionStatus == "BUILDING_TEAMS"
&& screen.teamTargetSize > 0;
}

uint32_t hashMixString(uint32_t hash, const String &value) {
for (size_t i = 0; i < value.length(); i++) {
hash ^= static_cast<uint8_t>(value[i]);
hash *= 16777619u;
}
hash ^= 0xFFu;
hash *= 16777619u;
return hash;
}

uint32_t hashMixInt(uint32_t hash, int value) {
hash ^= static_cast<uint32_t>(value & 0xFF);
hash *= 16777619u;
hash ^= static_cast<uint32_t>((value >> 8) & 0xFF);
hash *= 16777619u;
hash ^= static_cast<uint32_t>((value >> 16) & 0xFF);
hash *= 16777619u;
hash ^= static_cast<uint32_t>((value >> 24) & 0xFF);
hash *= 16777619u;
return hash;
}

uint32_t screenSnapshotHash() {
uint32_t hash = 2166136261u;

hash = hashMixString(hash, screen.screenType);
hash = hashMixString(hash, screen.title);
hash = hashMixString(hash, screen.subtitle);
hash = hashMixString(hash, screen.nodeType);
hash = hashMixString(hash, screen.sessionStatus);
hash = hashMixString(hash, screen.teamName);
hash = hashMixInt(hash, screen.selectedIndex);
hash = hashMixInt(hash, menuPageStart);
hash = hashMixInt(hash, screen.numberValue);
hash = hashMixInt(hash, screen.isTeamSizeSetup ? 1 : 0);
hash = hashMixInt(hash, screen.canStartGame ? 1 : 0);
hash = hashMixInt(hash, screen.completedTeamCount);
hash = hashMixInt(hash, screen.teamPlayerCount);
hash = hashMixInt(hash, screen.teamTargetSize);
hash = hashMixInt(hash, screen.teamRemainingSlots);
hash = hashMixInt(hash, screen.lineCount);
hash = hashMixInt(hash, screen.menuCount);
hash = hashMixInt(hash, uiTeamSizeValue());
hash = hashMixInt(hash, uiNumberPickerValue());
hash = hashMixInt(hash, localNumberInputEmpty ? 1 : 0);
hash = hashMixInt(hash, numberPickerSmallStep);
hash = hashMixInt(hash, numberPickerLargeStep);
hash = hashMixInt(hash, numberPickerMinValue);
hash = hashMixInt(hash, numberPickerMaxValue);

for (int i = 0; i < screen.lineCount && i < MAX_LINES; i++) {
hash = hashMixString(hash, screen.lines[i]);
}

for (int i = 0; i < screen.menuCount && i < MAX_MENU_ITEMS; i++) {
hash = hashMixString(hash, screen.menuLabels[i]);
hash = hashMixString(hash, screen.menuValues[i]);
}

return hash;
}

void showTransientFooter(const String &text, unsigned long durationMs = 1500) {
setTransientFooterLimited(text);
transientFooterUntil = millis() + durationMs;
}

void buildFooterText(char *buffer, size_t bufferSize) {
if (bufferSize == 0) return;

if (lastScanWasPlayer && lastScannedPlayerName.length() > 0) {
snprintf(buffer, bufferSize, "Letzter Spieler: %s", lastScannedPlayerName.c_str());
return;
}

if (transientFooterText.length() > 0 && millis() < transientFooterUntil) {
snprintf(buffer, bufferSize, "%s", transientFooterText.c_str());
return;
}

if (lastError.length() > 0) {
snprintf(buffer, bufferSize, "Fehler: %s", lastError.c_str());
return;
}

snprintf(buffer, bufferSize, "%s", statusText.length() > 0 ? statusText.c_str() : "Bereit");
}

String linkedAccountFooterText() {
if (!deviceLinked) {
if (WiFi.status() != WL_CONNECTED) {
return "WLAN offline";
}

if (!deviceRegistered && lastError.startsWith("Register HTTP ")) {
  int code = lastError.substring(14).toInt();

  if (code == 404) {
    return "Device API fehlt";
  }

  if (code == 409) {
    return "Device Konflikt";
  }

  if (code > 0) {
    return "Register Fehler";
  }
}

if (!deviceRegistered) {
  return "Backend offline";
}

return "Nicht verbunden";

}

if (linkedAccountUsername.length() > 0) {
return linkedAccountUsername;
}

return "Account verbunden";
}

void drawFooter() {
const int footerY = SCREEN_H - 18;
char footerBuffer[96];

buildFooterText(footerBuffer, sizeof(footerBuffer));
String accountText = linkedAccountFooterText();
String fittedAccountText = fitText(accountText, 22);
int accountTextW = fittedAccountText.length() * 6;
int leftMaxChars = max(8, (SCREEN_W - accountTextW - 24) / 6);

tft.fillRect(0, footerY, SCREEN_W, 18, COLOR_BG);
tft.drawFastHLine(0, footerY, SCREEN_W, COLOR_LINE);

drawTextLineBuffer(footerBuffer, 6, footerY + 5, leftMaxChars, COLOR_MUTED, 1);
drawRightTextLine(fittedAccountText, SCREEN_W - 6, footerY + 5, 22, COLOR_ACCENT, 1);
}

void invalidatePairingCodeScreen() {
pairingCodeScreenVisible = false;
lastDrawnPairingCode = "";
lastDrawnPairingFooterText = "";
}

void setStartScreen(const String &status = "Bereit fuer neuen Scan") {
invalidatePairingCodeScreen();

sessionId = "";
currentStateKey = "";
localTeamSizeActive = false;
localNumberActive = false;
menuPageStart = 0;
autoReturnToStartPending = false;

screen.screenType = "WAITING_FOR_SCAN";
screen.title = "Bereit";
screen.subtitle = "Karte scannen zum Starten";
screen.nodeType = "";
screen.sessionStatus = "";
screen.teamName = "";
screen.lineCount = 0;
screen.menuCount = 0;
screen.selectedIndex = -1;
screen.hasNumberValue = false;
screen.numberValue = 1;
screen.isTeamSizeSetup = false;
screen.canStartGame = false;
screen.completedTeamCount = 0;
screen.teamPlayerCount = 0;
screen.teamTargetSize = 0;
screen.teamRemainingSlots = 0;
screen.backendStatus = "NO SESSION";
clearUiHints();
clearAllowedCards();

setStatusTextLimited(status);
}

void drawPairingCodeScreen() {
char footerBuffer[96];
buildFooterText(footerBuffer, sizeof(footerBuffer));
String footerText = String(footerBuffer) + "|" + linkedAccountFooterText();
if (pairingCodeScreenVisible && lastDrawnPairingCode == pairingCode && lastDrawnPairingFooterText == footerText) {
return;
}

tft.fillScreen(COLOR_BG);
tft.fillRect(0, 0, SCREEN_W, 58, COLOR_PANEL);
drawTextLine("Reader verbinden", 28, 22, 24, COLOR_ACCENT, 2, COLOR_PANEL);

drawTextLine("Code im Account eingeben", 52, 76, 32, COLOR_MUTED, 1);

String code = pairingCode.length() > 0 ? pairingCode : "------";
tft.setTextColor(COLOR_TEXT, COLOR_BG);
tft.setTextSize(6);

int textW = code.length() * 6 * 6;
int textX = (SCREEN_W - textW) / 2;
if (textX < 8) textX = 8;

tft.setCursor(textX, 106);
tft.print(code);

drawTextLine("nfc-game/account", 92, 184, 30, COLOR_MUTED, 1);
drawTextLine("Verbindung wird automatisch erkannt", 42, 204, 40, COLOR_MUTED, 1);
drawFooter();

pairingCodeScreenVisible = true;
lastDrawnPairingCode = pairingCode;
lastDrawnPairingFooterText = footerText;
}

void drawWifiRecoveryScreen() {
tft.fillScreen(COLOR_BG);
tft.fillRect(0, 0, SCREEN_W, 66, COLOR_PANEL);
drawTextLine("WLAN fehlgeschlagen", 32, 24, 24, COLOR_ACCENT, 2, COLOR_PANEL);

drawTextLine("Gespeichertes WLAN:", 18, 82, 34, COLOR_MUTED, 1);
drawTextLine(savedWifiSsid, 18, 102, 23, COLOR_TEXT, 2);
drawTextLine("Was soll ich tun?", 18, 132, 34, COLOR_MUTED, 1);

drawButton(18, 162, 132, 50, "Nochmal", COLOR_ACCENT, COLOR_SELECTED, COLOR_TEXT, 2);
drawButton(170, 162, 132, 50, "Neu", COLOR_LINE, COLOR_PANEL_INNER, COLOR_TEXT, 2);
}

void redrawTeamSizeValueOnly() {
tft.fillRoundRect(110, 84, 100, 62, 12, COLOR_SELECTED);
tft.drawRoundRect(110, 84, 100, 62, 12, COLOR_ACCENT);

tft.setTextColor(COLOR_TEXT, COLOR_SELECTED);
tft.setTextSize(5);

String value = String(uiTeamSizeValue());
int textW = value.length() * 6 * 5;

tft.setCursor((SCREEN_W - textW) / 2, 98);
tft.print(value);
}

void redrawNumberValueOnly() {
String value = uiNumberPickerDisplayValue();
int textSize = value.length() > 4 ? 3 : 4;
int textW = value.length() * 6 * textSize;
int textX = 14 + (222 - textW) / 2;
int textY = textSize == 4 ? 18 : 22;

if (textX < 22) textX = 22;

tft.fillRoundRect(14, 12, 222, 44, 8, COLOR_SELECTED);
tft.drawRoundRect(14, 12, 222, 44, 8, COLOR_ACCENT);
tft.setTextColor(COLOR_TEXT, COLOR_SELECTED);
tft.setTextSize(textSize);
tft.setCursor(textX, textY);
tft.print(value);
}

void redrawNumberStepperValueOnly() {
String value = String(uiNumberPickerValue());
int textSize = value.length() > 4 ? 3 : 5;
int textW = value.length() * 6 * textSize;
int textY = textSize == 5 ? 72 : 78;

tft.fillRoundRect(110, 58, 100, 62, 12, COLOR_SELECTED);
tft.drawRoundRect(110, 58, 100, 62, 12, COLOR_ACCENT);
tft.setTextColor(COLOR_TEXT, COLOR_SELECTED);
tft.setTextSize(textSize);
tft.setCursor((SCREEN_W - textW) / 2, textY);
tft.print(value);
}

void drawHeader() {
tft.fillRect(0, 0, SCREEN_W, 70, COLOR_PANEL);

String title = fitText(screen.title, 24);
int titleSize = 3;

if (title.length() > 16) titleSize = 2;

tft.setTextColor(COLOR_ACCENT, COLOR_PANEL);
tft.setTextSize(titleSize);

int textW = title.length() * 6 * titleSize;
int x = (SCREEN_W - textW) / 2;

if (x < 8) x = 8;

tft.setCursor(x, 22);
tft.print(title);

tft.drawFastHLine(0, 68, SCREEN_W, COLOR_LINE);
}

void drawMenuHeader() {
tft.fillRect(0, 0, SCREEN_W, 52, COLOR_PANEL);

String title = fitText(screen.title, 26);
int titleSize = title.length() > 18 ? 1 : 2;

tft.setTextColor(COLOR_ACCENT, COLOR_PANEL);
tft.setTextSize(titleSize);

int textW = title.length() * 6 * titleSize;
int x = (SCREEN_W - textW) / 2;
if (x < 8) x = 8;

tft.setCursor(x, titleSize == 2 ? 18 : 22);
tft.print(title);

tft.drawFastHLine(0, 51, SCREEN_W, COLOR_LINE);
}

void drawScanScreen() {
tft.fillScreen(COLOR_BG);
drawHeader();

if (isTeamPlayerScanScreen()) {
int remaining = max(0, screen.teamRemainingSlots);
int target = max(1, screen.teamTargetSize);
int scanned = constrain(screen.teamPlayerCount, 0, target);
String teamLabel = screen.teamName.length() > 0 ? screen.teamName : "Team";

drawTextLine(teamLabel, 16, 78, 46, COLOR_ACCENT, 2);
drawTextLine("Teamgroesse fest", 186, 82, 24, COLOR_MUTED, 1);

tft.fillRoundRect(16, 108, 82, 62, 10, COLOR_SELECTED);
tft.drawRoundRect(16, 108, 82, 62, 10, COLOR_ACCENT);
tft.setTextColor(COLOR_TEXT, COLOR_SELECTED);
tft.setTextSize(5);
String value = String(target);
int textW = value.length() * 6 * 5;
tft.setCursor(16 + (82 - textW) / 2, 122);
tft.print(value);

char progressBuffer[32];
snprintf(progressBuffer, sizeof(progressBuffer), "%d/%d gescannt", scanned, target);
drawTextLineBuffer(progressBuffer, 116, 114, 32, COLOR_TEXT, 2);

char remainingBuffer[40];
snprintf(remainingBuffer, sizeof(remainingBuffer), "Noch %d moeglich", remaining);
drawTextLineBuffer(remainingBuffer, 116, 142, 34, COLOR_MUTED, 1);

if (screen.lineCount > 0) {
  int y = 178;
  for (int i = 0; i < screen.lineCount && i < 2; i++) {
    drawTextLine(screen.lines[i], 16, y, 48, COLOR_MUTED, 1);
    y += 16;
  }
} else {
  drawTextLine("Naechste Spielerkarte scannen.", 16, 188, 47, COLOR_MUTED, 1);
}

return;

}

int y = 82;
String subtitle = screen.subtitle.length() > 0 ? screen.subtitle : "Warte auf Scan...";
drawTextLine(subtitle, 16, y, 46, COLOR_ACCENT, 2);
y += 28;

if (screen.lineCount > 0) {
for (int i = 0; i < screen.lineCount && i < 5; i++) {
drawTextLine(screen.lines[i], 16, y, 48, i == 0 ? COLOR_TEXT : COLOR_MUTED, i == 0 ? 2 : 1);
y += i == 0 ? 24 : 18;
}
} else {
drawTextLine("Halte die Karte an den Leser.", 16, y, 47, COLOR_TEXT, 1);
}

if (lastScanWasPlayer && lastScannedPlayerName.length() > 0) {
char lastScanBuffer[96];
snprintf(lastScanBuffer, sizeof(lastScanBuffer), "Letzter Spieler: %s", lastScannedPlayerName.c_str());
drawTextLineBuffer(lastScanBuffer, 16, 198, 47, COLOR_MUTED, 1);
}
}

void drawMessageScreen() {
int y = 84;

if (screen.subtitle.length() > 0) {
drawTextLine(screen.subtitle, 24, y, 30, COLOR_MUTED, 2);
y += 38;
}

for (int i = 0; i < screen.lineCount && i < 3; i++) {
drawTextLine(screen.lines[i], 24, y, 22, COLOR_TEXT, 2);
y += 34;
}
}

void drawMenuScreen() {
drawMenuHeader();

if (screen.subtitle.length() > 0) {
drawTextLine(screen.subtitle, 14, 58, 48, COLOR_MUTED, 1);
}

MenuLayout layout;
buildMenuLayout(layout);

for (int i = 0; i < layout.visibleItems; i++) {
int idx = layout.pageStart + i;
int col = i % layout.cols;
int row = i / layout.cols;
int x = layout.startX + col * (layout.itemW + layout.gapX);
int y = layout.startY + row * (layout.itemH + layout.gapY);

bool selected = idx == screen.selectedIndex;

uint16_t border = selected ? COLOR_ACCENT : COLOR_LINE;
uint16_t fill = selected ? COLOR_SELECTED : COLOR_PANEL_INNER;
int maxChars = max(4, (layout.itemW - 12) / (6 * layout.textSize));

drawButton(
  x,
  y,
  layout.itemW,
  layout.itemH,
  fitText(screen.menuLabels[idx], maxChars),
  border,
  fill,
  COLOR_TEXT,
  layout.textSize
);

}

if (layout.hasNextButton) {
drawButton(
layout.nextX,
layout.nextY,
layout.nextW,
layout.nextH,
">",
COLOR_ACCENT,
COLOR_SELECTED,
COLOR_TEXT,
layout.nextH >= 44 ? 3 : 2
);

char pageBuffer[12];
snprintf(pageBuffer, sizeof(pageBuffer), "%d/%d", currentMenuPageNumber(), menuPageCount());
drawTextLineBuffer(pageBuffer, layout.nextX + 6, layout.nextY + 5, 8, COLOR_MUTED, 1, COLOR_SELECTED);

}
}

void drawTeamSizeScreen() {
if (screen.canStartGame) {
drawTextLine("Fertige Teams: " + String(screen.completedTeamCount), 18, 74, 40, COLOR_MUTED, 1);
} else {
drawTextLine("Zahl waehlen, erste Karte scannen", 18, 74, 48, COLOR_MUTED, 1);
}

tft.fillRoundRect(110, 84, 100, 62, 12, COLOR_SELECTED);
tft.drawRoundRect(110, 84, 100, 62, 12, COLOR_ACCENT);

tft.setTextColor(COLOR_TEXT, COLOR_SELECTED);
tft.setTextSize(5);

String value = String(uiTeamSizeValue());
int textW = value.length() * 6 * 5;

tft.setCursor((SCREEN_W - textW) / 2, 98);
tft.print(value);

drawButton(26, 92, 60, 46, "<", COLOR_LINE, COLOR_PANEL_INNER, COLOR_TEXT, 3);
drawButton(234, 92, 60, 46, ">", COLOR_LINE, COLOR_PANEL_INNER, COLOR_TEXT, 3);
drawButton(
88,
156,
144,
36,
"Spiel starten",
screen.canStartGame ? COLOR_ACCENT : COLOR_LINE,
screen.canStartGame ? COLOR_SELECTED : COLOR_PANEL_INNER,
COLOR_TEXT,
1
);
}

void drawNumberScreen() {
redrawNumberValueOnly();

drawButton(248, 12, 58, 44, "OK", COLOR_ACCENT, COLOR_SELECTED, COLOR_TEXT, 2);

const char *labels[4][3] = {
{ "1", "2", "3" },
{ "4", "5", "6" },
{ "7", "8", "9" },
{ "C", "0", "<" }
};

const int startX = 14;
const int startY = 66;
const int buttonW = 92;
const int buttonH = 34;
const int gapX = 8;
const int gapY = 4;

for (int row = 0; row < 4; row++) {
for (int col = 0; col < 3; col++) {
int x = startX + col * (buttonW + gapX);
int y = startY + row * (buttonH + gapY);
const char *label = labels[row][col];
bool utility = row == 3 && col != 1;

  drawButton(
    x,
    y,
    buttonW,
    buttonH,
    String(label),
    utility ? COLOR_ACCENT : COLOR_LINE,
    utility ? COLOR_SELECTED : COLOR_PANEL_INNER,
    COLOR_TEXT,
    2
  );
}

}
}

void drawNumberStepperScreen() {
if (screen.title.length() > 0) {
drawTextLine(screen.title, 16, 14, 46, COLOR_ACCENT, 2);
}

redrawNumberStepperValueOnly();

drawButton(26, 66, 60, 46, "<", COLOR_LINE, COLOR_PANEL_INNER, COLOR_TEXT, 3);
drawButton(234, 66, 60, 46, ">", COLOR_LINE, COLOR_PANEL_INNER, COLOR_TEXT, 3);
drawButton(92, 146, 136, 40, "Auswaehlen", COLOR_ACCENT, COLOR_SELECTED, COLOR_TEXT, 1);
}

void drawScreen() {
invalidatePairingCodeScreen();
tft.fillScreen(COLOR_BG);

if (screen.screenType == "WAITING_FOR_SCAN" && screen.menuCount <= 0) {
drawScanScreen();
drawFooter();
return;
}

if (screen.isTeamSizeSetup) {
drawHeader();
drawTeamSizeScreen();
} else if (useNumberStepper()) {
tft.fillScreen(COLOR_BG);
drawNumberStepperScreen();
drawFooter();
return;
} else if (isMenuLikeScreen() && screen.menuCount > 0) {
drawMenuScreen();
} else if (screen.screenType == "NUMBER_PICKER") {
tft.fillScreen(COLOR_BG);
drawNumberScreen();
drawFooter();
return;
} else {
drawHeader();
drawMessageScreen();
}

drawFooter();
}

void showBoot(const String &text, uint16_t color = COLOR_TEXT) {
tft.fillScreen(COLOR_BG);

tft.fillRoundRect(12, 14, SCREEN_W - 24, 54, 10, COLOR_PANEL);
tft.drawRoundRect(12, 14, SCREEN_W - 24, 54, 10, COLOR_LINE);

tft.setTextColor(COLOR_ACCENT, COLOR_PANEL);
tft.setTextSize(2);
tft.setCursor(24, 32);
tft.print("NFC Game");

drawTextLine(text, 16, 86, 32, color, 1, COLOR_BG);
}

// =====================================================
// Touch
// =====================================================
bool mapTouchPoint(const TS_Point &p, int &x, int &y) {
int rawX = p.x;
int rawY = p.y;

if (swapXY) {
int tmp = rawX;
rawX = rawY;
rawY = tmp;
}

rawX = constrain(rawX, touchMinX, touchMaxX);
rawY = constrain(rawY, touchMinY, touchMaxY);

x = map(rawX, touchMinX, touchMaxX, 0, SCREEN_W - 1);
y = map(rawY, touchMinY, touchMaxY, 0, SCREEN_H - 1);

if (invertX) x = (SCREEN_W - 1) - x;
if (invertY) y = (SCREEN_H - 1) - y;

x = constrain(x, 0, SCREEN_W - 1);
y = constrain(y, 0, SCREEN_H - 1);

return true;
}

void waitTouchRelease() {
while (ts.touched()) {
delay(10);
}

delay(80);
}

WifiRecoveryChoice waitForWifiRecoveryChoice() {
drawWifiRecoveryScreen();

while (true) {
digitalWrite(TFT_CS_PIN, HIGH);

if (!ts.touched()) {
  delay(30);
  continue;
}

TS_Point p = ts.getPoint();
digitalWrite(TOUCH_CS_PIN, HIGH);

if (p.z <= 150) {
  waitTouchRelease();
  continue;
}

int x = 0;
int y = 0;

if (!mapTouchPoint(p, x, y)) {
  waitTouchRelease();
  continue;
}

if (x >= 18 && x <= 150 && y >= 162 && y <= 212) {
  waitTouchRelease();
  return WIFI_RECOVERY_RETRY;
}

if (x >= 170 && x <= 302 && y >= 162 && y <= 212) {
  waitTouchRelease();
  return WIFI_RECOVERY_NEW;
}

waitTouchRelease();

}
}

// =====================================================
// NFC helpers
// =====================================================
void initMifareDefaultKey() {
for (byte i = 0; i < 6; i++) {
mifareKey.keyByte[i] = 0xFF;
}
}

String rawUidToString(const MFRC522::Uid &uid) {
String out = "";

for (byte i = 0; i < uid.size; i++) {
if (uid.uidByte[i] < 0x10) out += "0";

out += String(uid.uidByte[i], HEX);

if (i + 1 < uid.size) out += ":";

}

out.toUpperCase();

return out;
}

void generateRandomUuid(byte uuidBytes[16]) {
for (int i = 0; i < 16; i += 4) {
uint32_t r = esp_random();

uuidBytes[i + 0] = (r >> 24) & 0xFF;
uuidBytes[i + 1] = (r >> 16) & 0xFF;
uuidBytes[i + 2] = (r >> 8) & 0xFF;
uuidBytes[i + 3] = r & 0xFF;

}

uuidBytes[6] = (uuidBytes[6] & 0x0F) | 0x40;
uuidBytes[8] = (uuidBytes[8] & 0x3F) | 0x80;
}

String uuidBytesToString(const byte uuidBytes[16]) {
char buf[37];

snprintf(
buf,
sizeof(buf),
"%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
uuidBytes[0],
uuidBytes[1],
uuidBytes[2],
uuidBytes[3],
uuidBytes[4],
uuidBytes[5],
uuidBytes[6],
uuidBytes[7],
uuidBytes[8],
uuidBytes[9],
uuidBytes[10],
uuidBytes[11],
uuidBytes[12],
uuidBytes[13],
uuidBytes[14],
uuidBytes[15]
);

return String(buf);
}

bool uuidBlockLooksEmpty(const byte data[16]) {
bool allZero = true;
bool allFF = true;

for (int i = 0; i < 16; i++) {
if (data[i] != 0x00) allZero = false;
if (data[i] != 0xFF) allFF = false;
}

return allZero || allFF;
}

bool authenticateCardBlock(byte blockAddr) {
MFRC522::StatusCode status = mfrc522.PCD_Authenticate(
0x60,
blockAddr,
&mifareKey,
&mfrc522.uid
);

if (status != 0) {
Serial.print("Auth failed: ");
Serial.println(MFRC522Debug::GetStatusCodeName(status));
return false;
}

return true;
}

bool readUuidBlock(byte out[16]) {
if (!authenticateCardBlock(CARD_UUID_BLOCK)) return false;

byte buffer[18];
byte size = sizeof(buffer);

MFRC522::StatusCode status = mfrc522.MIFARE_Read(
CARD_UUID_BLOCK,
buffer,
&size
);

if (status != 0) {
Serial.print("Read failed: ");
Serial.println(MFRC522Debug::GetStatusCodeName(status));
return false;
}

for (int i = 0; i < 16; i++) {
out[i] = buffer[i];
}

return true;
}

bool writeUuidBlock(const byte in[16]) {
if (!authenticateCardBlock(CARD_UUID_BLOCK)) return false;

MFRC522::StatusCode status = mfrc522.MIFARE_Write(
CARD_UUID_BLOCK,
(byte*)in,
16
);

if (status != 0) {
Serial.print("Write failed: ");
Serial.println(MFRC522Debug::GetStatusCodeName(status));
return false;
}

return true;
}

String readOrCreateCardUuid() {
String physicalUid = rawUidToString(mfrc522.uid);
unsigned long now = millis();

if (physicalUid == lastRawUid && (now - lastCardSeenAt) < 1500) {
return "";
}

setLastRawUidLimited(physicalUid);
lastCardSeenAt = now;

byte uuidData[16];

if (!readUuidBlock(uuidData)) {
setLastUuidLimited(physicalUid);
setStatusTextLimited("UUID Block unlesbar, raw UID");
return lastStoredUuid;
}

if (uuidBlockLooksEmpty(uuidData)) {
byte newUuid[16];

generateRandomUuid(newUuid);

if (writeUuidBlock(newUuid)) {
  setLastUuidLimited(uuidBytesToString(newUuid));
  setStatusTextLimited("Neue UUID geschrieben");
} else {
  setLastUuidLimited(physicalUid);
  setStatusTextLimited("UUID write failed, raw UID");
}

} else {
setLastUuidLimited(uuidBytesToString(uuidData));
setStatusTextLimited("UUID gelesen");
}

return lastStoredUuid;
}

// =====================================================
// Backend / JSON
// =====================================================
String apiUrl(const String &path) {
String base = String(BACKEND_BASE_URL);

if (base.endsWith("/")) {
base.remove(base.length() - 1);
}

return base + path;
}

uint16_t readLe16(const uint8_t *buffer, size_t offset) {
return static_cast<uint16_t>(buffer[offset])
| (static_cast<uint16_t>(buffer[offset + 1]) << 8);
}

uint32_t readLe32(const uint8_t *buffer, size_t offset) {
return static_cast<uint32_t>(buffer[offset])
| (static_cast<uint32_t>(buffer[offset + 1]) << 8)
| (static_cast<uint32_t>(buffer[offset + 2]) << 16)
| (static_cast<uint32_t>(buffer[offset + 3]) << 24);
}

bool readExact(WiFiClient *stream, uint8_t *buffer, size_t length) {
size_t total = 0;
unsigned long lastDataAt = millis();
const unsigned long STREAM_TIMEOUT_MS = 15000;

while (total < length) {
int availableBytes = stream->available();

if (availableBytes > 0) {
  size_t wanted = min(
    length - total,
    static_cast<size_t>(availableBytes)
  );

  int got = stream->read(buffer + total, wanted);

  if (got > 0) {
    total += static_cast<size_t>(got);
    lastDataAt = millis();
    continue;
  }
}

if (!stream->connected() && stream->available() == 0) {
  Serial.printf(
    "HTTP Stream geschlossen bei %u/%u Bytes\n",
    static_cast<unsigned>(total),
    static_cast<unsigned>(length)
  );
  return false;
}

if (millis() - lastDataAt >= STREAM_TIMEOUT_MS) {
  Serial.printf(
    "HTTP Stream Timeout bei %u/%u Bytes nach %lu ms\n",
    static_cast<unsigned>(total),
    static_cast<unsigned>(length),
    STREAM_TIMEOUT_MS
  );
  return false;
}

delay(1);
}

return true;
}

bool skipExact(WiFiClient *stream, uint32_t length) {
uint8_t discard[128];
uint32_t skipped = 0;

while (skipped < length) {
size_t wanted = min(
  static_cast<size_t>(sizeof(discard)),
  static_cast<size_t>(length - skipped)
);

if (!readExact(stream, discard, wanted)) {
  return false;
}

skipped += wanted;
}

return true;
}

bool supportedSampleRate(uint32_t sampleRate) {
return sampleRate == 8000
|| sampleRate == 16000
|| sampleRate == 32000
|| sampleRate == 44100
|| sampleRate == 48000;
}

bool readWavHeader(WiFiClient *stream, uint16_t &channels, uint32_t &sampleRate, uint16_t &bitsPerSample, uint32_t &dataSize) {
uint8_t riffHeader[12];

if (!readExact(stream, riffHeader, sizeof(riffHeader))) {
Serial.println("WAV: RIFF Header unvollstaendig");
return false;
}

if (memcmp(riffHeader, "RIFF", 4) != 0 || memcmp(riffHeader + 8, "WAVE", 4) != 0) {
Serial.println("WAV: Kein RIFF/WAVE");
return false;
}

bool foundFmt = false;

while (true) {
uint8_t chunkHeader[8];
if (!readExact(stream, chunkHeader, sizeof(chunkHeader))) {
Serial.println("WAV: Chunk Header unvollstaendig");
return false;
}

uint32_t chunkSize = readLe32(chunkHeader, 4);
bool padded = (chunkSize % 2) != 0;

if (memcmp(chunkHeader, "fmt ", 4) == 0) {
  if (chunkSize < 16) {
    Serial.println("WAV: fmt Chunk zu klein");
    return false;
  }

  uint8_t fmt[16];
  if (!readExact(stream, fmt, sizeof(fmt))) {
    Serial.println("WAV: fmt Chunk unvollstaendig");
    return false;
  }

  uint16_t audioFormat = readLe16(fmt, 0);
  channels = readLe16(fmt, 2);
  sampleRate = readLe32(fmt, 4);
  bitsPerSample = readLe16(fmt, 14);

  if (audioFormat != 1) {
    Serial.printf("WAV: Kein PCM (format=%u)\n", audioFormat);
    return false;
  }

  if (chunkSize > sizeof(fmt)) {
    if (!skipExact(stream, chunkSize - sizeof(fmt))) {
      return false;
    }
  }

  foundFmt = true;
} else if (memcmp(chunkHeader, "data", 4) == 0) {
  if (!foundFmt) {
    Serial.println("WAV: data vor fmt gefunden");
    return false;
  }

  dataSize = chunkSize;
  return true;
} else {
  if (!skipExact(stream, chunkSize)) {
    return false;
  }
}

if (padded) {
  if (!skipExact(stream, 1)) {
    return false;
  }
}

}
}

bool initI2S(uint32_t sampleRate) {
i2s_driver_uninstall(AUDIO_I2S_PORT);

i2s_config_t config = {};
config.mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX);
config.sample_rate = sampleRate;
config.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
config.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
config.intr_alloc_flags = 0;
config.dma_buf_count = AUDIO_DMA_BUFFER_COUNT;
config.dma_buf_len = AUDIO_DMA_BUFFER_LEN;
config.use_apll = false;
config.tx_desc_auto_clear = true;
config.fixed_mclk = 0;

i2s_pin_config_t pins = {};
pins.bck_io_num = AUDIO_I2S_BCLK_PIN;
pins.ws_io_num = AUDIO_I2S_LRC_PIN;
pins.data_out_num = AUDIO_I2S_DOUT_PIN;
pins.data_in_num = I2S_PIN_NO_CHANGE;

esp_err_t result = i2s_driver_install(AUDIO_I2S_PORT, &config, 0, nullptr);
if (result != ESP_OK) {
Serial.printf("I2S install failed: %d\n", result);
return false;
}

result = i2s_set_pin(AUDIO_I2S_PORT, &pins);
if (result != ESP_OK) {
Serial.printf("I2S pin setup failed: %d\n", result);
i2s_driver_uninstall(AUDIO_I2S_PORT);
return false;
}

result = i2s_set_clk(
AUDIO_I2S_PORT,
sampleRate,
I2S_BITS_PER_SAMPLE_16BIT,
I2S_CHANNEL_STEREO
);

if (result != ESP_OK) {
Serial.printf("I2S clock setup failed: %d\n", result);
i2s_driver_uninstall(AUDIO_I2S_PORT);
return false;
}

i2s_zero_dma_buffer(AUDIO_I2S_PORT);
return true;
}

bool writeSilence(uint32_t sampleRate, uint32_t durationMs) {
int16_t stereoBuffer[256] = {0};

uint32_t totalFrames = (sampleRate * durationMs) / 1000;
uint32_t sentFrames = 0;

while (sentFrames < totalFrames) {
size_t frames = min(
  static_cast<size_t>(128),
  static_cast<size_t>(totalFrames - sentFrames)
);

size_t requestedBytes = frames * 4;
size_t bytesWritten = 0;

esp_err_t result = i2s_write(
  AUDIO_I2S_PORT,
  stereoBuffer,
  requestedBytes,
  &bytesWritten,
  portMAX_DELAY
);

if (result != ESP_OK || bytesWritten != requestedBytes) {
  Serial.println("I2S silence write failed");
  return false;
}

sentFrames += frames;
}

return true;
}

void stopI2S(uint32_t sampleRate) {
writeSilence(sampleRate, AUDIO_SHUTDOWN_SILENCE_MS);

uint32_t drainMs = static_cast<uint32_t>(
(
  static_cast<uint64_t>(AUDIO_DMA_BUFFER_COUNT)
  * static_cast<uint64_t>(AUDIO_DMA_BUFFER_LEN)
  * 1000ULL
) / sampleRate
) + 30;

delay(drainMs);
i2s_driver_uninstall(AUDIO_I2S_PORT);

pinMode(AUDIO_I2S_BCLK_PIN, INPUT_PULLDOWN);
pinMode(AUDIO_I2S_LRC_PIN, INPUT_PULLDOWN);
pinMode(AUDIO_I2S_DOUT_PIN, INPUT_PULLDOWN);
}

void abortI2S() {
i2s_zero_dma_buffer(AUDIO_I2S_PORT);
delay(10);
i2s_driver_uninstall(AUDIO_I2S_PORT);

pinMode(AUDIO_I2S_BCLK_PIN, INPUT_PULLDOWN);
pinMode(AUDIO_I2S_LRC_PIN, INPUT_PULLDOWN);
pinMode(AUDIO_I2S_DOUT_PIN, INPUT_PULLDOWN);
}

bool isHttpsUrl(const String &url) {
return url.startsWith("https://");
}

bool beginHttpClient(HTTPClient &http, const String &url) {
bool started = false;

if (isHttpsUrl(url)) {
wifiClientSecure.setInsecure();
started = http.begin(wifiClientSecure, url);
} else {
started = http.begin(wifiClient, url);
}

if (started) {
http.setTimeout(10000);
}

return started;
}

String urlEncodeComponent(const String &value) {
String encoded = "";
encoded.reserve(value.length() * 3);

const char *hex = "0123456789ABCDEF";

for (size_t i = 0; i < value.length(); i++) {
char c = value.charAt(i);
bool unreserved =
(c >= 'A' && c <= 'Z')
|| (c >= 'a' && c <= 'z')
|| (c >= '0' && c <= '9')
|| c == '-'
|| c == '_'
|| c == '.'
|| c == '~';

if (unreserved) {
  encoded += c;
} else {
  uint8_t byteValue = static_cast<uint8_t>(c);
  encoded += '%';
  encoded += hex[(byteValue >> 4) & 0x0F];
  encoded += hex[byteValue & 0x0F];
}

}

return encoded;
}

String resolvedBackendUrl(const String &pathOrUrl) {
if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
return pathOrUrl;
}

if (pathOrUrl.startsWith("/")) {
return apiUrl(pathOrUrl);
}

return apiUrl("/" + pathOrUrl);
}

uint8_t hexNibble(char c) {
if (c >= '0' && c <= '9') return c - '0';
if (c >= 'a' && c <= 'f') return c - 'a' + 10;
if (c >= 'A' && c <= 'F') return c - 'A' + 10;
return 0;
}

uint8_t hexByte(const String &value, int offset) {
return (hexNibble(value.charAt(offset)) << 4) | hexNibble(value.charAt(offset + 1));
}

uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

uint16_t rgb565FromHex(const String &value, uint16_t fallback) {
if (value.length() != 7 || value.charAt(0) != '#') {
return fallback;
}

for (int i = 1; i < 7; i++) {
char c = value.charAt(i);
bool valid = (c >= '0' && c <= '9')
|| (c >= 'a' && c <= 'f')
|| (c >= 'A' && c <= 'F');
if (!valid) return fallback;
}

return rgb565(hexByte(value, 1), hexByte(value, 3), hexByte(value, 5));
}

bool isHexColor(const String &value) {
if (value.length() != 7 || value.charAt(0) != '#') return false;

for (int i = 1; i < 7; i++) {
char c = value.charAt(i);
bool valid = (c >= '0' && c <= '9')
|| (c >= 'a' && c <= 'f')
|| (c >= 'A' && c <= 'F');
if (!valid) return false;
}

return true;
}

uint8_t scaleChannel(uint8_t value, uint8_t numerator, uint8_t add = 0) {
return min(255, add + ((static_cast<uint16_t>(value) * numerator) / 100));
}

void applyThemeColors() {
String accentHex = isHexColor(deviceSettings.accentColor) ? deviceSettings.accentColor : "#00B8FF";
uint8_t r = hexByte(accentHex, 1);
uint8_t g = hexByte(accentHex, 3);
uint8_t b = hexByte(accentHex, 5);
uint16_t accent = rgb565FromHex(accentHex, 0x07FF);

if (deviceSettings.effectiveTheme == "LIGHT") {
COLOR_BG = 0xFFFF;
COLOR_PANEL = rgb565(239, 247, 250);
COLOR_PANEL_INNER = rgb565(228, 240, 244);
COLOR_LINE = rgb565(scaleChannel(r, 60, 30), scaleChannel(g, 60, 30), scaleChannel(b, 60, 30));
COLOR_TEXT = 0x0841;
COLOR_MUTED = 0x5AEB;
COLOR_ACCENT = accent;
COLOR_SELECTED = rgb565(scaleChannel(r, 22, 18), scaleChannel(g, 22, 18), scaleChannel(b, 22, 18));
} else {
COLOR_BG = 0x0000;
COLOR_PANEL = rgb565(1, 18, 22);
COLOR_PANEL_INNER = rgb565(4, 34, 40);
COLOR_LINE = rgb565(scaleChannel(r, 48), scaleChannel(g, 48), scaleChannel(b, 48));
COLOR_TEXT = 0xFFFF;
COLOR_MUTED = 0xBDF7;
COLOR_ACCENT = accent;
COLOR_SELECTED = rgb565(scaleChannel(r, 24), scaleChannel(g, 24), scaleChannel(b, 24));
}

COLOR_WARN = COLOR_ACCENT;
COLOR_ERROR = COLOR_TEXT;
COLOR_OK = COLOR_ACCENT;
}

void applyDisplayBrightness() {
#if defined(TFT_BL)
pinMode(TFT_BL, OUTPUT);
int brightness = displayAwake ? constrain(deviceSettings.displayBrightness, 0, 100) : 0;
int pwm = map(brightness, 0, 100, 0, 255);
analogWrite(TFT_BL, pwm);
#endif
}

void markDisplayActivity(bool redrawOnWake = true) {
lastDisplayActivityAt = millis();

if (!displayAwake) {
displayAwake = true;
applyDisplayBrightness();
if (redrawOnWake) {
  drawScreen();
}
}
}

void handleDisplayTimeout() {
if (!displayAwake || deviceSettings.displayTimeoutMs == 0) {
return;
}

if (millis() - lastDisplayActivityAt >= deviceSettings.displayTimeoutMs) {
displayAwake = false;
applyDisplayBrightness();
}
}

bool writeTone(uint32_t sampleRate, uint32_t durationMs, uint32_t frequencyHz) {
if (!initI2S(sampleRate)) {
return false;
}

if (!writeSilence(sampleRate, AUDIO_PREROLL_SILENCE_MS)) {
abortI2S();
return false;
}

int volume = deviceSettings.soundsEnabled ? constrain(deviceSettings.deviceVolume, 0, 100) : 0;
uint32_t totalFrames = (sampleRate * durationMs) / 1000;
uint32_t phase = 0;
uint32_t phaseStep = (frequencyHz * 65536UL) / sampleRate;
int16_t stereoBuffer[256];
uint32_t sentFrames = 0;

while (sentFrames < totalFrames) {
size_t frames = min(static_cast<size_t>(128), static_cast<size_t>(totalFrames - sentFrames));

for (size_t i = 0; i < frames; i++) {
  int32_t sample = phase < 32768UL ? 12000 : -12000;
  sample = (sample * volume) / 100;
  stereoBuffer[i * 2] = static_cast<int16_t>(sample);
  stereoBuffer[i * 2 + 1] = static_cast<int16_t>(sample);
  phase += phaseStep;
}

size_t bytesWritten = 0;
size_t requestedBytes = frames * 4;
esp_err_t result = i2s_write(AUDIO_I2S_PORT, stereoBuffer, requestedBytes, &bytesWritten, portMAX_DELAY);
if (result != ESP_OK || bytesWritten != requestedBytes) {
  abortI2S();
  return false;
}

sentFrames += frames;
}

stopI2S(sampleRate);
return true;
}

void playSettingsTestSound() {
if (!deviceSettings.soundsEnabled || deviceSettings.deviceVolume <= 0) {
Serial.println("Settings testsound skipped: sounds disabled or volume zero");
return;
}

setStatusTextLimited("Testsound spielt");
drawFooter();
writeTone(16000, 180, 880);
delay(60);
writeTone(16000, 180, 1320);
setStatusTextLimited("Testsound abgespielt");
drawFooter();
}

void drawOtaMessage(const String &title, const String &subtitle) {
screen.screenType = "MESSAGE";
setStringLimited(screen.title, title.c_str(), CAP_SCREEN_TITLE - 1);
setStringLimited(screen.subtitle, subtitle.c_str(), CAP_SCREEN_SUBTITLE - 1);
screen.lineCount = 0;
screen.menuCount = 0;
screen.selectedIndex = -1;
drawScreen();
}

String resolvedFirmwareUrl(const String &firmwareUrl) {
return resolvedBackendUrl(firmwareUrl);
}

void handleOtaProgress(int progress, int total) {
if (total <= 0) {
return;
}

int percent = (progress * 100) / total;
percent = constrain(percent, 0, 100);

if (percent == lastOtaProgressPercent || (percent < 100 && percent - lastOtaProgressPercent < 10)) {
return;
}

lastOtaProgressPercent = percent;
drawOtaMessage("Firmware Update", "Download " + String(percent) + "%");
}

bool installFirmwareUpdate(const String &firmwareUrl, const String &latestVersion) {
String updateUrl = resolvedFirmwareUrl(firmwareUrl);
lastOtaProgressPercent = -1;

Serial.print("OTA download: ");
Serial.println(updateUrl);

drawOtaMessage("Firmware Update", "Installiere " + latestVersion);

httpUpdate.rebootOnUpdate(false);
httpUpdate.onStart([]() {
drawOtaMessage("Firmware Update", "Download startet");
});
httpUpdate.onProgress(handleOtaProgress);
httpUpdate.onEnd([]() {
drawOtaMessage("Firmware Update", "Neustart...");
});
httpUpdate.onError([](int error) {
setLastErrorLimited("OTA Fehler " + String(error));
drawOtaMessage("Update Fehler", httpUpdate.getLastErrorString());
});

HTTPUpdateRequestCB authHeaders = [](HTTPClient *client) {
client->addHeader("X-Device-Id", deviceId);
client->addHeader("X-Device-Key", deviceKey);
client->addHeader("X-Firmware-Version", FIRMWARE_VERSION);
};

t_httpUpdate_return result;

if (isHttpsUrl(updateUrl)) {
wifiClientSecure.setInsecure();
result = httpUpdate.update(wifiClientSecure, updateUrl, FIRMWARE_VERSION, authHeaders);
} else {
result = httpUpdate.update(wifiClient, updateUrl, FIRMWARE_VERSION, authHeaders);
}

switch (result) {
case HTTP_UPDATE_OK:
drawOtaMessage("Update fertig", "Neustart...");
delay(1200);
ESP.restart();
return true;
case HTTP_UPDATE_NO_UPDATES:
setStatusTextLimited("Firmware aktuell");
drawScreen();
return false;
case HTTP_UPDATE_FAILED:
default:
setLastErrorLimited("OTA " + String(httpUpdate.getLastError()));
Serial.print("OTA failed: ");
Serial.println(httpUpdate.getLastErrorString());
drawOtaMessage("Update Fehler", httpUpdate.getLastErrorString());
delay(2200);
return false;
}
}

bool checkForFirmwareUpdate(bool showStatus) {
if (WiFi.status() != WL_CONNECTED || deviceId.length() == 0 || deviceKey.length() == 0) {
return false;
}

lastOtaCheckAt = millis();

if (showStatus) {
drawOtaMessage("Firmware", "Update pruefen...");
}

HTTPClient http;
String url = apiUrl("/api/device/firmware/latest/manifest?currentVersion=" + urlEncodeComponent(FIRMWARE_VERSION));

if (!beginHttpClient(http, url)) {
setLastErrorLimited("OTA manifest init failed");
return false;
}

http.addHeader("X-Device-Id", deviceId);
http.addHeader("X-Device-Key", deviceKey);
http.addHeader("X-Firmware-Version", FIRMWARE_VERSION);

int code = http.GET();
String response = http.getString();
http.end();

Serial.print("OTA manifest HTTP ");
Serial.println(code);
Serial.println(response);

if (code == 404) {
setStatusTextLimited("Kein OTA Update");
if (showStatus) {
setStartScreen("Bereit");
drawScreen();
}
return false;
}

if (code < 200 || code >= 300) {
setLastErrorLimited("OTA HTTP " + String(code));
if (showStatus) drawOtaMessage("Update Fehler", "Manifest HTTP " + String(code));
return false;
}

StaticJsonDocument<1024> doc;
DeserializationError error = deserializeJson(doc, response);

if (error) {
setLastErrorLimited("OTA JSON Fehler");
if (showStatus) drawOtaMessage("Update Fehler", "Manifest ungueltig");
return false;
}

bool updateAvailable = doc["updateAvailable"] | false;

if (!updateAvailable) {
setStatusTextLimited("Firmware aktuell");
if (showStatus) {
setStartScreen("Bereit");
drawScreen();
}
return false;
}

String latestVersion = doc["latestVersion"] | "";
String firmwareUrl = doc["firmwareUrl"] | "";

if (firmwareUrl.length() == 0) {
setLastErrorLimited("OTA URL fehlt");
if (showStatus) drawOtaMessage("Update Fehler", "Firmware URL fehlt");
return false;
}

if (latestVersion.length() == 0) {
latestVersion = "neu";
}

return installFirmwareUpdate(firmwareUrl, latestVersion);
}

bool registerDeviceWithBackend() {
if (WiFi.status() != WL_CONNECTED || deviceId.length() == 0 || deviceKey.length() == 0) {
return false;
}

lastDeviceLinkCheckAt = millis();

static StaticJsonDocument<256> doc;
doc.clear();
doc["name"] = deviceId;
doc["deviceKey"] = deviceKey;
doc["active"] = true;

String body;
serializeJson(doc, body);

HTTPClient http;
String url = apiUrl("/api/device/register");

if (!beginHttpClient(http, url)) {
setLastErrorLimited("Device register init failed");
return false;
}

http.addHeader("Content-Type", "application/json");

int code = http.POST(body);
String response = http.getString();

http.end();

Serial.print("Device register HTTP ");
Serial.println(code);
Serial.println(response);

if (code >= 200 && code < 300) {
StaticJsonDocument<512> responseDoc;
DeserializationError error = deserializeJson(responseDoc, response);

if (!error) {
  setStringLimited(pairingCode, responseDoc["pairingCode"] | "", CAP_PAIRING_CODE - 1);
  deviceLinked = responseDoc["linked"] | false;
  deviceCreatedInBackend = responseDoc["createdNow"] | false;
  const char *accountUsername = responseDoc["accountUsername"] | nullptr;
  if (accountUsername == nullptr) accountUsername = responseDoc["username"] | nullptr;
  if (accountUsername == nullptr) accountUsername = responseDoc["accountName"] | nullptr;
  if (deviceLinked && accountUsername != nullptr) {
    setLinkedAccountUsernameLimited(String(accountUsername));
  } else {
    linkedAccountUsername = "";
  }
} else {
  pairingCode = "";
  deviceLinked = false;
  deviceCreatedInBackend = false;
  linkedAccountUsername = "";
}

deviceRegistered = true;
if (deviceLinked) {
  setStatusTextLimited("Account geprueft");
} else if (deviceCreatedInBackend) {
  setStatusTextLimited("Reader neu registriert");
} else {
  setStatusTextLimited("Pairing Code bereit");
}
return true;

}

deviceRegistered = false;
deviceLinked = false;
deviceCreatedInBackend = false;
linkedAccountUsername = "";
setLastErrorLimited("Register HTTP " + String(code));
return false;
}

bool applyScreenModel(JsonObject s, const char *nextStateKey, const char *backendStatusText) {
if (s.isNull()) {
return false;
}

const bool wasNumberPicker = screen.screenType == "NUMBER_PICKER";
bool wasTeamSizeSetup = screen.isTeamSizeSetup;
const int previousMenuCount = screen.menuCount;
const int previousSelectedIndex = screen.selectedIndex;
uint32_t previousStateHash = 2166136261u;
previousStateHash = hashMixString(previousStateHash, currentStateKey);
previousStateHash = hashMixString(previousStateHash, screen.screenType);

setStringLimited(currentStateKey, nextStateKey, CAP_STATE_KEY - 1);
setStringLimited(screen.backendStatus, backendStatusText, CAP_BACKEND_STATUS - 1);

setStringLimited(screen.screenType, s["screenType"] | "MESSAGE", CAP_SCREEN_TYPE - 1);
setStringLimited(screen.title, s["title"] | "Device", CAP_SCREEN_TITLE - 1);
setStringLimited(screen.subtitle, s["subtitle"] | "", CAP_SCREEN_SUBTITLE - 1);
screen.selectedIndex = s["selectedIndex"].isNull()
? -1
: s["selectedIndex"].as<int>();
screen.isTeamSizeSetup = false;
screen.nodeType = "";
screen.sessionStatus = "";
screen.teamName = "";
screen.canStartGame = false;
screen.completedTeamCount = 0;
screen.teamPlayerCount = 0;
screen.teamTargetSize = 0;
screen.teamRemainingSlots = 0;

JsonObject context = s["context"];

if (!context.isNull()) {
const char *setupState = context["setupState"] | "";
screen.isTeamSizeSetup = strcmp(setupState, "setup-team-size") == 0;
setStringLimited(screen.nodeType, context["nodeType"] | "", CAP_SCREEN_NODE_TYPE - 1);
setStringLimited(screen.sessionStatus, context["sessionStatus"] | "", CAP_SCREEN_SESSION_STATUS - 1);
setStringLimited(screen.teamName, context["teamName"] | "", CAP_SCREEN_LINE - 1);
screen.canStartGame = contextBoolOr(context, "canStartGame", "hasCompletedTeam", false);
screen.completedTeamCount = max(0, contextIntOr(context, "completedTeamCount", "completedTeams", "teamCount", 0));
screen.teamPlayerCount = max(0, contextIntOr(context, "teamPlayerCount", "playerCount", "scannedPlayers", 0));
screen.teamTargetSize = max(0, contextIntOr(context, "teamTargetSize", "targetSize", "teamSize", 0));
screen.teamRemainingSlots = max(0, contextIntOr(context, "teamRemainingSlots", "remainingPlayers", "remainingSlots", 0));
}

int parsedMinValue = screen.isTeamSizeSetup ? 1 : NUMBER_PICKER_MIN_VALUE;
int parsedMaxValue = screen.isTeamSizeSetup ? 20 : NUMBER_PICKER_MAX_VALUE;

if (!context.isNull()) {
parsedMinValue = contextIntOr(context, "min", "numberMin", "minValue", parsedMinValue);
parsedMaxValue = contextIntOr(context, "max", "numberMax", "maxValue", parsedMaxValue);
parsedMinValue = contextIntOr(context, "minTeamSize", "teamSizeMin", "teamMin", parsedMinValue);
parsedMaxValue = contextIntOr(context, "maxTeamSize", "teamSizeMax", "teamMax", parsedMaxValue);
}

parsedMinValue = constrain(parsedMinValue, 0, NUMBER_PICKER_MAX_VALUE);
parsedMaxValue = constrain(parsedMaxValue, parsedMinValue, NUMBER_PICKER_MAX_VALUE);
numberPickerMinValue = parsedMinValue;
numberPickerMaxValue = parsedMaxValue;

screen.hasNumberValue = !s["numberValue"].isNull();
int parsedNumberValue = screen.hasNumberValue
? s["numberValue"].as<int>()
: numberPickerMinValue;
screen.numberValue = constrain(parsedNumberValue, numberPickerMinValue, numberPickerMaxValue);

int parsedSmallStep = screen.isTeamSizeSetup ? 1 : 1;
int parsedLargeStep = screen.isTeamSizeSetup ? 1 : 5;

if (!context.isNull()) {
JsonVariant smallStepVariant = context["numberSmallStep"];
JsonVariant largeStepVariant = context["numberLargeStep"];

int smallStep = smallStepVariant.isNull() ? parsedSmallStep : smallStepVariant.as<int>();
int largeStep = largeStepVariant.isNull() ? parsedLargeStep : largeStepVariant.as<int>();

parsedSmallStep = max(1, smallStep);
parsedLargeStep = max(parsedSmallStep, largeStep);

}

numberPickerSmallStep = parsedSmallStep;
numberPickerLargeStep = parsedLargeStep;

uint32_t currentStateHash = 2166136261u;
currentStateHash = hashMixString(currentStateHash, currentStateKey);
currentStateHash = hashMixString(currentStateHash, screen.screenType);
bool stateChanged = currentStateHash != previousStateHash;

if (screen.isTeamSizeSetup) {
int backendValue = max(1, screen.numberValue);
if (stateChanged || !wasTeamSizeSetup || !localTeamSizeActive) {
localTeamSizeValue = backendValue;
}
if (stateChanged || !wasTeamSizeSetup) {
localTeamSizeActive = false;
}
} else {
localTeamSizeActive = false;
}

if (screen.screenType == "NUMBER_PICKER") {
int backendValue = max(1, screen.numberValue);
if (stateChanged || !wasNumberPicker || !localNumberActive) {
localNumberValue = backendValue;
}
if (stateChanged || !wasNumberPicker) {
localNumberActive = false;
localNumberTyping = false;
localNumberInputEmpty = false;
}
} else {
localNumberActive = false;
localNumberTyping = false;
localNumberInputEmpty = false;
}

screen.lineCount = 0;

JsonArray lines = s["lines"];

if (!lines.isNull()) {
for (JsonVariant line : lines) {
if (screen.lineCount >= MAX_LINES) break;

  setStringLimited(screen.lines[screen.lineCount], line.as<const char*>(), CAP_SCREEN_LINE - 1);
  screen.lineCount++;
}

}

screen.menuCount = 0;

JsonArray menuItems = s["menuItems"];

if (!menuItems.isNull()) {
for (JsonObject item : menuItems) {
if (screen.menuCount >= MAX_MENU_ITEMS) break;

  setStringLimited(screen.menuLabels[screen.menuCount], item["label"] | "", CAP_MENU_LABEL - 1);
  setStringLimited(screen.menuValues[screen.menuCount], item["value"] | "", CAP_MENU_VALUE - 1);
  screen.menuCount++;
}

}

normalizeMenuPage(
stateChanged
|| previousMenuCount != screen.menuCount
|| previousSelectedIndex != screen.selectedIndex
);

return true;
}

void parseAllowedCardList(JsonArray cards, String target[], int &targetCount) {
targetCount = 0;

if (cards.isNull()) {
return;
}

for (JsonVariant card : cards) {
if (targetCount >= MAX_ALLOWED_CARD_UIDS) break;

setStringLimited(target[targetCount], card.as<const char*>(), CAP_LAST_UUID - 1);
targetCount++;

}
}

void parseUiHints(JsonObject hints) {
clearUiHints();
clearAllowedCards();

if (hints.isNull()) {
return;
}

parseAllowedCardList(hints["allowedPlayerCardUids"], allowedPlayerCardUids, allowedPlayerCardUidCount);
parseAllowedCardList(hints["allowedGameCardUids"], allowedGameCardUids, allowedGameCardUidCount);

JsonArray predictions = hints["predictions"];

if (predictions.isNull()) {
return;
}

for (JsonObject prediction : predictions) {
if (uiPredictionCount >= MAX_UI_PREDICTIONS) break;

JsonObject predictedScreen = prediction["screen"];
if (predictedScreen.isNull()) {
  continue;
}

String screenJson;
screenJson.reserve(CAP_PREDICTION_SCREEN_JSON);
serializeJson(predictedScreen, screenJson);

if (screenJson.length() == 0 || screenJson.length() >= CAP_PREDICTION_SCREEN_JSON) {
  continue;
}

UiPrediction &target = uiPredictions[uiPredictionCount];
target.active = true;
setStringLimited(target.eventType, prediction["eventType"] | "", CAP_PREDICTION_EVENT - 1);
setStringLimited(target.targetStateKey, prediction["currentStateKey"] | "", CAP_STATE_KEY - 1);
setStringLimited(target.status, prediction["status"] | "", CAP_BACKEND_STATUS - 1);
target.matchIndex = -1;
target.matchValue = "";
target.screenJson = screenJson;

JsonObject match = prediction["match"];
if (!match.isNull()) {
  if (!match["index"].isNull()) {
    target.matchIndex = match["index"].as<int>();
  }
  setStringLimited(target.matchValue, match["value"] | "", CAP_MENU_VALUE - 1);
}

uiPredictionCount++;

}
}

bool isBackendTerminalState() {
return screen.backendStatus == "FINISHED"
|| screen.backendStatus == "RESET"
|| screen.backendStatus == "CANCELLED"
|| screen.screenType == "RESULT";
}

bool parseDeviceResponse(const String &body) {
static StaticJsonDocument<24576> doc;
doc.clear();

DeserializationError err = deserializeJson(doc, body);

if (err) {
setLastErrorLimited("JSON Fehler");
showTransientFooter("Antwort ungueltig/zu gross", 2500);
Serial.print("JSON parse failed: ");
Serial.println(err.c_str());
Serial.print("JSON length: ");
Serial.println(body.length());
return false;
}

const char *parsedSessionId = doc["sessionId"] | nullptr;
if (parsedSessionId != nullptr) {
setStringLimited(sessionId, parsedSessionId, CAP_SESSION_ID - 1);
}

const char *scannedCardType = doc["scannedCardType"] | nullptr;
if (scannedCardType != nullptr) {
if (strcmp(scannedCardType, "PLAYER") == 0) {
setStringLimited(lastScannedPlayerName, doc["scannedPlayerName"] | "", CAP_PLAYER_NAME - 1);
lastScanWasPlayer = lastScannedPlayerName.length() > 0;
} else {
lastScannedPlayerName = "";
lastScanWasPlayer = false;
}
}

JsonObject s = doc["screen"];
bool screenApplied = applyScreenModel(s, doc["currentStateKey"] | "", doc["status"] | "NO SESSION");
if (!screenApplied) {
setLastErrorLimited("Screen fehlt");
return false;
}

parseUiHints(doc["uiHints"]);

screen.effects = "";

JsonArray effects = doc["effects"];

if (!effects.isNull()) {
for (JsonVariant effect : effects) {
if (screen.effects.length() > 0) {
screen.effects += ", ";
}

  const char *effectText = effect.as<const char*>();
  if (effectText != nullptr) {
    screen.effects += effectText;
  }

  if (screen.effects.length() > CAP_EFFECTS - 1) {
    screen.effects.remove(CAP_EFFECTS - 1);
    break;
  }
}

}

lastError = "";

JsonArray errors = doc["errors"];

if (!errors.isNull() && errors.size() > 0) {
setStringLimited(lastError, errors[0].as<const char*>(), CAP_LAST_ERROR - 1);
}

if (isBackendTerminalState()) {
String terminalStatus = screen.backendStatus;
setStartScreen(terminalStatus == "RESET" ? "Session reset" : "Spiel beendet");
showTransientFooter(terminalStatus == "RESET" ? "Session wurde beendet" : "Spiel beendet", 2200);
} else {
autoReturnToStartPending = false;
}

return true;
}

bool applyUiPrediction(UiPrediction &prediction) {
if (!prediction.active || prediction.screenJson.length() == 0) {
return false;
}

static StaticJsonDocument<4096> predictedDoc;
predictedDoc.clear();

DeserializationError err = deserializeJson(predictedDoc, prediction.screenJson);
if (err) {
Serial.print("Prediction parse failed: ");
Serial.println(err.c_str());
return false;
}

bool ok = applyScreenModel(
predictedDoc.as<JsonObject>(),
prediction.targetStateKey.length() > 0 ? prediction.targetStateKey.c_str() : currentStateKey.c_str(),
prediction.status.length() > 0 ? prediction.status.c_str() : screen.backendStatus.c_str()
);

if (!ok) {
return false;
}

setStatusTextLimited("Sofortanzeige");
showTransientFooter("Backend prueft...", 1200);
lastScreenRefreshAt = millis();
drawScreen();
return true;
}

bool showPredictionForMenuSelection(int index) {
if (index < 0 || index >= screen.menuCount) {
return false;
}

for (int i = 0; i < uiPredictionCount; i++) {
UiPrediction &prediction = uiPredictions[i];
if (!prediction.active || prediction.eventType != "TOUCH_MENU_SELECT") {
continue;
}

bool indexMatches = prediction.matchIndex < 0 || prediction.matchIndex == index;
bool valueMatches = prediction.matchValue.length() == 0 || prediction.matchValue == screen.menuValues[index];

if (indexMatches && valueMatches) {
  return applyUiPrediction(prediction);
}

}

return false;
}

bool showPredictionForEvent(const String &eventType) {
for (int i = 0; i < uiPredictionCount; i++) {
UiPrediction &prediction = uiPredictions[i];
if (!prediction.active || prediction.eventType != eventType) {
continue;
}

return applyUiPrediction(prediction);

}

return false;
}

bool sendDeviceEvent(
const String &eventType,
const String &cardUid,
JsonDocument *payloadDoc,
const String *eventStateKeyOverride = nullptr
) {
if (WiFi.status() != WL_CONNECTED && !ensureWifiConnected()) {
setLastErrorLimited("WLAN offline");
drawScreen();
return false;
}

static StaticJsonDocument<1024> doc;
doc.clear();

doc["deviceId"] = deviceId;
doc["deviceKey"] = deviceKey;

if (sessionId.length() > 0) {
doc["sessionId"] = sessionId;
} else {
doc["sessionId"] = nullptr;
}

const String &eventStateKey = eventStateKeyOverride != nullptr ? *eventStateKeyOverride : currentStateKey;

if (eventStateKey.length() > 0) {
doc["currentStateKey"] = eventStateKey;
} else {
doc["currentStateKey"] = nullptr;
}

doc["eventType"] = eventType;

if (cardUid.length() > 0) {
doc["cardUid"] = cardUid;
} else {
doc["cardUid"] = nullptr;
}

JsonObject payload = doc.createNestedObject("payload");

if (payloadDoc != nullptr) {
JsonObject source = payloadDoc->as<JsonObject>();

for (JsonPair kv : source) {
  payload[kv.key().c_str()] = kv.value();
}

}

String body;

serializeJson(doc, body);

Serial.println("POST /api/device/events");
Serial.println(body);

HTTPClient http;
String url = apiUrl("/api/device/events");

if (!beginHttpClient(http, url)) {
setLastErrorLimited("HTTP init failed");
drawScreen();
return false;
}

http.addHeader("Content-Type", "application/json");

int code = http.POST(body);
String response = http.getString();

http.end();

Serial.print("HTTP ");
Serial.println(code);
Serial.println(response);

if (code < 200 || code >= 300) {
setLastErrorLimited("HTTP " + String(code));

screen.screenType = "ERROR";
screen.title = "Request Fehler";
screen.subtitle = response.length() > 0
  ? fitText(response, 80)
  : lastError;
screen.lineCount = 0;

drawScreen();

return false;

}

uint32_t beforeSnapshot = screenSnapshotHash();
bool ok = parseDeviceResponse(response);

setStatusTextLimited(eventType + " gesendet");

if (!ok && sessionId.length() > 0) {
loadCurrentScreen();
return false;
}

uint32_t afterSnapshot = screenSnapshotHash();

if (afterSnapshot != beforeSnapshot) {
drawScreen();
} else {
drawFooter();
}

return ok;
}

bool loadCurrentScreen() {
if (sessionId.length() == 0 || (WiFi.status() != WL_CONNECTED && !ensureWifiConnected(false))) {
return false;
}

uint32_t beforeSnapshot = screenSnapshotHash();

HTTPClient http;
String url = apiUrl("/api/device/sessions/" + sessionId + "/screen");

if (!beginHttpClient(http, url)) {
setLastErrorLimited("HTTP init failed");
drawScreen();
return false;
}

http.addHeader("X-Device-Id", deviceId);
http.addHeader("X-Device-Key", deviceKey);

int code = http.GET();
String response = http.getString();

http.end();

if (code < 200 || code >= 300) {
setLastErrorLimited("Screen HTTP " + String(code));
drawScreen();
return false;
}

bool ok = parseDeviceResponse(response);

if (ok) {
setStatusTextLimited("Screen geladen");
uint32_t afterSnapshot = screenSnapshotHash();

if (afterSnapshot != beforeSnapshot) {
  drawScreen();
} else {
  drawFooter();
}

}

return ok;
}

bool fetchAudioMetadata(const String &path, long knownVersion, AudioTestMetadata &metadata) {
if (WiFi.status() != WL_CONNECTED || deviceId.length() == 0 || deviceKey.length() == 0) {
Serial.println("Audio metadata skipped: wifi/device credentials missing");
return false;
}

HTTPClient http;
String url = apiUrl(path + "?knownVersion=" + String(knownVersion));
Serial.print("Audio metadata GET ");
Serial.println(url);

if (!beginHttpClient(http, url)) {
Serial.println("Audio metadata HTTP init failed");
return false;
}

http.addHeader("X-Device-Id", deviceId);
http.addHeader("X-Device-Key", deviceKey);

int code = http.GET();
String response = http.getString();
http.end();

Serial.printf("Audio metadata HTTP %d\n", code);
if (response.length() > 0) {
Serial.println(response);
}

if (code < 200 || code >= 300) {
return false;
}

StaticJsonDocument<768> doc;
DeserializationError error = deserializeJson(doc, response);

if (error) {
Serial.println("Audio metadata JSON Fehler");
return false;
}

metadata.available = doc["available"] | false;
metadata.hasNewAudio = doc["hasNewAudio"] | false;
metadata.version = doc["version"] | 0L;
setStringLimited(metadata.audioUrl, doc["audioUrl"] | "", CAP_AUDIO_URL - 1);
Serial.printf(
"Audio metadata parsed: available=%s hasNewAudio=%s version=%ld knownVersion=%ld\n",
metadata.available ? "true" : "false",
metadata.hasNewAudio ? "true" : "false",
metadata.version,
knownVersion
);
return true;
}

bool fetchDeviceSettings(bool force = false) {
if (!force && millis() - lastSettingsPollAt < DEVICE_SETTINGS_POLL_INTERVAL_MS) {
return false;
}

lastSettingsPollAt = millis();

if (WiFi.status() != WL_CONNECTED || deviceId.length() == 0 || deviceKey.length() == 0) {
return false;
}

HTTPClient http;
String url = apiUrl("/api/device/settings");

if (!beginHttpClient(http, url)) {
Serial.println("Settings HTTP init failed");
return false;
}

http.addHeader("X-Device-Id", deviceId);
http.addHeader("X-Device-Key", deviceKey);

int code = http.GET();
String response = http.getString();
http.end();

Serial.printf("Settings HTTP %d\n", code);

if (code < 200 || code >= 300) {
return false;
}

StaticJsonDocument<768> doc;
DeserializationError error = deserializeJson(doc, response);

if (error) {
Serial.println("Settings JSON Fehler");
return false;
}

long previousSettingsVersion = deviceSettings.settingsVersion;
long previousTestSoundVersion = deviceSettings.testSoundVersion;
String previousAccent = deviceSettings.accentColor;
String previousTheme = deviceSettings.effectiveTheme;
int previousBrightness = deviceSettings.displayBrightness;

setStringLimited(deviceSettings.accentColor, doc["accentColor"] | "#00B8FF", CAP_COLOR_HEX - 1);
setStringLimited(deviceSettings.themeMode, doc["themeMode"] | "SYSTEM", CAP_SCREEN_TYPE - 1);
setStringLimited(deviceSettings.effectiveTheme, doc["effectiveTheme"] | "DARK", CAP_SCREEN_TYPE - 1);
deviceSettings.displayBrightness = constrain(doc["displayBrightness"] | 80, 0, 100);
deviceSettings.deviceVolume = constrain(doc["deviceVolume"] | 80, 0, 100);
deviceSettings.soundsEnabled = doc["soundsEnabled"] | true;
deviceSettings.settingsVersion = doc["settingsVersion"] | 0L;
deviceSettings.testSoundVersion = doc["testSoundVersion"] | 0L;

if (doc["displayTimeoutSeconds"].isNull()) {
deviceSettings.displayTimeoutMs = 0;
} else {
int timeoutSeconds = doc["displayTimeoutSeconds"] | 300;
deviceSettings.displayTimeoutMs = max(0, timeoutSeconds) * 1000UL;
}

bool visualChanged = previousAccent != deviceSettings.accentColor || previousTheme != deviceSettings.effectiveTheme;
bool brightnessChanged = previousBrightness != deviceSettings.displayBrightness;

if (visualChanged) {
applyThemeColors();
drawScreen();
}

if (brightnessChanged) {
applyDisplayBrightness();
}

if (lastKnownTestSoundVersion == 0) {
lastKnownTestSoundVersion = deviceSettings.testSoundVersion;
} else if (deviceSettings.testSoundVersion > previousTestSoundVersion && deviceSettings.testSoundVersion > lastKnownTestSoundVersion) {
lastKnownTestSoundVersion = deviceSettings.testSoundVersion;
playSettingsTestSound();
}

if (deviceSettings.settingsVersion != previousSettingsVersion) {
Serial.printf("Settings applied version=%ld\n", deviceSettings.settingsVersion);
}

return true;
}

bool acknowledgeAudioPlayback(const String &path, long version) {
if (version <= 0 || WiFi.status() != WL_CONNECTED || deviceId.length() == 0 || deviceKey.length() == 0) {
return false;
}

StaticJsonDocument<96> doc;
doc["version"] = version;

String body;
serializeJson(doc, body);

HTTPClient http;
String url = apiUrl(path);

if (!beginHttpClient(http, url)) {
return false;
}

http.addHeader("Content-Type", "application/json");
http.addHeader("X-Device-Id", deviceId);
http.addHeader("X-Device-Key", deviceKey);

int code = http.POST(body);
String response = http.getString();
http.end();

if (code < 200 || code >= 300) {
Serial.printf("Audio ack HTTP %d\n", code);
if (response.length() > 0) {
Serial.println(response);
}
return false;
}

return true;
}

bool playLatestAudioWav(const AudioTestMetadata &metadata) {
if (!metadata.available || metadata.version <= 0 || metadata.audioUrl.length() == 0) {
return false;
}

String streamUrl = resolvedBackendUrl(metadata.audioUrl);

Serial.println();
Serial.println("========================================");
Serial.print("Audio GET: ");
Serial.println(streamUrl);

HTTPClient http;
WiFiClient *httpClient = nullptr;

if (isHttpsUrl(streamUrl)) {
wifiClientSecure.setInsecure();
wifiClientSecure.setTimeout(15000);
httpClient = &wifiClientSecure;
} else {
wifiClient.setTimeout(15000);
httpClient = &wifiClient;
}

http.setConnectTimeout(10000);
http.setTimeout(15000);
http.useHTTP10(true);

if (!http.begin(*httpClient, streamUrl)) {
setLastErrorLimited("Audio HTTP init fehlgeschlagen");
Serial.println("Audio HTTP init fehlgeschlagen");
return false;
}

http.addHeader("X-Device-Id", deviceId);
http.addHeader("X-Device-Key", deviceKey);

int code = http.GET();
Serial.printf("Audio HTTP %d\n", code);

int contentLength = http.getSize();
Serial.printf("HTTP Content-Length: %d\n", contentLength);

if (code < 200 || code >= 300) {
setLastErrorLimited("Audio HTTP " + String(code));
Serial.println(http.getString());
http.end();
return false;
}

WiFiClient *stream = http.getStreamPtr();
stream->setTimeout(15000);

uint16_t channels = 0;
uint32_t sampleRate = 0;
uint16_t bitsPerSample = 0;
uint32_t dataSize = 0;

if (!readWavHeader(stream, channels, sampleRate, bitsPerSample, dataSize)) {
setLastErrorLimited("WAV Header ungueltig");
http.end();
return false;
}

Serial.printf(
"WAV: channels=%u sampleRate=%lu bits=%u dataSize=%lu\n",
channels,
static_cast<unsigned long>(sampleRate),
bitsPerSample,
static_cast<unsigned long>(dataSize)
);

if (contentLength > 0 && dataSize > static_cast<uint32_t>(contentLength)) {
Serial.println(
  "WARNUNG: WAV dataSize ist groesser als der gesamte HTTP Body. "
  "Der WAV-Header enthaelt wahrscheinlich keine echte Dateilaenge."
);
}

if (
channels != 1
|| bitsPerSample != 16
|| dataSize == 0
|| (dataSize % 2) != 0
|| !supportedSampleRate(sampleRate)
) {
setLastErrorLimited("WAV Format nicht unterstuetzt");
Serial.println("WAV nicht unterstuetzt.");
Serial.println("Erwartet: PCM, Mono, 16 Bit Little Endian, 8/16/32/44.1/48 kHz");
http.end();
return false;
}

if (!initI2S(sampleRate)) {
setLastErrorLimited("I2S Init fehlgeschlagen");
http.end();
return false;
}

if (!writeSilence(sampleRate, AUDIO_PREROLL_SILENCE_MS)) {
setLastErrorLimited("I2S Stille fehlgeschlagen");
abortI2S();
http.end();
return false;
}

setStatusTextLimited("Audio Test spielt");
Serial.println("Playback startet...");

uint8_t inputBuffer[512];
int16_t stereoBuffer[512];
uint32_t totalRead = 0;
uint32_t fadeInSamples = (sampleRate * AUDIO_FADE_IN_MS) / 1000;

while (totalRead < dataSize) {
size_t wanted = min(
  static_cast<size_t>(sizeof(inputBuffer)),
  static_cast<size_t>(dataSize - totalRead)
);

if ((wanted % 2) != 0) {
setLastErrorLimited("WAV Block ungerade");
Serial.println("PCM Block hat ungerade Byteanzahl");
abortI2S();
http.end();
return false;
}

if (!readExact(stream, inputBuffer, wanted)) {
setLastErrorLimited("WAV Stream unterbrochen");
Serial.printf(
"Audio Stream unterbrochen bei %lu/%lu PCM Bytes\n",
static_cast<unsigned long>(totalRead),
static_cast<unsigned long>(dataSize)
);
Serial.printf(
"HTTP connected=%s available=%d contentLength=%d\n",
stream->connected() ? "true" : "false",
stream->available(),
contentLength
);

abortI2S();
http.end();
return false;
}

size_t sampleCount = wanted / 2;
for (size_t i = 0; i < sampleCount; i++) {
  // WICHTIG: RIFF WAV PCM16 ist Little Endian -> KEIN Byte-Swap.
  int16_t sample = static_cast<int16_t>(readLe16(inputBuffer, i * 2));

  int volume = deviceSettings.soundsEnabled ? constrain(deviceSettings.deviceVolume, 0, 100) : 0;
  int32_t value = (static_cast<int32_t>(sample) * volume) / (100 * AUDIO_VOLUME_DIVISOR);
  uint32_t absoluteSampleIndex = (totalRead / 2) + i;

  if (fadeInSamples > 0 && absoluteSampleIndex < fadeInSamples) {
    value = (
      value * static_cast<int32_t>(absoluteSampleIndex)
    ) / static_cast<int32_t>(fadeInSamples);
  }

  sample = static_cast<int16_t>(value);

  // Mono auf linken + rechten I2S Kanal kopieren.
  stereoBuffer[i * 2] = sample;
  stereoBuffer[i * 2 + 1] = sample;
}

size_t requestedBytes = sampleCount * 4;
size_t bytesWritten = 0;
esp_err_t writeResult = i2s_write(
  AUDIO_I2S_PORT,
  stereoBuffer,
  requestedBytes,
  &bytesWritten,
  portMAX_DELAY
);

if (writeResult != ESP_OK || bytesWritten != requestedBytes) {
  setLastErrorLimited("I2S Write unvollstaendig");
  Serial.printf(
    "I2S write failed: result=%d requested=%u written=%u\n",
    writeResult,
    static_cast<unsigned>(requestedBytes),
    static_cast<unsigned>(bytesWritten)
  );

  abortI2S();
  http.end();
  return false;
}

totalRead += wanted;

}

stopI2S(sampleRate);
http.end();

Serial.printf(
"Playback fertig: %lu / %lu Bytes\n",
static_cast<unsigned long>(totalRead),
static_cast<unsigned long>(dataSize)
);

return totalRead == dataSize;
}

bool tryPlayAudioSource(
const String &label,
const String &metadataPath,
const String &ackPath,
long &knownVersion
) {
AudioTestMetadata metadata;
if (!fetchAudioMetadata(metadataPath, knownVersion, metadata)) {
Serial.println(label + " polling: metadata fetch failed");
return false;
}

if (!metadata.hasNewAudio) {
Serial.println(label + " polling: no new audio");
return false;
}

if (!deviceSettings.soundsEnabled || deviceSettings.deviceVolume <= 0) {
knownVersion = metadata.version;
acknowledgeAudioPlayback(ackPath, metadata.version);
Serial.println(label + " polling: sounds disabled");
return false;
}

if (playLatestAudioWav(metadata)) {
knownVersion = metadata.version;
acknowledgeAudioPlayback(ackPath, metadata.version);
setStatusTextLimited(label + " abgespielt");
return true;
}

Serial.println(label + " polling: playback failed");
return false;
}

void handleAudioTestPlayback() {
if (!deviceRegistered) {
static unsigned long lastUnregisteredLogAt = 0;
if (millis() - lastUnregisteredLogAt > 5000) {
lastUnregisteredLogAt = millis();
Serial.println("Audio polling skipped: device not registered");
}
return;
}

if (millis() - lastAudioPollAt < AUDIO_POLL_INTERVAL_MS) {
return;
}

lastAudioPollAt = millis();

if (tryPlayAudioSource(
"Game Sound",
"/api/device/sounds/latest/metadata",
"/api/device/sounds/latest/ack",
lastKnownGameSoundVersion
)) {
return;
}

tryPlayAudioSource(
"Audio Test",
"/api/device/audio-test/latest/metadata",
"/api/device/audio-test/latest/ack",
lastKnownAudioTestVersion
);
}

void playStartupAudioOnce() {
if (startupAudioPlaybackAttempted || !deviceRegistered || !deviceLinked) {
return;
}

startupAudioPlaybackAttempted = true;
Serial.println("Startup Audio: spiele aktuelles Audio direkt beim Start");

lastKnownGameSoundVersion = 0;
lastKnownAudioTestVersion = 0;

if (tryPlayAudioSource(
"Startup Game Sound",
"/api/device/sounds/latest/metadata",
"/api/device/sounds/latest/ack",
lastKnownGameSoundVersion
)) {
lastAudioPollAt = millis();
return;
}

tryPlayAudioSource(
"Startup Audio Test",
"/api/device/audio-test/latest/metadata",
"/api/device/audio-test/latest/ack",
lastKnownAudioTestVersion
);

lastAudioPollAt = millis();
}

void sendMenuSelection(int index) {
if (index < 0 || index >= screen.menuCount) {
return;
}

StaticJsonDocument<256> payload;

payload["index"] = index;
payload["value"] = screen.menuValues[index];
payload["label"] = screen.menuLabels[index];

String eventStateKey = currentStateKey;
showPredictionForMenuSelection(index);
sendDeviceEvent("TOUCH_MENU_SELECT", "", &payload, &eventStateKey);
}

void sendNumberValue(int value, bool commit) {
StaticJsonDocument<128> payload;

payload["value"] = value;

if (commit) {
payload["commit"] = true;
}

String eventStateKey = currentStateKey;
if (commit) {
showPredictionForEvent("TOUCH_NUMBER_SET");
}
sendDeviceEvent("TOUCH_NUMBER_SET", "", &payload, &eventStateKey);
}

void sendTouchConfirmWithValue(int value) {
StaticJsonDocument<128> payload;
payload["value"] = value;
String eventStateKey = currentStateKey;
showPredictionForEvent("TOUCH_CONFIRM");
sendDeviceEvent("TOUCH_CONFIRM", "", &payload, &eventStateKey);
}

void sendStartGameFromTeamSetup() {
StaticJsonDocument<128> payload;
payload["action"] = "START_GAME";
payload["startGame"] = true;
String eventStateKey = currentStateKey;
sendDeviceEvent("TOUCH_CONFIRM", "", &payload, &eventStateKey);
}

// =====================================================
// Input handling
// =====================================================
void handleTouch() {
digitalWrite(TFT_CS_PIN, HIGH);

if (!ts.touched()) {
return;
}

if (!displayAwake) {
markDisplayActivity(true);
waitTouchRelease();
return;
}

markDisplayActivity(false);

TS_Point p = ts.getPoint();

digitalWrite(TOUCH_CS_PIN, HIGH);

if (p.z <= 150) {
waitTouchRelease();
return;
}

int x = 0;
int y = 0;

if (!mapTouchPoint(p, x, y)) {
waitTouchRelease();
return;
}

if (screen.isTeamSizeSetup) {
int current = uiTeamSizeValue();

if (x >= 26 && x <= 86 && y >= 92 && y <= 138) {
  localTeamSizeValue = max(1, current - 1);
  localTeamSizeActive = true;
  redrawTeamSizeValueOnly();
} else if (x >= 234 && x <= 294 && y >= 92 && y <= 138) {
  localTeamSizeValue = min(20, current + 1);
  localTeamSizeActive = true;
  redrawTeamSizeValueOnly();
} else if (x >= 88 && x <= 232 && y >= 156 && y <= 192) {
  if (screen.canStartGame) {
    sendStartGameFromTeamSetup();
  } else {
    showTransientFooter("Erst Team voll scannen", 1600);
    drawFooter();
  }
}

} else if (isMenuLikeScreen() && screen.menuCount > 0) {
MenuLayout layout;
buildMenuLayout(layout);

for (int i = 0; i < layout.visibleItems; i++) {
  int idx = layout.pageStart + i;
  int col = i % layout.cols;
  int row = i / layout.cols;
  int left = layout.startX + col * (layout.itemW + layout.gapX);
  int top = layout.startY + row * (layout.itemH + layout.gapY);

  if (x >= left && x <= left + layout.itemW && y >= top && y <= top + layout.itemH) {
    sendMenuSelection(idx);
    waitTouchRelease();
    return;
  }
}

if (
  layout.hasNextButton
  && x >= layout.nextX
  && x <= layout.nextX + layout.nextW
  && y >= layout.nextY
  && y <= layout.nextY + layout.nextH
) {
  advanceMenuPage();
  drawScreen();
  waitTouchRelease();
  return;
}

} else if (screen.screenType == "NUMBER_PICKER") {
if (useNumberStepper()) {
int current = uiNumberPickerValue();

  if (x >= 26 && x <= 86 && y >= 66 && y <= 112) {
    setLocalNumberValue(max(numberPickerMinValue, current - 1), false, false);
    redrawNumberStepperValueOnly();
  } else if (x >= 234 && x <= 294 && y >= 66 && y <= 112) {
    setLocalNumberValue(min(numberPickerMaxValue, current + 1), false, false);
    redrawNumberStepperValueOnly();
  } else if (x >= 92 && x <= 228 && y >= 146 && y <= 186) {
    sendNumberValue(uiNumberPickerValue(), true);
  }
} else if (x >= 248 && x <= 306 && y >= 12 && y <= 56) {
  sendNumberValue(uiNumberPickerValue(), true);
} else {
  const int startX = 14;
  const int startY = 66;
  const int buttonW = 92;
  const int buttonH = 34;
  const int gapX = 8;
  const int gapY = 4;

  for (int row = 0; row < 4; row++) {
    for (int col = 0; col < 3; col++) {
      int left = startX + col * (buttonW + gapX);
      int top = startY + row * (buttonH + gapY);

      if (x < left || x > left + buttonW || y < top || y > top + buttonH) {
        continue;
      }

      if (row < 3) {
        appendNumberDigit(row * 3 + col + 1);
      } else if (col == 0) {
        clearNumberInput();
      } else if (col == 1) {
        appendNumberDigit(0);
      } else {
        backspaceNumberDigit();
      }

      waitTouchRelease();
      return;
    }
  }
}

}

waitTouchRelease();
}

bool cardUidInList(const String &uid, String cards[], int cardCount) {
if (uid.length() == 0) {
return false;
}

for (int i = 0; i < cardCount; i++) {
if (cards[i] == uid) {
return true;
}
}

return false;
}

bool shouldRejectCardLocally(const String &uid) {
if (screen.screenType != "WAITING_FOR_SCAN" && screen.nodeType.length() == 0) {
return false;
}

bool hasPlayerAllowlist = allowedPlayerCardUidCount > 0;
bool hasGameAllowlist = allowedGameCardUidCount > 0;

if (!hasPlayerAllowlist && !hasGameAllowlist) {
return false;
}

bool isAllowedPlayer = cardUidInList(uid, allowedPlayerCardUids, allowedPlayerCardUidCount);
bool isAllowedGame = cardUidInList(uid, allowedGameCardUids, allowedGameCardUidCount);

if (screen.nodeType == "WAIT_PLAYER_CARD") {
return hasPlayerAllowlist && !isAllowedPlayer && !isAllowedGame;
}

if (screen.nodeType == "WAIT_GAME_CARD") {
return hasGameAllowlist && !isAllowedGame;
}

if (screen.nodeType == "WAIT_ANY_CARD") {
return (hasPlayerAllowlist || hasGameAllowlist) && !isAllowedPlayer && !isAllowedGame;
}

if (screen.sessionStatus == "BUILDING_TEAMS" || screen.title.indexOf("Spieler") >= 0) {
return hasPlayerAllowlist && !isAllowedPlayer && !isAllowedGame;
}

return false;
}

void rejectCardLocally() {
lastScanWasPlayer = false;
lastScannedPlayerName = "";
setLastErrorLimited("Karte nicht in diesem Spiel");
showTransientFooter("Karte nicht in diesem Spiel", 1800);
drawFooter();
}

bool currentFlowAcceptsGameCardScan() {
return screen.nodeType == "WAIT_GAME_CARD" || screen.nodeType == "WAIT_ANY_CARD";
}

bool shouldConfirmEndGameScan(const String &uid) {
return screen.sessionStatus == "RUNNING"
&& allowedGameCardUidCount > 0
&& cardUidInList(uid, allowedGameCardUids, allowedGameCardUidCount)
&& !currentFlowAcceptsGameCardScan();
}

void drawEndGameConfirmationScreen() {
tft.fillScreen(COLOR_BG);
tft.fillRect(0, 0, SCREEN_W, 62, COLOR_PANEL);
drawTextLine("Spiel beenden?", 42, 22, 24, COLOR_ACCENT, 2, COLOR_PANEL);
drawTextLine("Spielkarte wurde gescannt.", 20, 82, 46, COLOR_TEXT, 1);
drawTextLine("Bist du sicher?", 20, 104, 46, COLOR_MUTED, 2);
drawButton(18, 160, 132, 50, "Zurueck", COLOR_LINE, COLOR_PANEL_INNER, COLOR_TEXT, 2);
drawButton(170, 160, 132, 50, "Beenden", COLOR_ACCENT, COLOR_SELECTED, COLOR_TEXT, 2);
}

bool waitForEndGameConfirmation() {
drawEndGameConfirmationScreen();

while (true) {
digitalWrite(TFT_CS_PIN, HIGH);

if (!ts.touched()) {
  delay(30);
  continue;
}

TS_Point p = ts.getPoint();
digitalWrite(TOUCH_CS_PIN, HIGH);

if (p.z <= 150) {
  waitTouchRelease();
  continue;
}

int x = 0;
int y = 0;

if (!mapTouchPoint(p, x, y)) {
  waitTouchRelease();
  continue;
}

if (x >= 18 && x <= 150 && y >= 160 && y <= 210) {
  waitTouchRelease();
  drawScreen();
  return false;
}

if (x >= 170 && x <= 302 && y >= 160 && y <= 210) {
  waitTouchRelease();
  return true;
}

waitTouchRelease();

}
}

void handleNfc() {
if (!mfrc522.PICC_IsNewCardPresent()) {
return;
}

if (!mfrc522.PICC_ReadCardSerial()) {
return;
}

markDisplayActivity(true);

String uuid = readOrCreateCardUuid();

mfrc522.PICC_HaltA();
mfrc522.PCD_StopCrypto1();

if (uuid.length() == 0) {
return;
}

Serial.print("Card UID for backend: ");
Serial.println(uuid);

if (shouldRejectCardLocally(uuid)) {
rejectCardLocally();
return;
}

if (shouldConfirmEndGameScan(uuid) && !waitForEndGameConfirmation()) {
setStatusTextLimited("Spiel laeuft weiter");
showTransientFooter("Abbrechen bestaetigt", 1200);
drawFooter();
return;
}

drawFooter();

StaticJsonDocument<128> payload;
JsonDocument *payloadPtr = nullptr;

if (screen.isTeamSizeSetup) {
payload["teamSize"] = uiTeamSizeValue();
payload["value"] = uiTeamSizeValue();
payloadPtr = &payload;
}

sendDeviceEvent("CARD_SCANNED", uuid, payloadPtr);
}

// =====================================================
// WiFi / Setup / Loop
// =====================================================
String htmlEscape(String value) {
value.replace("&", "&amp;");
value.replace("<", "&lt;");
value.replace(">", "&gt;");
value.replace("\"", "&quot;");
value.replace("'", "&#39;");
return value;
}

void loadWifiCredentials() {
wifiPreferences.begin(WIFI_PREF_NAMESPACE, true);
savedWifiSsid = wifiPreferences.getString(WIFI_PREF_SSID, "");
savedWifiPassword = wifiPreferences.getString(WIFI_PREF_PASSWORD, "");
wifiPreferences.end();

wifiCredentialsAvailable = savedWifiSsid.length() > 0;

if (wifiCredentialsAvailable) {
Serial.print("WLAN-Daten gefunden: ");
Serial.println(savedWifiSsid);
} else {
Serial.println("Keine WLAN-Daten gespeichert");
}
}

void configureWifiRadio() {
WiFi.persistent(false);
WiFi.setSleep(false);
}

void saveWifiCredentials(const String &ssid, const String &password) {
wifiPreferences.begin(WIFI_PREF_NAMESPACE, false);
wifiPreferences.putString(WIFI_PREF_SSID, ssid);
wifiPreferences.putString(WIFI_PREF_PASSWORD, password);
wifiPreferences.end();

savedWifiSsid = ssid;
savedWifiPassword = password;
wifiCredentialsAvailable = savedWifiSsid.length() > 0;

Serial.print("Neue WLAN-Daten gespeichert: ");
Serial.println(savedWifiSsid);
}

void clearWifiCredentials() {
wifiPreferences.begin(WIFI_PREF_NAMESPACE, false);
wifiPreferences.clear();
wifiPreferences.end();

savedWifiSsid = "";
savedWifiPassword = "";
wifiCredentialsAvailable = false;

Serial.println("Gespeicherte WLAN-Daten geloescht");
}

bool tryConnectToSavedWifi(unsigned long timeoutMs) {
if (savedWifiSsid.length() == 0) {
Serial.println("Kein gespeichertes WLAN fuer Verbindungsversuch");
wifiConnectionFailed = false;
return false;
}

showBoot("Verbinde WLAN...");
setLastErrorLimited("");

Serial.print("Verbindungsversuch gestartet: ");
Serial.println(savedWifiSsid);

configureWifiRadio();
WiFi.disconnect(true, true);
delay(300);
WiFi.mode(WIFI_STA);
WiFi.begin(savedWifiSsid.c_str(), savedWifiPassword.c_str());

unsigned long start = millis();

while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
delay(250);
Serial.print(".");
}

if (WiFi.status() == WL_CONNECTED) {
Serial.println();
Serial.print("Verbindung erfolgreich: ");
Serial.println(WiFi.localIP());

wifiConnectionFailed = false;
setStatusTextLimited("WLAN ok " + WiFi.localIP().toString());
return true;

}

Serial.println();
Serial.println("Verbindung fehlgeschlagen");

wifiConnectionFailed = true;
setLastErrorLimited("WLAN Verbindung fehlgeschlagen");
WiFi.disconnect(true, true);
return false;
}

void scanAvailableWifiNetworks() {
Serial.println("WLAN-Scan gestartet");
setStatusTextLimited("Suche WLANs...");

scannedWifiCount = 0;
wifiScanDone = false;

int networkCount = WiFi.scanNetworks(false, true);

if (networkCount <= 0) {
Serial.println("Keine WLANs gefunden");
wifiScanDone = true;
WiFi.scanDelete();
setStatusTextLimited("Keine WLANs gefunden");
return;
}

int limit = min(networkCount, MAX_SCANNED_WIFI_NETWORKS);

for (int i = 0; i < limit; i++) {
String ssid = WiFi.SSID(i);

if (ssid.length() == 0) {
  continue;
}

scannedWifiSsids[scannedWifiCount] = ssid;
scannedWifiRssis[scannedWifiCount] = WiFi.RSSI(i);
scannedWifiCount++;

}

WiFi.scanDelete();
wifiScanDone = true;

Serial.print("WLAN-Scan fertig, gefunden: ");
Serial.println(scannedWifiCount);
setStatusTextLimited("WLAN-Scan fertig");
}

String wifiNetworkOptionsHtml() {
String html = "";

if (!wifiScanDone) {
html += "<p>WLANs wurden noch nicht gesucht.</p>";
return html;
}

if (scannedWifiCount == 0) {
html += "<p class=\"warn\">Keine WLANs gefunden. Du kannst die SSID manuell eingeben.</p>";
return html;
}

html += "<label for=\"ssid_select\">Gefundenes WLAN</label>";
html += "<select id=\"ssid_select\" name=\"ssid_select\">";
html += "<option value=\"\">Bitte auswählen</option>";

for (int i = 0; i < scannedWifiCount; i++) {
String escapedSsid = htmlEscape(scannedWifiSsids[i]);
html += "<option value=\"" + escapedSsid + "\"";

if (scannedWifiSsids[i] == savedWifiSsid) {
  html += " selected";
}

html += ">" + escapedSsid + "</option>";

}

html += "</select>";
return html;
}

String setupPageHtml(bool showForm) {
String escapedSsid = htmlEscape(savedWifiSsid);
String html = "";

html += "<!doctype html><html lang=\"de\"><head>";
html += "<meta charset=\"utf-8\">";
html += "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
html += "<title>NFC Game Device Setup</title>";
html += "<style>";
html += "body{font-family,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;background:#071012;color:#f4ffff}";
html += "main{max-width:520px;margin:0 auto;padding:28px 18px}";
html += "section{border:1px solid #23656b;background:#0b2024;border-radius:8px;padding:18px}";
html += "h1{font-size:24px;margin:0 0 8px;color:#68f8ff}";
html += "p{line-height:1.45;color:#d7eeee}";
html += "label{display;margin:14px 0 6px;color:#f4ffff}";
html += "input,select{box-sizing;width:100%;font-size:18px;padding:12px;border-radius:6px;border:1px solid #4698a0;background:#061114;color:#fff}";
html += "button,a.button{display;width:100%;box-sizing;margin-top:12px;padding:12px 14px;border:0;border-radius:6px;background:#37dce8;color:#001316;text-align;text-decoration;font-size:17px;font-weight:700}";
html += "a.secondary,button.secondary{background:#16363b;color:#f4ffff;border:1px solid #4698a0}";
html += ".warn{color:#fff;background:#15363b;border-left:4px solid #68f8ff;padding:10px 12px;border-radius:4px}";
html += "</style></head><body><main><section>";
html += "<h1>NFC Game Device</h1>";

if (wifiConnectionFailed && wifiCredentialsAvailable) {
html += "<p class=\"warn\">Verbindung mit dem gespeicherten WLAN fehlgeschlagen.</p>";
html += "<p>Gespeichertes WLAN: <strong>" + escapedSsid + "</strong></p>";
} else if (!wifiCredentialsAvailable) {
html += "<p>Es sind noch keine WLAN-Daten gespeichert.</p>";
} else {
html += "<p>Setup-Modus ist aktiv.</p>";
}

html += "<p>Setup-WLAN: <strong>";
html += SETUP_AP_SSID;
html += "</strong><br>Adresse: <strong>http://192.168.4.1</strong></p>";

if (wifiCredentialsAvailable && !showForm) {
html += "<form method=\"post\" action=\"/retry\"><button type=\"submit\">Nochmal versuchen</button></form>";
html += "<a class=\"button secondary\" href=\"/new\">Neues WLAN eingeben</a>";
}

if (showForm || !wifiCredentialsAvailable) {
html += "<a class=\"button secondary\" href=\"/scan\">WLANs neu suchen</a>";
html += "<form method=\"post\" action=\"/save\">";
html += wifiNetworkOptionsHtml();
html += "<label for=\"ssid_manual\">SSID manuell eingeben</label>";
html += "<input id=\"ssid_manual\" name=\"ssid_manual\" maxlength=\"63\" value=\"\" placeholder=\"Nur ausfüllen, wenn nötig\" autocomplete=\"off\">";
html += "<label for=\"password\">Passwort</label>";
html += "<input id=\"password\" name=\"password\" type=\"password\" maxlength=\"127\" autocomplete=\"current-password\">";
html += "<button type=\"submit\">Speichern und verbinden</button>";
html += "</form>";
}

if (wifiCredentialsAvailable) {
html += "<form method=\"post\" action=\"/reset-wifi\"><button class=\"secondary\" type=\"submit\">WLAN-Daten löschen</button></form>";
}

html += "</section></main></body></html>";
return html;
}

void sendSetupPage(bool showForm) {
setupServer.send(200, "text/html; charset=utf-8", setupPageHtml(showForm));
}

void sendCurrentSetupPage() {
sendSetupPage(wifiShowNewForm || !wifiCredentialsAvailable);
}

void redirectToRoot() {
setupServer.sendHeader("Location", "/", true);
setupServer.send(302, "text/plain", "");
}

void restartAfterResponse() {
delay(1200);
ESP.restart();
}

void configureSetupRoutes() {
if (setupRoutesConfigured) {
return;
}

setupRoutesConfigured = true;

setupServer.on("/", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/generate_204", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/fwlink", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/hotspot-detect.html", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/connecttest.txt", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/ncsi.txt", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/redirect", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/gen_204", HTTP_GET, []() {
sendCurrentSetupPage();
});

setupServer.on("/new", HTTP_GET, []() {
wifiShowNewForm = true;
sendSetupPage(true);
});

setupServer.on("/scan", HTTP_GET, []() {
wifiShowNewForm = true;
scanAvailableWifiNetworks();
sendSetupPage(true);
});

setupServer.on("/save", HTTP_POST, []() {
String manualSsid = setupServer.arg("ssid_manual");
String selectedSsid = setupServer.arg("ssid_select");
String password = setupServer.arg("password");
manualSsid.trim();
selectedSsid.trim();

String ssid = manualSsid.length() > 0 ? manualSsid : selectedSsid;
ssid.trim();

if (ssid.length() == 0) {
  setupServer.send(400, "text/plain; charset=utf-8", "Bitte ein WLAN auswählen oder eine SSID manuell eingeben.");
  return;
}

saveWifiCredentials(ssid, password);
setupServer.send(200, "text/html; charset=utf-8",
  "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><p>WLAN-Daten gespeichert. Das Gerät startet neu und verbindet sich.</p></body></html>");
Serial.println("Neustart nach Speichern neuer WLAN-Daten");
restartAfterResponse();

});

setupServer.on("/retry", HTTP_POST, []() {
if (!wifiCredentialsAvailable) {
redirectToRoot();
return;
}

Serial.println("Neustart fuer erneuten WLAN-Verbindungsversuch angefordert");
setupServer.send(200, "text/html; charset=utf-8",
  "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><p>Das Gerät startet neu und versucht erneut, sich mit dem gespeicherten WLAN zu verbinden.</p></body></html>");
restartAfterResponse();

});

setupServer.on("/reset-wifi", HTTP_POST, []() {
clearWifiCredentials();
setupServer.send(200, "text/html; charset=utf-8",
"<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><p>WLAN-Daten gelöscht. Das Gerät startet neu.</p></body></html>");
Serial.println("Neustart nach WLAN-Reset");
restartAfterResponse();
});

setupServer.onNotFound([]() {
sendCurrentSetupPage();
});
}

void startWifiSetupMode(bool showNewForm) {
wifiSetupMode = true;
wifiShowNewForm = showNewForm || !wifiCredentialsAvailable;

showBoot("Setup WLAN starten...");

WiFi.disconnect(true, true);
configureWifiRadio();
delay(300);
WiFi.mode(WIFI_AP_STA);

bool apStarted = WiFi.softAP(SETUP_AP_SSID);

if (apStarted) {
Serial.print("Setup-WLAN gestartet: ");
Serial.println(SETUP_AP_SSID);
Serial.print("Setup-Adresse: ");
Serial.println(WiFi.softAPIP());
} else {
Serial.println("Setup-WLAN konnte nicht gestartet werden");
}

configureSetupRoutes();
setupServer.begin();
dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

screen.screenType = "MESSAGE";
screen.title = "WLAN Setup";
screen.subtitle = "Mit Setup-WLAN verbinden";
screen.lineCount = 2;
screen.lines[0] = "SSID: NfcGameDevice-Setup";
screen.lines[1] = "Browser: http://192.168.4.1";
screen.menuCount = 0;
screen.backendStatus = "SETUP";
setStatusTextLimited("WLAN Setup aktiv");
drawScreen();
}

void connectWiFi() {
loadWifiCredentials();

if (!wifiCredentialsAvailable) {
setLastErrorLimited("Keine WLAN-Daten");
startWifiSetupMode(true);
return;
}

while (!tryConnectToSavedWifi(WIFI_CONNECT_TIMEOUT_MS)) {
WifiRecoveryChoice choice = waitForWifiRecoveryChoice();

if (choice == WIFI_RECOVERY_NEW) {
  startWifiSetupMode(true);
  return;
}

}
}

bool ensureWifiConnected(bool showStatus) {
if (WiFi.status() == WL_CONNECTED) return true;
if (!wifiCredentialsAvailable || savedWifiSsid.length() == 0) return false;

if (showStatus) {
setStatusTextLimited("WLAN reconnect...");
drawScreen();
}

configureWifiRadio();
WiFi.mode(WIFI_STA);
WiFi.disconnect(false, false);
delay(150);
WiFi.begin(savedWifiSsid.c_str(), savedWifiPassword.c_str());

unsigned long startedAt = millis();
while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 8000) {
delay(250);
}

if (WiFi.status() == WL_CONNECTED) {
wifiConnectionFailed = false;
if (showStatus) setStatusTextLimited("WLAN ok " + WiFi.localIP().toString());
if (!deviceRegistered) registerDeviceWithBackend();
return true;
}

wifiConnectionFailed = true;
return false;
}

void setup() {
Serial.begin(115200);
delay(300);

pinMode(TFT_CS_PIN, OUTPUT);
digitalWrite(TFT_CS_PIN, HIGH);

pinMode(TOUCH_CS_PIN, OUTPUT);
digitalWrite(TOUCH_CS_PIN, HIGH);

pinMode(NFC_SS_PIN, OUTPUT);
digitalWrite(NFC_SS_PIN, HIGH);

pinMode(NFC_RST_PIN, OUTPUT);
digitalWrite(NFC_RST_PIN, HIGH);

// SPI Bus 1: Display + Touch
SPI.begin(DISP_SCK_PIN, DISP_MISO_PIN, DISP_MOSI_PIN);

tft.init();
tft.setRotation(3);

tft.invertDisplay(DISPLAY_INVERT_COLORS);
lastDisplayActivityAt = millis();
applyThemeColors();
applyDisplayBrightness();

// Kein Rot/Gruen/Blau-Testscreen mehr.
tft.fillScreen(COLOR_BG);
delay(80);

ts.begin();
ts.setRotation(3);

// SPI Bus 2: NFC
nfcSPI.begin(NFC_SCK_PIN, NFC_MISO_PIN, NFC_MOSI_PIN, NFC_SS_PIN);

mfrc522.PCD_Init();
initMifareDefaultKey();

pinMode(AUDIO_I2S_BCLK_PIN, INPUT_PULLDOWN);
pinMode(AUDIO_I2S_LRC_PIN, INPUT_PULLDOWN);
pinMode(AUDIO_I2S_DOUT_PIN, INPUT_PULLDOWN);
Serial.println("Audio output muted");

initStringCapacities();
loadOrCreateDeviceIdentity();

setStartScreen("Bereit");

drawScreen();

connectWiFi();

if (!wifiSetupMode) {
registerDeviceWithBackend();
}

if (!wifiSetupMode && deviceRegistered) {
fetchDeviceSettings(true);
}

if (!wifiSetupMode && deviceRegistered) {
checkForFirmwareUpdate(true);
}

playStartupAudioOnce();

if (deviceRegistered && !deviceLinked && pairingCode.length() > 0) {
drawPairingCodeScreen();
} else {
drawScreen();
}

Serial.println("NFC Game Device started");
Serial.println("Empty MIFARE Classic card -> UUID is written to block 4");
Serial.println("Existing card -> UUID is read from block 4");
}

void loop() {
if (wifiSetupMode) {
dnsServer.processNextRequest();
setupServer.handleClient();
return;
}

if (WiFi.status() != WL_CONNECTED) {
static unsigned long lastReconnectAt = 0;

if (millis() - lastReconnectAt > 10000) {
  lastReconnectAt = millis();
  deviceRegistered = false;
  ensureWifiConnected(false);
}

} else if (!deviceRegistered) {
if (millis() - lastDeviceLinkCheckAt > DEVICE_LINK_CHECK_INTERVAL_MS) {
if (registerDeviceWithBackend() && lastOtaCheckAt == 0) {
checkForFirmwareUpdate(false);
}
playStartupAudioOnce();
}
} else if (millis() - lastOtaCheckAt > OTA_CHECK_INTERVAL_MS) {
checkForFirmwareUpdate(false);
}

if (!deviceRegistered) {
return;
}

if (deviceRegistered && !deviceLinked) {
if (millis() - lastDeviceLinkCheckAt > DEVICE_LINK_CHECK_INTERVAL_MS) {
bool wasLinked = deviceLinked;
registerDeviceWithBackend();

  if (!wasLinked && deviceLinked) {
    setStartScreen("Account verbunden");
    fetchDeviceSettings(true);
    drawScreen();
    playStartupAudioOnce();
  } else {
    drawPairingCodeScreen();
  }
}

return;

}

fetchDeviceSettings();
handleAudioTestPlayback();
handleTouch();
handleNfc();
handleDisplayTimeout();

if (autoReturnToStartPending && millis() - finishedScreenAt >= 5000) {
setStartScreen("Startscreen aktiv");
drawScreen();
}

if (sessionId.length() > 0 && millis() - lastScreenRefreshAt > SCREEN_REFRESH_INTERVAL_MS) {
lastScreenRefreshAt = millis();
loadCurrentScreen();
}
}
