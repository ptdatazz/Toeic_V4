import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import "./App.css";

// Import Firebase
import { auth, db } from "./firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// --- HỆ THỐNG TRẠM ĐIỆN TỔNG QUẢN LÝ API KEY CHỐNG SẬP QUOTA ---
const RAW_KEYS = import.meta.env.VITE_GEMINI_API_KEY || "";
const GLOBAL_API_KEYS = RAW_KEYS.split(',').map(k => k.trim()).filter(k => k);
let globalKeyIndex = 0; 

const getActiveKey = () => GLOBAL_API_KEYS[globalKeyIndex] || "";
const rotateKey = () => {
    if (globalKeyIndex < GLOBAL_API_KEYS.length - 1) {
        globalKeyIndex++;
        console.log(`[HỆ THỐNG] 🔄 Đã tự động chuyển toàn bộ App sang API Key dự phòng số ${globalKeyIndex + 1}`);
        return true; 
    }
    return false; 
};

// --- ÂM THANH HIỆU ỨNG (SFX) ---
const playSound = (type) => {
  let url = "";
  if (type === "wrong") url = "https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3"; 
  else if (type === "timeout") url = "https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3"; 
  else if (type === "finish") url = "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3"; 
  else if (type === "click") url = "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3"; 
  else if (type === "combo_1") url = "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3"; 
  else if (type === "combo_2") url = "https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3"; 
  else if (type === "combo_3") url = "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3"; 
  else if (type === "combo_4") url = "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3"; 
  else if (type === "combo_max") url = "https://assets.mixkit.co/active_storage/sfx/1434/1434-preview.mp3"; 
  
  if (url) {
    const audio = new Audio(url);
    audio.volume = type === "finish" ? 0.6 : (type === "click" ? 0.5 : 1.0);
    audio.play().catch(e => console.log("Trình duyệt chặn âm thanh:", e));
  }
};

// --- HÀM ĐỌC TỪ VỰNG & CÂU HỎI (HỖ TRỢ SONG NGỮ) ---
const speakWord = (rawText, lang = 'en-US') => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); 
    const cleanText = rawText.replace(/\s*\(.*?\)\s*/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang; // Tự động đổi giọng theo ngôn ngữ
    utterance.rate = 0.85;    
    window.speechSynthesis.speak(utterance);
  } else {
    alert("Trình duyệt của bạn không hỗ trợ tính năng đọc âm thanh!");
  }
};

// --- CÁC HÀM HỖ TRỢ CHUNG ---
const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

const getRandomWrongOptions = (fullData, currentItem, fieldToGet) => {
  const wrongOptions = [];
  let attempts = 0; 
  while (wrongOptions.length < 3 && attempts < 100) {
    const randomItem = fullData[Math.floor(Math.random() * fullData.length)];
    if (randomItem[fieldToGet] !== currentItem[fieldToGet] && !wrongOptions.includes(randomItem[fieldToGet])) {
      wrongOptions.push(randomItem[fieldToGet]);
    }
    attempts++;
  }
  return wrongOptions;
};

// --- BỘ MÁY TẠO ĐỀ THI ĐA DẠNG (TỪ VỰNG) ---
const generateVocabQuestions = (selectedData, fullData, level) => {
  return selectedData.map((item) => {
    let qType = "en_to_vn"; 

    if (level === 0) {
      qType = "flashcard";
    }
    
    if (level === 1) {
      if (Math.random() > 0.5) qType = "vn_to_en";
    }
    else if (level >= 2) {
      const types = ["en_to_vn", "vn_to_en", "typing", "listening"];
      if (!item.word.includes(' ')) types.push("scramble");
     
      // --- TÍNH NĂNG MỚI: TẠO CÂU HỎI PART 5 TỪ CÂU VÍ DỤ ---
      if (item.usage && item.usage.toLowerCase().includes(item.word.toLowerCase())) {
          types.push("part5_vocab"); // Đục lỗ câu ví dụ
      }

      qType = types[Math.floor(Math.random() * types.length)];

    }

    let questionObj = { ...item, type: qType };

    if (qType === "en_to_vn" || qType === "listening") {
      const wrongOptions = getRandomWrongOptions(fullData, item, "meaning");
      questionObj.options = shuffleArray([...wrongOptions, item.meaning]);
      questionObj.answer = item.meaning;
    } else if (qType === "vn_to_en"|| qType === "part5_vocab") {
      const wrongOptions = getRandomWrongOptions(fullData, item, "word");
      questionObj.options = shuffleArray([...wrongOptions, item.word]);
      questionObj.answer = item.word;
    } else if (qType === "typing" || qType === "scramble"|| qType === "flashcard") {
      const cleanAnswer = item.word.replace(/\s*\(.*?\)\s*/g, '').trim();
      questionObj.answer = cleanAnswer;
    }

    return questionObj;
  });
};

// --- COMPONENT: BẢNG HƯỚNG DẪN SỬ DỤNG ---
function WelcomeTutorial({ onDismiss }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 999, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
      <div style={{ backgroundColor: "white", padding: "30px", borderRadius: "15px", maxWidth: "450px", width: "100%", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", animation: "popIn 0.3s ease-out" }}>
        <h2 style={{ color: "#2c3e50", marginTop: 0, fontSize: "1.8rem" }}>Chào mừng bạn mới! 👋</h2>
        
        <div style={{ textAlign: "left", color: "#444", fontSize: "15px", lineHeight: "1.6", marginBottom: "25px" }}>
          <p><strong>🎯 Luật chơi để trở thành TOEIC Master:</strong></p>
          <ul style={{ paddingLeft: "20px" }}>
            <li style={{ marginBottom: "10px" }}><strong>Học Từ Vựng & Collocation:</strong> Trả lời nhanh trước khi hết giờ. Làm sai bị phạt. Combo càng cao, hiệu ứng càng cháy!</li>
            <li style={{ marginBottom: "10px" }}><strong>Ngữ Pháp bằng AI:</strong> Hệ thống tự động tạo câu hỏi vô tận và giải thích chi tiết như một giáo viên thực thụ.</li>
            <li style={{ marginBottom: "10px" }}><strong>Nút Quay Lại:</strong> Bị khóa lúc đang làm bài. Phải làm đúng <strong>chuỗi câu (Streak)</strong> thì mới mở được 🔓.</li>
          </ul>
        </div>

        <button 
          onClick={() => { playSound("click"); onDismiss(); }} 
          style={{ width: "100%", padding: "12px", fontSize: "16px", backgroundColor: "#4CAF50", color: "white", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}
        >
          🚀 Đã hiểu, Vào học ngay!
        </button>
      </div>
    </div>
  );
}

// --- COMPONENT: ĐĂNG NHẬP / ĐĂNG KÝ ---
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
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await setDoc(doc(db, "users", user.uid), {
          vocab: { correct: 0, total: 0, learnedWords: [] },
          collocation: { correct: 0, total: 0, learnedWords: [] },
          grammar: { correct: 0, total: 0, learnedWords: [] }
        });
        alert("Đăng ký thành công!");
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') setError("Email này đã được sử dụng!");
      else if (err.code === 'auth/invalid-credential') setError("Sai email hoặc mật khẩu!");
      else if (err.code === 'auth/weak-password') setError("Mật khẩu phải có ít nhất 6 ký tự!");
      else setError("Có lỗi xảy ra, vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ textAlign: "center", paddingTop: "50px", maxWidth: "400px" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "10px", color: "#2c3e50" }}>TOEIC Master 🚀</h1>
      <p style={{ color: "#7f8c8d", marginBottom: "30px" }}>Vui lòng đăng nhập để đồng bộ tiến độ</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px", backgroundColor: "#f9f9f9", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 15px 0", color: "#333" }}>{isLoginMode ? "Đăng Nhập" : "Tạo Tài Khoản"}</h2>
        {error && <div style={{ color: "red", backgroundColor: "#ffebee", padding: "10px", borderRadius: "5px", fontSize: "14px" }}>{error}</div>}
        <input type="email" placeholder="Nhập Email của bạn" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px" }} />
        <input type="password" placeholder="Mật khẩu (ít nhất 6 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px" }} />
        <button type="submit" disabled={loading} style={{ padding: "12px", fontSize: "18px", backgroundColor: loading ? "#9e9e9e" : "#4CAF50", color: "white", borderRadius: "8px", border: "none", cursor: loading ? "not-allowed" : "pointer", fontWeight: "bold", marginTop: "10px" }}>
          {loading ? "Đang xử lý..." : (isLoginMode ? "Vào Học Ngay" : "Đăng Ký")}
        </button>
        <p style={{ margin: "10px 0 0 0", fontSize: "14px", color: "#666" }}>
          {isLoginMode ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
          <span onClick={() => { playSound("click"); setIsLoginMode(!isLoginMode); setError(""); }} style={{ color: "#2196F3", cursor: "pointer", fontWeight: "bold", textDecoration: "underline" }}>
            {isLoginMode ? "Đăng ký ngay" : "Đăng nhập"}
          </span>
        </p>
      </form>
    </div>
  );
}

// --- COMPONENT: CÀI ĐẶT CHUNG TẤT CẢ CÁC MODE ---
function QuizSettings({ mode, onStart, onBack, customWordsCount = 0 }) {
  const modeName = mode === "vocab" ? "Từ Vựng" : mode === "collocation" ? "Collocation" : "Ngữ Pháp (AI)";
  const storageKey = `toeic_${mode}_settings`;
  const primaryColor = mode === "vocab" ? "#4CAF50" : mode === "collocation" ? "#9C27B0" : "#2196F3";

  const [settings, setSettings] = useState(() => {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
          const parsedSettings = JSON.parse(saved);
          
          // ĐÃ FIX: Khóa an toàn, không cho Ngữ pháp dùng Level 0 (Flashcard)
          let diffLevel = parsedSettings.difficultyLevel !== undefined ? parsedSettings.difficultyLevel : 1;
          if (mode === "grammar" && diffLevel === 0) diffLevel = 1;
          
          return { ...parsedSettings, difficultyLevel: diffLevel, toeicPart: parsedSettings.toeicPart || "part5", dataSource: parsedSettings.dataSource || "default" }; 
      }
      return { quizLimit: mode === "grammar" ? 5 : 30, timePerQuestion: mode === "grammar" ? 30 : 10, requiredStreak: 3, difficultyLevel: 1, survivalLives: 3, timeAttackSeconds: mode === "grammar" ? 60 : 30, toeicPart: "part5", dataSource: "default" };
    });

  // THÊM: Tính toán min/max tự động cho thanh kéo
  let dynamicMin = mode === "grammar" ? 1 : 5;
  let dynamicMax = mode === "grammar" ? 20 : 100;
  
  // if (mode === "vocab" && settings.dataSource === "custom") {
  //     // Lấy chính xác số lượng từ ở sheet Custom làm Min
  //     dynamicMin = customWordsCount > 0 ? customWordsCount : 5;
  //     if (dynamicMax < dynamicMin) dynamicMax = dynamicMin + 20; 
  // }

  // Tự động đẩy giới hạn lên nếu thanh kéo đang nằm ở mức thấp hơn số từ mới
  useEffect(() => {
      if (settings.difficultyLevel <= 2 && settings.quizLimit < dynamicMin) {
          setSettings(prev => ({ ...prev, quizLimit: dynamicMin }));
      }
  }, [dynamicMin, settings.difficultyLevel, settings.quizLimit]);

  const handleStart = () => {
    playSound("click");
    localStorage.setItem(storageKey, JSON.stringify(settings));
    onStart(settings);
  };

  return (
    <div className="container" style={{ textAlign: "center", paddingTop: "20px" }}>
      <h2 style={{ color: "#2c3e50", marginBottom: "5px" }}>⚙️ Cài Đặt {modeName}</h2>
      {mode === "grammar" ? (
         <p style={{ color: "#2196F3", marginBottom: "25px", fontSize: "14px", fontWeight: "bold" }}>✨ Tự động tạo đề chuẩn TOEIC bằng AI ✨</p>
      ) : (
         <p style={{ color: "#7f8c8d", marginBottom: "25px", fontSize: "14px" }}>Hãy thử thách bản thân với các Mode khác nhau</p>
      )}

      <div style={{ backgroundColor: "#f9f9f9", padding: "20px", borderRadius: "12px", border: "1px solid #eee", textAlign: "left", marginBottom: "25px" }}>
        
        {/* LỰA CHỌN NGUỒN DỮ LIỆU (CHỈ DÀNH CHO TỪ VỰNG) */}
        {mode === "vocab" && (
          <div style={{ marginBottom: "25px", backgroundColor: "#e8f5e9", padding: "15px", borderRadius: "8px", border: "1px solid #c8e6c9" }}>
            <label style={{ fontWeight: "bold", color: "#2e7d32", display: "block", marginBottom: "12px", fontSize: "16px" }}>
              📂 Chọn nguồn dữ liệu:
            </label>
            <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "15px", color: "#333" }}>
                <input type="radio" name="dataSource" value="default" checked={settings.dataSource === "default"} onChange={(e) => setSettings({...settings, dataSource: e.target.value})} style={{ transform: "scale(1.2)" }} />
                <strong>Default:</strong> Trộn ngẫu nhiên (80% mới, 20% cũ)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "15px", color: "#333" }}>
                <input type="radio" name="dataSource" value="custom" checked={settings.dataSource === "custom"} onChange={(e) => setSettings({...settings, dataSource: e.target.value})} style={{ transform: "scale(1.2)" }} />
                <strong>Sổ Tay:</strong> Ôn lại các từ đã Ghim và Làm sai
              </label>
            </div>
          </div>
        )}

        {/* LỰA CHỌN PART TOEIC (CHỈ DÀNH CHO NGỮ PHÁP) */}
        {mode === "grammar" && (
          <div style={{ marginBottom: "25px", backgroundColor: "#e3f2fd", padding: "15px", borderRadius: "8px", border: "1px solid #bbdefb" }}>
            <label style={{ fontWeight: "bold", color: "#1565c0", display: "block", marginBottom: "12px", fontSize: "16px" }}>
              🎯 Chọn phần thi (TOEIC Part):
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "15px", color: "#333" }}>
                <input type="radio" name="toeicPart" value="scan_skim" checked={settings.toeicPart === "scan_skim"} onChange={(e) => setSettings({...settings, toeicPart: e.target.value})} style={{ transform: "scale(1.2)" }} />
                <strong>🔥 Kỹ năng:</strong> Skimming & Scanning (Đọc lướt & Quét data)
              </label>
            <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "15px", color: "#333" }}>
                <input type="radio" name="toeicPart" value="part5" checked={settings.toeicPart === "part5"} onChange={(e) => setSettings({...settings, toeicPart: e.target.value})} style={{ transform: "scale(1.2)" }} />
                <strong>Part 5:</strong> Hoàn thành câu (Điền từ)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "15px", color: "#333" }}>
                <input type="radio" name="toeicPart" value="part6" checked={settings.toeicPart === "part6"} onChange={(e) => setSettings({...settings, toeicPart: e.target.value})} style={{ transform: "scale(1.2)" }} />
                <strong>Part 6:</strong> Hoàn thành đoạn văn (Email, Thư...)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "15px", color: "#333" }}>
                <input type="radio" name="toeicPart" value="part7" checked={settings.toeicPart === "part7"} onChange={(e) => setSettings({...settings, toeicPart: e.target.value})} style={{ transform: "scale(1.2)" }} />
                <strong>Part 7:</strong> Đọc hiểu đoạn văn
              </label>
            </div>
          </div>
        )}

        {/* ĐỘ KHÓ (LEVEL) */}
        <div style={{ marginBottom: "20px", backgroundColor: "#fff", padding: "15px", borderRadius: "8px", borderLeft: `4px solid ${settings.difficultyLevel === 0 ? "#9C27B0" : settings.difficultyLevel === 1 ? primaryColor : settings.difficultyLevel === 2 ? "#FF9800" : settings.difficultyLevel === 3 ? "#E91E63" : "#F44336"}`, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <label style={{ fontWeight: "bold", color: "#333", display: "block", marginBottom: "8px", fontSize: "16px" }}>
            🔥 Level {settings.difficultyLevel}: 
            <span style={{ color: settings.difficultyLevel === 0 ? "#9C27B0" : settings.difficultyLevel === 1 ? primaryColor : settings.difficultyLevel === 2 ? "#FF9800" : settings.difficultyLevel === 3 ? "#E91E63" : "#F44336", marginLeft: "5px" }}>
              {settings.difficultyLevel === 0 ? "Flashcard 🎴" : settings.difficultyLevel === 1 ? "Cơ Bản" : settings.difficultyLevel === 2 ? "Đa Dạng" : settings.difficultyLevel === 3 ? "Sinh Tồn ❤️" : "Time Attack ⏱️"}
            </span>
          </label>
          <input 
            type="range" 
            min={mode === "grammar" ? "1" : "0"} 
            max="4" step="1" 
            value={settings.difficultyLevel} 
            onChange={(e) => setSettings({...settings, difficultyLevel: parseInt(e.target.value)})} 
            style={{ width: "100%", cursor: "pointer" }} 
          />
        </div>

        {/* THÔNG SỐ ĐẶC BIỆT CHO LEVEL 3 & 4 */}
        {settings.difficultyLevel === 3 && (
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontWeight: "bold", color: "#333", display: "block", marginBottom: "8px" }}>❤️ Số mạng sinh tồn: <span style={{ color: "#E91E63" }}>{settings.survivalLives} mạng</span></label>
              <input type="range" min="1" max="10" step="1" value={settings.survivalLives} onChange={(e) => setSettings({...settings, survivalLives: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer" }} />
            </div>
        )}

        {settings.difficultyLevel === 4 && (
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontWeight: "bold", color: "#333", display: "block", marginBottom: "8px" }}>⏱️ Thời gian bắt đầu: <span style={{ color: "#F44336" }}>{settings.timeAttackSeconds} giây</span></label>
              <input type="range" min="10" max="120" step="5" value={settings.timeAttackSeconds} onChange={(e) => setSettings({...settings, timeAttackSeconds: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer" }} />
            </div>
        )}

        {settings.difficultyLevel <= 2 && (
          <>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontWeight: "bold", color: "#333", display: "block", marginBottom: "8px" }}>
                📚 Số câu mỗi lượt: <span style={{ color: primaryColor }}>{settings.quizLimit}</span>
                {/* {settings.dataSource === "custom" && customWordsCount > 0 && (
                   <span style={{ fontSize: "12px", color: "#F44336", marginLeft: "10px", backgroundColor: "#ffebee", padding: "2px 6px", borderRadius: "4px" }}>(Min: {customWordsCount} từ ở sheet Custom)</span>
                )} */}
              </label>
              <input 
                type="range" 
                min={dynamicMin} 
                max={dynamicMax} 
                step={mode==="grammar" ? 1 : (mode==="vocab" && settings.dataSource==="custom" ? 1 : 5)} 
                value={settings.quizLimit} 
                onChange={(e) => setSettings({...settings, quizLimit: parseInt(e.target.value)})} 
                style={{ width: "100%", cursor: "pointer" }} 
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontWeight: "bold", color: "#333", display: "block", marginBottom: "8px" }}>⏱️ Thời gian/câu: <span style={{ color: "#FF9800" }}>{settings.timePerQuestion}s</span></label>
              <input type="range" min="3" max="60" step="1" value={settings.timePerQuestion} onChange={(e) => setSettings({...settings, timePerQuestion: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer" }} />
            </div>
            
            <div>
              <label style={{ fontWeight: "bold", color: "#333", display: "block", marginBottom: "8px" }}>🔓 Streak mở khóa nút Quay lại: <span style={{ color: "#2196F3" }}>{settings.requiredStreak}</span></label>
              <input type="range" min="1" max="10" step="1" value={settings.requiredStreak} onChange={(e) => setSettings({...settings, requiredStreak: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer" }} />
            </div>
          </>
        )}

      </div>

      <button onClick={handleStart} style={{ width: "100%", padding: "15px", fontSize: "18px", backgroundColor: primaryColor, color: "white", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: "bold", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", marginBottom: "15px" }}>
        🚀 Bắt đầu Học!
      </button>
      <button onClick={() => { playSound("click"); onBack(); }} style={{ width: "100%", padding: "10px", fontSize: "16px", backgroundColor: "#e0e0e0", color: "#555", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: "bold" }}>
        Trở về sảnh
      </button>
    </div>
  );
}

// --- COMPONENT: ÔN TẬP TỪ VỰNG / COLLOCATION CHÍNH ---
function WordQuiz({ mode, onBack, updateGlobal, onSaveWord, onMoveWord, settings, stats, isMusicPlaying, kpi }) {
  const DIFFICULTY_LEVEL = settings.difficultyLevel;
  const QUIZ_LIMIT = DIFFICULTY_LEVEL >= 3 ? 999 : settings.quizLimit; 
  const TIME_PER_QUESTION = settings.timePerQuestion;
  const REQUIRED_STREAK = settings.requiredStreak; 

  const [questionsData, setQuestionsData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [fullVocabData, setFullVocabData] = useState([]);

  const [current, setCurrent] = useState(0); 
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);

  const [lives, setLives] = useState(DIFFICULTY_LEVEL === 3 ? settings.survivalLives : null);
  const [globalTime, setGlobalTime] = useState(DIFFICULTY_LEVEL === 4 ? settings.timeAttackSeconds : null);

  const typingInputRef = useRef(null); 
  const bossInputRefs = useRef([]);
  const [typingValue, setTypingValue] = useState("");
  const [flashcardPhase, setFlashcardPhase] = useState("learn"); // "learn" = Xem thẻ | "test" = Gõ lại
  const [isFlipped, setIsFlipped] = useState(false); // Trạng thái lật thẻ
  const [scrambleAvailable, setScrambleAvailable] = useState([]);
  const [scrambleSelected, setScrambleSelected] = useState([]);

  const typingValueRef = useRef("");
  useEffect(() => { typingValueRef.current = typingValue; }, [typingValue]);
  const scrambleSelectedRef = useRef([]);
  useEffect(() => { scrambleSelectedRef.current = scrambleSelected; }, [scrambleSelected]);

  // THÊM: State lưu trữ đáp án cho câu hỏi Crossword Boss
  const [crosswordInputs, setCrosswordInputs] = useState({});
  const [bossMastered, setBossMastered] = useState({});
  const [bossHinted, setBossHinted] = useState({});

  const handleBossHint = (idx, targetCleanWord) => {
      playSound("click");
      let currentVal = (crosswordInputs[idx] || "").split("");
      let targetArr = targetCleanWord.split("");
      
      let wrongIndices = [];
      for(let i = 0; i < targetArr.length; i++) {
          if ((currentVal[i] || "").toLowerCase() !== targetArr[i].toLowerCase()) {
              wrongIndices.push(i);
          }
      }

      
      if (wrongIndices.length > 0) {
          // Điền đúng 1 chữ cái đang bị sai/thiếu đầu tiên
          let indexToFix = wrongIndices[0];
          currentVal[indexToFix] = targetArr[indexToFix].toUpperCase();
          
          // NẾU TỪ DÀI HƠN 5 CHỮ CÁI -> Khuyến mãi thêm 1 chữ nữa cho nhanh!
          if (wrongIndices.length > 2 && targetArr.length >= 5) {
             let secondIndex = wrongIndices[1];
             currentVal[secondIndex] = targetArr[secondIndex].toUpperCase();
          }
          
          setCrosswordInputs({...crosswordInputs, [idx]: currentVal.join("")});
      }
      if (wrongIndices.length > 0) {
          // ... (Phần logic gợi ý giữ nguyên)
          setCrosswordInputs({...crosswordInputs, [idx]: currentVal.join("")});
          
          // BƯỚC 2: Thêm dòng này vào cuối hàm để ghi chú là "đã dùng hint" cho ô này
          setBossHinted({...bossHinted, [idx]: true}); 
      }
  };

  // THÊM: State quản lý nhập từ khóa bí mật và AI giải thích
  const [keywordInput, setKeywordInput] = useState("");
  const [isKeywordSolved, setIsKeywordSolved] = useState(false);
  const [keywordExplanation, setKeywordExplanation] = useState("");
  const [isFetchingExplanation, setIsFetchingExplanation] = useState(false);
  const fetchedKeywordRef = useRef(null);

  // THÊM: Hàm gọi AI để tra cứu từ khóa
  const fetchKeywordExplanation = async (keyword) => {
      // NẾU TỪ NÀY ĐÃ ĐƯỢC GỌI RỒI THÌ CẤM GỌI LẠI TRÁNH TREO MÁY!
      if (fetchedKeywordRef.current === keyword) return; 
      fetchedKeywordRef.current = keyword;
      
      setIsFetchingExplanation(true);
      try {
          const API_KEY = getActiveKey();
          if (!API_KEY || API_KEY.includes("DÁN_MÃ")) {
              setKeywordExplanation("Không tìm thấy API Key để tra cứu AI.");
              setIsFetchingExplanation(false); return;
          }
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
          const listData = await listRes.json();
          const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
          const flashModel = textModels.find(m => m.name.includes("flash"));
          const selectedModel = flashModel ? flashModel.name : textModels[0].name; 

          const prompt = `Giải thích ngắn gọn ý nghĩa của từ tiếng Anh "${keyword}" bằng tiếng Việt. Cung cấp phiên âm, từ loại, nghĩa chính và 1 ví dụ thực tế. Giữ nội dung xúc tích dưới 4 dòng.`;
          
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${API_KEY}`;
          const res = await fetch(apiUrl, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          const data = await res.json();
          
          // BẮT LỖI TRIỆT ĐỂ: In thẳng lỗi ra màn hình thay vì kẹt loading
          if (data.error) {
              setKeywordExplanation(`Lỗi từ AI: ${data.error.message}`);
          } else if (data.candidates && data.candidates.length > 0) {
              setKeywordExplanation(data.candidates[0].content.parts[0].text);
          } else {
              setKeywordExplanation("AI không thể phân tích từ khóa này.");
          }
      } catch (e) {
          setKeywordExplanation("Lỗi kết nối mạng, không thể lấy giải thích.");
      }
      setIsFetchingExplanation(false);
  };

  const isFetchingDataRef = useRef(false); 

  useEffect(() => {

    if (isFetchingDataRef.current) return;
    isFetchingDataRef.current = true;

    const fetchVocabFromSheets = async () => {
      try {
        const SHEET_ID = "1nAdOxZBZ3-Bawh3Ks54KaIYLPgGZfTuchebwbCYW8dU";
        
        // KIỂM TRA NGUỒN DATA ĐỂ CHỌN SHEET
        let SHEET_NAME = mode === "vocab" ? "Vocab" : "Collocation"; 
        // if (mode === "vocab" && settings.dataSource === "custom") {
        //     SHEET_NAME = "Custom"; // Bắt buộc lấy từ sheet Custom theo yêu cầu
        // }

        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${SHEET_NAME}`;
        const response = await fetch(url);
        const text = await response.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const result = JSON.parse(jsonString);
        // Ép toàn bộ tiêu đề cột Google Sheet về chữ thường để không đánh nhau với AI
        const headers = result.table.cols.map(col => col.label ? col.label.toLowerCase().trim() : "");

        let fullData = result.table.rows.map(row => {
          let obj = {};
          headers.forEach((header, index) => {
            obj[header] = (row.c[index] && row.c[index].v) ? row.c[index].v.toString() : "";
          });
          return obj;
        });

        // --- TÍNH NĂNG MỚI: TRỘN TỪ ĐIỂN AI CÁ NHÂN VÀO KHO TỪ CHÍNH ---
        const personalDictionary = stats?.addedWordsObj || [];
        if (personalDictionary.length > 0) {
            // Lọc bỏ trùng lặp nếu AI và Google Sheet cùng có 1 từ
            const existingWords = new Set(fullData.map(item => item.word.toLowerCase()));
            const uniqueAiWords = personalDictionary.filter(item => !existingWords.has(item.word.toLowerCase()));
            
            // Gộp data từ AI vào chung với data của Google Sheet
            fullData = [...fullData, ...uniqueAiWords];
        }
        
        setFullVocabData(fullData); // Lưu lại bản Data đã được buff thêm sức mạnh AI


        // --- THUẬT TOÁN MỚI: TẠO DATA TỪ SỔ TAY ---
        const savedWords = stats?.savedWords || [];
        const wrongWords = stats?.wrongWords || [];
        const masteredWords = stats?.masteredWords || [];
        
        // ĐÃ FIX: Level 0 (Flashcard) CHỈ lấy từ ô vàng (Ghim thủ công). Các level cao hơn mới trộn thêm ô đỏ (Làm sai nhiều)
        let wordsToLearn = [];
        if (DIFFICULTY_LEVEL === 0) {
            wordsToLearn = [...savedWords];
        } else {
            wordsToLearn = [...masteredWords];
        }
        
        const customWordSet = new Set(wordsToLearn.map(w => w.toLowerCase().trim()));
        let sourceData = fullData;

        // 1. Lọc nguồn Sổ Tay
        if (settings.dataSource === "custom") {
            sourceData = fullData.filter(item => item.word && customWordSet.has(item.word.toLowerCase().trim()));
            
            if (DIFFICULTY_LEVEL > 0 && sourceData.length < 4) {
                alert(`Sổ tay của bạn hiện có ${sourceData.length} từ (Tính cả Ghim & Sai). Bạn cần ít nhất 4 từ để tạo đáp án A B C D cho Level này. Hãy học Default để tích thêm từ hoặc chuyển về Flashcard nhé!`);
                onBack(); 
                return;
            }
            if (DIFFICULTY_LEVEL === 0 && sourceData.length === 0) {
                 alert("Kho 'Ghim thủ công' của bạn đang trống! Hãy ghim thêm từ để học Flashcard nhé.");
                 onBack();
                 return;
            }
        }

        const learnedSet = new Set(stats?.learnedWords || []);
        const newWords = [];
        const oldWords = [];

        sourceData.forEach(item => {
           if (learnedSet.has(item.word)) oldWords.push(item);
           else newWords.push(item);
        });

        const shuffledNew = shuffleArray(newWords);
        const shuffledOld = shuffleArray(oldWords);
        let finalPool = [];

        // 2. Phân phối câu hỏi theo Level (ĐÃ XÓA SẠCH LỖI CODE TRÙNG LẶP)
        // 2. Phân phối câu hỏi theo Level (ĐÃ XÓA SẠCH LỖI CODE TRÙNG LẶP)
        if (DIFFICULTY_LEVEL === 0) {
            if (settings.dataSource === "custom") {
                // FIX LỖI: Ở Sổ Tay, Flashcard cho phép lôi TẤT CẢ từ (cũ + mới) ra để ôn lại
                finalPool = shuffleArray([...shuffledNew, ...shuffledOld]).slice(0, QUIZ_LIMIT);
                
                if (finalPool.length === 0) {
                    alert("Sổ tay của bạn đang trống! Hãy ra ngoài thêm từ vào nhé.");
                    onBack(); return;
                }
            } else {
                // Ở chế độ Default, Flashcard vẫn ưu tiên chỉ học từ mới tinh
                finalPool = shuffledNew.slice(0, QUIZ_LIMIT);
                if (finalPool.length === 0) {
                    alert("🎉 Tuyệt vời! Bạn đã thuộc hết từ mới trong kho. Hãy nâng lên Level 1 hoặc qua Sổ tay ôn tập nhé!");
                    onBack(); return;
                }
            }
        }
        else if (DIFFICULTY_LEVEL >= 3) {
            // Level 3, 4: Trộn hết không cần biết cũ mới
            finalPool = [...shuffledNew, ...shuffledOld, ...shuffledNew, ...shuffledOld, ...sourceData].slice(0, QUIZ_LIMIT);
        } 
        else {
            // Level 1, 2
            if (settings.dataSource === "custom") {
                // Sổ tay: Ưu tiên học từ mới, thiếu thì đắp từ cũ vào ôn lại
                const targetNewCount = Math.min(shuffledNew.length, QUIZ_LIMIT);
                const targetOldCount = QUIZ_LIMIT - targetNewCount;
                const pickNew = shuffledNew.slice(0, targetNewCount);
                const pickOld = shuffledOld.slice(0, targetOldCount);
                finalPool = [...pickNew, ...pickOld]; 
            } else {
                // Default: Luôn giữ tỉ lệ 80% mới / 20% cũ
                const NEW_PERCENT = 0.8;
                let targetNewCount = Math.floor(QUIZ_LIMIT * NEW_PERCENT);
                let targetOldCount = QUIZ_LIMIT - targetNewCount;

                if (shuffledNew.length < targetNewCount) {
                    targetNewCount = shuffledNew.length;
                    targetOldCount = QUIZ_LIMIT - targetNewCount;
                } else if (shuffledOld.length < targetOldCount) {
                    targetOldCount = shuffledOld.length;
                    targetNewCount = QUIZ_LIMIT - targetOldCount;
                }

                const pickNew = shuffledNew.slice(0, targetNewCount);
                const pickOld = shuffledOld.slice(0, targetOldCount);
                finalPool = shuffleArray([...pickNew, ...pickOld]);
            }
        }
        let generatedQs = generateVocabQuestions(finalPool, fullData, DIFFICULTY_LEVEL);
        
        // ... (phần generate generatedQs từ selectedData giữ nguyên
      // === PHẦN TẠO BOSS MỚI TÍCH HỢP AI & XOAY MAP ===
      if (mode === "vocab" && generatedQs.length >= 3) {
          const availableWords = generatedQs.map(q => q); 
          const wordListStr = availableWords.map(w => w.word).join(", ");
          let aiKeywords = []; // Chuyển thành mảng để hứng nhiều từ AI đẻ ra

          // TÍNH TOÁN ĐỘ DÀI RANDOM TỪ 3 - 10 KÝ TỰ (Không vượt quá số từ đang học)
          const maxPossibleLen = Math.min(availableWords.length, 15);
          const targetRandomLen = Math.floor(Math.random() * (maxPossibleLen - 3 + 1)) + 3;

          // 1. GỌI AI ĐỂ SINH DANH SÁCH TỪ KHÓA DỰA TRÊN TỪ VỰNG VỪA HỌC
          try {
              const API_KEY = getActiveKey();
              if (API_KEY && !API_KEY.includes("DÁN_MÃ")) {
                  console.log(`[BOSS] Đang nhờ AI suy nghĩ danh sách từ khóa (tối đa ${maxPossibleLen} ký tự)...`);
                  
                  // --- THÊM: BỘ ĐẾM NGƯỢC 5 GIÂY CHỐNG TREO GAME ---
                  // Nếu sau 5 giây AI không trả lời -> Ép hủy kết nối để game load ngay!
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 10000);

                  // BƯỚC 1: Lấy danh sách Model chuẩn xác nhất từ Google
                  const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`, { signal: controller.signal });
                  const listData = await listRes.json();
                  const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
                  
                  // Chọn model 1.5-flash hoặc model khả dụng đầu tiên
                  const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
                  const selectedModel = flashModel ? flashModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");

                  // BƯỚC 2: Gọi AI bằng Model tự động
                  const prompt = `Tôi vừa học các từ vựng tiếng Anh sau: ${wordListStr}. Hãy nghĩ ra 10 từ khóa tiếng Anh bí mật khác nhau.
                  YÊU CẦU BẮT BUỘC:
                  - Độ dài mỗi từ khóa nằm trong khoảng từ 3 đến ${maxPossibleLen} chữ cái.
                  - Từ khóa phải liên quan đến chủ đề chung của các từ vựng trên, hoặc mang ý nghĩa cổ vũ (như WIN, FOCUS, MASTER, SUCCESS).
                  - CHỈ TRẢ VỀ DANH SÁCH 10 TỪ, phân tách nhau bằng dấu phẩy (,). Không giải thích gì thêm, viết hoa toàn bộ.`;
                  
                  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${API_KEY}`;
                  const res = await fetch(apiUrl, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                      signal: controller.signal // Ép bộ đếm ngược vào lệnh gọi AI
                  });
                  
                  clearTimeout(timeoutId); // Giải trừ bom hẹn giờ nếu AI trả lời sớm hơn 5s

                  const data = await res.json();
                  if (data.candidates && data.candidates.length > 0) {
                      const rawText = data.candidates[0].content.parts[0].text;
                      
                      // Tách chuỗi của AI thành mảng, lọc rác
                      aiKeywords = rawText.split(',')
                          .map(w => w.trim().toUpperCase().replace(/[^A-Z]/g, ''))
                          .filter(w => w.length >= 3 && w.length <= maxPossibleLen);
                          
                      console.log("[BOSS] AI đề xuất danh sách từ khóa:", aiKeywords);
                  }
              }
          } catch (e) { 
              console.log("[BOSS] Mạng chậm hoặc AI đang bận, hủy kết nối dùng từ khóa dự phòng để vào game ngay."); 
          }

          // 2. TẠO MẠNG LƯỚI CROSSWORD TỪ TỪ KHÓA
          // PHỤC HỒI LẠI DANH SÁCH TỪ KHÓA DỰ PHÒNG XỊN SÒ (Của bác đang bị mất, chỉ còn chữ "WIN")
          const fallbacks = ["WIN", "TOP", "PRO", "YES", "BEST", "GOOD", "FAST", "LEAD", "SMART", "GREAT", "FOCUS", "SUPER", "EXPERT", "MASTER", "WINNER", "GENIUS", "SUCCESS", "CHAMPION", "BRILLIANT"];
          
          let validFallbacks = fallbacks.filter(w => w.length <= maxPossibleLen);
          validFallbacks = shuffleArray(validFallbacks); 
          validFallbacks.sort((a, b) => Math.abs(a.length - targetRandomLen) - Math.abs(b.length - targetRandomLen));
          
          // Ép hệ thống ưu tiên thử TOÀN BỘ danh sách từ khóa AI vừa nghĩ ra trước. Nếu xịt hết mới tới fallbacks!
          let keywordsToTry = [...aiKeywords, ...validFallbacks];

          let bossWords = [];
          let valid = false;
          let finalKeyword = "";

          // --- BỘ LỌC X-QUANG: Lột sạch (n), (v), (adj) trước khi xếp chữ ---
          const getCleanStr = (raw) => raw.replace(/\s*\(.*?\)\s*/g, '').trim();

          for (let targetKeyword of keywordsToTry) {
              for (let attempt = 0; attempt < 20; attempt++) {
                  bossWords = [];
                  valid = true;
                  for (let i = 0; i < targetKeyword.length; i++) {
                      const char = targetKeyword[i].toLowerCase();
                      
                      // CHỈ SO SÁNH VỚI CHỮ ĐÃ LỘT SẠCH TAG
                      let candidates = availableWords.filter(item => item.word && getCleanStr(item.word).toLowerCase().includes(char));
                      if (candidates.length === 0) { valid = false; break; }
                      
                      let picked = shuffleArray(candidates).find(c => !bossWords.some(bw => bw.word === c.word));
                      if (!picked) { valid = false; break; }
                      
                      let cleanWordText = getCleanStr(picked.word);
                      let charIndex = cleanWordText.toLowerCase().indexOf(char);
                      
                      // Lưu thêm trường cleanWord để dùng cho bản đồ
                      bossWords.push({ ...picked, cleanWord: cleanWordText, alignIdx: charIndex });
                  }
                  if (valid && bossWords.length === targetKeyword.length) break;
              }
              if (valid) { finalKeyword = targetKeyword; break; }
          }

          if (valid) {
              // 3. CHỌN NGẪU NHIÊN BẢN ĐỒ DỌC HOẶC NGANG
              const isVerticalMap = Math.random() > 0.5;

              // ĐÃ FIX: Push (thêm nối tiếp) câu Boss vào cuối thay vì ghi đè làm mất 1 từ vựng của người dùng
              generatedQs.push({
                  type: "crossword_boss",
                  words: bossWords,
                  keyword: finalKeyword,
                  isVerticalKeyword: isVerticalMap, // Lưu trạng thái xoay Map
                  question: "Thử thách cuối cùng - Ghép từ bạn vừa học!",
                  answer: "WIN"
              });
              console.log(`[BOSS] Chốt Boss! Từ khóa: ${finalKeyword} | Chiều: ${isVerticalMap ? "Dọc" : "Ngang"}`);
          }
      }

      setQuestionsData(generatedQs);
      } catch (error) {
        console.error(`Lỗi đồng bộ ${mode}:`, error);
      } finally {
        setLoadingData(false);
      }
    };
    fetchVocabFromSheets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [answerStatus, setAnswerStatus] = useState(null); 
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!loadingData && current < questionsData.length && selected === null && !isGameOver) {
        const currentQ = questionsData[current];
        
        // Câu nói chung cho các câu hỏi bằng tiếng Việt (Hỏi từ tiếng Anh tương ứng là gì)
        const defaultEnglishPrompt = "How do you say this in English?";
        
        if (currentQ.type === "typing") {
            typingInputRef.current?.focus();
            speakWord(defaultEnglishPrompt, 'en-US');
            
        } else if (currentQ.type === "scramble") {
            const letters = currentQ.answer.split('').map((char, index) => ({ id: index, char }));
            setScrambleAvailable(shuffleArray(letters));
            setScrambleSelected([]);
            speakWord(defaultEnglishPrompt, 'en-US');
            
        } else if (currentQ.type === "listening") {
            speakWord(currentQ.word, 'en-US'); 
            
        } else if (currentQ.type === "en_to_vn") {
            speakWord(`What does ${currentQ.word} mean?`, 'en-US'); 
            
        } else if (currentQ.type === "vn_to_en") {
            speakWord(defaultEnglishPrompt, 'en-US');
        }
    }
  }, [current, loadingData, questionsData, selected, isGameOver]);

  useEffect(() => {
    if (selected !== null || loadingData || isGameOver || DIFFICULTY_LEVEL === 4) return;
    
    // ĐÓNG BĂNG THỜI GIAN KHI GẶP TRÙM CUỐI
    if (questionsData[current]?.type === "crossword_boss") return;
    if (DIFFICULTY_LEVEL === 0) return;

    // --- TÍNH NĂNG MỚI: TỰ ĐỘNG NỘP BÀI KHI HẾT GIỜ ---
    if (timeLeft <= 0) { 
        const currentQ = questionsData[current];
        
        // 1. Nếu là câu gõ chữ và đang có nội dung -> Lấy đi chấm điểm!
        if (currentQ?.type === "typing" && typingValueRef.current.trim() !== "") {
            handleAnswer(typingValueRef.current);
            return;
        }
        // 2. Nếu là câu xếp chữ và đã kéo ít nhất 1 chữ -> Gộp lại lấy đi chấm điểm!
        if (currentQ?.type === "scramble" && scrambleSelectedRef.current.length > 0) {
            const word = scrambleSelectedRef.current.map(item => item.char).join('');
            handleAnswer(word);
            return;
        }
        
        // 3. Trường hợp chưa gõ gì hoặc câu trắc nghiệm -> Thu bài trắng (Hết giờ)
        handleAnswer(null); 
        return; 
    }
    
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, selected, loadingData, isGameOver, DIFFICULTY_LEVEL, current, questionsData]);

  useEffect(() => {
    if (DIFFICULTY_LEVEL !== 4 || isGameOver || loadingData) return;
    const timer = setInterval(() => {
        setGlobalTime(prev => {
            if (prev <= 1) {
                setIsGameOver(true);
                playSound("timeout");
                return 0;
            }
            return prev - 1;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [isGameOver, loadingData, DIFFICULTY_LEVEL]);

  useEffect(() => {
      if (DIFFICULTY_LEVEL === 3 && lives !== null && lives <= 0) setIsGameOver(true);
  }, [lives, DIFFICULTY_LEVEL]);

  // HIỆU ỨNG PHÁO HOA X3 LẦN KHI KẾT THÚC BÀI
  useEffect(() => {
    const isFinished = isGameOver || (DIFFICULTY_LEVEL < 3 && questionsData.length > 0 && current >= questionsData.length);
    if (isFinished && DIFFICULTY_LEVEL < 3) {
      let count = 0;
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, zIndex: 9999 });
      count++;
      const interval = setInterval(() => {
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, zIndex: 9999 });
        count++;
        if (count >= 3) clearInterval(interval);
      }, 600);
      return () => clearInterval(interval);
    }
  }, [isGameOver, current, questionsData.length, DIFFICULTY_LEVEL]);

  // --- ĐẠO DIỄN ÂM NHẠC: CHỈ BẬT NHẠC Ở MÀN TRÙM CUỐI ---
  useEffect(() => {
    if (loadingData || questionsData.length === 0) return;

    const currentQ = questionsData[current];
    
    // Nếu đang ở câu Boss, game chưa kết thúc và người dùng đang bật nhạc -> Nổi nhạc lên!
    if (currentQ?.type === "crossword_boss" && !isGameOver && isMusicPlaying) {
        globalBgm.play().catch(e => console.log("Lỗi phát nhạc Boss:", e));
    } else {
        // Tắt nhạc khi ở các câu thường, hoặc khi đã qua màn
        globalBgm.pause();
    }

    // Đảm bảo tắt nhạc nếu người dùng bấm nút "Thoát" giữa chừng
    return () => globalBgm.pause();
  }, [current, questionsData, isGameOver, loadingData, isMusicPlaying]);

  const encourages = ["Không sao, thử lại nhé! 💪", "Cẩn thận xíu nào! 🌱", "Gần đúng rồi! 😅"];

  const handleComboRewards = (newStreak) => {
    if (newStreak === 1) {
      playSound("combo_1");
      return "Tuyệt vời! 👍";
    } else if (newStreak === 2) {
      playSound("combo_2");
      return "COMBO x2! Khá lắm! ⭐";
    } else if (newStreak === 3) {
      playSound("combo_3");
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } }); 
      return "🔥 COMBO x3! Đang đà xông lên! 🔥";
    } else if (newStreak === 4) {
      playSound("combo_4");
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } }); 
      return "⚡ COMBO x4! Quá nhạy bén! ⚡";
    } else {
      playSound("combo_max");
      confetti({ particleCount: 300, spread: 120, origin: { y: 0.4 } }); 
      return `👑 UNSTOPPABLE x${newStreak}! Thần đồng! 👑`;
    }
  };

  const handleAnswer = (userAnswer) => {
    if (isGameOver) return;
    const isTimeout = userAnswer === null;
    const actualOption = isTimeout ? "TIMEOUT" : userAnswer;
    setSelected(actualOption);

    const currentQ = questionsData[current];
    let isCorrect = false;

    if (!isTimeout) {
       // ĐÃ FIX: Bổ sung Flashcard vào danh sách miễn trừ phân biệt viết hoa/viết thường
       if (currentQ.type === "typing" || currentQ.type === "scramble" || currentQ.type === "flashcard") {
           isCorrect = actualOption.trim().toLowerCase() === currentQ.answer.trim().toLowerCase();
       } else {
           isCorrect = actualOption === currentQ.answer;
       }
    }
    
    updateGlobal(mode, isCorrect, currentQ.word);

    if (isCorrect) {
      const newStreak = streak + 1;
      setScore(score + 1);
      setStreak(newStreak); 

      if (currentQ.type === "crossword_boss") {
          playSound("finish");
          setIsGameOver(true);
          return; // Dừng hàm lại đây, không hiện thêm bảng Feedback bên dưới nữa!
      }
      
      const msg = handleComboRewards(newStreak);
      setAnswerStatus({ type: "correct", streak: newStreak, text: msg });
      
      if (DIFFICULTY_LEVEL === 4) setGlobalTime(t => t + 3); 
    } else {
      playSound(isTimeout ? "timeout" : "wrong");
      setStreak(0); 
      
      if (DIFFICULTY_LEVEL === 3) {
          setLives(l => l - 1); 
          setAnswerStatus({ type: "wrong", streak: 0, text: isTimeout ? "⏰ Hết giờ! -1 ❤️" : "❌ Sai rồi! -1 ❤️" });
      } else if (DIFFICULTY_LEVEL === 4) {
          setGlobalTime(t => t - 5); 
          setAnswerStatus({ type: "wrong", streak: 0, text: "❌ Sai rồi! Bị trừ 5 giây!" });
      } else {
          setAnswerStatus({ type: "wrong", streak: 0, text: isTimeout ? "⏰ Hết giờ mất rồi!" : encourages[Math.floor(Math.random() * encourages.length)] });
          setQuestionsData((prev) => {
            const newData = [...prev];
            
            // 1. TẠM CẤT TRÙM CUỐI (BOSS) ĐI ĐỂ BẢO VỆ VỊ TRÍ CUỐI CÙNG
            let bossItem = null;
            if (newData.length > 0 && newData[newData.length - 1].type === "crossword_boss") {
                bossItem = newData.pop();
            }

            // Tính toán vị trí chèn sau khi đã cất Boss
            const remaining = newData.length - current - 1;
            let insertIndex = newData.length; 
            if (remaining > 3) insertIndex = current + 2 + Math.floor(Math.random() * (remaining - 1));
            
            // 2. LẤY LẠI CHÍNH CÂU VỪA SAI LÀM CÂU PHẠT (Học từ vựng thì sai đâu phạt đó mới nhớ lâu)
            let penaltyItem = {...newData[current]};
            // ĐÃ FIX TRÁNH SẬP WEB: Chỉ trộn đáp án nếu câu đó là trắc nghiệm (có options)
            if (penaltyItem.options) {
                penaltyItem.options = shuffleArray([...penaltyItem.options]); 
            }
            newData.splice(insertIndex, 0, penaltyItem);

            // 4. TRẢ BOSS VỀ LẠI VỊ TRÍ CHỐT HẠ ĐỂ KẾT GAME
            if (bossItem) {
                newData.push(bossItem);
            }

            return newData;
          });
      }
    }
  };

 // --- THÊM TÍNH NĂNG: ẤN ENTER ĐỂ QUA CÂU HOẶC HOÀN THÀNH BOSS ---
  useEffect(() => {
    const handleEnterKey = (e) => {
        const currentQ = questionsData[current];
        if (!currentQ) return;

        // --- PHÍM SPACE: Lật thẻ flashcard (TÁCH RIÊNG khỏi Enter) ---
        if (e.code === "Space" && currentQ.type === "flashcard" && flashcardPhase === "learn") {
            const tag = document.activeElement?.tagName;
            if (tag !== "INPUT" && tag !== "TEXTAREA") {
                e.preventDefault();
                document.activeElement?.blur(); // Trả focus khỏi button nếu có
                playSound("click");
                setIsFlipped(prev => !prev);
                return;
            }
        }

        // --- PHÍM V: Đọc từ tiếng Anh (TÁCH RIÊNG khỏi Enter) ---
        if ((e.key === "v" || e.key === "V") && currentQ.type === "flashcard" && flashcardPhase === "learn") {
            const tag = document.activeElement?.tagName;
            if (tag !== "INPUT" && tag !== "TEXTAREA") {
                e.preventDefault();
                speakWord(currentQ.word, 'en-US');
                return;
            }
        }

        if (e.key === "Enter") {
            // 1. Chuyển câu tiếp theo nếu đang hiện giải thích (đã trả lời xong)
            if (selected !== null && answerStatus !== null && currentQ.type !== "crossword_boss") {
                e.preventDefault();
                nextQuestion();
                return;
            }

            // 2. Nhấn Hoàn Thành khi làm xong Boss (Chỉ khi đã giải mã xong từ khóa)
            if (currentQ.type === "crossword_boss" && !isGameOver) {
                const isAllCorrect = currentQ.words.every((item, idx) => 
                    (crosswordInputs[idx] || "").toLowerCase().trim() === item.word.toLowerCase().trim()
                );
                // Đã điền xong map VÀ đã gõ đúng từ khóa
                if (isAllCorrect && isKeywordSolved) {
                    e.preventDefault();
                    handleAnswer("WIN");
                }
            }

            // 3. Nhấn Enter để chuyển sang chế độ gõ từ (Flashcard)
            if (currentQ.type === "flashcard" && flashcardPhase === "learn") {
                e.preventDefault();
                playSound("click");
                setFlashcardPhase("test");
                setTypingValue("");
                setTimeout(() => typingInputRef.current?.focus(), 100);
            }
        }
    };

    window.addEventListener("keydown", handleEnterKey);
    return () => window.removeEventListener("keydown", handleEnterKey);
  }, [current, questionsData, selected, answerStatus, isGameOver, crosswordInputs, flashcardPhase]); // <- Đã cập nhật mảng phụ thuộc

  // --- THÊM TÍNH NĂNG: GỌI AI CHUẨN BỊ TRƯỚC BÀI GIẢI THÍCH KHI VỪA GẶP BOSS ---
  useEffect(() => {
    const currentQ = questionsData[current];
    if (currentQ && currentQ.type === "crossword_boss") {
        fetchKeywordExplanation(currentQ.keyword);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, questionsData]); // Đã xóa bỏ các điều kiện dễ gây lặp vô tận

  // --- THÊM TÍNH NĂNG: GÕ BÀN PHÍM CHO CÂU HỎI XẾP CHỮ (SCRAMBLE) ---
  useEffect(() => {
    const currentQ = questionsData[current];
    // Chỉ kích hoạt khi đang ở câu xếp chữ, game đang chạy và chưa nộp bài
    if (!currentQ || currentQ.type !== "scramble" || selected !== null || isGameOver) return;

    const handleKeyDown = (e) => {
        // Bỏ qua nếu người dùng đang xài phím tắt (Ctrl+R, Alt+Tab...)
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const key = e.key.toLowerCase();

        // 1. Nếu ấn Enter -> Nộp bài (chỉ nộp được khi đã kéo hết chữ)
        if (key === "enter") {
            e.preventDefault();
            if (scrambleAvailable.length === 0) {
                submitScramble();
            }
            return;
        }

        // 2. Nếu ấn Backspace (Nút Xóa) -> Trả lại ký tự cuối cùng vừa chọn
        if (key === "backspace") {
            e.preventDefault();
            if (scrambleSelected.length > 0) {
                const lastItem = scrambleSelected[scrambleSelected.length - 1];
                handleScrambleClick(lastItem, false);
            }
            return;
        }

        // 3. Nếu ấn các phím chữ cái (A-Z)
        if (/^[a-z]$/.test(key)) {
            // Tìm chữ cái đó trong rổ (nếu chữ đó có tồn tại thì mới cho nhặt)
            const foundItem = scrambleAvailable.find(item => item.char.toLowerCase() === key);
            if (foundItem) {
                handleScrambleClick(foundItem, true);
            }
        }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, questionsData, selected, isGameOver, scrambleAvailable, scrambleSelected]);

  const handleScrambleClick = (letterObj, fromAvailable) => {
      if (selected !== null) return;
      playSound("click");
      if (fromAvailable) {
          setScrambleAvailable(prev => prev.filter(item => item.id !== letterObj.id));
          setScrambleSelected(prev => [...prev, letterObj]);
      } else {
          setScrambleSelected(prev => prev.filter(item => item.id !== letterObj.id));
          setScrambleAvailable(prev => [...prev, letterObj]);
      }
  };

  const submitScramble = () => {
      const word = scrambleSelected.map(item => item.char).join('');
      handleAnswer(word);
  };

  const handleTypingSubmit = (e) => {
      e.preventDefault();
      if(typingValue.trim() !== "") {
          handleAnswer(typingValue);
      }
  }

  const nextQuestion = () => {
    playSound("click");
    setSelected(null);
    setAnswerStatus(null); 
    setTypingValue(""); 
    setCrosswordInputs({});

    // --- THÊM 2 DÒNG NÀY ---
    setFlashcardPhase("learn");
    setIsFlipped(false);

    setKeywordInput("");
    setIsKeywordSolved(false);
    setKeywordExplanation("");

    const nextIdx = current + 1;
    setCurrent(nextIdx);
    setTimeLeft(TIME_PER_QUESTION); 
    if (nextIdx >= questionsData.length && DIFFICULTY_LEVEL < 3) playSound("finish");
  };

  const handleBackToHome = () => {
    playSound("click");
    onBack(); 
  };

  // ĐÃ FIX: Thông báo Loading xịn xò đổi theo từng Level
  if (loadingData || questionsData.length === 0) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "50px" }}>
        <h2>
          {DIFFICULTY_LEVEL === 0 ? "Đang chuẩn bị thẻ bài... 🎴" : "Đang tải dữ liệu... ⏳"}
        </h2>
      </div>
    );
  }

  if (isGameOver || (DIFFICULTY_LEVEL < 3 && current >= questionsData.length)) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <h1 style={{ color: DIFFICULTY_LEVEL >= 3 ? "#F44336" : "#4CAF50" }}>
          {DIFFICULTY_LEVEL >= 3 ? "Game Over ☠️" : "Hoàn thành 🎉"}
        </h1>
        <h2>
          {DIFFICULTY_LEVEL === 3 && `Bạn đã sống sót qua ${score} câu!`}
          {DIFFICULTY_LEVEL === 4 && `Bạn đạt tốc độ trả lời đúng ${score} câu!`}
          {DIFFICULTY_LEVEL < 3 && "Bạn đã ôn tập xong phiên này!"}
        </h2>
        
        <div style={{ margin: "20px auto", padding: "20px", backgroundColor: "#f9f9f9", borderRadius: "12px", maxWidth: "300px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", border: "1px solid #eee" }}>
          <p style={{ fontSize: "18px", margin: "10px 0", color: "#4CAF50", fontWeight: "bold" }}>✅ Trả lời đúng: {score}</p>
          {DIFFICULTY_LEVEL < 3 && <p style={{ fontSize: "18px", margin: "10px 0", color: "#F44336", fontWeight: "bold" }}>❌ Trả lời sai: {current - score}</p>}
        </div>
        <button className="next" onClick={handleBackToHome}>Về trang chủ</button>
      </div>
    );
  }

  const currentQ = questionsData[current];
  const timePercentage = (timeLeft / TIME_PER_QUESTION) * 100;

  let comboClass = "";
  if (answerStatus) {
      if (answerStatus.type === "wrong" || answerStatus.type === "timeout") comboClass = "feedback-wrong";
      else if (answerStatus.streak >= 5) comboClass = "combo-max";
      else if (answerStatus.streak === 4) comboClass = "combo-4";
      else if (answerStatus.streak === 3) comboClass = "combo-3";
      else if (answerStatus.streak === 2) comboClass = "combo-2";
      else comboClass = "combo-1";
  }

  return (
    <div className="container" style={{ 
        maxWidth: (currentQ && currentQ.type === "crossword_boss") ? "750px" : "450px", 
        transition: "max-width 0.5s ease-in-out" 
    }}>
      {/* THANH THÔNG TIN TỐI GIẢN */}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", height: "40px", marginBottom: "15px", gap: "10px" }}>
        
        {/* HỘP BÊN TRÁI: CHỨA NÚT BACK (Luôn mở khóa ở Level 0) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", overflow: "hidden" }}>
          {DIFFICULTY_LEVEL < 3 && (
            <button 
              onClick={() => { 
                // CHẶN CỬA BẰNG KỶ LUẬT THÉP
                if (kpi && kpi.target > 0 && kpi.current < kpi.target) {
                    playSound("wrong");
                    alert(`❌ KỶ LUẬT THÉP! Bạn mới thuộc được ${kpi.current}/${kpi.target} từ hôm nay. KHÔNG ĐƯỢC THOÁT, HÃY CÀY TIẾP ĐI!`);
                    return;
                }
                if(streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) { handleBackToHome(); }
              }} 
              style={{ 
                padding: "6px 10px", fontSize: "13px", 
                cursor: (kpi && kpi.target > 0 && kpi.current < kpi.target) ? "not-allowed" : ((streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "pointer" : "not-allowed"), 
                backgroundColor: (kpi && kpi.target > 0 && kpi.current < kpi.target) ? "#ffebee" : ((streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "#e8f5e9" : "#f0f0f0"), 
                color: (kpi && kpi.target > 0 && kpi.current < kpi.target) ? "#d32f2f" : ((streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "#2e7d32" : "#999"), 
                border: (kpi && kpi.target > 0 && kpi.current < kpi.target) ? "1px solid #f44336" : "1px solid #ccc", 
                borderRadius: "6px", fontWeight: "bold", whiteSpace: "nowrap", margin: 0, flexShrink: 0 
              }}
            >
              {(kpi && kpi.target > 0 && kpi.current < kpi.target) ? `🔒 Bị khóa (${kpi.current}/${kpi.target})` : ((streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "⬅ 🔓" : `⬅ 🔒 ${streak}/${REQUIRED_STREAK}`)}
            </button>
          )}
        </div>

        {/* HỘP Ở GIỮA: CHỨA ĐỒNG HỒ (ẨN ĐI NẾU LÀ LEVEL 0) */}
        {DIFFICULTY_LEVEL !== 0 && (
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "#fff", padding: "4px 12px", borderRadius: "20px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)", border: "1px solid #eee", flexShrink: 0 }}>
            {(currentQ.type === "en_to_vn" || currentQ.type === "listening") && (
              <button 
                onClick={() => speakWord(currentQ.word)}
                style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid #bbdefb", backgroundColor: "#e3f2fd", color: "#1976D2", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "16px", padding: 0, margin: 0, flexShrink: 0 }}
              >
                🔊
              </button>
            )}
            <span style={{ fontWeight: "bold", color: (DIFFICULTY_LEVEL===4 ? globalTime : timeLeft) <= 5 ? "#f44336" : "#333", fontSize: "15px", minWidth: "35px", textAlign: "center", whiteSpace: "nowrap", flexShrink: 0 }}>
              {currentQ.type === "crossword_boss" ? "⏳ Vô cực" : `⏱️ ${DIFFICULTY_LEVEL === 4 ? globalTime : timeLeft}s`}
            </span>
          </div>
        )}

        {/* HỘP BÊN PHẢI: CHỨA ĐIỂM / MẠNG (ĐÃ THÊM FLEX 1 ĐỂ ÉP CÂN BẰNG TỶ LỆ) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          {DIFFICULTY_LEVEL === 3 ? (
              <div style={{ 
                  display: "flex", alignItems: "center", gap: "4px", fontSize: "14px", whiteSpace: "nowrap", flexShrink: 0,
                  padding: lives === 1 ? "4px 10px" : "0",
                  backgroundColor: lives === 1 ? "#ffebee" : "transparent",
                  border: lives === 1 ? "1px solid #f44336" : "none",
                  borderRadius: "12px",
                  color: lives === 1 ? "#d32f2f" : "#E91E63",
                  fontWeight: "bold",
                  animation: lives === 1 ? "heartbeat 0.8s infinite" : "none",
                  boxShadow: lives === 1 ? "0 0 8px rgba(244, 67, 54, 0.6)" : "none"
              }}>
                 {lives === 1 ? "🔥 MẠNG CUỐI" : `${lives}x❤️`}
              </div>
            ) : (
              <span style={{ color: "#666", fontSize: "13px", whiteSpace: "nowrap", fontWeight: "bold", flexShrink: 0 }}>
                {DIFFICULTY_LEVEL === 4 ? `Đúng: ${score}` : `${current + 1}/${questionsData.length}`}
              </span>
            )}
        </div>
        
      </div>

      {DIFFICULTY_LEVEL > 0 && DIFFICULTY_LEVEL < 4 && currentQ?.type !== "crossword_boss" && (
        <div style={{ width: "100%", height: "8px", backgroundColor: "#e0e0e0", borderRadius: "4px", overflow: "hidden", marginBottom: "20px" }}>
          <div style={{ height: "100%", width: `${timePercentage}%`, backgroundColor: timeLeft <= 3 ? "#f44336" : "#2196F3", transition: "width 1s linear" }} />
        </div>
      )}

      {/* --- CÁC KIỂU CÂU HỎI --- */}

      {/* GIAO DIỆN BẢN ĐỒ CROSSWORD CÓ TỪ KHÓA ẨN */}
      {currentQ.type === "crossword_boss" && (
        <div style={{ textAlign: "left", animation: "popIn 0.5s ease-out" }}>
          <h2 style={{ fontSize: "22px", color: "#2c3e50", textAlign: "center", textTransform: "uppercase" }}>🧩 Vượt Ải Ô Chữ</h2>
          <p style={{ color: "#F44336", textAlign: "center", marginBottom: "20px", fontWeight: "bold", fontSize: "14px" }}>Điền từ để tìm TỪ KHÓA BÍ ẨN dọc màu cam!</p>

          {/* VẼ BẢN ĐỒ MAP CROSSWORD */}
          {/* VẼ BẢN ĐỒ MAP CROSSWORD TỰ ĐỘNG XOAY CHIỀU */}
          <div style={{ 
              display: "flex", 
              flexDirection: currentQ.isVerticalKeyword ? "column" : "row", 
              gap: "6px", 
              justifyContent: "center", 
              alignItems: "center", 
              marginBottom: "30px", 
              padding: "20px", 
              backgroundColor: "#f0f8ff", 
              borderRadius: "12px", 
              overflowX: "auto" 
          }}>
             {currentQ.words.map((item, idx) => {
                 const userInput = (crosswordInputs[idx] || "").toLowerCase();
                 const maxShift = Math.max(...currentQ.words.map(w => w.alignIdx));
                 const marginBoxes = maxShift - item.alignIdx; 
                 const isCorrectWord = userInput.trim() === item.cleanWord.toLowerCase().trim();

                 return (
                     <div key={`grid-${idx}`} style={{ 
                         display: 'flex', 
                         flexDirection: currentQ.isVerticalKeyword ? "row" : "column",
                         marginLeft: currentQ.isVerticalKeyword ? `${marginBoxes * 32}px` : "0",
                         marginTop: !currentQ.isVerticalKeyword ? `${marginBoxes * 32}px` : "0",
                         alignSelf: "flex-start" 
                     }}>
                         {item.cleanWord.split('').map((char, charIdx) => {
                             const isKeywordChar = charIdx === item.alignIdx; 
                             const userChar = userInput[charIdx] || "";
                             
                             return (
                                 <div key={`cell-${idx}-${charIdx}`} style={{
                                     width: '28px', height: '28px', 
                                     margin: currentQ.isVerticalKeyword ? "0 2px" : "2px 0",
                                     border: isCorrectWord ? '2px solid #4CAF50' : (isKeywordChar ? '2px solid #FF9800' : '1px solid #ccc'),
                                     backgroundColor: isKeywordChar ? '#ffe0b2' : (isCorrectWord ? '#e8f5e9' : '#fff'),
                                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                                     fontWeight: 'bold', textTransform: 'uppercase', fontSize: '15px', color: isKeywordChar ? "#e65100" : "#333",
                                     boxShadow: isKeywordChar ? "0 0 8px rgba(255, 152, 0, 0.6)" : "none",
                                     zIndex: isKeywordChar ? 2 : 1
                                 }}>
                                     {userChar}
                                 </div>
                             )
                         })}
                     </div>
                 )
             })}
          </div>

          {/* KHUNG NHẬP LIỆU CÂU HỎI (ĐÃ NÂNG CẤP GỢI Ý + LƯU SỔ TAY) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
             {currentQ.words.map((item, idx) => {
                 const isCorrect = (crosswordInputs[idx] || "").toLowerCase().trim() === item.cleanWord.toLowerCase().trim();
                 return (
                     <div key={`input-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px", backgroundColor: isCorrect ? "#e8f5e9" : "#fff", borderRadius: "8px", border: isCorrect ? "2px solid #4CAF50" : "1px solid #ddd" }}>
                         
                         {/* Cột 1: Số thứ tự */}
                         <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: isCorrect ? "#4CAF50" : "#2196F3", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", flexShrink: 0, marginTop: "2px" }}>{idx + 1}</div>
                         
                         {/* Cột 2: Nội dung */}
                         <div style={{ flex: 1 }}>
                             <div style={{ fontSize: "14px", fontWeight: "bold", color: "#444", marginBottom: "6px", lineHeight: "1.4" }}>{item.meaning}</div>
                             
                             <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                 <input
                                     ref={(el) => bossInputRefs.current[idx] = el} 
                                     type="email"
                                     value={crosswordInputs[idx] || ""}
                                     onChange={(e) => {
                                         const val = e.target.value.replace(/[^a-zA-Z\s-]/g, '');
                                         setCrosswordInputs({...crosswordInputs, [idx]: val});
                                         
                                         if (val.toLowerCase().trim() === item.cleanWord.toLowerCase().trim()) {
                                             let nextIdx = -1;
                                             for (let i = idx + 1; i < currentQ.words.length; i++) {
                                                 const targetWord = currentQ.words[i].cleanWord.toLowerCase().trim();
                                                 const curVal = (crosswordInputs[i] || "").toLowerCase().trim();
                                                 if (curVal !== targetWord) { nextIdx = i; break; }
                                             }
                                             if (nextIdx === -1) {
                                                 for (let i = 0; i < idx; i++) {
                                                     const targetWord = currentQ.words[i].cleanWord.toLowerCase().trim();
                                                     const curVal = (crosswordInputs[i] || "").toLowerCase().trim();
                                                     if (curVal !== targetWord) { nextIdx = i; break; }
                                                 }
                                             }
                                             if (nextIdx !== -1 && bossInputRefs.current[nextIdx]) {
                                                 setTimeout(() => bossInputRefs.current[nextIdx].focus(), 50);
                                             }
                                         }
                                     }}
                                     disabled={isCorrect}
                                     maxLength={item.cleanWord.length}
                                     placeholder={`${item.cleanWord.length} CHỮ CÁI...`}
                                     style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #ccc", textTransform: "uppercase", outline: "none", backgroundColor: isCorrect ? "#c8e6c9" : "#f9f9f9", fontWeight: "bold", fontSize: "15px", letterSpacing: "1px", minWidth: "0" }}
                                 />
                                 
                                 {/* NÚT CHỨC NĂNG BÊN PHẢI INPUT */}
                                 {!isCorrect ? (
                                     <button 
                                         onClick={() => handleBossHint(idx, item.cleanWord)}
                                         style={{ padding: "10px", backgroundColor: "#FF9800", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flexShrink: 0 }}
                                         title="Nhận gợi ý chữ cái"
                                     >
                                         💡
                                     </button>
                                 ) : (
                                     bossMastered[idx] ? (
                                         <span style={{ padding: "10px 0", color: "#2e7d32", fontWeight: "bold", fontSize: "14px", whiteSpace: "nowrap", flexShrink: 0 }}>✅ Đã lưu</span>
                                     ) : (
                                         <button 
                                             onClick={() => { 
                                                 playSound("click");
                                                 onMoveWord(mode, "savedWords", "masteredWords", item.word); 
                                                 setBossMastered({...bossMastered, [idx]: true}); 
                                             }}
                                             // Nếu 'bossHinted[idx]' là true ->Disabled, đổi màu sang xám
                                             disabled={bossHinted[idx]}
                                             style={{ padding: "10px 12px", backgroundColor: bossHinted[idx] ? "#9e9e9e" : "#4CAF50", color: "white", border: "none", borderRadius: "6px", cursor: bossHinted[idx] ? "not-allowed" : "pointer", fontWeight: "bold", whiteSpace: "nowrap", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", fontSize: "13px", flexShrink: 0, transition: "0.2s" }}
                                             title={bossHinted[idx] ? "Vì bạn đã dùng gợi ý cho từ này nên không thể lưu là 'Đã thuộc'." : "Chuyển vào Ô xanh trong Sổ tay"}
                                         >
                                             ⭐ Đã thuộc
                                         </button>
                                     )
                                 )}
                             </div>
                         </div>
                     </div>
                 )
             })}
          </div>

          {/* HIỆU ỨNG TỪ KHÓA KHI HOÀN THÀNH BẢN ĐỒ */}
          {currentQ.words.every((item, idx) => (crosswordInputs[idx] || "").toLowerCase().trim() === item.cleanWord.toLowerCase().trim()) ? (
             <div style={{ marginTop: "25px", textAlign: "center", animation: "popIn 0.5s" }}>
                 <h3 style={{ color: "#FF9800", marginBottom: "15px", fontSize: "18px" }}>Nhập Từ Khóa Bí Mật:</h3>
                 <input 
                    autoFocus // TÍNH NĂNG MỚI: Tự động hút con trỏ chuột vào đây khi vừa xuất hiện
                    type="email"
                    value={keywordInput}
                    onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
                        setKeywordInput(val);
                        // Ngay khi gõ đúng từ khóa
                        if (val === currentQ.keyword && !isKeywordSolved) {
                            setIsKeywordSolved(true);
                            playSound("combo_max");
                            confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 });
                            // ĐÃ XÓA LỆNH GỌI AI Ở ĐÂY VÌ AI ĐÃ CHUẨN BỊ XONG TỪ TRƯỚC RỒI!
                        }
                    }}
                    disabled={isKeywordSolved}
                    placeholder={`${currentQ.keyword.length} CHỮ CÁI...`}
                    style={{ width: "100%", maxWidth: "300px", padding: "12px", fontSize: "24px", textAlign: "center", textTransform: "uppercase", letterSpacing: "5px", borderRadius: "8px", border: isKeywordSolved ? "2px solid #4CAF50" : "2px solid #FF9800", outline: "none", backgroundColor: isKeywordSolved ? "#e8f5e9" : "#fff", fontWeight: "bold", color: isKeywordSolved ? "#2e7d32" : "#e65100", transition: "0.3s" }}
                 />

                 {/* HIỂN THỊ AI GIẢI THÍCH TỪ KHÓA */}
                 {isKeywordSolved && (
                     <div style={{ marginTop: "20px", animation: "popIn 0.5s" }}>
                         {isFetchingExplanation ? (
                             <p style={{ color: "#2196F3", fontStyle: "italic", fontWeight: "bold" }}>🤖 AI đang phân tích nghĩa của từ "{currentQ.keyword}"...</p>
                         ) : (
                             <div style={{ backgroundColor: "#e3f2fd", padding: "15px", borderRadius: "8px", border: "1px dashed #2196F3", textAlign: "left", marginBottom: "20px" }}>
                                 <h4 style={{ color: "#1565c0", margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "5px" }}><span>🤖</span> AI Giải Thích:</h4>
                                 <p style={{ margin: 0, color: "#333", fontSize: "15px", whiteSpace: "pre-line", lineHeight: "1.6" }}>{keywordExplanation}</p>
                             </div>
                         )}
                         <button onClick={() => handleAnswer("WIN")} style={{ width: "100%", padding: "15px", fontSize: "18px", backgroundColor: "#4CAF50", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>🎉 Tuyệt vời! Hoàn thành 🎉</button>
                     </div>
                 )}
             </div>
          ) : (
             <button disabled style={{ width: "100%", padding: "15px", marginTop: "25px", fontSize: "18px", backgroundColor: "#ccc", color: "#666", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "not-allowed" }}>🔒 Giải mã các ô bên trên để tìm Từ Khóa</button>
          )}
        </div>
      )}

      {/* GIAO DIỆN FLASHCARD (LEVEL 0) */}
      {currentQ.type === "flashcard" && (
        <div style={{ animation: "popIn 0.3s ease-out", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {flashcardPhase === "learn" ? (
                <>
                    <h2 style={{ fontSize: "20px", color: "#2c3e50", marginBottom: "15px" }}>Lật thẻ để học từ 🎴</h2>

                    {/* VẼ THẺ BÀI LẬT 3D */}
                    <div
                        onClick={() => { playSound("click"); setIsFlipped(!isFlipped); }}
                        style={{ width: "100%", maxWidth: "320px", height: "220px", perspective: "1000px", cursor: "pointer", marginBottom: "25px" }}
                    >
                        <div style={{
                            width: "100%", height: "100%", transition: "transform 0.6s", transformStyle: "preserve-3d", position: "relative",
                            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
                        }}>
                            {/* MẶT TRƯỚC (TIẾNG ANH) */}
                            <div style={{
                                position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
                                backgroundColor: "#2196F3", color: "white", borderRadius: "16px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                                boxShadow: "0 8px 15px rgba(0,0,0,0.2)", border: "4px solid #bbdefb",
                                padding: "15px", boxSizing: "border-box", overflow: "hidden"
                            }}>
                                <span style={{ fontSize: "clamp(18px, 5vw, 32px)", fontWeight: "bold", textAlign: "center", padding: "0 5px", lineHeight: "1.3", wordBreak: "break-word", overflowWrap: "break-word", width: "100%" }}>{currentQ.word}</span>
                                <span style={{ fontSize: "clamp(13px, 3.5vw, 18px)", fontStyle: "italic", opacity: 0.8, marginTop: "5px", textAlign: "center", width: "100%" }}>{currentQ.phonetic}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); speakWord(currentQ.word, 'en-US'); }}
                                    onMouseDown={(e) => { e.preventDefault(); }} // Ngăn button chiếm focus, Space sẽ không bị dính
                                    title="Nghe phát âm (phím V)"
                                    style={{
                                        marginTop: "12px",
                                        backgroundColor: "rgba(255,255,255,0.25)",
                                        border: "2px solid rgba(255,255,255,0.6)",
                                        borderRadius: "50%",
                                        width: "44px", height: "44px",
                                        fontSize: "20px",
                                        cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        transition: "background 0.2s",
                                        color: "white"
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.4)"}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.25)"}
                                >
                                    🔊
                                </button>
                            </div>
                            
                            {/* MẶT SAU (TIẾNG VIỆT) */}
                            {/* MẶT SAU (TIẾNG VIỆT) - ĐÃ FIX CHỐNG TRÀN CHỮ */}
                            <div style={{
                                position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
                                backgroundColor: "#4CAF50", color: "white", borderRadius: "16px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                                transform: "rotateY(180deg)", boxShadow: "0 8px 15px rgba(0,0,0,0.2)", border: "4px solid #c8e6c9",
                                padding: "20px", boxSizing: "border-box", overflowY: "auto"
                            }}>
                                <span style={{ fontSize: "20px", fontWeight: "bold", textAlign: "center", width: "100%", lineHeight: "1.4" }}>
                                    {currentQ.meaning}
                                </span>
                                {currentQ.usage && (
                                    <span style={{ fontSize: "14px", fontStyle: "italic", opacity: 0.9, marginTop: "12px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.3)", paddingTop: "10px", width: "100%", lineHeight: "1.3" }}>
                                        "{currentQ.usage}"
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => { playSound("click"); setFlashcardPhase("test"); setTypingValue(""); setTimeout(() => typingInputRef.current?.focus(), 100); }}
                        style={{ width: "100%", maxWidth: "320px", padding: "15px", fontSize: "18px", backgroundColor: "#FF9800", color: "white", borderRadius: "10px", border: "none", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
                    >
                        Đã thuộc ➡️ Gõ lại từ này ✍️
                    </button>
                </>
            ) : (
                <>
                    <h2 style={{ fontSize: "20px", color: "#2c3e50", marginBottom: "10px" }}>Gõ lại từ tiếng Anh có nghĩa là:</h2>
                    <h3 style={{ fontSize: "24px", color: "#4CAF50", marginBottom: "20px" }}>"{currentQ.meaning}"</h3>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if(typingValue.trim() === "") return;
                            
                            // NẾU GÕ ĐÚNG: Nộp bài đi tiếp
                            if(typingValue.trim().toLowerCase() === currentQ.answer.toLowerCase()) {
                                handleAnswer(typingValue);
                            } else {
                                // NẾU GÕ SAI: Đuổi về mặt tiếng Anh bắt học lại
                                playSound("wrong");
                                updateGlobal(mode, false, currentQ.word); // Lưu từ sai vào Sổ tay
                                setFlashcardPhase("learn");
                                setIsFlipped(false); // Ép lật về mặt tiếng Anh cho nhìn rõ mặt chữ
                                setTypingValue("");
                            }
                        }}
                        style={{ width: "100%", maxWidth: "320px" }}
                        noValidate
                    >
                        <input
                            ref={typingInputRef} type="email" value={typingValue} onChange={(e) => setTypingValue(e.target.value)}
                            placeholder="Nhập tiếng Anh..."
                            style={{ width: "100%", padding: "15px", fontSize: "20px", textAlign: "center", borderRadius: "8px", border: "2px solid #ccc", outline: "none", textTransform: "lowercase", marginBottom: "15px" }}
                            autoComplete="off" autoCorrect="off" spellCheck="false"
                        />
                        <button type="submit" style={{ width: "100%", padding: "12px", fontSize: "18px", backgroundColor: "#2196F3", color: "white", borderRadius: "8px", border: "none", cursor: typingValue.trim() ? "pointer" : "not-allowed", opacity: typingValue.trim() ? 1 : 0.5 }}>Kiểm tra</button>
                        <button type="button" onClick={() => { playSound("click"); setFlashcardPhase("learn"); setIsFlipped(true); }} style={{ width: "100%", padding: "10px", marginTop: "10px", fontSize: "14px", backgroundColor: "transparent", color: "#666", borderRadius: "8px", border: "1px solid #ccc", cursor: "pointer" }}>👀 Quên rồi, xem lại thẻ</button>
                    </form>
                </>
            )}
        </div>
      )}

      {currentQ.type === "en_to_vn" && (
        <>
          <h2 style={{ fontSize: "22px", color: "#2c3e50" }}>What does <span style={{color: mode==="collocation"?"#9C27B0":"#2196F3"}}>"{currentQ.word}"</span> mean?</h2>
          <p style={{ fontSize: "18px", color: "#555", marginBottom: "20px" }}><strong><i>{currentQ.phonetic}</i></strong></p>
          <div className="options">
            {currentQ.options.map((opt, idx) => (
              <button key={idx} onClick={() => handleAnswer(opt)} className={selected ? (opt === currentQ.answer ? "correct" : opt === selected ? "wrong" : "") : ""} disabled={selected !== null}>{opt}</button>
            ))}
          </div>
        </>
      )}

      {currentQ.type === "listening" && (
        <>
          <h2 style={{ fontSize: "20px", color: "#2c3e50" }}>🎧 Nghe và chọn nghĩa:</h2>
          <h1 style={{ fontSize: "40px", color: "#FF9800", letterSpacing: "5px", margin: "10px 0" }}>????</h1>
          <div className="options" style={{ marginTop: "20px" }}>
            {currentQ.options.map((opt, idx) => (
              <button key={idx} onClick={() => handleAnswer(opt)} className={selected ? (opt === currentQ.answer ? "correct" : opt === selected ? "wrong" : "") : ""} disabled={selected !== null}>{opt}</button>
            ))}
          </div>
        </>
      )}

      {currentQ.type === "vn_to_en" && (
        <>
          <h2 style={{ fontSize: "22px", color: "#2c3e50", lineHeight: "1.4" }}>Từ nào có nghĩa là <span style={{color: mode==="collocation"?"#9C27B0":"#2196F3"}}>"{currentQ.meaning}"</span>?</h2>
          <div className="options" style={{ marginTop: "20px" }}>
            {currentQ.options.map((opt, idx) => (
              <button key={idx} onClick={() => handleAnswer(opt)} className={selected ? (opt === currentQ.answer ? "correct" : opt === selected ? "wrong" : "") : ""} disabled={selected !== null} style={{ fontWeight: "bold", fontSize: "18px" }}>{opt}</button>
            ))}
          </div>
        </>
      )}

      {currentQ.type === "typing" && (
        <>
          <h2 style={{ fontSize: "22px", color: "#2c3e50", lineHeight: "1.4" }}>Gõ từ có nghĩa là <span style={{color: "#9C27B0"}}>"{currentQ.meaning}"</span></h2>
          {/* THÊM noValidate vào form và đổi type="email" để hack chặn Unikey */}
          <form onSubmit={handleTypingSubmit} style={{ marginTop: "20px" }} noValidate>
            <input ref={typingInputRef} type="email" value={typingValue} onChange={(e) => setTypingValue(e.target.value)} disabled={selected !== null} placeholder="Nhập vào đây..." style={{ width: "100%", padding: "15px", fontSize: "20px", textAlign: "center", borderRadius: "8px", border: "2px solid #ccc", outline: "none", textTransform: "lowercase" }} autoComplete="off" autoCorrect="off" spellCheck="false" />
            {selected === null && (
              <button type="submit" style={{ width: "100%", padding: "12px", marginTop: "15px", fontSize: "18px", backgroundColor: "#2196F3", color: "white", borderRadius: "8px", border: "none", cursor: typingValue.trim() ? "pointer" : "not-allowed", opacity: typingValue.trim() ? 1 : 0.5 }}>Kiểm tra</button>
            )}
          </form>
        </>
      )}

      {currentQ.type === "scramble" && (
        <>
          <h2 style={{ fontSize: "22px", color: "#2c3e50", lineHeight: "1.4" }}>Xếp chữ có nghĩa là <span style={{color: "#E91E63"}}>"{currentQ.meaning}"</span></h2>
          
          <div style={{ minHeight: "50px", display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", padding: "15px 0", borderBottom: "2px dashed #eee", marginBottom: "15px" }}>
              {scrambleSelected.map(item => (
                  <button key={item.id} onClick={() => handleScrambleClick(item, false)} style={{ width: "45px", height: "45px", fontSize: "22px", fontWeight: "bold", padding: 0, margin: 0, backgroundColor: "#2196F3", color: "white", borderRadius: "8px" }}>{item.char.toUpperCase()}</button>
              ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", marginBottom: "20px" }}>
              {scrambleAvailable.map(item => (
                  <button key={item.id} onClick={() => handleScrambleClick(item, true)} style={{ width: "45px", height: "45px", fontSize: "22px", fontWeight: "bold", padding: 0, margin: 0, backgroundColor: "#e0e0e0", color: "#333", borderRadius: "8px" }}>{item.char.toUpperCase()}</button>
              ))}
          </div>

          {selected === null && scrambleAvailable.length === 0 && (
              <button onClick={submitScramble} style={{ width: "100%", padding: "12px", fontSize: "18px", backgroundColor: "#4CAF50", color: "white", borderRadius: "8px" }}>Kiểm tra</button>
          )}
        </>
      )}

      {/* FEEDBACK & NEXT BUTTON */}
      {selected && answerStatus && (
        <>
          <div className={`feedback-box ${comboClass}`}>
            {answerStatus.text}
          </div>

          {/* NÚT THÊM TỪ VÀO SỔ TAY */}
          <div style={{ textAlign: "right", marginTop: "5px" }}>
            <button onClick={() => onSaveWord(mode, currentQ.word)} style={{ padding: "6px 12px", fontSize: "13px", backgroundColor: "#fff", color: "#FF9800", borderRadius: "6px", border: "1px solid #FF9800", cursor: "pointer", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "5px" }}>
              🔖 Lưu từ này
            </button>
          </div>
          
          {(currentQ.type === "vn_to_en" || currentQ.type === "typing" || currentQ.type === "scramble") && (
            <div style={{ marginTop: "15px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "15px", backgroundColor: "#f0f8ff", borderRadius: "10px", border: "2px dashed #4facfe" }}>
               <span style={{ fontSize: "14px", color: "#555", fontWeight: "bold", textTransform: "uppercase" }}>Chính xác là</span>
               <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                   <span style={{ fontSize: "26px", fontWeight: "bold", color: "#1976D2" }}>{currentQ.word}</span>
                   <button 
                       onClick={() => speakWord(currentQ.word)}
                       title="Nghe phát âm"
                       style={{ width: "36px", height: "36px", borderRadius: "50%", border: "none", backgroundColor: "#4facfe", color: "white", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "16px", padding: 0, margin: 0, boxShadow: "0 2px 5px rgba(0,0,0,0.2)", transition: "0.2s" }}
                       onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                       onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
                   >
                       🔊
                   </button>
               </div>
               <span style={{ fontSize: "18px", color: "#666" }}><i>{currentQ.phonetic}</i></span>
            </div>
          )}

          {(currentQ.type === "en_to_vn" || currentQ.type === "listening") && selected !== "TIMEOUT" && selected !== currentQ.answer && (
             <div style={{ marginTop: "10px", fontSize: "18px", color: "#F44336", fontWeight: "bold" }}>
               Nghĩa đúng: <span style={{ textDecoration: "underline", color: "#4CAF50" }}>{currentQ.answer}</span>
             </div>
          )}

          <div style={{ marginTop: "15px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "8px", borderLeft: "4px solid #90caf9", textAlign: "left" }}>
            <p style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#333", lineHeight: "1.5" }}>
              <strong>📌 Ngữ cảnh:</strong> <br/>
              {currentQ.usage}
            </p>
          </div>
          {/* 1. Dải đệm tàng hình: Giúp phần chữ giải thích bên trên không bị cái nút che mất khi lướt xuống đáy */}
          <div style={{ height: "90px", width: "100%" }}></div>

          {/* 2. Nút bấm được ghim nổi bồng bềnh trên mặt màn hình */}
          <button 
            className="next" 
            onClick={nextQuestion} 
            style={{ 
              position: "fixed", 
              bottom: "30px", 
              left: "50%", 
              transform: "translateX(-50%)", 
              width: "calc(100% - 40px)", 
              maxWidth: "400px", 
              padding: "16px", 
              fontSize: "18px", 
              fontWeight: "bold", 
              borderRadius: "16px", 
              boxShadow: "0 10px 25px rgba(0,0,0,0.25)", 
              zIndex: 9999, 
              border: "3px solid white"
            }}
          >
            Câu tiếp theo ➡️
          </button>
        </>
      )}
    </div>
  );
}

// =======================================================================
// COMPONENT MỚI: NGỮ PHÁP TÍCH HỢP AI CHUẨN ETS + TRA TỪ ĐIỂN BÔI ĐEN
// =======================================================================
function GrammarQuiz({ onBack, updateGlobal, onSaveWord, settings, learnedQuestions }) {
  const DIFFICULTY_LEVEL = settings.difficultyLevel;
  const QUIZ_LIMIT = settings.quizLimit; 
  const TIME_PER_QUESTION = settings.timePerQuestion;
  const REQUIRED_STREAK = settings.requiredStreak; 
  const TOEIC_PART = settings.toeicPart || "part5";
  
  // const GEMINI_API_KEY = getActiveKey(); // Lấy Key từ Trạm Điện Tổng

  const [questionsData, setQuestionsData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("🤖 Chờ một lát, Thầy giáo AI đang soạn đề ETS riêng cho bạn...");

  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);

  const [lives, setLives] = useState(DIFFICULTY_LEVEL === 3 ? settings.survivalLives : null);
  const [globalTime, setGlobalTime] = useState(DIFFICULTY_LEVEL === 4 ? settings.timeAttackSeconds : null);

  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [answerStatus, setAnswerStatus] = useState(null); 
  const [streak, setStreak] = useState(0);

  // --- TÍNH NĂNG MỚI: STATE CHO TỪ ĐIỂN ---
  const [vocabDict, setVocabDict] = useState([]); // Chứa data từ Google Sheet
  const [selectedWord, setSelectedWord] = useState("");
  const [tooltipPos, setTooltipPos] = useState(null);
  const [dictModal, setDictModal] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  // 1. TẢI TỪ ĐIỂN GOOGLE SHEET NGAY KHI VÀO GAME ĐỂ DÙNG DẦN
  useEffect(() => {
    const fetchVocabForDict = async () => {
        try {
            const SHEET_ID = "1nAdOxZBZ3-Bawh3Ks54KaIYLPgGZfTuchebwbCYW8dU";
            const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=Vocab`;
            const response = await fetch(url);
            const text = await response.text();
            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const result = JSON.parse(jsonString);
            const headers = result.table.cols.map(col => col.label ? col.label.toLowerCase().trim() : "");
            let fullData = result.table.rows.map(row => {
                let obj = {};
                headers.forEach((header, index) => {
                    obj[header] = (row.c[index] && row.c[index].v) ? row.c[index].v.toString() : "";
                });
                return obj;
            });
            setVocabDict(fullData);
        } catch(e) { console.error("Lỗi tải từ điển Google Sheet:", e); }
    };
    fetchVocabForDict();
  }, []);

  // 2. HÀM QUÉT CHỮ BÔI ĐEN BẰNG CHUỘT/CẢM ỨNG (ĐÃ GIẢN LƯỢC CHO FIXED BAR)
  const handleSelection = () => {
      // Dùng setTimeout nhỏ để đợi OS xử lý xong Selection
      setTimeout(() => { 
          const selection = window.getSelection();
          // Nếu có bôi đen và không phải là click chuột rỗng
          if (selection && !selection.isCollapsed) {
              const text = selection.toString().trim();
              // Giới hạn độ dài để tránh AI bị ngợp (dưới 40 từ)
              if (text && text.split(/\s+/).length <= 40 && text.length < 300) {
                  // ĐÃ FIX: Không cần tính tọa độ rect nữa.
                  // Chỉ cần set true để bật thanh công cụ cố định ở dưới.
                  setTooltipPos(true); 
                  setSelectedWord(text);
                  return;
              }
          }
          // Nếu không bôi đen gì thì tắt thanh công cụ
          setSelectedWord("");
          setTooltipPos(null);
      }, 50);
  };

  // --- ĐÃ FIX: Lắng nghe sự kiện click/bôi đen trên TOÀN BỘ trang web (cả vùng xanh) ---
  useEffect(() => {
      document.addEventListener("mouseup", handleSelection);
      document.addEventListener("touchend", handleSelection);
      
      // Dọn dẹp sự kiện khi người dùng thoát khỏi màn hình Ngữ pháp
      return () => {
          document.removeEventListener("mouseup", handleSelection);
          document.removeEventListener("touchend", handleSelection);
      };
  }, []);

  // 3. HÀM XỬ LÝ TRA TỪ ĐIỂN (ĐÃ TỐI ƯU SIÊU TỐC + BẬT TÍNH NĂNG NHỚ TÊN AI)
  const handleLookup = async (wordToLookup) => {
      const GEMINI_API_KEY = getActiveKey();
      const cleanWord = wordToLookup.trim().toLowerCase().replace(/[^a-z-\s]/g, '');
      if(!cleanWord) return;
      
      playSound("click");
      setDictModal({ word: cleanWord, status: 'loading', data: null });
      setSelectedWord(""); 
      setIsSaved(false); 
      
      const foundInSheet = vocabDict.find(item => item.word && item.word.toLowerCase().trim() === cleanWord);
      if (foundInSheet) {
          setDictModal({ word: cleanWord, status: 'found_sheet', data: foundInSheet });
          return;
      }
      
      try {
          // HỎI TÊN AI 1 LẦN DUY NHẤT RỒI LƯU VÀO TRÍ NHỚ (BẢO VỆ KHỎI LỖI 404)
          if (!window.globalCachedModel) {
              const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
              const listData = await listRes.json();
              const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
              const flashModel = textModels.find(m => m.name.includes("flash"));
              window.globalCachedModel = flashModel ? flashModel.name : textModels[0].name;
          }

          const prompt = `Phân tích từ/cụm từ tiếng Anh: "${cleanWord}". (Lưu ý: Nếu từ bị dính chữ, hãy tự động sửa thành đúng chính tả).
          Trả về CHỈ 1 OBJECT JSON ĐƠN GIẢN:
          {"word": "Từ chuẩn kèm loại từ", "phonetic": "Phiên âm", "meaning": "(Đồng nghĩa) - Nghĩa tiếng Việt ngắn gọn.", "usage": "1 ví dụ"}`;

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${GEMINI_API_KEY}`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          const data = await res.json();

          if (data.error && (data.error.message.toLowerCase().includes("quota") || data.error.message.toLowerCase().includes("expired") || data.error.code === 429)) {
              window.globalCachedModel = null; 
              if (rotateKey()) {
                  console.log("⏳ Đang làm nguội hệ thống 1.5 giây trước khi thử Key mới...");
                  await new Promise(r => setTimeout(r, 1500)); // ĐÃ FIX: Nghỉ 1.5s chống spam
                  return handleLookup(wordToLookup);
              }
              throw new Error("Hết toàn bộ Key!");
          }

          let rawText = data.candidates[0].content.parts[0].text;
          rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          setDictModal({ word: cleanWord, status: 'found_ai', data: JSON.parse(rawText) });
      } catch (error) {
          console.error("Lỗi Tra Từ AI:", error);
          setDictModal({ word: cleanWord, status: 'error', data: null });
      }
  };

  // --- TÍNH NĂNG MỚI: LƯU NHANH TRỰC TIẾP (ĐÃ FIX KỶ LUẬT THÉP ÉP AI TRẢ JSON) ---
  const handleQuickSave = async (type, wordToSave) => {
      const cleanWord = wordToSave.trim().toLowerCase().replace(/[^a-z-\s]/g, '');
      if (!cleanWord) return;

      playSound("click");
      setSelectedWord(""); 
      setTooltipPos(null);
      window.getSelection().removeAllRanges();

      try {
          const GEMINI_API_KEY = getActiveKey();
          
          if (!window.globalCachedModel) {
              const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
              const listData = await listRes.json();
              const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
              const flashModel = textModels.find(m => m.name.includes("flash"));
              window.globalCachedModel = flashModel ? flashModel.name : textModels[0].name;
          }

          let prompt = type === "grammar"
            ? `Giải thích cấu trúc ngữ pháp: "${cleanWord}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON:\n{"word": "${cleanWord}", "phonetic": "Công thức", "meaning": "Cách sử dụng cốt lõi", "usage": "1 ví dụ"}`
            : `Phân tích cụm từ tiếng Anh: "${cleanWord}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON:\n{"word": "Từ vựng (kèm từ loại)", "phonetic": "Phiên âm", "meaning": "(Đồng nghĩa) - Nghĩa tiếng Việt.", "usage": "1 ví dụ"}`;

          // ĐÃ THÊM LỚP BẢO VỆ MIME_TYPE
          const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
          if (window.globalCachedModel.includes("1.5")) {
              requestBody.generationConfig = { response_mime_type: "application/json" };
          }

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${GEMINI_API_KEY}`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody)
          });
          const data = await res.json();

          if (data.error && (data.error.message.toLowerCase().includes("quota") || data.error.message.toLowerCase().includes("expired") || data.error.code === 429)) {
              window.globalCachedModel = null;
              if (rotateKey()) {
                  await new Promise(r => setTimeout(r, 1500)); 
                  return handleQuickSave(type, wordToSave);
              }
              return;
          }

          let rawText = data.candidates[0].content.parts[0].text;
          const jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (jsonMatch) rawText = jsonMatch[0];

          onSaveWord(type, JSON.parse(rawText)); 
      } catch (error) {
          console.error("Lỗi Dịch Bôi Đen:", error);
          onSaveWord(type, cleanWord); // Lỗi nặng quá thì đành lưu chữ thô
      }
  };

  // ====================== SINH ĐỀ AI (ĐÃ CHẮN LẶP) ======================
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    const fetchGrammarFromAI = async () => {
      const GEMINI_API_KEY = getActiveKey();
      if (!GEMINI_API_KEY || String(GEMINI_API_KEY).includes("DÁN_MÃ")) {
        alert("LỖI: Không tìm thấy API Key!");
        onBack();
        return;
      }

      setLoadingData(true);

      // === PHẦN MỚI: DANH SÁCH CÂU ĐÃ LÀM (tránh lặp) ===
      let avoidedList = "";
      if (learnedQuestions && learnedQuestions.length > 0) {
        avoidedList = learnedQuestions
          .slice(0, 40) // giới hạn 40 câu để tránh vượt token
          .map((q, i) => `• ${i+1}. ${q.question || q}`)
          .join("\n");
      } else {
        avoidedList = "Chưa có câu nào.";
      }

      // Prompt cũ của bạn + thêm phần tránh lặp
      let partInstruction = "";
      if (TOEIC_PART === "part5") {
        partInstruction = `- Trường "passage": để rỗng "".\n- Trường "question": Tạo 1 câu tiếng Anh FORMAT CHUẨN ETS có đúng 1 chỗ trống (___).`;
      } else if (TOEIC_PART === "part6") {
        partInstruction = `- Trường "passage": Tạo 1 đoạn văn ngắn (email, thông báo...) và đục đúng 1 lỗ (___).`;
      } else if (TOEIC_PART === "part7") {
        partInstruction = `- Trường "passage": Tạo 1 đoạn văn hoàn chỉnh.\n- Trường "question": Tạo 1 câu hỏi đọc hiểu.`;
      } else if (TOEIC_PART === "scan_skim") {
        partInstruction = `- Trường "passage": Tạo 1 văn bản dài.\n- Trường "question": Tạo câu hỏi skimming/scanning.`;
      }

    const prompt = `Bạn là chuyên gia luyện thi TOEIC chuẩn ETS.
      Hãy tạo ${QUIZ_LIMIT} câu hỏi trắc nghiệm cho phần ${TOEIC_PART.toUpperCase()}.

      YÊU CẦU BẮT BUỘC:
      - KHÔNG ĐƯỢC lặp lại bất kỳ câu nào trong danh sách đã làm (nếu có).
      - Trả về **DUY NHẤT 1 mảng JSON**, không có chữ thừa nào.

      Cấu trúc mỗi câu:
      {
        "passage": "...",
        "question": "...",
        "options": ["will achieve", "has achieved", "achieve", "achieves"],   // KHÔNG có A. B. C. D.
        "answer": "has achieved",                                            // Nội dung đầy đủ, KHÔNG có chữ cái
        "explanation": "Giải thích chi tiết bằng tiếng Việt"
      }

Mức độ: ${DIFFICULTY_LEVEL <= 2 ? "Dễ - Trung bình" : "Khó"}`;

      try {
        // Phần gọi API giữ nguyên như bạn (chỉ thay prompt)
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const listData = await listRes.json();
        const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent"));
        const flashModel = textModels.find(m => m.name.includes("flash"));
        const selectedModel = flashModel ? flashModel.name : textModels[0].name;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`;

        let requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        if (selectedModel.includes("1.5")) {
          requestBody.generationConfig = { response_mime_type: "application/json" };
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsedQuestions = JSON.parse(rawText);
        const finalPool = parsedQuestions.map(q => ({ ...q, options: shuffleArray(q.options) }));

        setQuestionsData(finalPool);
      } catch (error) {
        console.error("Lỗi tạo đề:", error);
        alert("Thầy AI đang bận hoặc gặp lỗi. Vui lòng thử lại!");
        onBack();
      } finally {
        setLoadingData(false);
      }
    };

    fetchGrammarFromAI();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Chạy 1 lần khi mở GrammarQuiz

  useEffect(() => {
    if (selected !== null || loadingData || isGameOver || DIFFICULTY_LEVEL === 4) return;
    if (questionsData[current]?.type === "crossword_boss") return;
    if (timeLeft <= 0) { handleAnswer(null); return; }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, selected, loadingData, isGameOver, DIFFICULTY_LEVEL, current, questionsData]);

  useEffect(() => {
    if (DIFFICULTY_LEVEL !== 4 || isGameOver || loadingData) return;
    const timer = setInterval(() => {
        setGlobalTime(prev => {
            if (prev <= 1) { setIsGameOver(true); playSound("timeout"); return 0; }
            return prev - 1;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [isGameOver, loadingData, DIFFICULTY_LEVEL]);

  useEffect(() => {
      if (DIFFICULTY_LEVEL === 3 && lives !== null && lives <= 0) setIsGameOver(true);
  }, [lives, DIFFICULTY_LEVEL]);

  // PHÁO HOA X3 LẦN
  useEffect(() => {
    const isFinished = isGameOver || (DIFFICULTY_LEVEL < 3 && questionsData.length > 0 && current >= questionsData.length);
    if (isFinished && DIFFICULTY_LEVEL < 3) {
      let count = 0;
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, zIndex: 9999 });
      count++;
      const interval = setInterval(() => {
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, zIndex: 9999 });
        count++;
        if (count >= 3) clearInterval(interval);
      }, 600);
      return () => clearInterval(interval);
    }
  }, [isGameOver, current, questionsData.length, DIFFICULTY_LEVEL]);

  useEffect(() => {
    const handleEnterKey = (e) => {
        if (e.key === "Enter") {
            if (selected !== null && answerStatus !== null) {
                e.preventDefault();
                nextQuestion();
            }
        }
    };
    window.addEventListener("keydown", handleEnterKey);
    return () => window.removeEventListener("keydown", handleEnterKey);
  }, [selected, answerStatus]);

  const encourages = ["Chú ý bẫy nhé! 💪", "Đọc kỹ đoạn văn xíu nào! 🌱", "Suýt nữa là đúng rồi! 😅"];

  const handleComboRewards = (newStreak) => {
    if (newStreak === 1) { playSound("combo_1"); return "Khởi đầu thuận lợi! 👍"; }
    else if (newStreak === 2) { playSound("combo_2"); return "COMBO x2! Đọc hiểu sắc bén! ⭐"; }
    else if (newStreak === 3) { playSound("combo_3"); confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } }); return "🔥 COMBO x3! Master TOEIC! 🔥"; }
    else if (newStreak === 4) { playSound("combo_4"); confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } }); return "⚡ COMBO x4! Quét thông tin quá đỉnh! ⚡"; }
    else { playSound("combo_max"); confetti({ particleCount: 300, spread: 120, origin: { y: 0.4 } }); return `👑 UNSTOPPABLE x${newStreak}! Out trình! 👑`; }
  };

  const handleAnswer = (userAnswer) => {
    if (isGameOver) return;
    const isTimeout = userAnswer === null;
    const actualOption = isTimeout ? "TIMEOUT" : userAnswer;
    setSelected(actualOption);

    const currentQ = questionsData[current];
    const isCorrect = actualOption === currentQ.answer;
    
    updateGlobal("grammar", isCorrect, currentQ.question);

    if (isCorrect) {
      const newStreak = streak + 1;
      setScore(score + 1);
      setStreak(newStreak); 
      const msg = handleComboRewards(newStreak);
      setAnswerStatus({ type: "correct", streak: newStreak, text: msg });
      if (DIFFICULTY_LEVEL === 4) setGlobalTime(t => t + 5); 
    } else {
      playSound(isTimeout ? "timeout" : "wrong");
      setStreak(0); 
      if (DIFFICULTY_LEVEL === 3) {
          setLives(l => l - 1); 
          setAnswerStatus({ type: "wrong", streak: 0, text: isTimeout ? "⏰ Hết giờ! -1 ❤️" : "❌ Chọn sai! -1 ❤️" });
      } else if (DIFFICULTY_LEVEL === 4) {
          setGlobalTime(t => t - 10); 
          setAnswerStatus({ type: "wrong", streak: 0, text: "❌ Sai cấu trúc! Bị trừ 10 giây!" });
      } else {
          setAnswerStatus({ type: "wrong", streak: 0, text: isTimeout ? "⏰ Hết giờ mất rồi!" : encourages[Math.floor(Math.random() * encourages.length)] });
          setQuestionsData((prev) => {
            const newData = [...prev];
            const remaining = newData.length - current - 1;
            let insertIndex = newData.length; 
            if (remaining > 3) insertIndex = current + 2 + Math.floor(Math.random() * (remaining - 1));
            let penaltyItem = {...newData[current]};
            penaltyItem.options = shuffleArray([...penaltyItem.options]);
            newData.splice(insertIndex, 0, penaltyItem);
            return newData;
          });
      }
    }
  };

  const nextQuestion = () => {
    playSound("click");
    setSelected(null);
    setAnswerStatus(null); 
    const nextIdx = current + 1;
    setCurrent(nextIdx);
    setTimeLeft(TIME_PER_QUESTION); 
    if (nextIdx >= questionsData.length && DIFFICULTY_LEVEL < 3) playSound("finish");
  };

  // GIAO DIỆN CHỜ AI SOẠN ĐỀ (ĐÃ NÂNG CẤP CHUẨN APP CHUYÊN NGHIỆP)
  if (loadingData) {
    return (
      <div className="container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh", background: "transparent", boxShadow: "none" }}>
        
        {/* Nhúng trực tiếp hiệu ứng CSS Animation cho Radar và Thanh Loading */}
        <style>{`
          @keyframes pulse-ring {
            0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.5); }
            70% { transform: scale(1); box-shadow: 0 0 0 25px rgba(33, 150, 243, 0); }
            100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
          }
          @keyframes shimmer-loading {
            0% { transform: translateX(-150%); }
            100% { transform: translateX(250%); }
          }
        `}</style>

        {/* Khung Card chính */}
        <div style={{ backgroundColor: "#fff", padding: "40px 30px", borderRadius: "24px", boxShadow: "0 20px 40px rgba(0,0,0,0.08)", textAlign: "center", maxWidth: "380px", width: "100%", border: "1px solid #f0f0f0", animation: "popIn 0.4s ease-out" }}>
          
          {/* Vòng sáng Radar AI */}
          <div style={{ position: "relative", width: "80px", height: "80px", margin: "0 auto 30px auto" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: "50%", animation: "pulse-ring 2s infinite" }}></div>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#fff", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "40px", zIndex: 2, boxShadow: "0 4px 15px rgba(0,0,0,0.08)", border: "2px solid #e3f2fd" }}>
              🤖
            </div>
          </div>

          {/* Dòng trạng thái (Sẽ tự đổi màu theo Key) */}
          <h2 style={{ fontSize: "18px", color: globalKeyIndex > 0 ? "#FF9800" : "#1e293b", marginBottom: "12px", lineHeight: "1.5" }}>
             {loadingMsg}
          </h2>
          
          <p style={{ color: "#64748b", fontSize: "14px", margin: "0 0 25px 0" }}>
            Hệ thống đang tổng hợp dữ liệu, vui lòng đợi trong giây lát...
          </p>

          {/* Thanh Loading Shimmer */}
          <div style={{ width: "100%", height: "6px", backgroundColor: "#f1f5f9", borderRadius: "10px", overflow: "hidden", position: "relative" }}>
            <div style={{ 
              position: "absolute", top: 0, left: 0, bottom: 0, width: "50%", borderRadius: "10px",
              background: globalKeyIndex > 0 ? "linear-gradient(90deg, transparent, #FF9800, transparent)" : "linear-gradient(90deg, transparent, #3b82f6, transparent)", 
              animation: "shimmer-loading 1.5s infinite linear" 
            }}></div>
          </div>
        </div>
        
      </div>
    );
  }

  if (isGameOver || (DIFFICULTY_LEVEL < 3 && current >= questionsData.length)) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <h1 style={{ color: DIFFICULTY_LEVEL >= 3 ? "#F44336" : "#2196F3" }}>
          {DIFFICULTY_LEVEL >= 3 ? "Game Over ☠️" : "Hoàn thành 🎉"}
        </h1>
        <h2>
          {DIFFICULTY_LEVEL === 3 && `Bạn đã sống sót qua ${score} câu TOEIC!`}
          {DIFFICULTY_LEVEL === 4 && `Bạn đạt tốc độ trả lời đúng ${score} câu!`}
          {DIFFICULTY_LEVEL < 3 && "Bạn đã hoàn thành phiên luyện thi!"}
        </h2>
        <div style={{ margin: "20px auto", padding: "20px", backgroundColor: "#f9f9f9", borderRadius: "12px", maxWidth: "300px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", border: "1px solid #eee" }}>
          <p style={{ fontSize: "18px", margin: "10px 0", color: "#2196F3", fontWeight: "bold" }}>✅ Trả lời đúng: {score}</p>
          {DIFFICULTY_LEVEL < 3 && <p style={{ fontSize: "18px", margin: "10px 0", color: "#F44336", fontWeight: "bold" }}>❌ Trả lời sai: {current - score}</p>}
        </div>
        <button className="next" onClick={() => { playSound("click"); onBack(); }}>Về trang chủ</button>
      </div>
    );
  }

  const currentQ = questionsData[current];
  const timePercentage = (timeLeft / TIME_PER_QUESTION) * 100;

  let comboClass = "";
  if (answerStatus) {
      if (answerStatus.type === "wrong" || answerStatus.type === "timeout") comboClass = "feedback-wrong";
      else if (answerStatus.streak >= 5) comboClass = "combo-max";
      else if (answerStatus.streak === 4) comboClass = "combo-4";
      else if (answerStatus.streak === 3) comboClass = "combo-3";
      else if (answerStatus.streak === 2) comboClass = "combo-2";
      else comboClass = "combo-1";
  }

  const formatExplanation = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} style={{ height: "10px" }}></div>; 

      // Nhận diện gạch đầu dòng
      const isListItem = /^[-\*•]\s/.test(trimmed); 
      const cleanText = isListItem ? trimmed.substring(1).trim() : trimmed;

      return (
        <div key={idx} style={{ 
          display: "flex", 
          alignItems: "flex-start", 
          gap: "10px", 
          marginBottom: "12px",
          padding: isListItem ? "12px 15px" : "0",
          backgroundColor: isListItem ? "#ffffff" : "transparent",
          borderLeft: isListItem ? "4px solid #64b5f6" : "none",
          borderRadius: isListItem ? "0 8px 8px 0" : "0",
          boxShadow: isListItem ? "0 2px 8px rgba(0,0,0,0.04)" : "none"
        }}>
          {isListItem && <span style={{ fontSize: "16px", marginTop: "2px", userSelect: "none" }}>💡</span>}
          <span style={{ flex: 1, fontSize: "15px", lineHeight: "1.7", color: "#2c3e50" }}>
            {/* Tự động đóng khung các từ vựng quan trọng (ĐÃ FIX TRÀN DÒNG) */}
            {cleanText.split(/('.*?'|".*?"|\*\*.*?\*\*|\*.*?\*)/g).map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: "#d32f2f" }}>{part.slice(2, -2)}</strong>;
              if (part.startsWith('*') && part.endsWith('*')) return <strong key={i} style={{ color: "#d32f2f" }}>{part.slice(1, -1)}</strong>;
              if (part.startsWith("'") && part.endsWith("'") && part.length > 2) return <strong key={i} style={{ color: "#1976D2", backgroundColor: "#e3f2fd", padding: "2px 6px", borderRadius: "6px", border: "1px solid #bbdefb", wordBreak: "break-word" }}>{part.slice(1, -1)}</strong>;
              if (part.startsWith('"') && part.endsWith('"') && part.length > 2) return <strong key={i} style={{ color: "#1976D2", backgroundColor: "#e3f2fd", padding: "2px 6px", borderRadius: "6px", border: "1px solid #bbdefb", wordBreak: "break-word" }}>{part.slice(1, -1)}</strong>;
              return <span key={i}>{part}</span>;
            })}
          </span>
        </div>
      );
    });
  };

  

  return (
    <div className="container" style={{ maxWidth: TOEIC_PART !== "part5" ? "600px" : "450px", position: "relative" }}>

      {/* --- THANH CÔNG CỤ XỬ LÝ CHỮ CỐ ĐỊNH Ở ĐÁY MÀN HÌNH (FIXED BOTTOM BAR) --- */}
      {selectedWord && tooltipPos && !dictModal && (
          <div style={{
              position: "fixed",
              // ĐÃ FIX: Cố định ở đáy, ngay phía trên vùng nút bấm câu tiếp theo
              bottom: "80px", 
              left: "50%",
              transform: "translateX(-50%)",
              // Giao diện dạng thanh ngang rộng rãi (medium size)
              width: "92%",
              maxWidth: "450px",
              backgroundColor: "#2c3e50", // Màu xanh đen đậm sang trọng
              color: "white",
              // Tăng padding để ngón tay dễ chạm trên điện thoại
              padding: "12px 18px",
              borderRadius: "15px", // Bo góc mềm mại
              display: "flex",
              justifyContent: "space-around", // Chia đều các nút
              alignItems: "center",
              zIndex: 1000, // Luôn nằm trên cùng
              boxShadow: "0 -4px 20px rgba(0,0,0,0.2)", // Đổ bóng ngược lên trên
              animation: "slideUp 0.3s ease-out", // Hiệu ứng trượt từ dưới lên
              whiteSpace: "nowrap",
              border: "1px solid rgba(255,255,255,0.1)"
          }}>
              {/* NÚT 1: TRA ĐIỂN */}
              <span onClick={() => handleLookup(selectedWord)} style={{ cursor: "pointer", fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  🔍 Tra từ
              </span>
              
              {/* Vạch phân cách */}
              <div style={{ width: "1px", height: "20px", backgroundColor: "rgba(255,255,255,0.2)" }}></div>
              
              {/* NÚT 2: LƯU TỪ VỰNG */}
              <span onClick={() => handleQuickSave("vocab", selectedWord)} style={{ cursor: "pointer", fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px", color: "#81c784" }}>
                  🔖 + Từ mới
              </span>
              
              <div style={{ width: "1px", height: "20px", backgroundColor: "rgba(255,255,255,0.2)" }}></div>
              
              {/* NÚT 3: LƯU CẤU TRÚC */}
              <span onClick={() => handleQuickSave("grammar", selectedWord)} style={{ cursor: "pointer", fontWeight: "bold", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px", color: "#ffb74d" }}>
                  📐 + Cấu trúc
              </span>

              {/* ĐÃ XÓA: Phần mũi tên tam giác trỏ vào chữ (không cần thiết nữa) */}
          </div>
      )}

      {/* MODAL KẾT QUẢ TRA TỪ ĐIỂN TÍCH HỢP SỔ TAY */}
      {dictModal && (
        <div onClick={() => setDictModal(null)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box", cursor: "pointer" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "350px", borderRadius: "16px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "default" }}>   
                
                {dictModal.status === 'loading' ? (
                    <div style={{ padding: "20px" }}>
                        <h2 style={{ fontSize: "24px", color: "#2196F3", marginBottom: "10px" }}>{dictModal.word}</h2>
                        <p style={{ color: "#666", fontStyle: "italic" }}>🔍 Đang quét. </p>
                    </div>
                ) : dictModal.status === 'error' ? (
                    <div style={{ padding: "20px" }}>
                        <h2 style={{ fontSize: "24px", color: "#F44336", marginBottom: "10px" }}>Lỗi tra cứu</h2>
                        <p style={{ color: "#666" }}>Không thể phân tích từ "{dictModal.word}" lúc này.</p>
                        <button onClick={() => setDictModal(null)} style={{ marginTop: "15px", padding: "10px 20px", backgroundColor: "#e0e0e0", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>Đóng</button>
                    </div>
                ) : (
                    <>
                        <h2 style={{ fontSize: "28px", color: "#2196F3", margin: "0 0 5px 0" }}>{dictModal.data?.word || dictModal.word}</h2>
                        <span style={{ fontSize: "12px", backgroundColor: dictModal.status === "found_sheet" ? "#4CAF50" : "#9C27B0", color: "white", padding: "2px 8px", borderRadius: "10px", fontWeight: "bold", display: "inline-block", marginBottom: "15px" }}>
                            {dictModal.status === "found_sheet" ? "✅ Nguồn: Trong Sổ Tay Của Bạn" : "🤖 Nguồn: Thầy AI Dịch Nhanh"}
                        </span>
                        
                        <div style={{ textAlign: "left", backgroundColor: "#f0f8ff", padding: "15px", borderRadius: "8px", border: "1px dashed #90caf9" }}>
                            <p style={{ margin: "0 0 10px 0", fontSize: "15px", fontStyle: "italic", color: "#666" }}>{dictModal.data?.phonetic}</p>
                            <p style={{ margin: "0 0 10px 0", fontSize: "18px", fontWeight: "bold", color: "#4CAF50" }}>{dictModal.data?.meaning}</p>
                            {dictModal.data?.usage && <p style={{ margin: "0", fontSize: "14px", color: "#333", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "10px" }}>"{dictModal.data?.usage}"</p>}
                        </div>

                        <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
                            <button disabled={isSaved} onClick={() => { playSound("click"); onSaveWord("vocab", dictModal.status === "found_ai" ? dictModal.data : dictModal.word); setIsSaved(true); }} style={{ flex: 1, padding: "12px", fontSize: "14px", backgroundColor: isSaved ? "#4CAF50" : "#FF9800", color: "white", borderRadius: "8px", border: "none", cursor: isSaved ? "default" : "pointer", fontWeight: "bold", transition: "0.2s" }}>
                                {isSaved ? "✅ Đã lưu Từ Vựng" : "🔖 Lưu vào Từ Vựng"}
                            </button>
                            <button onClick={() => { playSound("click"); setDictModal(null); }} style={{ flex: 1, padding: "12px", fontSize: "14px", backgroundColor: "#e0e0e0", color: "#333", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>
                                Đóng
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
      )}

      {/* THANH TRẠNG THÁI */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", height: "40px", marginBottom: "15px", gap: "10px" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
          <button 
            onClick={() => { 
              if(streak >= REQUIRED_STREAK) { playSound("click"); onBack(); }
            }} 
            style={{ width: "max-content", padding: "6px 10px", fontSize: "13px", cursor: streak >= REQUIRED_STREAK ? "pointer" : "not-allowed", backgroundColor: streak >= REQUIRED_STREAK ? "#e3f2fd" : "#f0f0f0", color: streak >= REQUIRED_STREAK ? "#1565c0" : "#999", border: "1px solid #ccc", borderRadius: "6px", whiteSpace: "nowrap", fontWeight: "bold", margin: 0, flexShrink: 0 }}
          >
            ⬅ {streak >= REQUIRED_STREAK ? "🔓" : `🔒 ${streak}/${REQUIRED_STREAK}`}
          </button>
        </div>

        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: "6px 15px", borderRadius: "20px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)", border: "1px solid #eee", flexShrink: 0 }}>
          <span style={{ fontWeight: "bold", color: (DIFFICULTY_LEVEL===4 ? globalTime : timeLeft) <= 5 ? "#f44336" : "#2196F3", fontSize: "15px", textAlign: "center", whiteSpace: "nowrap" }}>
            ⏱️ {DIFFICULTY_LEVEL === 4 ? globalTime : timeLeft}s
          </span>
        </div>

        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", backgroundColor: "#2196F3", color: "white", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {TOEIC_PART === "scan_skim" ? "SKIM & SCAN ⚡" : TOEIC_PART}
          </span>
          {DIFFICULTY_LEVEL === 3 ? (
            <div style={{ 
                display: "flex", alignItems: "center", gap: "4px", fontSize: "14px", whiteSpace: "nowrap", flexShrink: 0,
                padding: lives === 1 ? "4px 10px" : "0",
                backgroundColor: lives === 1 ? "#ffebee" : "transparent",
                border: lives === 1 ? "1px solid #f44336" : "none",
                borderRadius: "12px",
                color: lives === 1 ? "#d32f2f" : "#E91E63",
                fontWeight: "bold",
                animation: lives === 1 ? "heartbeat 0.8s infinite" : "none",
                boxShadow: lives === 1 ? "0 0 8px rgba(244, 67, 54, 0.6)" : "none"
            }}>
               {lives === 1 ? "🔥 MẠNG CUỐI" : `${lives} ❤️`}
            </div>
          ) : (
            <span style={{ color: "#666", fontSize: "13px", whiteSpace: "nowrap", fontWeight: "bold", flexShrink: 0 }}>
              {DIFFICULTY_LEVEL === 4 ? `Đúng: ${score}` : `${current + 1}/${questionsData.length}`}
            </span>
          )}
        </div>
      </div>

      {DIFFICULTY_LEVEL < 4 && <div style={{ width: "100%", height: "8px", backgroundColor: "#e0e0e0", borderRadius: "4px", overflow: "hidden", marginBottom: "20px" }}>
        <div style={{ height: "100%", width: `${timePercentage}%`, backgroundColor: timeLeft <= 3 ? "#f44336" : "#2196F3", transition: "width 1s linear" }} />
      </div>}

      {/* ĐÃ THÊM: userSelect="text" để ép trình duyệt cho phép bôi đen */}
      {/* KHUNG HIỂN THỊ ĐOẠN VĂN (DÀNH CHO PART 6 & 7) */}
      {currentQ.passage && currentQ.passage.trim() !== "" && (
        <div style={{ backgroundColor: "#fdfdfd", border: "1px solid #d0d7de", padding: "15px", borderRadius: "8px", marginBottom: "20px", textAlign: "left", boxShadow: "inset 0 0 10px rgba(0,0,0,0.02)", cursor: "text", userSelect: "text", WebkitUserSelect: "text" }}>
           <p style={{ fontSize: "15px", lineHeight: "1.6", color: "#333", margin: 0, whiteSpace: "pre-line", userSelect: "text", WebkitUserSelect: "text" }}>
             {currentQ.passage}
           </p>
        </div>
      )}

      {/* CÂU HỎI */}
      <h2 style={{ lineHeight: "1.6", color: "#2c3e50", fontSize: TOEIC_PART !== "part5" ? "18px" : "20px", borderBottom: "2px dashed #bbdefb", paddingBottom: "15px", marginBottom: "20px", cursor: "text", userSelect: "text", WebkitUserSelect: "text" }}>
        {currentQ.question}
      </h2>

      <div className="options">
        {currentQ.options.map((option, idx) => (
          <button key={idx} onClick={() => handleAnswer(option)} className={selected ? (option === currentQ.answer ? "correct" : option === selected ? "wrong" : "") : ""} disabled={selected !== null}>
            {option}
          </button>
        ))}
      </div>

      {/* FEEDBACK BÀI GIẢNG */}
      {selected && answerStatus && (
        <>
          <div className={`feedback-box ${comboClass}`}>
            {answerStatus.text}
          </div>

          <div style={{ marginTop: "20px", textAlign: "left", backgroundColor: "#f0f8ff", padding: "20px", borderRadius: "12px", border: "2px solid #90caf9", position: "relative", cursor: "text", userSelect: "text", WebkitUserSelect: "text" }}>
            <div style={{ position: "absolute", top: "-15px", left: "15px", backgroundColor: "#2196F3", color: "white", padding: "5px 15px", borderRadius: "20px", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 5px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "5px", userSelect: "none" }}>
              <span>🤖</span> Thầy AI Giải Thích
            </div>
            
            {selected !== "TIMEOUT" && selected !== currentQ.answer && (
             <div style={{ marginTop: "10px", marginBottom: "15px", fontSize: "16px", color: "#d32f2f", fontWeight: "bold", userSelect: "none" }}>
               Đáp án đúng: <span style={{ textDecoration: "underline", color: "#2e7d32", padding: "2px 6px", backgroundColor: "#e8f5e9", borderRadius: "4px", userSelect: "text", WebkitUserSelect: "text" }}>{currentQ.answer}</span>
             </div>
            )}

            <div style={{ marginTop: "15px", cursor: "text", userSelect: "text", WebkitUserSelect: "text" }}>
              {formatExplanation(currentQ.explanation)}
            </div>
          </div>

          {/* Dải đệm tàng hình */}
          <div style={{ height: "90px", width: "100%" }}></div>

          <button 
            className="next" 
            onClick={nextQuestion} 
            style={{ 
              position: "fixed", 
              bottom: "30px", 
              left: "50%", 
              transform: "translateX(-50%)", 
              width: "calc(100% - 40px)", 
              maxWidth: "400px", 
              padding: "16px", 
              fontSize: "18px", 
              fontWeight: "bold", 
              borderRadius: "16px", 
              boxShadow: "0 10px 25px rgba(0,0,0,0.25)", 
              zIndex: 999, 
              border: "3px solid white"
            }}
          >
            Câu tiếp theo ➡️
          </button>
        </>
      )}
    </div>
  );
}

// --- ĐƯA BỘ MÁY NHẠC RA NGOÀI ---
const BGM_PLAYLIST = [
  "/music/1.mp3",       
  "/music/2.mp3",    
  "/music/3.mp3",    
  "/music/4.mp3",        
  "/music/5.mp3",     
  "/music/6.mp3",     
  "/music/7.mp3",     
  "/music/8.mp3", 
  "/music/9.mp3"
];

const globalBgm = new Audio();
globalBgm.loop = false;

// --- COMPONENT MỚI: MÀN HÌNH CHỌN CHẾ ĐỘ HỌC DẠNG Ô (ĐÃ TỐI GIẢN) ---
function ModeSelectionScreen({ onModeSelect, onNotebookClick }) {
    // Helper function để tạo từng ô
    const renderModeBox = (title, icon, bgColor, screenTarget) => (
        <div 
            onClick={() => {
                if (screenTarget === "notebook") {
                    onNotebookClick();
                } else {
                    onModeSelect(screenTarget);
                }
            }}
            style={{
                flex: 1,
                aspectRatio: "1 / 1", // Giữ ô hình vuông chuẩn
                borderRadius: "20px",
                backgroundColor: bgColor,
                color: "white",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: "20px",
                boxShadow: "0 6px 15px rgba(0,0,0,0.15)",
                transition: "0.2s",
                userSelect: "none"
            }}
            // Hiệu ứng búng nhẹ khi di chuột vào (trên PC)
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >
            <span style={{ fontSize: "50px", marginBottom: "12px", filter: "drop-shadow(0px 4px 4px rgba(0,0,0,0.2))" }}>{icon}</span>
            <span style={{ fontSize: "17px", fontWeight: "bold", textAlign: "center", textShadow: "0px 1px 2px rgba(0,0,0,0.3)" }}>{title}</span>
        </div>
    );

    return (
        <div className="container" style={{ textAlign: "center", paddingTop: "10px", maxWidth: "450px" }}>
            {/* ĐÃ XÓA DÒNG CHỮ "Chọn Chế Độ Học" Ở ĐÂY ĐỂ GIAO DIỆN GỌN HƠN */}
            
            {/* GRID ĐÚNG 4 Ô CÂN ĐỐI */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                {renderModeBox("Sổ Tay", "📖", "#FF9800", "notebook")}
                {renderModeBox("Ôn Từ Vựng", "🚀", "#4CAF50", "vocab_settings")}
                {renderModeBox("Ôn Colloc.", "📚", "#9C27B0", "collocation_settings")}
                {renderModeBox("Ôn Ngữ Pháp", "📐", "#2196F3", "grammar_settings")}
            </div>
        </div>
    );
}

// =======================================================================
// COMPONENT: SỔ TAY TÍCH HỢP AI + SỬA BẰNG TAY (MANUAL EDIT) XỊN SÒ
// =======================================================================
function NotebookScreen({ globalStats, onBack, onSaveWord, onRemoveWord, onMoveWord }) {
  const [activeTab, setActiveTab] = useState("vocab");
  const [newWord, setNewWord] = useState("");
  const [isAdding, setIsAdding] = useState(false); 

  const [viewAllModal, setViewAllModal] = useState(null); 
  const [wordDetailModal, setWordDetailModal] = useState(null); 

  const [isEditingManual, setIsEditingManual] = useState(false);
  const [manualInputs, setManualInputs] = useState({ phonetic: "", meaning: "", usage: "", synonym: "", structure: "" });

  /// HÀM LÕI 1: GỌI AI DỊCH LẺ 1 TỪ (ĐÃ ÉP BẮT BUỘC TRẢ VỀ LOẠI TỪ)
  const fetchAI = async (wordInput, currentTab) => {
      const API_KEY = getActiveKey();
      if (!API_KEY) throw new Error("No_API");
      
      if (!window.globalCachedModel) {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
          const listData = await listRes.json();
          const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
          const flashModel = textModels.find(m => m.name.includes("flash"));
          window.globalCachedModel = flashModel ? flashModel.name : textModels[0].name;
      }

      let prompt = currentTab === "grammar" 
        ? `Giải thích cấu trúc ngữ pháp: "${wordInput}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON (Không giải thích thêm):\n{"word": "${wordInput}", "phonetic": "Công thức", "meaning": "Cách sử dụng cốt lõi", "usage": "1 ví dụ"}`
        : `Phân tích cụm từ tiếng Anh: "${wordInput}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON (Không giải thích thêm):\n{"word": "Từ vựng (BẮT BUỘC kèm từ loại, VD: apple (n), run (v))", "phonetic": "Phiên âm", "meaning": "(Đồng nghĩa) - Nghĩa.", "usage": "1 ví dụ"}`;

      const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
      if (window.globalCachedModel.includes("1.5")) {
          requestBody.generationConfig = { response_mime_type: "application/json" };
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
      });
      const data = await res.json();
      
      if (data.error && (data.error.message.toLowerCase().includes("quota") || data.error.message.toLowerCase().includes("expired") || data.error.code === 429)) {
          window.globalCachedModel = null;
          if (rotateKey()) {
              await new Promise(r => setTimeout(r, 1500)); 
              return fetchAI(wordInput, currentTab);
          }
          throw new Error("Hết toàn bộ Key dự phòng!");
      }

      let rawText = data.candidates[0].content.parts[0].text;
      const jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) rawText = jsonMatch[0];
      return JSON.parse(rawText);
  };

  // --- TÍNH NĂNG MỚI: HÀM LÕI 2 "DỊCH SỈ" (ĐÃ ÉP BẮT BUỘC TRẢ VỀ LOẠI TỪ) ---
  const fetchAIBatch = async (wordsString, currentTab) => {
      const API_KEY = getActiveKey();
      if (!API_KEY) throw new Error("No_API");

      if (!window.globalCachedModel) {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
          const listData = await listRes.json();
          const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
          const flashModel = textModels.find(m => m.name.includes("flash"));
          window.globalCachedModel = flashModel ? flashModel.name : textModels[0].name;
      }

      let prompt = currentTab === "grammar"
        ? `Giải thích các cấu trúc ngữ pháp sau: "${wordsString}".\nCHỈ TRẢ VỀ DUY NHẤT 1 MẢNG JSON:\n[{"word": "cấu trúc 1", "phonetic": "Công thức", "meaning": "Nghĩa", "usage": "Ví dụ"}]`
        : `Phân tích các từ sau: "${wordsString}".\nCHỈ TRẢ VỀ DUY NHẤT 1 MẢNG JSON:\n[{"word": "Từ vựng (BẮT BUỘC kèm từ loại, VD: apple (n), run (v))", "phonetic": "Phiên âm", "meaning": "Nghĩa", "usage": "Ví dụ"}]`;

      const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
      if (window.globalCachedModel.includes("1.5")) {
          requestBody.generationConfig = { response_mime_type: "application/json" };
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
      });
      const data = await res.json();

      if (data.error && (data.error.message.toLowerCase().includes("quota") || data.error.message.toLowerCase().includes("expired") || data.error.code === 429)) {
          window.globalCachedModel = null;
          if (rotateKey()) {
              await new Promise(r => setTimeout(r, 1500));
              return fetchAIBatch(wordsString, currentTab);
          }
          throw new Error("Hết toàn bộ Key dự phòng!");
      }

      let rawText = data.candidates[0].content.parts[0].text;
      
      // ĐÃ FIX: Chỉ săn lùng mảng [...] để chống rác tuyệt đối
      const jsonMatch = rawText.match(/\[[\s\S]*\]/); 
      if (jsonMatch) rawText = jsonMatch[0];
      
      const parsedArray = JSON.parse(rawText); 
      if (!Array.isArray(parsedArray)) throw new Error("AI không trả về mảng dữ liệu.");
      return parsedArray; 
  };

  // --- ĐÃ NÂNG CẤP: GỌI AI VÀ LƯU DATABASE 1 LẦN DUY NHẤT DÙ LÀ 1 TỪ HAY 10 TỪ ---
  const handleAddNew = async (e) => {
    e.preventDefault();
    const wordInput = newWord.trim();
    if (!wordInput) return;
    setIsAdding(true);

    try {
        if (wordInput.includes(',')) {
            // Nếu nhập sỉ -> Gọi AI dịch sỉ ra 1 mảng
            const aiWordsArray = await fetchAIBatch(wordInput, activeTab);
            
            // ĐÃ FIX: Nhồi cả mảng vào Database 1 lần duy nhất, không dùng vòng lặp nữa!
            await onSaveWord(activeTab, aiWordsArray);
        } else {
            // Nếu chỉ nhập 1 từ -> Chạy bình thường
            const aiWordObj = await fetchAI(wordInput, activeTab);
            await onSaveWord(activeTab, aiWordObj);
        }
    } catch (error) {
        if(error.message === "No_API") alert("Bạn chưa cấu hình API Key để gọi AI!");
        else { 
            console.error("Lỗi AI:", error); 
            // Nếu AI hỏng, lưu thô một mảng các từ vào sổ tay 1 lượt
            const rawWords = wordInput.split(',').map(w => w.trim()).filter(w => w);
            await onSaveWord(activeTab, rawWords.map(w => w.toLowerCase())); 
        }
    }
    setIsAdding(false);
    setNewWord(""); 
  };

  const handleRetranslate = async (wordStr) => {
      setIsAdding(true);
      playSound("click");
      try {
          const aiWordObj = await fetchAI(wordStr, activeTab);
          
          // ĐÃ FIX: Ép AI giữ nguyên tên gốc của thẻ (tag) để lúc mở lên Sổ tay tìm thấy 100%
          aiWordObj.word = wordStr; 
          
          onSaveWord(activeTab, aiWordObj);
          setWordDetailModal({ wordStr, listType: wordDetailModal.listType, detail: aiWordObj });
      } catch (error) { alert("Lỗi khi cập nhật AI, vui lòng thử lại sau."); }
      setIsAdding(false);
  }

  const startManualEdit = () => {
    playSound("click");
    setManualInputs({
        phonetic: wordDetailModal.detail?.phonetic || "",
        meaning: wordDetailModal.detail?.meaning || "",
        usage: wordDetailModal.detail?.usage || ""
    });
    setIsEditingManual(true);
  }

  const saveManualEdit = () => {
      if (!manualInputs.meaning.trim()) { alert("Bạn phải nhập Nghĩa nhé."); return; }
      playSound("click");
      const updatedWordObj = {
          word: wordDetailModal.wordStr, 
          phonetic: manualInputs.phonetic.trim(),
          meaning: manualInputs.meaning.trim(),
          usage: manualInputs.usage.trim()
      };
      onSaveWord(activeTab, updatedWordObj);
      setWordDetailModal({ ...wordDetailModal, detail: updatedWordObj });
      setIsEditingManual(false);
  }

  const openDetail = (w, listType) => {
      playSound("click");
      const dict = globalStats[activeTab]?.addedWordsObj || [];
      const foundDetail = [...dict].reverse().find(item => item.word.toLowerCase() === w.toLowerCase());
      setWordDetailModal({ wordStr: w, listType, detail: foundDetail || null });
      setIsEditingManual(false); 
  };

  const closeDetailModal = () => {
    playSound("click");
    setWordDetailModal(null);
    setIsEditingManual(false); 
  }

  // --- ĐÃ NÂNG CẤP: THÊM NÚT "V" CHO CẢ Ô VÀNG VÀ Ô ĐỎ ---
  const renderTags = (wordsArray, color, bgColor, listType, limit = null) => {
      if (!wordsArray || wordsArray.length === 0) return <p style={{ color: "#aaa", fontSize: "14px", fontStyle: "italic", margin: 0 }}>Chưa có từ nào.</p>;
      const displayWords = limit ? wordsArray.slice(0, limit) : wordsArray;
      
      return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {displayWords.map(word => {
                  const wordStr = typeof word === 'string' ? word : word.word;
                  return (
                      <div key={wordStr} style={{ position: "relative", display: "inline-flex", alignItems: "center", textTransform: "none" }}>
                          
                          {/* 1. Phần Bấm vào Chữ để mở Modal */}
                          <span onClick={() => openDetail(wordStr, listType)} style={{ padding: "6px 36px 6px 12px", borderRadius: "20px", fontSize: "14px", backgroundColor: bgColor, color: color, fontWeight: "500", cursor: "pointer", border: `1px solid ${color}80`, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                              {wordStr}
                          </span>
                          
                          {/* 2. Cụm Nút Bấm Chức Năng (V và X) */}
                          <div style={{ position: "absolute", top: "-5px", right: "-8px", display: "flex", gap: "2px" }}>
                              
                              {/* NÚT V (Hiện ở cả Ô Đỏ và Ô Vàng) */}
                              {(listType === "wrongWords" || listType === "savedWords") && (
                                  <button 
                                      onClick={(e) => { 
                                          e.stopPropagation(); 
                                          if (listType === "wrongWords") {
                                              onMoveWord(activeTab, "wrongWords", "savedWords", wordStr); // Đỏ -> Vàng
                                          } else if (listType === "savedWords") {
                                              onMoveWord(activeTab, "savedWords", "masteredWords", wordStr); // Vàng -> Xanh
                                          }
                                      }}
                                      style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#4CAF50", color: "white", border: "1px solid white", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontWeight: "bold", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                                      title={listType === "wrongWords" ? "Đã sửa sai -> Chuyển lên Ô Vàng" : "Đã thuộc -> Chuyển xuống Ô Xanh"}
                                  >✓</button>
                              )}
                              
                              {/* NÚT X (Luôn luôn là XÓA VĨNH VIỄN) */}
                              <button 
                                  onClick={(e) => { 
                                      e.stopPropagation(); 
                                      onRemoveWord(activeTab, listType, wordStr); 
                                  }} 
                                  style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: color, color: "white", border: "1px solid white", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontWeight: "bold", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                                  title="Xóa vĩnh viễn khỏi Sổ tay"
                              >×</button>
                          </div>
                      </div>
                  );
              })}
              
              {/* Nút Xem Thêm */}
              {limit && wordsArray.length > limit && (
                  <span onClick={() => { playSound("click"); setViewAllModal({ title: activeTab === "grammar" ? "📘 Cấu trúc đã lưu" : "Tất cả mục", words: wordsArray, color, bgColor, listType }); }} style={{ padding: "6px 12px", borderRadius: "20px", fontSize: "13px", backgroundColor: "#f5f5f5", color: "#666", cursor: "pointer", border: "1px dashed #ccc", display: "inline-flex", alignItems: "center" }}>
                      +{wordsArray.length - limit} xem thêm
                  </span>
              )}
          </div>
      );
  };

  const renderWordList = (title, words, icon, color, bgColor, listType) => (
    <div style={{ marginBottom: "20px", textAlign: "left", backgroundColor: "#fff", padding: "15px", borderRadius: "12px", border: `1px solid ${color}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
      <h3 style={{ color: color, marginTop: 0, marginBottom: "15px", display: "flex", alignItems: "center", gap: "8px", fontSize: "16px" }}>
          {icon} {title} ({words?.length || 0})
      </h3>
      {renderTags(words, color, bgColor, listType, 8)}
    </div>
  );

  const editInputStyle = { width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #90caf9", boxSizing: "border-box", fontSize: "15px", marginBottom: "10px" };

  return (
    <div className="container" style={{ textAlign: "center", paddingTop: "20px", maxWidth: "450px" }}>
      <h2 style={{ color: "#2c3e50", marginBottom: "5px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>📖 Sổ Tay Của Tôi</h2>
      <p style={{ color: "#7f8c8d", marginBottom: "20px", fontSize: "14px" }}>Nơi lưu trữ bí kíp và khắc phục điểm yếu</p>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", backgroundColor: "#f0f0f0", padding: "5px", borderRadius: "10px" }}>
        <button onClick={() => setActiveTab("vocab")} style={{ flex: 1, padding: "10px 5px", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer", transition: "0.2s", backgroundColor: activeTab === "vocab" ? "#4CAF50" : "transparent", color: activeTab === "vocab" ? "white" : "#666" }}>Từ Vựng</button>
        <button onClick={() => setActiveTab("collocation")} style={{ flex: 1, padding: "10px 5px", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer", transition: "0.2s", backgroundColor: activeTab === "collocation" ? "#9C27B0" : "transparent", color: activeTab === "collocation" ? "white" : "#666" }}>Colloc.</button>
        <button onClick={() => setActiveTab("grammar")} style={{ flex: 1, padding: "10px 5px", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer", transition: "0.2s", backgroundColor: activeTab === "grammar" ? "#2196F3" : "transparent", color: activeTab === "grammar" ? "white" : "#666" }}>Ngữ Pháp</button>
      </div>

      <form onSubmit={handleAddNew} style={{ display: "flex", gap: "10px", marginBottom: "20px", animation: "popIn 0.3s ease-out" }} noValidate>
        <input 
           type="text" value={newWord} onChange={(e) => setNewWord(e.target.value)} disabled={isAdding}
           placeholder={activeTab === "grammar" ? "Nhập cấu trúc (cách nhau bằng dấu phẩy)..." : "Nhập nhiều từ cách nhau bằng dấu phẩy (,)..."}
           style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #ccc", outline: "none", fontSize: "16px", textTransform: activeTab === "grammar" ? "none" : "lowercase" }}
           autoComplete="off" autoCorrect="off" spellCheck="false"
        />
        <button type="submit" disabled={!newWord.trim() || isAdding} style={{ padding: "0 20px", backgroundColor: newWord.trim() ? (isAdding ? "#9e9e9e" : "#FF9800") : "#ccc", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: newWord.trim() && !isAdding ? "pointer" : "not-allowed", fontSize: "15px", transition: "0.2s" }}>
           {isAdding ? "🤖 Đang dịch..." : "➕ Thêm"}
        </button>
      </form>

      <div style={{ animation: "popIn 0.3s ease-out" }}>
        {renderListLogic(globalStats, activeTab, renderWordList)}
      </div>

      <button onClick={() => { onBack(); }} style={{ width: "100%", padding: "12px", marginTop: "10px", fontSize: "16px", backgroundColor: "#e0e0e0", color: "#555", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: "bold" }}>⬅ Trở về sảnh</button>

      {/* 1. OVERLAY MODAL: XEM TẤT CẢ (CÓ THANH CUỘN) - ĐÃ FIX REALTIME */}
      {viewAllModal && (
        <div onClick={() => { playSound("click"); setViewAllModal(null); }} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box", cursor: "pointer" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "400px", borderRadius: "15px", padding: "20px", maxHeight: "80vh", display: "flex", flexDirection: "column", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", cursor: "default" }}>
              <h3 style={{ color: viewAllModal.color, marginTop: 0, borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
                  {viewAllModal.title} ({(globalStats[activeTab][viewAllModal.listType] || []).length})
              </h3>
                <div style={{ overflowY: "auto", flex: 1, padding: "10px 0" }}>
                   {renderTags(globalStats[activeTab][viewAllModal.listType] || [], viewAllModal.color, viewAllModal.bgColor, viewAllModal.listType, null)}
                </div>
                <button onClick={() => { playSound("click"); setViewAllModal(null); }} style={{ width: "100%", padding: "12px", marginTop: "15px", fontSize: "16px", backgroundColor: "#e0e0e0", color: "#333", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>Đóng</button>
            </div>
        </div>
      )}

      {/* 2. OVERLAY MODAL: XEM CHI TIẾT TỪ & CẬP NHẬT/SỬA HÈN */}
     {wordDetailModal && (() => {
        const currentList = globalStats[activeTab]?.[wordDetailModal.listType] || [];
        const currentIdx = currentList.findIndex(w => (typeof w === "string" ? w : w.word).toLowerCase() === wordDetailModal.wordStr.toLowerCase());
        const goTo = (offset) => {
          const newIdx = currentIdx + offset;
          if (newIdx < 0 || newIdx >= currentList.length) return;
          const newWord = typeof currentList[newIdx] === "string" ? currentList[newIdx] : currentList[newIdx].word;
          openDetail(newWord, wordDetailModal.listType);
        };
        return (
        <div onClick={closeDetailModal} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", maxWidth: "430px" }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => goTo(-1)} disabled={currentIdx <= 0}
                    style={{ flexShrink: 0, width: "36px", height: "60px", borderRadius: "10px", border: "none", backgroundColor: currentIdx <= 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)", fontSize: "22px", cursor: currentIdx <= 0 ? "not-allowed" : "pointer", boxShadow: "0 3px 10px rgba(0,0,0,0.2)" }}>‹</button>

            <div style={{ backgroundColor: "white", flex: 1, borderRadius: "16px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "default" }}>   
                {/* Số thứ tự */}
                {currentIdx >= 0 && <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#aaa" }}>{currentIdx + 1} / {currentList.length}</p>}
                <h2 style={{ fontSize: "28px", color: "#2196F3", margin: "0 0 5px 0" }}>{wordDetailModal.wordStr}</h2>
                
                {!isEditingManual && (
                    <>
                        {wordDetailModal.detail ? (
                            <div style={{ textAlign: "left", backgroundColor: "#f0f8ff", padding: "15px", borderRadius: "8px", marginTop: "15px", border: "1px dashed #90caf9" }}>
                                {/* ĐÃ FIX: Hiện Công Thức nếu đang ở Tab Ngữ Pháp */}
                                {wordDetailModal.detail.phonetic && (
                                    <p style={{ margin: "0 0 10px 0", fontSize: "15px", fontStyle: "italic", color: "#666" }}>
                                        {activeTab === "grammar" ? `📐 ${wordDetailModal.detail.phonetic}` : wordDetailModal.detail.phonetic}
                                    </p>
                                )}
                                <p style={{ margin: "0 0 10px 0", fontSize: "18px", fontWeight: "bold", color: "#4CAF50" }}>{wordDetailModal.detail.meaning}</p>
                                {wordDetailModal.detail.usage && <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#333", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "10px" }}>"{wordDetailModal.detail.usage}"</p>}
                                {wordDetailModal.detail.synonym && <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#7b1fa2" }}>🔀 <strong>Đồng nghĩa:</strong> {wordDetailModal.detail.synonym}</p>}
                                {wordDetailModal.detail.structure && <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#0277bd" }}>🔗 <strong>Cấu trúc liên quan:</strong> {wordDetailModal.detail.structure}</p>}
                            </div>
                        ) : (
                            <div style={{ marginTop: "15px", padding: "15px", backgroundColor: "#fff3e0", borderRadius: "8px", border: "1px dashed #ffb74d", color: "#e65100", fontSize: "14px" }}>
                                {activeTab === "grammar" ? "Cấu trúc này chưa có giải nghĩa chi tiết." : "Từ này chưa có giải nghĩa chi tiết trong Sổ tay."}<br/>Bạn có thể Sửa bằng tay hoặc nhờ AI tra cứu nhé.
                            </div>
                        )}

                        <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
                            <button onClick={() => handleRetranslate(wordDetailModal.wordStr)} disabled={isAdding} style={{ flex: 1, padding: "10px", fontSize: "14px", backgroundColor: "#FF9800", color: "white", borderRadius: "8px", border: "none", cursor: isAdding ? "not-allowed" : "pointer", fontWeight: "bold" }}>
                                {isAdding ? "🤖 Đang xử lý..." : "🤖 AI tra nghĩa"}
                            </button>
                            <button onClick={startManualEdit} disabled={isAdding} style={{ flex: 1, padding: "10px", fontSize: "14px", backgroundColor: "#3f51b5", color: "white", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>
                                ✏️ Sửa bằng tay
                            </button>
                            <button onClick={closeDetailModal} style={{ flex: 1, padding: "10px", fontSize: "14px", backgroundColor: "#e0e0e0", color: "#333", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>
                                Đóng
                            </button>
                        </div>
                    </>
                  )
                }

                

                {isEditingManual && (
                    <div style={{ marginTop: "15px", textAlign: "left" }}>
                        {/* ĐÃ FIX: Nhãn sửa thủ công đổi theo Tab */}
                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>{activeTab === "grammar" ? "📐 Công thức / Cấu trúc:" : "🗣️ Phiên âm:"}</label>
                        <input type="text" value={manualInputs.phonetic} onChange={(e) => setManualInputs({...manualInputs, phonetic: e.target.value})} placeholder={activeTab === "grammar" ? "VD: S + suggest + V-ing" : "/Phiên âm quốc tế/"} style={editInputStyle}/>
                        
                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>🔖 Cách dùng / Nghĩa (Bắt buộc):</label>
                        <input type="text" value={manualInputs.meaning} onChange={(e) => setManualInputs({...manualInputs, meaning: e.target.value})} placeholder="Định nghĩa ngắn gọn..." style={editInputStyle}/>
                        
                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>📖 Ví dụ:</label>
                        <textarea value={manualInputs.usage} onChange={(e) => setManualInputs({...manualInputs, usage: e.target.value})} placeholder="Một câu ví dụ ngắn..." style={{ ...editInputStyle, height: "60px", resize: "none", fontFamily: "inherit" }}/>

                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>🔀 Từ đồng nghĩa:</label>
                        <input type="text" value={manualInputs.synonym || ""} onChange={(e) => setManualInputs({...manualInputs, synonym: e.target.value})} placeholder="VD: attempt, endeavor..." style={editInputStyle}/>

                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>🔗 Cấu trúc liên quan:</label>
                        <input type="text" value={manualInputs.structure || ""} onChange={(e) => setManualInputs({...manualInputs, structure: e.target.value})} placeholder="VD: make an effort to V..." style={editInputStyle}/>

                        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                            <button onClick={saveManualEdit} style={{ flex: 1, padding: "10px", fontSize: "14px", backgroundColor: "#4CAF50", color: "white", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>
                                ✅ Lưu thay đổi
                            </button>
                            <button onClick={() => { setIsEditingManual(false); playSound("click"); }} style={{ flex: 1, padding: "10px", fontSize: "14px", backgroundColor: "#e0e0e0", color: "#333", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>
                                ❌ Hủy
                            </button>
                        </div>
                    </div>
                )}
            </div>
                {/* NÚT NEXT */}
                <button onClick={() => goTo(1)} disabled={currentIdx >= currentList.length - 1}
                    style={{ flexShrink: 0, width: "36px", height: "60px", borderRadius: "10px", border: "none", backgroundColor: currentIdx >= currentList.length - 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)", fontSize: "22px", cursor: currentIdx >= currentList.length - 1 ? "not-allowed" : "pointer", boxShadow: "0 3px 10px rgba(0,0,0,0.2)" }}>›</button>
            </div>
        </div>
        )
      })()}
    </div>
  );
}
// HÀM TÁCH LOGIC RENDER: HIỂN THỊ CẢ 3 CẤP ĐỘ
function renderListLogic(globalStats, activeTab, renderWordList) {
    const stats = globalStats[activeTab] || {};
    return (
        <>
            {/* Ô VÀNG: Ghim thủ công */}
            {renderWordList(activeTab === "grammar" ? "📘 Cấu trúc đã lưu" : "🔖 Đang học (Đang khó nhớ)", stats.savedWords, "🔖", "#FF9800", "#fff3e0", "savedWords")}
            
            {/* Ô ĐỎ: Làm sai nhiều */}
            {activeTab !== "grammar" && renderWordList("❌ Làm sai nhiều (Cần khắc phục)", stats.wrongWords, "❌", "#F44336", "#ffebee", "wrongWords")}
            
            {/* Ô XANH: Đã thuộc */}
            {activeTab !== "grammar" && renderWordList("✅ Đã thực sự thuộc (Sẽ ôn ở Lv Cao)", stats.masteredWords, "✅", "#4CAF50", "#e8f5e9", "masteredWords")}
        </>
    )
}

// --- COMPONENT: APP CHÍNH ---
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [screen, setScreen] = useState("home"); 

  const [showProfileMenu, setShowProfileMenu] = useState(false); 

  // --- TÍNH NĂNG MỚI: KẾ HOẠCH HỌC TẬP (KỶ LUẬT THÉP) ---
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(() => parseInt(localStorage.getItem("toeic_daily_target")) || 0);
  const [studyTime, setStudyTime] = useState(() => localStorage.getItem("toeic_study_time") || "20:00");
  // --- KỶ LUẬT THÉP: ĐẾM SỐ TỪ ĐÃ THUỘC TRONG NGÀY ---
  const [todayMasteredCount, setTodayMasteredCount] = useState(() => {
      const savedDate = localStorage.getItem("toeic_last_study_date");
      const today = new Date().toLocaleDateString();
      if (savedDate !== today) {
          localStorage.setItem("toeic_today_mastered", "0");
          localStorage.setItem("toeic_last_study_date", today);
          return 0;
      }
      return parseInt(localStorage.getItem("toeic_today_mastered")) || 0;
  });

  const [countdownText, setCountdownText] = useState(null); // Lưu chuỗi đếm ngược (VD: "04:59")

  // --- TÍNH NĂNG MỚI: ĐỒNG HỒ & LỊCH TRỰC TUYẾN ---
  const [time, setTime] = useState(new Date());

  useEffect(() => {
      const timer = setInterval(() => setTime(new Date()), 1000);
      return () => clearInterval(timer);
  }, []);

  const dayTranslations = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const currentFormattedDate = dayTranslations[time.getDay()] + ', Ngày ' + time.getDate() + ' Tháng ' + (time.getMonth() + 1) + ', Năm ' + time.getFullYear();
  const currentFormattedTime = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0')+ ':' + time.getSeconds().toString().padStart(2, '0');

  // HỆ THỐNG BÁO THỨC ĐẾN GIỜ HỌC & ĐẾM NGƯỢC 5 PHÚT
  useEffect(() => {
      if (dailyTarget === 0) {
          setCountdownText(null);
          return;
      }
      
      // Xin quyền gửi thông báo về điện thoại/PC
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
          Notification.requestPermission();
      }

      const timer = setInterval(() => {
          const now = new Date();
          const currentHourMin = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          
          // --- MÁY TÍNH ĐẾM NGƯỢC 5 PHÚT ---
          const [targetHour, targetMin] = studyTime.split(':').map(Number);
          const targetDate = new Date();
          targetDate.setHours(targetHour, targetMin, 0, 0);
          
          const diffMs = targetDate.getTime() - now.getTime();
          
          // Nếu còn <= 5 phút (300,000 ms) và lớn hơn 0
          if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
              const m = Math.floor(diffMs / 60000);
              const s = Math.floor((diffMs % 60000) / 1000);
              setCountdownText(`⏳ Sắp tới giờ: ${m}:${s.toString().padStart(2, '0')}`);
          } else {
              setCountdownText(null);
          }

          // Đúng giờ vàng -> Bắn thông báo
          if (currentHourMin === studyTime && now.getSeconds() === 0) {
              playSound("finish");
              if (Notification.permission === "granted") {
                  new Notification("⏰ Đến giờ Tu Tiên rồi!", {
                      body: `Mục tiêu hôm nay: ${dailyTarget} từ. Vào cày ngay kẻo rớt trình!`,
                      icon: "🚀"
                  });
              } else {
                  alert(`⏰ ĐẾN GIỜ RỒI! Mục tiêu hôm nay của bạn là ${dailyTarget} từ. Vào cày ngay!`);
              }
          }
      }, 1000);
      return () => clearInterval(timer);
  }, [dailyTarget, studyTime]);

  const saveStudyPlan = () => {
      playSound("click");
      localStorage.setItem("toeic_daily_target", dailyTarget.toString());
      localStorage.setItem("toeic_study_time", studyTime);
      setShowPlanModal(false);
      alert("✅ Đã thiết lập Kỷ Luật Thép! Hệ thống sẽ khóa nút thoát nếu chưa cày đủ chỉ tiêu.");
  };
  
  // BƯỚC 2: Thêm các States và hàm xử lý Profile VIP Pro Max
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileAvatarFile, setProfileAvatarFile] = useState(null); // Giữ file ảnh mới chọn
  const [avatarPreview, setAvatarPreview] = useState(null); // Giữ link ảnh để xem trước (preview)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // Thanh tiến trình 0-100%

  // MÁY XAY ẢNH "TÀ ĐẠO": Đã bọc thép Base64 chống chặn file
  const handleProfileUpdate = async () => {
      if (!currentUser) return;
      
      const trimmedName = profileNameInput.trim();
      const hasNameChange = trimmedName && trimmedName !== currentUser.displayName;
      const hasAvatarChange = !!profileAvatarFile;
      
      if (!hasNameChange && !hasAvatarChange) {
          setShowProfileModal(false);
          return;
      }

      setIsUpdatingProfile(true);
      setUploadProgress(10); 
      try {
          const updateData = {};
          if (hasNameChange) updateData.displayName = trimmedName;

          if (hasAvatarChange) {
              setUploadProgress(40); 
              
              // 1. ĐÃ FIX: Ép file ảnh thành chuỗi mã hóa (Base64) để lách qua mọi tường lửa/Adblock
              const base64Image = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.readAsDataURL(profileAvatarFile);
                  reader.onload = () => resolve(reader.result.split(',')[1]);
                  reader.onerror = error => reject(error);
              });

              const formData = new FormData();
              formData.append("image", base64Image);
              
              // 2. Gọi API đẩy ảnh
              const API_KEY = "d5f05cd567b23cdc4af244c9ef4c4d15"; 
              const res = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
                  method: "POST",
                  body: formData
              });
              
              const imgData = await res.json();
              setUploadProgress(80); 
              
              if (imgData.success) {
                  updateData.photoURL = imgData.data.url; 
              } else {
                  // ĐÃ FIX: In chính xác lý do lỗi từ máy chủ để dễ bắt bệnh
                  throw new Error(imgData.error?.message || "Máy chủ ImgBB từ chối ảnh!");
              }
          }

          // 3. Cập nhật profile Firebase Auth
          await updateProfile(currentUser, updateData);
          setUploadProgress(100);
          
          setCurrentUser({ 
             ...currentUser, 
             displayName: updateData.displayName || currentUser.displayName,
             photoURL: updateData.photoURL || currentUser.photoURL
          }); 
          
          setShowProfileModal(false);
          setProfileAvatarFile(null);
          setAvatarPreview(null);
          playSound("finish");
      } catch (error) {
          console.error("Lỗi cập nhật profile:", error);
          alert(`Lỗi upload ảnh: ${error.message}\n(Nếu vẫn bị, có thể API Key công cộng đã hết hạn)`);
      }
      setIsUpdatingProfile(false);
      setUploadProgress(0);
  };
  
  // --- TÍNH NĂNG MỚI: ĐỔI TÊN HIỂN THỊ ---
  const [showNameModal, setShowNameModal] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const handleUpdateName = async () => {
      const trimmedName = newNameInput.trim();
      if (!trimmedName) return alert("Bác chưa nhập tên kìa!");
      
      setIsUpdatingName(true);
      try {
          // Lưu tên mới lên Đám mây Firebase
          await updateProfile(currentUser, { displayName: trimmedName });
          // Cập nhật lại UI ngay lập tức
          setCurrentUser({ ...currentUser, displayName: trimmedName }); 
          setShowNameModal(false);
          playSound("finish");
      } catch (error) {
          console.error("Lỗi đổi tên:", error);
          alert("Có lỗi xảy ra, không thể đổi tên lúc này!");
      }
      setIsUpdatingName(false);
  };
  
  const [quizSettings, setQuizSettings] = useState(null);
  
  // STATE ĐỂ LƯU TỔNG SỐ BÀI TRÊN GOOGLE SHEET
  const [totalDbWords, setTotalDbWords] = useState(() => parseInt(localStorage.getItem("toeic_total_db_words")) || 0);
  const [totalCollocDbWords, setTotalCollocDbWords] = useState(() => parseInt(localStorage.getItem("toeic_total_colloc_db_words")) || 0);

  // STATE ĐỂ LƯU DANH SÁCH TỪ CỦA SHEET CUSTOM (ĐỂ LỌC TỪ MỚI)
  const [customSheetWords, setCustomSheetWords] = useState(() => JSON.parse(localStorage.getItem("toeic_custom_words")) || []);

  const [showTutorial, setShowTutorial] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(true); 
  const [currentTrackIndex, setCurrentTrackIndex] = useState(Math.floor(Math.random() * BGM_PLAYLIST.length));
  const [volume, setVolume] = useState(0.4); 

  const forcePlayMusic = () => {
    if (isMusicPlaying) {
      if (!globalBgm.src || !globalBgm.src.includes(BGM_PLAYLIST[currentTrackIndex])) {
        globalBgm.src = BGM_PLAYLIST[currentTrackIndex];
      }
      globalBgm.play().catch(e => console.log("Trình duyệt đợi tương tác:", e));
    }
  };

  useEffect(() => {
    if (currentUser) {
      const hasSeenTutorial = localStorage.getItem("toeic_tutorial_seen");
      if (!hasSeenTutorial) {
        setShowTutorial(true);
      } else {
        forcePlayMusic();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    globalBgm.volume = volume;
  }, [volume]);

  // Mắt thần tự động dừng nhạc khi thu nhỏ web
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        globalBgm.pause();
      } else {
        // ĐÃ FIX: Bật lại nhạc cho cả Sổ tay khi mở lại web
        if (isMusicPlaying && (screen === "home" || screen === "notebook") && !showTutorial && currentUser) {
          globalBgm.play().catch(e => console.log("Lỗi bật lại nhạc:", e));
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isMusicPlaying, screen, showTutorial, currentUser]);

  useEffect(() => {
    const handleEnded = () => {
      setCurrentTrackIndex((prev) => (prev + 1) % BGM_PLAYLIST.length);
    };
    globalBgm.addEventListener("ended", handleEnded);
    return () => globalBgm.removeEventListener("ended", handleEnded);
  }, []);

  useEffect(() => {
    globalBgm.src = BGM_PLAYLIST[currentTrackIndex];
    // ĐÃ FIX: Đổi bài hát thì phát nhạc cho cả Sổ tay
    if (isMusicPlaying && (screen === "home" || screen === "notebook") && !showTutorial) {
      globalBgm.play().catch(e => console.log("Đợi tương tác..."));
    }
  }, [currentTrackIndex, isMusicPlaying, screen, showTutorial]);

  useEffect(() => {
    // ĐÃ FIX: Cho phép nhạc phát khi đang ở Trang chủ HOẶC Sổ tay
    if ((screen === "home" || screen === "notebook") && isMusicPlaying && !showTutorial && currentUser) {
      globalBgm.play().catch(e => console.log("Đợi tương tác..."));
    } else {
      globalBgm.pause();
    }
  }, [screen, isMusicPlaying, showTutorial, currentUser]);

  const toggleMusic = () => {
    playSound("click");
    if (isMusicPlaying) {
      globalBgm.pause();
    } else {
      globalBgm.play().catch(() => alert("Vui lòng click nhẹ vào màn hình 1 cái rồi bật lại nhạc nhé!"));
    }
    setIsMusicPlaying(!isMusicPlaying);
  };

  const playNextTrack = () => {
    playSound("click");
    setCurrentTrackIndex((prev) => (prev + 1) % BGM_PLAYLIST.length);
    if (!isMusicPlaying) setIsMusicPlaying(true);
  };
  
  const [globalStats, setGlobalStats] = useState({
    vocab: { correct: 0, total: 0, learnedWords: [] },
    collocation: { correct: 0, total: 0, learnedWords: [] },
    grammar: { correct: 0, total: 0, learnedWords: [] }
  });

  // HÀM LẤY TỔNG SỐ CÂU TỪ GOOGLE SHEET CHẠY NGẦM ĐÃ FIX LỖI CACHE
  useEffect(() => {
    const fetchTotalWords = async () => {
      try {
        const SHEET_ID = "1nAdOxZBZ3-Bawh3Ks54KaIYLPgGZfTuchebwbCYW8dU";
        const fetchSheetRows = async (sheetName) => {
          const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${sheetName}`;
          const res = await fetch(url);
          const text = await res.text();
          const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
          const result = JSON.parse(jsonString);
          return result.table.rows.length;
        };

        const vocabRows = await fetchSheetRows("Vocab");
        setTotalDbWords(vocabRows);
        localStorage.setItem("toeic_total_db_words", vocabRows);
        
        const collocRows = await fetchSheetRows("Collocation");
        setTotalCollocDbWords(collocRows);
        localStorage.setItem("toeic_total_colloc_db_words", collocRows);

        // try {
        //     // Đã fix lỗi gọi hàm không tồn tại, dùng fetch trực tiếp
        //     const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=Custom`;
        //     const customRes = await fetch(url);
        //     const customText = await customRes.text();
        //     const customJsonString = customText.substring(customText.indexOf('{'), customText.lastIndexOf('}') + 1);
        //     const customData = JSON.parse(customJsonString);
            
        //     const headers = customData.table.cols.map(col => col.label);
        //     const wordColIdx = headers.findIndex(h => h && h.toLowerCase() === 'word');
        //     const idx = wordColIdx !== -1 ? wordColIdx : 0;
            
        //     const customWordsArr = customData.table.rows.map(row => (row.c[idx] && row.c[idx].v) ? row.c[idx].v.toString() : "").filter(w => w !== "");
        //     setCustomSheetWords(customWordsArr);
        //     localStorage.setItem("toeic_custom_words", JSON.stringify(customWordsArr));
        // } catch (e) {
        //     console.log("Sheet Custom có thể đang trống");
        // }

      } catch (e) {
        console.error("Lỗi đếm tổng số từ:", e);
      }
    };

    fetchTotalWords();
  }, []); 

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          // Fallback cho user cũ bảo vệ cấu trúc mảng mới
          if (!data.vocab) data.vocab = { correct: 0, total: 0, learnedWords: [] };
          if (!data.vocab.learnedWords) data.vocab.learnedWords = [];
          if (!data.collocation) data.collocation = { correct: 0, total: 0, learnedWords: [] };
          if (!data.collocation.learnedWords) data.collocation.learnedWords = [];
          if (!data.grammar) data.grammar = { correct: 0, total: 0, learnedWords: [] };
          if (!data.grammar.learnedWords) data.grammar.learnedWords = [];
          
          setGlobalStats(data);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  const disableRightClick = (e) => e.preventDefault();

  const handleLogout = async () => {
    playSound("click");
    await signOut(auth);
    setCurrentUser(null);
    globalBgm.pause(); 
    setIsMusicPlaying(false);
  };

  // --- TRUYỀN THÊM TỪ/CÂU HỎI VÀO CƠ SỞ DỮ LIỆU (ĐÃ FIX: X-QUANG CHỐNG TRÙNG) ---
  const updateGlobalStats = async (type, isCorrect, itemValue = null) => {
    if (!currentUser) return;
    
    const newCorrect = globalStats[type].correct + (isCorrect ? 1 : 0);
    const newTotal = globalStats[type].total + 1;
    
    const currentState = globalStats[type] || {};

    // MÁY QUÉT X-QUANG: Xóa chữ hoa, xóa khoảng trắng thừa, lột sạch các tag loại từ (n), (v)...
    const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";

    const updatePayload = {
      [`${type}.correct`]: newCorrect,
      [`${type}.total`]: newTotal
    };

    let newSaved = currentState.savedWords || [];
    let newWrong = currentState.wrongWords || [];
    let newMastered = currentState.masteredWords || [];
    let shouldUpdateArrays = false;

    if (itemValue) {
      updatePayload[`${type}.learnedWords`] = arrayUnion(itemValue);

      if (!isCorrect && type !== "grammar") {
          const normStr = normalizeWord(itemValue);
          
          // Càn quét và xóa mọi biến thể của từ này ở CẢ 3 Ô
          newSaved = newSaved.filter(w => normalizeWord(w) !== normStr);
          newWrong = newWrong.filter(w => normalizeWord(w) !== normStr);
          newMastered = newMastered.filter(w => normalizeWord(w) !== normStr);

          // Chỉ nhét duy nhất 1 từ chuẩn vào Ô Đỏ
          newWrong.push(itemValue);
          
          // Ghi đè lại toàn bộ mảng sạch lên Firebase thay vì dùng lệnh arrayRemove (Bị ngu khi khác dấu ngoặc)
          updatePayload[`${type}.savedWords`] = newSaved;
          updatePayload[`${type}.wrongWords`] = newWrong;
          updatePayload[`${type}.masteredWords`] = newMastered;
          shouldUpdateArrays = true;
      }
    }

    try {
      await updateDoc(doc(db, "users", currentUser.uid), updatePayload);
    } catch(e) { console.error("Lỗi cập nhật tiến độ:", e); }

    setGlobalStats(prev => {
      const newState = { ...prev };
      newState[type] = { ...newState[type], correct: newCorrect, total: newTotal };
      
      if (itemValue) {
        const currentWords = prev[type].learnedWords || [];
        if (!currentWords.includes(itemValue)) {
           newState[type].learnedWords = [...currentWords, itemValue];
        }
        
        if (shouldUpdateArrays) {
            newState[type].savedWords = newSaved;
            newState[type].wrongWords = newWrong;
            newState[type].masteredWords = newMastered;
        }
      }
      return newState;
    });
  };

  if (authChecking) {
    return <div style={{textAlign:"center", marginTop:"100px"}}><h2>Đang kết nối hệ thống... ⏳</h2></div>;
  }

  if (!currentUser) {
    return (
      <div onContextMenu={disableRightClick} onClick={forcePlayMusic}>
        <AuthScreen />
      </div>
    );
  }



  // --- TÍNH NĂNG MỚI: LƯU TỪ VÀ ĐỊNH NGHĨA AI (HỖ TRỢ LƯU SỈ 1 LÚC NHIỀU TỪ CHỐNG GHI ĐÈ) ---
  const handleSaveDifficultWord = async (type, wordDataOrArray) => {
    if (!currentUser) return;
    playSound("click");

    const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
    
    // ĐÃ FIX: Chuyển thành mảng để xử lý chung (dù truyền vào 1 từ hay 10 từ)
    const wordsToProcess = Array.isArray(wordDataOrArray) ? wordDataOrArray : [wordDataOrArray];

    try {
        const currentState = globalStats[type] || {};
        let cleanSaved = [...(currentState.savedWords || [])];
        let cleanWrong = [...(currentState.wrongWords || [])];
        let cleanMastered = [...(currentState.masteredWords || [])];
        let cleanObjs = [...(currentState.addedWordsObj || [])];

        // Lắp từng từ vào mảng cục bộ trước
        for (let wordData of wordsToProcess) {
            const isFromAI = typeof wordData === "object";
            const wordStr = isFromAI ? wordData.word : wordData;
            const normStr = normalizeWord(wordStr);

            // Càn quét và lọc sạch biến thể của từ này ở 3 Ô
            cleanSaved = cleanSaved.filter(w => normalizeWord(w) !== normStr);
            cleanWrong = cleanWrong.filter(w => normalizeWord(w) !== normStr);
            cleanMastered = cleanMastered.filter(w => normalizeWord(w) !== normStr);

            // Đưa từ chuẩn mới nhất vào đúng Ô Vàng
            cleanSaved.push(wordStr);
            
            if (isFromAI) {
                cleanObjs = cleanObjs.filter(obj => normalizeWord(obj.word) !== normStr);
                cleanObjs.push(wordData);
            }
        }

        // Đẩy lên Firebase 1 lần duy nhất cho toàn bộ mảng
        const updatePayload = {
            [`${type}.savedWords`]: cleanSaved,
            [`${type}.wrongWords`]: cleanWrong,
            [`${type}.masteredWords`]: cleanMastered,
            [`${type}.addedWordsObj`]: cleanObjs
        };

        await updateDoc(doc(db, "users", currentUser.uid), updatePayload);
        
        setGlobalStats(prev => {
            const newState = { ...prev };
            newState[type] = { 
                ...newState[type], 
                savedWords: cleanSaved, 
                wrongWords: cleanWrong, 
                masteredWords: cleanMastered,
                addedWordsObj: cleanObjs
            };
            return newState;
        });
    } catch(e) { console.error("Lỗi lưu từ:", e); }
  };

  // --- TÍNH NĂNG MỚI: DI CHUYỂN TỪ GIỮA CÁC DANH SÁCH (ĐÃ FIX X-QUANG CHỐNG TRÙNG) ---
  const handleMoveWord = async (type, fromList, toList, wordToMove) => {
      if (!currentUser) return;
      playSound("click");
      
      const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
      const normStr = normalizeWord(wordToMove);

      try {
          const currentState = globalStats[type] || {};
          
          // Làm sạch hoàn toàn 3 mảng
          const cleanSaved = (currentState.savedWords || []).filter(w => normalizeWord(w) !== normStr);
          const cleanWrong = (currentState.wrongWords || []).filter(w => normalizeWord(w) !== normStr);
          const cleanMastered = (currentState.masteredWords || []).filter(w => normalizeWord(w) !== normStr);

          // Ép nó vào mảng đích
          if (toList === "savedWords") cleanSaved.push(wordToMove);
          if (toList === "wrongWords") cleanWrong.push(wordToMove);
          if (toList === "masteredWords") {
              cleanMastered.push(wordToMove);
              
              // MÁY QUÉT CHỐNG CÀY ĐIỂM LÁO: Chỉ cộng KPI nếu từ này CHƯA TỪNG NẰM trong Ô Xanh
              const isAlreadyMastered = (currentState.masteredWords || []).some(w => normalizeWord(w) === normStr);
              if (!isAlreadyMastered) {
                  setTodayMasteredCount(prev => {
                      const newVal = prev + 1;
                      localStorage.setItem("toeic_today_mastered", newVal.toString());
                      return newVal;
                  });
              }
          }

          // ĐÃ FIX BƯỚC 3: THÊM KHAI BÁO GÓI DỮ LIỆU Ở ĐÂY KẺO SẬP
          const updatePayload = {
              [`${type}.savedWords`]: cleanSaved,
              [`${type}.wrongWords`]: cleanWrong,
              [`${type}.masteredWords`]: cleanMastered
          };

          await updateDoc(doc(db, "users", currentUser.uid), updatePayload);

          setGlobalStats(prev => {
              const newState = { ...prev };
              newState[type] = { 
                  ...newState[type], 
                  savedWords: cleanSaved, 
                  wrongWords: cleanWrong, 
                  masteredWords: cleanMastered 
              };
              return newState;
          });
      } catch (error) {
          console.error("Lỗi di chuyển từ:", error);
      }
  };

  // --- TÍNH NĂNG MỚI: XÓA TỪ KHỎI SỔ TAY ---
  const handleRemoveWord = async (type, listType, wordToRemove) => {
    if (!currentUser) return;
    try {
      playSound("click");
      // 1. Xóa khỏi cơ sở dữ liệu đám mây (Firebase)
      await updateDoc(doc(db, "users", currentUser.uid), {
        [`${type}.${listType}`]: arrayRemove(wordToRemove)
      });
      
      // 2. Xóa khỏi màn hình hiển thị ngay lập tức
      setGlobalStats(prev => {
        const newState = { ...prev };
        const currentList = newState[type][listType] || [];
        newState[type][listType] = currentList.filter(w => w !== wordToRemove);
        return newState;
      });
    } catch(e) { console.error("Lỗi xóa từ:", e); }
  };

  
  
// TÍNH TOÁN SỐ TỪ TRONG SỔ TAY ĐỂ LÀM NGUỒN CUSTOM
  const customVocabSet = new Set([...(globalStats.vocab.savedWords || []), ...(globalStats.vocab.wrongWords || [])]);
  const customVocabCount = customVocabSet.size;

  const customCollocSet = new Set([...(globalStats.collocation.savedWords || []), ...(globalStats.collocation.wrongWords || [])]);
  const customCollocCount = customCollocSet.size;

  // --- ĐIỀU HƯỚNG MÀN HÌNH ---
  if (screen === "vocab_settings") {
    return <QuizSettings mode="vocab" onBack={() => setScreen("home")} onStart={(settings) => { setQuizSettings(settings); setScreen("vocab"); }} customWordsCount={customVocabCount} />
  }
  if (screen === "collocation_settings") {
    return <QuizSettings mode="collocation" onBack={() => setScreen("home")} onStart={(settings) => { setQuizSettings(settings); setScreen("collocation"); }} customWordsCount={customCollocCount} />
  }
  if (screen === "grammar_settings") {
    return <QuizSettings mode="grammar" onBack={() => setScreen("home")} onStart={(settings) => { setQuizSettings(settings); setScreen("grammar"); }} />
  }
  // Line ~1170
  if (screen === "notebook") return <NotebookScreen globalStats={globalStats} onBack={() => { playSound("click"); setScreen("home"); }} onSaveWord={handleSaveDifficultWord} onRemoveWord={handleRemoveWord} onMoveWord={handleMoveWord} />;
  
  // ĐÃ FIX BƯỚC 1: Truyền thêm onMoveWord={handleMoveWord} vào 2 dòng này
  if (screen === "vocab") return <WordQuiz mode="vocab" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} onMoveWord={handleMoveWord} settings={quizSettings} stats={globalStats.vocab} isMusicPlaying={isMusicPlaying} kpi={{target: dailyTarget, current: todayMasteredCount}} />;
  if (screen === "collocation") return <WordQuiz mode="collocation" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} onMoveWord={handleMoveWord} settings={quizSettings} stats={globalStats.collocation} isMusicPlaying={isMusicPlaying} kpi={{target: dailyTarget, current: todayMasteredCount}} />;
  if (screen === "grammar") return <GrammarQuiz onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} onMoveWord={handleMoveWord} settings={quizSettings} learnedQuestions={globalStats.grammar.learnedWords || []} kpi={{target: dailyTarget, current: todayMasteredCount}} />;
  // --- TÍNH TOÁN THÔNG SỐ TỪ VỰNG ---
  const vocabTotal = globalStats.vocab.total;
  const vocabCorrect = globalStats.vocab.correct;
  const uniqueVocabCount = globalStats.vocab.learnedWords?.length || 0;
  const vocabPercentage = totalDbWords > 0 ? Math.round((uniqueVocabCount / totalDbWords) * 100) : 0;

  // --- TÍNH TOÁN THÔNG SỐ COLLOCATION ---
  const collocTotal = globalStats.collocation.total;
  const collocCorrect = globalStats.collocation.correct;
  const uniqueCollocCount = globalStats.collocation.learnedWords?.length || 0;
  const collocPercentage = totalCollocDbWords > 0 ? Math.round((uniqueCollocCount / totalCollocDbWords) * 100) : 0;

  // --- TÍNH TOÁN THÔNG SỐ NGỮ PHÁP ---
  const grammarTotal = globalStats.grammar.total;
  const grammarCorrect = globalStats.grammar.correct;
  const uniqueGrammarCount = globalStats.grammar.learnedWords?.length || 0;

  return (
    <div className="container" onContextMenu={disableRightClick} style={{ textAlign: "center", paddingTop: "20px", maxWidth: "450px" }}>
      
      {showTutorial && (
        <WelcomeTutorial 
          onDismiss={() => {
            localStorage.setItem("toeic_tutorial_seen", "true");
            setShowTutorial(false);
            forcePlayMusic(); 
          }} 
        />
      )}

      {/* THANH THÔNG TIN BÊN TRÊN */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", padding: "8px", backgroundColor: "#f0f8ff", borderRadius: "8px", border: "1px solid #cce7ff", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button onClick={toggleMusic} title={isMusicPlaying ? "Tắt nhạc" : "Bật nhạc"} style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: isMusicPlaying ? "#FF9800" : "#E0E0E0", color: isMusicPlaying ? "white" : "#666", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", transition: "0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", padding: 0 }}>
            {isMusicPlaying ? "🔊" : "🔇"}
          </button>
          <button onClick={playNextTrack} title="Chuyển sang bài khác" style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#4facfe", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", transition: "0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", padding: 0 }}>
            ⏭️
          </button>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} title="Điều chỉnh âm lượng" style={{ width: "40px", cursor: "pointer", marginLeft: "2px" }} />
        </div>

        {/* MENU TÀI KHOẢN "VIP PRO" (DROPDOWN) */}
        <div style={{ position: "relative" }}>
          <div 
            onClick={() => { playSound("click"); setShowProfileMenu(!showProfileMenu); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "4px 12px 4px 4px", backgroundColor: showProfileMenu ? "#e3f2fd" : "#fff", borderRadius: "30px", border: "1px solid #e0e0e0", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", transition: "0.2s" }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f0f8ff"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = showProfileMenu ? "#e3f2fd" : "#fff"}
          >
            {/* Avatar VIP: Ưu tiên hiện ảnh thật, nếu không có mới hiện chữ cái */}
            {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Avatar" style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", boxShadow: "0 2px 5px rgba(0,0,0,0.2)", border: "1px solid #e0e0e0" }} />
            ) : (
                <div style={{ width: "26px", height: "26px", borderRadius: "50%", backgroundColor: "#4facfe", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 5px rgba(0,0,0,0.2)" }}>
                   {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : currentUser.email.charAt(0).toUpperCase()}
                </div>
            )}
            {/* Tên hiển thị */}
            <span style={{ fontSize: "13px", color: "#333", fontWeight: "bold", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser.displayName || currentUser.email.split('@')[0]}
            </span>
            <span style={{ fontSize: "10px", color: "#666", transform: showProfileMenu ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
          </div>

          {/* BẢNG MENU XỔ XUỐNG */}
          {showProfileMenu && (
            <>
              {/* Vùng vô hình: Bấm ra ngoài là tự đóng menu */}
              <div onClick={() => setShowProfileMenu(false)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 998 }}></div>
              
              {/* Nội dung Menu */}
              <div style={{ position: "absolute", top: "45px", right: 0, backgroundColor: "white", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", width: "200px", overflow: "hidden", zIndex: 999, animation: "popIn 0.2s ease-out", border: "1px solid #eee" }}>
                  <div style={{ padding: "15px", borderBottom: "1px solid #eee", backgroundColor: "#f8f9fa", textAlign: "left" }}>
                     <div style={{ fontSize: "12px", color: "#666", marginBottom: "3px" }}>Đang đăng nhập:</div>
                     <div style={{ fontSize: "13px", fontWeight: "bold", color: "#2196F3", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.email}</div>
                  </div>
                  
                  {/* NÚT CHỈNH SỬA HỒ SƠ (Đã gộp Đổi tên và Đổi ảnh) */}
                  <button onClick={() => { playSound("click"); setShowProfileMenu(false); setProfileNameInput(currentUser.displayName || ""); setProfileAvatarFile(null); setAvatarPreview(null); setShowProfileModal(true); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: "#333", display: "flex", alignItems: "center", gap: "10px", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f5f5f5"} onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                     ⚙️ Chỉnh sửa hồ sơ
                  </button>
                  
                  <div style={{ width: "100%", height: "1px", backgroundColor: "#eee" }}></div>
                  
                  <button onClick={() => { setShowProfileMenu(false); handleLogout(); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: "#F44336", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#ffebee"} onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                     🚪 Đăng xuất
                  </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* HEADER MỚI - ĐỒNG HỒ & LỊCH VIP PRO */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px", marginTop: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
              <span style={{ fontSize: "32px", color: "#2c3e50", fontWeight: "900", lineHeight: "1.1", letterSpacing: "1px" }}>
                  {currentFormattedTime}
              </span>
              <span style={{ fontSize: "13px", color: "#7f8c8d", marginTop: "5px", fontWeight: "bold" }}>
                  📅 {currentFormattedDate}
              </span>
          </div>
          {/* <span style={{ fontSize: "12px", color: "#e65100", fontWeight: "bold", padding: "6px 12px", backgroundColor: "#ffe0b2", borderRadius: "20px", border: "2px solid #ffb74d", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
              VIP PRO 👑
          </span> */}
      </div>

      {/* DASHBOARD THỐNG KÊ */}
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "35px", flexWrap: "wrap" }}>
        
        {/* CARD TỪ VỰNG */}
        <div style={{ flex: "1 1 120px", backgroundColor: "#f9f9f9", padding: "12px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #eee", textAlign: "left" }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#4CAF50", fontSize: "15px" }}>📚 Từ vựng</h3>
          <p style={{ margin: "4px 0", fontSize: "13px", color: "#555" }}>Trả lời: <strong>{vocabTotal}</strong></p>
          <p style={{ margin: "4px 0 8px 0", fontSize: "13px", color: "#555" }}>Đúng: <strong style={{color: "#4CAF50"}}>{vocabCorrect}</strong></p>
          <div style={{ margin: "0", padding: "8px", backgroundColor: "#e8f5e9", borderRadius: "8px", border: "1px dashed #4CAF50" }}>
             <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#2e7d32", fontWeight: "bold" }}>Thuộc: {uniqueVocabCount} / {totalDbWords || "..."} từ</p>
             <div style={{ width: "100%", height: "5px", backgroundColor: "#c8e6c9", borderRadius: "3px" }}><div style={{ width: `${vocabPercentage}%`, height: "100%", backgroundColor: "#4CAF50", borderRadius: "3px" }}></div></div>
             <p style={{ margin: "4px 0 0 0", fontSize: "11px", textAlign: "right", color: "#2e7d32" }}>{vocabPercentage}% kho</p>
          </div>
        </div>

        {/* CARD COLLOCATION */}
        <div style={{ flex: "1 1 120px", backgroundColor: "#f9f9f9", padding: "12px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #eee", textAlign: "left" }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#9C27B0", fontSize: "15px" }}>🔗Collocation</h3>
          <p style={{ margin: "4px 0", fontSize: "13px", color: "#555" }}>Trả lời: <strong>{collocTotal}</strong></p>
          <p style={{ margin: "4px 0 8px 0", fontSize: "13px", color: "#555" }}>Đúng: <strong style={{color: "#9C27B0"}}>{collocCorrect}</strong></p>
          <div style={{ margin: "0", padding: "8px", backgroundColor: "#f3e5f5", borderRadius: "8px", border: "1px dashed #9C27B0" }}>
             <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#6a1b9a", fontWeight: "bold" }}>Thuộc: {uniqueCollocCount} / {totalCollocDbWords || "..."} cụm</p>
             <div style={{ width: "100%", height: "5px", backgroundColor: "#e1bee7", borderRadius: "3px" }}><div style={{ width: `${collocPercentage}%`, height: "100%", backgroundColor: "#9C27B0", borderRadius: "3px" }}></div></div>
             <p style={{ margin: "4px 0 0 0", fontSize: "11px", textAlign: "right", color: "#6a1b9a" }}>{collocPercentage}% kho</p>
          </div>
        </div>

        {/* CARD NGỮ PHÁP (CẬP NHẬT GIAO DIỆN AI VÔ TẬN) */}
        <div style={{ flex: "1 1 120px", backgroundColor: "#f9f9f9", padding: "12px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #eee", textAlign: "left", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-15px", right: "-15px", fontSize: "40px", opacity: "0.1" }}>🤖</div>
          <h3 style={{ margin: "0 0 10px 0", color: "#2196F3", fontSize: "15px" }}>📝 Ngữ pháp</h3>
          <p style={{ margin: "4px 0", fontSize: "13px", color: "#555" }}>Trả lời: <strong>{grammarTotal}</strong></p>
          <p style={{ margin: "4px 0 8px 0", fontSize: "13px", color: "#555" }}>Đúng: <strong style={{color: "#2196F3"}}>{grammarCorrect}</strong></p>
          <div style={{ margin: "0", padding: "8px", backgroundColor: "#e3f2fd", borderRadius: "8px", border: "1px dashed #2196F3" }}>
             <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#1565c0", fontWeight: "bold" }}>Đã cày: {uniqueGrammarCount} câu</p>
             <div style={{ width: "100%", height: "5px", backgroundColor: "#bbdefb", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #2196F3, #64b5f6, #2196F3)", backgroundSize: "200% 100%", animation: "gradientMove 2s infinite linear" }}></div>
             </div>
             <p style={{ margin: "4px 0 0 0", fontSize: "11px", textAlign: "right", color: "#1565c0", fontWeight: "bold" }}>Kho đề vô tận</p>
          </div>
        </div>

      </div>

      {/* --- THANH TIẾN ĐỘ KỶ LUẬT THÉP (ĐÃ FIX LỖI SẬP WEB) --- */}
      <div 
         onClick={() => { playSound("click"); setShowPlanModal(true); }}
         style={{ backgroundColor: "#fff", padding: "15px 20px", borderRadius: "16px", border: "2px dashed #FF9800", marginBottom: "25px", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.05)", transition: "0.2s" }}
         onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.02)"}
         onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
      >
         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "16px", fontWeight: "bold", color: "#e65100" }}>🔥 Kỷ Luật Thép (Mỗi ngày)</span>
            <span style={{ 
                fontSize: "14px", 
                backgroundColor: countdownText ? "#ffcdd2" : "#ffe0b2", // Đổi nền đỏ nhạt khi đếm ngược
                color: countdownText ? "#d32f2f" : "#e65100", // Chữ đỏ đậm khi đếm ngược
                padding: "4px 8px", 
                borderRadius: "10px", 
                fontWeight: "bold",
                animation: countdownText ? "heartbeat 1s infinite" : "none", // Thêm chớp đỏ cảnh báo
                boxShadow: countdownText ? "0 0 8px rgba(244, 67, 54, 0.4)" : "none"
            }}>
                {dailyTarget > 0 
                    ? (countdownText ? countdownText : "⏰ Báo thức: " + studyTime) 
                    : "Chưa cài đặt"}
            </span>
         </div>
         
         <div style={{ width: "100%", height: "12px", backgroundColor: "#f5f5f5", borderRadius: "6px", overflow: "hidden", border: "1px solid #eee" }}>
            <div style={{ width: (dailyTarget > 0 ? Math.min((todayMasteredCount / dailyTarget) * 100, 100) : 0) + "%", height: "100%", backgroundColor: todayMasteredCount >= dailyTarget && dailyTarget > 0 ? "#4CAF50" : "#FF9800", transition: "width 0.5s ease-out" }}></div>
         </div>
         
         <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "14px", color: "#666", fontWeight: "bold" }}>
             <span>Hôm nay: {todayMasteredCount} từ</span>
             <span>Mục tiêu: {dailyTarget > 0 ? dailyTarget + " từ" : "Nhấn để cài đặt"}</span>
         </div>
      </div>

      {/* MENU CHÍNH */}
      {/* MENU CHÍNH DẠNG 4 Ô VƯƠNG CÂN ĐỐI */}
      <ModeSelectionScreen 
          onModeSelect={(targetScreen) => {
              playSound("click");
              setScreen(targetScreen); 
          }}
          onNotebookClick={() => {
              playSound("click");
              setScreen("notebook");
          }}
      />

      {/* Thêm CSS cho thanh cuộn vô tận của AI */}
      <style>{`
        @keyframes gradientMove {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      @keyframes heartbeat {
          0% { transform: scale(1); }
          15% { transform: scale(1.15); color: #b71c1c; }
          30% { transform: scale(1); }
          45% { transform: scale(1.15); color: #b71c1c; }
          60% { transform: scale(1); }
        }
      `}</style>

        {/* --- MODAL ĐỔI TÊN HIỂN THỊ --- */}
      {showNameModal && (
        <div onClick={() => !isUpdatingName && setShowNameModal(false)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "350px", borderRadius: "16px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "default" }}>
                <h2 style={{ fontSize: "22px", color: "#2c3e50", margin: "0 0 15px 0" }}>✏️ Đổi Tên Của Bạn</h2>
                <input 
                    type="text" 
                    value={newNameInput} 
                    onChange={(e) => setNewNameInput(e.target.value)}
                    // placeholder="Ví dụ: Đạt VIP Pro..."
                    maxLength={20}
                    autoFocus
                    style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px", marginBottom: "20px", boxSizing: "border-box", textAlign: "center", fontWeight: "bold", outline: "none" }}
                />
                <div style={{ display: "flex", gap: "10px" }}>
                    <button disabled={isUpdatingName} onClick={handleUpdateName} style={{ flex: 1, padding: "12px", backgroundColor: isUpdatingName ? "#9e9e9e" : "#4CAF50", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: isUpdatingName ? "not-allowed" : "pointer" }}>
                        {isUpdatingName ? "Đang lưu..." : "Lưu thay đổi"}
                    </button>
                    <button disabled={isUpdatingName} onClick={() => setShowNameModal(false)} style={{ flex: 1, padding: "12px", backgroundColor: "#e0e0e0", color: "#333", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
                        Hủy
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- MODAL ĐỔI PROFILE VIP PRO MAX (TÊN + ẢNH) --- */}
      {showProfileModal && (
        <div onClick={() => !isUpdatingProfile && setShowProfileModal(false)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "380px", borderRadius: "16px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "default", border: "1px solid #eee" }}>
                <h2 style={{ fontSize: "22px", color: "#2c3e50", margin: "0 0 20px 0" }}>⚙️ Cài Đặt Hồ Sơ</h2>
                
                {/* 1. KHU VỰC ẢNH ĐẠI DIỆN TRÒN */}
                <div style={{ position: "relative", width: "100px", height: "100px", margin: "0 auto 20px auto", cursor: "pointer" }} onClick={() => document.getElementById('avatarInput').click()} title="Bấm để chọn ảnh mới">
                    {/* Hiển thị ảnh đang xem trước (preview) hoặc ảnh cũ ( photoURL ) hoặc lấy chữ cái đầu */}
                    {avatarPreview || currentUser.photoURL ? (
                       <img src={avatarPreview || currentUser.photoURL} alt="Avatar Preview" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "4px solid #fff", boxShadow: "0 3px 10px rgba(0,0,0,0.15)", transition: "0.2s" }} />
                    ) : (
                       <div style={{ width: "100%", height: "100%", borderRadius: "50%", backgroundColor: "#4facfe", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px", fontWeight: "bold", border: "4px solid #fff", boxShadow: "0 3px 10px rgba(0,0,0,0.15)" }}>
                          {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : currentUser.email.charAt(0).toUpperCase()}
                       </div>
                    )}
                    {/* Biểu tượng cái bút đè lên trên ảnh đại diện */}
                    <div style={{ position: "absolute", bottom: "0", right: "0", backgroundColor: "white", padding: "6px", borderRadius: "50%", boxShadow: "0 2px 5px rgba(0,0,0,0.2)" }}>
                       ✏️
                    </div>
                </div>
                
                {/* THANH TIẾN TRÌNH UPLOAD 0-100% (Ẩn khi không upload) */}
                {isUpdatingProfile && uploadProgress > 0 && uploadProgress < 100 && (
                   <div style={{ width: "100%", height: "5px", backgroundColor: "#e0e0e0", borderRadius: "5px", margin: "0 auto 15px auto", overflow: "hidden" }}>
                       <div style={{ width: `${uploadProgress}%`, height: "100%", backgroundColor: "#4CAF50", transition: "width 0.1s" }}></div>
                   </div>
                )}

                {/* Ô INPUT CHỌN FILE (ẨN ĐI) */}
                <input 
                    id="avatarInput"
                    type="file" 
                    accept="image/*" // Chỉ nhận ảnh
                    onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                            if (file.size > 2 * 1024 * 1024) { return alert("File chà bá chè bác! Bác chọn ảnh nào dưới 2MB nhé!"); } // Giới hạn 2MB
                            setProfileAvatarFile(file);
                            setAvatarPreview(URL.createObjectURL(file)); // Tạo link xem trước ngay lập tức
                        }
                    }}
                    style={{ display: "none" }}
                />

                {/* 2. KHU VỰC ĐỔI TÊN */}
                <div style={{ textAlign: "left", marginBottom: "25px" }}>
                   <label style={{ fontSize: "14px", color: "#666", fontWeight: "bold", marginLeft: "2px" }}>Tên hiển thị (Tối đa 20 chữ)</label>
                   <input 
                       type="text" 
                       value={profileNameInput} 
                       onChange={(e) => setProfileNameInput(e.target.value)}
                      //  placeholder="Ví dụ: Đạt VIP Pro..."
                       maxLength={20}
                       style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px", marginTop: "5px", boxSizing: "border-box", fontWeight: "bold", outline: "none", backgroundColor: isUpdatingProfile ? "#f5f5f5" : "#fff" }}
                       disabled={isUpdatingProfile}
                   />
                </div>

                {/* 3. NÚT CHỨC NĂNG */}
                <div style={{ display: "flex", gap: "10px" }}>
                    <button disabled={isUpdatingProfile} onClick={handleProfileUpdate} style={{ flex: 1, padding: "12px", backgroundColor: isUpdatingProfile ? "#9e9e9e" : "#4CAF50", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: isUpdatingProfile ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                        {isUpdatingProfile ? `Đang lưu (${uploadProgress}%)...` : "Lưu thay đổi"}
                    </button>
                    <button disabled={isUpdatingProfile} onClick={() => setShowProfileModal(false)} style={{ flex: 1, padding: "12px", backgroundColor: "#e0e0e0", color: "#333", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
                        Hủy
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- MODAL CÀI ĐẶT KẾ HOẠCH HỌC TẬP (KỶ LUẬT THÉP) --- */}
      {showPlanModal && (
        <div onClick={() => setShowPlanModal(false)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1200, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "350px", borderRadius: "20px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "default", border: "2px solid #FF9800" }}>
                <h2 style={{ fontSize: "24px", color: "#e65100", margin: "0 0 5px 0" }}>🔥 Kỷ Luật Thép</h2>
                <p style={{ color: "#666", fontSize: "13px", marginBottom: "20px" }}>Đã bật chế độ này, bạn sẽ <strong>BỊ KHÓA NÚT THOÁT</strong> cho đến khi học đủ số câu quy định.</p>
                
                <div style={{ textAlign: "left", marginBottom: "15px" }}>
                   <label style={{ fontSize: "14px", color: "#333", fontWeight: "bold" }}>🎯 Mục tiêu số câu đúng/ngày:</label>
                   <input type="number" min="0" max="500" value={dailyTarget} onChange={(e) => setDailyTarget(parseInt(e.target.value) || 0)} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "18px", marginTop: "5px", boxSizing: "border-box", fontWeight: "bold", textAlign: "center", color: "#4CAF50" }} />
                   <p style={{ fontSize: "11px", color: "#999", marginTop: "5px" }}>*Nhập số 0 để Tắt chế độ giam lỏng.</p>
                </div>

                <div style={{ textAlign: "left", marginBottom: "25px" }}>
                   <label style={{ fontSize: "14px", color: "#333", fontWeight: "bold" }}>⏰ Giờ báo thức (Gửi thông báo):</label>
                   <input type="time" value={studyTime} onChange={(e) => setStudyTime(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "18px", marginTop: "5px", boxSizing: "border-box", fontWeight: "bold", textAlign: "center", fontFamily: "inherit" }} />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={saveStudyPlan} style={{ flex: 1, padding: "12px", backgroundColor: "#FF9800", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>Lưu Kế Hoạch</button>
                    <button onClick={() => setShowPlanModal(false)} style={{ flex: 1, padding: "12px", backgroundColor: "#e0e0e0", color: "#333", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Đóng</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}

export default App;