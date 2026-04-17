// src/components/home/HomeScreen.jsx
import { useState, useEffect, useRef } from "react";
import WelcomeTutorial from "./WelcomeTutorial";
import { playSound } from "../../utils/sound";

function HomeScreen({
  currentUser,
  globalStats,
  dailyTarget,
  studyTime,
  todayMasteredCount,
  showTutorial,
  onTutorialDismiss,
  onLogout,
  onOpenProfile,
  onOpenPlan,
  onNavigate,
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(60);
  const [currentTime, setCurrentTime] = useState(new Date());
  const menuRef = useRef(null);

  // ---- Live clock ----
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ---- Close profile menu when clicking outside ----
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    }
    if (showProfileMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileMenu]);

  const pad = (n) => String(n).padStart(2, "0");
  const timeStr = `${pad(currentTime.getHours())}:${pad(currentTime.getMinutes())}:${pad(currentTime.getSeconds())}`;
  const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const dateStr = `${days[currentTime.getDay()]}, Ngày ${currentTime.getDate()} Tháng ${currentTime.getMonth() + 1}, Năm ${currentTime.getFullYear()}`;

  const vocabStats = globalStats?.vocab || {};
  const collocationStats = globalStats?.collocation || {};
  const grammarStats = globalStats?.grammar || {};

  const vocabTotal = vocabStats.total || 1743;
  const vocabLearned = vocabStats.learned || 351;
  const vocabPct = Math.min(100, Math.round((vocabLearned / vocabTotal) * 100));

  const collocTotal = collocationStats.total || 15;
  const collocLearned = collocationStats.learned || 20;
  const collocPct = Math.min(100, Math.round((collocLearned / collocTotal) * 100));

  const grammarDone = grammarStats.done || 65;

  const todayLearned = todayMasteredCount || 0;
  const target = dailyTarget || 30;
  const progressPct = Math.min(100, Math.round((todayLearned / target) * 100));

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      fontFamily: "system-ui, -apple-system, sans-serif",
      position: "relative"
    }}>

      {showTutorial && <WelcomeTutorial onDismiss={onTutorialDismiss} />}

      {/* ==================== SIDEBAR TRÁI ==================== */}
      <div style={{
        width: "210px",
        background: "#1a237e",
        color: "white",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflowY: "auto",
        gap: "16px",
        position: "relative",
        zIndex: 10
      }}>

        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
          <div style={{ fontSize: "36px" }}>🚀</div>
          <div style={{ fontSize: "18px", fontWeight: "900", letterSpacing: "0.5px" }}>TOEIC Master</div>
          <div style={{ fontSize: "11px", opacity: 0.75 }}>Luyện thi thông minh</div>
        </div>

        {/* User Info + Dropdown */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <div
            onClick={() => setShowProfileMenu(prev => !prev)}
            style={{
              background: "rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
              userSelect: "none",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
          >
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt="Avatar" style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div style={{
                width: "38px", height: "38px", borderRadius: "50%",
                background: "#60a5fa", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "17px", fontWeight: "bold", flexShrink: 0
              }}>
                {(currentUser?.displayName || currentUser?.email || "P").charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentUser?.displayName || currentUser?.email?.split('@')[0] || "Người dùng"}
              </div>
              <div style={{ fontSize: "10.5px", opacity: 0.65, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentUser?.email || ""}
              </div>
            </div>
            <div style={{
              opacity: 0.7, fontSize: "10px",
              transform: showProfileMenu ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s"
            }}>▼</div>
          </div>

          {/* Dropdown Menu */}
          {showProfileMenu && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0, right: 0,
              background: "#1e3a8a",
              borderRadius: "10px",
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              zIndex: 200,
              border: "1px solid rgba(255,255,255,0.15)"
            }}>
              {[
                { icon: "👤", label: "Hồ sơ", action: onOpenProfile },
                { icon: "📊", label: "Kế hoạch học", action: onOpenPlan },
                { icon: "🚪", label: "Đăng xuất", action: onLogout, danger: true },
              ].map(({ icon, label, action, danger }) => (
                <div
                  key={label}
                  onClick={() => { setShowProfileMenu(false); action?.(); }}
                  style={{
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: danger ? "#fca5a5" : "white",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span>{icon}</span><span>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timer + Date — Live */}
        <div style={{
          background: "rgba(255,255,255,0.08)",
          borderRadius: "12px",
          padding: "14px 12px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "2px", fontVariantNumeric: "tabular-nums" }}>
            {timeStr}
          </div>
          <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "5px", lineHeight: "1.5" }}>
            {dateStr}
          </div>
        </div>

        {/* Âm nhạc */}
        <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 14px" }}>
          <div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "10px", fontWeight: "600" }}>🎵 ÂM NHẠC</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setIsPlaying(prev => !prev)}
              style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "#f59e0b", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", color: "white", flexShrink: 0
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#d97706"}
              onMouseLeave={e => e.currentTarget.style.background = "#f59e0b"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", color: "white", flexShrink: 0
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
            >
              ⏭
            </button>
            <input
              type="range" min="0" max="100"
              value={volume}
              onChange={e => setVolume(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#38bdf8", cursor: "pointer" }}
            />
          </div>
        </div>

        {/* Tiến Độ */}
        <div>
          <div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "10px", fontWeight: "600" }}>📊 TIẾN ĐỘ</div>
          {[
            { label: "Từ vựng", pct: vocabPct, sub: `${vocabLearned} / ${vocabTotal}`, color: "#4ade80", display: `${vocabPct}%` },
            { label: "Collocation", pct: Math.min(100, collocPct), sub: `${collocLearned} / ${collocTotal}`, color: "#c084fc", display: `${collocPct}%` },
            { label: "Ngữ pháp AI", pct: 65, sub: `${grammarDone} câu — Vô hạn đề`, color: "#60a5fa", display: "Vô hạn" },
          ].map(({ label, pct, sub, color, display }) => (
            <div key={label} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "2px" }}>
                <span>{label}</span>
                <span style={{ color, fontWeight: "600" }}>{display}</span>
              </div>
              <div style={{ fontSize: "10px", opacity: 0.5, marginBottom: "4px" }}>{sub}</div>
              <div style={{ height: "5px", background: "rgba(255,255,255,0.12)", borderRadius: "999px" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "999px" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ==================== MAIN CONTENT ==================== */}
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto", background: "#f0f4ff" }}>

        {/* Greeting */}
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 4px 0", color: "#1e3a8a" }}>
            Xin chào, {currentUser?.displayName?.split(' ').pop() || "bạn"} 👋
          </h1>
          <p style={{ color: "#64748b", fontSize: "14.5px", margin: 0 }}>
            Hôm nay học gì nào? Mỗi từ là một bước tiến.
          </p>
        </div>

        {/* Kỷ Luật Thép */}
        <div style={{
          background: "linear-gradient(90deg, #fefce8, #fef9c3)",
          borderRadius: "14px",
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          border: "1px solid #fde68a"
        }}>
          <div style={{ flex: 1, marginRight: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#b45309", fontWeight: "700", fontSize: "15px" }}>
              🔥 Kỷ Luật Thép
            </div>
            <div style={{ fontSize: "13px", color: "#92400e", marginTop: "2px" }}>
              Hôm nay: <strong>{todayLearned} / {target} từ</strong>
            </div>
            <div style={{ height: "5px", background: "#fde68a", borderRadius: "999px", marginTop: "8px" }}>
              <div style={{ width: `${progressPct}%`, height: "100%", background: "#f59e0b", borderRadius: "999px", minWidth: progressPct > 0 ? "8px" : "0" }} />
            </div>
          </div>
          <button
            onClick={onOpenPlan}
            style={{
              background: "white", border: "1.5px solid #fde68a",
              padding: "8px 18px", borderRadius: "9999px",
              fontWeight: "600", color: "#b45309", cursor: "pointer",
              fontSize: "13.5px", whiteSpace: "nowrap"
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 10px rgba(245,158,11,0.25)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
          >
            Cài đặt →
          </button>
        </div>

        {/* ======= 3 STATS CARDS ======= */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          {[
            {
              icon: "📚", label: "Từ Vựng", color: "#22c55e", lightBg: "#f0fdf4",
              pinned: vocabStats.pinned ?? 22, wrong: vocabStats.wrong ?? 52, mastered: vocabStats.mastered ?? 239,
              pct: vocabPct, nav: "vocab_settings"
            },
            {
              icon: "🔗", label: "Colloc.", color: "#a855f7", lightBg: "#faf5ff",
              pinned: collocationStats.pinned ?? 11, wrong: collocationStats.wrong ?? 10, mastered: collocationStats.mastered ?? 0,
              pct: Math.min(100, collocPct), nav: "collocation_settings"
            },
            {
              icon: "🤖", label: "Ngữ Pháp", color: "#3b82f6", lightBg: "#eff6ff",
              pinned: grammarStats.pinned ?? 12, wrong: grammarStats.wrong ?? 0, mastered: grammarStats.mastered ?? 0,
              pct: 65, nav: "grammar_settings"
            },
          ].map(({ icon, label, color, lightBg, pinned, wrong, mastered, pct, nav }) => (
            <div
              key={label}
              style={{
                background: "white",
                borderRadius: "16px",
                padding: "16px 20px 14px",
                border: `2px solid ${color}`,
                transition: "box-shadow 0.15s, transform 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px ${color}44`; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "20px" }}>{icon}</span>
                <span style={{ fontWeight: "700", fontSize: "14.5px", color }}>{label}</span>
              </div>
              {[["⭐", "Ghim", pinned], ["❌", "Sai", wrong], ["✅", "Thuộc", mastered]].map(([em, name, val]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px", color: "#334155" }}>
                  <span>{em} {name}</span>
                  <span style={{ fontWeight: "700" }}>{val}</span>
                </div>
              ))}
              <div style={{ height: "3px", background: lightBg, borderRadius: "999px", margin: "10px 0 8px", border: `1px solid ${color}33` }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "999px" }} />
              </div>
              <div
                onClick={() => onNavigate(nav)}
                style={{ textAlign: "right", fontSize: "12.5px", color, fontWeight: "600", cursor: "pointer", userSelect: "none" }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                Vào sổ tay →
              </div>
            </div>
          ))}
        </div>

        {/* ======= 3 ACTION CARDS ======= */}
        {/* ======= 3 ACTION CARDS LỚN - MỞ NOTEBOOK ======= */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          {[
            { 
              icon: "🚀", 
              label: "Ôn Từ Vựng", 
              badge: `${vocabLearned} từ đã học`, 
              gradient: "linear-gradient(160deg, #4ade80 0%, #15803d 100%)", 
              tab: "vocab" 
            },
            { 
              icon: "📋", 
              label: "Ôn Colloc.", 
              badge: `${collocLearned} cụm đã học`, 
              gradient: "linear-gradient(160deg, #c084fc 0%, #7c3aed 100%)", 
              tab: "collocation" 
            },
            { 
              icon: "📐", 
              label: "Ôn Ngữ Pháp", 
              badge: `${grammarDone} câu đã làm`, 
              gradient: "linear-gradient(160deg, #60a5fa 0%, #1d4ed8 100%)", 
              tab: "grammar" 
            },
          ].map(({ icon, label, badge, gradient, tab }) => (
            <div
              key={label}
              onClick={() => {
                playSound("click");
                onNavigate("notebook", tab);       // ← Quan trọng: Mở Notebook
              }}
              style={{
                background: gradient,
                borderRadius: "20px",
                padding: "32px 24px 24px",
                color: "white",
                cursor: "pointer",
                minHeight: "200px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "transform 0.15s, box-shadow 0.15s",
                userSelect: "none"
              }}
              onMouseEnter={e => { 
                e.currentTarget.style.transform = "translateY(-4px)"; 
                e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.2)"; 
              }}
              onMouseLeave={e => { 
                e.currentTarget.style.transform = "translateY(0)"; 
                e.currentTarget.style.boxShadow = "none"; 
              }}
            >
              <div style={{ fontSize: "44px" }}>{icon}</div>
              <div style={{ fontSize: "18px", fontWeight: "700" }}>{label}</div>
              <div style={{
                background: "rgba(0,0,0,0.18)",
                padding: "5px 16px",
                borderRadius: "999px",
                fontSize: "12.5px",
                fontWeight: "600"
              }}>{badge}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;