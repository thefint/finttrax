import { useState, useMemo } from "react";

const COMMON_LIFTS = [
  "Back squat","Front squat","Overhead squat",
  "Deadlift","Sumo deadlift","Romanian deadlift",
  "Bench press","Strict press","Push press","Push jerk","Split jerk",
  "Clean","Power clean","Hang clean","Clean & jerk",
  "Snatch","Power snatch","Hang snatch",
  "Thruster","Bent-over row","Hip thrust","Weighted pull-up",
];
const OTHER = "__other__";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Competition bumper plates for a 20 kg bar: [kg, colour, height]
const PLATES = [[25,"#ef4444",30],[20,"#3b82f6",30],[15,"#facc15",27],[10,"#22c55e",24],[5,"#e5e7eb",19],[2.5,"#ef4444",15],[1.25,"#9ca3af",12]];

const C = {
  card: "#111827", line: "#1e2533", input: "#1a2035", inputLine: "#2a3450",
  text: "#f0f4ff", muted: "#6b7a99", dim: "#4a5568", accent: "#60a5fa", accentSoft: "#16233d",
  up: "#6ee7b7", down: "#f97316", pr: "#facc15",
};

const pad = n => String(n).padStart(2, "0");
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y,m,d] = k.split("-").map(Number); return new Date(y, m-1, d); };
const shortDate = k => { const d = fromKey(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtKg = w => String(Math.round(w * 10) / 10);
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30)); // Epley

function weekStart(key) {
  const d = fromKey(key);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return toKey(d);
}
function isoWeek(key) {
  const d = fromKey(key);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - jan4) / 864e5 - 3 + (jan4.getDay() + 6) % 7) / 7);
}
function deltaText(d) {
  if (Math.abs(d) < 0.01) return "no change";
  return `${d > 0 ? "+" : "−"}${fmtKg(Math.abs(d))} kg`;
}
const deltaColor = d => (d == null || Math.abs(d) < 0.01 ? C.muted : d > 0 ? C.up : C.down);

function platesPerSide(w) {
  let side = (w - 20) / 2;
  const used = [];
  for (const [kg] of PLATES) while (side >= kg - 1e-9) { used.push(kg); side -= kg; }
  return { used, leftover: side };
}

// Flatten entries[date].lifts into one list, grouping lift names case-insensitively.
function flattenLifts(entries) {
  const names = new Map();
  const out = [];
  for (const [date, e] of Object.entries(entries)) {
    (e?.lifts || []).forEach((l, idx) => {
      const weight = parseFloat(l.weight), reps = parseInt(l.reps, 10) || 1;
      if (!l.exercise || !(weight > 0)) return;
      const raw = String(l.exercise).trim().replace(/\s+/g, " ");
      const k = raw.toLowerCase();
      if (!names.has(k)) names.set(k, raw.charAt(0).toUpperCase() + raw.slice(1));
      out.push({ date, idx, key: k, weight, reps, sets: parseInt(l.sets, 10) || 1 });
    });
  }
  for (const r of out) r.name = names.get(r.key);
  return out;
}

function weeklySeries(list) {
  const by = new Map();
  for (const r of list) {
    const w = weekStart(r.date);
    const cur = by.get(w) || { week: w, top: 0, e1: 0 };
    cur.top = Math.max(cur.top, r.weight);
    cur.e1 = Math.max(cur.e1, e1rm(r.weight, r.reps));
    by.set(w, cur);
  }
  return [...by.values()].sort((a, b) => a.week.localeCompare(b.week));
}

// A lift is a PR when it beats every earlier entry of the same lift.
function prSet(rows) {
  const ids = new Set();
  const byLift = new Map();
  for (const r of rows) { if (!byLift.has(r.key)) byLift.set(r.key, []); byLift.get(r.key).push(r); }
  for (const list of byLift.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.idx - b.idx);
    let best = -1;
    list.forEach((r, i) => { if (r.weight > best) { if (i > 0) ids.add(`${r.date}#${r.idx}`); best = r.weight; } });
  }
  return ids;
}

const label = { fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" };
const inputStyle = { width: "100%", background: C.input, border: `1px solid ${C.inputLine}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 };

function PlateBar({ weight }) {
  const w = parseFloat(weight);
  if (!(w >= 20)) return <div style={{ height: 30 }} />;
  if (w === 20) return <div style={{ fontSize: 11, color: C.muted, height: 30, display: "flex", alignItems: "center" }}>Empty 20 kg bar</div>;
  const { used, leftover } = platesPerSide(w);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 30 }}>
      <div style={{ width: 20, height: 5, background: C.muted, borderRadius: 2 }} />
      {used.map((kg, i) => {
        const [, color, h] = PLATES.find(p => p[0] === kg);
        return <div key={i} title={`${kg} kg`} style={{ width: kg >= 10 ? 7 : 5, height: h, background: color, borderRadius: 2 }} />;
      })}
      <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
        {used.join(" + ")} kg a side{leftover > 0.01 ? ` (+${fmtKg(leftover)})` : ""}
      </span>
    </div>
  );
}

function Sparkline({ series }) {
  const W = 120, H = 26;
  if (series.length < 2) return <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}><circle cx={W - 4} cy={H / 2} r={3} fill={C.accent} /></svg>;
  const vals = series.map(s => s.top), lo = Math.min(...vals), span = Math.max(...vals) - lo || 1;
  const pts = vals.map((v, i) => [4 + i * (W - 8) / (vals.length - 1), H - 4 - (v - lo) / span * (H - 8)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const end = pts[pts.length - 1];
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={`${d} L${end[0]} ${H} L4 ${H} Z`} fill={C.accentSoft} />
      <path d={d} fill="none" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={end[0]} cy={end[1]} r={3} fill={C.accent} />
    </svg>
  );
}

function niceStep(span) {
  const raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

function ProgressChart({ series }) {
  const W = 360, H = 180, L = 36, R = 22, T = 18, B = 26;
  const vals = series.flatMap(s => [s.top, s.e1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 10) { lo -= 5; hi += 5; }
  const step = niceStep(hi - lo);
  lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step;
  const x = i => (series.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (series.length - 1));
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  const every = Math.ceil(series.length / 5);
  const line = k => series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={C.line} />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={C.dim}>{fmtKg(v)}</text>
        </g>
      ))}
      {series.map((p, i) => (i % every === 0 || i === series.length - 1) && (
        <text key={p.week} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={C.dim}>{shortDate(p.week)}</text>
      ))}
      {series.length > 1 && <path d={`${line("top")} L${x(series.length - 1)} ${H - B} L${x(0)} ${H - B} Z`} fill={C.accentSoft} opacity={0.8} />}
      <path d={line("e1")} fill="none" stroke={C.muted} strokeWidth={1.5} strokeDasharray="4 4" />
      <path d={line("top")} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinejoin="round" />
      {series.map((p, i) => {
        const isLast = i === series.length - 1;
        return (
          <circle key={p.week} cx={x(i)} cy={y(p.top)} r={isLast ? 4.5 : 3} fill={isLast ? C.accent : C.card} stroke={C.accent} strokeWidth={2}>
            <title>{`Week of ${shortDate(p.week)}: ${fmtKg(p.top)} kg (est. 1RM ${Math.round(p.e1)})`}</title>
          </circle>
        );
      })}
      <text x={Math.min(x(series.length - 1), W - R)} y={y(last.top) - 9} textAnchor="end" fontSize={11} fontWeight={700} fill={C.text}>{fmtKg(last.top)} kg</text>
    </svg>
  );
}

export default function Lifts({ entries, onAddLift, onDeleteLift }) {
  const todayKey = toKey(new Date());
  const [form, setForm] = useState({ choice: "", custom: "", weight: "", reps: "5", sets: "1", date: todayKey });
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const rows = useMemo(() => flattenLifts(entries), [entries]);
  const prs = useMemo(() => prSet(rows), [rows]);

  const byLift = useMemo(() => {
    const m = new Map();
    for (const r of rows) { if (!m.has(r.key)) m.set(r.key, []); m.get(r.key).push(r); }
    return m;
  }, [rows]);

  // Most recently trained first
  const liftKeys = [...byLift.keys()].sort((a, b) => {
    const la = byLift.get(a).reduce((m, r) => (r.date > m ? r.date : m), "");
    const lb = byLift.get(b).reduce((m, r) => (r.date > m ? r.date : m), "");
    return lb.localeCompare(la) || a.localeCompare(b);
  });
  const sel = selected && byLift.has(selected) ? selected : liftKeys[0];
  const myLifts = liftKeys.map(k => byLift.get(k)[0].name);
  const otherLifts = COMMON_LIFTS.filter(n => !byLift.has(n.toLowerCase()));

  const thisWeek = weekStart(todayKey);
  const weekRows = rows.filter(r => weekStart(r.date) === thisWeek);
  const weekPRs = weekRows.filter(r => prs.has(`${r.date}#${r.idx}`)).length;

  function set(field, v) { setForm(f => ({ ...f, [field]: v })); }

  function submit(e) {
    e.preventDefault();
    const raw = (form.choice === OTHER ? form.custom : form.choice).trim().replace(/\s+/g, " ");
    const weight = parseFloat(form.weight), reps = parseInt(form.reps, 10), sets = parseInt(form.sets, 10) || 1;
    if (!raw || !(weight > 0) || !(reps > 0) || !form.date) { setStatus("Fill in the lift, weight, reps and date."); return; }
    const known = [...byLift.values()].map(l => l[0].name);
    const name = [...known, ...COMMON_LIFTS].find(n => n.toLowerCase() === raw.toLowerCase()) || raw.charAt(0).toUpperCase() + raw.slice(1);
    const prevBest = Math.max(0, ...(byLift.get(name.toLowerCase()) || []).map(r => r.weight));
    onAddLift(form.date, { exercise: name, weight, reps, sets });
    setSelected(name.toLowerCase());
    setStatus(prevBest && weight > prevBest
      ? `New ${name} PR: ${fmtKg(weight)} kg (up ${fmtKg(weight - prevBest)} kg)`
      : `Logged ${name}: ${sets > 1 ? `${sets}×` : ""}${reps} @ ${fmtKg(weight)} kg`);
    setForm(f => ({ ...f, weight: "", choice: name, custom: "" }));
  }

  // ----- selected lift summary -----
  const series = sel ? weeklySeries(byLift.get(sel)) : [];
  const last = series[series.length - 1], prev = series[series.length - 2], first = series[0];
  const best = sel ? Math.max(...byLift.get(sel).map(r => r.weight)) : 0;

  // ----- history grouped by week -----
  const weeks = new Map();
  for (const r of rows) { const w = weekStart(r.date); if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(r); }
  const weekKeys = [...weeks.keys()].sort().reverse();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {/* This week */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <div style={label}>Week {isoWeek(todayKey)}</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Strength</div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{weekRows.length}</div>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 600 }}>lifts this week</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: weekPRs ? C.pr : C.text }}>{weekPRs}</div>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 600 }}>PRs this week</div>
          </div>
        </div>
      </div>

      {/* Log form */}
      <form onSubmit={submit} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={sectionTitle}>Log a lift</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...label, marginBottom: 4 }}>Lift</div>
          <select id="lift-exercise" value={form.choice} onChange={e => set("choice", e.target.value)}
            style={{ ...inputStyle, color: form.choice ? C.text : C.dim, appearance: "auto" }}>
            <option value="" disabled>Choose a lift…</option>
            {myLifts.length > 0 && (
              <optgroup label="Your lifts">
                {myLifts.map(n => <option key={n} value={n}>{n}</option>)}
              </optgroup>
            )}
            <optgroup label={myLifts.length ? "Other common lifts" : "Common lifts"}>
              {otherLifts.map(n => <option key={n} value={n}>{n}</option>)}
            </optgroup>
            <option value={OTHER}>Other (type it in)…</option>
          </select>
          {form.choice === OTHER && (
            <input id="lift-custom" value={form.custom} onChange={e => set("custom", e.target.value)}
              placeholder="Lift name" autoFocus style={{ ...inputStyle, marginTop: 8 }} />
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr", gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ ...label, marginBottom: 4 }}>Weight kg</div>
            <input id="lift-weight" type="number" inputMode="decimal" step="0.5" min="0" value={form.weight} onChange={e => set("weight", e.target.value)} placeholder="100" style={inputStyle} />
          </div>
          <div>
            <div style={{ ...label, marginBottom: 4 }}>Reps</div>
            <input id="lift-reps" type="number" inputMode="numeric" min="1" value={form.reps} onChange={e => set("reps", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ ...label, marginBottom: 4 }}>Sets</div>
            <input id="lift-sets" type="number" inputMode="numeric" min="1" value={form.sets} onChange={e => set("sets", e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...label, marginBottom: 4 }}>Date</div>
            <input id="lift-date" type="date" value={form.date} max={todayKey} onChange={e => set("date", e.target.value)} style={inputStyle} />
          </div>
          <button type="submit" style={{ padding: "9px 18px", background: C.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Log</button>
        </div>
        <PlateBar weight={form.weight} />
        {status && <div style={{ fontSize: 12, color: status.startsWith("New") ? C.pr : status.startsWith("Fill") ? C.down : C.up, marginTop: 4 }}>{status}</div>}
      </form>

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", color: C.dim, fontSize: 13, padding: "24px 8px", lineHeight: 1.5 }}>
          No lifts logged yet. Add one above, or tell the coach something like<br />
          <span style={{ color: C.muted }}>"Back squat 5x5 at 100kg"</span> and it'll show up here.
        </div>
      ) : (
        <>
          {/* Lift picker */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
            {liftKeys.map(k => (
              <button key={k} onClick={() => setSelected(k)} style={{
                flexShrink: 0, padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: k === sel ? C.accent : C.input, color: k === sel ? "#fff" : C.muted,
                border: `1px solid ${k === sel ? C.accent : C.inputLine}`,
              }}>{byLift.get(k)[0].name}</button>
            ))}
          </div>

          {/* Selected lift progress */}
          {last && (
            <div style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                <div>
                  <div style={label}>{byLift.get(sel)[0].name} · top set</div>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{fmtKg(last.top)}<span style={{ fontSize: 13, color: C.dim }}> kg</span></div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, lineHeight: 1.6 }}>
                  <div><span style={{ color: C.dim }}>vs last week </span><span style={{ color: deltaColor(prev ? last.top - prev.top : null), fontWeight: 700 }}>{prev ? deltaText(last.top - prev.top) : "—"}</span></div>
                  <div><span style={{ color: C.dim }}>since {shortDate(first.week)} </span><span style={{ color: deltaColor(series.length > 1 ? last.top - first.top : null), fontWeight: 700 }}>{series.length > 1 ? deltaText(last.top - first.top) : "—"}</span></div>
                  <div><span style={{ color: C.dim }}>best </span><span style={{ fontWeight: 700 }}>{fmtKg(best)} kg</span><span style={{ color: C.dim }}> · est. 1RM </span><span style={{ fontWeight: 700 }}>{fmtKg(Math.round(last.e1 * 2) / 2)}</span></div>
                </div>
              </div>
              <ProgressChart series={series} />
              <div style={{ display: "flex", gap: 14, fontSize: 10, color: C.dim, marginTop: 6 }}>
                <span><span style={{ display: "inline-block", width: 12, borderTop: `2px solid ${C.accent}`, verticalAlign: "middle", marginRight: 4 }} />Heaviest set each week</span>
                <span><span style={{ display: "inline-block", width: 12, borderTop: `2px dashed ${C.muted}`, verticalAlign: "middle", marginRight: 4 }} />Estimated 1RM</span>
              </div>
            </div>
          )}

          {/* All lifts */}
          <div style={sectionTitle}>All lifts</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {liftKeys.map(k => {
              const s = weeklySeries(byLift.get(k));
              const l = s[s.length - 1], p = s[s.length - 2];
              const d = p ? l.top - p.top : null;
              const isPR = d != null && d > 0 && l.top >= Math.max(...byLift.get(k).map(r => r.weight));
              return (
                <button key={k} onClick={() => setSelected(k)} style={{
                  textAlign: "left", background: C.card, borderRadius: 10, padding: 10, cursor: "pointer", color: C.text,
                  border: `1px solid ${k === sel ? C.accent : C.line}`, display: "flex", flexDirection: "column", gap: 3,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{byLift.get(k)[0].name}</span>
                    {isPR && <span style={{ fontSize: 9, fontWeight: 800, background: C.pr, color: "#1a1500", padding: "1px 5px", borderRadius: 4 }}>PR</span>}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtKg(l.top)}<span style={{ fontSize: 11, color: C.dim }}> kg</span></div>
                  <Sparkline series={s} />
                  <div style={{ fontSize: 10, color: deltaColor(d) }}>{d == null ? "first week" : `${deltaText(d)} vs last wk`}</div>
                </button>
              );
            })}
          </div>

          {/* History */}
          <div style={sectionTitle}>Week by week</div>
          {weekKeys.map(w => {
            const list = weeks.get(w).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
            const vol = list.reduce((t, r) => t + r.weight * r.reps * r.sets, 0);
            return (
              <div key={w} style={{ background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: w === thisWeek ? C.accent : C.text }}>Week {isoWeek(w)} · {shortDate(w)}</span>
                  <span style={{ fontSize: 10, color: C.dim, fontWeight: 600 }}>{Math.round(vol).toLocaleString()} kg volume</span>
                </div>
                {list.map(r => {
                  const id = `${r.date}#${r.idx}`;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", borderTop: `1px dashed ${C.line}` }}>
                      <span style={{ color: C.dim, width: 44, flexShrink: 0 }}>{DAY_NAMES[fromKey(r.date).getDay()]} {fromKey(r.date).getDate()}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.name}
                        {prs.has(id) && <span style={{ fontSize: 9, fontWeight: 800, background: C.pr, color: "#1a1500", padding: "1px 5px", borderRadius: 4, marginLeft: 6 }}>PR</span>}
                      </span>
                      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.sets > 1 ? `${r.sets}×` : ""}{r.reps} @ {fmtKg(r.weight)}</span>
                      <button
                        onClick={() => {
                          if (confirmDel === id) { onDeleteLift(r.date, r.idx); setConfirmDel(null); }
                          else { setConfirmDel(id); setTimeout(() => setConfirmDel(c => (c === id ? null : c)), 3000); }
                        }}
                        aria-label={`Delete ${r.name} on ${r.date}`}
                        style={{ background: "none", border: "none", color: confirmDel === id ? C.down : C.dim, fontSize: confirmDel === id ? 11 : 14, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                      >{confirmDel === id ? "Delete?" : "×"}</button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
