import time
import requests
import threading
import logging
import config

logger = logging.getLogger(__name__)

class ThingSpeakSender:
    def __init__(self):
        self.api_url = config.THINGSPEAK_API_URL
        self.write_key = config.THINGSPEAK_WRITE_KEY
        
        self.lock = threading.Lock()
        
        # State to store the most severe alerts/values in the window
        self.people_count = 0
        self.crowd_flag = 0
        self.zone_flag = 0
        self.suspicious_flag = 0
        self.prediction = 0

        self.last_send_time = time.time()
        self.update_interval = 15.0 # ThingSpeak free tier limit is 15s

        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

    def update_state(self, people, crowd, zone, suspicious, prediction=0):
        """
        Updates the internal state dynamically from the main AI loop.
        Since we send every 15s, we want to capture max alerts during this period.
        """
        with self.lock:
            # We track the max values in the window so we don't miss quick events
            self.people_count = max(self.people_count, people)
            self.crowd_flag = max(self.crowd_flag, crowd)
            self.zone_flag = max(self.zone_flag, zone)
            self.suspicious_flag = max(self.suspicious_flag, suspicious)
            self.prediction = max(self.prediction, prediction)

    def _worker_loop(self):
        while True:
            current_time = time.time()
            if current_time - self.last_send_time >= self.update_interval:
                with self.lock:
                    # Snaphot current max values
                    p_count = self.people_count
                    c_flag = self.crowd_flag
                    z_flag = self.zone_flag
                    s_flag = self.suspicious_flag
                    pred_val = self.prediction
                    
                    # Reset accumulators for the next window
                    self.people_count = 0
                    self.crowd_flag = 0
                    self.zone_flag = 0
                    self.suspicious_flag = 0
                    self.prediction = 0
                
                # Prepare Payload based on required mapping:
                # field1 -> people count
                # field3 -> crowd alert
                # field4 -> zone breach
                # field5 -> suspicious
                # field6 -> prediction
                payload = {
                    "api_key": self.write_key,
                    "field1": p_count,
                    "field3": c_flag,
                    "field4": z_flag,
                    "field5": s_flag,
                    "field6": pred_val
                }
                
                # Send to ThingSpeak
                try:
                    # Using timeout to ensure we don't block forever
                    req = requests.post(self.api_url, data=payload, timeout=5)
                    if req.status_code == 200:
                        print(f"[ThingSpeak] Data successfuly sent! People: {p_count}, Crowd: {c_flag}, Zone: {z_flag}, Suspicious: {s_flag}, Pred: {pred_val}")
                    else:
                        print(f"[ThingSpeak] Failed to send: {req.status_code}")
                except Exception as e:
                    print(f"[ThingSpeak] Error reaching API: {e}")
                    
                self.last_send_time = time.time()
                
            time.sleep(1.0) # Sleep before checking again to free CPU
