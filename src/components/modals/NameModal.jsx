// src/components/modals/NameModal.jsx
import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { playSound } from "../../utils/sound";

function NameModal({ currentUser, onClose, onNameUpdated }) {
  const [newNameInput, setNewNameInput] = useState(currentUser?.displayName || "");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const handleUpdateName = async () => {
    if (!newNameInput.trim() || !currentUser) return;
    
    playSound("click");
    setIsUpdatingName(true);

    try {
      await updateProfile(currentUser, { displayName: newNameInput.trim() });
      
      // Cập nhật lại state ở App nếu cần
      if (onNameUpdated) onNameUpdated(newNameInput.trim());
      
      alert("✅ Đã cập nhật tên thành công!");
      onClose();
    } catch (error) {
      console.error("Lỗi cập nhật tên:", error);
      alert("Có lỗi xảy ra khi cập nhật tên!");
    } finally {
      setIsUpdatingName(false);
    }
  };

  return (
    <div 
      onClick={() => !isUpdatingName && onClose()} 
      style={{ 
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
        backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1100, 
        display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" 
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          backgroundColor: "white", width: "100%", maxWidth: "350px", 
          borderRadius: "16px", padding: "25px", textAlign: "center", 
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)" 
        }}
      >
        <h2 style={{ fontSize: "22px", color: "#2c3e50", margin: "0 0 15px 0" }}>
          ✏️ Đổi Tên Của Bạn
        </h2>
        
        <input 
          type="text" 
          value={newNameInput} 
          onChange={(e) => setNewNameInput(e.target.value)}
          maxLength={20}
          autoFocus
          style={{ 
            width: "100%", padding: "12px", borderRadius: "8px", 
            border: "1px solid #ccc", fontSize: "16px", marginBottom: "20px", 
            textAlign: "center", fontWeight: "bold", outline: "none" 
          }}
        />

        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            disabled={isUpdatingName} 
            onClick={handleUpdateName}
            style={{ 
              flex: 1, padding: "12px", backgroundColor: isUpdatingName ? "#9e9e9e" : "#4CAF50", 
              color: "white", border: "none", borderRadius: "8px", 
              fontWeight: "bold", cursor: isUpdatingName ? "not-allowed" : "pointer" 
            }}
          >
            {isUpdatingName ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
          <button 
            disabled={isUpdatingName} 
            onClick={onClose}
            style={{ 
              flex: 1, padding: "12px", backgroundColor: "#e0e0e0", 
              color: "#333", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" 
            }}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}

export default NameModal;