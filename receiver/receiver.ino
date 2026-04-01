#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ================= WIFI =================
const char* ssid = "e-Yantra";
const char* password = "eYL@2016";

// ================= THINGSPEAK =================
const String CHANNEL_ID = "3274416";
const String READ_API_KEY = "3GS8Y3U5RWSWXE5U";

// ================= HARDWARE =================
#define power_LED 14
#define alert_LED 33
#define buzzer 25
#define BUTTON_PIN 22
#define OLED_SDA 13
#define OLED_SCL 21

// ================= OLED =================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ================= DATA =================
String peopleCountStr = "-";
String landAvailableStr = "-";
bool deviceOnline = false;

int alertLevel = 0;
int zoneAlert = 0;
int suspiciousFlag = 0;
int predictedPeople = 0;

unsigned long alertStartTime = 0;
bool alertActive = false;
bool lastAlertState = false;
const unsigned long ALERT_DURATION = 5000; // 5 seconds

unsigned long lastCloudFetch = 0;
unsigned long lastSuccessfulUpdate = 0;

// ================= UI =================
int currentPage = 0;
const int totalPages = 7;
int lastButtonState = LOW;

String scrollText = "SVPCET Crowd Monitor | Cloud Mode ";
int scrollX = SCREEN_WIDTH;

// ================= SETUP =================
void setup() {

  Serial.begin(115200);

  pinMode(power_LED, OUTPUT);
  pinMode(alert_LED, OUTPUT);
  pinMode(buzzer, OUTPUT);
  pinMode(BUTTON_PIN, INPUT);

  Wire.begin(OLED_SDA, OLED_SCL);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED Failed");
    while (1);
  }

  connectWiFi();
}

// ================= LOOP =================
void loop() {

  digitalWrite(power_LED, HIGH);

  // WiFi auto reconnect
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Fetch cloud every 15 sec
  if (millis() - lastCloudFetch > 15000) {
    lastCloudFetch = millis();
    fetchCloudData();
  }

  // If no update for 45 seconds → offline
  if (millis() - lastSuccessfulUpdate > 45000) {
    deviceOnline = false;
  }

  checkButton();
  updateAlert();
  updateScroll();
  updateOLED();

  delay(50);
}

// ================= WIFI =================
void connectWiFi() {

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Connecting WiFi...");
  display.display();

  WiFi.begin(ssid, password);

  unsigned long startAttemptTime = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - startAttemptTime < 10000) {
    delay(500);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi Connected");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi Failed");
  }
}

// ================= CLOUD FETCH =================
void fetchCloudData() {

  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;

  String url = "https://api.thingspeak.com/channels/" +
               CHANNEL_ID +
               "/feeds/last.json?api_key=" +
               READ_API_KEY;

  http.begin(url);

  int httpCode = http.GET();

  if (httpCode == 200) {

    String payload = http.getString();

    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {

      int people = doc["field1"] | 0;
      float land = doc["field2"] | 0.0;
      
      alertLevel = doc["field3"] | 0;
      zoneAlert = doc["field4"] | 0;
      suspiciousFlag = doc["field5"] | 0;
      predictedPeople = doc["field6"] | 0;

      peopleCountStr = String(people);
      landAvailableStr = String(land, 1);

      deviceOnline = true;
      lastSuccessfulUpdate = millis();

      Serial.println("Cloud Updated");
    }
  } else {
    deviceOnline = false;
  }

  http.end();
}

// ================= OLED =================
void updateOLED() {

  display.clearDisplay();
  display.setTextSize(1);

  if (!deviceOnline) {

    display.setTextSize(2);
    display.setCursor(10, 25);
    display.println("OFFLINE");
  } else {

    switch (currentPage) {

      case 0:
        display.setCursor(5, 5);
        display.println("Device: Crowd Mon");
        display.setCursor(5, 30);
        display.println(WiFi.localIP());
        break;

      case 1:
        display.setCursor(5, 5);
        display.println("People Count");
        display.setTextSize(2);
        display.setCursor(40, 30);
        display.println(peopleCountStr);
        break;

      case 2:
        display.setCursor(5, 5);
        display.println("Land Available");
        display.setTextSize(2);
        display.setCursor(25, 30);
        display.print(landAvailableStr + "%");
        break;

      case 3:
        display.setCursor(5, 5);
        display.println("System Mode");
        display.setCursor(5, 30);
        display.println("Cloud Active");
        display.setCursor(5, 45);
        display.println("AI Active");
        break;

      case 4:
        display.setCursor(5, 5);
        display.println("Zone Status");
        display.setCursor(5, 30);
        display.setTextSize(2);
        if (zoneAlert == 1) {
          display.setTextColor(SSD1306_BLACK, SSD1306_WHITE); // Highlight text
          display.println("ZONE ALERT");
          display.setTextColor(SSD1306_WHITE, SSD1306_BLACK); // Reset formatting
        } else {
          display.println("SAFE");
        }
        display.setTextSize(1);
        break;

      case 5:
        display.setCursor(5, 5);
        display.println("Suspicious Activity");
        display.setCursor(5, 30);
        if (suspiciousFlag == 1) {
          display.setTextColor(SSD1306_BLACK, SSD1306_WHITE); // Warn
          display.println("Suspicious Detected");
          display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);
        } else {
          display.println("Normal");
        }
        break;

      case 6:
        display.setCursor(5, 5);
        display.println("Prediction");
        display.setCursor(5, 20);
        display.println("Next 5 min:");
        display.setCursor(5, 35);
        display.setTextSize(2);
        display.println(predictedPeople);
        display.setTextSize(1);
        break;
    }
  }

  display.setTextSize(1);
  display.setCursor(scrollX, 55);
  display.println(scrollText);
  display.display();
}

// ================= BUTTON =================
void checkButton() {

  int reading = digitalRead(BUTTON_PIN);

  if (reading == HIGH && lastButtonState == LOW) {
    currentPage = (currentPage + 1) % totalPages;
    scrollX = SCREEN_WIDTH;
    delay(200);
  }

  lastButtonState = reading;
}

// ================= SCROLL =================
void updateScroll() {

  scrollX--;

  int textWidth = scrollText.length() * 6;

  if (scrollX < -textWidth) scrollX = SCREEN_WIDTH;
}

// ================= ALERT =================
void updateAlert() {

  if (!deviceOnline) {
    digitalWrite(alert_LED, LOW);
    digitalWrite(buzzer, LOW);
    alertActive = false;
    lastAlertState = false;
    return;
  }

  bool newAlert = (zoneAlert == 1 || alertLevel >= 2);

  if (newAlert && !lastAlertState) {
    alertActive = true;
    alertStartTime = millis();
    digitalWrite(alert_LED, HIGH);
    digitalWrite(buzzer, HIGH);
  }

  if (alertActive && (millis() - alertStartTime >= ALERT_DURATION)) {
    digitalWrite(alert_LED, LOW);
    digitalWrite(buzzer, LOW);
    alertActive = false;
  }

  lastAlertState = newAlert;
}
