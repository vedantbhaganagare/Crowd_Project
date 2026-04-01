from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

# ================= CONFIG =================
TS_CHANNEL = "3320572"
TS_READ_KEY = "GVJ80AY5DZUYI6J3"

TS_URL = f"https://api.thingspeak.com/channels/{TS_CHANNEL}/feeds.json?api_key={TS_READ_KEY}&results=20"

MAX_CAPACITY = 15


# ================= MAIN API =================
@app.route("/data", methods=["GET"])
def get_data():
    try:
        response = requests.get(TS_URL)
        data = response.json()

        feeds = data.get("feeds", [])

        if not feeds:
            return jsonify({
                "people": 0,
                "history": [],
                "status": "NO DATA"
            })

        history = []

        for f in feeds[-20:]:
            p = int(f.get("field1") or 0)
            p = max(0, min(MAX_CAPACITY, p))

            history.append({
                "time": f.get("created_at"),
                "people": p,
                "occupancy": round((p / MAX_CAPACITY) * 100)
            })

        latest = history[-1]

        occupancy = latest["occupancy"]

        # Status logic (same as your frontend)
        if occupancy >= 95:
            status = "CRITICAL"
        elif occupancy >= 90:
            status = "WARNING"
        elif occupancy > 80:
            status = "HIGH"
        elif occupancy > 45:
            status = "MODERATE"
        else:
            status = "SAFE"

        return jsonify({
            "people": latest["people"],
            "occupancy": occupancy,
            "status": status,
            "history": history
        })

    except Exception as e:
        return jsonify({
            "error": str(e)
        })


# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True, port=5000)