import config

class CrowdDetection:
    def __init__(self):
        self.total_area = config.FRAME_SIZE * config.FRAME_SIZE

    def analyze(self, boxes_array):
        """
        Calculates occupancy and crowd alerts.
        """
        people_count = len(boxes_array)
        person_area = 0
        
        if people_count > 0:
            widths = boxes_array[:, 2] - boxes_array[:, 0]
            heights = boxes_array[:, 3] - boxes_array[:, 1]
            person_area = (widths * heights).sum()
            
        occupied_percent = (person_area / self.total_area) * 100
        land_available = max(0.0, 100.0 - occupied_percent)
        
        crowd_flag = 1 if land_available < 50.0 or people_count > config.CROWD_THRESHOLD else 0
        
        return {
            "count": people_count,
            "occupancy": occupied_percent,
            "land_available": land_available,
            "crowd_flag": crowd_flag
        }
