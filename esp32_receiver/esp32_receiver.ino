#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Backend Settings
const char* serverName = "http://192.168.1.100:8000/data"; // REPLACE WITH YOUR LAPTOP IP

// Hardware Pins (Optional indicators)
const int BUZZER_PIN = 12; // High crowd / Overcrowding
const int LED_PIN = 13;    // Zone breach
const int ALARM_PIN = 14;  // Suspicious activity

unsigned long lastTime = 0;
unsigned long timerDelay = 5000; // Send interval (5 seconds)

void setup() {
  Serial.begin(115200);

  // Initialize output pins
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(ALARM_PIN, OUTPUT);

  // Ensure they start off
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(ALARM_PIN, LOW);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.println("Connecting to WiFi...");
  while(WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi network with IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if ((millis() - lastTime) > timerDelay) {
    if(WiFi.status() == WL_CONNECTED){
      HTTPClient http;
      
      http.begin(serverName);
      http.addHeader("Content-Type", "application/json");

      // Generate dummy data (you can replace this with real sensor readings)
      int dummy_people = random(0, 20);
      int dummy_zone = random(0, 2);
      int dummy_crowd = (dummy_people > 10) ? 1 : 0;
      int dummy_suspicious = random(0, 100) > 90 ? 1 : 0; // 10% chance of suspicious activity

      // Construct JSON Payload
      StaticJsonDocument<200> doc;
      doc["people_count"] = dummy_people;
      doc["zone_alert"] = dummy_zone;
      doc["crowd_alert"] = dummy_crowd;
      doc["suspicious"] = dummy_suspicious;

      String requestBody;
      serializeJson(doc, requestBody);
      
      Serial.print("Sending POST request to backend... Payload: ");
      Serial.println(requestBody);

      // Perform POST Request
      int httpResponseCode = http.POST(requestBody);
      
      if (httpResponseCode > 0) {
        Serial.printf("HTTP Response code: %d\n", httpResponseCode);
        String response = http.getString();
        Serial.println("Server Response: " + response);

        // Hardware Feedback
        digitalWrite(BUZZER_PIN, dummy_crowd == 1 ? HIGH : LOW);
        digitalWrite(LED_PIN, dummy_zone == 1 ? HIGH : LOW);
        digitalWrite(ALARM_PIN, dummy_suspicious == 1 ? HIGH : LOW);

      }
      else {
        Serial.printf("Error code: %d\n", httpResponseCode);
      }
      http.end(); // Free resources
    }
    else {
      Serial.println("WiFi Disconnected");
    }
    lastTime = millis();
  }
}
