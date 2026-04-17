// src/components/home/WelcomeTutorial.jsx
import { playSound } from "../../utils/sound";

function WelcomeTutorial({ onDismiss }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
      backgroundColor: "rgba(0,0,0,0.6)", zIndex: 999,
      display: "flex", justifyContent: "center", alignItems: "center",
      padding: "20px", boxSizing: "border-box"
    }}>
      <div style={{
        backgroundColor: "white", padding: "30px", borderRadius: "15px",
        maxWidth: "450px", width: "100%", textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)", animation: "popIn 0.3s ease-out"
      }}>
        <h2 style={{ color: "#2c3e50", marginTop: 0, fontSize: "1.8rem" }}>
          Chào mừng bạn mới! 👋
        </h2>

        <div style={{ textAlign: "left", color: "#444", fontSize: "15px", lineHeight: "1.6", marginBottom: "25px" }}>
          <p><strong>🎯 Luật chơi để trở thành TOEIC Master:</strong></p>
          <ul style={{ paddingLeft: "20px" }}>
            <li style={{ marginBottom: "10px" }}>
              <strong>Học Từ Vựng & Collocation:</strong> Trả lời nhanh trước khi hết giờ. Làm sai bị phạt. Combo càng cao, hiệu ứng càng cháy!
            </li>
            <li style={{ marginBottom: "10px" }}>
              <strong>Ngữ Pháp bằng AI:</strong> Hệ thống tự động tạo câu hỏi vô tận và giải thích chi tiết như một giáo viên thực thụ.
            </li>
            <li style={{ marginBottom: "10px" }}>
              <strong>Nút Quay Lại:</strong> Bị khóa lúc đang làm bài. Phải làm đúng <strong>chuỗi câu (Streak)</strong> thì mới mở được 🔓.
            </li>
          </ul>
        </div>

        <button 
          onClick={() => { playSound("click"); onDismiss(); }} 
          style={{
            width: "100%", padding: "12px", fontSize: "16px",
            backgroundColor: "#4CAF50", color: "white",
            borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold"
          }}
        >
          🚀 Đã hiểu, Vào học ngay!
        </button>
      </div>
    </div>
  );
}

export default WelcomeTutorial;