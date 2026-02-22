import { useState, useMemo, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, ComposedChart } from "recharts";

const CATEGORIES = ["給与・報酬", "食費", "交通費", "住居費", "通信費", "日用品", "医療費", "交際費", "趣味・娯楽", "教育", "保険", "税金", "投資", "その他収入", "その他支出"];
const TYPES = ["収入", "支出"];
const PERIODS = [
  { key: "day", label: "日次" },
  { key: "week", label: "週次" },
  { key: "month", label: "月次" },
  { key: "year", label: "年次" },
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const emptyEntry = () => ({
  id: uid(),
  date: new Date().toISOString().slice(0, 10),
  type: "支出",
  category: "食費",
  description: "",
  amount: "",
  memo: "",
  receipt: null,
  receiptName: "",
});

const emptyPlan = () => ({
  id: uid(),
  month: new Date().toISOString().slice(0, 7),
  targetBalance: "",
  plannedIncome: "",
  plannedExpense: "",
});

const formatYen = (v) => {
  if (v === undefined || v === null || v === "") return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return (n < 0 ? "-" : "") + "¥" + Math.abs(n).toLocaleString();
};

const parseMonth = (d) => d.slice(0, 7);
const parseWeek = (d) => {
  const dt = new Date(d);
  const jan1 = new Date(dt.getFullYear(), 0, 1);
  const wk = Math.ceil(((dt - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${dt.getFullYear()}-W${String(wk).padStart(2, "0")}`;
};
const parseYear = (d) => d.slice(0, 4);

export default function App() {
  const [setupDone, setSetupDone] = useState(false);
  const [initialBalance, setInitialBalance] = useState("");
  const [initialDate, setInitialDate] = useState(new Date().toISOString().slice(0, 10));

  const [entries, setEntries] = useState([]);
  const [formData, setFormData] = useState(emptyEntry());
  const [view, setView] = useState("form");
  const [activeTab, setActiveTab] = useState("entry");
  const [period, setPeriod] = useState("month");
  const [toast, setToast] = useState(null);
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState(emptyPlan());
  const [receiptPreview, setReceiptPreview] = useState(null);

  const tableRef = useRef(null);
  const fileRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // Setup
  const handleSetup = () => {
    if (!initialBalance) { showToast("⚠️ 初期残高を入力してください"); return; }
    setSetupDone(true);
  };

  // Receipt
  const handleReceiptUpload = (file, target, id) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (target === "form") {
        setFormData((p) => ({ ...p, receipt: e.target.result, receiptName: file.name }));
      } else {
        setEntries((p) => p.map((r) => r.id === id ? { ...r, receipt: e.target.result, receiptName: file.name } : r));
      }
    };
    reader.readAsDataURL(file);
  };

  // Form
  const handleFormChange = (f, v) => setFormData((p) => ({ ...p, [f]: v }));
  const addFromForm = () => {
    if (!formData.amount || !formData.description) { showToast("⚠️ 金額と内容を入力してください"); return; }
    setEntries((p) => [...p, { ...formData, id: uid() }]);
    setFormData(emptyEntry());
    showToast("✅ 追加しました");
  };

  // Table
  const updateRow = (id, f, v) => setEntries((p) => p.map((r) => r.id === id ? { ...r, [f]: v } : r));
  const addTableRow = () => {
    setEntries((p) => [...p, emptyEntry()]);
    setTimeout(() => tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: "smooth" }), 50);
  };
  const deleteRow = (id) => setEntries((p) => p.filter((r) => r.id !== id));

  // Plans
  const addPlan = () => {
    if (!planForm.targetBalance && !planForm.plannedIncome && !planForm.plannedExpense) {
      showToast("⚠️ 少なくとも1つの計画値を入力してください"); return;
    }
    const existing = plans.findIndex((p) => p.month === planForm.month);
    if (existing >= 0) {
      setPlans((p) => p.map((pl, i) => i === existing ? { ...planForm, id: pl.id } : pl));
      showToast("✅ 計画を更新しました");
    } else {
      setPlans((p) => [...p, { ...planForm }]);
      showToast("✅ 計画を追加しました");
    }
    setPlanForm(emptyPlan());
  };

  // CSV
  const exportCSV = () => {
    const filled = entries.filter((r) => r.description || r.amount);
    if (!filled.length) { showToast("⚠️ データがありません"); return; }
    const BOM = "\uFEFF";
    const h = "日付,種別,カテゴリ,内容,金額,メモ\n";
    const b = filled.map((r) => `${r.date},${r.type},${r.category},"${r.description}",${r.amount},"${r.memo || ""}"`).join("\n");
    const blob = new Blob([BOM + h + b], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cashflow_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showToast("📁 CSVをダウンロードしました");
  };

  // Computed
  const filled = entries.filter((r) => r.description || r.amount);
  const totalIncome = filled.filter((r) => r.type === "収入").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalExpense = filled.filter((r) => r.type === "支出").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const currentBalance = (Number(initialBalance) || 0) + totalIncome - totalExpense;

  // Chart data
  const balanceChartData = useMemo(() => {
    if (!filled.length) return [];
    const sorted = [...filled].sort((a, b) => a.date.localeCompare(b.date));
    const groupKey = period === "day" ? (d) => d : period === "week" ? parseWeek : period === "month" ? parseMonth : parseYear;
    const groups = {};
    sorted.forEach((e) => {
      const k = groupKey(e.date);
      if (!groups[k]) groups[k] = { income: 0, expense: 0 };
      if (e.type === "収入") groups[k].income += Number(e.amount) || 0;
      else groups[k].expense += Number(e.amount) || 0;
    });
    let balance = Number(initialBalance) || 0;
    const keys = Object.keys(groups).sort();
    return keys.map((k) => {
      balance += groups[k].income - groups[k].expense;
      const plan = plans.find((p) => p.month === k);
      return {
        period: k,
        残高: balance,
        収入: groups[k].income,
        支出: groups[k].expense,
        計画残高: plan ? Number(plan.targetBalance) || null : null,
      };
    });
  }, [filled, period, initialBalance, plans]);

  // Plan vs Actual
  const planVsActual = useMemo(() => {
    if (!plans.length) return [];
    return plans.map((p) => {
      const monthEntries = filled.filter((e) => parseMonth(e.date) === p.month);
      const actualIncome = monthEntries.filter((e) => e.type === "収入").reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const actualExpense = monthEntries.filter((e) => e.type === "支出").reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return {
        month: p.month,
        計画収入: Number(p.plannedIncome) || 0,
        実績収入: actualIncome,
        計画支出: Number(p.plannedExpense) || 0,
        実績支出: actualExpense,
        計画残高: Number(p.targetBalance) || 0,
        収入乖離: actualIncome - (Number(p.plannedIncome) || 0),
        支出乖離: actualExpense - (Number(p.plannedExpense) || 0),
      };
    }).sort((a, b) => a.month.localeCompare(b.month));
  }, [plans, filled]);

  // Setup Screen
  if (!setupDone) {
    return (
      <div style={S.setupBg}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div style={S.setupCard}>
          <div style={S.setupLogo}>
            <span style={S.setupLogoIcon}>₿</span>
          </div>
          <h1 style={S.setupTitle}>CashBoard</h1>
          <p style={S.setupDesc}>個人キャッシュフロー管理を始めましょう</p>
          <div style={S.setupFields}>
            <label style={S.setupLabel}>基準日</label>
            <input type="date" style={S.setupInput} value={initialDate}
              onChange={(e) => setInitialDate(e.target.value)} />
            <label style={{ ...S.setupLabel, marginTop: 14 }}>現預金残高（円）</label>
            <input type="number" style={{ ...S.setupInput, fontFamily: "'DM Mono', monospace", fontSize: 22, textAlign: "center" }}
              placeholder="1,000,000" value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)} />
          </div>
          <button style={S.setupBtn} onClick={handleSetup}>管理を開始する →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Sidebar Nav */}
      <div style={S.sidebar}>
        <div style={S.sidebarLogo}>
          <span style={S.sidebarLogoIcon}>₿</span>
          <span style={S.sidebarLogoText}>CashBoard</span>
        </div>
        <div style={S.navItems}>
          {[
            { key: "entry", icon: "✏️", label: "データ入力" },
            { key: "dashboard", icon: "📊", label: "ダッシュボード" },
            { key: "plan", icon: "🎯", label: "計画管理" },
          ].map((item) => (
            <button key={item.key}
              style={activeTab === item.key ? S.navActive : S.navBtn}
              onClick={() => setActiveTab(item.key)}>
              <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
        <div style={S.sidebarFooter}>
          <button style={S.exportSideBtn} onClick={exportCSV}>↗ CSV出力</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={S.main}>
        {/* Top Balance Bar */}
        <div style={S.balanceBar}>
          <div style={S.balanceItem}>
            <span style={S.balanceLabel}>現預金残高</span>
            <span style={{ ...S.balanceValue, color: currentBalance >= 0 ? "#34d399" : "#f87171" }}>
              {formatYen(currentBalance)}
            </span>
          </div>
          <div style={S.balanceDivider} />
          <div style={S.balanceItem}>
            <span style={S.balanceLabel}>累計収入</span>
            <span style={{ ...S.balanceValueSm, color: "#34d399" }}>+{formatYen(totalIncome)}</span>
          </div>
          <div style={S.balanceDivider} />
          <div style={S.balanceItem}>
            <span style={S.balanceLabel}>累計支出</span>
            <span style={{ ...S.balanceValueSm, color: "#f87171" }}>-{formatYen(totalExpense)}</span>
          </div>
          <div style={S.balanceDivider} />
          <div style={S.balanceItem}>
            <span style={S.balanceLabel}>初期残高</span>
            <span style={S.balanceValueSm}>{formatYen(initialBalance)}</span>
          </div>
          <div style={S.balanceDivider} />
          <div style={S.balanceItem}>
            <span style={S.balanceLabel}>登録件数</span>
            <span style={S.balanceValueSm}>{filled.length}件</span>
          </div>
        </div>

        {/* ===== ENTRY TAB ===== */}
        {activeTab === "entry" && (
          <div>
            <div style={S.toggleRow}>
              <div style={S.toggleGroup}>
                <button style={view === "form" ? S.togActive : S.togBtn} onClick={() => setView("form")}>📝 フォーム</button>
                <button style={view === "table" ? S.togActive : S.togBtn} onClick={() => setView("table")}>📊 テーブル</button>
              </div>
            </div>

            {view === "form" && (
              <div style={S.card}>
                <div style={S.formGrid}>
                  <Field label="日付">
                    <input type="date" style={S.inp} value={formData.date} onChange={(e) => handleFormChange("date", e.target.value)} />
                  </Field>
                  <Field label="種別">
                    <select style={S.inp} value={formData.type} onChange={(e) => handleFormChange("type", e.target.value)}>
                      {TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="カテゴリ">
                    <select style={S.inp} value={formData.category} onChange={(e) => handleFormChange("category", e.target.value)}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="金額（円）">
                    <input type="number" style={{ ...S.inp, fontFamily: "'DM Mono', monospace" }} placeholder="0"
                      value={formData.amount} onChange={(e) => handleFormChange("amount", e.target.value)} />
                  </Field>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Field label="内容">
                      <input type="text" style={S.inp} placeholder="例: コンビニ 昼食" value={formData.description}
                        onChange={(e) => handleFormChange("description", e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ gridColumn: "1 / 3" }}>
                    <Field label="メモ">
                      <input type="text" style={S.inp} placeholder="備考" value={formData.memo}
                        onChange={(e) => handleFormChange("memo", e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ gridColumn: "3 / -1" }}>
                    <Field label="レシート添付">
                      <div style={S.receiptRow}>
                        <button style={S.receiptBtn} onClick={() => fileRef.current?.click()}>
                          📎 ファイルを選択
                        </button>
                        <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: "none" }}
                          onChange={(e) => handleReceiptUpload(e.target.files[0], "form")} />
                        {formData.receipt && (
                          <div style={S.receiptThumb} onClick={() => setReceiptPreview(formData.receipt)}>
                            <img src={formData.receipt} alt="" style={S.receiptImg} />
                            <span style={S.receiptName}>{formData.receiptName}</span>
                          </div>
                        )}
                      </div>
                    </Field>
                  </div>
                </div>
                <button style={S.addBtn} onClick={addFromForm}>+ データを追加</button>

                {filled.length > 0 && (
                  <div style={S.previewSection}>
                    <h3 style={S.previewH}>入力済み ({filled.length}件)</h3>
                    {[...filled].reverse().map((r) => (
                      <div key={r.id} style={S.previewItem}>
                        <div style={S.previewL}>
                          <span style={{
                            ...S.badge,
                            background: r.type === "収入" ? "#052e16" : "#450a0a",
                            color: r.type === "収入" ? "#34d399" : "#fca5a5",
                          }}>{r.type}</span>
                          <span style={S.previewDate}>{r.date}</span>
                          <span style={S.previewCategory}>{r.category}</span>
                          <span style={S.previewDesc}>{r.description}</span>
                          {r.receipt && (
                            <span style={S.receiptIcon} onClick={() => setReceiptPreview(r.receipt)} title="レシートを表示">🧾</span>
                          )}
                        </div>
                        <div style={S.previewR}>
                          <span style={{ ...S.previewAmt, color: r.type === "収入" ? "#34d399" : "#f87171" }}>
                            {r.type === "収入" ? "+" : "-"}{formatYen(r.amount)}
                          </span>
                          <button style={S.delSm} onClick={() => deleteRow(r.id)}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "table" && (
              <div style={S.card}>
                <div style={S.tableScroll} ref={tableRef}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        {["#", "日付", "種別", "カテゴリ", "内容", "金額", "メモ", "🧾", ""].map((h, i) => (
                          <th key={i} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((row, i) => (
                        <tr key={row.id} style={i % 2 === 0 ? S.trE : S.trO}>
                          <td style={S.tdN}>{i + 1}</td>
                          <td style={S.td}><input type="date" style={S.ci} value={row.date} onChange={(e) => updateRow(row.id, "date", e.target.value)} /></td>
                          <td style={S.td}>
                            <select style={S.cs} value={row.type} onChange={(e) => updateRow(row.id, "type", e.target.value)}>
                              {TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={S.td}>
                            <select style={S.cs} value={row.category} onChange={(e) => updateRow(row.id, "category", e.target.value)}>
                              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                            </select>
                          </td>
                          <td style={S.td}><input type="text" style={S.ci} placeholder="内容" value={row.description} onChange={(e) => updateRow(row.id, "description", e.target.value)} /></td>
                          <td style={S.td}><input type="number" style={{ ...S.ci, fontFamily: "'DM Mono', monospace", textAlign: "right" }} placeholder="0" value={row.amount} onChange={(e) => updateRow(row.id, "amount", e.target.value)} /></td>
                          <td style={S.td}><input type="text" style={S.ci} placeholder="メモ" value={row.memo} onChange={(e) => updateRow(row.id, "memo", e.target.value)} /></td>
                          <td style={S.td}>
                            {row.receipt ? (
                              <span style={{ cursor: "pointer", fontSize: 16 }} onClick={() => setReceiptPreview(row.receipt)}>🧾</span>
                            ) : (
                              <label style={S.uploadMini}>
                                📎
                                <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                                  onChange={(e) => handleReceiptUpload(e.target.files[0], "table", row.id)} />
                              </label>
                            )}
                          </td>
                          <td style={S.td}><button style={S.delBtn} onClick={() => deleteRow(row.id)}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button style={S.addRowBtn} onClick={addTableRow}>+ 行を追加</button>
              </div>
            )}
          </div>
        )}

        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === "dashboard" && (
          <div>
            {/* Period Toggle */}
            <div style={S.toggleRow}>
              <div style={S.toggleGroup}>
                {PERIODS.map((p) => (
                  <button key={p.key} style={period === p.key ? S.togActive : S.togBtn}
                    onClick={() => setPeriod(p.key)}>{p.label}</button>
                ))}
              </div>
            </div>

            {/* Balance Trend */}
            <div style={S.card}>
              <h3 style={S.chartTitle}>現預金残高推移</h3>
              {balanceChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={balanceChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: "#334155" }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: "#334155" }}
                      tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12, fontFamily: "'Noto Sans JP'" }}
                      labelStyle={{ color: "#94a3b8" }}
                      formatter={(v, name) => [formatYen(v), name]} />
                    <Area type="monotone" dataKey="残高" stroke="#34d399" fill="url(#balGrad)" strokeWidth={2.5} dot={{ fill: "#34d399", r: 4 }} />
                    {balanceChartData.some((d) => d.計画残高) && (
                      <Line type="monotone" dataKey="計画残高" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4" dot={{ fill: "#fbbf24", r: 3 }} />
                    )}
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Noto Sans JP'" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={S.noData}>データを入力するとグラフが表示されます</div>
              )}
            </div>

            {/* Income/Expense Bar */}
            <div style={S.card}>
              <h3 style={S.chartTitle}>収入・支出 比較</h3>
              {balanceChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={balanceChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: "#334155" }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: "#334155" }}
                      tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [formatYen(v), name]} />
                    <Bar dataKey="収入" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="支出" fill="#f87171" radius={[4, 4, 0, 0]} />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Noto Sans JP'" }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={S.noData}>データを入力するとグラフが表示されます</div>
              )}
            </div>

            {/* Plan vs Actual */}
            {planVsActual.length > 0 && (
              <div style={S.card}>
                <h3 style={S.chartTitle}>計画 vs 実績 乖離</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={planVsActual} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: "#334155" }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: "#334155" }}
                      tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [formatYen(v), name]} />
                    <ReferenceLine y={0} stroke="#475569" />
                    <Bar dataKey="計画収入" fill="#065f46" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="実績収入" fill="#34d399" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="計画支出" fill="#7f1d1d" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="実績支出" fill="#f87171" radius={[3, 3, 0, 0]} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Noto Sans JP'" }} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Variance Table */}
                <div style={{ marginTop: 16 }}>
                  <table style={{ ...S.table, fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={S.th}>月</th>
                        <th style={S.th}>計画収入</th>
                        <th style={S.th}>実績収入</th>
                        <th style={S.th}>収入乖離</th>
                        <th style={S.th}>計画支出</th>
                        <th style={S.th}>実績支出</th>
                        <th style={S.th}>支出乖離</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planVsActual.map((r) => (
                        <tr key={r.month} style={S.trE}>
                          <td style={S.tdMono}>{r.month}</td>
                          <td style={S.tdMono}>{formatYen(r.計画収入)}</td>
                          <td style={S.tdMono}>{formatYen(r.実績収入)}</td>
                          <td style={{ ...S.tdMono, color: r.収入乖離 >= 0 ? "#34d399" : "#f87171", fontWeight: 600 }}>
                            {r.収入乖離 >= 0 ? "+" : ""}{formatYen(r.収入乖離)}
                          </td>
                          <td style={S.tdMono}>{formatYen(r.計画支出)}</td>
                          <td style={S.tdMono}>{formatYen(r.実績支出)}</td>
                          <td style={{ ...S.tdMono, color: r.支出乖離 <= 0 ? "#34d399" : "#f87171", fontWeight: 600 }}>
                            {r.支出乖離 >= 0 ? "+" : ""}{formatYen(r.支出乖離)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== PLAN TAB ===== */}
        {activeTab === "plan" && (
          <div>
            <div style={S.card}>
              <h3 style={S.chartTitle}>月次計画を設定</h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>月ごとの目標残高・計画収入・計画支出を設定すると、ダッシュボードで実績との乖離を確認できます。</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                <Field label="対象月">
                  <input type="month" style={S.inp} value={planForm.month}
                    onChange={(e) => setPlanForm((p) => ({ ...p, month: e.target.value }))} />
                </Field>
                <Field label="目標残高（円）">
                  <input type="number" style={{ ...S.inp, fontFamily: "'DM Mono', monospace" }} placeholder="0"
                    value={planForm.targetBalance}
                    onChange={(e) => setPlanForm((p) => ({ ...p, targetBalance: e.target.value }))} />
                </Field>
                <Field label="計画収入（円）">
                  <input type="number" style={{ ...S.inp, fontFamily: "'DM Mono', monospace" }} placeholder="0"
                    value={planForm.plannedIncome}
                    onChange={(e) => setPlanForm((p) => ({ ...p, plannedIncome: e.target.value }))} />
                </Field>
                <Field label="計画支出（円）">
                  <input type="number" style={{ ...S.inp, fontFamily: "'DM Mono', monospace" }} placeholder="0"
                    value={planForm.plannedExpense}
                    onChange={(e) => setPlanForm((p) => ({ ...p, plannedExpense: e.target.value }))} />
                </Field>
              </div>
              <button style={S.addBtn} onClick={addPlan}>+ 計画を追加・更新</button>
            </div>

            {plans.length > 0 && (
              <div style={S.card}>
                <h3 style={S.chartTitle}>設定済み計画</h3>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>月</th>
                      <th style={S.th}>目標残高</th>
                      <th style={S.th}>計画収入</th>
                      <th style={S.th}>計画支出</th>
                      <th style={S.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...plans].sort((a, b) => a.month.localeCompare(b.month)).map((p) => (
                      <tr key={p.id} style={S.trE}>
                        <td style={S.tdMono}>{p.month}</td>
                        <td style={S.tdMono}>{formatYen(p.targetBalance)}</td>
                        <td style={{ ...S.tdMono, color: "#34d399" }}>{formatYen(p.plannedIncome)}</td>
                        <td style={{ ...S.tdMono, color: "#f87171" }}>{formatYen(p.plannedExpense)}</td>
                        <td style={S.td}>
                          <button style={S.delBtn} onClick={() => setPlans((prev) => prev.filter((x) => x.id !== p.id))}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={S.guideBox}>
              <div style={{ fontSize: 18 }}>💡</div>
              <div>
                <strong style={{ fontSize: 12 }}>使い方ガイド</strong>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
                  ① ここで月ごとの計画値を登録 → ② 「データ入力」で日々の収支を記録 → ③ 「ダッシュボード」で残高推移グラフ＆計画との乖離を確認。CSVエクスポートでGoogle スプレッドシートにも連携できます。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {receiptPreview && (
        <div style={S.modalOverlay} onClick={() => setReceiptPreview(null)}>
          <div style={S.modalContent} onClick={(e) => e.stopPropagation()}>
            <button style={S.modalClose} onClick={() => setReceiptPreview(null)}>×</button>
            <img src={receiptPreview} alt="レシート" style={S.modalImg} />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

const S = {
  // Setup
  setupBg: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
    fontFamily: "'Noto Sans JP', sans-serif",
  },
  setupCard: {
    background: "linear-gradient(145deg, #1e293b, #0f172a)",
    border: "1px solid #334155",
    borderRadius: 20,
    padding: "48px 40px",
    width: 380,
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  setupLogo: { marginBottom: 16 },
  setupLogoIcon: {
    display: "inline-flex",
    width: 56,
    height: 56,
    borderRadius: 16,
    background: "linear-gradient(135deg, #34d399, #059669)",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 28,
    fontWeight: 900,
    color: "#fff",
    fontFamily: "'DM Mono', monospace",
    boxShadow: "0 4px 20px rgba(52,211,153,0.3)",
  },
  setupTitle: { margin: "8px 0 4px", color: "#f1f5f9", fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em" },
  setupDesc: { color: "#64748b", fontSize: 13, margin: "0 0 28px" },
  setupFields: { textAlign: "left", marginBottom: 24 },
  setupLabel: { fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6, display: "block" },
  setupInput: {
    width: "100%",
    padding: "12px 14px",
    background: "#0f172a",
    border: "1.5px solid #334155",
    borderRadius: 10,
    color: "#f1f5f9",
    fontSize: 14,
    fontFamily: "'Noto Sans JP', sans-serif",
    outline: "none",
    boxSizing: "border-box",
  },
  setupBtn: {
    width: "100%",
    padding: "14px 0",
    background: "linear-gradient(135deg, #34d399, #059669)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', sans-serif",
    boxShadow: "0 4px 16px rgba(52,211,153,0.3)",
  },

  // Layout
  root: {
    display: "flex",
    minHeight: "100vh",
    background: "#0f172a",
    fontFamily: "'Noto Sans JP', sans-serif",
    color: "#e2e8f0",
  },
  sidebar: {
    width: 210,
    background: "#0c1222",
    borderRight: "1px solid #1e293b",
    padding: "20px 12px",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    position: "sticky",
    top: 0,
    height: "100vh",
    boxSizing: "border-box",
  },
  sidebarLogo: { display: "flex", alignItems: "center", gap: 10, marginBottom: 28, padding: "0 6px" },
  sidebarLogoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "linear-gradient(135deg, #34d399, #059669)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 900,
    color: "#fff",
    fontFamily: "'DM Mono', monospace",
  },
  sidebarLogoText: { fontSize: 16, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" },
  navItems: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    border: "none",
    background: "transparent",
    color: "#64748b",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    borderRadius: 8,
    fontFamily: "'Noto Sans JP', sans-serif",
    transition: "all 0.15s",
    textAlign: "left",
  },
  navActive: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    border: "none",
    background: "#1e293b",
    color: "#34d399",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 8,
    fontFamily: "'Noto Sans JP', sans-serif",
    textAlign: "left",
  },
  sidebarFooter: { paddingTop: 12, borderTop: "1px solid #1e293b" },
  exportSideBtn: {
    width: "100%",
    padding: "10px 0",
    border: "1px solid #334155",
    background: "transparent",
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    borderRadius: 8,
    fontFamily: "'Noto Sans JP', sans-serif",
  },

  main: { flex: 1, padding: "20px 24px", overflowY: "auto", maxHeight: "100vh" },

  // Balance Bar
  balanceBar: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "16px 24px",
    background: "linear-gradient(135deg, #1e293b, #0f172a)",
    border: "1px solid #334155",
    borderRadius: 14,
    marginBottom: 18,
  },
  balanceItem: { flex: 1, display: "flex", flexDirection: "column", gap: 3, alignItems: "center" },
  balanceDivider: { width: 1, height: 36, background: "#334155" },
  balanceLabel: { fontSize: 10, fontWeight: 500, color: "#64748b", letterSpacing: "0.06em" },
  balanceValue: { fontSize: 24, fontWeight: 900, fontFamily: "'DM Mono', monospace", letterSpacing: "-0.03em" },
  balanceValueSm: { fontSize: 16, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: "#cbd5e1" },

  // Toggle
  toggleRow: { marginBottom: 16 },
  toggleGroup: { display: "inline-flex", background: "#1e293b", borderRadius: 10, padding: 3, gap: 2 },
  togBtn: {
    padding: "9px 18px",
    border: "none",
    background: "transparent",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    color: "#64748b",
    fontFamily: "'Noto Sans JP', sans-serif",
  },
  togActive: {
    padding: "9px 18px",
    border: "none",
    background: "#334155",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: "#f1f5f9",
    fontFamily: "'Noto Sans JP', sans-serif",
  },

  // Card
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 14,
    padding: 22,
    marginBottom: 16,
  },

  // Form
  formGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 },
  inp: {
    padding: "10px 12px",
    background: "#0f172a",
    border: "1.5px solid #334155",
    borderRadius: 8,
    color: "#f1f5f9",
    fontSize: 13,
    fontFamily: "'Noto Sans JP', sans-serif",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  addBtn: {
    width: "100%",
    padding: "12px 0",
    background: "linear-gradient(135deg, #34d399, #059669)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', sans-serif",
    boxShadow: "0 2px 12px rgba(52,211,153,0.25)",
  },

  // Receipt
  receiptRow: { display: "flex", alignItems: "center", gap: 10 },
  receiptBtn: {
    padding: "10px 14px",
    background: "#0f172a",
    border: "1.5px dashed #475569",
    borderRadius: 8,
    color: "#94a3b8",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', sans-serif",
    whiteSpace: "nowrap",
  },
  receiptThumb: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    background: "#0f172a",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid #334155",
  },
  receiptImg: { width: 30, height: 30, objectFit: "cover", borderRadius: 4 },
  receiptName: { fontSize: 11, color: "#94a3b8", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  receiptIcon: { cursor: "pointer", fontSize: 15 },
  uploadMini: { cursor: "pointer", fontSize: 14, opacity: 0.5 },

  // Preview
  previewSection: { marginTop: 18, borderTop: "1px solid #334155", paddingTop: 14 },
  previewH: { fontSize: 12, fontWeight: 600, color: "#64748b", margin: "0 0 10px" },
  previewItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "9px 12px",
    background: "#0f172a",
    borderRadius: 8,
    marginBottom: 4,
    border: "1px solid #1e293b",
  },
  previewL: { display: "flex", alignItems: "center", gap: 8 },
  badge: { fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4 },
  previewDate: { fontSize: 11, color: "#64748b", fontFamily: "'DM Mono', monospace" },
  previewCategory: { fontSize: 11, color: "#475569" },
  previewDesc: { fontSize: 12, color: "#cbd5e1", fontWeight: 500 },
  previewR: { display: "flex", alignItems: "center", gap: 8 },
  previewAmt: { fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace" },
  delSm: {
    width: 22, height: 22, border: "none", background: "transparent",
    color: "#475569", cursor: "pointer", fontSize: 14, borderRadius: 4,
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  // Table
  tableScroll: { overflowX: "auto", overflowY: "auto", maxHeight: 400 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    padding: "9px 8px",
    background: "#0f172a",
    borderBottom: "2px solid #334155",
    textAlign: "left",
    fontSize: 10,
    fontWeight: 600,
    color: "#64748b",
    letterSpacing: "0.05em",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  trE: { background: "#1e293b" },
  trO: { background: "#172033" },
  td: { padding: "3px 4px", borderBottom: "1px solid #0f172a" },
  tdN: { padding: "3px 6px", borderBottom: "1px solid #0f172a", textAlign: "center", fontSize: 10, color: "#475569", fontFamily: "'DM Mono', monospace" },
  tdMono: { padding: "8px", borderBottom: "1px solid #0f172a", fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#cbd5e1", textAlign: "right" },
  ci: {
    width: "100%",
    padding: "7px 6px",
    border: "1px solid transparent",
    borderRadius: 5,
    fontSize: 12,
    fontFamily: "'Noto Sans JP', sans-serif",
    outline: "none",
    background: "transparent",
    color: "#e2e8f0",
    boxSizing: "border-box",
  },
  cs: {
    width: "100%",
    padding: "7px 4px",
    border: "1px solid transparent",
    borderRadius: 5,
    fontSize: 12,
    fontFamily: "'Noto Sans JP', sans-serif",
    outline: "none",
    background: "transparent",
    color: "#e2e8f0",
    cursor: "pointer",
  },
  delBtn: {
    width: 26, height: 26, border: "none", background: "transparent",
    color: "#475569", cursor: "pointer", fontSize: 14, borderRadius: 5,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  addRowBtn: {
    width: "100%",
    padding: "10px 0",
    border: "none",
    borderTop: "1px dashed #334155",
    background: "transparent",
    color: "#34d399",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', sans-serif",
  },

  // Chart
  chartTitle: { margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" },
  noData: { textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 13 },

  // Guide
  guideBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 16,
    padding: "14px 16px",
    background: "#1a1a2e",
    border: "1px solid #334155",
    borderRadius: 12,
  },

  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modalContent: {
    position: "relative",
    background: "#1e293b",
    borderRadius: 14,
    padding: 16,
    maxWidth: "80vw",
    maxHeight: "80vh",
  },
  modalClose: {
    position: "absolute",
    top: -10,
    right: -10,
    width: 32,
    height: 32,
    border: "none",
    background: "#ef4444",
    color: "#fff",
    fontSize: 16,
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImg: { maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 },

  // Toast
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#f1f5f9",
    color: "#0f172a",
    padding: "12px 24px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Noto Sans JP', sans-serif",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    zIndex: 999,
  },
};
