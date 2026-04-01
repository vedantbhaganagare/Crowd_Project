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
RECOVERY_THRESHOLD = 80  # Max distance in pixels to recover a target

# ================= GLOBALS =================
stop_flag = False
last_results = None
frame_queue = queue.Queue(maxsize=1)

# Tracking state
is_tracking = False
target_center = None
target_box = None

# ================= MODEL INIT =================
print("Loading YOLOv8n...")
model = YOLO('yolov8n.pt')

def euclidean_distance(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

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

print("✅ Camera connected. Starting tracking...")

# ================= MAIN DISPLAY LOOP =================
cv2.namedWindow("Tracking Test")

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
    
    if last_results is not None:
        boxes = last_results.boxes.xyxy.cpu().numpy()
        
        # --- 1. INITIALIZE TARGET ---
        # Automatically select the first detected person if we have no target
        if not is_tracking and len(boxes) > 0:
            x1, y1, x2, y2 = map(int, boxes[0])
            target_center = ((x1 + x2) // 2, (y1 + y2) // 2)
            target_box = (x1, y1, x2, y2)
            is_tracking = True
            print("🔒 First target locked!")
            
        # --- 2. TRACKING & RECOVERY LOGIC ---
        target_found_this_frame = False
        
        if is_tracking and len(boxes) > 0:
            closest_dist = float('inf')
            closest_box = None
            closest_center = None
            
            # Find the new detection closest to the old center
            for box in boxes:
                x1, y1, x2, y2 = map(int, box)
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                
                dist = euclidean_distance((cx, cy), target_center)
                if dist < closest_dist:
                    closest_dist = dist
                    closest_box = (x1, y1, x2, y2)
                    closest_center = (cx, cy)
            
            # If closest bounding-box falls within our recovery radius, consider it tracked
            if closest_dist < RECOVERY_THRESHOLD:
                target_center = closest_center
                target_box = closest_box
                target_found_this_frame = True
            
        # --- 3. DRAWING LOGIC ---
        for box in boxes:
            x1, y1, x2, y2 = map(int, box)
            
            # Determine rendering color
            if target_found_this_frame and target_box == (x1, y1, x2, y2):
                # Tracked target gets a prominent GREEN rectangle
                cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 3)
                cv2.putText(display_frame, "Target", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            else:
                # Non-targets get thinner RED rectangles
                cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                
        # --- 4. STATUS UI ---
        if is_tracking:
            if target_found_this_frame:
                cv2.putText(display_frame, "STATUS: TRACKING TARGET", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            else:
                cv2.putText(display_frame, "STATUS: TARGET LOST", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                # Keep target_center exactly where it was. On next frame, it will search around this 'last known' spot!
        else:
            cv2.putText(display_frame, "STATUS: AWAITING TARGET", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2)
            
    cv2.imshow("Tracking Test", display_frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        stop_flag = True
        break
        
cap.release()
cv2.destroyAllWindows()
print("Ended.")
