import cv2
import threading
import queue
import time
import requests
from ultralytics import YOLO

import config
from camera.camera_stream import CameraStream
from ai.crowd_detection import CrowdDetection
from ai.zones import ZoneDetection
from ai.suspicious import SuspiciousDetection
from ai.prediction import CrowdPrediction
from thingspeak_sender import ThingSpeakSender

# ================= GLOBALS =================
stop_flag = False
last_results = None
frame_queue = queue.Queue(maxsize=1)

# ================= MODEL INIT =================
print("Loading YOLOv8n...")
model = YOLO('yolov8n.pt')

def detection_thread():
    global last_results, stop_flag
    counter = 0
    while not stop_flag:
        if frame_queue.empty():
            time.sleep(0.01)
            continue
            
        frame = frame_queue.get()
        counter += 1
        
        if counter % config.FRAME_SKIP != 0:
            continue
            
        frame_resized = cv2.resize(frame, (config.FRAME_SIZE, config.FRAME_SIZE))
        
        # Use track for consistent IDs required by suspicious detection
        results = model.track(
            frame_resized,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],
            conf=0.25,
            iou=0.45,
            device='cpu',
            verbose=False
        )[0]
        
        last_results = results

t_det = threading.Thread(target=detection_thread, daemon=True)
t_det.start()

# ================= MAIN LOOP =================
camera = CameraStream()

print("✅ System connected. Starting Unified Engine...")

crowd_ai = CrowdDetection()
zone_ai = ZoneDetection()
suspicious_ai = SuspiciousDetection()
prediction_ai = CrowdPrediction()
ts_sender = ThingSpeakSender()

while True:
    frame = camera.get_frame()
    if frame is None:
        if stop_flag:
            break
        continue
        
    while not frame_queue.empty():
        try:
            frame_queue.get_nowait()
        except queue.Empty:
            break
            
    try:
        frame_queue.put_nowait(frame)
    except queue.Full:
        pass
        
    display_frame = cv2.resize(frame, (config.FRAME_SIZE, config.FRAME_SIZE))
    current_time = time.time()
    
    # Defaults
    people_count = 0
    crowd_flag = 0
    zone_flag = 0
    suspicious_flag = 0
    predicted_people = 0
    
    if last_results is not None:
        boxes_obj = last_results.boxes
        boxes_array = boxes_obj.xyxy.cpu().numpy()
        
        if boxes_obj.id is not None:
            track_ids = boxes_obj.id.cpu().numpy()
        else:
            track_ids = [None] * len(boxes_array)
            
        # Execute Modular AIs
        # 1. Crowd Detection
        crowd_res = crowd_ai.analyze(boxes_array)
        people_count = crowd_res["count"]
        crowd_flag = crowd_res["crowd_flag"]
        
        # Parse Centers and Track Data
        centers_list = []
        track_data = []
        
        for box, track_id in zip(boxes_array, track_ids):
            bx1, by1, bx2, by2 = map(int, box)
            cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
            centers_list.append((cx, cy))
            if track_id is not None:
                track_data.append((int(track_id), cx, cy))
                
        # 2. Zone Detection
        zone_res = zone_ai.analyze(centers_list)
        zone_flag = zone_res["zone_flag"]
        
        # 3. Suspicious Detection
        suspicious_res = suspicious_ai.analyze(track_data)
        suspicious_flag = suspicious_res["suspicious_flag"]

        # Rendering
        color = (0, 0, 255) if suspicious_flag else (0, 255, 0)
        for box in boxes_array:
            x1, y1, x2, y2 = map(int, box)
            cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
            
    # 4. Prediction Logic
    pred_res = prediction_ai.predict(current_time, people_count)
    predicted_people = pred_res["prediction"]
        
    # Send State API Push
    payload = {
        "people": people_count,
        "crowd": crowd_flag,
        "zone": zone_flag,
        "suspicious": suspicious_flag,
        "prediction": predicted_people
    }
    
    try:
        # PUSH camera state
        requests.post("http://127.0.0.1:8000/ingest", json=payload, timeout=0.1)
        # GET merged state (camera + ESP32)
        r = requests.get("http://127.0.0.1:8000/data", timeout=0.1)
        if r.status_code == 200:
            merged = r.json()
            ts_sender.update_state(merged.get("people", people_count), 
                                   merged.get("crowd", crowd_flag), 
                                   merged.get("zone", zone_flag), 
                                   merged.get("suspicious", suspicious_flag), 
                                   merged.get("prediction", predicted_people))
        else:
            ts_sender.update_state(people_count, crowd_flag, zone_flag, suspicious_flag, predicted_people)
    except Exception as e:
        ts_sender.update_state(people_count, crowd_flag, zone_flag, suspicious_flag, predicted_people)
    

        
    # UI Elements on frame
    zx1, zy1, zx2, zy2 = config.ZONE_RECT
    cv2.rectangle(display_frame, (zx1, zy1), (zx2, zy2), (255, 0, 0), 2)
    cv2.putText(display_frame, f"People: {people_count} | Pred: {predicted_people}", (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    cv2.putText(display_frame, f"Crowd: {crowd_flag} | Zone: {zone_flag} | Susp: {suspicious_flag}", (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    
    # Push Video Frame to API
    _, buffer = cv2.imencode('.jpg', display_frame)
    try:
        requests.post("http://127.0.0.1:8000/video_frame", data=buffer.tobytes(), headers={'Content-Type': 'application/octet-stream'}, timeout=0.1)
    except:
        pass

    cv2.imshow("Unified Engine", display_frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        stop_flag = True
        break

camera.release()
cv2.destroyAllWindows()
