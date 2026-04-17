// src/components/modals/PlanModal.jsx
import { useState } from "react";
import { playSound } from "../../utils/sound";

function PlanModal({ dailyTarget, studyTime, onSave, onClose }) {
  const [localDailyTarget, setLocalDailyTarget] = useState(dailyTarget || 30);
  const [localStudyTime, setLocalStudyTime] = useState(studyTime || "21:00");

  const handleSave = () => {
    playSound("click");
    onSave(localDailyTarget, localStudyTime);
    onClose();
  };

  return (
    <div 
      onClick={onClose} 
      style={{ 
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
        backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1200, 
        display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" 
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          backgroundColor: "white", width: "100%", maxWidth: "350px", 
          borderRadius: "20px", padding: "25px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", 
          border: "2px solid #FF9800" 
        }}
      >
        <h2 style={{ fontSize: "24px", color: "#e65100", margin: "0 0 5px 0", textAlign: "center" }}>
          🔥 Kỷ Luật Thép
        </h2>
        <p style={{ color: "#666", fontSize: "13px", marginBottom: "20px", textAlign: "center" }}>
          Đã bật chế độ này, bạn sẽ <strong>BỊ KHÓA NÚT THOÁT</strong> cho đến khi hoàn thành mục tiêu.
        </p>

        <div style={{ textAlign: "left", marginBottom: "15px" }}>
          <label style={{ fontSize: "14px", color: "#333", fontWeight: "bold" }}>
            🎯 Mục tiêu số câu đúng/ngày:
          </label>
          <input 
            type="number" 
            min="0" 
            max="500" 
            value={localDailyTarget} 
            onChange={(e) => setLocalDailyTarget(parseInt(e.target.value) || 0)}
            style={{ 
              width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", 
              fontSize: "18px", marginTop: "5px", textAlign: "center", color: "#4CAF50", fontWeight: "bold" 
            }} 
          />
          <p style={{ fontSize: "11px", color: "#999", marginTop: "5px" }}>
            *Nhập 0 để tắt chế độ Kỷ Luật Thép.
          </p>
        </div>

        <div style={{ textAlign: "left", marginBottom: "25px" }}>
          <label style={{ fontSize: "14px", color: "#333", fontWeight: "bold" }}>
            ⏰ Giờ báo thức (Nhắc nhở học):
          </label>
          <input 
            type="time" 
            value={localStudyTime} 
            onChange={(e) => setLocalStudyTime(e.target.value)}
            style={{ 
              width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", 
              fontSize: "18px", marginTop: "5px", textAlign: "center", fontWeight: "bold" 
            }} 
          />
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            onClick={handleSave}
            style={{ 
              flex: 1, padding: "12px", backgroundColor: "#FF9800", color: "white", 
              border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" 
            }}
          >
            Lưu Kế Hoạch
          </button>
          <button 
            onClick={onClose}
            style={{ 
              flex: 1, padding: "12px", backgroundColor: "#e0e0e0", color: "#333", 
              border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" 
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlanModal;