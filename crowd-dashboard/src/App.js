import React, { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function App() {
  const [userCapacity, setUserCapacity] = useState("");
  const [userArea, setUserArea] = useState("");
  const videoContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [systemMode, setSystemMode] = useState("NORMAL");
  const [predictedPeople, setPredictedPeople] = useState(0);
  const [people, setPeople] = useState(0);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tsStatus, setTsStatus] = useState("Initializing...");
  const [tsLive, setTsLive] = useState(false);
  const [activePage, setActivePage] = useState("Dashboard");
  const [timeFilter, setTimeFilter] = useState("1H");

  // Simulation States (Disabled logic as per instructions, but keeping UI)
  const [simMode, setSimMode] = useState(false);

  const latestData = history.length ? history[history.length - 1] : { people: 0, occupancy: 0, alert_flag: 0, zone_alert: 0, suspicious: 0, prediction: 0 };
  const occupancy = latestData.occupancy;
  const statusText = occupancy >= 95 ? "CRITICAL" : occupancy >= 90 ? "WARNING" : occupancy > 80 ? "HIGH" : occupancy > 45 ? "MODERATE" : "SAFE";

  const [feedHover, setFeedHover] = useState(false);
  const [flowHover, setFlowHover] = useState(false);

  // 1 & 2. NEW BACKEND FETCH LOGIC
  const fetchBackend = async () => {
    try {
      setTsStatus("Fetching AI Data...");
      const res = await fetch("http://127.0.0.1:8000/data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const safeMax = (Number(userCapacity) > 0) ? Number(userCapacity) : 15;
      const safeCrowd = safeMax * 0.8;
      const safeZone = safeMax;

      const currentOccupancy = Math.max(0, Math.round((data.people / safeMax) * 100));

      const newDataPoint = {
        time: new Date().toLocaleTimeString(),
        people: data.people || 0,
        occupancy: currentOccupancy,
        alert_flag: data.crowd || (data.people > safeCrowd ? 1 : 0),
        zone_alert: data.zone || (data.people > safeZone ? 1 : 0),
        suspicious: data.suspicious || 0,
        prediction: data.prediction || 0
      };

      setHistory((prev) => [...prev.slice(-19), newDataPoint]);
      setPeople(data.people || 0);
      setPredictedPeople(data.prediction || 0);
      setTsStatus(`System Online (AI Active)`);
      setTsLive(true);

      // 5. ALERT SYSTEM (Straight from backend)
      setAlerts(data.alerts || []);

    } catch (err) {
      setTsStatus(`Backend unreachable: ${err.message}`);
      setTsLive(false);
    }
  };

  // 4. REAL-TIME UPDATE (1 second)
  useEffect(() => {
    fetchBackend();
    const interval = setInterval(fetchBackend, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerSimulation = async (type) => {
    let payload = { people_count: people, zone_alert: 0, crowd_alert: 0, suspicious: 0 };
    if (type === 'BREACH') payload.zone_alert = 1;
    if (type === 'ALERT') { payload.crowd_alert = 1; payload.people_count = Math.max(people, (Number(userCapacity) || 15) + 2); }
    if (type === 'SUSPICIOUS') payload.suspicious = 1;
    if (type === 'RESET') { payload = { people_count: 0, zone_alert: 0, crowd_alert: 0, suspicious: 0 }; }

    try {
      await fetch("http://127.0.0.1:8000/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setTsStatus(`Simulation Triggered: ${type}`);
    } catch (err) {
      console.error(err);
      setTsStatus(`Simulation Error: ${err.message}`);
    }
  };

  useEffect(() => {
    if (!simMode) return;
    const cycle = ['RESET', 'ALERT', 'BREACH', 'SUSPICIOUS'];
    let idx = 0;
    const interval = setInterval(() => {
      triggerSimulation(cycle[idx]);
      idx = (idx + 1) % cycle.length;
    }, 5000);
    return () => clearInterval(interval);
  }, [simMode, people, userCapacity]);

  useEffect(() => {
    const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        if (videoContainerRef.current) {
          videoContainerRef.current.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
          });
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    };

    const applyMode = (mode) => {
      setSystemMode(mode);
      setAlerts(prev => [{
        id: Date.now() + '-mode',
        msg: mode === 'SECURITY' ? '🚨 SECURITY MODE ACTIVATED' : '✅ NORMAL MODE ACTIVATED',
        sev: mode === 'SECURITY' ? 'CRITICAL' : 'SAFE',
        location: 'System Mode Shift',
        time: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 10));
    };

    const sidebarItems = [
      { key: 'Dashboard', icon: '🏙', label: 'Dashboard' },
      { key: 'Live Monitoring', icon: '🎥', label: 'Live Monitoring' },
      { key: 'Analytics', icon: '📈', label: 'Analytics' },
      { key: 'Alerts', icon: '🚨', label: 'Alerts', badge: alerts.length },
      { key: 'Reports', icon: '📄', label: 'Reports' }
    ];

    const filteredHistory = timeFilter === '1H' ? history.slice(-14) : timeFilter === '1D' ? history.slice(-18) : history;
    const rawPhotoUrl = "https://images.unsplash.com/photo-1580692086801-843533a00d2f?auto=format&fit=crop&w=1200&q=80";
    const capacityInfo = occupancy >= 95 ? { label: 'CRITICAL', color: '#ef4444' } : occupancy >= 90 ? { label: 'WARNING', color: '#f59e0b' } : occupancy > 80 ? { label: 'HIGH', color: '#f97316' } : { label: 'SAFE', color: '#22c55e' };

    const glassCard = {
      borderRadius: 20,
      background: 'rgba(7, 15, 37, 0.64)',
      border: '1px solid rgba(120, 170, 255, 0.15)',
      backdropFilter: 'blur(18px)',
      boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
      color: '#e5e7eb'
    };

    const renderActivePage = () => {
      if (activePage === 'Dashboard') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Top Panel Mode Visibility & Toggle */}
            <div style={{ ...glassCard, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>SYSTEM MODE</div>
                <div className={systemMode === 'SECURITY' ? 'pulse-red-glow' : 'pulse-green-glow'} style={{ padding: '6px 16px', borderRadius: 12, fontWeight: 800, transition: 'all 0.3s ease' }}>
                  {systemMode}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => applyMode('NORMAL')}
                  style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', background: systemMode === 'NORMAL' ? '#22c55e' : 'rgba(15,23,42,0.6)', border: 'none', color: '#fff', transition: 'all 0.3s ease', boxShadow: systemMode === 'NORMAL' ? '0 0 15px rgba(34, 197, 94, 0.6)' : 'none' }}
                >NORMAL</button>
                <button
                  onClick={() => applyMode('SECURITY')}
                  style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', background: systemMode === 'SECURITY' ? '#ef4444' : 'rgba(15,23,42,0.6)', border: 'none', color: '#fff', transition: 'all 0.3s ease', boxShadow: systemMode === 'SECURITY' ? '0 0 15px rgba(239, 68, 68, 0.6)' : 'none' }}
                >SECURITY</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
              <div style={{ display: 'grid', gap: 14 }}>

                {/* Security Test Panel (NEW) */}
                <div style={{ ...glassCard, padding: 18, background: 'linear-gradient(135deg, rgba(8, 18, 44, 0.8), rgba(2, 6, 23, 0.9))', border: '1px solid rgba(147, 197, 253, 0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, color: '#e0e7ff', display: 'flex', alignItems: 'center', gap: 8 }}><span>🕹️</span> Security Test Panel</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: simMode ? '#34d399' : '#94a3b8' }}>AUTO SIMULATION</span>
                      <button
                        onClick={() => setSimMode(!simMode)}
                        style={{ padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 700, border: 'none', background: simMode ? '#10b981' : 'rgba(255,255,255,0.1)', color: '#fff', transition: 'all 0.3s ease', boxShadow: simMode ? '0 0 15px rgba(16, 185, 129, 0.5)' : 'none' }}
                      >
                        {simMode ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <button
                      onClick={() => triggerSimulation('BREACH')}
                      style={{ padding: '12px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', fontWeight: 600 }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.5)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      🚨 Trigger Breach
                    </button>
                    <button
                      onClick={() => triggerSimulation('ALERT')}
                      style={{ padding: '12px', borderRadius: 12, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fde68a', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', fontWeight: 600 }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.5)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      ⚠ Trigger Alert
                    </button>
                    <button
                      onClick={() => triggerSimulation('SUSPICIOUS')}
                      style={{ padding: '12px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', fontWeight: 600 }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.5)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      👀 Suspicious
                    </button>
                    <button
                      onClick={() => triggerSimulation('RESET')}
                      style={{ padding: '12px', borderRadius: 12, background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.4)', color: '#a7f3d0', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', fontWeight: 600 }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(52, 211, 153, 0.5)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      ✅ Reset All
                    </button>
                  </div>
                </div>

                {/* User Configuration Panel */}
                <div style={{ ...glassCard, padding: 18, background: 'linear-gradient(135deg, rgba(8, 18, 44, 0.8), rgba(2, 6, 23, 0.9))', border: '1px solid rgba(147, 197, 253, 0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, color: '#e0e7ff', display: 'flex', alignItems: 'center', gap: 8 }}><span>⚙️</span> Crowd Parameters</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Expected People</label>
                      <input type="number"
                        value={userCapacity}
                        onChange={(e) => setUserCapacity(e.target.value)}
                        placeholder="e.g. 100"
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(0,0,0,0.3)', color: '#fff', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Available Space (m²)</label>
                      <input type="number"
                        value={userArea}
                        onChange={(e) => setUserArea(e.target.value)}
                        placeholder="e.g. 500"
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(0,0,0,0.3)', color: '#fff', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Status</label>
                      {(() => {
                        const cap = Number(userCapacity) || 15;
                        let panelStatus = "SAFE";
                        let panelColor = "#22c55e"; // green
                        if (people > cap) {
                          panelStatus = "FULL / ALERT";
                          panelColor = "#ef4444"; // red
                        } else if (people >= cap * 0.8) {
                          panelStatus = "MODERATE";
                          panelColor = "#f59e0b"; // yellow
                        }
                        return (
                          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', color: panelColor, fontWeight: 700, display: 'flex', alignItems: 'center', height: '100%', boxSizing: 'border-box', border: `1px solid ${panelColor}40` }}>
                            {panelStatus}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div
                  onMouseEnter={() => setFeedHover(true)}
                  onMouseLeave={() => setFeedHover(false)}
                  style={{
                    ...glassCard,
                    border: '1px solid rgba(70, 130, 255, 0.30)',
                    padding: 14,
                    background: 'rgba(6, 18, 42, 0.75)',
                    transform: feedHover ? 'scale(1.02)' : 'scale(1)',
                    boxShadow: feedHover ? '0 0 22px rgba(56, 189, 248, 0.75)' : '0 12px 28px rgba(0,0,0,0.25)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ color: '#22d3ee', fontSize: 12, fontWeight: 700 }}>CAM-04 · MAIN SQUARE</div>
                      <h2 style={{ margin: 0, color: '#eef2ff', fontSize: 20 }}>AI SURVEILLANCE FEED</h2>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: tsLive ? '#34d399' : '#f97316', fontWeight: 800 }}>{tsLive ? '● LIVE' : '● OFFLINE'}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{tsStatus}</span>
                    </div>
                  </div>
                  <div ref={videoContainerRef} style={{ position: 'relative', borderRadius: isFullscreen ? 0 : 16, height: isFullscreen ? '100vh' : 280, width: isFullscreen ? '100vw' : '100%', overflow: 'hidden', border: isFullscreen ? 'none' : '1px solid rgba(74, 222, 128, 0.18)', background: 'linear-gradient(130deg, #091323 0%, #03102a 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <img src="http://127.0.0.1:8000/video_feed" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: isFullscreen ? 'contain' : 'cover', zIndex: 0 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(42, 180, 255,0.08), rgba(42, 180, 255,0.001) 50%, rgba(42, 180, 255,0.08))', animation: 'scanline 4s linear infinite', zIndex: 1, pointerEvents: 'none' }} />

                    {/* Fullscreen Button */}
                    <button onClick={toggleFullscreen} style={{ position: 'absolute', top: 14, right: 14, zIndex: 3, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', backdropFilter: 'blur(4px)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}>
                      {isFullscreen ? '↙️ Exit' : '↗️ Fullscreen'}
                    </button>

                    <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2, pointerEvents: 'none' }}>
                      {[...Array(Math.min(people, 3))].map((_, index) => (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: '1px solid rgba(14, 165, 233,0.3)', borderRadius: 10, padding: '5px 8px', color: '#cbd5e1', fontSize: 11, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}>
                          <span>PERSON {index + 1}</span>
                          <span>{90 + Math.floor(Math.random() * 8)}% CONF</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  onMouseEnter={() => setFlowHover(true)}
                  onMouseLeave={() => setFlowHover(false)}
                  style={{
                    ...glassCard,
                    border: '1px solid rgba(70, 130, 255, 0.25)',
                    padding: 14,
                    background: 'rgba(8, 19, 45, 0.78)',
                    transform: flowHover ? 'scale(1.02)' : 'scale(1)',
                    boxShadow: flowHover ? '0 0 22px rgba(56, 189, 248, 0.75)' : '0 12px 28px rgba(0,0,0,0.25)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ color: '#e2e8f0', margin: 0 }}>REAL-TIME OCCUPANCY FLOW</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['1H', '1D', '1W'].map((range) => (
                        <button
                          key={range}
                          onClick={() => setTimeFilter(range)}
                          style={{ border: 'none', background: timeFilter === range ? 'linear-gradient(90deg, #fb923c, #f97316)' : 'rgba(56, 189, 248, 0.18)', color: '#f8fafc', fontSize: 11, borderRadius: 7, padding: '4px 9px', cursor: 'pointer', transition: 'all 0.2s ease' }}
                          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.7)'}
                          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                        >{range}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 220, marginTop: 10 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                      <LineChart data={filteredHistory} margin={{ top: 0, right: 12, left: -8, bottom: 0 }}>
                        <CartesianGrid stroke='rgba(56, 189, 248, 0.15)' />
                        <XAxis dataKey='time' stroke='#9ca3af' tick={{ fontSize: 11 }} />
                        <YAxis stroke='#9ca3af' tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: 'rgba(7, 16, 34, 0.96)', border: '1px solid rgba(97, 156, 255, 0.45)', color: '#fff', borderRadius: 8 }} />
                        <Line type='monotone' dataKey='occupancy' stroke='url(#lineGrad)' strokeWidth={3} dot={false} />
                        <defs>
                          <linearGradient id='lineGrad' x1='0' y1='0' x2='1' y2='0'>
                            <stop offset='0%' stopColor='#fb923c' />
                            <stop offset='100%' stopColor='#06b6d4' />
                          </linearGradient>
                        </defs>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14, gridAutoRows: 'min-content' }}>
                <div
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.4)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)'; }}
                  style={{ ...glassCard, padding: 14, background: 'rgba(8, 18, 44, 0.7)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, color: '#f9fafb' }}>LATEST ALERTS</h4>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{alerts.length} active</span>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                    {alerts.length ? alerts.map((item) => (
                      <div key={item.id} style={{ background: item.sev === 'CRITICAL' ? 'rgba(239, 68, 68, 0.15)' : item.sev === 'WARNING' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)', borderLeft: `4px solid ${item.sev === 'CRITICAL' ? '#ef4444' : item.sev === 'WARNING' ? '#f59e0b' : '#22c55e'}`, borderRadius: 10, padding: '10px 12px', boxShadow: item.sev === 'CRITICAL' ? '0 0 10px rgba(239,68,68,0.2)' : 'none', transition: 'transform 0.2s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>{item.msg}</div>
                          <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: 4 }}>{item.time}</div>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{item.location}</div>
                      </div>
                    )) : <div style={{ color: '#94a3b8', fontSize: 12, padding: 10, textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>No Data - No active alerts.</div>}
                  </div>
                </div>

                {systemMode === "NORMAL" ? (
                  <div
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.4)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)'; }}
                    style={{ ...glassCard, padding: 14, background: 'rgba(8, 18, 44, 0.7)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
                  >
                    <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>🟢</span> Normal Monitoring Panel</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14, background: 'rgba(34, 197, 94, 0.1)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span>👥</span> People Count: <strong>{people}</strong></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span>✅</span> Available: <strong>{Math.max(0, (Number(userCapacity) || 15) - people)}</strong></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80' }}>📊 Occupancy: <strong>{occupancy}%</strong></div>
                    </div>
                    <div style={{ height: 14, borderRadius: 999, background: 'linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)', marginTop: 12, overflow: 'hidden' }}>
                      <div style={{ width: `${occupancy}%`, height: '100%', borderRadius: 999, background: 'rgba(255,255,255,0.7)', transition: 'width 0.5s ease-out', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)' }} />
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 11 }}><span>0%</span><span>{capacityInfo.label}</span><span>100%</span></div>
                    <div style={{ marginTop: 12, padding: '10px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', color: capacityInfo.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🟢</span> Status: {statusText}
                    </div>
                  </div>
                ) : (
                  <div
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 25px rgba(239, 68, 68, 0.5)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)'; }}
                    style={{ ...glassCard, padding: 14, background: 'linear-gradient(135deg, rgba(30,10,10,0.9) 0%, rgba(55,15,15,0.95) 100%)', transition: 'transform 0.2s ease, box-shadow 0.2s ease', border: '1px solid rgba(239,68,68,0.5)' }}
                  >
                    <div style={{ fontWeight: 800, color: '#fca5a5', marginBottom: 12, borderBottom: '1px solid rgba(239,68,68,0.3)', paddingBottom: 8, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="pulse-red" style={{ fontSize: 18 }}>🔴</span> Security Intelligence Panel
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                      {/* Zone Breach */}
                      <div style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.5)', border: `1px solid ${latestData.zone_alert ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.3)'}`, boxShadow: latestData.zone_alert ? 'inset 0 0 15px rgba(239,68,68,0.4), 0 0 10px rgba(239,68,68,0.4)' : 'none', transition: 'all 0.3s ease' }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}><span>🚨</span> Zone Breach</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 14, fontWeight: 800, color: latestData.zone_alert ? '#ef4444' : '#22c55e' }}>
                          <span className={latestData.zone_alert ? 'pulse-red' : ''}>●</span> {latestData.zone_alert ? 'ACTIVE' : 'SAFE'}
                        </div>
                      </div>

                      {/* Crowd Alert */}
                      <div style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.5)', border: `1px solid ${latestData.alert_flag ? 'rgba(245,158,11,0.9)' : 'rgba(34,197,94,0.3)'}`, boxShadow: latestData.alert_flag ? 'inset 0 0 15px rgba(245,158,11,0.4), 0 0 10px rgba(245,158,11,0.4)' : 'none', transition: 'all 0.3s ease' }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}><span>⚠</span> Crowd Alert</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 14, fontWeight: 800, color: latestData.alert_flag ? '#f59e0b' : '#22c55e' }}>
                          <span className={latestData.alert_flag ? 'pulse-orange' : ''}>●</span> {latestData.alert_flag ? 'WARNING' : 'NORMAL'}
                        </div>
                      </div>

                      {/* Suspicious Activity */}
                      <div style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.5)', border: `1px solid ${latestData.suspicious ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.3)'}`, boxShadow: latestData.suspicious ? 'inset 0 0 15px rgba(239,68,68,0.4), 0 0 10px rgba(239,68,68,0.4)' : 'none', transition: 'all 0.3s ease' }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}><span>👀</span> Suspicious Activity</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 14, fontWeight: 800, color: latestData.suspicious ? '#ef4444' : '#22c55e' }}>
                          <span className={latestData.suspicious ? 'pulse-red' : ''}>●</span> {latestData.suspicious ? 'DETECTED' : 'SAFE'}
                        </div>
                      </div>

                      {/* Prediction */}
                      <div style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(56,189,248,0.8)', boxShadow: 'inset 0 0 15px rgba(56,189,248,0.3), 0 0 10px rgba(56,189,248,0.2)', transition: 'all 0.3s ease' }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}><span>🔮</span> 5-Min Predict</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>
                          <span className="pulse-blue">●</span> {predictedPeople} People
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (activePage === 'Live Monitoring') {
        return (
          <div style={{ ...glassCard, padding: 18 }}>
            <h3 style={{ margin: 0 }}>Live Monitoring</h3>
            <p style={{ color: '#94a3b8' }}>Real-time stream and snapshot metrics.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <div style={{ flex: 1, ...glassCard, padding: 12 }}><strong>{people}</strong> people</div>
              <div style={{ flex: 1, ...glassCard, padding: 12 }}><strong>{occupancy}%</strong> occupancy</div>
              <div style={{ flex: 1, ...glassCard, padding: 12 }}><strong>{statusText}</strong> status</div>
            </div>
          </div>
        );
      }

      if (activePage === 'Analytics') {
        const hi = history.filter(x => x.occupancy > 80).length;
        const mid = history.filter(x => x.occupancy > 45 && x.occupancy <= 80).length;
        const lo = history.filter(x => x.occupancy <= 45).length;
        return (
          <div style={{ ...glassCard, padding: 18 }}>
            <h3 style={{ margin: 0 }}>Analytics</h3>
            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              {[{ label: 'High', value: hi, color: '#ef4444' }, { label: 'Mid', value: mid, color: '#f59e0b' }, { label: 'Low', value: lo, color: '#22c55e' }].map((item) => (
                <div key={item.label} style={{ flex: 1, ...glassCard, padding: 12, borderLeft: `3px solid ${item.color}` }}>
                  <div style={{ color: item.color, fontWeight: 700 }}>{item.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (activePage === 'Alerts') {
        return (
          <div style={{ ...glassCard, padding: 18 }}>
            <h3 style={{ margin: 0 }}>Alerts History ({alerts.length})</h3>
            {alerts.length ? alerts.map((item) => (
              <div key={item.id} style={{ ...glassCard, marginTop: 10, borderLeft: `4px solid ${item.sev === 'CRITICAL' ? '#ef4444' : item.sev === 'WARNING' ? '#f59e0b' : '#22c55e'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.msg}</span>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>{item.location}</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 8, color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>{item.time}</div>
              </div>
            )) : <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 20 }}>No Data Available</div>}
            <button
              onClick={() => setAlerts([])}
              style={{ marginTop: 16, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)', background: '#0b1631', color: '#e5e7eb', cursor: 'pointer', transition: 'all 0.2s ease', fontWeight: 600 }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 10px rgba(148,163,184,0.7)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
            >Clear Alerts</button>
          </div>
        );
      }

      if (activePage === 'Reports') {
        return (
          <div style={{ ...glassCard, padding: 18 }}>
            <h3 style={{ margin: 0 }}>Reports</h3>
            <p style={{ color: '#94a3b8' }}>Historical export and trend summary.</p>
            <button
              onClick={() => window.alert('CSV export placeholder')}
              style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148, 163, 184,0.3)', background: '#0b1430', color: '#e5e7eb', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 10px rgba(148, 163, 184, 0.7)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
            >Export CSV</button>
            <div style={{ marginTop: 10, color: '#94a3b8' }}>Points: {history.length}</div>
          </div>
        );
      }

      return (
        <div style={{ ...glassCard, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400 }}>
          <h3 style={{ color: '#94a3b8', fontWeight: 500 }}>Select a valid tool from the sidebar to continue.</h3>
        </div>
      );
    };

    return (
      <div style={{ minHeight: '100vh', padding: 12, background: 'radial-gradient(circle at 10% 15%, #091b2d 0%, #020613 60%, #020613 100%)', color: '#e5e7eb', fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
          <aside style={{ ...glassCard, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ffad46', marginBottom: 10, letterSpacing: 1 }}>SMARTCROWD</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sidebarItems.map((item) => {
                  const active = item.key === activePage;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setActivePage(item.key)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 14px',
                        borderRadius: 14,
                        border: 'none',
                        color: active ? '#fff' : '#94a3b8',
                        background: active ? 'linear-gradient(135deg, rgba(255,109,1,0.3), rgba(12,57,86,0.6))' : 'transparent',
                        boxShadow: active ? '0 0 16px rgba(255,109,1,0.3)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontWeight: active ? 700 : 500
                      }}
                      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; } }}
                      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; } }}
                    >
                      <span>{item.icon} <span style={{ marginLeft: 6 }}>{item.label}</span></span>
                      {item.badge ? <span style={{ background: '#ff7d5d', borderRadius: 999, padding: '2px 8px', color: '#0f172a', fontSize: 11, fontWeight: 800 }}>{item.badge}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.5, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: tsLive ? '#34d399' : '#f97316' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tsLive ? '#34d399' : '#f97316', boxShadow: `0 0 8px ${tsLive ? '#34d399' : '#f97316'}` }}></span>
                {tsLive ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
              </div>
              <div style={{ marginTop: 6 }}>Connected Nodes: ESP32 · YOLOv8</div>
            </div>
          </aside>

          <main style={{ padding: 6 }}>{renderActivePage()}</main>
        </div>
        <style>{`
        @keyframes scanline { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        
        @keyframes pulseRedGlow {
          0% { box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.2); color: #f87171; }
          50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.8), 0 0 35px rgba(220, 38, 38, 0.5); background: rgba(239, 68, 68, 0.35); color: #fca5a5; }
          100% { box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.2); color: #f87171; }
        }
        @keyframes pulseGreenGlow {
          0% { box-shadow: 0 0 10px rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.15); color: #4ade80; }
          50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.7); background: rgba(34, 197, 94, 0.3); color: #86efac; }
          100% { box-shadow: 0 0 10px rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.15); color: #4ade80; }
        }
        
        @keyframes pulseRedText { 0% { text-shadow: 0 0 5px #ef4444; } 50% { text-shadow: 0 0 20px #ef4444, 0 0 30px #dc2626; color: #fca5a5; } 100% { text-shadow: 0 0 5px #ef4444; } }
        @keyframes pulseOrangeText { 0% { text-shadow: 0 0 5px #f59e0b; } 50% { text-shadow: 0 0 20px #f59e0b, 0 0 30px #d97706; color: #fde68a; } 100% { text-shadow: 0 0 5px #f59e0b; } }
        @keyframes pulseBlueText { 0% { text-shadow: 0 0 5px #38bdf8; } 50% { text-shadow: 0 0 20px #38bdf8, 0 0 30px #0284c7; color: #bae6fd; } 100% { text-shadow: 0 0 5px #38bdf8; } }
        
        .pulse-red-glow { border: 1px solid rgba(239, 68, 68, 0.5); animation: pulseRedGlow 1.5s infinite alternate ease-in-out; }
        .pulse-green-glow { border: 1px solid rgba(34, 197, 94, 0.5); animation: pulseGreenGlow 2s infinite alternate ease-in-out; }
        
        .pulse-red { animation: pulseRedText 1s infinite alternate; }
        .pulse-orange { animation: pulseOrangeText 1s infinite alternate; }
        .pulse-blue { animation: pulseBlueText 1.5s infinite alternate; }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.3); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.5); }
      `}</style>
      </div>
    );
  }
