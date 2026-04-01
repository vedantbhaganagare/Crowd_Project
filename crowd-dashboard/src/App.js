import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

export default function App() {
  const MAX = 15;
  const [people, setPeople] = useState(10);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tsStatus, setTsStatus] = useState("Initializing...");
  const [tsLive, setTsLive] = useState(false);
  const [activePage, setActivePage] = useState("Dashboard");
  const [timeFilter, setTimeFilter] = useState("1H");

  const occupancy = Math.min(100, Math.max(0, Math.round((people / MAX) * 100)));
  const statusText = occupancy >= 95 ? "CRITICAL" : occupancy >= 90 ? "WARNING" : occupancy > 80 ? "HIGH" : occupancy > 45 ? "MODERATE" : "SAFE";

  const statusColor = (occ) => occ >= 95 ? "#ff4f4f" : occ >= 90 ? "#f59e0b" : occ > 80 ? "#f97316" : occ > 45 ? "#22c55e" : "#10b981";
  const clampP = (n) => Math.min(MAX, Math.max(0, n));
  const [operationMode, setOperationMode] = useState("Safe Mode");
  const [feedHover, setFeedHover] = useState(false);
  const [flowHover, setFlowHover] = useState(false);

  const TS_CHANNEL = "3320572";
  const TS_READ_KEY = "GVJ80AY5DZUYI6J3";
  const TS_WRITE_KEY = "J61HN6RR8G894U0M";
  const TS_FETCH_URL = `https://api.thingspeak.com/channels/${TS_CHANNEL}/feeds.json?api_key=${TS_READ_KEY}&results=20`;

  const fetchThingSpeak = async () => {
    try {
      setTsStatus("Fetching from ThingSpeak...");
      const res = await fetch(TS_FETCH_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const feeds = data.feeds || [];
      if (!feeds.length) {
        setTsStatus("No data from ThingSpeak");
        setTsLive(false);
        return;
      }
      const parsed = feeds.slice(-20).map((f) => {
        const p = clampP(parseInt(f.field1) || 0);
        return {
          time: f.created_at ? new Date(f.created_at).toLocaleTimeString() : new Date().toLocaleTimeString(),
          people: p,
          occupancy: Math.round((p / MAX) * 100)
        };
      });
      const latest = parsed[parsed.length - 1];
      setHistory(parsed);
      setPeople(latest.people);
      setTsStatus(`Live · #${data.channel?.last_entry_id ?? '?'} `);
      setTsLive(true);
      const newAlerts = [];
      if (latest.occupancy >= 95) newAlerts.push({ msg: '🔥 HIGH CROWD DETECTED', sev: 'CRITICAL', location: 'Central Hub', time: 'Now' });
      else if (latest.occupancy >= 90) newAlerts.push({ msg: '⚠ MID CROWD DETECTED', sev: 'WARNING', location: 'South Lobby', time: 'Now' });
      else newAlerts.push({ msg: '✅ CLEARANCE NOTIFIED', sev: 'SAFE', location: 'West Plaza', time: 'Now' });
      setAlerts(newAlerts);
    } catch (err) {
      setTsStatus(`TS fetch failed: ${err.message}`);
      setTsLive(false);
    }
  };

  const pushThingSpeak = async (count) => {
    try {
      setTsStatus("Pushing to ThingSpeak...");
      const occ = Math.round((count / MAX) * 100);
      const url = `https://api.thingspeak.com/update?api_key=${TS_WRITE_KEY}&field1=${count}&field2=${occ}`;
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok || Number(text) === 0) throw new Error(`Write failed (${text})`);
      setTsStatus(`Write success #${text}`);
    } catch (err) {
      setTsStatus(`TS write failed: ${err.message}`);
    }
  };

  const adjustPeople = (delta) => {
    setPeople((prev) => {
      const next = clampP(prev + delta);
      setHistory((prevH) => [...prevH.slice(-19), { time:new Date().toLocaleTimeString(), people: next, occupancy: Math.round((next / MAX) * 100) }]);
      return next;
    });
  };

  const applyMode = (mode) => {
    setOperationMode(mode);
    if (mode === "Emergency Mode") {
      setAlerts([{ msg: '🚨 EMERGENCY MODE ACTIVATED', sev: 'CRITICAL', location: 'All Zones', time: 'Now' }]);
    } else if (mode === "Alert Mode") {
      setAlerts([{ msg: '⚠ ALERT MODE ACTIVATED', sev: 'WARNING', location: 'Monitored Zone', time: 'Now' }]);
    } else {
      setAlerts([{ msg: '✅ SAFE MODE ACTIVE', sev: 'SAFE', location: 'Monitoring OK', time: 'Now' }]);
    }
  };

  const clearAlerts = () => setAlerts([]);
  const fireFetchNow = () => { fetchThingSpeak(); setTsStatus('Manual fetch triggered'); };
  const firePushNow = () => { pushThingSpeak(people); setTsStatus('Manual push triggered'); };

  const applyHover = (shadow) => (e) => { e.currentTarget.style.boxShadow = shadow; };
  const resetHover = (e) => { e.currentTarget.style.boxShadow = 'none'; };

  const handleZoom = () => setTsStatus('Zoom engaged (simulated camera focus)');
  const handleScreenshot = () => {
    setTsStatus('Screenshot captured.');
    setAlerts((prev) => [...prev, { msg: '📸 Snapshot saved', sev: 'SAFE', location: 'Live Feed', time: new Date().toLocaleTimeString() }]);
  };
  const handleFullscreen = () => setTsStatus('Fullscreen view toggled (simulated).');

  useEffect(() => {
    fetchThingSpeak();
    const id = setInterval(fetchThingSpeak, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!tsLive) {
        setPeople((prev) => {
          const next = clampP(prev + (Math.random() > 0.5 ? 1 : -1));
          const occ = Math.round((next / MAX) * 100);
          setHistory((prevH) => [...prevH.slice(-19), { time: new Date().toLocaleTimeString(), people: next, occupancy: occ }]);
          return next;
        });
      }
    }, 3500);
    return () => clearInterval(id);
  }, [tsLive]);

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
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
          <div style={{ display: 'grid', gap: 14 }}>
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
              <div style={{ position: 'relative', borderRadius: 16, height: 280, overflow: 'hidden', border: '1px solid rgba(74, 222, 128, 0.18)', background: 'linear-gradient(130deg, #091323 0%, #03102a 100%)' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${rawPhotoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.22, filter: 'brightness(0.55)', zIndex: 0 }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(42, 180, 255,0.08), rgba(42, 180, 255,0.001) 50%, rgba(42, 180, 255,0.08))', animation: 'scanline 4s linear infinite', zIndex: 1 }} />
                <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2 }}>
                  {[1,2,3].map((node) => (
                    <div key={node} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid rgba(14, 165, 233,0.3)', borderRadius: 10, padding: '5px 8px', color: '#cbd5e1', fontSize: 11, background: 'rgba(0,0,0,0.25)' }}>
                      <span>PERSON {node}</span>
                      <span>{90 + Math.floor(Math.random()*8)}% CONF</span>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'absolute', bottom: 12, left: 14, display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleZoom}
                    style={{ border: '1px solid rgba(147, 197, 253, 0.5)', background: 'rgba(7, 19, 40, 0.75)', color: '#dbeafe', fontSize: 11, borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.7)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                  >Zoom</button>
                  <button
                    onClick={handleScreenshot}
                    style={{ border: '1px solid rgba(147, 197, 253, 0.5)', background: 'rgba(7, 19, 40, 0.75)', color: '#dbeafe', fontSize: 11, borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.7)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                  >Screenshot</button>
                  <button
                    onClick={handleFullscreen}
                    style={{ border: '1px solid rgba(147, 197, 253, 0.5)', background: 'rgba(7, 19, 40, 0.75)', color: '#dbeafe', fontSize: 11, borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 12px rgba(255, 174, 0, 0.7)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                  >Fullscreen</button>
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
                  {['1H','1D','1W'].map((range) => (
                    <button
                      key={range}
                      onClick={() => setTimeFilter(range)}
                      style={{ border: 'none', background: timeFilter===range ? 'linear-gradient(90deg, #fb923c, #f97316)' : 'rgba(56, 189, 248, 0.18)', color: '#f8fafc', fontSize: 11, borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}
                      onMouseEnter={applyHover('0 0 10px rgba(56, 189, 248, 0.7)')}
                      onMouseLeave={resetHover}
                    >{range}</button>
                  ))}
                </div>
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width='100%' height='100%'>
                  <LineChart data={filteredHistory} margin={{ top: 0, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke='rgba(56, 189, 248, 0.15)' />
                    <XAxis dataKey='time' stroke='#9ca3af' tick={{ fontSize: 11 }} />
                    <YAxis stroke='#9ca3af' tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'rgba(7, 16, 34, 0.96)', border: '1px solid rgba(97, 156, 255, 0.45)', color: '#fff' }} />
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

          <div style={{ display: 'grid', gap: 14 }}>
            <div
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.65)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)'; }}
              style={{ ...glassCard, padding: 14, background: 'rgba(8, 18, 44, 0.7)', border: '1px solid rgba(255, 81, 81, 0.2)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin:0, color:'#f9fafb' }}>CRITICAL ALERTS</h4>
                <span style={{ color:'#94a3b8', fontSize:11 }}>{alerts.length} active</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.length ? alerts.map((item, i) => (
                  <div key={`${item.msg}-${i}`} style={{ background: item.sev==='CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : item.sev==='WARNING' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.15)', borderLeft: `4px solid ${item.sev==='CRITICAL' ? '#ef4444' : item.sev==='WARNING' ? '#f59e0b' : '#22c55e'}`, borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>{item.msg}</div>
                    <div style={{ fontSize: 11, color: '#a5b4cd' }}>{item.location} · {item.time}</div>
                  </div>
                )) : <div style={{ color: '#94a3b8', fontSize: 12 }}>No current alerts.</div>}
              </div>
            </div>

            <div
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 162, 0, 0.65)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)'; }}
              style={{ ...glassCard, padding: 14, background: 'rgba(8, 18, 44, 0.7)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
            >
              <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>CAPACITY VISUAL</div>
              <div style={{ height: 14, borderRadius: 999, background: 'linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)' }}><div style={{ width: `${occupancy}%`, height: '100%', borderRadius: 999, background: 'rgba(255,255,255,0.14)' }} /></div>
              <div style={{ marginTop: 8, display:'flex', justifyContent:'space-between', color:'#9ca3af', fontSize:11 }}><span>0%</span><span>{capacityInfo.label}</span><span>100%</span></div>
              <div style={{ marginTop: 8, color: capacityInfo.color, fontWeight: 700 }}>STATUS: {statusText}</div>
            </div>

            <div
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.65)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)'; }}
              style={{ ...glassCard, padding: 14, background: 'rgba(8, 18, 44, 0.7)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
            >
              <h4 style={{ margin: 0, color: '#f8fafc' }}>SYSTEM METRICS</h4>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background:'rgba(11,27,52,0.7)', padding:8, borderRadius:10 }}><small>ESP32</small><div style={{ fontWeight:700, color: tsLive ? '#22c55e' : '#f97316' }}>{tsLive ? 'Connected' : 'Offline'}</div></div>
                <div style={{ background:'rgba(11,27,52,0.7)', padding:8, borderRadius:10 }}><small>AI Accuracy</small><div style={{ fontWeight:700 }}>94.2%</div></div>
                <div style={{ background:'rgba(11,27,52,0.7)', padding:8, borderRadius:10 }}><small>Latency</small><div style={{ fontWeight:700 }}>342ms</div></div>
              </div>
            </div>

            <div
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.65)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)'; }}
              style={{ ...glassCard, padding: 14, background: 'rgba(8, 18, 44, 0.7)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
            >
              <h4 style={{ margin:0, color:'#f8fafc' }}>SMART CONTROL PANEL</h4>
              <div style={{ margin:'10px 0', borderRadius: 999, border:'1px solid rgba(148,163,184,0.2)', padding:'12px', display:'flex', justifyContent:'center', alignItems:'center' }}>Crowd Density</div>
              <div style={{ display:'flex', gap: 8 }}>
                {['Safe Mode','Alert Mode','Emergency Mode'].map((text) => (
                  <button
                    key={text}
                    onClick={() => applyMode(text)}
                    style={{
                      flex:1,
                      border:'1px solid rgba(148,163,184,0.2)',
                      borderRadius:8,
                      background: operationMode===text ? 'linear-gradient(90deg,#2563eb,#38bdf8)' : 'rgba(6, 12, 26,0.75)',
                      color:'#e5e7eb',
                      padding:'6px',
                      cursor:'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow='0 0 10px rgba(56, 189, 248,0.8)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow='none'}
                  >{text}</button>
                ))}
              </div>
              <div style={{ marginTop: 8, color:'#a5b4cc', fontSize: 13 }}>Mode: {operationMode}</div>
              <div style={{ marginTop:8, color:'#94a3b8', fontSize:11 }}>AI Assistant: <span style={{color:'#38bdf8'}}>Voice Active</span></div>
              <div style={{ marginTop:12, display:'flex', gap:8 }}>
                <div style={{ flex: 1, border:'1px solid rgba(120,179,255,0.35)', borderRadius:8, background:'#0f2042', color:'#e2e8f0', padding:'8px', textAlign:'center' }}>Live update from ThingSpeak</div>
              </div>
              <div style={{ marginTop:8, color:'#a5b4cc', fontSize: 13 }}>Crowd updates are now synced automatically from remote sensors, no manual increment/decrement needed.</div>
              <div style={{ marginTop:12, display:'flex', gap:8 }}>
                <button
                  onClick={fireFetchNow}
                  style={{ flex:1, border:'1px solid rgba(99,102,241,0.35)', borderRadius:8, background:'#0f1942', color:'#c7d2fe', padding:'8px', cursor:'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow='0 0 10px rgba(99,102,241,0.85)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow='none'}
                >Fetch Now</button>
                <button
                  onClick={firePushNow}
                  style={{ flex:1, border:'1px solid rgba(20,184,166,0.35)', borderRadius:8, background:'#042027', color:'#a7f3d0', padding:'8px', cursor:'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow='0 0 10px rgba(20,184,166,0.85)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow='none'}
                >Push Now</button>
                <button
                  onClick={clearAlerts}
                  style={{ flex:1, border:'1px solid rgba(148,163,184,0.35)', borderRadius:8, background:'#0f1632', color:'#cbd5e1', padding:'8px', cursor:'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow='0 0 10px rgba(148,163,184,0.85)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow='none'}
                >Clear Alerts</button>
              </div>
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
          <h3 style={{ margin: 0 }}>Alerts</h3>
          {alerts.map((item, i) => (
            <div key={`${item.msg}-${i}`} style={{ ...glassCard, marginTop: 10, borderLeft: `4px solid ${item.sev === 'CRITICAL' ? '#ef4444' : item.sev === 'WARNING' ? '#f59e0b' : '#22c55e'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{item.msg}</span><span style={{ color: '#94a3b8', fontSize: 11 }}>{item.location} · {item.time}</span>
            </div>
          ))}
          <button
            onClick={() => setAlerts([])}
            style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)', background: '#0b1631', color: '#e5e7eb', cursor: 'pointer' }}
            onMouseEnter={applyHover('0 0 10px rgba(148,163,184,0.85)')}
            onMouseLeave={resetHover}
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
            style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148, 163, 184,0.3)', background: '#0b1430', color: '#e5e7eb', cursor: 'pointer' }}
            onMouseEnter={applyHover('0 0 10px rgba(148, 163, 184, 0.85)')}
            onMouseLeave={resetHover}
          >Export CSV</button>
          <div style={{ marginTop: 10, color: '#94a3b8' }}>Points: {history.length}</div>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ minHeight: '100vh', padding: 12, background: 'radial-gradient(circle at 10% 15%, #091b2d 0%, #020613 60%, #020613 100%)', color: '#e5e7eb', fontFamily: 'Inter, Poppins, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
        <aside style={{ ...glassCard, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ffad46', marginBottom: 10 }}>SMARTCROWD</div>
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
                      padding: '10px 12px',
                      borderRadius: 14,
                      border: 'none',
                      color: active ? '#fff' : '#94a3b8',
                      background: active ? 'linear-gradient(135deg, rgba(255,109,1,0.3), rgba(12,57,86,0.6))' : 'transparent',
                      boxShadow: active ? '0 0 16px rgba(255,109,0.3)' : 'none',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={applyHover('0 0 12px rgba(58,190,255,0.6)')}
                    onMouseLeave={(e) => { if (!active) resetHover(e) }}
                  >
                    <span>{item.icon} {item.label}</span>
                    {item.badge ? <span style={{ background: '#ff7d5d', borderRadius: 999, padding: '0 6px', color: '#0f172a', fontSize: 11 }}>{item.badge}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: tsLive ? '#22c55e' : '#f97316' }}></span>{tsLive ? 'Online' : 'Offline'}</div>
            <div>Connected: ESP32 · YOLOv8</div>
          </div>
        </aside>

        <main style={{ padding: 6 }}>{renderActivePage()}</main>
      </div>
      <style>{`@keyframes scanline { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
}