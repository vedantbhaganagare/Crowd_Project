import cv2
import threading
import time
import logging
import config

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("CameraStream")

class CameraStream:
    def __init__(self, src=None):
        """
        Initialize the CameraStream.
        If src is None, defaults to config.CAMERA_SRC.
        Connects in a background thread to prevent blocking.
        """
        self.src = src if src is not None else config.CAMERA_SRC
        self.cap = None
        
        self.frame = None
        self.ret = False
        self.stopped = False
        self.lock = threading.Lock()
        
        # Connect initially
        self._connect()
        
        # Start background thread to read frames continuously
        self.thread = threading.Thread(target=self._update, args=(), daemon=True)
        self.thread.start()
        
    def _connect(self):
        if self.cap is not None:
            self.cap.release()
            
        logger.info(f"Connecting to camera: {self.src}")
        self.cap = cv2.VideoCapture(self.src, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        
        if not self.cap.isOpened():
            logger.error(f"Failed to connect to camera: {self.src}")
            return False
            
        # Read the first frame
        ret, frame = self.cap.read()
        if ret:
            logger.info("Camera connected successfully.")
            with self.lock:
                self.ret = ret
                self.frame = frame
            return True
        else:
            logger.error("Connected but failed to read first frame.")
            return False
            
    def _update(self):
        while not self.stopped:
            if self.cap is None or not self.cap.isOpened():
                logger.warning("Stream lost, attempting to reconnect in 5 seconds...")
                time.sleep(5)
                self._connect()
                continue
                
            ret, frame = self.cap.read()
            
            if ret:
                with self.lock:
                    self.ret = ret
                    self.frame = frame
            else:
                logger.warning("Failed to grab frame. Reconnecting...")
                self.cap.release()
                time.sleep(1)
                self._connect()

    def get_frame(self):
        """
        Returns the latest frame immediately without blocking.
        """
        with self.lock:
            if not self.ret or self.frame is None:
                return None
            return self.frame.copy()
            
    def read(self):
        """
        Alias for get_frame(), maintaining standard OpenCV output format (ret, frame).
        """
        frame = self.get_frame()
        return (frame is not None, frame)

    def release(self):
        """
        Releases the camera and shuts down the background thread.
        """
        self.stopped = True
        if self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.cap is not None:
            self.cap.release()
        logger.info("Camera stream released.")
