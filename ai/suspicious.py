import math
import config

class SuspiciousDetection:
    def __init__(self):
        self.previous_centers = {}

    def analyze(self, track_data):
        """
        track_data: list of (track_id, cx, cy)
        """
        current_centers = {}
        centers_list = []
        motion_count = 0
        close_pairs_count = 0
        
        # Motion detection
        for tid, cx, cy in track_data:
            centers_list.append((cx, cy))
            if tid is not None:
                current_centers[tid] = (cx, cy)
                if tid in self.previous_centers:
                    px, py = self.previous_centers[tid]
                    distance = math.sqrt((cx - px)**2 + (cy - py)**2)
                    if distance > config.MOTION_THRESHOLD and distance > 5:
                        motion_count += 1
                        
        # Cluster detection
        if motion_count > 1:
            for i in range(len(centers_list)):
                for j in range(i + 1, len(centers_list)):
                    dist = math.sqrt((centers_list[i][0] - centers_list[j][0])**2 + (centers_list[i][1] - centers_list[j][1])**2)
                    if dist < config.CLUSTER_DISTANCE_THRESHOLD:
                        close_pairs_count += 1
                if close_pairs_count > 2:
                    break
                    
        self.previous_centers = current_centers
        
        suspicious_flag = 1 if close_pairs_count > 2 and motion_count > 1 else 0
        return {"suspicious_flag": suspicious_flag}
