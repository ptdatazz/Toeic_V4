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
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";

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
    
    if (level === 1) {
      if (Math.random() > 0.5) qType = "vn_to_en";
    }
    else if (level >= 2) {
      const types = ["en_to_vn", "vn_to_en", "typing", "listening"];
      if (!item.word.includes(' ')) types.push("scramble");
      qType = types[Math.floor(Math.random() * types.length)];
    }

    let questionObj = { ...item, type: qType };

    if (qType === "en_to_vn" || qType === "listening") {
      const wrongOptions = getRandomWrongOptions(fullData, item, "meaning");
      questionObj.options = shuffleArray([...wrongOptions, item.meaning]);
      questionObj.answer = item.meaning;
    } else if (qType === "vn_to_en") {
      const wrongOptions = getRandomWrongOptions(fullData, item, "word");
      questionObj.options = shuffleArray([...wrongOptions, item.word]);
      questionObj.answer = item.word;
    } else if (qType === "typing" || qType === "scramble") {
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
        // THÊM: dataSource
        return { ...parsedSettings, difficultyLevel: 1, toeicPart: parsedSettings.toeicPart || "part5", dataSource: parsedSettings.dataSource || "default" }; 
    }
    // THÊM: dataSource: "default"
    return { quizLimit: mode === "grammar" ? 5 : 30, timePerQuestion: mode === "grammar" ? 30 : 10, requiredStreak: 3, difficultyLevel: 1, survivalLives: 3, timeAttackSeconds: mode === "grammar" ? 60 : 30, toeicPart: "part5", dataSource: "default" };
  });

  // THÊM: Tính toán min/max tự động cho thanh kéo
  let dynamicMin = mode === "grammar" ? 1 : 5;
  let dynamicMax = mode === "grammar" ? 20 : 100;
  
  if (mode === "vocab" && settings.dataSource === "custom") {
      // Lấy chính xác số lượng từ ở sheet Custom làm Min
      dynamicMin = customWordsCount > 0 ? customWordsCount : 5;
      if (dynamicMax < dynamicMin) dynamicMax = dynamicMin + 20; 
  }

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
                <strong>Custom:</strong> Bắt buộc học hết từ mới trước
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
        <div style={{ marginBottom: "20px", backgroundColor: "#fff", padding: "15px", borderRadius: "8px", borderLeft: `4px solid ${settings.difficultyLevel === 1 ? primaryColor : settings.difficultyLevel === 2 ? "#FF9800" : settings.difficultyLevel === 3 ? "#E91E63" : "#F44336"}`, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <label style={{ fontWeight: "bold", color: "#333", display: "block", marginBottom: "8px", fontSize: "16px" }}>
            🔥 Level {settings.difficultyLevel}: 
            <span style={{ color: settings.difficultyLevel === 1 ? primaryColor : settings.difficultyLevel === 2 ? "#FF9800" : settings.difficultyLevel === 3 ? "#E91E63" : "#F44336", marginLeft: "5px" }}>
              {settings.difficultyLevel === 1 ? "Cơ Bản" : settings.difficultyLevel === 2 ? "Đa Dạng" : settings.difficultyLevel === 3 ? "Sinh Tồn ❤️" : "Time Attack ⏱️"}
            </span>
          </label>
          <input 
            type="range" min="1" max="4" step="1" 
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
                {mode === "vocab" && settings.dataSource === "custom" && customWordsCount > 0 && (
                   <span style={{ fontSize: "12px", color: "#F44336", marginLeft: "10px", backgroundColor: "#ffebee", padding: "2px 6px", borderRadius: "4px" }}>(Min: {customWordsCount} từ ở sheet Custom)</span>
                )}
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
function WordQuiz({ mode, onBack, updateGlobal, settings, learnedWords, isMusicPlaying }) {
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
  const [scrambleAvailable, setScrambleAvailable] = useState([]);
  const [scrambleSelected, setScrambleSelected] = useState([]);
  // THÊM: State lưu trữ đáp án cho câu hỏi Crossword Boss
  const [crosswordInputs, setCrosswordInputs] = useState({});

  useEffect(() => {
    const fetchVocabFromSheets = async () => {
      try {
        const SHEET_ID = "1nAdOxZBZ3-Bawh3Ks54KaIYLPgGZfTuchebwbCYW8dU";
        
        // KIỂM TRA NGUỒN DATA ĐỂ CHỌN SHEET
        let SHEET_NAME = mode === "vocab" ? "Vocab" : "Collocation"; 
        if (mode === "vocab" && settings.dataSource === "custom") {
            SHEET_NAME = "Custom"; // Bắt buộc lấy từ sheet Custom theo yêu cầu
        }

        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${SHEET_NAME}`;
        const response = await fetch(url);
        const text = await response.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const result = JSON.parse(jsonString);
        const headers = result.table.cols.map(col => col.label);
        const fullData = result.table.rows.map(row => {
          let obj = {};
          headers.forEach((header, index) => {
            obj[header] = (row.c[index] && row.c[index].v) ? row.c[index].v.toString() : "";
          });
          return obj;
        });
        setFullVocabData(fullData);

        const learnedSet = new Set(learnedWords || []);
        const newWords = [];
        const oldWords = [];

        fullData.forEach(item => {
           if (learnedSet.has(item.word)) oldWords.push(item);
           else newWords.push(item);
        });

        const shuffledNew = shuffleArray(newWords);
        const shuffledOld = shuffleArray(oldWords);

        let finalPool = [];

        if (DIFFICULTY_LEVEL >= 3) {
            finalPool = [...shuffledNew, ...shuffledOld, ...shuffledNew, ...shuffledOld, ...fullData].slice(0, QUIZ_LIMIT);
        } else {
            // THUẬT TOÁN CUSTOM VS DEFAULT
            if (mode === "vocab" && settings.dataSource === "custom") {
                // Chế độ Custom: Tối đa từ mới có thể, thiếu mới lấy cũ đắp vào.
                // Đặc biệt KHÔNG XÀO TRỘN mảng finalPool, để từ mới auto nằm trên cùng.
                const targetNewCount = Math.min(shuffledNew.length, QUIZ_LIMIT);
                const targetOldCount = QUIZ_LIMIT - targetNewCount;
                
                const pickNew = shuffledNew.slice(0, targetNewCount);
                const pickOld = shuffledOld.slice(0, targetOldCount);
                
                finalPool = [...pickNew, ...pickOld]; 
            } else {
                // Chế độ Default: Vẫn giữ 80 mới / 20 cũ và trộn ngẫu nhiên
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
          let aiKeyword = "";

          // TÍNH TOÁN ĐỘ DÀI RANDOM TỪ 3 - 10 KÝ TỰ (Không vượt quá số từ đang học)
          const maxPossibleLen = Math.min(availableWords.length, 10);
          const targetRandomLen = Math.floor(Math.random() * (maxPossibleLen - 3 + 1)) + 3;

          // 1. GỌI AI ĐỂ SINH TỪ KHÓA DỰA TRÊN TỪ VỰNG VỪA HỌC
          try {
              const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
              if (API_KEY && !API_KEY.includes("DÁN_MÃ")) {
                  console.log(`[BOSS] Đang nhờ AI suy nghĩ từ khóa dài đúng ${targetRandomLen} ký tự...`);
                  
                  // Ép AI đẻ ra từ khóa có độ dài chính xác bằng targetRandomLen
                  const prompt = `Tôi vừa học các từ vựng tiếng Anh sau: ${wordListStr}. Hãy nghĩ ra 1 từ khóa tiếng Anh bí mật (CÓ ĐÚNG ${targetRandomLen} CHỮ CÁI). Từ khóa này nên liên quan đến chủ đề chung của các từ trên, hoặc mang ý nghĩa cổ vũ (như WIN, TOP, BEST, FOCUS, MASTER). CHỈ TRẢ VỀ DUY NHẤT 1 TỪ ĐÓ, viết hoa, không giải thích gì thêm.`;
                  
                  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                  });
                  const data = await res.json();
                  if (data.candidates && data.candidates.length > 0) {
                      aiKeyword = data.candidates[0].content.parts[0].text.trim().toUpperCase().replace(/[^A-Z]/g, '');
                      console.log("[BOSS] AI chọn từ khóa:", aiKeyword);
                  }
              }
          } catch (e) { console.log("[BOSS] AI đang bận, dùng từ khóa dự phòng."); }

          // 2. TẠO MẠNG LƯỚI CROSSWORD TỪ TỪ KHÓA
          const fallbacks = ["WIN", "TOP", "PRO", "YES", "BEST", "GOOD", "FAST", "LEAD", "SMART", "GREAT", "FOCUS", "SUPER", "EXPERT", "MASTER", "WINNER", "GENIUS", "SUCCESS", "CHAMPION", "BRILLIANT"];
          
          // Lọc bỏ những từ dự phòng dài hơn số lượng từ vựng bạn đang học
          let validFallbacks = fallbacks.filter(w => w.length <= maxPossibleLen);
          
          // FIX LỖI LUÔN LÀ 3 KÝ TỰ: 
          // Trộn ngẫu nhiên trước, sau đó ép các từ có độ dài GẦN BẰNG con số random lên đầu danh sách để thử trước!
          validFallbacks = shuffleArray(validFallbacks); 
          validFallbacks.sort((a, b) => Math.abs(a.length - targetRandomLen) - Math.abs(b.length - targetRandomLen));
          
          let keywordsToTry = (aiKeyword && aiKeyword.length <= maxPossibleLen && aiKeyword.length >= 3) ? [aiKeyword, ...validFallbacks] : validFallbacks;

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

              generatedQs[generatedQs.length - 1] = {
                  type: "crossword_boss",
                  words: bossWords,
                  keyword: finalKeyword,
                  isVerticalKeyword: isVerticalMap, // Lưu trạng thái xoay Map
                  question: "Thử thách cuối cùng - Ghép từ bạn vừa học!",
                  answer: "WIN"
              };
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

    if (timeLeft <= 0) { handleAnswer(null); return; }
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
       if (currentQ.type === "typing" || currentQ.type === "scramble") {
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
            
            // Tìm vị trí boss hiện tại (nếu có)
            const bossIndex = newData.findIndex(q => q.type === "crossword_boss");
            
            let insertIndex = newData.length;
            const remaining = newData.length - current - 1;
            if (remaining > 5) {
                insertIndex = current + 3 + Math.floor(Math.random() * (remaining - 2));
            }

            // ÉP chèn trước boss nếu boss tồn tại
            if (bossIndex !== -1) {
                insertIndex = Math.min(insertIndex, bossIndex);
                console.log(`Chèn phạt tại vị trí ${insertIndex} (trước boss tại ${bossIndex})`);
            }

            let penaltyItem = { ...newData[current] };
            
            if (penaltyItem.type === "en_to_vn") penaltyItem.type = "vn_to_en";
            else if (penaltyItem.type === "vn_to_en" || penaltyItem.type === "listening") penaltyItem.type = "en_to_vn";
            else penaltyItem.type = Math.random() > 0.5 ? "en_to_vn" : "vn_to_en"; // Scramble/Typing đổi sang trắc nghiệm

            // Sinh lại đáp án (options) và kết quả (answer) cho phù hợp với cách chơi mới
            if (penaltyItem.type === "en_to_vn") {
               penaltyItem.answer = penaltyItem.meaning;
               const wrongOptions = getRandomWrongOptions(fullVocabData, penaltyItem, "meaning"); // <-- SỬA Ở ĐÂY
               penaltyItem.options = shuffleArray([...wrongOptions, penaltyItem.meaning]);
            } else if (penaltyItem.type === "vn_to_en") {
               penaltyItem.answer = penaltyItem.word;
               const wrongOptions = getRandomWrongOptions(fullVocabData, penaltyItem, "word"); // <-- SỬA Ở ĐÂY
               penaltyItem.options = shuffleArray([...wrongOptions, penaltyItem.word]);
            }

            newData.splice(insertIndex, 0, penaltyItem);
            
            // Debug cuối cùng: in ra vị trí boss sau khi chèn
            const newBossIndex = newData.findIndex(q => q.type === "crossword_boss");
            console.log(`Sau khi chèn phạt → boss vẫn ở vị trí: ${newBossIndex}/${newData.length-1}`);
            
            return newData;
        });
      }
    }
  };

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
    const nextIdx = current + 1;
    setCurrent(nextIdx);
    setTimeLeft(TIME_PER_QUESTION); 
    if (nextIdx >= questionsData.length && DIFFICULTY_LEVEL < 3) playSound("finish");
  };

  const handleBackToHome = () => {
    playSound("click");
    onBack(); 
  };

  if (loadingData) {
    return <div className="container" style={{ textAlign: "center", paddingTop: "50px" }}><h2>Đang tải bộ dữ liệu chiến đấu... ☁️</h2></div>;
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
    <div className="container">
      {/* THANH THÔNG TIN TỐI GIẢN */}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", height: "40px", marginBottom: "15px", gap: "10px" }}>
        
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", overflow: "hidden" }}>
          {DIFFICULTY_LEVEL < 3 && (
            <button 
              onClick={() => { 
                if(streak >= REQUIRED_STREAK) { handleBackToHome(); }
              }} 
              style={{ padding: "6px 10px", fontSize: "13px", cursor: streak >= REQUIRED_STREAK ? "pointer" : "not-allowed", backgroundColor: streak >= REQUIRED_STREAK ? "#e8f5e9" : "#f0f0f0", color: streak >= REQUIRED_STREAK ? "#2e7d32" : "#999", border: "1px solid #ccc", borderRadius: "6px", fontWeight: "bold", whiteSpace: "nowrap", margin: 0, flexShrink: 0 }}
            >
              ⬅ {streak >= REQUIRED_STREAK ? "🔓" : `🔒 ${streak}/${REQUIRED_STREAK}`}
            </button>
          )}
        </div>

        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "#fff", padding: "4px 12px", borderRadius: "20px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)", border: "1px solid #eee", flexShrink: 0 }}>
          {(currentQ.type === "en_to_vn" || currentQ.type === "listening") && (
            <button 
              onClick={() => speakWord(currentQ.word)}
              style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid #bbdefb", backgroundColor: "#e3f2fd", color: "#1976D2", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "16px", padding: 0, margin: 0, flexShrink: 0 }}
            >
              🔊
            </button>
          )}
          {/* PHỤC HỒI ĐỒNG HỒ */}
          <span style={{ fontWeight: "bold", color: (DIFFICULTY_LEVEL===4 ? globalTime : timeLeft) <= 5 ? "#f44336" : "#333", fontSize: "15px", minWidth: "35px", textAlign: "center", whiteSpace: "nowrap", flexShrink: 0 }}>
            {currentQ.type === "crossword_boss" ? "⏳ Vô cực" : `⏱️ ${DIFFICULTY_LEVEL === 4 ? globalTime : timeLeft}s`}
          </span>
        </div>

        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", overflow: "hidden" }}>
          {DIFFICULTY_LEVEL === 3 ? (
            <span style={{ fontSize: "15px", whiteSpace: "nowrap", flexShrink: 0 }}>
               {"❤️".repeat(Math.max(0, lives))}
            </span>
          ) : (
            <span style={{ color: "#666", fontSize: "13px", whiteSpace: "nowrap", fontWeight: "bold", flexShrink: 0 }}>
              {DIFFICULTY_LEVEL === 4 ? `Đúng: ${score}` : `${current + 1}/${questionsData.length}`}
            </span>
          )}
        </div>

      </div>

      {DIFFICULTY_LEVEL < 4 && currentQ.type !== "crossword_boss" && <div style={{ width: "100%", height: "8px", backgroundColor: "#e0e0e0", borderRadius: "4px", overflow: "hidden", marginBottom: "20px" }}>
        <div style={{ height: "100%", width: `${timePercentage}%`, backgroundColor: timeLeft <= 3 ? "#f44336" : "#4caf50", transition: "width 1s linear" }} />
      </div>}

      {/* --- CÁC KIỂU CÂU HỎI --- */}

      {/* GIAO DIỆN BẢN ĐỒ CROSSWORD CÓ TỪ KHÓA ẨN */}
      {currentQ.type === "crossword_boss" && (
        <div style={{ textAlign: "left", animation: "popIn 0.5s ease-out" }}>
          <h2 style={{ fontSize: "22px", color: "#2c3e50", textAlign: "center", textTransform: "uppercase" }}>🧩 Vượt Ải Ô Chữ</h2>
          <p style={{ color: "#F44336", textAlign: "center", marginBottom: "20px", fontWeight: "bold", fontSize: "14px" }}>Không tính thời gian. Điền từ để tìm TỪ KHÓA BÍ ẨN dọc màu cam!</p>

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
                                 ref={(el) => bossInputRefs.current[idx] = el} // Gắn định vị cho ô nhập
                                 type="text"
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

          {/* HIỆU ỨNG TỪ KHÓA KHI HOÀN THÀNH */}
          {currentQ.words.every((item, idx) => (crosswordInputs[idx] || "").toLowerCase().trim() === item.word.toLowerCase().trim()) ? (
             <div style={{ marginTop: "25px", textAlign: "center", animation: "popIn 0.5s" }}>
                 <h3 style={{ color: "#FF9800", marginBottom: "15px" }}>Từ khóa bí mật là: <br/><span style={{ fontSize: "32px", color: "#e65100", letterSpacing: "5px" }}>{currentQ.keyword}</span></h3>
                 <button onClick={() => handleAnswer("WIN")} style={{ width: "100%", padding: "15px", fontSize: "18px", backgroundColor: "#4CAF50", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>🎉 Tuyệt vời! Hoàn thành 🎉</button>
             </div>
          ) : (
             <button disabled style={{ width: "100%", padding: "15px", marginTop: "25px", fontSize: "18px", backgroundColor: "#ccc", color: "#666", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "not-allowed" }}>🔒 Giải mã để mở khóa</button>
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
          <form onSubmit={handleTypingSubmit} style={{ marginTop: "20px" }}>
            <input ref={typingInputRef} type="text" value={typingValue} onChange={(e) => setTypingValue(e.target.value)} disabled={selected !== null} placeholder="Nhập vào đây..." style={{ width: "100%", padding: "15px", fontSize: "20px", textAlign: "center", borderRadius: "8px", border: "2px solid #ccc", outline: "none", textTransform: "lowercase" }} autoComplete="off" autoCorrect="off" spellCheck="false" />
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
// COMPONENT MỚI: NGỮ PHÁP TÍCH HỢP TRÍ TUỆ NHÂN TẠO (HỖ TRỢ PART 5, 6, 7)
// =======================================================================
function GrammarQuiz({ onBack, updateGlobal, settings, learnedQuestions }) {
  const DIFFICULTY_LEVEL = settings.difficultyLevel;
  const QUIZ_LIMIT = settings.quizLimit; 
  const TIME_PER_QUESTION = settings.timePerQuestion;
  const REQUIRED_STREAK = settings.requiredStreak; 
  const TOEIC_PART = settings.toeicPart || "part5";
  
  // 👇👇👇 DÁN MÃ API KEY CỦA BẠN VÀO ĐÂY 👇👇👇
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  const [questionsData, setQuestionsData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("🤖 Chờ một lát, Thầy giáo AI đang soạn đề riêng cho bạn...");

  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);

  const [lives, setLives] = useState(DIFFICULTY_LEVEL === 3 ? settings.survivalLives : null);
  const [globalTime, setGlobalTime] = useState(DIFFICULTY_LEVEL === 4 ? settings.timeAttackSeconds : null);

  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [answerStatus, setAnswerStatus] = useState(null); 
  const [streak, setStreak] = useState(0);

  // HÀM GỌI AI ĐỂ SOẠN ĐỀ THEO TỪNG PART (ĐÃ FIX LỖI LỘ ĐÁP ÁN PART 6, 7)
  useEffect(() => {
    const fetchGrammarFromAI = async () => {
      // Bẫy lỗi an toàn không lo crash web
      if (!GEMINI_API_KEY || String(GEMINI_API_KEY).includes("DÁN_MÃ") || String(GEMINI_API_KEY).includes("ĐIỀN_API_KEY")) {
          alert("LỖI: Không tìm thấy API Key!\n\nNếu đang chạy trên máy tính: Hãy kiểm tra file .env và nhớ tắt terminal đi chạy lại lệnh 'npm run dev'.\nNếu trên Vercel: Hãy kiểm tra mục Environment Variables.");
          onBack();
          return;
      }

      setLoadingData(true);
      setLoadingMsg(`🤖 Thầy AI đang biên soạn đề TOEIC ${TOEIC_PART.toUpperCase()}...`);
      
      // HUẤN LUYỆN LẠI AI BẰNG PROMPT NGHIÊM NGẶT HƠN
      let partInstruction = "";
      if (TOEIC_PART === "part5") {
          partInstruction = `Đây là đề TOEIC Part 5 (Ngữ pháp/Từ vựng câu đơn).
          - Trường "passage": bắt buộc để chuỗi rỗng "".
          - Trường "question": Tạo 1 câu tiếng Anh có đúng 1 chỗ trống (___) cần điền.`;
      } else if (TOEIC_PART === "part6") {
          partInstruction = `Đây là đề TOEIC Part 6 (Điền từ vào đoạn văn).
          - Trường "passage": Tạo 1 đoạn văn ngắn (email, thông báo...). ĐỤC ĐÚNG 1 LỖ (___) TRONG ĐOẠN VĂN NÀY. TUYỆT ĐỐI KHÔNG để lộ từ đáp án bên trong đoạn văn.
          - Trường "question": Điền mặc định một câu lệnh: "Choose the best word or phrase to fill in the blank."`;
      } else if (TOEIC_PART === "part7") {
          partInstruction = `Đây là đề TOEIC Part 7 (Đọc hiểu đoạn văn).
          - Trường "passage": Tạo 1 đoạn văn tiếng Anh hoàn chỉnh (KHÔNG đục lỗ).
          - Trường "question": Tạo 1 câu hỏi Đọc hiểu hỏi về thông tin trong đoạn văn (Ví dụ: What is the main purpose of the email?). Cấm dùng dạng đục lỗ ở đây.`;
      }

      const prompt = `Bạn là một chuyên gia luyện thi TOEIC. Hãy tạo ${QUIZ_LIMIT} câu hỏi trắc nghiệm tiếng Anh. Mức độ khó: ${DIFFICULTY_LEVEL <= 2 ? "Dễ và Trung bình" : "Khó, mang tính đánh đố"}.
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
    
    // THÊM: Dừng đếm ngược nếu là câu hỏi trùm cuối
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

  return (
    <div className="container" style={{ maxWidth: TOEIC_PART !== "part5" ? "600px" : "450px" }}> 
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
          <span style={{ fontSize: "12px", backgroundColor: "#2196F3", color: "white", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold", textTransform: "uppercase" }}>{TOEIC_PART}</span>
          {DIFFICULTY_LEVEL === 3 ? (
            <span style={{ fontSize: "15px", whiteSpace: "nowrap", flexShrink: 0 }}>
               {"❤️".repeat(Math.max(0, lives))}
            </span>
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

      {/* KHUNG HIỂN THỊ ĐOẠN VĂN (DÀNH CHO PART 6 & 7) */}
      {currentQ.passage && currentQ.passage.trim() !== "" && (
        <div style={{ backgroundColor: "#fdfdfd", border: "1px solid #d0d7de", padding: "15px", borderRadius: "8px", marginBottom: "20px", textAlign: "left", boxShadow: "inset 0 0 10px rgba(0,0,0,0.02)" }}>
           <p style={{ fontSize: "15px", lineHeight: "1.6", color: "#333", margin: 0, whiteSpace: "pre-line" }}>
             {currentQ.passage}
           </p>
        </div>
      )}

      {/* CÂU HỎI */}
      <h2 style={{ lineHeight: "1.6", color: "#2c3e50", fontSize: TOEIC_PART !== "part5" ? "18px" : "20px", borderBottom: "2px dashed #bbdefb", paddingBottom: "15px", marginBottom: "20px" }}>
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

          <div style={{ marginTop: "20px", textAlign: "left", backgroundColor: "#f0f8ff", padding: "20px", borderRadius: "12px", border: "2px solid #90caf9", position: "relative" }}>
            <div style={{ position: "absolute", top: "-15px", left: "15px", backgroundColor: "#2196F3", color: "white", padding: "5px 15px", borderRadius: "20px", fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 5px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "5px" }}>
              <span>🤖</span> Thầy AI Giải Thích
            </div>
            
            {selected !== "TIMEOUT" && selected !== currentQ.answer && (
             <div style={{ marginTop: "10px", marginBottom: "15px", fontSize: "16px", color: "#d32f2f", fontWeight: "bold" }}>
               Đáp án đúng: <span style={{ textDecoration: "underline", color: "#2e7d32", padding: "2px 6px", backgroundColor: "#e8f5e9", borderRadius: "4px" }}>{currentQ.answer}</span>
             </div>
            )}

            <p style={{ margin: "10px 0 0 0", fontSize: "15px", lineHeight: "1.7", color: "#333", whiteSpace: "pre-line" }}>
              {currentQ.explanation}
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

        try {
            const customData = await fetchSheetData("Custom");
            const headers = customData.table.cols.map(col => col.label);
            const wordColIdx = headers.findIndex(h => h && h.toLowerCase() === 'word');
            const idx = wordColIdx !== -1 ? wordColIdx : 0;
            
            // Lấy chính xác cột "Word" ra để lưu vào mảng
            const customWordsArr = customData.table.rows.map(row => (row.c[idx] && row.c[idx].v) ? row.c[idx].v.toString() : "").filter(w => w !== "");
            setCustomSheetWords(customWordsArr);
            localStorage.setItem("toeic_custom_words", JSON.stringify(customWordsArr));
        } catch (e) {
            console.log("Sheet Custom có thể đang trống");
        }

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
  
  // TÍNH TOÁN SỐ TỪ CHƯA HỌC TRONG SHEET CUSTOM
  const customLearnedSet = new Set(globalStats.vocab.learnedWords || []);
  const unlearnedCustomCount = customSheetWords.filter(w => !customLearnedSet.has(w)).length;

  // --- ĐIỀU HƯỚNG MÀN HÌNH ---
  if (screen === "vocab_settings") {
    // Gửi đúng số lượng từ Custom chưa học vào thanh kéo Min
    return <QuizSettings mode="vocab" onBack={() => setScreen("home")} onStart={(settings) => { setQuizSettings(settings); setScreen("vocab"); }} customWordsCount={unlearnedCustomCount} />
  }
  if (screen === "collocation_settings") {
    return <QuizSettings mode="collocation" onBack={() => setScreen("home")} onStart={(settings) => { setQuizSettings(settings); setScreen("collocation"); }} />
  }
  if (screen === "grammar_settings") {
    return <QuizSettings mode="grammar" onBack={() => setScreen("home")} onStart={(settings) => { setQuizSettings(settings); setScreen("grammar"); }} />
  }
 
  if (screen === "vocab") return <WordQuiz mode="vocab" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} settings={quizSettings} learnedWords={globalStats.vocab.learnedWords || []} isMusicPlaying={isMusicPlaying} />;
  if (screen === "collocation") return <WordQuiz mode="collocation" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} settings={quizSettings} learnedWords={globalStats.collocation.learnedWords || []} isMusicPlaying={isMusicPlaying} />;

  if (screen === "grammar") return <GrammarQuiz onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} settings={quizSettings} learnedQuestions={globalStats.grammar.learnedWords || []} />;

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
      `}</style>
    </div>
  );
}

export default App;