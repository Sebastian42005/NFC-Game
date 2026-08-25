#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>

// =====================================================
// Minimaler ESP32 + MAX98357 Backend-Audio-Test
//
// Verwendet die bereits auf dem ESP32 gespeicherten Daten:
//   Preferences "nfcgamewifi": ssid, password
//   Preferences "nfcgameid":   id, key
//
// Backend:
//   https://projects.sebi4.com
//   /api/device/audio-test/latest/metadata
//
// MAX98357:
//   GPIO22 -> BCLK
//   GPIO16 -> LRC / WS
//   GPIO17 -> DIN
//   5V     -> VIN
//   GND    -> GND
//   Speaker rot     -> +
//   Speaker schwarz -> -
// =====================================================

static const char *BACKEND_BASE_URL = "https://projects.sebi4.com";
static const char *AUDIO_METADATA_PATH = "/api/device/audio-test/latest/metadata";

static const char *WIFI_PREF_NAMESPACE = "nfcgamewifi";
static const char *WIFI_PREF_SSID = "ssid";
static const char *WIFI_PREF_PASSWORD = "password";

static const char *DEVICE_PREF_NAMESPACE = "nfcgameid";
static const char *DEVICE_PREF_ID = "id";
static const char *DEVICE_PREF_KEY = "key";

static const int AUDIO_I2S_BCLK_PIN = 22;
static const int AUDIO_I2S_LRC_PIN = 16;
static const int AUDIO_I2S_DOUT_PIN = 17;
static const i2s_port_t AUDIO_I2S_PORT = I2S_NUM_1;

static const int AUDIO_DMA_BUFFER_COUNT = 8;
static const int AUDIO_DMA_BUFFER_LEN = 512;
static const int AUDIO_VOLUME_DIVISOR = 2;

static const uint32_t AUDIO_PREROLL_SILENCE_MS = 20;
static const uint32_t AUDIO_FADE_IN_MS = 20;
static const uint32_t AUDIO_SHUTDOWN_SILENCE_MS = 40;
static const unsigned long AUDIO_POLL_INTERVAL_MS = 5000;

Preferences preferences;
WiFiClientSecure secureClient;

String wifiSsid;
String wifiPassword;
String deviceId;
String deviceKey;

long knownAudioVersion = 0;
unsigned long lastAudioPollAt = 0;

// =====================================================
// Little Endian / Stream Helpers
// =====================================================
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

  while (total < length) {
    size_t got = stream->readBytes(buffer + total, length - total);
    if (got == 0) {
      return false;
    }
    total += got;
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

// =====================================================
// WAV Header Parser
// Erwartet PCM WAV; Format wird danach genauer validiert.
// =====================================================
bool readWavHeader(
  WiFiClient *stream,
  uint16_t &channels,
  uint32_t &sampleRate,
  uint16_t &bitsPerSample,
  uint32_t &dataSize
) {
  uint8_t riffHeader[12];

  if (!readExact(stream, riffHeader, sizeof(riffHeader))) {
    Serial.println("WAV: RIFF Header unvollstaendig");
    return false;
  }

  if (
    memcmp(riffHeader, "RIFF", 4) != 0 ||
    memcmp(riffHeader + 8, "WAVE", 4) != 0
  ) {
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
    }
    else if (memcmp(chunkHeader, "data", 4) == 0) {
      if (!foundFmt) {
        Serial.println("WAV: data vor fmt gefunden");
        return false;
      }

      dataSize = chunkSize;
      return true;
    }
    else {
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

bool supportedSampleRate(uint32_t sampleRate) {
  return sampleRate == 8000
      || sampleRate == 16000
      || sampleRate == 32000
      || sampleRate == 44100
      || sampleRate == 48000;
}

// =====================================================
// I2S / MAX98357
// =====================================================
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

// =====================================================
// HTTP WAV Streaming -> I2S
// =====================================================
bool playWavFromUrl(const String &audioUrl) {
  String url = audioUrl;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = String(BACKEND_BASE_URL) + (url.startsWith("/") ? "" : "/") + url;
  }

  Serial.println();
  Serial.println("========================================");
  Serial.print("Audio GET: ");
  Serial.println(url);

  HTTPClient http;
  secureClient.setInsecure();

  if (!http.begin(secureClient, url)) {
    Serial.println("Audio HTTP init fehlgeschlagen");
    return false;
  }

  http.addHeader("X-Device-Id", deviceId);
  http.addHeader("X-Device-Key", deviceKey);

  int code = http.GET();
  Serial.printf("Audio HTTP %d\n", code);

  if (code < 200 || code >= 300) {
    Serial.println(http.getString());
    http.end();
    return false;
  }

  WiFiClient *stream = http.getStreamPtr();

  uint16_t channels = 0;
  uint32_t sampleRate = 0;
  uint16_t bitsPerSample = 0;
  uint32_t dataSize = 0;

  if (!readWavHeader(stream, channels, sampleRate, bitsPerSample, dataSize)) {
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

  if (
    channels != 1 ||
    bitsPerSample != 16 ||
    dataSize == 0 ||
    (dataSize % 2) != 0 ||
    !supportedSampleRate(sampleRate)
  ) {
    Serial.println("WAV nicht unterstuetzt.");
    Serial.println("Erwartet: PCM, Mono, 16 Bit Little Endian, 8/16/32/44.1/48 kHz");
    http.end();
    return false;
  }

  if (!initI2S(sampleRate)) {
    http.end();
    return false;
  }

  if (!writeSilence(sampleRate, AUDIO_PREROLL_SILENCE_MS)) {
    abortI2S();
    http.end();
    return false;
  }

  uint8_t inputBuffer[512];
  int16_t stereoBuffer[512];

  uint32_t totalRead = 0;
  uint32_t fadeInSamples = (sampleRate * AUDIO_FADE_IN_MS) / 1000;

  Serial.println("Playback startet...");

  while (totalRead < dataSize) {
    size_t wanted = min(
      static_cast<size_t>(sizeof(inputBuffer)),
      static_cast<size_t>(dataSize - totalRead)
    );

    if ((wanted % 2) != 0) {
      Serial.println("PCM Block hat ungerade Byteanzahl");
      abortI2S();
      http.end();
      return false;
    }

    if (!readExact(stream, inputBuffer, wanted)) {
      Serial.println("Audio Stream unterbrochen");
      abortI2S();
      http.end();
      return false;
    }

    size_t sampleCount = wanted / 2;

    for (size_t i = 0; i < sampleCount; i++) {
      // WICHTIG: RIFF WAV PCM16 ist Little Endian -> KEIN Byte-Swap.
      int16_t sample = static_cast<int16_t>(readLe16(inputBuffer, i * 2));

      int32_t value = static_cast<int32_t>(sample) / AUDIO_VOLUME_DIVISOR;
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

    esp_err_t result = i2s_write(
      AUDIO_I2S_PORT,
      stereoBuffer,
      requestedBytes,
      &bytesWritten,
      portMAX_DELAY
    );

    if (result != ESP_OK || bytesWritten != requestedBytes) {
      Serial.printf(
        "I2S write failed: result=%d requested=%u written=%u\n",
        result,
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

// =====================================================
// Backend Metadata
// =====================================================
bool pollAudio() {
  String url = String(BACKEND_BASE_URL)
      + AUDIO_METADATA_PATH
      + "?knownVersion="
      + String(knownAudioVersion);

  Serial.println();
  Serial.print("Metadata GET: ");
  Serial.println(url);

  HTTPClient http;
  secureClient.setInsecure();

  if (!http.begin(secureClient, url)) {
    Serial.println("Metadata HTTP init fehlgeschlagen");
    return false;
  }

  http.addHeader("X-Device-Id", deviceId);
  http.addHeader("X-Device-Key", deviceKey);

  int code = http.GET();
  String response = http.getString();
  http.end();

  Serial.printf("Metadata HTTP %d\n", code);
  Serial.println(response);

  if (code < 200 || code >= 300) {
    return false;
  }

  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    Serial.print("Metadata JSON Fehler: ");
    Serial.println(error.c_str());
    return false;
  }

  bool available = doc["available"] | false;
  bool hasNewAudio = doc["hasNewAudio"] | false;
  long version = doc["version"] | 0L;
  String audioUrl = doc["audioUrl"] | "";

  if (!available || !hasNewAudio || version <= 0 || audioUrl.length() == 0) {
    Serial.println("Kein neues Audio.");
    return false;
  }

  Serial.printf("Neues Audio: Version %ld\n", version);

  if (!playWavFromUrl(audioUrl)) {
    Serial.println("Wiedergabe fehlgeschlagen.");
    return false;
  }

  knownAudioVersion = version;
  Serial.println("Wiedergabe erfolgreich.");
  return true;
}

// =====================================================
// Gespeicherte WLAN + Device Daten laden
// =====================================================
bool loadSavedSettings() {
  preferences.begin(WIFI_PREF_NAMESPACE, true);
  wifiSsid = preferences.getString(WIFI_PREF_SSID, "");
  wifiPassword = preferences.getString(WIFI_PREF_PASSWORD, "");
  preferences.end();

  preferences.begin(DEVICE_PREF_NAMESPACE, true);
  deviceId = preferences.getString(DEVICE_PREF_ID, "");
  deviceKey = preferences.getString(DEVICE_PREF_KEY, "");
  preferences.end();

  if (wifiSsid.length() == 0) {
    Serial.println("FEHLER: Kein gespeichertes WLAN gefunden.");
    return false;
  }

  if (deviceId.length() == 0 || deviceKey.length() == 0) {
    Serial.println("FEHLER: Keine gespeicherte Device-ID / Device-Key gefunden.");
    return false;
  }

  Serial.print("WLAN: ");
  Serial.println(wifiSsid);
  Serial.print("Device ID: ");
  Serial.println(deviceId);
  return true;
}

void connectWiFi() {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

  Serial.print("Verbinde WLAN");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("WLAN verbunden, IP: ");
  Serial.println(WiFi.localIP());
}

// =====================================================
// Arduino
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("========================================");
  Serial.println("ESP32 MAX98357 Backend Audio Test");
  Serial.println("========================================");

  pinMode(AUDIO_I2S_BCLK_PIN, INPUT_PULLDOWN);
  pinMode(AUDIO_I2S_LRC_PIN, INPUT_PULLDOWN);
  pinMode(AUDIO_I2S_DOUT_PIN, INPUT_PULLDOWN);

  if (!loadSavedSettings()) {
    Serial.println("Test gestoppt.");
    while (true) {
      delay(1000);
    }
  }

  connectWiFi();
  secureClient.setInsecure();

  // Sofort beim Start nach einem Audio suchen.
  pollAudio();
  lastAudioPollAt = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WLAN verloren - reconnect...");
    WiFi.disconnect();
    connectWiFi();
  }

  if (millis() - lastAudioPollAt >= AUDIO_POLL_INTERVAL_MS) {
    lastAudioPollAt = millis();
    pollAudio();
  }

  delay(10);
}