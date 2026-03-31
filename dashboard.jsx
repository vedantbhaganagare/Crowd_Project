import streamlit as st
import requests
import time

# ================= ESP32 API =================
ESP32_IP = "192.168.132.107"   # 🔴 CHANGE THIS TO YOUR ESP32 IP
ESP32_API = f"http://192.168.132.107/data"

# ================= PAGE CONFIG =================
st.set_page_config(layout="wide")
st.title("SVPCET Crowd Monitoring Dashboard")
st.caption("Department of Electronics & Tele-Communication Engineering")

# ================= UI PLACEHOLDERS =================
col1, col2 = st.columns(2)

with col1:
    people_box = st.empty()
    land_box = st.empty()

with col2:
    alert_box = st.empty()

st.divider()

# ================= CHARTS =================
st.subheader("Land Availability Chart")
chart_land = st.line_chart()

st.subheader("People Count Chart")
chart_people = st.line_chart()

# ================= VARIABLES =================
last_update_time = time.time()
OFFLINE_TIMEOUT = 5   # seconds

# ================= MESSAGE PARSER =================
def parse_message(msg):
    try:
        parts = msg.split("|")

        people_part = parts[0].split(":")[1].strip()
        land_part = parts[1].split(":")[1].strip()

        people = int(people_part)
        land = float(land_part)

        return people, land
    except:
        return None, None

# ================= MAIN LOOP =================
while True:

    try:
        # -------- GET DATA FROM ESP32 --------
        response = requests.get(ESP32_API, timeout=2)
        data = response.json()
        message = data.get("last", "")

        # -------- IF DEVICE ONLINE --------
        if message and message != "DEVICE OFFLINE":

            people, land = parse_message(message)

            if people is not None:

                last_update_time = time.time()

                # ===== UPDATE METRICS =====
                people_box.metric("People Count", people)
                land_box.metric("Land Available %", land)

                # ===== ALERT LOGIC =====
                if land < 50 or people > 5:
                    alert_box.error("🚨 Crowd Alert Detected")
                else:
                    alert_box.success("All Safe ✅")

                # ===== UPDATE CHARTS =====
                chart_land.add_rows([land])
                chart_people.add_rows([people])

    except:
        pass

    # -------- OFFLINE DETECTION --------
    if time.time() - last_update_time > OFFLINE_TIMEOUT:
        alert_box.warning("⚠ DEVICE OFFLINE")

    time.sleep(3)