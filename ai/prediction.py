import config

class CrowdPrediction:
    def __init__(self):
        self.history = []

    def predict(self, current_time, people_count):
        self.history.append((current_time, people_count))
        # Keep only history within PREDICTION_WINDOW
        self.history = [e for e in self.history if e[0] >= current_time - config.PREDICTION_WINDOW]
        
        if len(self.history) > 1:
            oldest_time, oldest_people = self.history[0]
            latest_time, latest_people = self.history[-1]
            time_diff = latest_time - oldest_time
            
            if time_diff > 5:
                rate = (latest_people - oldest_people) / time_diff
                raw_pred = int(latest_people + (rate * config.PREDICT_AFTER))
                predicted_people = max(0, min(latest_people + 50, max(latest_people - 50, raw_pred)))
            else:
                predicted_people = latest_people
        else:
            predicted_people = people_count
            
        return {"prediction": predicted_people}
