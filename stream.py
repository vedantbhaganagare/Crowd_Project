import cv2
import time
from camera.camera_stream import CameraStream
import config

print(f"Starting stream from {config.CAMERA_SRC}...")
camera = CameraStream(config.CAMERA_SRC)

while True:
    frame = camera.get_frame()

    if frame is None:
        time.sleep(0.01)
        continue

    cv2.imshow("Live Feed", frame)

    # Press ESC to exit
    if cv2.waitKey(1) == 27:
        break

camera.release()
cv2.destroyAllWindows()
