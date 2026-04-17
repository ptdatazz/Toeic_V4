// src/components/home/ModeSelectionScreen.jsx
import { playSound } from "../../utils/sound";
import { MODE_CONFIG } from "../../constants";

function ModeSelectionScreen({ onModeSelect, onNotebookClick, globalStats }) {
  const modes = [
    { key: "vocab", label: "Từ Vựng", icon: "🚀" },
    { key: "collocation", label: "Collocation", icon: "🔗" },
    { key: "grammar", label: "Ngữ Pháp AI", icon: "🤖" },
  ];

  return (
    <div style={{ animation: "fadeSlideUp 0.55s ease-out", flex: 1, minHeight: 0 }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: "20px", color: "#1a237e" }}>
        Chọn chế độ luyện tập
      </h2>

      <div style={{ display: "grid", gap: "12px" }}>
        {modes.map((mode) => {
          const config = MODE_CONFIG[mode.key];
          return (
            <div
              key={mode.key}
              onClick={() => { playSound("click"); onModeSelect(`${mode.key}_settings`); }}
              className="mode-btn"
              style={{
                background: "white",
                padding: "18px 20px",
                borderRadius: "16px",
                border: `2px solid ${config.color}30`,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: "32px" }}>{mode.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "800", fontSize: "18px", color: config.color }}>
                  {mode.label}
                </div>
                <div style={{ fontSize: "13px", color: "#666" }}>Luyện tập thông minh</div>
              </div>
              <div style={{ fontSize: "24px", color: "#ccc" }}>→</div>
            </div>
          );
        })}

        {/* Nút Sổ Tay */}
        <div
          onClick={() => { playSound("click"); onNotebookClick(); }}
          style={{
            background: "linear-gradient(135deg, #fff8f0, #fff3e0)",
            padding: "18px 20px",
            borderRadius: "16px",
            border: "2px solid #ffe0b2",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: "8px"
          }}
        >
          <div style={{ fontSize: "32px" }}>📚</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "800", fontSize: "18px", color: "#e65100" }}>
              Sổ Tay Cá Nhân
            </div>
            <div style={{ fontSize: "13px", color: "#666" }}>
              Ghim từ • Từ sai • Từ đã thuộc
            </div>
          </div>
          <div style={{ fontSize: "24px", color: "#ccc" }}>→</div>
        </div>
      </div>
    </div>
  );
}

export default ModeSelectionScreen;