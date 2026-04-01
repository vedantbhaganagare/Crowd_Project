import cv2
import threading
import queue
import time
from ultralytics import YOLO

# ================= CONFIG =================
RTSP_URL = "rtsp://admin:admin123@192.168.137.159:554/avstream/channel=1/stream=0.sdp"
FRAME_SIZE = 416
FRAME_SKIP = 2

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
        
        # Apply strict frame skipping to lower CPU load
        if counter % FRAME_SKIP != 0:
            continue
            
        # Resize frame explicitly for inference matching pi limits
        frame_resized = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))
        
        # Predict: classes=[0] restricts to person
        results = model.predict(
            frame_resized, 
            classes=[0], 
            conf=0.3, 
            iou=0.45, 
            device='cpu', 
            verbose=False
        )[0]
        
        last_results = results

# Start detached thread
t_det = threading.Thread(target=detection_thread, daemon=True)
t_det.start()

# ================= CAMERA INIT =================
cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

if not cap.isOpened():
    print("❌ Failed to open camera. Check RTSP URI.")
    exit()

print("✅ Camera connected. Starting normal mode test...")

# ================= MAIN DISPLAY LOOP =================
cv2.namedWindow("Normal Mode Test")

while True:
    ret, frame = cap.read()
    if not ret:
        print("Stream ended")
        break
        
    # Standard queue flush to keep realtime on slow CPU
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
    
    people_count = 0
    land_available = 100.0
    
    if last_results is not None:
        boxes = last_results.boxes.xyxy.cpu().numpy()
        people_count = len(boxes)
        
        # Calculate land availability
        total_area = FRAME_SIZE * FRAME_SIZE
        person_area = 0
        
        # PERFORMANCE OPTIMIZATION: Avoid python loops/allocations where possible
        if len(boxes) > 0:
            widths = boxes[:, 2] - boxes[:, 0]
            heights = boxes[:, 3] - boxes[:, 1]
            person_area = (widths * heights).sum()
            
            # --- Draw GREEN boxes for everyone ---
            for box in boxes:
                x1, y1, x2, y2 = map(int, box)
                cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                
        occupied_percent = (person_area / total_area) * 100
        land_available = max(0.0, 100.0 - occupied_percent)

    # --- UI DISPLAY ---
    cv2.putText(display_frame, f"People: {people_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(display_frame, f"Land: {land_available:.2f}%", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    
    # --- VISUAL ALERT ---
    if land_available < 50.0 or people_count > 5:
        cv2.putText(display_frame, "ALERT: CROWDED", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            
    cv2.imshow("Normal Mode Test", display_frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        stop_flag = True
        break
        
cap.release()
cv2.destroyAllWindows()
print("Ended.")
