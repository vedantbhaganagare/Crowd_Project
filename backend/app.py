from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict
from datetime import datetime
import threading

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class State(BaseModel):
    people: int = 0
    crowd: int = 0
    zone: int = 0
    suspicious: int = 0
    prediction: int = 0

class ESP32Data(BaseModel):
    people_count: int = 0
    zone_alert: int = 0
    crowd_alert: int = 0
    suspicious: int = 0


camera_state = State()
esp32_state = ESP32Data()
alerts_array: List[Dict[str, str]] = []
state_lock = threading.Lock()

def get_merged_state():
    return {
        "people": max(camera_state.people, esp32_state.people_count),
        "crowd": max(camera_state.crowd, esp32_state.crowd_alert),
        "zone": max(camera_state.zone, esp32_state.zone_alert),
        "suspicious": max(camera_state.suspicious, esp32_state.suspicious),
        "prediction": camera_state.prediction
    }

latest_frame = b""
frame_lock = threading.Lock()
frame_condition = threading.Condition(frame_lock)

@app.post("/ingest")
def ingest_data(data: State):
    global camera_state, alerts_array
    
    with state_lock:
        camera_state = data
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        new_alerts = []
        if data.zone == 1:
            new_alerts.append({"id": f"z-{datetime.now().timestamp()}", "msg": "Camera: Zone Breach Detected", "sev": "CRITICAL", "location": "MAIN SQUARE", "time": timestamp})
        if data.crowd == 1:
            new_alerts.append({"id": f"c-{datetime.now().timestamp()}", "msg": "Camera: High Crowd Density", "sev": "WARNING", "location": "MAIN SQUARE", "time": timestamp})
        if data.suspicious == 1:
            new_alerts.append({"id": f"s-{datetime.now().timestamp()}", "msg": "Camera: Suspicious Activity", "sev": "CRITICAL", "location": "MAIN SQUARE", "time": timestamp})
            
        if new_alerts:
            alerts_array = (new_alerts + alerts_array)[:10]
            
    return {"status": "success"}

@app.post("/data")
def receive_esp32_data(data: ESP32Data):
    global esp32_state, alerts_array
    
    with state_lock:
        # Detect rising edges for alerts
        new_alerts = []
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if data.zone_alert == 1 and esp32_state.zone_alert == 0:
            new_alerts.append({"id": f"hz-{datetime.now().timestamp()}", "msg": "Hardware: Zone Breach", "sev": "CRITICAL", "location": "ESP32 NODE", "time": timestamp})
        if data.crowd_alert == 1 and esp32_state.crowd_alert == 0:
            new_alerts.append({"id": f"hc-{datetime.now().timestamp()}", "msg": "Hardware: High Crowd", "sev": "WARNING", "location": "ESP32 NODE", "time": timestamp})
        if data.suspicious == 1 and esp32_state.suspicious == 0:
            new_alerts.append({"id": f"hs-{datetime.now().timestamp()}", "msg": "Hardware: Suspicious Activity", "sev": "CRITICAL", "location": "ESP32 NODE", "time": timestamp})
            
        esp32_state = data

        if new_alerts:
            alerts_array = (new_alerts + alerts_array)[:10]
            
    return {"status": "success"}

@app.post("/video_frame")
async def update_video_frame(request: Request):
    global latest_frame
    frame_bytes = await request.body()
    with frame_condition:
        latest_frame = frame_bytes
        frame_condition.notify_all()
    return {"status": "success"}

def video_generator():
    while True:
        with frame_condition:
            frame_condition.wait()
            frame = latest_frame
        # MJPEG format format boundary and payload
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.get("/video_feed")
def video_feed():
    return StreamingResponse(video_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/data")
def get_data():
    with state_lock:
        response_data = get_merged_state()
        response_data["alerts"] = alerts_array.copy() if alerts_array is not None else []
        return response_data

# Allow configs to be stored temporarily via API
user_config = {}
@app.post("/config")
async def update_config(request: Request):
    global user_config
    user_config = await request.json()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
