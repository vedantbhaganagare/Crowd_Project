import config

class ZoneDetection:
    def __init__(self):
        self.zone = config.ZONE_RECT

    def analyze(self, centers_list):
        """
        Checks if any person center intersects the restricted zone.
        """
        zx1, zy1, zx2, zy2 = self.zone
        zone_flag = 0
        
        for (cx, cy) in centers_list:
            if zx1 < cx < zx2 and zy1 < cy < zy2:
                zone_flag = 1
                break
                
        return {"zone_flag": zone_flag}
