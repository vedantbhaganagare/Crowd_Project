import cv2
import threading
import queue
import time
import math
from ultralytics import YOLO

# ================= CONFIG =================
RTSP_URL = "rtsp://admin:admin123@192.168.137.159:554/avstream/channel=1/stream=0.sdp"
FRAME_SIZE = 416
FRAME_SKIP = 2
CLUSTER_DISTANCE_THRESHOLD = 70
MOTION_THRESHOLD = 45

# ================= GLOBALS =================
stop_flag = False
last_results = None
frame_queue = queue.Queue(maxsize=1)
previous_centers = {}

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
            
        # Resize frame explicitly for matching inference
        frame_resized = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))
        
        # We MUST use track() instead of predict() to get consistent IDs across frames for motion
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

# Start detached thread
t_det = threading.Thread(target=detection_thread, daemon=True)
t_det.start()

# ================= CAMERA INIT =================
cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

if not cap.isOpened():
    print("❌ Failed to open camera. Check RTSP URI.")
    exit()

print("✅ Camera connected. Starting Suspicious Test...")

# ================= MAIN DISPLAY LOOP =================
cv2.namedWindow("Suspicious Test")

while True:
    global previous_centers
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
    
    cluster_flag = 0
    motion_flag = 0
    suspicious_flag = 0
    
    if last_results is not None:
        boxes_obj = last_results.boxes
        current_people = len(boxes_obj)
        boxes_array = boxes_obj.xyxy.cpu().numpy()
        
        # Safe extraction of Tracker IDs
        if boxes_obj.id is not None:
            track_ids = boxes_obj.id.cpu().numpy()
        else:
            track_ids = [None] * current_people
            
        current_centers = {}
        centers_list = []
        close_pairs_count = 0
        motion_count = 0
        
        if current_people > 0:
            for box, track_id in zip(boxes_array, track_ids):
                bx1, by1, bx2, by2 = map(int, box)
                cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
                centers_list.append((cx, cy))
                
                # --- 1. MOTION DETECTION ---
                if track_id is not None:
                    tid = int(track_id)
                    current_centers[tid] = (cx, cy)
                    if tid in previous_centers:
                        px, py = previous_centers[tid]
                        distance = math.sqrt((cx - px)**2 + (cy - py)**2)
                        if distance > MOTION_THRESHOLD and distance > 5:
                            motion_count += 1
                            
            if motion_count > 1:
                motion_flag = 1
                
            # --- 2. CLUSTER DETECTION ---
            for i in range(len(centers_list)):
                for j in range(i + 1, len(centers_list)):
                    # Euclidean dist between centers
                    dist = math.sqrt((centers_list[i][0] - centers_list[j][0])**2 + (centers_list[i][1] - centers_list[j][1])**2)
                    if dist < CLUSTER_DISTANCE_THRESHOLD:
                        close_pairs_count += 1
                
                # Micro-Optimization: break early if we already hit the threshold
                if close_pairs_count > 2:
                    break
                    
            if close_pairs_count > 2:
                cluster_flag = 1
                
        # Persist standard dictionary memory for the next frame
        previous_centers = {k: v for k, v in current_centers.items()}
        
        # --- 3. FINAL SUSPICIOUS LOGIC ---
        if cluster_flag == 1 and motion_flag == 1:
            suspicious_flag = 1
            
        # Draw bounding boxes
        # RED boxes if the scene is flagged, GREEN otherwise
        box_color = (0, 0, 255) if suspicious_flag == 1 else (0, 255, 0)
        for box in boxes_array:
            bx1, by1, bx2, by2 = map(int, box)
            cv2.rectangle(display_frame, (bx1, by1), (bx2, by2), box_color, 2)
            
    # --- 4. DISPLAY UI ---
    if suspicious_flag == 1:
        cv2.putText(display_frame, "Suspicious: YES", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    else:
        cv2.putText(display_frame, "Suspicious: NO", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
    cv2.putText(display_frame, f"C: {cluster_flag}   M: {motion_flag}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

    cv2.imshow("Suspicious Test", display_frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        stop_flag = True
        break

cap.release()
cv2.destroyAllWindows()
print("Ended.")
