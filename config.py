import os

# Configuration parameters for Crowd Monitoring System

# Camera Settings
# Uses local UDP stream by default. Can be overridden using RTSP.
CAMERA_SRC = "udp://0.0.0.0:1234"
FRAME_SIZE = 416
FRAME_SKIP = 2

# Backend API
API_URL = "http://127.0.0.1:8000/ingest"

# Zone Settings (Central restricted zone)
ZONE_RECT = (100, 100, 316, 316)

# Prediction Settings
PREDICTION_WINDOW = 60
PREDICT_AFTER = 300

# Suspicious Activity Settings
CLUSTER_DISTANCE_THRESHOLD = 70
MOTION_THRESHOLD = 45

# Alert Thresholds
MAX_CAPACITY = 15
CROWD_THRESHOLD = 5
ZONE_THRESHOLD = 8

# ThingSpeak Analytics
THINGSPEAK_API_URL = "https://api.thingspeak.com/update"
THINGSPEAK_WRITE_KEY = "J61HN6RR8G894U0M"
THINGSPEAK_READ_KEY = "GVJ80AY5DZUYI6J3"
THINGSPEAK_CHANNEL_ID = "3320572"
