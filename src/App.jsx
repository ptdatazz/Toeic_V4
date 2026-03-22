import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import "./App.css";

// Import Firebase
import { auth, db } from "./firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

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
function WordQuiz({ mode, onBack, updateGlobal, onSaveWord, settings, stats, isMusicPlaying }) {
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
          const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
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
        
        // ĐÃ FIX: Level 0 (Flashcard) CHỈ lấy từ ô vàng (Ghim thủ công). Các level cao hơn mới trộn thêm ô đỏ (Làm sai nhiều)
        let wordsToLearn = [];
        if (DIFFICULTY_LEVEL === 0) {
            wordsToLearn = [...savedWords];
        } else {
            wordsToLearn = [...savedWords, ...wrongWords];
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
              const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
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

          for (let targetKeyword of keywordsToTry) {
              for (let attempt = 0; attempt < 20; attempt++) {
                  bossWords = [];
                  valid = true;
                  for (let i = 0; i < targetKeyword.length; i++) {
                      const char = targetKeyword[i].toLowerCase();
                      let candidates = availableWords.filter(item => item.word && item.word.toLowerCase().includes(char));
                      if (candidates.length === 0) { valid = false; break; }
                      
                      let picked = shuffleArray(candidates).find(c => !bossWords.some(bw => bw.word === c.word));
                      if (!picked) { valid = false; break; }
                      
                      let charIndex = picked.word.toLowerCase().indexOf(char);
                      bossWords.push({ ...picked, alignIdx: charIndex });
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
            let penaltyItem = {...prev[current]}; 
            if (penaltyItem.options) {
                penaltyItem.options = shuffleArray([...penaltyItem.options]); 
            }
            
            // 3. CHÈN CÂU PHẠT VÀO (Lúc này Boss đã đi vắng nên chèn thoải mái không sợ bị đẩy ra sau)
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
        if (e.key === "Enter") {
            const currentQ = questionsData[current];
            if (!currentQ) return;

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

            // 3. TÍNH NĂNG MỚI: Nhấn Enter để chuyển sang chế độ gõ từ (Flashcard)
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

  if (loadingData || questionsData.length === 0) {
    return <div className="container" style={{ textAlign: "center", paddingTop: "50px" }}><h2>Đang chuẩn bị thẻ bài... 🎴</h2></div>;
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
                if(streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) { handleBackToHome(); }
              }} 
              style={{ padding: "6px 10px", fontSize: "13px", cursor: (streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "pointer" : "not-allowed", backgroundColor: (streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "#e8f5e9" : "#f0f0f0", color: (streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "#2e7d32" : "#999", border: "1px solid #ccc", borderRadius: "6px", fontWeight: "bold", whiteSpace: "nowrap", margin: 0, flexShrink: 0 }}
            >
              ⬅ {(streak >= REQUIRED_STREAK || DIFFICULTY_LEVEL === 0) ? "🔓" : `🔒 ${streak}/${REQUIRED_STREAK}`}
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
                 const isCorrectWord = userInput.trim() === item.word.toLowerCase().trim();

                 return (
                     <div key={`grid-${idx}`} style={{ 
                         display: 'flex', 
                         flexDirection: currentQ.isVerticalKeyword ? "row" : "column",
                         marginLeft: currentQ.isVerticalKeyword ? `${marginBoxes * 32}px` : "0",
                         marginTop: !currentQ.isVerticalKeyword ? `${marginBoxes * 32}px` : "0",
                         alignSelf: "flex-start" 
                     }}>
                         {item.word.split('').map((char, charIdx) => {
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

          {/* KHUNG NHẬP LIỆU CÂU HỎI */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
             {currentQ.words.map((item, idx) => {
                 const isCorrect = (crosswordInputs[idx] || "").toLowerCase().trim() === item.word.toLowerCase().trim();
                 return (
                     <div key={`input-${idx}`} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", backgroundColor: isCorrect ? "#e8f5e9" : "#fff", borderRadius: "8px", border: "1px solid #ddd" }}>
                         <div style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: "#2196F3", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>{idx + 1}</div>
                         <div style={{ flex: 1 }}>
                             <div style={{ fontSize: "13px", fontWeight: "bold", color: "#555", marginBottom: "4px" }}>{item.meaning}</div>
                             <input
                                 ref={(el) => bossInputRefs.current[idx] = el} 
                                 type="email" // Đổi thành email để chặn Unikey
                                 value={crosswordInputs[idx] || ""}
                                 onChange={(e) => {
                                     const val = e.target.value.replace(/[^a-zA-Z\s-]/g, '');
                                     setCrosswordInputs({...crosswordInputs, [idx]: val});
                                     
                                     // CƠ CHẾ AUTO-FOCUS: Gõ đúng tự nhảy sang ô chưa hoàn thành
                                     if (val.toLowerCase().trim() === item.word.toLowerCase().trim()) {
                                         let nextIdx = -1;
                                         // Tìm ô trống ở phía dưới
                                         for (let i = idx + 1; i < currentQ.words.length; i++) {
                                             const targetWord = currentQ.words[i].word.toLowerCase().trim();
                                             const curVal = (crosswordInputs[i] || "").toLowerCase().trim();
                                             if (curVal !== targetWord) { nextIdx = i; break; }
                                         }
                                         // Nếu bên dưới hết ô trống, vòng lên tìm lại phía trên
                                         if (nextIdx === -1) {
                                             for (let i = 0; i < idx; i++) {
                                                 const targetWord = currentQ.words[i].word.toLowerCase().trim();
                                                 const curVal = (crosswordInputs[i] || "").toLowerCase().trim();
                                                 if (curVal !== targetWord) { nextIdx = i; break; }
                                             }
                                         }
                                         // Di chuyển con trỏ chuột sang ô tiếp theo
                                         if (nextIdx !== -1 && bossInputRefs.current[nextIdx]) {
                                             setTimeout(() => bossInputRefs.current[nextIdx].focus(), 50);
                                         }
                                     }
                                 }}
                                 disabled={isCorrect}
                                 maxLength={item.word.length}
                                 placeholder={`${item.word.length} chữ cái...`}
                                 style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", textTransform: "uppercase", outline: "none", backgroundColor: isCorrect ? "#c8e6c9" : "#fff", fontWeight: "bold" }}
                             />
                         </div>
                         {isCorrect && <span style={{ fontSize: "20px" }}>✅</span>}
                     </div>
                 )
             })}
          </div>

          {/* HIỆU ỨNG TỪ KHÓA KHI HOÀN THÀNH BẢN ĐỒ */}
          {currentQ.words.every((item, idx) => (crosswordInputs[idx] || "").toLowerCase().trim() === item.word.toLowerCase().trim()) ? (
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
                                boxShadow: "0 8px 15px rgba(0,0,0,0.2)", border: "4px solid #bbdefb"
                            }}>
                                <span style={{ fontSize: "32px", fontWeight: "bold", textAlign: "center", padding: "0 10px" }}>{currentQ.word}</span>
                                <span style={{ fontSize: "18px", fontStyle: "italic", opacity: 0.8, marginTop: "5px" }}>{currentQ.phonetic}</span>
                                {/* <span style={{ position: "absolute", bottom: "15px", fontSize: "13px", opacity: 0.7, backgroundColor: "rgba(0,0,0,0.2)", padding: "4px 12px", borderRadius: "12px" }}>👆 Chạm để lật (Tiếng Việt)</span> */}
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
  
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

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

  // 2. HÀM QUÉT CHỮ BÔI ĐEN BẰNG CHUỘT/CẢM ỨNG (ĐÃ NÂNG CẤP LẤY TỌA ĐỘ)
  const handleSelection = () => {
      setTimeout(() => { 
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) {
              const text = selection.toString().trim();
              // ĐÃ FIX: Tăng lên tối đa 5 từ, 50 ký tự để bôi đen được cấu trúc ngữ pháp
              if (text && text.split(/\s+/).length <= 40 && text.length < 300) {
                  const range = selection.getRangeAt(0);
                  const rect = range.getBoundingClientRect();
                  
                  setTooltipPos({
                      top: rect.top - 10, 
                      left: rect.left + rect.width / 2 
                  });
                  setSelectedWord(text);
                  return;
              }
          }
          setSelectedWord("");
          setTooltipPos(null);
      }, 50);
  };

  // 3. HÀM XỬ LÝ TRA TỪ ĐIỂN (ƯU TIÊN GOOGLE SHEET -> AI)
  const handleLookup = async (wordToLookup) => {
      const cleanWord = wordToLookup.trim().toLowerCase().replace(/[^a-z-]/g, '');
      if(!cleanWord) return;
      
      playSound("click");
      setDictModal({ word: cleanWord, status: 'loading', data: null });
      setSelectedWord(""); // Ẩn nút nổi đi
      setIsSaved(false); // Reset trạng thái nút Lưu
      
      // BƯỚC A: Quét trong kho Google Sheet trước
      const foundInSheet = vocabDict.find(item => item.word && item.word.toLowerCase().trim() === cleanWord);
      
      if (foundInSheet) {
          setDictModal({ word: cleanWord, status: 'found_sheet', data: foundInSheet });
          return;
      }
      
      // BƯỚC B: Nếu Sheet không có, Nhờ AI dịch nhanh
      try {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
          const listData = await listRes.json();
          const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
          const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
          const selectedModel = flashModel ? flashModel.name : textModels[0].name;

          // ĐÃ FIX: Yêu cầu AI chèn luôn loại từ viết tắt vào từ vựng
          const prompt = `Phân tích từ/cụm từ tiếng Anh: "${cleanWord}". (Lưu ý: Nếu từ bị dính chữ do lỗi bôi đen, ví dụ 'takeeffect', hãy tự động sửa thành 'take effect' để phân tích).
          Trả về CHỈ 1 OBJECT JSON ĐƠN GIẢN (Tuyệt đối không dùng markdown \`\`\`json):
          {
            "word": "Từ chuẩn kèm (loại từ viết tắt). Ví dụ: 'inquiry (n)', 'investigate (v)', 'effective (adj)'",
            "phonetic": "Phiên âm quốc tế",
            "meaning": "Format bắt buộc: (Đồng nghĩa tiếng Anh) - Nghĩa tiếng Việt. Ví dụ: '(become effective) - có hiệu lực'. Tuyệt đối ngắn gọn.",
            "usage": "1 câu ví dụ tiếng Anh thực tế"
          }`;

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          const data = await res.json();
          let rawText = data.candidates[0].content.parts[0].text;
          rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const aiWordObj = JSON.parse(rawText);
          
          setDictModal({ word: cleanWord, status: 'found_ai', data: aiWordObj });
      } catch (error) {
          setDictModal({ word: cleanWord, status: 'error', data: null });
      }
  };


  // HÀM GỌI AI ĐỂ SOẠN ĐỀ THEO TỪNG PART (ĐÃ NÂNG CẤP PROMPT CHUẨN ETS)
  useEffect(() => {
    const fetchGrammarFromAI = async () => {
      if (!GEMINI_API_KEY || String(GEMINI_API_KEY).includes("DÁN_MÃ") || String(GEMINI_API_KEY).includes("ĐIỀN_API_KEY")) {
          alert("LỖI: Không tìm thấy API Key!\n\nNếu đang chạy trên máy tính: Hãy kiểm tra file .env và nhớ tắt terminal đi chạy lại lệnh 'npm run dev'.\nNếu trên Vercel: Hãy kiểm tra mục Environment Variables.");
          onBack();
          return;
      }

      setLoadingData(true);
      setLoadingMsg(`🤖 Thầy AI đang biên soạn đề TOEIC ${TOEIC_PART.toUpperCase()} chuẩn ETS...`);
      
      let partInstruction = "";
      if (TOEIC_PART === "part5") {
          partInstruction = `Đây là đề TOEIC Part 5 (Ngữ pháp/Từ vựng câu đơn).
          - Trường "passage": bắt buộc để chuỗi rỗng "".
          - Trường "question": Tạo 1 câu tiếng Anh FORMAT CHUẨN ETS (văn phong công sở, thương mại, tuyển dụng, báo cáo...) có đúng 1 chỗ trống (___) cần điền.`;
      } else if (TOEIC_PART === "part6") {
          partInstruction = `Đây là đề TOEIC Part 6 (Điền từ vào đoạn văn).
          - Trường "passage": Tạo 1 đoạn văn ngắn (email, thông báo, quảng cáo...) CHUẨN VĂN PHONG ETS TOEIC. ĐỤC ĐÚNG 1 LỖ (___) TRONG ĐOẠN VĂN NÀY. TUYỆT ĐỐI KHÔNG để lộ từ đáp án bên trong đoạn văn.
          - Trường "question": Điền mặc định một câu lệnh: "Choose the best word or phrase to fill in the blank."`;
      } else if (TOEIC_PART === "part7") {
          partInstruction = `Đây là đề TOEIC Part 7 (Đọc hiểu đoạn văn).
          - Trường "passage": Tạo 1 đoạn văn tiếng Anh hoàn chỉnh (thư từ, bài báo, lịch trình...) ĐÚNG ĐỘ KHÓ VÀ CHỦ ĐỀ CỦA ETS TOEIC (KHÔNG đục lỗ).
          - Trường "question": Tạo 1 câu hỏi Đọc hiểu (Ví dụ: What is the main purpose of the email? / What is suggested about Mr. Smith?). Cấm dùng dạng đục lỗ ở đây.`;
      } else if (TOEIC_PART === "scan_skim") {
          partInstruction = `Đây là bài tập rèn luyện kỹ năng Skimming (Đọc lấy ý chính) và Scanning (Quét tìm thông tin chi tiết) của bài thi TOEIC.
          - Trường "passage": Tạo 1 văn bản HOÀN CHỈNH, RẤT DÀI VÀ NHIỀU THÔNG TIN ĐÁNH LỪA (như một hóa đơn chi tiết, lịch trình nhiều ngày, bài báo cáo số liệu, hoặc chuỗi email nội bộ dài).
          - Trường "question": Tạo 1 câu hỏi ép người đọc phải phản xạ nhanh. Phải hỏi về một CON SỐ, NGÀY THÁNG, TÊN RIÊNG cụ thể (Scanning), HOẶC hỏi ý chính bao quát toàn bài (Skimming). Đảm bảo đáp án có thể tìm thấy trực tiếp bằng cách quét mắt mà không cần dịch toàn bộ bài.`;
      }


      const prompt = `Bạn là một chuyên gia luyện thi TOEIC chuẩn ETS. Hãy tạo ${QUIZ_LIMIT} câu hỏi trắc nghiệm tiếng Anh. Mức độ khó: ${DIFFICULTY_LEVEL <= 2 ? "Dễ và Trung bình (Mục tiêu 450-600)" : "Khó, bẫy từ vựng/ngữ pháp (Mục tiêu 700-900)"}.
      ${partInstruction}
      YÊU CẦU BẮT BUỘC: 
      - Chỉ trả về duy nhất 1 mảng JSON, tuyệt đối không có markdown (\`\`\`json) hay bất kỳ chữ nào khác thừa thãi.
      - Cấu trúc JSON chuẩn xác của mỗi phần tử như sau:
        [
          {
            "passage": "Nội dung đoạn văn (Chỉ có ở Part 6 và 7).",
            "question": "Nội dung câu hỏi.",
            "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
            "answer": "Đáp án đúng (phải khớp chính tả 100% với 1 trong 4 option)",
            "explanation": "Giải thích chi tiết bằng tiếng Việt. Dịch nghĩa và giải thích vì sao chọn đáp án này."
          }
        ]`;

      try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const listData = await listRes.json();

        if (listData.error) {
            alert(`Lỗi xác thực Google: ${listData.error.message}`);
            onBack(); return;
        }

        const availableModels = listData.models || [];
        const textModels = availableModels.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
        const flashModel = textModels.find(m => m.name.includes("flash"));
        const selectedModel = flashModel ? flashModel.name : textModels[0].name;
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`;
        
        let requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        if (selectedModel.includes("1.5")) {
            requestBody.generationConfig = { response_mime_type: "application/json" };
        }

        const response = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
        const data = await response.json();

        if(data.error) {
            alert(`Lỗi sinh đề thi: ${data.error.message}`);
            onBack(); return;
        }

        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedQuestions = JSON.parse(rawText);
        
        const finalPool = parsedQuestions.map(q => ({ ...q, options: shuffleArray(q.options) }));
        setQuestionsData(finalPool);
      } catch (error) {
        console.error("Lỗi tạo đề:", error);
        alert("Thầy AI đang bận rộn! Vui lòng ấn bắt đầu lại nhé.");
        onBack();
      } finally {
        setLoadingData(false);
      }
    };

    fetchGrammarFromAI();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (loadingData) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "50px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h1 style={{ fontSize: "50px", margin: "0" }}>🤖</h1>
        <h2 style={{ color: "#2196F3", marginTop: "15px", lineHeight: "1.4" }}>{loadingMsg}</h2>
        <p style={{ color: "#888", fontStyle: "italic", fontSize: "14px" }}>AI đang phân tích và đẻ ra bộ câu hỏi mới toanh...</p>
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
    <div className="container" onMouseUp={handleSelection} onTouchEnd={handleSelection} style={{ maxWidth: TOEIC_PART !== "part5" ? "600px" : "450px", position: "relative" }}> 
      
      {/* TOOLTIP HIỂN THỊ NGAY TRÊN CHỮ BÔI ĐEN GIỐNG ĐIỆN THOẠI */}
      {selectedWord && tooltipPos && !dictModal && (
          <div style={{
              position: "fixed",
              top: `${tooltipPos.top}px`,
              left: `${tooltipPos.left}px`,
              transform: "translate(-50%, -100%)", 
              backgroundColor: "#2c3e50",
              color: "white",
              padding: "8px 12px",
              borderRadius: "8px",
              display: "flex",
              gap: "12px",
              zIndex: 1000,
              boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
              animation: "popIn 0.2s ease-out",
              whiteSpace: "nowrap"
          }}>
              <span onClick={() => handleLookup(selectedWord)} style={{ cursor: "pointer", fontWeight: "bold", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  🔍 Dịch
              </span>
              <div style={{ width: "1px", backgroundColor: "#546e7a" }}></div>
              
              {/* NÚT LƯU VÀO TỪ VỰNG */}
              <span onClick={() => { 
                  playSound("click"); 
                  onSaveWord("vocab", selectedWord.toLowerCase()); 
                  setSelectedWord(""); 
                  setTooltipPos(null);
                  window.getSelection().removeAllRanges(); 
              }} style={{ cursor: "pointer", fontWeight: "bold", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", color: "#4CAF50" }}>
                  🔖 + Từ
              </span>
              
              <div style={{ width: "1px", backgroundColor: "#546e7a" }}></div>
              
              {/* NÚT LƯU VÀO NGỮ PHÁP */}
              <span onClick={() => { 
                  playSound("click"); 
                  onSaveWord("grammar", selectedWord.toLowerCase()); 
                  setSelectedWord(""); 
                  setTooltipPos(null);
                  window.getSelection().removeAllRanges(); 
              }} style={{ cursor: "pointer", fontWeight: "bold", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", color: "#FF9800" }}>
                  📐 + Cấu trúc
              </span>
              
              <div style={{ position: "absolute", bottom: "-6px", left: "50%", transform: "translateX(-50%)", borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #2c3e50" }}></div>
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

// =======================================================================
// COMPONENT: SỔ TAY TÍCH HỢP AI + SỬA BẰNG TAY (MANUAL EDIT) XỊN SÒ
// =======================================================================
function NotebookScreen({ globalStats, onBack, onSaveWord, onRemoveWord }) { 
  const [activeTab, setActiveTab] = useState("vocab");
  const [newWord, setNewWord] = useState("");
  const [isAdding, setIsAdding] = useState(false); 

  const [viewAllModal, setViewAllModal] = useState(null); 
  const [wordDetailModal, setWordDetailModal] = useState(null); 

  const [isEditingManual, setIsEditingManual] = useState(false);
  const [manualInputs, setManualInputs] = useState({ phonetic: "", meaning: "", usage: "" });

  // HÀM LÕI: GỌI AI PHÂN BIỆT RÕ TỪ VỰNG VÀ NGỮ PHÁP
  const fetchAI = async (wordInput, currentTab) => {
      const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      if (!API_KEY || API_KEY.includes("DÁN_MÃ")) throw new Error("No_API");
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
      const listData = await listRes.json();
      const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
      const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
      const selectedModel = flashModel ? flashModel.name : textModels[0].name;

      let prompt = "";
      
      // ĐÃ FIX: Nhận diện Tab Ngữ Pháp để đổi prompt phân tích cấu trúc
      if (currentTab === "grammar") {
          prompt = `Giải thích chủ điểm/cấu trúc ngữ pháp tiếng Anh: "${wordInput}".
          Trả về CHỈ 1 OBJECT JSON ĐƠN GIẢN (Tuyệt đối không dùng markdown \`\`\`json):
          {
            "word": "${wordInput}",
            "phonetic": "Công thức tổng quát (Ví dụ: S + suggest + V-ing)",
            "meaning": "Cách sử dụng cốt lõi siêu ngắn gọn (Tối đa 10 từ)",
            "usage": "1 câu ví dụ tiếng Anh kèm nghĩa tiếng Việt"
          }`;
      } else {
          // ĐÃ FIX: Yêu cầu AI chèn luôn loại từ viết tắt vào từ vựng
          prompt = `Phân tích từ/cụm từ tiếng Anh: "${wordInput}".
          Trả về CHỈ 1 OBJECT JSON ĐƠN GIẢN (Tuyệt đối không dùng markdown \`\`\`json):
          {
            "word": "Từ chuẩn kèm (loại từ viết tắt). Ví dụ: 'brave (adj)', 'investigate (v)'",
            "phonetic": "Phiên âm quốc tế",
            "meaning": "Format bắt buộc: (Đồng nghĩa tiếng Anh) - Nghĩa tiếng Việt. Ví dụ: '(courageous) - dũng cảm'.",
            "usage": "1 câu ví dụ tiếng Anh thực tế chứa từ này"
          }`;
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      let rawText = data.candidates[0].content.parts[0].text;
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(rawText);
  };

  const handleAddNew = async (e) => {
    e.preventDefault();
    const wordInput = newWord.trim();
    if (!wordInput) return;
    setIsAdding(true);
    try {
        const aiWordObj = await fetchAI(wordInput, activeTab);
        onSaveWord(activeTab, aiWordObj);
    } catch (error) {
        if(error.message === "No_API") alert("Bạn chưa cấu hình API Key để gọi AI!");
        else { console.error("Lỗi AI:", error); onSaveWord(activeTab, wordInput.toLowerCase()); }
    }
    setIsAdding(false);
    setNewWord(""); 
  };

  const handleRetranslate = async (wordStr) => {
      setIsAdding(true);
      playSound("click");
      try {
          const aiWordObj = await fetchAI(wordStr, activeTab);
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

  const renderTags = (words, color, bgColor, listType, limit = null) => {
      if (!words || words.length === 0) return <p style={{ color: "#999", fontStyle: "italic", fontSize: "14px", margin: 0 }}>Chưa có mục nào...</p>;
      const displayWords = limit ? words.slice(0, limit) : words;
      const hasMore = limit && words.length > limit;

      return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            {displayWords.map((w, i) => (
              <span key={i} onClick={() => openDetail(w, listType)} style={{ backgroundColor: bgColor, color: color, padding: "6px 12px", borderRadius: "20px", fontSize: "14px", fontWeight: "bold", border: `1px solid ${color}40`, display: "flex", alignItems: "center", cursor: "pointer", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.05)"} onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"} title="Bấm để xem chi tiết">
                {w}
                <span onClick={(e) => { e.stopPropagation(); onRemoveWord(activeTab, listType, w); if(viewAllModal) setViewAllModal(null); if(wordDetailModal) setWordDetailModal(null); }} style={{ marginLeft: "8px", display: "inline-flex", justifyContent: "center", alignItems: "center", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.1)", fontSize: "10px", transition: "0.2s" }} onMouseOver={(e) => { e.currentTarget.style.backgroundColor = color; e.currentTarget.style.color = "white"; }} onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.1)"; e.currentTarget.style.color = color; }} title="Xóa khỏi sổ tay">✖</span>
              </span>
            ))}
            {hasMore && (
               <span onClick={() => { playSound("click"); setViewAllModal({ title: "Tất cả mục", words, color, bgColor, listType }); }} style={{ color: color, fontSize: "13px", fontWeight: "bold", cursor: "pointer", padding: "4px 8px", backgroundColor: "rgba(0,0,0,0.05)", borderRadius: "10px" }}>
                 ... và {words.length - limit} mục khác
               </span>
            )}
          </div>
      );
  }

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
           placeholder={activeTab === "grammar" ? "Nhập cấu trúc (VD: suggest, in order to...)" : `Nhập ${activeTab === "vocab" ? "từ vựng" : "cụm từ"} mới...`}
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

      {/* 1. OVERLAY MODAL: XEM TẤT CẢ (CÓ THANH CUỘN) */}
      {viewAllModal && (
        <div onClick={() => { playSound("click"); setViewAllModal(null); }} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box", cursor: "pointer" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "400px", borderRadius: "15px", padding: "20px", maxHeight: "80vh", display: "flex", flexDirection: "column", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", cursor: "default" }}>
              <h3 style={{ color: viewAllModal.color, marginTop: 0, borderBottom: "1px solid #eee", paddingBottom: "10px" }}>{viewAllModal.title} ({viewAllModal.words.length})</h3>
                <div style={{ overflowY: "auto", flex: 1, padding: "10px 0" }}>
                   {renderTags(viewAllModal.words, viewAllModal.color, viewAllModal.bgColor, viewAllModal.listType, null)}
                </div>
                <button onClick={() => { playSound("click"); setViewAllModal(null); }} style={{ width: "100%", padding: "12px", marginTop: "15px", fontSize: "16px", backgroundColor: "#e0e0e0", color: "#333", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>Đóng</button>
            </div>
        </div>
      )}

      {/* 2. OVERLAY MODAL: XEM CHI TIẾT TỪ & CẬP NHẬT/SỬA HÈN */}
      {wordDetailModal && (
        <div onClick={closeDetailModal} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box", cursor: "pointer" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "350px", borderRadius: "16px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "default" }}>   
                <h2 style={{ fontSize: "28px", color: "#2196F3", margin: "0 0 5px 0", textTransform: isEditingManual ? "none" : "none" }}>{wordDetailModal.wordStr}</h2>
                
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
                                {wordDetailModal.detail.usage && <p style={{ margin: "0", fontSize: "14px", color: "#333", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "10px" }}>"{wordDetailModal.detail.usage}"</p>}
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
                )}

                {isEditingManual && (
                    <div style={{ marginTop: "15px", textAlign: "left" }}>
                        {/* ĐÃ FIX: Nhãn sửa thủ công đổi theo Tab */}
                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>{activeTab === "grammar" ? "📐 Công thức / Cấu trúc:" : "🗣️ Phiên âm:"}</label>
                        <input type="text" value={manualInputs.phonetic} onChange={(e) => setManualInputs({...manualInputs, phonetic: e.target.value})} placeholder={activeTab === "grammar" ? "VD: S + suggest + V-ing" : "/Phiên âm quốc tế/"} style={editInputStyle}/>
                        
                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>🔖 Cách dùng / Nghĩa (Bắt buộc):</label>
                        <input type="text" value={manualInputs.meaning} onChange={(e) => setManualInputs({...manualInputs, meaning: e.target.value})} placeholder="Định nghĩa ngắn gọn..." style={editInputStyle}/>
                        
                        <label style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>📖 Ví dụ:</label>
                        <textarea value={manualInputs.usage} onChange={(e) => setManualInputs({...manualInputs, usage: e.target.value})} placeholder="Một câu ví dụ ngắn..." style={{ ...editInputStyle, height: "60px", resize: "none", fontFamily: "inherit" }}/>

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
        </div>
      )}
    </div>
  );
}

// HÀM TÁCH LOGIC RENDER: GIẤU TAB "LÀM SAI NHIỀU" NẾU ĐANG Ở MÀN NGỮ PHÁP
function renderListLogic(globalStats, activeTab, renderWordList) {
    const stats = globalStats[activeTab] || {};
    return (
        <>
            {renderWordList(activeTab === "grammar" ? "📘 Cấu trúc đã lưu" : "🔖 Ghim thủ công (Đang khó nhớ)", stats.savedWords, "🔖", "#FF9800", "#fff3e0", "savedWords")}
            {activeTab !== "grammar" && renderWordList("❌ Làm sai nhiều (Cần khắc phục)", stats.wrongWords, "❌", "#F44336", "#ffebee", "wrongWords")}
        </>
    )
}

// --- COMPONENT: APP CHÍNH ---
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [screen, setScreen] = useState("home"); 
  
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
        if (isMusicPlaying && screen === "home" && !showTutorial && currentUser) {
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
    if (isMusicPlaying && screen === "home" && !showTutorial) {
      globalBgm.play().catch(e => console.log("Đợi tương tác..."));
    }
  }, [currentTrackIndex, isMusicPlaying, screen, showTutorial]);

  useEffect(() => {
    if (screen === "home" && isMusicPlaying && !showTutorial && currentUser) {
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

  // --- TRUYỀN THÊM TỪ/CÂU HỎI VÀO CƠ SỞ DỮ LIỆU ---
  // --- TRUYỀN THÊM TỪ/CÂU HỎI VÀO CƠ SỞ DỮ LIỆU ---
  const updateGlobalStats = async (type, isCorrect, itemValue = null) => {
    if (!currentUser) return;
    
    const newCorrect = globalStats[type].correct + (isCorrect ? 1 : 0);
    const newTotal = globalStats[type].total + 1;

    const updatePayload = {
      [`${type}.correct`]: newCorrect,
      [`${type}.total`]: newTotal
    };

    if (itemValue) {
      updatePayload[`${type}.learnedWords`] = arrayUnion(itemValue);

      // ĐÃ FIX: Chỉ tự động lưu từ làm sai vào Sổ tay nếu là Từ vựng/Colloc. 
      // Chặn lưu câu hỏi Ngữ pháp dài dòng để giữ Sổ tay Ngữ pháp sạch sẽ!
      if (!isCorrect && type !== "grammar") {
          updatePayload[`${type}.wrongWords`] = arrayUnion(itemValue);
      }
    }

    try {
      await updateDoc(doc(db, "users", currentUser.uid), updatePayload);
    } catch(e) {
      console.error("Lỗi cập nhật tiến độ:", e);
    }

    setGlobalStats(prev => {
      const newState = { ...prev };
      newState[type] = {
        ...newState[type],
        correct: newCorrect,
        total: newTotal
      };
      
      if (itemValue) {
        const currentWords = prev[type].learnedWords || [];
        if (!currentWords.includes(itemValue)) {
           newState[type].learnedWords = [...currentWords, itemValue];
        }
        
        if (!isCorrect && type !== "grammar") {
           const currentWrong = newState[type].wrongWords || [];
           if (!currentWrong.includes(itemValue)) {
               newState[type].wrongWords = [...currentWrong, itemValue];
           }
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

 // --- TÍNH NĂNG MỚI: HÀM LƯU TỪ VÀO SỔ TAY THỦ CÔNG ---
  // --- TÍNH NĂNG MỚI: LƯU TỪ VÀ ĐỊNH NGHĨA AI VÀO KHO CÁ NHÂN ---
  const handleSaveDifficultWord = async (type, wordData) => {
    if (!currentUser) return;
    
    // Kiểm tra xem đầu vào là chuỗi (chơi game) hay Object (do AI dịch)
    const isFromAI = typeof wordData === "object";
    const wordStr = isFromAI ? wordData.word : wordData;

    try {
      playSound("click");
      const updatePayload = { [`${type}.savedWords`]: arrayUnion(wordStr) };
      
      // Nếu có định nghĩa từ AI, lưu thêm vào kho từ điển cá nhân
      if (isFromAI) { updatePayload[`${type}.addedWordsObj`] = arrayUnion(wordData); }

      await updateDoc(doc(db, "users", currentUser.uid), updatePayload);
      
      setGlobalStats(prev => {
        const newState = { ...prev };
        // Khởi tạo an toàn
        if (!newState[type].savedWords) newState[type].savedWords = [];
        if (!newState[type].addedWordsObj) newState[type].addedWordsObj = [];

        if (!newState[type].savedWords.includes(wordStr)) {
            newState[type].savedWords = [...newState[type].savedWords, wordStr];
        }
        if (isFromAI) {
            // Thêm Object vào UI ngay lập tức
            newState[type].addedWordsObj = [...newState[type].addedWordsObj, wordData];
        }
        return newState;
      });
    } catch(e) { console.error("Lỗi lưu từ:", e); }
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
  if (screen === "notebook") return <NotebookScreen globalStats={globalStats} onBack={() => { playSound("click"); setScreen("home"); }} onSaveWord={handleSaveDifficultWord} onRemoveWord={handleRemoveWord} />;
  if (screen === "vocab") return <WordQuiz mode="vocab" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} settings={quizSettings} stats={globalStats.vocab} isMusicPlaying={isMusicPlaying} />;
  if (screen === "collocation") return <WordQuiz mode="collocation" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} settings={quizSettings} stats={globalStats.collocation} isMusicPlaying={isMusicPlaying} />;
  if (screen === "grammar") return <GrammarQuiz onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} settings={quizSettings} learnedQuestions={globalStats.grammar.learnedWords || []} />;

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

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontSize: "11px", color: "#333", fontWeight: "bold", maxWidth: "60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={currentUser.email}>
            👤 {currentUser.email.split('@')[0]}
          </span>
          <button 
            onClick={handleLogout} 
            title="Đăng xuất"
            style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#ff4d4f", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", transition: "0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", padding: 0 }}
            onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.1)"}
            onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            🚪
          </button>
        </div>
      </div>

      <h1 style={{ fontSize: "2.2rem", margin: "10px 0", color: "#2c3e50" }}>TOEIC Master 🚀</h1>
      <p style={{ color: "#7f8c8d", marginBottom: "25px" }}>Đã đồng bộ dữ liệu đám mây ☁️</p>

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

      {/* MENU CHÍNH */}
      <div style={{ display: "flex", flexDirection: "column", gap: "15px", maxWidth: "300px", margin: "0 auto" }}>
        {/* NÚT VÀO SỔ TAY */}
        <button onClick={() => { playSound("click"); setScreen("notebook"); }} style={{ padding: "15px", fontSize: "18px", backgroundColor: "#FF9800", color: "white", borderRadius: "10px", border: "none", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", transition: "transform 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
          📖 Xem Sổ Tay Của Tôi
        </button>
        <button onClick={() => { playSound("click"); setScreen("vocab_settings"); }} style={{ padding: "15px", fontSize: "18px", backgroundColor: "#4CAF50", color: "white", borderRadius: "10px", border: "none", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", transition: "transform 0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
          Bắt đầu luyện Từ Vựng
        </button>
        <button onClick={() => { playSound("click"); setScreen("collocation_settings"); }} style={{ padding: "15px", fontSize: "18px", backgroundColor: "#9C27B0", color: "white", borderRadius: "10px", border: "none", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", transition: "transform 0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
          Bắt đầu luyện Collocation
        </button>
        <button onClick={() => { playSound("click"); setScreen("grammar_settings"); }} style={{ padding: "15px", fontSize: "18px", backgroundColor: "#2196F3", color: "white", borderRadius: "10px", border: "none", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", transition: "transform 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"} onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
          Bắt đầu luyện Ngữ Pháp ✨
        </button>
      </div>

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
    </div>
  );
}

export default App;