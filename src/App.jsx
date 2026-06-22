import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "fitness-log-entries";
const TARGETS = { calories: 2300, protein: 160, carbs: 245, fat: 75, steps: 10000, sleep: 7.5 };
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]} ${d} ${MONTHS[m-1]}`;
}

function parseEntry(text) {
  const result = {};
  const t = text.toLowerCase();
  const wt = t.match(/(\d+\.?\d*)\s*kg/);
  if (wt) result.weight = parseFloat(wt[1]);
  const cal = t.match(/(\d{3,5})\s*(?:kcal|cal(?:ories?)?|cals?)/);
  if (cal) result.calories = parseInt(cal[1]);
  if (!result.calories) {
    const bare = t.match(/\b(1[5-9]\d\d|2[0-9]\d\d|3[0-4]\d\d)\b/);
    if (bare) result.calories = parseInt(bare[1]);
  }
  const pro = t.match(/(\d+\.?\d*)\s*g?\s*(?:protein|pro\b)/);
  if (pro) result.protein = parseFloat(pro[1]);
  if (!result.protein) {
    const short = t.match(/(\d+)p(?:\s|,|$)/);
    if (short) result.protein = parseFloat(short[1]);
  }
  const carbs = t.match(/(\d+\.?\d*)\s*g?\s*(?:carbs?|carbohydrates?)/);
  if (carbs) result.carbs = parseFloat(carbs[1]);
  const fat = t.match(/(\d+\.?\d*)\s*g?\s*fat/);
  if (fat) result.fat = parseFloat(fat[1]);
  const steps = t.match(/(\d+\.?\d*)\s*k?\s*steps?/);
  if (steps) {
    result.steps = t.match(/\d+\.?\d*k\s*steps/) ? parseFloat(steps[1]) * 1000 : parseFloat(steps[1]);
  }
  if (!result.steps) {
    const ksteps = t.match(/(\d+\.?\d*)k(?:\s|,|$)/);
    if (ksteps) result.steps = parseFloat(ksteps[1]) * 1000;
  }
  const sleep = t.match(/(\d+\.?\d*)\s*(?:hrs?|hours?)\s*(?:sleep)?/);
  if (sleep) result.sleep = parseFloat(sleep[1]);
  const sleep2 = t.match(/sleep[:\s]+(\d+\.?\d*)/);
  if (!result.sleep && sleep2) result.sleep = parseFloat(sleep2[1]);
  return result;
}

async function compressImage(base64, mediaType) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve({ base64: canvas.toDataURL("image/jpeg", 0.82).split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => resolve({ base64, mediaType });
    img.src = `data:${mediaType};base64,${base64}`;
  });
}

function Ring({ value, max, color, label, unit, size = 56 }) {
  const pct = Math.min((value || 0) / max, 1);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2533" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <div style={{ textAlign: "center", marginTop: -size + 6, height: size - 12, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#f0f4ff", lineHeight: 1 }}>
          {value != null ? (unit === "kg" ? value.toFixed(1) : Math.round(value)) : "—"}
        </div>
        {unit && unit !== "kg" && <div style={{ fontSize: 9, color: "#6b7a99" }}>{unit}</div>}
      </div>
      <div style={{ fontSize: 10, color: "#6b7a99", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function Bar({ value, target, color, label }) {
  const pct = Math.min((value || 0) / target, 1) * 100;
  const over = (value || 0) > target;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#8892aa", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: over ? "#f97316" : "#f0f4ff" }}>
          {value != null ? Math.round(value) : "—"} <span style={{ color: "#4a5568" }}>/ {target}</span>
        </span>
      </div>
      <div style={{ height: 6, background: "#1e2533", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: over ? "#f97316" : color, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function WeightSparkline({ entries }) {
  const recent = Object.entries(entries).sort(([a],[b]) => a.localeCompare(b)).slice(-14).filter(([,e]) => e.weight);
  if (recent.length < 2) return null;
  const weights = recent.map(([,e]) => e.weight);
  const min = Math.min(...weights) - 0.5, max = Math.max(...weights) + 0.5;
  const w = 280, h = 60;
  const pts = weights.map((wt, i) => {
    const x = (i / (weights.length - 1)) * (w - 20) + 10;
    const y = h - ((wt - min) / (max - min)) * (h - 10) - 5;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div style={{ margin: "16px 0 8px" }}>
      <div style={{ fontSize: 11, color: "#6b7a99", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Weight — last 14 days</div>
      <svg width={w} height={h} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke="#6ee7b7" strokeWidth={2} strokeLinejoin="round" />
        {weights.map((wt, i) => {
          const x = (i / (weights.length - 1)) * (w - 20) + 10;
          const y = h - ((wt - min) / (max - min)) * (h - 10) - 5;
          return <circle key={i} cx={x} cy={y} r={3} fill="#6ee7b7" />;
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 10, color: "#4a5568" }}>{recent[0][0]}</span>
        <span style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 700 }}>{weights[weights.length-1].toFixed(1)} kg</span>
        <span style={{ fontSize: 10, color: "#4a5568" }}>{recent[recent.length-1][0]}</span>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

export default function App() {
  const [entries, setEntries] = useState({});
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hey Fintan 👋 Log by typing or tap the camera to send a screenshot from MFP or your workout app.\n\nE.g. \"79.2kg, 2310 cals, 168p, 11k steps, 7.5hrs\"\n\nOr ask: \"where am I going wrong with my diet?\"" }
  ]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("chat");
  const messagesEnd = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setEntries(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
  }, [entries]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const todayEntry = entries[todayKey()] || {};

  function buildContext() {
    const recent = Object.entries(entries)
      .sort(([a],[b]) => b.localeCompare(a)).slice(0, 14)
      .map(([k,e]) => `${formatDate(k)}: weight=${e.weight||"?"}kg, cals=${e.calories||"?"}, protein=${e.protein||"?"}g, carbs=${e.carbs||"?"}g, fat=${e.fat||"?"}g, steps=${e.steps||"?"}, sleep=${e.sleep||"?"}hrs, training=${e.training||"rest"}${e.lifts?.length ? ", lifts="+e.lifts.map(l=>`${l.exercise} ${l.weight}kg x${l.reps}`).join("|") : ""}`);
    return recent.length ? recent.join("\n") : "No previous entries yet.";
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPendingImage({ base64: dataUrl.split(",")[1], mediaType: file.type || "image/jpeg", previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function send() {
    const text = input.trim();
    if (!text && !pendingImage) return;

    const userMessageText = text || "📷 Screenshot";
    const newUserMsg = { role: "user", text: userMessageText, image: pendingImage?.previewUrl || null };
    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setInput("");
    const imageToSend = pendingImage;
    setPendingImage(null);
    setLoading(true);

    const systemPrompt = `You are a direct, knowledgeable fitness and nutrition coach for Fintan — Irish secondary school teacher, CrossFit 4-5x/week. Daily targets: ${TARGETS.calories} kcal, ${TARGETS.protein}g protein, ${TARGETS.carbs}g carbs, ${TARGETS.fat}g fat, ${TARGETS.steps} steps, 7.5hrs sleep. Fat loss plan, 300 kcal deficit, goal August 10th.

Recent log:
${buildContext()}

SCREENSHOT INSTRUCTIONS:
- MFP food diary: read every food item listed, give specific actionable feedback on meal timing, food quality, protein spread across meals, what to swap or improve. Be a coach who actually read the diary, not just the totals.
- Workout/WOD screenshot: read the full workout description and log it exactly as written (movements, weights, reps, notes). Don't summarise to just one word.
- If you see individual lifts with weights and reps (e.g. squat 122.5kg 6RM), extract each one.

TEXT INSTRUCTIONS:
- If user describes a workout or lift, log the full description as training, not just a keyword.
- Extract any strength data mentioned (exercise name, weight, reps/sets).

RESPONSE: be direct, 2-5 sentences normally, more for detailed diet feedback. No sycophancy.

CRITICAL — always end your reply with exactly this line, no markdown, fill in what you found (null for anything not present). For lifts use array format:
LOGDATA:{"calories":null,"protein":null,"carbs":null,"fat":null,"steps":null,"sleep":null,"weight":null,"training":null,"lifts":null}

lifts format example: [{"exercise":"Squat","weight":122.5,"reps":6},{"exercise":"Bench","weight":90,"reps":5}]`;

    try {
      let userContent;
      if (imageToSend) {
        const compressed = await compressImage(imageToSend.base64, imageToSend.mediaType);
        userContent = [
          { type: "image", source: { type: "base64", media_type: compressed.mediaType, data: compressed.base64 } },
          { type: "text", text: text || "Read this screenshot, extract any data to log, and give me feedback." }
        ];
      } else {
        userContent = text;
      }

      const apiMessages = [
        ...newMessages.slice(0, -1).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
        { role: "user", content: userContent }
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: apiMessages })
      });

      const data = await res.json();
      const fullReply = data.content?.[0]?.text || "";

      if (!fullReply) {
        setMessages(prev => [...prev, { role: "assistant", text: "Something went wrong — try again." }]);
        setLoading(false);
        return;
      }

      // Parse LOGDATA
      const logMatch = fullReply.match(/LOGDATA:(\{.+\})/);
      if (logMatch) {
        try {
          const parsed = JSON.parse(logMatch[1]);
          const cleaned = Object.fromEntries(Object.entries(parsed).filter(([,v]) => v !== null));
          if (Object.keys(cleaned).length > 0) {
            const key = todayKey();
            setEntries(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...cleaned } }));
          }
        } catch {}
      }

      // Belt-and-braces local parse for text
      if (!imageToSend && text) {
        const localParsed = parseEntry(text);
        if (Object.keys(localParsed).length > 0) {
          const key = todayKey();
          setEntries(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...localParsed } }));
        }
      }

      const displayReply = fullReply.replace(/\nLOGDATA:\{.+\}/, "").replace(/LOGDATA:\{.+\}/, "").trim();
      setMessages(prev => [...prev, { role: "assistant", text: displayReply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", text: `Error: ${err.message}. Try again.` }]);
    }
    setLoading(false);
  }

  function getWeekEntries() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0, Tue=1...
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - daysSinceMonday + i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      result.push({ key, label: DAYS[d.getDay()], entry: entries[key] || null });
    }
    return result;
  }

  function exportCSV() {
    const rows = [["Date","Weight","Calories","Protein","Carbs","Fat","Steps","Sleep","Training","Lifts"]];
    Object.entries(entries).sort(([a],[b]) => a.localeCompare(b)).forEach(([key,e]) => {
      rows.push([key, e.weight??"", e.calories??"", e.protein??"", e.carbs??"", e.fat??"", e.steps??"", e.sleep??"", e.training??"", e.lifts ? e.lifts.map(l=>`${l.exercise} ${l.weight}kg x${l.reps}`).join("; ") : ""]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `fintrack-${todayKey()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const week = getWeekEntries();
  const weekWithData = week.filter(w => w.entry);
  const avgWeight = weekWithData.filter(w => w.entry?.weight).length
    ? (weekWithData.filter(w => w.entry?.weight).reduce((s,w) => s + w.entry.weight, 0) / weekWithData.filter(w => w.entry?.weight).length).toFixed(1)
    : null;
  const canSend = !loading && (input.trim() || pendingImage);

  return (
    <div style={{ height: "100vh", background: "#0d111a", fontFamily: "'Inter', -apple-system, sans-serif", color: "#f0f4ff", display: "flex", flexDirection: "column", maxWidth: 420, margin: "0 auto", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: "16px 20px 0", borderBottom: "1px solid #1e2533" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>FINTRACK</div>
            <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 600 }}>{formatDate(todayKey())}</div>
          </div>
          {avgWeight && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#6ee7b7", letterSpacing: "-0.03em" }}>{avgWeight}<span style={{ fontSize: 12, fontWeight: 600, color: "#4a5568" }}>kg</span></div>
              <div style={{ fontSize: 10, color: "#4a5568", fontWeight: 600 }}>avg this week</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", paddingBottom: 14 }}>
          <Ring value={todayEntry.calories} max={TARGETS.calories} color="#818cf8" label="Cals" unit="kcal" />
          <Ring value={todayEntry.protein} max={TARGETS.protein} color="#f472b6" label="Protein" unit="g" />
          <Ring value={todayEntry.steps} max={TARGETS.steps} color="#34d399" label="Steps" />
          <Ring value={todayEntry.sleep} max={9} color="#fb923c" label="Sleep" unit="hrs" />
          {todayEntry.weight && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, justifyContent: "flex-end", paddingBottom: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#6ee7b7" }}>{todayEntry.weight.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: "#6b7a99", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>kg</div>
            </div>
          )}
        </div>
        {/* Tabs */}
        <div style={{ display: "flex" }}>
          {["chat", "week"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1, padding: "8px 0", background: "none", border: "none",
              borderBottom: `2px solid ${view === v ? "#818cf8" : "transparent"}`,
              color: view === v ? "#818cf8" : "#4a5568", fontSize: 13, fontWeight: 700,
              cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", transition: "all 0.2s"
            }}>{v === "chat" ? "Log / Chat" : "This Week"}</button>
          ))}
        </div>
      </div>

      {/* Chat view */}
      {view === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12, display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.image && (
                  <div style={{ marginBottom: 4, borderRadius: 12, overflow: "hidden", maxWidth: "60%", border: "1px solid #2a3450" }}>
                    <img src={m.image} alt="screenshot" style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "cover" }} />
                  </div>
                )}
                {m.text && (
                  <div style={{
                    maxWidth: "80%", padding: "10px 14px",
                    background: m.role === "user" ? "#818cf8" : "#1a2035",
                    borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    fontSize: 14, lineHeight: 1.5, color: m.role === "user" ? "#fff" : "#d1d9f0",
                    whiteSpace: "pre-wrap"
                  }}>{m.text}</div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 4, padding: "10px 14px", background: "#1a2035", borderRadius: "18px 18px 18px 4px", width: "fit-content" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#4a5568", animation: `pulse 1.2s ${i*0.2}s infinite` }} />)}
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {pendingImage && (
            <div style={{ flexShrink: 0, padding: "8px 12px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={pendingImage.previewUrl} alt="preview" style={{ height: 72, width: 72, objectFit: "cover", borderRadius: 10, border: "1px solid #2a3450", display: "block" }} />
                <button onClick={() => setPendingImage(null)} style={{ position: "absolute", top: -6, right: -6, background: "#374151", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9ca3af", padding: 0 }}>
                  <XIcon />
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#4a5568", paddingTop: 4 }}>Screenshot ready — add a note or just send</div>
            </div>
          )}

          <div style={{ flexShrink: 0, padding: "8px 12px 16px", borderTop: "1px solid #1e2533", display: "flex", gap: 8, alignItems: "center" }}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={loading} style={{
              background: "#1a2035", border: "1px solid #2a3450", borderRadius: "50%",
              width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: pendingImage ? "#6ee7b7" : "#4a5568", flexShrink: 0,
              opacity: loading ? 0.4 : 1, transition: "color 0.2s"
            }}>
              <CameraIcon />
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder={pendingImage ? "Add a note (optional)..." : "79.2kg, 2310 cals, 168p, 11k steps..."}
              style={{ flex: 1, background: "#1a2035", border: "1px solid #2a3450", borderRadius: 24, padding: "10px 16px", fontSize: 14, color: "#f0f4ff", outline: "none" }}
            />
            <button onClick={send} disabled={!canSend} style={{
              background: "#818cf8", border: "none", borderRadius: "50%",
              width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", opacity: !canSend ? 0.4 : 1, transition: "opacity 0.2s", flexShrink: 0
            }}>
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      {/* Week view */}
      {view === "week" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <WeightSparkline entries={entries} />
          {weekWithData.length > 0 && (
            <div style={{ background: "#111827", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Week average</div>
              {["calories","protein","steps"].map(key => {
                const vals = weekWithData.filter(w => w.entry?.[key]).map(w => w.entry[key]);
                const avg = vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
                const colors = { calories: "#818cf8", protein: "#f472b6", steps: "#34d399" };
                const labels = { calories: "Calories", protein: "Protein (g)", steps: "Steps" };
                return <Bar key={key} value={avg} target={TARGETS[key]} color={colors[key]} label={labels[key]} />;
              })}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Daily breakdown</div>
          {week.map(({ key, label, entry }) => (
            <div key={key} style={{ background: key === todayKey() ? "#14213a" : "#111827", border: `1px solid ${key === todayKey() ? "#2a3a6a" : "#1e2533"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: entry ? 6 : 0 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: key === todayKey() ? "#818cf8" : "#f0f4ff" }}>{label}</span>
                {entry?.weight ? <span style={{ fontSize: 14, fontWeight: 700, color: "#6ee7b7" }}>{entry.weight.toFixed(1)} kg</span> : <span style={{ fontSize: 12, color: "#2a3450" }}>no entry</span>}
              </div>
              {entry?.training && (
                <div style={{ fontSize: 11, color: "#6b7a99", marginBottom: 6, fontStyle: "italic", lineHeight: 1.4 }}>{entry.training}</div>
              )}
              {entry?.lifts?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {entry.lifts.map((l, i) => (
                    <span key={i} style={{ fontSize: 11, background: "#1a2d1a", color: "#6ee7b7", padding: "2px 8px", borderRadius: 20 }}>
                      {l.exercise} {l.weight}kg ×{l.reps}
                    </span>
                  ))}
                </div>
              )}
              {entry && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    { k: "calories", label: "kcal", color: "#818cf8", target: TARGETS.calories },
                    { k: "protein", label: "g pro", color: "#f472b6", target: TARGETS.protein },
                    { k: "steps", label: "steps", color: "#34d399", target: TARGETS.steps },
                    { k: "sleep", label: "hrs", color: "#fb923c", target: TARGETS.sleep },
                  ].map(({ k, label: lbl, color, target }) => {
                    const val = entry[k];
                    if (val == null) return null;
                    const over = val > target;
                    return (
                      <div key={k} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: over && k !== "steps" && k !== "sleep" ? "#f97316" : color }}>
                          {k === "steps" ? (val >= 1000 ? `${(val/1000).toFixed(1)}k` : val) : val}
                        </span>
                        <span style={{ fontSize: 10, color: "#4a5568" }}>{lbl}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <button onClick={exportCSV} style={{ width: "100%", marginTop: 8, padding: "10px 0", background: "none", border: "1px solid #2a3450", borderRadius: 8, color: "#4a5568", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Export CSV
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
        input::placeholder { color: #4a5568; }
      `}</style>
    </div>
  );
}
