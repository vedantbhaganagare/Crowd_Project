import cv2
import time
import threading
import queue
import requests
from ultralytics import YOLO

# ================= THINGSPEAK CONFIG =================
WRITE_API_KEY = "30KU7TJ41IYEQOK2"
THINGSPEAK_URL = "https://api.thingspeak.com/update"

# ThingSpeak free version → minimum 15 sec
UPDATE_INTERVAL = 15

# ================= CAMERA CONFIG =================
RTSP_URL = "rtsp://admin:admin123@192.168.137.159:554/avstream/channel=1/stream=0.sdp"
FRAME_SIZE = 416
FRAME_SKIP = 2

# ================= LOAD MODEL =================
print("Loading YOLOv8n...")
model = YOLO("yolov8n.pt")
print("Model Loaded")

# ================= CAMERA INIT =================
cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

if not cap.isOpened():
    print("❌ Camera not found")
    exit()

print("✅ Camera connected. Starting detection...")

# ================= GLOBAL VARIABLES =================
people_count = 0
land_available = 100
last_update_time = 0
stop_flag = False
last_results = None

frame_queue = queue.Queue(maxsize=1)

# ================= DETECTION THREAD =================
def detection():
    global people_count, land_available, last_update_time, stop_flag, last_results

    counter = 0

    while not stop_flag:

        if frame_queue.empty():
            time.sleep(0.01)
            continue

        frame = frame_queue.get()
        counter += 1

        if counter % FRAME_SKIP != 0:
            continue

        # Resize BEFORE YOLO (important for Pi performance)
        frame_resized = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))

        # Person only detection
        results = model.predict(
            frame_resized,
            imgsz=416,
            classes=[0],          # only person
            conf=0.25,
            iou=0.45,
            device="cpu",
            verbose=False
        )[0]

        last_results = results

        current_time = time.time()

        # ===== Update cloud every 15 sec =====
        if current_time - last_update_time >= UPDATE_INTERVAL:

            # -------- People count --------
            people_count = len(results.boxes)

            # -------- Occupancy (Bounding Box Area Based) --------
            total_area = FRAME_SIZE * FRAME_SIZE
            person_area = 0

            for box in results.boxes.xyxy:
                x1, y1, x2, y2 = map(int, box)
                person_area += (x2 - x1) * (y2 - y1)

            occupied_percent = (person_area / total_area) * 100
            land_available = max(0, 100 - occupied_percent)

            print(f"People: {people_count} | Land: {land_available:.2f}%")

            # -------- Temporary Alert Logic --------
            alert_flag = 1 if (land_available < 50 or people_count > 5) else 0

            # -------- Send To ThingSpeak --------
            payload = {
                "api_key": WRITE_API_KEY,
                "field1": people_count,
                "field2": round(land_available, 2),
                "field3": alert_flag
            }

            try:
                requests.get(THINGSPEAK_URL, params=payload, timeout=5)
                print("☁️ Cloud Updated")
            except Exception as e:
                print("ThingSpeak Error:", e)

            last_update_time = current_time


# ================= START THREAD =================
t_det = threading.Thread(target=detection, daemon=True)
t_det.start()


# ================= DISPLAY LOOP =================
while True:

    ret, frame = cap.read()
    if not ret:
        print("Frame not received")
        break

    # Keep only latest frame
    if not frame_queue.empty():
        try:
            frame_queue.get_nowait()
        except queue.Empty:
            pass

    frame_queue.put(frame)

    display_frame = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))

    if last_results is not None:
        for box in last_results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])

            cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(display_frame, f"{conf:.2f}",
                        (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, (0, 255, 0), 2)

    cv2.putText(display_frame, f"People: {people_count}",
                (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

    cv2.putText(display_frame, f"Land: {land_available:.2f}%",
                (10, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

    # Temporary alert display
    if land_available < 50 or people_count > 5:
        cv2.putText(display_frame, "ALERT: Crowded!",
                    (10, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (0, 0, 255), 2)

    cv2.imshow("Crowd Monitoring", display_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        stop_flag = True
        break


cap.release()
cv2.destroyAllWindows()
print("System stopped.")
