// src/components/modals/ProfileModal.jsx
import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { playSound } from "../../utils/sound";

function ProfileModal({ currentUser, onClose }) {
  const [profileNameInput, setProfileNameInput] = useState(currentUser?.displayName || "");
  const [profileAvatarFile, setProfileAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Ảnh phải nhỏ hơn 2MB!");
        return;
      }
      setProfileAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleProfileUpdate = async () => {
    if (!currentUser) return;
    playSound("click");
    setIsUpdatingProfile(true);

    try {
      // Cập nhật tên
      if (profileNameInput.trim()) {
        await updateProfile(currentUser, { displayName: profileNameInput.trim() });
      }

      // TODO: Upload ảnh lên Firebase Storage (nếu bạn đã có hàm upload)
      // Ví dụ: nếu có hàm uploadAvatar thì gọi ở đây

      alert("✅ Cập nhật hồ sơ thành công!");
      onClose();
    } catch (error) {
      console.error("Lỗi cập nhật profile:", error);
      alert("Có lỗi xảy ra khi cập nhật hồ sơ!");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  return (
    <div 
      onClick={() => !isUpdatingProfile && onClose()} 
      style={{ 
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", 
        zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" 
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          backgroundColor: "white", width: "100%", maxWidth: "380px", 
          borderRadius: "16px", padding: "25px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" 
        }}
      >
        <h2 style={{ fontSize: "22px", color: "#2c3e50", margin: "0 0 20px 0", textAlign: "center" }}>
          ⚙️ Cài Đặt Hồ Sơ
        </h2>

        {/* Avatar */}
        <div style={{ position: "relative", width: "100px", height: "100px", margin: "0 auto 20px", cursor: "pointer" }} 
             onClick={() => document.getElementById('avatarInput').click()}>
          {avatarPreview || currentUser?.photoURL ? (
            <img 
              src={avatarPreview || currentUser.photoURL} 
              alt="Avatar" 
              style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "4px solid #fff", boxShadow: "0 3px 10px rgba(0,0,0,0.15)" }} 
            />
          ) : (
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", backgroundColor: "#4facfe", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px", fontWeight: "bold", border: "4px solid #fff" }}>
              {(currentUser?.displayName || currentUser?.email || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ position: "absolute", bottom: "0", right: "0", background: "white", padding: "6px", borderRadius: "50%", boxShadow: "0 2px 5px rgba(0,0,0,0.2)" }}>✏️</div>
        </div>

        <input 
          id="avatarInput"
          type="file" 
          accept="image/*" 
          onChange={handleAvatarChange}
          style={{ display: "none" }} 
        />

        {/* Tên hiển thị */}
        <div style={{ textAlign: "left", marginBottom: "25px" }}>
          <label style={{ fontSize: "14px", color: "#666", fontWeight: "bold", marginLeft: "2px" }}>
            Tên hiển thị (Tối đa 20 ký tự)
          </label>
          <input 
            type="text" 
            value={profileNameInput} 
            onChange={(e) => setProfileNameInput(e.target.value)}
            maxLength={20}
            style={{ 
              width: "100%", padding: "12px", borderRadius: "8px", 
              border: "1px solid #ccc", fontSize: "16px", marginTop: "5px", 
              fontWeight: "bold", outline: "none" 
            }}
            disabled={isUpdatingProfile}
          />
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            disabled={isUpdatingProfile} 
            onClick={handleProfileUpdate}
            style={{ 
              flex: 1, padding: "12px", backgroundColor: isUpdatingProfile ? "#9e9e9e" : "#4CAF50", 
              color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: isUpdatingProfile ? "not-allowed" : "pointer" 
            }}
          >
            {isUpdatingProfile ? `Đang lưu...` : "Lưu thay đổi"}
          </button>
          <button 
            disabled={isUpdatingProfile} 
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

export default ProfileModal;