import cv2
import threading
import queue
import time
from ultralytics import YOLO

# ================= CONFIG =================
RTSP_URL = "rtsp://admin:admin123@192.168.137.159:554/avstream/channel=1/stream=0.sdp"
FRAME_SIZE = 416
FRAME_SKIP = 2
PREDICTION_WINDOW = 60  # Retain history for this many seconds
PREDICT_AFTER = 300     # Predict crowd this many seconds in the future (5 minutes)

# ================= GLOBALS =================
stop_flag = False
last_results = None
frame_queue = queue.Queue(maxsize=1)

# ================= MODEL INIT =================
print("Loading YOLOv8n...")
model = YOLO('yolov8n.pt')

# ================= DETECTION THREAD =================
def detection_thread():
    global last_results, stop_flag
    
    counter = 0
    while not stop_flag:
        if frame_queue.empty():
            time.sleep(0.01)
            continue
            
        frame = frame_queue.get()
        counter += 1
        
        # Lower CPU load via frame skipping
        if counter % FRAME_SKIP != 0:
            continue
            
        frame_resized = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))
        
        # Predict: classes=[0] rigorously isolates humans
        results = model.predict(
            frame_resized, 
            classes=[0], 
            conf=0.3, 
            iou=0.45, 
            device='cpu', 
            verbose=False
        )[0]
        
        last_results = results

# Dispatch thread dynamically
t_det = threading.Thread(target=detection_thread, daemon=True)
t_det.start()

# ================= CAMERA INIT =================
cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

if not cap.isOpened():
    print("❌ Failed to open camera. Check RTSP URI.")
    exit()

print("✅ Camera connected. Starting Prediction Test...")

# ================= MAIN DISPLAY LOOP =================
cv2.namedWindow("Prediction Test")

people_history = []
predicted_people = 0
trend = "Stable"

while True:
    ret, frame = cap.read()
    if not ret:
        print("Stream ended")
        break
        
    # Non-blocking clear to always pull the latest realtime frame on heavily loaded CPU
    while not frame_queue.empty():
        try:
            frame_queue.get_nowait()
        except queue.Empty:
            break
            
    try:
        frame_queue.put_nowait(frame)
    except queue.Full:
        pass
        
    display_frame = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))
    
    current_time = time.time()
    people_count = 0
    
    # Analyze Bounding Boxes
    if last_results is not None:
        boxes = last_results.boxes.xyxy.cpu().numpy()
        people_count = len(boxes)
        
        # 8. DRAWING UI
        for box in boxes:
            x1, y1, x2, y2 = map(int, box)
            cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
    # --- 1. HISTORY MAINTENANCE ---
    people_history.append((current_time, people_count))
    # Eliminate data points older than our 60 second target window
    people_history = [entry for entry in people_history if entry[0] >= current_time - PREDICTION_WINDOW]
    
    # --- 2. FAST LINEAR PREDICTION ---
    if len(people_history) > 1:
        oldest_time, oldest_people = people_history[0]
        latest_time, latest_people = people_history[-1]
        
        time_diff = latest_time - oldest_time
        
        # Ensure at least 5 seconds of baseline context to compute gradients without chaotic noise scaling
        if time_diff > 5:
            rate = (latest_people - oldest_people) / time_diff
            
            # Predict ahead by 300 seconds (5 mins)
            raw_prediction = int(latest_people + (rate * PREDICT_AFTER))
            
            # Clamp Safety: Hard limit predicting no more than +50 or -50 people jumps to mitigate extreme mathematical bursts
            clamped_prediction = min(latest_people + 50, max(latest_people - 50, raw_prediction))
            
            # Zero bound check
            predicted_people = max(0, clamped_prediction)
        else:
            predicted_people = latest_people
    else:
        predicted_people = people_count
        
    # --- 3. TREND CLASSIFICATION ---
    if predicted_people > people_count + 2:
        trend = "Increasing"
        trend_color = (0, 0, 255) # Red
    elif predicted_people < people_count:
        trend = "Decreasing"
        trend_color = (0, 255, 0) # Green
    else:
        trend = "Stable"
        trend_color = (255, 255, 255) # White
        
    # --- 4. RENDER UI LAYERS ---
    cv2.putText(display_frame, f"People: {people_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
    cv2.putText(display_frame, f"Predicted (5 min): {predicted_people}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 255), 2)
    cv2.putText(display_frame, f"Trend: {trend}", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, trend_color, 2)
    
    cv2.imshow("Prediction Test", display_frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        stop_flag = True
        break

cap.release()
cv2.destroyAllWindows()
print("Ended.")
