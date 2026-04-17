// src/components/auth/AuthScreen.jsx
import { useState } from "react";
import { auth, db } from "../../firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { playSound } from "../../utils/sound";


function AuthScreen() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
  e.preventDefault();
  playSound("click");
  setError("");
  setLoading(true);

  if (!email.trim() || !password.trim()) {
    setLoading(false);
    return setError("Vui lòng nhập đầy đủ Email và Mật khẩu!");
  }

  try {
    if (isLoginMode) {
      // Đăng nhập
      await signInWithEmailAndPassword(auth, email, password);
      // Nếu thành công, onAuthStateChanged trong App.jsx sẽ tự chuyển sang Home
    } else {
      // Đăng ký
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      await setDoc(doc(db, "users", user.uid), {
        vocab: { correct: 0, total: 0, learnedWords: [], savedWords: [], wrongWords: [], masteredWords: [], addedWordsObj: [] },
        collocation: { correct: 0, total: 0, learnedWords: [], savedWords: [], wrongWords: [], masteredWords: [], addedWordsObj: [] },
        grammar: { correct: 0, total: 0, learnedWords: [], savedWords: [], wrongWords: [], masteredWords: [], customNotes: [] }
      });
      
      alert("Đăng ký thành công!");   // Có thể bỏ alert này sau
    }
  } catch (err) {
    console.error(err);
    if (err.code === 'auth/email-already-in-use') {
      setError("Email này đã được sử dụng!");
    } else if (err.code === 'auth/invalid-credential') {
      setError("Sai email hoặc mật khẩu!");
    } else if (err.code === 'auth/weak-password') {
      setError("Mật khẩu phải có ít nhất 6 ký tự!");
    } else {
      setError("Có lỗi xảy ra, vui lòng thử lại!");
    }
  } finally {
    setLoading(false);
  }
};

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#1a237e 0%,#283593 50%,#1565c0 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      boxSizing: "border-box"
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "56px", marginBottom: "8px" }}>🚀</div>
          <h1 style={{ fontSize: "2rem", fontWeight: "900", color: "white", margin: "0 0 6px 0" }}>
            TOEIC Master
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", margin: 0, fontSize: "14px" }}>
            Luyện thi thông minh — Chinh phục điểm cao
          </p>
        </div>

        <div style={{
          backgroundColor: "white",
          borderRadius: "24px",
          padding: "32px 28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
        }}>
          <h2 style={{
            margin: "0 0 20px 0",
            color: "#1a237e",
            fontWeight: "800",
            fontSize: "20px",
            textAlign: "center"
          }}>
            {isLoginMode ? "👋 Đăng nhập" : "✨ Tạo tài khoản"}
          </h2>

          {error && (
            <div style={{
              color: "#d32f2f",
              backgroundColor: "#ffebee",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "14px",
              marginBottom: "16px",
              border: "1px solid #ffcdd2"
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <input
              type="text"
              placeholder="Email của bạn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                padding: "13px 16px",
                borderRadius: "12px",
                border: "2px solid #e0e0e0",
                fontSize: "15px",
                outline: "none"
              }}
            />
            <input
              type="password"
              placeholder="Mật khẩu (ít nhất 6 ký tự)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: "13px 16px",
                borderRadius: "12px",
                border: "2px solid #e0e0e0",
                fontSize: "15px",
                outline: "none"
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "14px",
                fontSize: "16px",
                background: loading ? "#9e9e9e" : "linear-gradient(135deg,#1565c0,#1976d2)",
                color: "white",
                borderRadius: "12px",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: "bold"
              }}
            >
              {loading ? "⏳ Đang xử lý..." : (isLoginMode ? "🚀 Vào Học Ngay" : "✅ Đăng Ký")}
            </button>
          </form>

          <p style={{ margin: "18px 0 0 0", fontSize: "14px", color: "#888", textAlign: "center" }}>
            {isLoginMode ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <span
              onClick={() => { playSound("click"); setIsLoginMode(!isLoginMode); setError(""); }}
              style={{ color: "#1565c0", cursor: "pointer", fontWeight: "bold" }}
            >
              {isLoginMode ? "Đăng ký ngay →" : "Đăng nhập →"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;   // ← Quan trọng: Phải có dòng này