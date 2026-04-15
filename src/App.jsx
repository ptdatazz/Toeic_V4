import { useState, useEffect, useRef, useMemo } from "react";
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
    // Đã hết key → reset về đầu để thử lại từ key 1 (tránh kẹt ở key cuối)
    globalKeyIndex = 0;
    console.log(`[HỆ THỐNG] 🔁 Đã reset về Key số 1 để thử lại vòng mới`);
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
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const getMeaning = (item) => {
  if (item.meaning && item.meaning.trim()) return item.meaning.trim();
  const parts = [
    item.noun_meaning && `(n) ${item.noun_meaning}`,
    item.verb_meaning && `(v) ${item.verb_meaning}`,
    item.adj_meaning && `(adj) ${item.adj_meaning}`,
  ].filter(Boolean);
  return parts.join(" / ") || "";
};

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

    // SAU
    const itemMeaning = getMeaning(item);
    let questionObj = { ...item, type: qType, meaning: itemMeaning };

    if (qType === "en_to_vn" || qType === "listening") {
      const wrongOptions = fullData
        .filter(d => getMeaning(d) !== itemMeaning && getMeaning(d))
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(d => getMeaning(d));
      questionObj.options = shuffleArray([...wrongOptions, itemMeaning]);
      questionObj.answer = itemMeaning;
    } else if (qType === "vn_to_en" || qType === "part5_vocab") {
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
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1a237e 0%,#283593 50%,#1565c0 100%)", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", boxSizing:"border-box" }}>
      <div style={{ width:"100%", maxWidth:"400px" }}>
        <div style={{ textAlign:"center", marginBottom:"28px" }}>
          <div style={{ fontSize:"56px", marginBottom:"8px" }}>🚀</div>
          <h1 style={{ fontSize:"2rem", fontWeight:"900", color:"white", margin:"0 0 6px 0" }}>TOEIC Master</h1>
          <p style={{ color:"rgba(255,255,255,0.6)", margin:0, fontSize:"14px" }}>Luyện thi thông minh — Chinh phục điểm cao</p>
        </div>
        <div style={{ backgroundColor:"white", borderRadius:"24px", padding:"32px 28px", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
          <h2 style={{ margin:"0 0 20px 0", color:"#1a237e", fontWeight:"800", fontSize:"20px", textAlign:"center" }}>
            {isLoginMode ? "👋 Đăng nhập" : "✨ Tạo tài khoản"}
          </h2>
          {error && <div style={{ color:"#d32f2f", backgroundColor:"#ffebee", padding:"10px 14px", borderRadius:"10px", fontSize:"14px", marginBottom:"16px", border:"1px solid #ffcdd2" }}>{error}</div>}
          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
            <input type="text" placeholder="Email của bạn" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ padding:"13px 16px", borderRadius:"12px", border:"2px solid #e0e0e0", fontSize:"15px", outline:"none", fontFamily:"inherit" }}
              onFocus={e=>e.target.style.borderColor="#1565c0"} onBlur={e=>e.target.style.borderColor="#e0e0e0"} />
            <input type="password" placeholder="Mật khẩu (ít nhất 6 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ padding:"13px 16px", borderRadius:"12px", border:"2px solid #e0e0e0", fontSize:"15px", outline:"none", fontFamily:"inherit" }}
              onFocus={e=>e.target.style.borderColor="#1565c0"} onBlur={e=>e.target.style.borderColor="#e0e0e0"} />
            <button type="submit" disabled={loading}
              style={{ padding:"14px", fontSize:"16px", background:loading?"#9e9e9e":"linear-gradient(135deg,#1565c0,#1976d2)", color:"white", borderRadius:"12px", border:"none", cursor:loading?"not-allowed":"pointer", fontWeight:"bold", marginTop:"4px", fontFamily:"inherit", boxShadow:loading?"none":"0 4px 14px rgba(21,101,192,0.4)" }}>
              {loading ? "⏳ Đang xử lý..." : (isLoginMode ? "🚀 Vào Học Ngay" : "✅ Đăng Ký")}
            </button>
          </form>
          <p style={{ margin:"18px 0 0 0", fontSize:"14px", color:"#888", textAlign:"center" }}>
            {isLoginMode ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <span onClick={() => { playSound("click"); setIsLoginMode(!isLoginMode); setError(""); }} style={{ color:"#1565c0", cursor:"pointer", fontWeight:"bold" }}>
              {isLoginMode ? "Đăng ký ngay →" : "Đăng nhập →"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

// --- COMPONENT: CÀI ĐẶT CHUNG TẤT CẢ CÁC MODE ---
function QuizSettings({ mode, onStart, onBack, customWordsCount = 0, customGrammarNotes = [] }) {
  const modeName = mode === "vocab" ? "Từ Vựng" : mode === "collocation" ? "Collocation" : "Ngữ Pháp (AI)";
  const storageKey = `toeic_${mode}_settings`;
  const primaryColor = mode === "vocab" ? "#4CAF50" : mode === "collocation" ? "#9C27B0" : "#2196F3";

  const [settings, setSettings] = useState(() => {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
          const parsedSettings = JSON.parse(saved);
          
          // ĐÃ FIX: Khóa an toàn, không cho Ngữ pháp dùng Level 0 (Flashcard)
          let diffLevel = parsedSettings.difficultyLevel !== undefined ? parsedSettings.difficultyLevel : 1;
          
          return { ...parsedSettings, difficultyLevel: diffLevel, toeicPart: parsedSettings.toeicPart || "part5", dataSource: parsedSettings.dataSource || "default" }; 
      }
      return { quizLimit: mode === "grammar" ? 5 : 30, timePerQuestion: mode === "grammar" ? 30 : 10, requiredStreak: 3, difficultyLevel: 1, survivalLives: 3, timeAttackSeconds: mode === "grammar" ? 60 : 30, toeicPart: "part5", dataSource: "default" };
    });

  // THÊM: Tính toán min/max tự động cho thanh kéo
  let dynamicMin = mode === "grammar" ? 1 : 5;
  let dynamicMax = mode === "grammar" ? 20 : (settings.difficultyLevel === 0 ? 20 : 100);
  
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

  const modeGrad = mode==="vocab" ? "linear-gradient(135deg,#2e7d32,#43a047)" : mode==="collocation" ? "linear-gradient(135deg,#6a1b9a,#8e24aa)" : "linear-gradient(135deg,#1565c0,#1e88e5)";
  const modeIcon = mode==="vocab" ? "🚀" : mode==="collocation" ? "📚" : "🤖";
  const levelColor = settings.difficultyLevel === 0 ? "#9C27B0" : settings.difficultyLevel === 1 ? primaryColor : settings.difficultyLevel === 2 ? "#FF9800" : settings.difficultyLevel === 3 ? "#E91E63" : "#F44336";
  const levelName = settings.difficultyLevel === 0 ? (mode === "grammar" ? "Tự Do ⏳" : "Flashcard 🎴") : settings.difficultyLevel === 1 ? "Cơ Bản" : settings.difficultyLevel === 2 ? "Đa Dạng" : settings.difficultyLevel === 3 ? "Sinh Tồn ❤️" : "Time Attack ⏱️";

  const cardStyle = {
    backgroundColor: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(12px)",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.9)",
    padding: "14px 16px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
  };
  const labelStyle = { fontWeight: "700", color: "#374151", fontSize: "13px", display: "block", marginBottom: "10px", letterSpacing: "0.3px" };
  const radioCardBase = { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "9px 12px", borderRadius: "10px", border: "2px solid transparent", transition: "all 0.15s", fontSize: "13px", color: "#374151", marginBottom: "6px" };

  return (
    <div style={{ position: "fixed", inset: 0, background: `linear-gradient(135deg, ${mode==="vocab"?"#e8f5e9,#f1f8e9":mode==="collocation"?"#f3e5f5,#ede7f6":"#e3f2fd,#e8eaf6"})`, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "inherit" }}>
      
      {/* TOPBAR */}
      <div style={{ background: modeGrad, padding: "0 20px", height: "54px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 2px 16px rgba(0,0,0,0.18)" }}>
        <button onClick={() => { playSound("click"); onBack(); }} style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "white", borderRadius: "10px", padding: "6px 14px", cursor: "pointer", fontWeight: "bold", fontSize: "13px", fontFamily: "inherit" }}>← Trở về</button>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px" }}>{modeIcon}</span>
          <span style={{ color: "white", fontWeight: "900", fontSize: "17px" }}>Cài Đặt {modeName}</span>
        </div>
        <button onClick={handleStart} style={{ background: "rgba(255,255,255,0.22)", border: "2px solid rgba(255,255,255,0.5)", color: "white", borderRadius: "10px", padding: "6px 18px", cursor: "pointer", fontWeight: "900", fontSize: "14px", fontFamily: "inherit", letterSpacing: "0.5px" }}>
          🚀 Bắt đầu!
        </button>
      </div>

      {/* BODY — 2 CỘT */}
      <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", padding: "14px 16px", minHeight: 0 }}>
        
        {/* CỘT TRÁI */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>

          {/* NGUỒN DỮ LIỆU */}
          {mode === "vocab" && (
            <div style={cardStyle}>
              <span style={labelStyle}>📂 Nguồn dữ liệu</span>
              <label style={{ ...radioCardBase, background: settings.dataSource === "default" ? `${primaryColor}15` : "#f9fafb", border: `2px solid ${settings.dataSource === "default" ? primaryColor : "transparent"}` }}>
                <input type="radio" name="dataSource" value="default" checked={settings.dataSource === "default"} onChange={(e) => setSettings({...settings, dataSource: e.target.value})} style={{ accentColor: primaryColor }} />
                <div><strong style={{ color: primaryColor }}>Default</strong> — Trộn ngẫu nhiên (80% mới, 20% cũ)</div>
              </label>
              <label style={{ ...radioCardBase, background: settings.dataSource === "custom" ? `${primaryColor}15` : "#f9fafb", border: `2px solid ${settings.dataSource === "custom" ? primaryColor : "transparent"}`, marginBottom: 0 }}>
                <input type="radio" name="dataSource" value="custom" checked={settings.dataSource === "custom"} onChange={(e) => setSettings({...settings, dataSource: e.target.value})} style={{ accentColor: primaryColor }} />
                <div><strong style={{ color: primaryColor }}>Sổ Tay</strong> — Ôn lại các từ đã Ghim và Làm sai</div>
              </label>
            </div>
          )}

          {mode === "grammar" && (
            <div style={cardStyle}>
              <span style={labelStyle}>📂 Nguồn ngữ pháp</span>
              <label style={{ ...radioCardBase, background: settings.grammarSource === "default" ? "#e3f2fd" : "#f9fafb", border: `2px solid ${settings.grammarSource === "default" ? "#1565c0" : "transparent"}` }}>
                <input type="radio" name="grammarSource" value="default" checked={settings.grammarSource === "default"} onChange={(e) => setSettings({...settings, grammarSource: e.target.value, selectedNoteId: null})} style={{ accentColor: "#1565c0" }} />
                <div><strong style={{ color: "#1565c0" }}>Default</strong> — AI tạo câu hỏi ngẫu nhiên</div>
              </label>
              <label style={{ ...radioCardBase, background: settings.grammarSource === "custom" ? "#e3f2fd" : "#f9fafb", border: `2px solid ${settings.grammarSource === "custom" ? "#1565c0" : "transparent"}`, marginBottom: settings.grammarSource === "custom" ? "10px" : 0 }}>
                <input type="radio" name="grammarSource" value="custom" checked={settings.grammarSource === "custom"} onChange={(e) => setSettings({...settings, grammarSource: e.target.value})} style={{ accentColor: "#1565c0" }} />
                <div><strong style={{ color: "#1565c0" }}>File Word của tôi</strong> — Ôn có chủ đích</div>
              </label>
              {settings.grammarSource === "custom" && customGrammarNotes.length > 0 && (
                <select value={settings.selectedNoteId || ""} onChange={(e) => setSettings({...settings, selectedNoteId: e.target.value})} style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1.5px solid #90caf9", fontSize: "13px", fontFamily: "inherit" }}>
                  <option value="">-- Chọn file --</option>
                  {customGrammarNotes.map(note => <option key={note.id} value={note.id}>{note.filename} ({new Date(note.uploadedAt).toLocaleDateString('vi-VN')})</option>)}
                </select>
              )}
              {settings.grammarSource === "custom" && customGrammarNotes.length === 0 && (
                <p style={{ color: "#d32f2f", fontSize: "12px", margin: "4px 0 0 0" }}>Chưa có file. Hãy upload ở Sổ Tay → Ngữ Pháp.</p>
              )}
            </div>
          )}

          {/* LEVEL */}
          <div style={{ ...cardStyle, borderLeft: `4px solid ${levelColor}` }}>
            <span style={labelStyle}>🔥 Độ khó — <span style={{ color: levelColor, fontWeight: "900" }}>Level {settings.difficultyLevel}: {levelName}</span></span>
            <input type="range" min="0" max="4" step="1" value={settings.difficultyLevel} onChange={(e) => setSettings({...settings, difficultyLevel: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer", accentColor: levelColor }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
              {["🎴","⭐","🌀","❤️","⏱️"].map((ic, i) => (
                <span key={i} style={{ fontSize: "16px", opacity: settings.difficultyLevel === i ? 1 : 0.3, transition: "opacity 0.2s" }}>{ic}</span>
              ))}
            </div>
          </div>

          {/* LEVEL 4 — TIME ATTACK */}
          {settings.difficultyLevel === 4 && (
            <div style={cardStyle}>
              <span style={labelStyle}>⏱️ Thời gian bắt đầu: <span style={{ color: "#F44336", fontWeight: "900" }}>{settings.timeAttackSeconds}s</span></span>
              <input type="range" min="10" max="120" step="5" value={settings.timeAttackSeconds} onChange={(e) => setSettings({...settings, timeAttackSeconds: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer", accentColor: "#F44336" }} />
            </div>
          )}

        </div>

        {/* CỘT PHẢI */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>

          {/* LEVEL 3 — SINH TỒN */}
          {settings.difficultyLevel === 3 && (
            <>
              {mode !== "grammar" && (
                <div style={cardStyle}>
                  <span style={labelStyle}>🎮 Chế độ chơi</span>
                  <label style={{ ...radioCardBase, background: !settings.blastMode ? "#fce4ec" : "#f9fafb", border: `2px solid ${!settings.blastMode ? "#E91E63" : "transparent"}` }}>
                    <input type="radio" name="blastMode" value="classic" checked={!settings.blastMode} onChange={() => setSettings({...settings, blastMode: false})} style={{ accentColor: "#E91E63" }} />
                    <div><strong style={{ color: "#880e4f" }}>🗡️ Cổ điển</strong> — Trắc nghiệm + gõ từ + Boss</div>
                  </label>
                  <label style={{ ...radioCardBase, background: !!settings.blastMode ? "#fce4ec" : "#f9fafb", border: `2px solid ${!!settings.blastMode ? "#E91E63" : "transparent"}`, marginBottom: 0 }}>
                    <input type="radio" name="blastMode" value="blast" checked={!!settings.blastMode} onChange={() => setSettings({...settings, blastMode: true})} style={{ accentColor: "#E91E63" }} />
                    <div><strong style={{ color: "#880e4f" }}>🔫 Bắn Từ</strong> — Bắn đúng nghĩa từ vựng</div>
                  </label>
                </div>
              )}
              <div style={cardStyle}>
                <span style={labelStyle}>❤️ Số mạng sinh tồn: <span style={{ color: "#E91E63", fontWeight: "900" }}>{settings.survivalLives} mạng</span></span>
                <input type="range" min="1" max="10" step="1" value={settings.survivalLives} onChange={(e) => setSettings({...settings, survivalLives: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer", accentColor: "#E91E63" }} />
              </div>
            </>
          )}

          {/* LEVEL 0–2 */}
          {settings.difficultyLevel <= 2 && (
            <>
              {(mode !== "grammar" || (settings.toeicPart !== "part6" && settings.toeicPart !== "part7")) && (
                <div style={cardStyle}>
                  <span style={labelStyle}>📚 Số câu mỗi lượt: <span style={{ color: primaryColor, fontWeight: "900" }}>{settings.quizLimit} câu</span></span>
                  <input type="range" min={dynamicMin} max={dynamicMax} step={mode==="grammar" ? 1 : (mode==="vocab" && settings.dataSource==="custom" ? 1 : 5)} value={settings.quizLimit} onChange={(e) => setSettings({...settings, quizLimit: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer", accentColor: primaryColor }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}><span>{dynamicMin}</span><span>{dynamicMax}</span></div>
                </div>
              )}

              {settings.difficultyLevel !== 0 && (
                <div style={cardStyle}>
                  <span style={labelStyle}>⏱️ Thời gian / câu: <span style={{ color: "#FF9800", fontWeight: "900" }}>{settings.timePerQuestion}s</span></span>
                  <input type="range" min="3" max="60" step="1" value={settings.timePerQuestion} onChange={(e) => setSettings({...settings, timePerQuestion: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer", accentColor: "#FF9800" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}><span>3s</span><span>60s</span></div>
                </div>
              )}

              {settings.difficultyLevel !== 0 && (
                <div style={cardStyle}>
                  <span style={labelStyle}>🔓 Streak mở khóa nút Quay lại: <span style={{ color: "#2196F3", fontWeight: "900" }}>{settings.requiredStreak} câu</span></span>
                  <input type="range" min="1" max="10" step="1" value={settings.requiredStreak} onChange={(e) => setSettings({...settings, requiredStreak: parseInt(e.target.value)})} style={{ width: "100%", cursor: "pointer", accentColor: "#2196F3" }} />
                </div>
              )}
            </>
          )}

          {/* NÚT BẮT ĐẦU (to, nổi bật) */}
          <div style={{ marginTop: "auto" }}>
            <button onClick={handleStart} style={{ width: "100%", padding: "15px", fontSize: "17px", background: modeGrad, color: "white", borderRadius: "14px", border: "none", cursor: "pointer", fontWeight: "900", boxShadow: "0 6px 20px rgba(0,0,0,0.2)", fontFamily: "inherit", letterSpacing: "0.5px" }}>
              🚀 Bắt đầu Học!
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// --- COMPONENT: BLAST GAME (BẮN TỪ VỰNG - BOSS MINI-GAME) ---
// --- COMPONENT: BLAST GAME (BẮN TỪ VỰNG - BOSS MINI-GAME) ---
function BlastGame({ words, onWin, onBack, initialLives = 3 }) {
  const questions = useMemo(() => [...words].sort(() => Math.random() - 0.5), []);
  const [qIdx, setQIdx] = useState(0);
  const [targets, setTargets] = useState([]);
  const [shooting, setShooting] = useState(false);
  const [bulletTrail, setBulletTrail] = useState(null);
  const [hitIdx, setHitIdx] = useState(null);
  const [missIdx, setMissIdx] = useState(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(initialLives);
  const [gameOver, setGameOver] = useState(false);
  const [blastStreak, setBlastStreak] = useState(0);
  const [showResult, setShowResult] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const areaRef = useRef(null);
  const animFrameRef = useRef(null);
  const scoreRef = useRef(0);
  const qIdxRef = useRef(0);

  const currentQ = questions[qIdx];
  const vietnameseMeaning = currentQ
    ? (currentQ.meaning ||
        [currentQ.noun_meaning && `(n) ${currentQ.noun_meaning}`,
         currentQ.verb_meaning && `(v) ${currentQ.verb_meaning}`,
         currentQ.adj_meaning && `(adj) ${currentQ.adj_meaning}`]
        .filter(Boolean).join(" / ") || "?")
    : "?";

  const cannonDeg = useMemo(() => {
    const dx = mousePos.x - 50;
    const dy = 87 - mousePos.y;
    const angle = Math.atan2(dx, Math.max(dy, 1)) * (180 / Math.PI);
    return Math.min(Math.max(angle, -55), 55);
  }, [mousePos]);

  const barrelLen = 8.5;
  const rad = cannonDeg * Math.PI / 180;
  const barrelTipX = 50 + Math.sin(rad) * barrelLen * 0.5;
  const barrelTipY = 87 - Math.cos(rad) * barrelLen;

  const handleMouseMove = (e) => {
    if (!areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x: Math.min(Math.max(x, 0), 100), y: Math.min(Math.max(y, 0), 100) });
  };

  useEffect(() => {
    const q = questions[qIdx];
    if (!q) return;
    cancelAnimationFrame(animFrameRef.current);
    const others = words.filter(w => w.word !== q.word);
    const wrongs = [...others].sort(() => Math.random() - 0.5).slice(0, 3);
    const pool = [...wrongs, q].sort(() => Math.random() - 0.5);
    const usedX = [];
    const fresh = pool.map((opt, i) => {
      let x, tries = 0;
      do { x = 12 + Math.random() * 68; tries++; }
      while (usedX.some(px => Math.abs(px - x) < 26) && tries < 30);
      usedX.push(x);
      return { ...opt, _x: x, _y: -(18 + i * 28), _speed: 0.1 + Math.random() * 0.05, _key: Math.random() };
    });
    setTargets(fresh);
    setHitIdx(null); setMissIdx(null); setShooting(false);
    setBulletTrail(null); setShowResult(null);
  }, [qIdx]);

  useEffect(() => {
    if (gameOver) return;
    let running = true;
    const q = questions[qIdxRef.current];
    const tick = () => {
      if (!running) return;
      setTargets(prev => {
        const next = prev.map(t => ({ ...t, _y: t._y + t._speed }));
        const fallen = next.find(t => t._y > 96 && t.word === q?.word);
        if (fallen && running) {
          running = false;
          setLives(l => { const nl = l - 1; if (nl <= 0) setGameOver(true); return nl; });
          setShowResult("miss");
          setTimeout(() => {
            const ni = qIdxRef.current + 1;
            qIdxRef.current = ni;
            setQIdx(ni % questions.length);
            setShowResult(null);
          }, 1000);
        }
        return next;
      });
      if (running) animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [qIdx, gameOver]);

  const handleShoot = (opt, idx) => {
    if (shooting || showResult || gameOver) return;
    const q = questions[qIdxRef.current];
    setShooting(true);
    setBulletTrail({ x1: 50, y1: 87, x2: opt._x, y2: Math.max(opt._y + 2, 5) });
    setTimeout(() => setBulletTrail(null), 320);
    setTimeout(() => {
      if (opt.word === q?.word) {
        setHitIdx(idx); setShowResult("hit");
        playSound("combo_1");
        scoreRef.current += 1; setScore(scoreRef.current);
        setBlastStreak(s => s + 1);
        if (scoreRef.current >= questions.length) {
          setTimeout(() => { confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 }); playSound("combo_max"); onWin(); }, 700);
          return;
        }
        setTimeout(() => { const ni = qIdxRef.current + 1; qIdxRef.current = ni; setQIdx(ni % questions.length); }, 800);
      } else {
        setMissIdx(idx); setShowResult("miss"); setBlastStreak(0); playSound("wrong");
        setLives(l => { const nl = l - 1; if (nl <= 0) setGameOver(true); return nl; });
        setTimeout(() => { setShowResult(null); setShooting(false); setMissIdx(null); }, 900);
      }
    }, 350);
  };

  const handleRestart = () => {
    cancelAnimationFrame(animFrameRef.current);
    scoreRef.current = 0; qIdxRef.current = 0;
    setQIdx(0); setScore(0); setLives(initialLives); setGameOver(false);
    setShowResult(null); setBlastStreak(0); setShooting(false); setBulletTrail(null);
  };

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <button onClick={onBack} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #ccc", backgroundColor: "#f5f5f5", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}>← Đổi game</button>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ fontWeight: "bold", color: "#2196F3" }}>🎯 {score}/{questions.length}</span>
          <span>{Array.from({ length: 3 }, (_, i) => i < lives ? "❤️" : "🖤").join("")}</span>
          {blastStreak >= 2 && <span style={{ fontWeight: "bold", color: "#FF9800", fontSize: "13px" }}>🔥×{blastStreak}</span>}
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: "10px", padding: "12px 16px", background: "linear-gradient(135deg, #1a237e 0%, #283593 100%)", borderRadius: "12px", color: "white" }}>
        <div style={{ fontSize: "11px", letterSpacing: "2px", opacity: 0.7, textTransform: "uppercase", marginBottom: "4px" }}>▶ FIND THE WORD</div>
        <div style={{ fontSize: "24px", fontWeight: "900" }}>{vietnameseMeaning}</div>
      </div>

      <div ref={areaRef} onMouseMove={handleMouseMove}
        style={{ position: "relative", width: "100%", height: "340px", background: "linear-gradient(180deg, #0d1b3e 0%, #1a237e 40%, #0a3d62 75%, #01579b 100%)", borderRadius: "12px", overflow: "hidden", border: "2px solid #283593", cursor: "crosshair" }}>

        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07, pointerEvents: "none" }} xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={`${i*10}%`} y1="0" x2={`${i*10}%`} y2="100%" stroke="#00bcd4" strokeWidth="1"/>)}
          {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="0" y1={`${i*12.5}%`} x2="100%" y2={`${i*12.5}%`} stroke="#00bcd4" strokeWidth="1"/>)}
        </svg>

        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 18 }} xmlns="http://www.w3.org/2000/svg">
          <line x1={`${barrelTipX}%`} y1={`${barrelTipY}%`} x2={`${mousePos.x}%`} y2={`${mousePos.y}%`}
            stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" strokeDasharray="6 5"/>
          <circle cx={`${mousePos.x}%`} cy={`${mousePos.y}%`} r="10" stroke="#00e5ff" strokeWidth="1.5" fill="none" opacity="0.85"/>
          <circle cx={`${mousePos.x}%`} cy={`${mousePos.y}%`} r="2" fill="#00e5ff" opacity="0.9"/>
          <line x1={`${mousePos.x - 1.8}%`} y1={`${mousePos.y}%`} x2={`${mousePos.x + 1.8}%`} y2={`${mousePos.y}%`} stroke="#00e5ff" strokeWidth="1.5" opacity="0.9"/>
          <line x1={`${mousePos.x}%`} y1={`${mousePos.y - 3.5}%`} x2={`${mousePos.x}%`} y2={`${mousePos.y + 3.5}%`} stroke="#00e5ff" strokeWidth="1.5" opacity="0.9"/>
          {bulletTrail && (<>
            <line x1={`${bulletTrail.x1}%`} y1={`${bulletTrail.y1}%`} x2={`${bulletTrail.x2}%`} y2={`${bulletTrail.y2}%`}
              stroke="#00e5ff" strokeWidth="3" opacity="0.95" style={{ filter: "drop-shadow(0 0 5px #00e5ff)" }}/>
            <circle cx={`${bulletTrail.x2}%`} cy={`${bulletTrail.y2}%`} r="7" fill="#00e5ff" opacity="1" style={{ filter: "drop-shadow(0 0 10px #00e5ff)" }}/>
          </>)}
        </svg>

        {targets.map((opt, idx) => {
          const isHit = hitIdx === idx, isMiss = missIdx === idx;
          return (
            <button key={opt._key || idx} onClick={() => handleShoot(opt, idx)}
              disabled={shooting || !!showResult || gameOver}
              style={{
                position: "absolute", left: `${opt._x}%`, top: `${Math.max(opt._y, -10)}%`,
                transform: "translateX(-50%)", padding: "7px 14px", borderRadius: "20px",
                fontWeight: "bold", fontSize: "13px", cursor: "crosshair", fontFamily: "inherit",
                whiteSpace: "nowrap", maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", zIndex: 10,
                border: isHit ? "2px solid #4CAF50" : isMiss ? "2px solid #F44336" : "2px solid rgba(0,188,212,0.6)",
                backgroundColor: isHit ? "#4CAF50" : isMiss ? "#F44336" : "rgba(13,27,62,0.9)",
                color: isHit || isMiss ? "white" : "#00e5ff",
                boxShadow: isHit ? "0 0 18px #4CAF50" : isMiss ? "0 0 18px #F44336" : "0 0 8px rgba(0,188,212,0.3)",
                opacity: opt._y < -8 ? 0 : 1, transition: "opacity 0.2s",
              }}>
              {opt.cleanWord || opt.word}
            </button>
          );
        })}

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "46px", background: "linear-gradient(180deg, rgba(1,87,155,0.5) 0%, rgba(1,87,155,0.95) 100%)", borderTop: "2px solid rgba(0,188,212,0.4)", zIndex: 12 }}/>

        <div style={{ position: "absolute", bottom: "6px", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 15 }}>
          <div style={{ width: "14px", height: "30px", backgroundColor: "#00bcd4", borderRadius: "7px 7px 3px 3px", transform: `rotate(${cannonDeg}deg)`, transformOrigin: "bottom center", boxShadow: "0 0 10px rgba(0,188,212,0.8)" }}/>
          <div style={{ width: "34px", height: "20px", backgroundColor: "#0288d1", borderRadius: "6px", marginTop: "-4px", boxShadow: "0 0 6px rgba(2,136,209,0.6)" }}/>
        </div>

        {showResult && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: showResult === "hit" ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)", zIndex: 30, pointerEvents: "none" }}>
            <span style={{ fontSize: "56px" }}>{showResult === "hit" ? "✅" : "💥"}</span>
          </div>
        )}

        {gameOver && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.82)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 40, borderRadius: "10px" }}>
            <div style={{ fontSize: "52px" }}>💀</div>
            <h3 style={{ color: "white", margin: "8px 0 4px" }}>Game Over!</h3>
            <p style={{ color: "#aaa", marginBottom: "20px" }}>Đã bắn đúng {score}/{questions.length} từ</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={onBack} style={{ padding: "10px 20px", backgroundColor: "#555", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>← Đổi game</button>
              <button onClick={handleRestart} style={{ padding: "10px 20px", backgroundColor: "#E91E63", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>🔄 Chơi lại</button>
            </div>
          </div>
        )}
      </div>
      <p style={{ textAlign: "center", color: "#888", fontSize: "12px", marginTop: "8px" }}>🖱️ Di chuột để ngắm — Click từ để bắn!</p>
    </div>
  );
}

// --- COMPONENT: WRAPPER LOAD DATA CHO BẮN TỪ Ở LEVEL 3 ---
function BlastGameScreen({ mode, onBack, settings, stats }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const SHEET_ID = "1nAdOxZBZ3-Bawh3Ks54KaIYLPgGZfTuchebwbCYW8dU";
        const SHEET_NAME = mode === "vocab" ? "Vocab" : "Collocation";
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${SHEET_NAME}`;
        const response = await fetch(url);
        const text = await response.text();
        const jsonString = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
        const result = JSON.parse(jsonString);
        const headers = result.table.cols.map(col => col.label ? col.label.toLowerCase().trim() : "");
        let fullData = result.table.rows.map(row => {
          let obj = {};
          headers.forEach((header, index) => {
            obj[header] = (row.c[index] && row.c[index].v) ? row.c[index].v.toString() : "";
          });
          return obj;
        });
        const personalDictionary = stats?.addedWordsObj || [];
        if (personalDictionary.length > 0) {
          const existingWords = new Set(fullData.map(item => item.word.toLowerCase()));
          const uniqueAiWords = personalDictionary.filter(item => !existingWords.has(item.word.toLowerCase()));
          fullData = [...fullData, ...uniqueAiWords];
        }
        let sourceData = fullData;
        if (settings.dataSource === "custom") {
          const customWordSet = new Set([...(stats?.savedWords||[]), ...(stats?.wrongWords||[]), ...(stats?.masteredWords||[])].map(w => w.toLowerCase().trim()));
          sourceData = fullData.filter(item => item.word && customWordSet.has(item.word.toLowerCase().trim()));
        }
        const shuffled = shuffleArray(sourceData).slice(0, 30);
        setWords(shuffled.filter(item => item.word));
      } catch (e) { console.error("Lỗi load BlastGame:", e); }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className="container" style={{ textAlign: "center", paddingTop: "80px" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔫</div>
      <h2 style={{ color: "#880e4f" }}>Đang tải đạn dược...</h2>
      <p style={{ color: "#aaa" }}>Chuẩn bị chiến trường bắn từ!</p>
    </div>
  );

  if (words.length < 4) return (
    <div className="container" style={{ textAlign: "center", paddingTop: "80px" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>😅</div>
      <h2 style={{ color: "#e53935" }}>Không đủ từ để chơi!</h2>
      <p style={{ color: "#555" }}>Cần ít nhất 4 từ. Hãy thử nguồn "Default" hoặc thêm từ vào Sổ tay.</p>
      <button onClick={onBack} style={{ marginTop: "20px", padding: "12px 24px", backgroundColor: "#E91E63", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>← Quay lại</button>
    </div>
  );

  return (
    <div className="container">
      <BlastGame words={words} onWin={() => { confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 }); onBack(); }} onBack={onBack} initialLives={settings.survivalLives || 3} />
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
  const [bossGameChoice, setBossGameChoice] = useState(null);

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
          if (!window.globalCachedModel) {
              const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
              const listData = await listRes.json();
              const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
              const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
              window.globalCachedModel = flashModel ? flashModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
          }

          const prompt = `Giải thích ngắn gọn ý nghĩa của từ tiếng Anh "${keyword}" bằng tiếng Việt. Cung cấp phiên âm, từ loại, nghĩa chính và 1 ví dụ thực tế. Giữ nội dung xúc tích dưới 4 dòng.`;
          
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${API_KEY}`;
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

          // Độ dài từ khóa = đúng bằng số từ đang học (QUIZ_LIMIT), giới hạn 5-15
          const maxPossibleLen = Math.min(availableWords.length, 20);
          const targetRandomLen = Math.max(5, Math.min(QUIZ_LIMIT, maxPossibleLen));

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
                  if (!window.globalCachedModel) {
                      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`, { signal: controller.signal });
                      const listData = await listRes.json();
                      const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
                      const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
                      window.globalCachedModel = flashModel ? flashModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
                  }

                  // BƯỚC 2: Gọi AI bằng Model tự động
                  const prompt = `Tôi vừa học các từ vựng tiếng Anh sau: ${wordListStr}. Hãy nghĩ ra 10 từ khóa tiếng Anh bí mật khác nhau.
                  YÊU CẦU BẮT BUỘC:
                  - Độ dài mỗi từ khóa phải đúng ${targetRandomLen} chữ cái.
                  - Từ khóa phải liên quan đến chủ đề chung của các từ vựng trên, hoặc mang ý nghĩa cổ vũ (như WIN, FOCUS, MASTER, SUCCESS).
                  - CHỈ TRẢ VỀ DANH SÁCH 10 TỪ, phân tách nhau bằng dấu phẩy (,). Không giải thích gì thêm, viết hoa toàn bộ.`;
                  
                  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${API_KEY}`;
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
          const fallbacks = ["WIN", "TOP", "PRO", "YES", "BEST", "GOOD", "FAST", "LEAD", "SMART", "GREAT", "FOCUS", "SUPER", "EXPERT", "MASTER", "WINNER", "GENIUS", "SUCCESS", "CHAMPION", "BRILLIANT","Dream", "Light", "Smile", "Brave", "Peace", "Future", "Beauty", "Spirit", "Strong", "Wisdom", "Success", "Freedom", "Passion", "Believe", "Journey", "Happiness", "Adventure", "Brilliant", "Confidence", "Motivation", "Creativity", "Inspiration", "Determination", "Perseverance", "Understanding", "Communication", "Imagination", "Responsibility", "Extraordinary", "Internationalization","Counterintelligence", "Hypercommunication", "Electroencephalogram", "Internationalization", "Counterrevolutionary","Characterization", "Misunderstanding", "Overachievement", "Interconnection", "Hyperactivation","Motivation", "Creativity", "Confidence", "Leadership", "Innovation","Dream", "Light", "Smile", "Brave", "Peace"];
          
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
            
            // ✅ SỬA LẠI
            const originalItem = newData[current];
            const penaltyItem = { ...originalItem };
            if (originalItem.options) {
                const shuffledOptions = shuffleArray([...originalItem.options]);
                penaltyItem.options = shuffledOptions;
                // Giữ answer khớp với options sau shuffle
                penaltyItem.answer = originalItem.answer;
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
    setBossGameChoice(null);

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
  if (loadingData) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#f5f7fa,#e8edf5)", flexDirection:"column", gap:"16px" }}>
      <div style={{ fontSize:"52px" }}>{DIFFICULTY_LEVEL===0 ? "🎴" : "⏳"}</div>
      <h2 style={{ color:"#1a237e", margin:0 }}>{DIFFICULTY_LEVEL===0 ? "Đang chuẩn bị thẻ bài..." : "Đang tải dữ liệu..."}</h2>
    </div>
  );
}

if (questionsData.length === 0) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#f5f7fa,#e8edf5)", flexDirection:"column", gap:"16px", padding:"20px", textAlign:"center" }}>
      <div style={{ fontSize:"52px" }}>⚠️</div>
      <h2 style={{ color:"#d32f2f", margin:0 }}>Không tải được dữ liệu</h2>
      <p style={{ color:"#666", fontSize:"15px", maxWidth:"300px" }}>Kiểm tra kết nối mạng rồi thử lại nhé.</p>
      <button onClick={onBack} style={{ padding:"13px 28px", background:"linear-gradient(135deg,#1565c0,#1976d2)", color:"white", borderRadius:"12px", border:"none", cursor:"pointer", fontWeight:"bold", fontSize:"16px", fontFamily:"inherit" }}>← Quay lại</button>
    </div>
  );
}

  if (isGameOver || (DIFFICULTY_LEVEL < 3 && current >= questionsData.length)) {
    const isWin = DIFFICULTY_LEVEL < 3;
    const acc = current > 0 ? Math.round((score/current)*100) : 0;
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:isWin?"linear-gradient(135deg,#e8f5e9,#f1f8e9)":"linear-gradient(135deg,#ffebee,#fce4ec)", padding:"20px" }}>
        <div style={{ textAlign:"center", width:"100%", maxWidth:"380px" }}>
          <div style={{ fontSize:"64px", marginBottom:"12px" }}>{isWin ? "🎉" : "☠️"}</div>
          <h1 style={{ color:isWin?"#2e7d32":"#c62828", fontWeight:"900", fontSize:"28px", margin:"0 0 6px 0" }}>{isWin ? "Hoàn thành!" : "Game Over"}</h1>
          <p style={{ color:"#666", marginBottom:"24px" }}>{DIFFICULTY_LEVEL===3 ? `Sống sót qua ${score} câu!` : DIFFICULTY_LEVEL===4 ? `Tốc độ đúng ${score} câu!` : "Bạn đã ôn tập xong phiên này!"}</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"24px" }}>
            <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#4CAF50" }}>{score}</div>
              <div style={{ fontSize:"12px", color:"#888", marginTop:"2px" }}>✅ Câu đúng</div>
            </div>
            {isWin && <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#F44336" }}>{current-score}</div>
              <div style={{ fontSize:"12px", color:"#888", marginTop:"2px" }}>❌ Câu sai</div>
            </div>}
            <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#FF9800" }}>{acc}%</div>
              <div style={{ fontSize:"12px", color:"#888", marginTop:"2px" }}>🎯 Chính xác</div>
            </div>
            <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#2196F3" }}>{current}</div>
              <div style={{ fontSize:"12px", color:"#888", marginTop:"2px" }}>📊 Tổng câu</div>
            </div>
          </div>
          <button onClick={handleBackToHome} style={{ width:"100%", padding:"15px", background:isWin?"linear-gradient(135deg,#2e7d32,#43a047)":"linear-gradient(135deg,#c62828,#e53935)", color:"white", borderRadius:"14px", border:"none", cursor:"pointer", fontWeight:"bold", fontSize:"17px", fontFamily:"inherit", boxShadow:"0 6px 18px rgba(0,0,0,0.2)" }}>
            🏠 Về trang chủ
          </button>
        </div>
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
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#f5f7fa,#e8edf5)" }}>
    <div className="container" style={{ 
        maxWidth: (currentQ && currentQ.type === "crossword_boss") ? "750px" : "480px", 
        transition: "max-width 0.5s ease-in-out",
        paddingBottom:"40px"
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

          {/* === MÀN CHỌN GAME BOSS === */}
          {!bossGameChoice && (
            <div style={{ textAlign: "center", padding: "10px 0 24px 0" }}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}>⚔️</div>
              <h2 style={{ fontSize: "22px", color: "#b71c1c", fontWeight: "900", margin: "0 0 6px 0", textTransform: "uppercase" }}>Câu Boss Xuất Hiện!</h2>
              <p style={{ color: "#555", fontSize: "14px", marginBottom: "24px" }}>Chọn mini-game để vượt ải:</p>
              <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => { playSound("click"); setBossGameChoice("cross"); }}
                  style={{ width: "145px", padding: "20px 10px", borderRadius: "16px", border: "3px solid #1565c0", backgroundColor: "#e3f2fd", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", boxShadow: "0 4px 14px rgba(21,101,192,0.2)", fontFamily: "inherit", transition: "transform 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                  <span style={{ fontSize: "42px" }}>🧩</span>
                  <span style={{ fontWeight: "bold", color: "#1565c0", fontSize: "15px" }}>Ô Chữ</span>
                  <span style={{ fontSize: "11px", color: "#666", lineHeight: "1.4" }}>Điền từ tìm từ khóa bí ẩn</span>
                </button>
                <button onClick={() => { playSound("click"); setBossGameChoice("blast"); }}
                  style={{ width: "145px", padding: "20px 10px", borderRadius: "16px", border: "3px solid #880e4f", backgroundColor: "#fce4ec", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", boxShadow: "0 4px 14px rgba(136,14,79,0.2)", fontFamily: "inherit", transition: "transform 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                  <span style={{ fontSize: "42px" }}>🔫</span>
                  <span style={{ fontWeight: "bold", color: "#880e4f", fontSize: "15px" }}>Bắn Từ</span>
                  <span style={{ fontSize: "11px", color: "#666", lineHeight: "1.4" }}>Bắn đúng nghĩa từ vựng</span>
                </button>
              </div>
            </div>
          )}

          {/* === GAME 1: Ô CHỮ === */}
          {bossGameChoice === "cross" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <button onClick={() => setBossGameChoice(null)} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #ccc", backgroundColor: "#f5f5f5", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}>← Đổi game</button>
                <h2 style={{ fontSize: "18px", color: "#2c3e50", margin: 0, textTransform: "uppercase" }}>🧩 Vượt Ải Ô Chữ</h2>
              </div>
              <p style={{ color: "#F44336", textAlign: "center", marginBottom: "20px", fontWeight: "bold", fontSize: "14px" }}>Điền từ để tìm TỪ KHÓA BÍ ẨN dọc màu cam!</p>

              <div style={{ display: "flex", flexDirection: currentQ.isVerticalKeyword ? "column" : "row", gap: "6px", justifyContent: "center", alignItems: "center", marginBottom: "30px", padding: "20px", backgroundColor: "#f0f8ff", borderRadius: "12px", overflowX: "auto" }}>
                {currentQ.words.map((item, idx) => {
                  const userInput = (crosswordInputs[idx] || "").toLowerCase();
                  const maxShift = Math.max(...currentQ.words.map(w => w.alignIdx));
                  const marginBoxes = maxShift - item.alignIdx;
                  const isCorrectWord = userInput.trim() === item.cleanWord.toLowerCase().trim();
                  return (
                    <div key={`grid-${idx}`} style={{ display: 'flex', flexDirection: currentQ.isVerticalKeyword ? "row" : "column", marginLeft: currentQ.isVerticalKeyword ? `${marginBoxes * 32}px` : "0", marginTop: !currentQ.isVerticalKeyword ? `${marginBoxes * 32}px` : "0", alignSelf: "flex-start" }}>
                      {item.cleanWord.split('').map((char, charIdx) => {
                        const isKeywordChar = charIdx === item.alignIdx;
                        const userChar = userInput[charIdx] || "";
                        return (
                          <div key={`cell-${idx}-${charIdx}`} style={{ width: '28px', height: '28px', margin: currentQ.isVerticalKeyword ? "0 2px" : "2px 0", border: isCorrectWord ? '2px solid #4CAF50' : (isKeywordChar ? '2px solid #FF9800' : '1px solid #ccc'), backgroundColor: isKeywordChar ? '#ffe0b2' : (isCorrectWord ? '#e8f5e9' : '#fff'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '15px', color: isKeywordChar ? "#e65100" : "#333", boxShadow: isKeywordChar ? "0 0 8px rgba(255, 152, 0, 0.6)" : "none", zIndex: isKeywordChar ? 2 : 1 }}>
                            {userChar}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {currentQ.words.map((item, idx) => {
                  const isCorrect = (crosswordInputs[idx] || "").toLowerCase().trim() === item.cleanWord.toLowerCase().trim();
                  return (
                    <div key={`input-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px", backgroundColor: isCorrect ? "#e8f5e9" : "#fff", borderRadius: "8px", border: isCorrect ? "2px solid #4CAF50" : "1px solid #ddd" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: isCorrect ? "#4CAF50" : "#2196F3", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", flexShrink: 0, marginTop: "2px" }}>{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", fontWeight: "bold", color: "#444", marginBottom: "6px", lineHeight: "1.4" }}>
                          {item.meaning || [item.noun_meaning && `(n) ${item.noun_meaning}`, item.verb_meaning && `(v) ${item.verb_meaning}`, item.adj_meaning && `(adj) ${item.adj_meaning}`].filter(Boolean).join(" · ") || "❓ Không có gợi ý"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            ref={(el) => bossInputRefs.current[idx] = el}
                            type="text" value={crosswordInputs[idx] || ""}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^a-zA-Z\s-]/g, '');
                              setCrosswordInputs({...crosswordInputs, [idx]: val});
                              if (val.toLowerCase().trim() === item.cleanWord.toLowerCase().trim()) {
                                let nextIdx = -1;
                                for (let i = idx + 1; i < currentQ.words.length; i++) {
                                  if ((crosswordInputs[i] || "").toLowerCase().trim() !== currentQ.words[i].cleanWord.toLowerCase().trim()) { nextIdx = i; break; }
                                }
                                if (nextIdx === -1) {
                                  for (let i = 0; i < idx; i++) {
                                    if ((crosswordInputs[i] || "").toLowerCase().trim() !== currentQ.words[i].cleanWord.toLowerCase().trim()) { nextIdx = i; break; }
                                  }
                                }
                                if (nextIdx !== -1 && bossInputRefs.current[nextIdx]) setTimeout(() => bossInputRefs.current[nextIdx].focus(), 50);
                              }
                            }}
                            disabled={isCorrect} maxLength={item.cleanWord.length}
                            placeholder={`${item.cleanWord.length} CHỮ CÁI...`}
                            style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #ccc", textTransform: "uppercase", outline: "none", backgroundColor: isCorrect ? "#c8e6c9" : "#f9f9f9", fontWeight: "bold", fontSize: "15px", letterSpacing: "1px", minWidth: "0" }}
                          />
                          {!isCorrect ? (
                            <button onClick={() => handleBossHint(idx, item.cleanWord)} style={{ padding: "10px", backgroundColor: "#FF9800", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", flexShrink: 0 }} title="Nhận gợi ý">💡</button>
                          ) : bossMastered[idx] ? (
                            <span style={{ padding: "10px 0", color: "#2e7d32", fontWeight: "bold", fontSize: "14px", whiteSpace: "nowrap", flexShrink: 0 }}>✅ Đã lưu</span>
                          ) : (
                            <button onClick={() => { playSound("click"); onMoveWord(mode, "savedWords", "masteredWords", item.word); setBossMastered({...bossMastered, [idx]: true}); }}
                              disabled={bossHinted[idx]}
                              style={{ padding: "10px 12px", backgroundColor: bossHinted[idx] ? "#9e9e9e" : "#4CAF50", color: "white", border: "none", borderRadius: "6px", cursor: bossHinted[idx] ? "not-allowed" : "pointer", fontWeight: "bold", whiteSpace: "nowrap", fontSize: "13px", flexShrink: 0 }}>
                              ⭐ Đã thuộc
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {currentQ.words.every((item, idx) => (crosswordInputs[idx] || "").toLowerCase().trim() === item.cleanWord.toLowerCase().trim()) ? (
                <div style={{ marginTop: "25px", textAlign: "center", animation: "popIn 0.5s" }}>
                  <h3 style={{ color: "#FF9800", marginBottom: "15px", fontSize: "18px" }}>Nhập Từ Khóa Bí Mật:</h3>
                  <input autoFocus type="text" value={keywordInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
                      setKeywordInput(val);
                      if (val === currentQ.keyword.toUpperCase() && !isKeywordSolved) {
                        setIsKeywordSolved(true);
                        playSound("combo_max");
                        confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 });
                      }
                    }}
                    disabled={isKeywordSolved} placeholder={`${currentQ.keyword.length} CHỮ CÁI...`}
                    style={{ width: "100%", maxWidth: "300px", padding: "12px", fontSize: "24px", textAlign: "center", textTransform: "uppercase", letterSpacing: "5px", borderRadius: "8px", border: isKeywordSolved ? "2px solid #4CAF50" : "2px solid #FF9800", outline: "none", backgroundColor: isKeywordSolved ? "#e8f5e9" : "#fff", fontWeight: "bold", color: isKeywordSolved ? "#2e7d32" : "#e65100", transition: "0.3s" }}
                  />
                  {isKeywordSolved && (
                    <div style={{ marginTop: "20px", animation: "popIn 0.5s" }}>
                      {isFetchingExplanation ? (
                        <p style={{ color: "#2196F3", fontStyle: "italic", fontWeight: "bold" }}>🤖 AI đang phân tích nghĩa của từ "{currentQ.keyword}"...</p>
                      ) : (
                        <div style={{ backgroundColor: "#e3f2fd", padding: "15px", borderRadius: "8px", border: "1px dashed #2196F3", textAlign: "left", marginBottom: "20px" }}>
                          <h4 style={{ color: "#1565c0", margin: "0 0 8px 0" }}>🤖 AI Giải Thích:</h4>
                          <p style={{ margin: 0, color: "#333", fontSize: "15px", whiteSpace: "pre-line", lineHeight: "1.6" }}>{keywordExplanation}</p>
                        </div>
                      )}
                      <button onClick={() => handleAnswer("WIN")} style={{ width: "100%", padding: "15px", fontSize: "18px", backgroundColor: "#4CAF50", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer" }}>🎉 Tuyệt vời! Hoàn thành 🎉</button>
                    </div>
                  )}
                </div>
              ) : (
                <button disabled style={{ width: "100%", padding: "15px", marginTop: "25px", fontSize: "18px", backgroundColor: "#ccc", color: "#666", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "not-allowed" }}>🔒 Giải mã các ô bên trên để tìm Từ Khóa</button>
              )}
            </>
          )}

          {/* === GAME 2: BLAST === */}
          {bossGameChoice === "blast" && (
            <BlastGame words={currentQ.words} onWin={() => handleAnswer("WIN")} onBack={() => setBossGameChoice(null)} />
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
                                {currentQ.meaning ? (
                                    <span style={{ fontSize: "20px", fontWeight: "bold", textAlign: "center", width: "100%", lineHeight: "1.4" }}>{currentQ.meaning}</span>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "100%" }}>
                                        {currentQ.noun_meaning && <span style={{ fontSize: "18px", fontWeight: "bold", textAlign: "center", lineHeight: "1.4" }}><span style={{ opacity: 0.8, fontSize: "14px" }}>(n)</span> {currentQ.noun_meaning}</span>}
                                        {currentQ.verb_meaning && <span style={{ fontSize: "18px", fontWeight: "bold", textAlign: "center", lineHeight: "1.4" }}><span style={{ opacity: 0.8, fontSize: "14px" }}>(v)</span> {currentQ.verb_meaning}</span>}
                                        {currentQ.adj_meaning && <span style={{ fontSize: "18px", fontWeight: "bold", textAlign: "center", lineHeight: "1.4" }}><span style={{ opacity: 0.8, fontSize: "14px" }}>(adj)</span> {currentQ.adj_meaning}</span>}
                                    </div>
                                )}
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
                    <h3 style={{ fontSize: "24px", color: "#4CAF50", marginBottom: "20px" }}>
                        "{currentQ.meaning || [
                            currentQ.noun_meaning && `(n) ${currentQ.noun_meaning}`,
                            currentQ.verb_meaning && `(v) ${currentQ.verb_meaning}`,
                            currentQ.adj_meaning && `(adj) ${currentQ.adj_meaning}`,
                        ].filter(Boolean).join(' / ')}"
                    </h3>
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
                            ref={typingInputRef} type="text" value={typingValue} onChange={(e) => setTypingValue(e.target.value)}
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

      {(currentQ.type === "vn_to_en" || currentQ.type === "part5_vocab") && (
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
          {/* THÊM noValidate vào form và đổi type="text" để hack chặn Unikey */}
          <form onSubmit={handleTypingSubmit} style={{ marginTop: "20px" }} noValidate>
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
    </div>
  );
}

// =======================================================================
// COMPONENT MỚI: NGỮ PHÁP TÍCH HỢP AI CHUẨN ETS + TRA TỪ ĐIỂN BÔI ĐEN
// =======================================================================
function GrammarQuiz({ onBack, updateGlobal, onSaveWord, settings, learnedQuestions, globalStats, customGrammarNotes = [], selectedNoteId = null }) {

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
  const IS_FREE_MODE = DIFFICULTY_LEVEL === 0;
  const [timeLeft, setTimeLeft] = useState(IS_FREE_MODE ? null : TIME_PER_QUESTION);
  const [elapsedTime, setElapsedTime] = useState(0); // Đếm thời gian đã làm
  const [answerStatus, setAnswerStatus] = useState(null); 
  const [streak, setStreak] = useState(0);

  // --- TÍNH NĂNG MỚI: STATE CHO TỪ ĐIỂN ---
  const [vocabDict, setVocabDict] = useState([]); // Chứa data từ Google Sheet
  const [selectedWord, setSelectedWord] = useState("");
  const [tooltipPos, setTooltipPos] = useState(null);
  const [dictModal, setDictModal] = useState(null);
  // THAY BẰNG:
  const [isSaved, setIsSaved] = useState(false);
  const [sidePanelResult, setSidePanelResult] = useState(null);
  const [sidePanelLoading, setSidePanelLoading] = useState(false);
  const sidePanelLockRef = useRef(false);
  const sidePanelDebounceRef = useRef(null); // Chống gọi liên tục khi bôi đen

  useEffect(() => {
    const lockLandscape = async () => {
        try {
            if (screen.orientation?.lock) {
                await screen.orientation.lock('landscape');
            }
        } catch(e) {}
    };
    if (window.innerWidth < 900) lockLandscape();
    return () => {
        try { screen.orientation?.unlock?.(); } catch(e) {}
    };
}, []);

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

  // 2. HÀM QUÉT CHỮ BÔI ĐEN BẰNG CHUỘT/CẢM ỨNG
const mouseDownPosRef = useRef({ x: 0, y: 0 });

const handleSelection = (e) => {
    // Nếu là mouseup mà chuột không di chuyển đủ xa so với lúc nhấn → là click đơn, bỏ qua
    if (e.type === 'mouseup') {
        const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
        const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
        if (dx < 5 && dy < 5) return; // click đơn, không bôi đen
    }

    setTimeout(async () => { 
        // Bỏ qua nếu click vào side panel
        const sidePanel = document.getElementById('side-panel-dict');
        if (sidePanel && e.target && sidePanel.contains(e.target)) return;

        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            const text = selection.toString().trim();
            if (text && text.length >= 2 && text.split(/\s+/).length <= 40 && text.length < 300) {
                  const anchorNode = selection.anchorNode;
                  const container = document.getElementById('grammar-quiz-content');
                  if (container && !container.contains(anchorNode)) return;
                  setSelectedWord(text);

                    // Nếu màn hình rộng thì tra vào side panel, KHÔNG hiện bottom bar
                    if (window.innerWidth >= 900 || window.innerWidth > window.innerHeight) {
                      const cleanWord = text.trim().toLowerCase().replace(/[^a-z-\s]/g, '');
                      if (!cleanWord) return;
                      setSidePanelLoading(true);
                      setSidePanelResult(null);

                      // Gộp cả Google Sheet + Sổ tay cá nhân (Firestore) để tìm
                      const personalWords = [
                          ...(globalStats?.vocab?.addedWordsObj || []),
                          ...(globalStats?.collocation?.addedWordsObj || []),
                          ...(globalStats?.grammar?.addedWordsObj || []),
                      ];
                      const allSources = [...vocabDict, ...personalWords];

                     const foundInSheet = cleanWord.trim().split(/\s+/).length >= 4 ? null : allSources.find(item => {
                          if (!item.word) return false;
                          const dictWord = item.word.toLowerCase().trim().replace(/\s*\(.*?\)\s*/g, '').trim();
                          const searched = cleanWord.toLowerCase().trim();
                          // Chỉ match nếu từ trong sheet đủ dài (>= 3 ký tự) tránh match "the", "a", "to"...
                          if (dictWord.length < 3) return false;
                          return dictWord === searched || dictWord === searched.split(/\s+/).find(w => w === dictWord);
                      });
                      // Nếu tìm thấy trong sheet → hiện ngay, KHÔNG gọi AI
                      if (foundInSheet) {
                          setSidePanelResult({ word: cleanWord, status: 'found_sheet', data: foundInSheet });
                          setSidePanelLoading(false);
                          sidePanelLockRef.current = false;
                          return;
                      }

                      // Không có trong sheet → mới debounce gọi AI
                      clearTimeout(sidePanelDebounceRef.current);
                      sidePanelDebounceRef.current = setTimeout(async () => {
                      if (sidePanelLockRef.current) return;

                      sidePanelLockRef.current = true;
                      try {
                          const doLookup = async () => {
                              const GEMINI_API_KEY = getActiveKey();
                              if (!window.globalCachedModel) {
                                  const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
                                  const listData = await listRes.json();
                                  const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent"));
                                  const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
                                  window.globalCachedModel = flashModel ? flashModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
                              }
                              const wordCount = cleanWord.trim().split(/\s+/).length;
                              const isSentence = wordCount >= 6;
                              const isStructure = !isSentence && (
                                  /\b(if|when|although|because|unless|until|after|before|so that|in order to|not only|either|neither|both|whether|as long as|provided that|as soon as)\b/i.test(cleanWord) ||
                                  /\b(have been|has been|had been|will have|would have|could have|should have|must have|be able to|used to|going to)\b/i.test(cleanWord)
                              );

                              const prompt = isSentence
                                  ? `Dịch câu tiếng Anh sau sang tiếng Việt tự nhiên, sau đó giải thích ngắn gọn cấu trúc ngữ pháp chính trong câu. Câu: "${cleanWord}". Trả về CHỈ 1 OBJECT JSON: {"word": "Bản dịch tiếng Việt", "phonetic": "", "meaning": "Bản dịch đầy đủ, tự nhiên", "noun_meaning": "", "verb_meaning": "", "adj_meaning": "", "synonym": "", "usage": "Giải thích cấu trúc ngữ pháp chính của câu này"}`
                                  : isStructure
                                  ? `Giải thích cấu trúc ngữ pháp tiếng Anh: "${cleanWord}". Trả về CHỈ 1 OBJECT JSON: {"word": "${cleanWord}", "phonetic": "Cách dùng tóm tắt", "meaning": "Ý nghĩa/chức năng của cấu trúc này", "noun_meaning": "", "verb_meaning": "", "adj_meaning": "", "synonym": "Các cấu trúc tương đương hoặc thay thế", "usage": "1 câu ví dụ minh họa cấu trúc"}`
                                  : `Phân tích từ/cụm từ tiếng Anh: "${cleanWord}". Trả về CHỈ 1 OBJECT JSON: {"word": "Từ chuẩn (kèm loại từ)", "phonetic": "Phiên âm IPA", "noun_meaning": "Nghĩa (n) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "verb_meaning": "Nghĩa (v) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "adj_meaning": "Nghĩa (adj/adv) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "meaning": "Nghĩa chung TỐI ĐA 5 TỪ nếu không chia được", "synonym": "tối thiểu 3 từ đồng nghĩa và tối đa là 7 từ đồng nghĩa", "usage": "1 câu ví dụ ngắn"}`;
                              const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${getActiveKey()}`, {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                              });
                              const data = await res.json();
                              if (data.error) {
                                  const msg = data.error.message?.toLowerCase() || "";
                                  if (msg.includes("quota") || msg.includes("expired") || data.error.code === 429) {
                                      window.globalCachedModel = null;
                                      if (rotateKey()) {
                                          await new Promise(r => setTimeout(r, 1000));
                                          return doLookup();
                                      }
                                  }
                                  throw new Error(data.error.message);
                              }
                              let rawText = data.candidates[0].content.parts[0].text;
                              rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                              setSidePanelResult({ word: cleanWord, status: 'found_ai', data: JSON.parse(rawText) });
                          };
                          await doLookup();
                      } catch(e) {
                          setSidePanelResult({ word: cleanWord, status: 'error', data: null });
                      } finally {
                          setSidePanelLoading(false);
                          sidePanelLockRef.current = false;
                      }
                      }, 800);
                  }
                  return;
                } 
          }
          setSelectedWord("");
          setTooltipPos(null);
      }, 50);
  };

  // Lắng nghe sự kiện bôi đen — track mousedown để phân biệt click đơn vs kéo chọn
  useEffect(() => {
    const onMouseDown = (e) => {
        mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("touchend", handleSelection);
    document.addEventListener("dblclick", handleSelection);
    
    return () => {
        document.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mouseup", handleSelection);
        document.removeEventListener("touchend", handleSelection);
        document.removeEventListener("dblclick", handleSelection);
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
              const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
              window.globalCachedModel = flashModel ? flashModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
          }

          const prompt = `Phân tích từ/cụm từ tiếng Anh: "${cleanWord}". (Lưu ý: Nếu từ bị dính chữ, hãy tự động sửa thành đúng chính tả).
          Trả về CHỈ 1 OBJECT JSON ĐƠN GIẢN:
          {"word": "Từ chuẩn kèm loại từ", "phonetic": "Phiên âm", "meaning": "Nghĩa tiếng Việt ngắn gọn (1 dòng)", "synonyms": "từ đồng nghĩa 1, từ đồng nghĩa 2", "usage": "1 ví dụ"}`;

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
              const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
              window.globalCachedModel = flashModel ? flashModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
          }

          let prompt = type === "grammar"
            ? `Giải thích cấu trúc ngữ pháp: "${cleanWord}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON:\n{"word": "${cleanWord}", "phonetic": "Công thức", "meaning": "Cách sử dụng cốt lõi", "usage": "1 ví dụ"}`
            : `Phân tích cụm từ tiếng Anh: "${cleanWord}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON:\n{"word": "Từ vựng (kèm từ loại)", "phonetic": "Phiên âm", "meaning": "Nghĩa tiếng Việt ngắn gọn (1 dòng)", "synonyms": "từ đồng nghĩa 1, từ đồng nghĩa 2", "usage": "1 ví dụ"}`;

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
  const fetchGrammarFromAI = useRef(null);

  useEffect(() => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    fetchGrammarFromAI.current = async () => {
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

      // Part 5: cấu trúc cũ - mảng câu hỏi thẳng
      // Part 6/7/scan_skim: cấu trúc mới - mảng đoạn văn, mỗi đoạn có nhiều câu
      const isPassageMode = ["part6", "part7", "scan_skim"].includes(TOEIC_PART);
      const PASSAGE_TYPES = ["text", "thông báo nội bộ", "quảng cáo sản phẩm/dịch vụ", "bài báo kinh doanh", "thư mời", "hướng dẫn sử dụng", "thông cáo báo chí", "lịch trình công tác"];
      // Part6: cố định 4 lỗ/đoạn, 1 đoạn
      // Part7: random 4 hoặc 5 câu/đoạn, 1 đoạn
      const questionsPerPassage = TOEIC_PART === "part6" ? 4
                                : TOEIC_PART === "part7" ? (Math.random() > 0.5 ? 4 : 5)
                                : 3; // scan_skim
      const numPassages = (TOEIC_PART === "part6" || TOEIC_PART === "part7")
          ? 1
          : Math.max(1, Math.round(QUIZ_LIMIT / questionsPerPassage));
      const adjustedQuizLimit = numPassages * questionsPerPassage;

      // === LẤY NỘI DUNG FILE WORD NẾU CHỌN CUSTOM SOURCE ===
      let customNoteContent = "";
      if (settings.grammarSource === "custom" && selectedNoteId && customGrammarNotes.length > 0) {
        const selectedNote = customGrammarNotes.find(n => n.id === selectedNoteId);
        if (selectedNote) {
          // Giới hạn 3000 ký tự để tránh vượt token
          customNoteContent = selectedNote.content.slice(0, 3000);
        }
      }

      let prompt = "";

      if (!isPassageMode) {
        // PART 5: giữ nguyên cấu trúc cũ
        const customNoteInstruction = customNoteContent
          ? `\nDƯỚI ĐÂY LÀ GHI CHÚ NGỮ PHÁP CỦA HỌC VIÊN. BẮT BUỘC chỉ tạo câu hỏi dựa trên các điểm ngữ pháp trong ghi chú này:\n---\n${customNoteContent}\n---\n`
          : "";

        prompt = `Bạn là chuyên gia luyện thi TOEIC chuẩn ETS.
            ${customNoteInstruction}
            Hãy tạo ${QUIZ_LIMIT} câu hỏi PART 5 (hoàn thành câu, điền từ).
            - Trả về DUY NHẤT 1 mảng JSON, không có chữ thừa.
            - Mỗi câu có đúng 1 chỗ trống (___), 4 đáp án, 1 đáp án đúng.
            Cấu trúc:
            [{
              "passage": "",
              "question": "Câu có ___ chỗ trống",
              "options": ["A","B","C","D"],
              "answer": "đáp án đúng",
              "explanation": {
                "translation": "Dịch câu hoàn chỉnh sang tiếng Việt",
                "grammar_points": "Giải thích điểm ngữ pháp",
                "wrong_options": "- đáp án: lý do sai (mỗi dòng 1 đáp án)",
                "key_vocab": "- từ: nghĩa (mỗi dòng 1 từ)"
              }
            }]
            Mức độ: ${DIFFICULTY_LEVEL <= 2 ? "Dễ - Trung bình" : "Khó"}`;

                  } else {
                    // PART 6/7/SCAN_SKIM: cấu trúc mới - đoạn văn + nhiều câu hỏi
                    const passageTypeList = Array.from({length: numPassages}, (_, i) => PASSAGE_TYPES[i % PASSAGE_TYPES.length]).join(', ');

                    const part6Instruction = `- Đoạn văn có đúng 4 chỗ trống được đánh số (___1___, ___2___, ___3___, ___4___).
            - Tạo đúng 4 câu hỏi, mỗi câu ứng với 1 chỗ trống theo thứ tự.
            - "question": ghi rõ "Câu 1: Chọn từ điền vào ô ___1___" (tương tự cho 2, 3, 4).`;

                    const part7Instruction = `- Đoạn văn hoàn chỉnh KHÔNG có chỗ trống.
            - Tạo đúng ${questionsPerPassage} câu hỏi đọc hiểu đa dạng: hỏi ý chính, chi tiết, suy luận, từ vựng trong ngữ cảnh.
            - "question": câu hỏi đọc hiểu thực sự (What is the purpose of...? / According to the passage...? / What can be inferred...?)`;

                    const scanSkimInstruction = `- Đoạn văn dài, nhiều thông tin số liệu.
            - Tạo ${questionsPerPassage} câu hỏi yêu cầu skimming (nắm ý chính) và scanning (tìm thông tin cụ thể).`;

                    const partSpecific = TOEIC_PART === "part6" ? part6Instruction : TOEIC_PART === "part7" ? part7Instruction : scanSkimInstruction;

                    prompt = `Bạn là chuyên gia luyện thi TOEIC chuẩn ETS.
            ${customNoteInstruction}
            Hãy tạo ${numPassages} đoạn văn cho phần ${TOEIC_PART.toUpperCase()}, mỗi đoạn có ${questionsPerPassage} câu hỏi.
            Các loại văn bản (lần lượt): ${passageTypeList}.

            YÊU CẦU:
            ${partSpecific}
            - Văn bản phải tự nhiên, chuyên nghiệp, đúng phong cách TOEIC ETS.
            - Trả về DUY NHẤT 1 mảng JSON (mảng các đoạn văn), không có chữ thừa.

            Cấu trúc mỗi đoạn:
            {
              "doc_type": "text",
              "passage": "Toàn bộ đoạn văn ở đây (với ___1___ nếu là Part 6)",
              "questions": [
                {
                  "question": "Câu hỏi 1",
                  "options": ["","","",""],
                  "answer": "đáp án đúng",
                  "explanation": {
                    "translation": "Dịch/giải thích ngữ cảnh câu hỏi này",
                    "grammar_points": "Điểm ngữ pháp hoặc kỹ năng đọc hiểu liên quan",
                    "wrong_options": "- đáp án: lý do sai (mỗi dòng 1 đáp án)",
                    "key_vocab": "- từ: nghĩa (mỗi dòng 1 từ)"
                  }
                }
              ]
            }
            Mức độ: ${DIFFICULTY_LEVEL <= 2 ? "Dễ - Trung bình" : "Khó"}`;
                  }

      // THAY BẰNG:
      try {
        const currentKey = getActiveKey(); // Luôn lấy key hiện tại (không dùng biến cũ)

        if (!window.globalCachedModel) {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${currentKey}`);
          const listData = await listRes.json();
          const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent"));
          const flashModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
          if (!flashModel && textModels.length === 0) throw new Error("Không tìm được model từ API");
          window.globalCachedModel = flashModel ? flashModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
         
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${currentKey}`;

        let requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        if (window.globalCachedModel.includes("1.5")) {
          requestBody.generationConfig = { response_mime_type: "application/json" };
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // Kiểm tra quota TRƯỚC, rotate key rồi thử lại thay vì crash
        if (data.error) {
          const msg = data.error.message?.toLowerCase() || "";
          const code = data.error.code;

          // Lỗi 503: Server quá tải tạm thời → đợi rồi thử lại, KHÔNG rotate key
          const retryCountRef = useRef(0);
          if (code === 503 || msg.includes("high demand") || msg.includes("service unavailable") || msg.includes("overloaded")) {
            retryCountRef.current += 1;
            if (retryCountRef.current > 4) { // Tối đa 4 lần (~12 giây)
              retryCountRef.current = 0;
              alert("Server AI đang quá tải, vui lòng thử lại sau ít phút!");
              onBack();
              return;
            }
            setLoadingMsg(`🔄 Server AI đang bận, thử lại lần ${retryCountRef.current}/4...`);
            await new Promise(r => setTimeout(r, 3000));
            isFetchingRef.current = false;
            return fetchGrammarFromAI.current();
          }

          // Lỗi quota / hết key → rotate sang key khác
          if (msg.includes("quota") || msg.includes("expired") || code === 429) {
            window.globalCachedModel = null;
            if (rotateKey()) {
              console.log("⏳ Đổi key, thử lại sau 1.5s...");
              await new Promise(r => setTimeout(r, 1500));
              isFetchingRef.current = false;
              setLoadingData(true);
              return fetchGrammarFromAI.current();
            }
          }
          throw new Error(data.error.message);
        }

        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(rawText);

        // Hàm strip prefix "A) " / "A." / "(A)" khỏi đầu chuỗi
        const stripPrefix = (str) => (str || "").replace(/^\s*[A-Da-d][.)]\s*/i, "").trim();

        // FIX: normalizeAnswer phải nhận options GỐC (chưa shuffle) để map A/B/C/D đúng index
        const normalizeAnswer = (originalOptions, shuffledOptions, answer) => {
          // Ưu tiên 1: match trực tiếp theo text (sau khi strip prefix)
          const answerClean = stripPrefix(answer).toLowerCase();
          const matchedInShuffled = shuffledOptions.find(opt => stripPrefix(opt).toLowerCase() === answerClean);
          if (matchedInShuffled) return matchedInShuffled;

          // Ưu tiên 2: nếu answer là chữ cái A/B/C/D → map theo index của options GỐC (chưa shuffle)
          if (/^[a-d]$/i.test((answer || "").trim())) {
            const idx = answer.trim().toUpperCase().charCodeAt(0) - 65;
            const originalText = originalOptions[idx]; // Lấy text đúng từ mảng GỐC
            if (originalText) {
              // Tìm text đó trong mảng đã shuffle để trả về đúng reference
              const matchInShuffled = shuffledOptions.find(opt => stripPrefix(opt).toLowerCase() === stripPrefix(originalText).toLowerCase());
              if (matchInShuffled) return matchInShuffled;
            }
          }

          // Fallback: log cảnh báo thay vì âm thầm trả options[0] sai
          console.warn(`[normalizeAnswer] Không tìm được đáp án khớp! answer="${answer}", options=`, shuffledOptions);
          return answer; // Trả về text gốc của AI, để handleAnswer so sánh rồi tính sai nếu thực sự không khớp
        };

        let finalPool = [];
        if (isPassageMode) {
          parsed.forEach(doc => {
            doc.questions.forEach(q => {
              const originalOptions = [...q.options]; // Giữ thứ tự GỐC trước khi shuffle
              const shuffledOptions = shuffleArray(q.options);
              finalPool.push({
                passage: doc.passage,
                doc_type: doc.doc_type || "",
                question: q.question,
                options: shuffledOptions,
                answer: normalizeAnswer(originalOptions, shuffledOptions, q.answer),
                explanation: q.explanation,
              });
            });
          });
          finalPool = finalPool.slice(0, adjustedQuizLimit);
        } else {
          finalPool = parsed.map(q => {
            const originalOptions = [...q.options]; // Giữ thứ tự GỐC trước khi shuffle
            const shuffledOptions = shuffleArray(q.options);
            return { ...q, options: shuffledOptions, answer: normalizeAnswer(originalOptions, shuffledOptions, q.answer) };
          });
        }
        setQuestionsData(finalPool);

      } catch (error) {
        console.error("Lỗi tạo đề:", error);
        alert("Đã thử tất cả API Key nhưng đều hết quota. Vui lòng thử lại sau!");
        onBack();
      } finally {
        setLoadingData(false);
      }
    };

    fetchGrammarFromAI.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Chạy 1 lần khi mở GrammarQuiz

    // Timer đếm lên (Free Mode)
  useEffect(() => {
    if (!IS_FREE_MODE || loadingData || isGameOver) return;
    const timer = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [IS_FREE_MODE, loadingData, isGameOver]);

  // ✅ SỬA LẠI — thêm guard kiểm tra current vẫn hợp lệ trước khi handleAnswer
  useEffect(() => {
      if (selected !== null || loadingData || isGameOver || DIFFICULTY_LEVEL === 4 || IS_FREE_MODE) return;
      if (questionsData[current]?.type === "crossword_boss") return;
      if (timeLeft === null || timeLeft <= 0) {
          if (timeLeft !== null && questionsData[current]) handleAnswer(null); // ← thêm guard
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
    const isCorrect = !isTimeout && (actualOption === currentQ.answer)
    
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
            const origItem = newData[current];
            const shuffledOpts = shuffleArray([...(origItem.options || [])]);
            const penaltyItem = {
              ...origItem,
              options: shuffledOpts.includes(origItem.answer) ? shuffledOpts : [...(origItem.options || [])],
              answer: origItem.answer,
            };
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
    setTimeLeft(IS_FREE_MODE ? null : TIME_PER_QUESTION);
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
    const acc = current > 0 ? Math.round((score/current)*100) : 0;
    const isWin = DIFFICULTY_LEVEL < 3;
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:isWin?"linear-gradient(135deg,#e3f2fd,#f0f7ff)":"linear-gradient(135deg,#ffebee,#fce4ec)", padding:"20px" }}>
        <div style={{ textAlign:"center", width:"100%", maxWidth:"380px" }}>
          <div style={{ fontSize:"64px", marginBottom:"12px" }}>{isWin?"🎉":"☠️"}</div>
          <h1 style={{ color:isWin?"#1565c0":"#c62828", fontWeight:"900", fontSize:"28px", margin:"0 0 6px 0" }}>{isWin?"Hoàn thành!":"Game Over"}</h1>
          <p style={{ color:"#666", marginBottom:"24px" }}>{DIFFICULTY_LEVEL===3?`Sống sót ${score} câu TOEIC!`:DIFFICULTY_LEVEL===4?`Tốc độ đúng ${score} câu!`:"Bạn đã hoàn thành phiên luyện thi!"}</p>
          <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", overflow:"hidden", minHeight:0 }}>
            <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#4CAF50" }}>{score}</div>
              <div style={{ fontSize:"12px", color:"#888" }}>✅ Đúng</div>
            </div>
            {isWin && <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#F44336" }}>{current-score}</div>
              <div style={{ fontSize:"12px", color:"#888" }}>❌ Sai</div>
            </div>}
            <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#FF9800" }}>{acc}%</div>
              <div style={{ fontSize:"12px", color:"#888" }}>🎯 Chính xác</div>
            </div>
            <div style={{ background:"white", borderRadius:"16px", padding:"16px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:"28px", fontWeight:"900", color:"#2196F3" }}>{current}</div>
              <div style={{ fontSize:"12px", color:"#888" }}>📊 Tổng câu</div>
            </div>
          </div>
          <button onClick={() => { playSound("click"); onBack(); }} style={{ width:"100%", padding:"15px", background:isWin?"linear-gradient(135deg,#1565c0,#1976d2)":"linear-gradient(135deg,#c62828,#e53935)", color:"white", borderRadius:"14px", border:"none", cursor:"pointer", fontWeight:"bold", fontSize:"17px", fontFamily:"inherit", boxShadow:"0 6px 18px rgba(0,0,0,0.2)" }}>
            🏠 Về trang chủ
          </button>
        </div>
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

  // THAY BẰNG:
const renderInlineText = (text) => {
  if (!text) return null;
  return text.split(/('.*?'|".*?"|\*\*.*?\*\*|\*.*?\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: "#d32f2f" }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <strong key={i} style={{ color: "#d32f2f" }}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("'") && part.endsWith("'") && part.length > 2) return <strong key={i} style={{ color: "#1976D2", backgroundColor: "#e3f2fd", padding: "2px 5px", borderRadius: "5px", border: "1px solid #bbdefb", wordBreak: "break-word" }}>{part.slice(1, -1)}</strong>;
    if (part.startsWith('"') && part.endsWith('"') && part.length > 2) return <strong key={i} style={{ color: "#1976D2", backgroundColor: "#e3f2fd", padding: "2px 5px", borderRadius: "5px", border: "1px solid #bbdefb", wordBreak: "break-word" }}>{part.slice(1, -1)}</strong>;
    return <span key={i}>{part}</span>;
  });
};

const renderBulletList = (text, bulletColor = "#64b5f6") => {
  if (!text) return null;

  // Tách thông minh: hỗ trợ cả xuống dòng lẫn " - " nằm giữa câu
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const lines = rawLines.flatMap(line => {
    // Nếu dòng có dạng "- A ... - B ..." thì tách thành nhiều dòng
    const parts = line.split(/\s+-\s+(?=[A-Z'"])/);
    return parts.map((p, i) => (i === 0 ? p : `- ${p}`));
  });

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const isItem = /^[-•*]\s/.test(trimmed);
    const clean = isItem ? trimmed.substring(2).trim() : trimmed;
    return (
      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
        {isItem && <span style={{ color: bulletColor, fontWeight: "bold", marginTop: "2px", flexShrink: 0 }}>•</span>}
        <span style={{ fontSize: "14px", lineHeight: "1.7", color: "#2c3e50" }}>{renderInlineText(clean)}</span>
      </div>
    );
  });
};

const formatExplanation = (explanation, correctAnswer = null, allOptions = null) => {
  if (!explanation) return null;

  if (typeof explanation === 'object' && explanation !== null) {
    const sections = [
      { key: 'translation',    icon: '🇻🇳', label: 'Dịch câu',           borderColor: '#66bb6a', labelColor: '#2e7d32', isPlain: true  },
      { key: 'grammar_points', icon: '📐', label: 'Điểm ngữ pháp',       borderColor: '#42a5f5', labelColor: '#1565c0', isPlain: false },
      { key: 'wrong_options',  icon: '❌', label: 'Các đáp án sai',       borderColor: '#ffa726', labelColor: '#e65100', isPlain: false },
      { key: 'key_vocab',      icon: '📚', label: 'Từ vựng quan trọng',   borderColor: '#ec407a', labelColor: '#880e4f', isPlain: false },
    ];

    // Rebuild wrong_options từ options thực tế sau shuffle
    let patchedExplanation = { ...explanation };
    if (correctAnswer && allOptions && allOptions.length > 0) {
      const stripPfx = (s) => (s || "").replace(/^\s*[A-Da-d][.)]\s*/i, "").trim();
      const correctClean = stripPfx(correctAnswer).toLowerCase();
      const realWrongOptions = allOptions.filter(opt => stripPfx(opt).toLowerCase() !== correctClean);

      // Parse lý do từ AI thành map: "đáp án" -> "lý do"
      const aiLines = (explanation.wrong_options || "").split('\n').map(l => l.trim()).filter(Boolean);
      const aiReasonMap = {};
      aiLines.forEach(line => {
        const match = line.match(/^[-•*]?\s*(?:[A-Da-d][.)]\s*)?([^:：]+)[：:]\s*(.+)/);
        if (match) aiReasonMap[stripPfx(match[1].trim()).toLowerCase()] = match[2].trim();
      });

      patchedExplanation.wrong_options = realWrongOptions
        .map(opt => {
          const clean = stripPfx(opt);
          const reason = aiReasonMap[clean.toLowerCase()] || "Không phù hợp với ngữ cảnh câu hỏi";
          return `- ${clean}: ${reason}`;
        })
        .join('\n');
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
        {sections.map(({ key, icon, label, borderColor, labelColor, isPlain }) => {
          const content = patchedExplanation[key];  // ← dùng patchedExplanation
          if (!content) return null;
          return (
            <div key={key} style={{ borderLeft: `4px solid ${borderColor}`, paddingLeft: "12px" }}>
              <div style={{ fontWeight: "bold", color: labelColor, fontSize: "13px", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
                <span>{icon}</span> {label}
              </div>
              {isPlain
                ? <p style={{ margin: 0, fontSize: "15px", lineHeight: "1.7", color: "#2c3e50" }}>{renderInlineText(content)}</p>
                : renderBulletList(content, borderColor)
              }
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: explanation là string cũ
  return explanation.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} style={{ height: "10px" }}></div>;
    const isListItem = /^[-\*•]\s/.test(trimmed);
    const cleanText = isListItem ? trimmed.substring(1).trim() : trimmed;
    return (
      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "12px", padding: isListItem ? "12px 15px" : "0", backgroundColor: isListItem ? "#ffffff" : "transparent", borderLeft: isListItem ? "4px solid #64b5f6" : "none", borderRadius: isListItem ? "0 8px 8px 0" : "0", boxShadow: isListItem ? "0 2px 8px rgba(0,0,0,0.04)" : "none" }}>
        {isListItem && <span style={{ fontSize: "16px", marginTop: "2px", userSelect: "none" }}>💡</span>}
        <span style={{ flex: 1, fontSize: "15px", lineHeight: "1.7", color: "#2c3e50" }}>{renderInlineText(cleanText)}</span>
      </div>
    );
  });
};

  

  // THAY BẰNG:
return (
  <div style={{ position: "fixed", inset: 0, display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "12px", padding: "12px", background: "linear-gradient(135deg,#e3f2fd,#e8eaf6)", overflow: "hidden", fontFamily: "inherit" }}>
  {/* PANEL DỊCH TỪ BÊN PHẢI (CHỈ HIỆN TRÊN MÀN HÌNH RỘNG >= 900px) */}
  <div id="side-panel-dict" style={{
    display: "flex",
    flexDirection: "column",
    backgroundColor: "white",
    borderRadius: "16px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    border: "1px solid #e0e0e0",
    padding: "16px",
    overflowY: "auto",
    gridColumn: "3",      // cột phải
    gridRow: "1",
    alignSelf: "start",
    maxHeight: "calc(100vh - 24px)",
}}>
      <div style={{ fontWeight: "bold", color: "#1565c0", fontSize: "15px", marginBottom: "15px", display: "flex", alignItems: "center", gap: "6px", borderBottom: "2px solid #e3f2fd", paddingBottom: "10px" }}>
          🔍 Tra từ nhanh
          <span style={{ fontSize: "11px", color: "#999", fontWeight: "normal", marginLeft: "auto" }}>Bôi đen từ để tra</span>
      </div>

      {!sidePanelLoading && !sidePanelResult && (
          <div style={{ textAlign: "center", color: "#bbb", fontSize: "14px", padding: "30px 0" }}>
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>✍️</div>
              Bôi đen bất kỳ từ nào trong câu hỏi để tra nghĩa ngay tại đây
          </div>
      )}

      {sidePanelLoading && (
          <div style={{ textAlign: "center", color: "#2196F3", fontSize: "14px", padding: "30px 0" }}>
              <div style={{ fontSize: "30px", marginBottom: "10px" }}>⏳</div>
              Đang tra từ...
          </div>
      )}

      {sidePanelResult && !sidePanelLoading && (
          <>
              <div style={{ fontSize: "22px", fontWeight: "bold", color: "#2196F3", marginBottom: "4px" }}>
                  {sidePanelResult.data?.word || sidePanelResult.word}
              </div>
              <div style={{ marginBottom: "12px" }}>
                  <span style={{ fontSize: "11px", backgroundColor: sidePanelResult.status === "found_sheet" ? "#4CAF50" : "#9C27B0", color: "white", padding: "2px 8px", borderRadius: "10px", fontWeight: "bold" }}>
                      {sidePanelResult.status === "found_sheet" ? "✅ Sổ tay" : "🤖 AI"}
                  </span>
              </div>
              <div style={{ backgroundColor: "#f0f8ff", padding: "12px", borderRadius: "10px", border: "1px dashed #90caf9", marginBottom: "12px" }}>
                  <p style={{ margin: "0 0 6px 0", fontSize: "13px", fontStyle: "italic", color: "#888" }}>{sidePanelResult.data?.phonetic}</p>
                    {(sidePanelResult.data?.noun_meaning || sidePanelResult.data?.verb_meaning || sidePanelResult.data?.adj_meaning) ? (
                      <div style={{ marginBottom: "8px" }}>
                          {sidePanelResult.data.noun_meaning && <p style={{ margin: "0 0 5px 0", fontSize: "16px", color: "#2e7d32" }}>• <strong>(n)</strong> {sidePanelResult.data.noun_meaning}</p>}
                          {sidePanelResult.data.verb_meaning && <p style={{ margin: "0 0 5px 0", fontSize: "16px", color: "#1565c0" }}>• <strong>(v)</strong> {sidePanelResult.data.verb_meaning}</p>}
                          {sidePanelResult.data.adj_meaning && <p style={{ margin: "0 0 5px 0", fontSize: "16px", color: "#6a1b9a" }}>• <strong>(adj/adv)</strong> {sidePanelResult.data.adj_meaning}</p>}
                          {sidePanelResult.data.synonym && <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#e65100" }}>🔀 <strong>Đồng nghĩa:</strong> {sidePanelResult.data.synonym}</p>}
                      </div>
                  ) : (
                      <p style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: "bold", color: "#2e7d32" }}>{sidePanelResult.data?.meaning}</p>
                  )}
                  {sidePanelResult.data?.usage && (
                      <p style={{ margin: 0, fontSize: "13px", color: "#555", borderTop: "1px solid #ddd", paddingTop: "8px", fontStyle: "italic" }}>"{sidePanelResult.data.usage}"</p>
                  )}
              </div>
              {sidePanelResult.saved ? (
                  <div style={{ textAlign: "center", color: "#4CAF50", fontWeight: "bold", padding: "10px", backgroundColor: "#e8f5e9", borderRadius: "8px" }}>✅ Đã lưu!</div>
              ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#999", textAlign: "center" }}>Lưu vào mục:</p>
                      <button onClick={() => { const d = sidePanelResult.status === "found_ai" ? {...sidePanelResult.data, word: sidePanelResult.word} : sidePanelResult.word; onSaveWord("vocab", d); setSidePanelResult(r => ({...r, saved: true})); playSound("click"); }}
                          style={{ width: "100%", padding: "9px", backgroundColor: "#4CAF50", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" }}>
                          📖 Từ Vựng
                      </button>
                      <button onClick={() => { const d = sidePanelResult.status === "found_ai" ? {...sidePanelResult.data, word: sidePanelResult.word} : sidePanelResult.word; onSaveWord("collocation", d); setSidePanelResult(r => ({...r, saved: true})); playSound("click"); }}
                          style={{ width: "100%", padding: "9px", backgroundColor: "#9C27B0", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" }}>
                          🔗 Collocation
                      </button>
                      <button onClick={() => { const d = sidePanelResult.status === "found_ai" ? {...sidePanelResult.data, word: sidePanelResult.word} : sidePanelResult.word; onSaveWord("grammar", d); setSidePanelResult(r => ({...r, saved: true})); playSound("click"); }}
                          style={{ width: "100%", padding: "9px", backgroundColor: "#2196F3", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" }}>
                          📐 Ngữ Pháp
                      </button>
                  </div>
              )}
          </>
      )}

    </div>

  {/* ========== CỘT 1: THẦY AI GIẢI THÍCH ========== */}
  <div style={{
    gridColumn: "1",
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "16px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    overflowY: "auto",
    maxHeight: "calc(100vh - 24px)",
    alignSelf: "start",
    border: "1px solid #e0e0e0",
  }}>
    {selected && answerStatus ? (
      <>
        <div style={{ fontWeight: "bold", color: "#1565c0", fontSize: "15px", marginBottom: "15px", display: "flex", alignItems: "center", gap: "6px", borderBottom: "2px solid #e3f2fd", paddingBottom: "10px" }}>
          🤖 Thầy AI Giải Thích
        </div>
        {selected !== "TIMEOUT" && selected !== currentQ.answer && (
          <div style={{ marginBottom: "15px", fontSize: "15px", color: "#d32f2f", fontWeight: "bold" }}>
            Đáp án đúng: <span style={{ textDecoration: "underline", color: "#2e7d32", padding: "2px 6px", backgroundColor: "#e8f5e9", borderRadius: "4px", userSelect: "text", WebkitUserSelect: "text" }}>{currentQ.answer}</span>
          </div>
        )}
        <div style={{ cursor: "text", userSelect: "text", WebkitUserSelect: "text" }}>
          {formatExplanation(currentQ.explanation, currentQ.answer, currentQ.options)}
        </div>
      </>
    ) : (
      <div style={{ textAlign: "center", color: "#bbb", fontSize: "14px", padding: "30px 0" }}>
        <div style={{ fontSize: "36px", marginBottom: "10px" }}>🤖</div>
        Chọn đáp án để Thầy AI giải thích
      </div>
    )}
  </div>  
  <div id="grammar-quiz-content" style={{ gridColumn: "2", display: "flex", flexDirection: "column", background: "white", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", padding: "20px", overflowY: "auto", maxHeight: "calc(100vh - 24px)", position: "relative" }}>

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg,#1565c0,#1e88e5)", borderRadius: "12px", padding: "8px 14px", marginBottom: "14px", gap: "10px" }}>
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
          <span style={{ fontWeight: "bold", color: IS_FREE_MODE ? "#4CAF50" : (DIFFICULTY_LEVEL===4 ? globalTime : timeLeft) <= 5 ? "#f44336" : "#2196F3", fontSize: "15px", textAlign: "center", whiteSpace: "nowrap" }}>
            {IS_FREE_MODE
              ? `⏳ ${Math.floor(elapsedTime/60).toString().padStart(2,'0')}:${(elapsedTime%60).toString().padStart(2,'0')}`
              : `⏱️ ${DIFFICULTY_LEVEL === 4 ? globalTime : timeLeft}s`
            }
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

      {DIFFICULTY_LEVEL < 4 && !IS_FREE_MODE && 
      <div style={{ width: "100%", height: "4px", backgroundColor: "rgba(0,0,0,0.08)", borderRadius: "2px", overflow: "hidden", marginBottom: "16px" }}>
      <div style={{ height: "100%", width: `${timePercentage}%`, background: timeLeft <= 3 ? "#ef5350" : "#42a5f5", transition: "width 1s linear" }} />        <div style={{ height: "100%", width: `${timePercentage}%`, backgroundColor: timeLeft <= 3 ? "#f44336" : "#2196F3", transition: "width 1s linear" }} />
      </div>}

      {currentQ.passage && currentQ.passage.trim() !== "" && currentQ.passage.trim() !== currentQ.question?.trim() && (
        <div style={{ backgroundColor: "#fafafa", border: "1px solid #e0e0e0", borderRadius: "12px", marginBottom: "16px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          {currentQ.doc_type && (
            <div style={{ backgroundColor: "#e3f2fd", padding: "6px 15px", borderBottom: "1px solid #d0d7de", fontSize: "12px", fontWeight: "bold", color: "#1565c0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              📄 {currentQ.doc_type}
            </div>
          )}
          <div style={{ padding: "15px", textAlign: "left", boxShadow: "inset 0 0 10px rgba(0,0,0,0.02)", cursor: "text", userSelect: "text", WebkitUserSelect: "text" }}>
            <p style={{ fontSize: "15px", lineHeight: "1.8", color: "#333", margin: 0, whiteSpace: "pre-line", userSelect: "text", WebkitUserSelect: "text" }}>
              {currentQ.passage}
            </p>
          </div>
        </div>
      )}

      {/* CÂU HỎI */}
      <h2 style={{ lineHeight: "1.6", color: "#2c3e50", fontSize: TOEIC_PART !== "part5" ? "18px" : "20px", borderBottom: "2px dashed #bbdefb", paddingBottom: "15px", marginBottom: "20px", cursor: "text", userSelect: "text", WebkitUserSelect: "text" }}>
        {currentQ.question}
      </h2>

      <div className="options">
        {currentQ.options.map((option, idx) => (
          <button key={idx} onClick={() => { window.getSelection()?.removeAllRanges(); handleAnswer(option); }} className={selected ? (option === currentQ.answer ? "correct" : option === selected ? "wrong" : "") : ""} disabled={selected !== null}>
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
          <button className="next" onClick={nextQuestion} style={{ width: "100%", padding: "14px", fontSize: "16px", fontWeight: "bold", borderRadius: "12px", marginTop: "16px", border: "none", cursor: "pointer" }}>
            Câu tiếp theo ➡️
          </button>
        </>
      )}
    </div>
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
function ModeSelectionScreen({ onModeSelect, onNotebookClick, globalStats = {} }) {
    const modes = [
        {
            title: "Ôn Từ Vựng", icon: "🚀", bg: "linear-gradient(135deg,#43a047,#66bb6a)",
            screen: "vocab_settings",
            count: (globalStats.vocab?.learnedWords?.length || 0),
            label: "từ đã học"
        },
        {
            title: "Ôn Colloc.", icon: "📚", bg: "linear-gradient(135deg,#8e24aa,#ba68c8)",
            screen: "collocation_settings",
            count: (globalStats.collocation?.learnedWords?.length || 0),
            label: "cụm đã học"
        },
        {
            title: "Ôn Ngữ Pháp", icon: "📐", bg: "linear-gradient(135deg,#1e88e5,#64b5f6)",
            screen: "grammar_settings",
            count: (globalStats.grammar?.learnedWords?.length || 0),
            label: "câu đã làm"
        },
    ];

    return (
        <div style={{ width: "100%", height: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", height: "100%" }}>
                {modes.map(m => (
                    <div key={m.screen}
                        onClick={() => onModeSelect(m.screen)}
                        className="mode-btn"
                        style={{ background: m.bg, borderRadius: "18px", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: "12px 10px", boxShadow: "0 6px 18px rgba(0,0,0,0.15)", userSelect: "none", height: "100%" }}
                        onMouseEnter={e => e.currentTarget.style.transform="scale(1.05)"}
                        onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}
                    >
                        <span style={{ fontSize: "32px", marginBottom: "8px", filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.2))" }}>{m.icon}</span>
                        <span style={{ fontSize: "14px", fontWeight: "bold", textAlign: "center", textShadow: "0 1px 2px rgba(0,0,0,0.3)", marginBottom: "6px" }}>{m.title}</span>
                        <span style={{ fontSize: "11px", backgroundColor: "rgba(0,0,0,0.18)", padding: "2px 10px", borderRadius: "20px", fontWeight: "bold" }}>{m.count} {m.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// =======================================================================
// COMPONENT: SỔ TAY TÍCH HỢP AI + SỬA BẰNG TAY (MANUAL EDIT) XỊN SÒ
// =======================================================================
function NotebookScreen({ globalStats, onBack, onSaveWord, onRemoveWord, onMoveWord, onMoveManyWords, onRemoveManyWords, onUploadGrammarFile, customGrammarNotes = [], defaultTab = "vocab" }) {  const [activeTab, setActiveTab] = useState(defaultTab);
  const [newWord, setNewWord] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState(new Set());
  const [isReloading, setIsReloading] = useState(false);
  const [reloadProgress, setReloadProgress] = useState({ done: 0, total: 0 }); 

  const [viewAllModal, setViewAllModal] = useState(null); 
  const [wordDetailModal, setWordDetailModal] = useState(null); 

  useEffect(() => {
    if (!wordDetailModal) return;
    const handleKey = (e) => {
      const list = ([...(globalStats[activeTab]?.[wordDetailModal.listType] || [])]).sort((a, b) => {
        const wa = (typeof a === 'string' ? a : a.word).toLowerCase();
        const wb = (typeof b === 'string' ? b : b.word).toLowerCase();
        return wa.localeCompare(wb);
      });
      const idx = list.findIndex(w => (typeof w === 'string' ? w : w.word).toLowerCase() === wordDetailModal.wordStr.toLowerCase());
      const total = list.length;
      if (e.key === "ArrowRight") {
        const next = list[(idx + 1) % total];
        openDetail(typeof next === 'string' ? next : next.word, wordDetailModal.listType);
      }
      if (e.key === "ArrowLeft") {
        const prev = list[(idx - 1 + total) % total];
        openDetail(typeof prev === 'string' ? prev : prev.word, wordDetailModal.listType);
      }
      if (e.key === "v" || e.key === "V") speakWord(wordDetailModal.wordStr, 'en-US');
      if (e.key === "Escape") closeDetailModal();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [wordDetailModal]);

  // Tự động phát âm khi mở modal hoặc chuyển từ
  useEffect(() => {
    if (!wordDetailModal || activeTab === "grammar") return;
    speakWord(wordDetailModal.wordStr, 'en-US');
  }, [wordDetailModal?.wordStr]);

  const [isEditingManual, setIsEditingManual] = useState(false);
  const [manualInputs, setManualInputs] = useState({ phonetic: "", meaning: "", usage: "", synonym: "", structure: "" });


  // --- TÍNH NĂNG MỚI: NHẬP JSON THỦ CÔNG TỪ AI NGOÀI ---
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonWordsInput, setJsonWordsInput] = useState("");
  const [jsonPasteInput, setJsonPasteInput] = useState("");
  const [jsonModalStep, setJsonModalStep] = useState(1);
  const [jsonSaveStatus, setJsonSaveStatus] = useState("");

  const getPromptForWords = (wordsStr, tab) => {
    if (tab === "grammar") {
      return `Giải thích các cấu trúc ngữ pháp TOEIC sau: "${wordsStr}".\nCHỈ TRẢ VỀ DUY NHẤT 1 MẢNG JSON, KHÔNG giải thích thêm:\n[{"word": "Tên cấu trúc", "phonetic": "Công thức đầy đủ (VD: S + V + O)", "meaning": "Ý nghĩa / cách dùng cốt lõi trong 1-2 câu", "usage": "1 câu ví dụ tiếng Anh hoàn chỉnh (có dịch nghĩa tiếng Việt trong ngoặc)"}]`;
    }
    if (tab === "collocation") {
      return `Phân tích các collocation (cụm từ cố định) tiếng Anh sau dùng trong TOEIC: "${wordsStr}".\nCHỈ TRẢ VỀ DUY NHẤT 1 MẢNG JSON, KHÔNG giải thích thêm:\n[{"word": "Collocation đầy đủ (VD: make a decision)", "phonetic": "Phiên âm IPA của từ khóa chính", "meaning": "Nghĩa tiếng Việt TỐI ĐA 6 TỪ", "usage": "1 câu ví dụ ngắn trong ngữ cảnh TOEIC", "synonym": "2-4 collocation tương đương hoặc từ đồng nghĩa"}]`;
    }
    return `Phân tích các từ/cụm từ tiếng Anh sau: "${wordsStr}".\nCHỈ TRẢ VỀ DUY NHẤT 1 MẢNG JSON:\n[{"word": "Từ chuẩn (kèm loại từ)", "phonetic": "Phiên âm IPA", "noun_meaning": "Nghĩa (n) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "verb_meaning": "Nghĩa (v) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "adj_meaning": "Nghĩa (adj/adv) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "meaning": "Nghĩa chung TỐI ĐA 5 TỪ nếu không chia được", "synonym": "tối thiểu 3 từ đồng nghĩa và tối đa là 7 từ đồng nghĩa", "usage": "1 câu ví dụ ngắn"}]`;
  };

  const handleSaveJson = async () => {
    setJsonSaveStatus("đang xử lý...");
    try {
      let raw = jsonPasteInput.trim().replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("Không tìm thấy mảng JSON hợp lệ!");
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("JSON rỗng hoặc sai định dạng!");
      await onSaveWord(activeTab, parsed);
      setJsonSaveStatus("✅ Lưu thành công " + parsed.length + " từ!");
      setTimeout(() => {
        setShowJsonModal(false);
        setJsonWordsInput(""); setJsonPasteInput("");
        setJsonModalStep(1); setJsonSaveStatus("");
      }, 1500);
    } catch (e) {
      setJsonSaveStatus("❌ Lỗi: " + e.message);
    }
  };

  /// HÀM LÕI 1: GỌI AI DỊCH LẺ 1 TỪ (ĐÃ ÉP BẮT BUỘC TRẢ VỀ LOẠI TỪ)
  const fetchAI = async (wordInput, currentTab) => {
      const API_KEY = getActiveKey();
      if (!API_KEY) throw new Error("No_API");
      
      if (!window.globalCachedModel) {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
          const listData = await listRes.json();
          if (listData.error) {
              const msg = listData.error.message?.toLowerCase() || "";
              if (msg.includes("quota") || msg.includes("expired") || listData.error.code === 429 || listData.error.code === 400) {
                  if (rotateKey()) {
                      await new Promise(r => setTimeout(r, 1500));
                      return fetchAI(wordInput, currentTab);
                  }
              }
              throw new Error(listData.error.message);
          }
          const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
          const fastModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
          window.globalCachedModel = fastModel ? fastModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
      }

      let prompt = currentTab === "grammar"
        ? `Giải thích cấu trúc ngữ pháp TOEIC: "${wordInput}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON, KHÔNG giải thích thêm:\n{"word": "${wordInput}", "phonetic": "Công thức đầy đủ (VD: S + V + O)", "meaning": "Ý nghĩa / cách dùng cốt lõi trong 1-2 câu", "usage": "1 câu ví dụ tiếng Anh hoàn chỉnh (có dịch nghĩa tiếng Việt trong ngoặc)"}`
        : currentTab === "collocation"
        ? `Phân tích collocation (cụm từ cố định) tiếng Anh dùng trong TOEIC: "${wordInput}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON, KHÔNG giải thích thêm:\n{"word": "Collocation đầy đủ (VD: make a decision)", "phonetic": "Phiên âm IPA của từ khóa chính", "meaning": "Nghĩa tiếng Việt TỐI ĐA 6 TỪ", "usage": "1 câu ví dụ ngắn trong ngữ cảnh TOEIC", "synonym": "2-4 collocation tương đương hoặc từ đồng nghĩa"}`
        : `Phân tích từ/cụm từ tiếng Anh: "${wordInput}".\nCHỈ TRẢ VỀ DUY NHẤT 1 OBJECT JSON, KHÔNG giải thích thêm:\n{"word": "Từ chuẩn (kèm loại từ)", "phonetic": "Phiên âm IPA", "noun_meaning": "Nghĩa (n) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "verb_meaning": "Nghĩa (v) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "adj_meaning": "Nghĩa (adj/adv) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "meaning": "Nghĩa chung TỐI ĐA 5 TỪ nếu không chia loại từ được", "synonym": "tối thiểu 3 từ đồng nghĩa và tối đa là 7 từ đồng nghĩa", "usage": "1 câu ví dụ ngắn"}`;
      
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

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("AI không trả về nội dung.");
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
          if (listData.error) {
              const msg = listData.error.message?.toLowerCase() || "";
              if (msg.includes("quota") || msg.includes("expired") || listData.error.code === 429 || listData.error.code === 400) {
                  if (rotateKey()) {
                      await new Promise(r => setTimeout(r, 1500));
                      return fetchAIBatch(wordsString, currentTab);
                  }
              }
              throw new Error(listData.error.message);
          }
          const textModels = (listData.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
          const fastModel = textModels.find(m => m.name.includes("1.5-flash")) || textModels.find(m => m.name.includes("flash"));
          window.globalCachedModel = fastModel ? fastModel.name : (textModels.length > 0 ? textModels[0].name : "models/gemini-1.5-flash");
      }

      let prompt = currentTab === "grammar"
        ? `Giải thích các cấu trúc ngữ pháp sau: "${wordsString}".\nCHỈ TRẢ VỀ DUY NHẤT 1 MẢNG JSON:\n[{"word": "cấu trúc", "phonetic": "Công thức", "meaning": "Nghĩa", "usage": "Ví dụ"}]`
        : `Phân tích các từ/cụm từ tiếng Anh sau: "${wordsString}".\nCHỈ TRẢ VỀ DUY NHẤT 1 MẢNG JSON:\n[{"word": "Từ chuẩn (kèm loại từ)", "phonetic": "Phiên âm IPA", "noun_meaning": "Nghĩa (n) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "verb_meaning": "Nghĩa (v) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "adj_meaning": "Nghĩa (adj/adv) TỐI ĐA 5 TỪ TIẾNG VIỆT, để trống nếu không có", "meaning": "Nghĩa chung TỐI ĐA 5 TỪ", "synonym": "tối thiểu 3 từ đồng nghĩa và tối đa là 7 từ đồng nghĩa", "usage": "1 câu ví dụ ngắn"}]`;

      const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
      if (window.globalCachedModel.includes("1.5")) {
          requestBody.generationConfig = { response_mime_type: "application/json" };
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${window.globalCachedModel}:generateContent?key=${API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
      });
      const data = await res.json();

      if (data.error) {
          const msg = data.error.message?.toLowerCase() || "";
          window.globalCachedModel = null;
          if (msg.includes("quota") || msg.includes("expired") || data.error.code === 429) {
              if (rotateKey()) {
                  await new Promise(r => setTimeout(r, 1500));
                  return fetchAIBatch(wordsString, currentTab);
              }
              throw new Error("Hết toàn bộ Key dự phòng!");
          }
          throw new Error(data.error.message);
      }
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("AI không trả về nội dung.");

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
  const renderTags = (wordsArray, color, bgColor, listType, limit = null, isModal = false) => {
    if (!wordsArray || wordsArray.length === 0) return <p style={{ color: "#aaa", fontSize: "14px", fontStyle: "italic", margin: 0 }}>Chưa có từ nào.</p>;
    const sorted = [...wordsArray].sort((a, b) => {
        const wa = (typeof a === 'string' ? a : a.word).toLowerCase();
        const wb = (typeof b === 'string' ? b : b.word).toLowerCase();
        return wa.localeCompare(wb);
    });
    const displayWords = limit ? sorted.slice(0, limit) : sorted;
    
    return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
              {displayWords.map(word => {
                  const wordStr = typeof word === 'string' ? word : word.word;
                  return (
                      <div key={wordStr} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textTransform: "none", width: "100%", boxSizing: "border-box" }}>
                          
                          {/* 1. Phần Bấm vào Chữ để mở Modal */}
                          <span
                           onTouchStart={(e) => {
                                    if (!isModal) return;
                                    let isLongPress = false;
                                    const timer = setTimeout(() => {
                                        isLongPress = true;
                                        setSelectedToDelete(prev => {
                                        const next = new Set(prev);
                                        next.has(wordStr) ? next.delete(wordStr) : next.add(wordStr);
                                        return next;
                                    });
                                }, 500);
                                e.currentTarget._longPressTimer = timer;
                                e.currentTarget._isLongPress = false;
                                e.currentTarget._longPressTimer2 = () => isLongPress;
                            }}
                            onTouchEnd={(e) => {
                                  if (!isModal) return;
                                  clearTimeout(e.currentTarget._longPressTimer);
                                  const wasLongPress = e.currentTarget._longPressTimer2?.();
                                  if (wasLongPress) {
                                    e.preventDefault(); // Chặn click sau long press, KHÔNG toggle lại
                                    return;
                                }
                                // Nếu đang ở chế độ chọn nhiều và chỉ tap nhẹ -> toggle từ đó
                                if (selectedToDelete.size > 0) {
                                    e.preventDefault();
                                    setSelectedToDelete(prev => {
                                        const next = new Set(prev);
                                        next.has(wordStr) ? next.delete(wordStr) : next.add(wordStr);
                                        return next;
                                    });
                                }
                            }}
                            onClick={(e) => {
                                  if (isModal && (e.ctrlKey || e.metaKey)) {
                                      e.stopPropagation();
                                      setSelectedToDelete(prev => {
                                          const next = new Set(prev);
                                          next.has(wordStr) ? next.delete(wordStr) : next.add(wordStr);
                                          return next;
                                      });
                                  } else if (selectedToDelete.size === 0) {
                                      openDetail(wordStr, listType);
                                  }
                              }}
                              style={{
                                  padding: "6px 12px", borderRadius: "20px", fontSize: "14px", wordBreak: "break-word", textAlign: "center", flex: "0 1 70%", minWidth: 0,
                                  backgroundColor: selectedToDelete.has(wordStr) ? "#ffebee" : bgColor,
                                  color: selectedToDelete.has(wordStr) ? "#f44336" : color,
                                  fontWeight: "500", cursor: "pointer",
                                  border: selectedToDelete.has(wordStr) ? "2px solid #f44336" : `1px solid ${color}80`,
                                  boxShadow: selectedToDelete.has(wordStr) ? "0 0 0 2px #ffcdd2" : "0 2px 4px rgba(0,0,0,0.05)",
                                  transition: "all 0.15s"
                              }}>
                              {selectedToDelete.has(wordStr) ? "✓ " : ""}{wordStr}
                          </span>
                          
                          {/* 2. Cụm Nút Bấm Chức Năng (V và X) */}
                          <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                              
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

  const stats = globalStats[activeTab] || {};
  const tabColor = activeTab === "vocab" ? "#FF9800" : activeTab === "collocation" ? "#9C27B0" : "#2196F3";
  const tabGrad  = activeTab === "vocab"
    ? "linear-gradient(135deg,#e65100,#ff6f00)"
    : activeTab === "collocation"
    ? "linear-gradient(135deg,#6a1b9a,#9c27b0)"
    : "linear-gradient(135deg,#1565c0,#1e88e5)";

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, display:"flex", flexDirection:"column", overflow:"hidden", background:"linear-gradient(135deg,#f0f2f5,#e4e8f0)", fontFamily:"inherit", boxSizing:"border-box" }}>


      {/* ===== HÀNG 1: TOPBAR ===== */}
      <div style={{ background: tabGrad, padding:"0 20px", height:"56px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 2px 12px rgba(0,0,0,0.18)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <button onClick={() => { onBack(); }} style={{ background:"rgba(255,255,255,0.18)", border:"none", color:"white", borderRadius:"10px", padding:"6px 12px", cursor:"pointer", fontWeight:"bold", fontSize:"14px", fontFamily:"inherit" }}>← Về</button>
          <span style={{ color:"white", fontWeight:"900", fontSize:"18px", letterSpacing:"0.5px" }}>📖 Sổ Tay Của Tôi</span>
        </div>
        <div style={{ display:"flex", gap:"6px", background:"rgba(0,0,0,0.18)", borderRadius:"12px", padding:"4px" }}>
        </div>
        <button
          disabled={isReloading || isAdding}
          onClick={async () => {
            const dict = globalStats[activeTab]?.addedWordsObj || [];
            if (dict.length === 0) return alert("Chưa có từ nào trong sổ tay!");
            if (!window.confirm(`Reload nghĩa cho ${dict.length} từ? Có thể mất vài phút.`)) return;
            setIsReloading(true); setReloadProgress({ done: 0, total: dict.length });
            let updatedList = [];
            for (let i = 0; i < dict.length; i++) {
              const item = dict[i]; const wordStr = typeof item === "string" ? item : item.word;
              try { const r = await fetchAI(wordStr, activeTab); r.word = wordStr; updatedList.push(r); } catch(e) { updatedList.push(item); }
              setReloadProgress({ done: i + 1, total: dict.length });
              await new Promise(r => setTimeout(r, 300));
            }
            await onSaveWord(activeTab, updatedList);
            setIsReloading(false); alert("✅ Đã cập nhật xong toàn bộ nghĩa!");
          }}
          style={{ background:"rgba(255,255,255,0.18)", border:"none", color:"white", borderRadius:"10px", padding:"6px 14px", cursor: isReloading ? "not-allowed":"pointer", fontWeight:"bold", fontSize:"13px", fontFamily:"inherit", opacity: isReloading ? 0.6 : 1 }}>
          {isReloading ? `🔄 ${reloadProgress.done}/${reloadProgress.total}` : "🔄 Reload nghĩa"}
        </button>
      </div>

      {/* ===== HÀNG 2: THANH NHẬP TỪ ===== */}
      <div style={{ background:"white", padding:"8px 16px", display:"flex", alignItems:"center", gap:"8px", flexShrink:0, borderBottom:"1px solid #e0e0e0", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", overflow:"hidden", minWidth:0 }}>
        <form onSubmit={handleAddNew} style={{ display:"flex", gap:"8px", flex:1 }} noValidate>
          <input
            type="text" value={newWord} onChange={(e) => setNewWord(e.target.value)} disabled={isAdding}
            placeholder={activeTab === "grammar" ? "Nhập cấu trúc ngữ pháp (cách nhau bằng dấu phẩy)..." : "Nhập nhiều từ cách nhau bằng dấu phẩy (,)..."}
            style={{ flex:1, padding:"8px 14px", borderRadius:"10px", border:`1.5px solid ${tabColor}50`, outline:"none", fontSize:"14px", textTransform: activeTab === "grammar" ? "none" : "lowercase", fontFamily:"inherit" }}
            autoComplete="off" autoCorrect="off" spellCheck="false"
          />
          <button type="submit" disabled={!newWord.trim() || isAdding} style={{ padding:"8px 20px", backgroundColor: newWord.trim() ? (isAdding ? "#9e9e9e" : tabColor) : "#e0e0e0", color:"white", border:"none", borderRadius:"10px", fontWeight:"bold", cursor: newWord.trim() && !isAdding ? "pointer":"not-allowed", fontSize:"14px", fontFamily:"inherit", whiteSpace:"nowrap" }}>
            {isAdding ? "🤖 ..." : "➕ Thêm"}
          </button>
        </form>
        <button onClick={() => { playSound("click"); setShowJsonModal(true); setJsonModalStep(1); setJsonWordsInput(""); setJsonPasteInput(""); setJsonSaveStatus(""); }}
          style={{ padding:"8px 14px", background:"#e8f5e9", color:"#2e7d32", border:"1px dashed #4CAF50", borderRadius:"10px", fontWeight:"bold", cursor:"pointer", fontSize:"13px", fontFamily:"inherit", whiteSpace:"nowrap" }}>
          📋 Nhập AI ngoài
        </button>
        {activeTab === "grammar" && (
          <label style={{ padding:"8px 14px", background:"#e3f2fd", color:"#1565c0", border:"1px dashed #90caf9", borderRadius:"10px", fontWeight:"bold", cursor:"pointer", fontSize:"13px", whiteSpace:"nowrap" }}>
            📄 Upload .docx
            <input type="file" accept=".docx" style={{ display:"none" }} onChange={(e) => { const f=e.target.files[0]; if(f && onUploadGrammarFile){ onUploadGrammarFile(f); e.target.value=""; } }} />
          </label>
        )}
      </div>

      {/* ===== HÀNG 3: 3 CỘT TỪ VỰNG ===== */}
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", overflow:"hidden", minHeight:0 }}>

        {/* CỘT 1: Ô VÀNG */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden", borderRight:"2px solid #ffe0b2" }}>
          <div style={{ background:"linear-gradient(135deg,#ff6f00,#ffa000)", padding:"10px 14px", display:"flex", alignItems:"center", gap:"8px", flexShrink:0 }}>
            <span style={{ fontSize:"16px" }}>🔖</span>
            <span style={{ color:"white", fontWeight:"900", fontSize:"13px" }}>
              {activeTab === "grammar" ? "Cấu trúc đã lưu" : "Đang học / Khó nhớ"}
            </span>
            <span style={{ marginLeft:"auto", background:"rgba(255,255,255,0.25)", color:"white", borderRadius:"20px", padding:"2px 10px", fontSize:"12px", fontWeight:"bold" }}>{(stats.savedWords||[]).length}</span>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"10px 12px", display:"flex", flexDirection:"column", gap:"6px", scrollbarWidth:"none", msOverflowStyle:"none" }}>
            {renderTags(stats.savedWords, "#FF9800", "#fff3e0", "savedWords", null, true)}
          </div>
        </div>

        {/* CỘT 2: Ô ĐỎ */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden", borderRight:"2px solid #ffcdd2" }}>
          <div style={{ background:"linear-gradient(135deg,#c62828,#e53935)", padding:"10px 14px", display:"flex", alignItems:"center", gap:"8px", flexShrink:0 }}>
            <span style={{ fontSize:"16px" }}>❌</span>
            <span style={{ color:"white", fontWeight:"900", fontSize:"13px" }}>Làm sai / Cần khắc phục</span>
            <span style={{ marginLeft:"auto", background:"rgba(255,255,255,0.25)", color:"white", borderRadius:"20px", padding:"2px 10px", fontSize:"12px", fontWeight:"bold" }}>{(stats.wrongWords||[]).length}</span>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"10px 12px", display:"flex", flexDirection:"column", gap:"6px", scrollbarWidth:"none", msOverflowStyle:"none" }}>
            {activeTab === "grammar"
              ? <p style={{ color:"#bbb", fontSize:"13px", fontStyle:"italic", textAlign:"center", marginTop:"40px" }}>Không áp dụng cho Ngữ Pháp</p>
              : renderTags(stats.wrongWords, "#F44336", "#ffebee", "wrongWords", null, true)
            }
          </div>
        </div>

        {/* CỘT 3: Ô XANH */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ background:"linear-gradient(135deg,#2e7d32,#43a047)", padding:"10px 14px", display:"flex", alignItems:"center", gap:"8px", flexShrink:0 }}>
            <span style={{ fontSize:"16px" }}>✅</span>
            <span style={{ color:"white", fontWeight:"900", fontSize:"13px" }}>Đã thuộc / Ôn ở Lv Cao</span>
            <span style={{ marginLeft:"auto", background:"rgba(255,255,255,0.25)", color:"white", borderRadius:"20px", padding:"2px 10px", fontSize:"12px", fontWeight:"bold" }}>{(stats.masteredWords||[]).length}</span>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"10px 12px", display:"flex", flexDirection:"column", gap:"6px", scrollbarWidth:"none", msOverflowStyle:"none" }}>
            {activeTab === "grammar"
              ? <p style={{ color:"#bbb", fontSize:"13px", fontStyle:"italic", textAlign:"center", marginTop:"40px" }}>Không áp dụng cho Ngữ Pháp</p>
              : renderTags(stats.masteredWords, "#4CAF50", "#e8f5e9", "masteredWords", null, true)
            }
          </div>
        </div>
      </div>

      {/* ===== MODAL JSON 3 BƯỚC ===== */}
      {showJsonModal && (
        <div onClick={() => setShowJsonModal(false)} style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", zIndex:1200, display:"flex", justifyContent:"center", alignItems:"center", padding:"16px", boxSizing:"border-box" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor:"white", width:"100%", maxWidth:"440px", borderRadius:"16px", padding:"22px", animation:"popIn 0.3s", boxShadow:"0 10px 30px rgba(0,0,0,0.3)", maxHeight:"90vh", overflowY:"auto" }}>
            <h3 style={{ margin:"0 0 6px 0", color:"#2c3e50" }}>📋 Nhập từ bằng AI ngoài</h3>
            <p style={{ margin:"0 0 14px 0", fontSize:"13px", color:"#888" }}>Dùng khi API key hết quota</p>
            <div style={{ display:"flex", gap:"6px", marginBottom:"18px" }}>
              {[1,2,3].map(s => <div key={s} style={{ flex:1, height:"4px", borderRadius:"2px", backgroundColor: jsonModalStep>=s ? "#4CAF50":"#e0e0e0", transition:"0.3s" }} />)}
            </div>
            {jsonModalStep === 1 && (<>
              <p style={{ fontWeight:"bold", color:"#333", marginBottom:"8px" }}>Bước 1: Nhập danh sách từ</p>
              <textarea value={jsonWordsInput} onChange={e => setJsonWordsInput(e.target.value)} placeholder={"apply, absorb, accurate, achieve"} rows={4} style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #ccc", fontSize:"15px", boxSizing:"border-box", resize:"vertical", outline:"none", fontFamily:"inherit" }} />
              <button disabled={!jsonWordsInput.trim()} onClick={() => { playSound("click"); setJsonModalStep(2); }} style={{ width:"100%", marginTop:"12px", padding:"12px", backgroundColor: jsonWordsInput.trim()?"#4CAF50":"#ccc", color:"white", border:"none", borderRadius:"8px", fontWeight:"bold", cursor: jsonWordsInput.trim()?"pointer":"not-allowed" }}>Tiếp theo →</button>
            </>)}
            {jsonModalStep === 2 && (<>
              <p style={{ fontWeight:"bold", color:"#333", marginBottom:"8px" }}>Bước 2: Copy prompt → paste vào AI</p>
              <textarea readOnly value={getPromptForWords(jsonWordsInput.trim(), activeTab)} rows={8} style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #90caf9", fontSize:"13px", boxSizing:"border-box", backgroundColor:"#f0f8ff", fontFamily:"monospace", resize:"none", outline:"none", color:"#1565c0" }} />
              <button onClick={() => { navigator.clipboard.writeText(getPromptForWords(jsonWordsInput.trim(), activeTab)); playSound("click"); alert("✅ Đã copy! Mở ChatGPT/Gemini/Claude → paste → gửi → copy JSON về."); }} style={{ width:"100%", marginTop:"10px", padding:"12px", backgroundColor:"#2196F3", color:"white", border:"none", borderRadius:"8px", fontWeight:"bold", cursor:"pointer" }}>📋 Copy Prompt</button>
              <div style={{ display:"flex", gap:"8px", marginTop:"8px" }}>
                <button onClick={() => setJsonModalStep(1)} style={{ flex:1, padding:"10px", backgroundColor:"#e0e0e0", color:"#333", border:"none", borderRadius:"8px", fontWeight:"bold", cursor:"pointer" }}>← Quay lại</button>
                <button onClick={() => { playSound("click"); setJsonModalStep(3); }} style={{ flex:2, padding:"10px", backgroundColor:"#FF9800", color:"white", border:"none", borderRadius:"8px", fontWeight:"bold", cursor:"pointer" }}>Đã có JSON →</button>
              </div>
            </>)}
            {jsonModalStep === 3 && (<>
              <p style={{ fontWeight:"bold", color:"#333", marginBottom:"8px" }}>Bước 3: Paste JSON từ AI vào đây</p>
              <textarea value={jsonPasteInput} onChange={e => { setJsonPasteInput(e.target.value); setJsonSaveStatus(""); }} placeholder={'[\n  {"word": "apply (v)", "meaning": "áp dụng", ...}\n]'} rows={8} style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #ccc", fontSize:"13px", boxSizing:"border-box", fontFamily:"monospace", resize:"vertical", outline:"none" }} />
              {jsonSaveStatus && <p style={{ margin:"8px 0 0 0", fontWeight:"bold", color: jsonSaveStatus.startsWith("✅")?"#4CAF50":"#f44336" }}>{jsonSaveStatus}</p>}
              <div style={{ display:"flex", gap:"8px", marginTop:"10px" }}>
                <button onClick={() => setJsonModalStep(2)} style={{ flex:1, padding:"10px", backgroundColor:"#e0e0e0", color:"#333", border:"none", borderRadius:"8px", fontWeight:"bold", cursor:"pointer" }}>← Quay lại</button>
                <button disabled={!jsonPasteInput.trim()} onClick={handleSaveJson} style={{ flex:2, padding:"10px", backgroundColor: jsonPasteInput.trim()?"#4CAF50":"#ccc", color:"white", border:"none", borderRadius:"8px", fontWeight:"bold", cursor: jsonPasteInput.trim()?"pointer":"not-allowed" }}>💾 Lưu vào Sổ Tay</button>
              </div>
            </>)}
            <button onClick={() => setShowJsonModal(false)} style={{ width:"100%", marginTop:"12px", padding:"10px", backgroundColor:"#f5f5f5", color:"#666", border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:"bold" }}>✕ Đóng</button>
          </div>
        </div>
      )}

      {/* 1. OVERLAY MODAL: XEM TẤT CẢ (CÓ THANH CUỘN) - ĐÃ FIX REALTIME */}
      {viewAllModal && (
        <div onClick={() => { playSound("click"); setSelectedToDelete(new Set()); setViewAllModal(null); }} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box", cursor: "pointer" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "400px", borderRadius: "15px", padding: "20px", maxHeight: "80vh", display: "flex", flexDirection: "column", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #eee", paddingBottom: "10px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #eee", paddingBottom: "10px", marginBottom: "8px", width: "100%" }}>
                    <h3 style={{ color: viewAllModal.color, margin: 0 }}>
                        {viewAllModal.title} ({(globalStats[activeTab][viewAllModal.listType] || []).length})
                    </h3>
                    <div style={{ minWidth: "80px", display: "flex", justifyContent: "flex-end" }}>
                    {selectedToDelete.size > 0 && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "#999", whiteSpace: "nowrap" }}>{selectedToDelete.size} từ</span>
                        {viewAllModal.listType !== "masteredWords" && (
                            <button
                                title="Chuyển lên Ô Vàng"
                                onClick={() => {
                                    if (!window.confirm(`Đánh dấu ${selectedToDelete.size} từ là ĐÃ THUỘC?`)) return;
                                    onMoveManyWords(activeTab, viewAllModal.listType, "savedWords", [...selectedToDelete]);
                                    setSelectedToDelete(new Set());
                                }}
                                style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: "#4CAF50", color: "white", border: "none", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(76,175,80,0.4)", flexShrink: 0 }}
                            >✅</button>
                        )}
                        <button
                            title="Xóa vĩnh viễn"
                            onClick={() => {
                                if (!window.confirm(`Xóa vĩnh viễn ${selectedToDelete.size} từ đã chọn?`)) return;
                                onRemoveManyWords(activeTab, viewAllModal.listType, [...selectedToDelete]);
                                setSelectedToDelete(new Set());
                            }}
                            style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: "#f44336", color: "white", border: "none", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(244,67,54,0.4)", flexShrink: 0 }}
                        >❌</button>
                    </div>
                )}
                </div>
              </div>
              {/* {selectedToDelete.size === 0 && <p style={{ fontSize: "12px", color: "#aaa", margin: "0 0 8px 0" }}>💡 Giữ Ctrl + click để chọn nhiều từ xóa cùng lúc</p>} */}
              </div>
              {selectedToDelete.size === 0 && <p style={{ fontSize: "12px", color: "#aaa", margin: "0 0 10px 0" }}>💡 PC: Giữ Ctrl + click · Mobile: Nhấn giữ để chọn nhiều từ</p>}
                <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, padding: "10px 0", paddingRight: "4px" }}>                   {renderTags(globalStats[activeTab][viewAllModal.listType] || [], viewAllModal.color, viewAllModal.bgColor, viewAllModal.listType, null, true)}
                </div>
                <button onClick={() => { playSound("click"); setSelectedToDelete(new Set()); setViewAllModal(null); }} style={{ width: "100%", padding: "12px", marginTop: "15px", fontSize: "16px", backgroundColor: "#e0e0e0", color: "#333", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>Đóng</button>
            </div>
        </div>
      )}

      {/* 2. OVERLAY MODAL: XEM CHI TIẾT TỪ & CẬP NHẬT/SỬA HÈN */}
     {wordDetailModal && (() => {
        const currentList = ([...(globalStats[activeTab]?.[wordDetailModal.listType] || [])]).sort((a, b) => {
            const wa = (typeof a === 'string' ? a : a.word).toLowerCase();
            const wb = (typeof b === 'string' ? b : b.word).toLowerCase();
            return wa.localeCompare(wb);
        }); 
        const currentIdx = currentList.findIndex(w => (typeof w === "string" ? w : w.word).toLowerCase() === wordDetailModal.wordStr.toLowerCase());
        const goTo = (offset) => {
          const total = currentList.length;
          const newIdx = (currentIdx + offset + total) % total; // vòng lặp
          const newWord = typeof currentList[newIdx] === "string" ? currentList[newIdx] : currentList[newIdx].word;
          openDetail(newWord, wordDetailModal.listType);
        };

        return (
        <div onClick={closeDetailModal} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box", cursor: "pointer" }}>
            <div style={{ width: "100%", maxWidth: "430px" }} onClick={(e) => e.stopPropagation()}>

            <div style={{ backgroundColor: "white", borderRadius: "16px", padding: "22px 25px 25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "default", height: "480px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <button onClick={() => goTo(-1)} disabled={currentIdx <= 0} style={{
                        width: "34px", height: "34px", borderRadius: "50%", border: "none",
                        backgroundColor: currentIdx <= 0 ? "#f5f5f5" : "#e3f2fd",
                        color: currentIdx <= 0 ? "#ccc" : "#1565c0",
                        fontSize: "20px", cursor: currentIdx <= 0 ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: currentIdx <= 0 ? "none" : "0 2px 8px rgba(33,150,243,0.25)",
                        transition: "all 0.2s", flexShrink: 0
                    }}>‹</button>

                    {currentIdx >= 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            {Array.from({length: Math.min(currentList.length, 7)}, (_, i) => {
                                const offset = Math.max(0, Math.min(currentIdx - 3, currentList.length - 7));
                                const realIdx = i + offset;
                                return (
                                    <div key={realIdx} style={{
                                        width: realIdx === currentIdx ? "18px" : "6px",
                                        height: "6px", borderRadius: "3px",
                                        backgroundColor: realIdx === currentIdx ? "#2196F3" : "#ddd",
                                        transition: "all 0.3s", flexShrink: 0
                                    }} />
                                );
                            })}
                            <span style={{ fontSize: "12px", color: "#aaa", marginLeft: "4px", whiteSpace: "nowrap" }}>
                                {currentIdx + 1}/{currentList.length}
                            </span>
                        </div>
                    )}

                    <button onClick={() => goTo(1)} disabled={currentIdx >= currentList.length - 1} style={{
                        width: "34px", height: "34px", borderRadius: "50%", border: "none",
                        backgroundColor: currentIdx >= currentList.length - 1 ? "#f5f5f5" : "#e3f2fd",
                        color: currentIdx >= currentList.length - 1 ? "#ccc" : "#1565c0",
                        fontSize: "20px", cursor: currentIdx >= currentList.length - 1 ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: currentIdx >= currentList.length - 1 ? "none" : "0 2px 8px rgba(33,150,243,0.25)",
                        transition: "all 0.2s", flexShrink: 0
                    }}>›</button>
                </div>

                <h2 style={{ fontSize: "26px", color: "#2196F3", margin: "0 0 5px 0" }}>{wordDetailModal.wordStr}</h2>
                {!isEditingManual && (
                    <>
                        {wordDetailModal.detail ? (
                            <div style={{ textAlign: "left", backgroundColor: "#f0f8ff", padding: "15px", borderRadius: "8px", marginTop: "15px", border: "1px dashed #90caf9", flex: 1 }}>
                                {/* ĐÃ FIX: Hiện Công Thức nếu đang ở Tab Ngữ Pháp */}
                                {wordDetailModal.detail.phonetic && (
                                    <p style={{ margin: "0 0 10px 0", fontSize: "15px", fontStyle: "italic", color: "#666", display: "flex", alignItems: "center", gap: "8px" }}>
                                        {activeTab === "grammar" ? (
                                            <span style={{ 
                                              backgroundColor: "#fff3cd", 
                                              color: "#b45309", 
                                              fontWeight: "bold", 
                                              padding: "4px 10px", 
                                              borderRadius: "6px",
                                              border: "1px solid #f59e0b",
                                              fontSize: "15px"
                                            }}>
                                              📐 {wordDetailModal.detail.phonetic}
                                            </span>
                                          ) : wordDetailModal.detail.phonetic}
                                        {activeTab !== "grammar" && (
                                            <button
                                                onClick={() => speakWord(wordDetailModal.wordStr, 'en-US')}
                                                onKeyDown={(e) => { if (e.key === "v" || e.key === "V") speakWord(wordDetailModal.wordStr, 'en-US'); }}
                                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "2px 6px", borderRadius: "50%", backgroundColor: "#e3f2fd", lineHeight: 1 }}
                                            >
                                                🔊
                                            </button>
                                        )}
                                    </p>
                                )}
                                {/* Hiển thị nghĩa theo từng loại từ */}
                                {(wordDetailModal.detail.noun_meaning || wordDetailModal.detail.verb_meaning || wordDetailModal.detail.adj_meaning) ? (
                                    <div style={{ marginBottom: "10px" }}>
                                        <p style={{ margin: "0 0 6px 0", fontSize: "13px", fontWeight: "bold", color: "#555" }}>📖 Nghĩa:</p>
                                        {wordDetailModal.detail.noun_meaning && <p style={{ margin: "0 0 6px 0", fontSize: "18px", color: "#2e7d32" }}>• <strong>(n)</strong> {wordDetailModal.detail.noun_meaning}</p>}
                                        {wordDetailModal.detail.verb_meaning && <p style={{ margin: "0 0 6px 0", fontSize: "18px", color: "#1565c0" }}>• <strong>(v)</strong> {wordDetailModal.detail.verb_meaning}</p>}
                                        {wordDetailModal.detail.adj_meaning && <p style={{ margin: "0 0 6px 0", fontSize: "18px", color: "#6a1b9a" }}>• <strong>(adj/adv)</strong> {wordDetailModal.detail.adj_meaning}</p>}
                                        {wordDetailModal.detail.synonym && <p style={{ margin: "8px 0 0 0", fontSize: "15px", color: "#e65100" }}>🔀 <strong>Đồng nghĩa:</strong> {wordDetailModal.detail.synonym}</p>}
                                                                            </div>
                                ) : (
                                    <p style={{ margin: "0 0 10px 0", fontSize: "18px", fontWeight: "bold", color: "#4CAF50" }}>{wordDetailModal.detail.meaning}</p>
                                )}
                                {wordDetailModal.detail.usage && <p style={{ margin: "0 0 0 0", fontSize: "14px", color: "#333", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "10px" }}>"{wordDetailModal.detail.usage}"</p>}
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
  const [notebookTab, setNotebookTab] = useState("vocab"); 
  const [customGrammarNotes, setCustomGrammarNotes] = useState([]); // Danh sách file ngữ pháp đã upload
  const [selectedGrammarNoteId, setSelectedGrammarNoteId] = useState(null); // File đang chọn để luyện

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
      } catch (e) {
        console.error("Lỗi đếm tổng số từ:", e);
      }
    };

    fetchTotalWords();
  }, []); 

  useEffect(() => {
    const timeout = setTimeout(() => setAuthChecking(false), 8000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(timeout);
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
          // Load custom grammar notes
          if (data.grammar && data.grammar.customNotes) {
            setCustomGrammarNotes(data.grammar.customNotes);
          }
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
          
          // Chỉ thêm vào Ô Đỏ nếu chưa có, KHÔNG xóa khỏi Ô Vàng
          const alreadyWrong = newWrong.some(w => normalizeWord(w) === normStr);
          if (!alreadyWrong) {
              newWrong.push(itemValue);
              updatePayload[`${type}.wrongWords`] = newWrong;
              shouldUpdateArrays = true;
          }
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


  // === HÀM MỚI: UPLOAD FILE WORD NGỮ PHÁP ===
  const handleUploadGrammarFile = async (file) => {
    if (!currentUser) return;
    playSound("click");

    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert("Chỉ hỗ trợ file .docx!");
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const mammoth = await import('mammoth'); // dynamic import để nhẹ hơn

      const result = await mammoth.extractRawText({ arrayBuffer });
      const rawText = result.value.trim();

      if (!rawText) {
        alert("File rỗng hoặc không đọc được nội dung!");
        return;
      }

      // Tạo object note
      const newNote = {
        id: Date.now().toString(),
        filename: file.name,
        content: rawText,
        uploadedAt: new Date().toISOString(),
        // Có thể thêm structured sau nếu gọi AI làm sạch
      };

      // Lưu vào Firebase
      await updateDoc(doc(db, "users", currentUser.uid), {
        "grammar.customNotes": arrayUnion(newNote)
      });

      // Cập nhật state local
      setCustomGrammarNotes(prev => [...prev, newNote]);

      alert(`✅ Đã thêm file "${file.name}" thành công!`);
    } catch (error) {
      console.error("Lỗi upload file Word:", error);
      alert("Có lỗi khi đọc file. Vui lòng thử file .docx khác.");
    }
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


  const handleMoveManyWords = async (type, fromList, toList, wordsArray) => {
    if (!currentUser || !wordsArray || wordsArray.length === 0) return;
    playSound("click");
    const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
    const normSet = new Set(wordsArray.map(w => normalizeWord(w)));
    try {
        const currentState = globalStats[type] || {};
        let cleanSaved = (currentState.savedWords || []).filter(w => !normSet.has(normalizeWord(w)));
        let cleanWrong = (currentState.wrongWords || []).filter(w => !normSet.has(normalizeWord(w)));
        let cleanMastered = (currentState.masteredWords || []).filter(w => !normSet.has(normalizeWord(w)));

        if (toList === "savedWords") cleanSaved = [...cleanSaved, ...wordsArray];
        if (toList === "wrongWords") cleanWrong = [...cleanWrong, ...wordsArray];
        if (toList === "masteredWords") {
            cleanMastered = [...cleanMastered, ...wordsArray];
            const alreadyMasteredNorms = new Set((currentState.masteredWords || []).map(w => normalizeWord(w)));
            const newlyMasteredCount = wordsArray.filter(w => !alreadyMasteredNorms.has(normalizeWord(w))).length;
            if (newlyMasteredCount > 0) {
                setTodayMasteredCount(prev => {
                    const newVal = prev + newlyMasteredCount;
                    localStorage.setItem("toeic_today_mastered", newVal.toString());
                    return newVal;
                });
            }
        }
        await updateDoc(doc(db, "users", currentUser.uid), {
            [`${type}.savedWords`]: cleanSaved,
            [`${type}.wrongWords`]: cleanWrong,
            [`${type}.masteredWords`]: cleanMastered
        });
        setGlobalStats(prev => {
            const newState = { ...prev };
            newState[type] = { ...newState[type], savedWords: cleanSaved, wrongWords: cleanWrong, masteredWords: cleanMastered };
            return newState;
        });
    } catch (error) { console.error("Lỗi di chuyển nhiều từ:", error); }
};

const handleRemoveManyWords = async (type, listType, wordsArray) => {
    if (!currentUser || !wordsArray || wordsArray.length === 0) return;
    try {
        playSound("click");
        const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
        const normSet = new Set(wordsArray.map(w => normalizeWord(w)));
        const cleanList = (globalStats[type][listType] || []).filter(w => !normSet.has(normalizeWord(w)));
        await updateDoc(doc(db, "users", currentUser.uid), {
            [`${type}.${listType}`]: cleanList
        });
        setGlobalStats(prev => {
            const newState = { ...prev };
            newState[type] = { ...newState[type], [listType]: cleanList };
            return newState;
        });
    } catch(e) { console.error("Lỗi xóa nhiều từ:", e); }
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
  // THAY ĐỔI DÒNG NÀY:
  if (screen === "grammar_settings") {
    return <QuizSettings 
      mode="grammar" 
      onBack={() => setScreen("home")} 
      onStart={(settings) => { setQuizSettings(settings); setScreen("grammar"); }} 
      // Thêm dòng này:
      customGrammarNotes={customGrammarNotes}
    />
  }
  // Line ~1170
  if (screen === "notebook") return <NotebookScreen globalStats={globalStats} onBack={() => { playSound("click"); setScreen("home"); }} onSaveWord={handleSaveDifficultWord} onRemoveWord={handleRemoveWord} onMoveWord={handleMoveWord} onMoveManyWords={handleMoveManyWords} onRemoveManyWords={handleRemoveManyWords} onUploadGrammarFile={handleUploadGrammarFile} customGrammarNotes={customGrammarNotes} defaultTab={notebookTab} />;
  
  // ĐÃ FIX BƯỚC 1: Truyền thêm onMoveWord={handleMoveWord} vào 2 dòng này
  // TÍNH NĂNG MỚI: Nếu Level 3 + Bắn Từ -> Render BlastGameScreen thay vì WordQuiz
  if (screen === "vocab") {
    if (quizSettings?.difficultyLevel === 3 && quizSettings?.blastMode) {
      return <BlastGameScreen mode="vocab" onBack={() => { playSound("click"); setScreen("home"); }} settings={quizSettings} stats={globalStats.vocab} />;
    }
    return <WordQuiz mode="vocab" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} onMoveWord={handleMoveWord} settings={quizSettings} stats={globalStats.vocab} isMusicPlaying={isMusicPlaying} kpi={{target: dailyTarget, current: todayMasteredCount}} />;
  }
  if (screen === "collocation") {
    if (quizSettings?.difficultyLevel === 3 && quizSettings?.blastMode) {
      return <BlastGameScreen mode="collocation" onBack={() => { playSound("click"); setScreen("home"); }} settings={quizSettings} stats={globalStats.collocation} />;
    }
    return <WordQuiz mode="collocation" onBack={() => { playSound("click"); setScreen("home"); }} updateGlobal={updateGlobalStats} onSaveWord={handleSaveDifficultWord} onMoveWord={handleMoveWord} settings={quizSettings} stats={globalStats.collocation} isMusicPlaying={isMusicPlaying} kpi={{target: dailyTarget, current: todayMasteredCount}} />;
  }
  if (screen === "grammar") {
    return <GrammarQuiz 
      onBack={() => { playSound("click"); setScreen("home"); }} 
      updateGlobal={updateGlobalStats} 
      onSaveWord={handleSaveDifficultWord} 
      onMoveWord={handleMoveWord} 
      settings={quizSettings} 
      learnedQuestions={globalStats.grammar.learnedWords || []} 
      globalStats={globalStats} 
      kpi={{target: dailyTarget, current: todayMasteredCount}}
      customGrammarNotes={customGrammarNotes}
      selectedNoteId={quizSettings?.selectedNoteId || null}
    />;
  }
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
    <div onContextMenu={disableRightClick} style={{ height: "100vh", width: "100vw", overflow: "hidden", background: "linear-gradient(135deg, #f5f7fa 0%, #e8edf5 100%)", fontFamily: "inherit" }}>
      
      {showTutorial && (
        <WelcomeTutorial 
          onDismiss={() => {
            localStorage.setItem("toeic_tutorial_seen", "true");
            setShowTutorial(false);
            forcePlayMusic(); 
          }} 
        />
      )}

      {/* ===== SIDEBAR TRÁI (desktop) + TOPBAR (mobile) ===== */}
      <style>{`
        *, *::before, *::after { box-sizing:border-box; }
        html, body, #root { height:100%; overflow:hidden; margin:0; padding:0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes gradientMove { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
        @keyframes heartbeat { 0%,100%{transform:scale(1)} 20%,60%{transform:scale(1.18)} }
        @keyframes fadeSlideUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes popIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
        .home-card { transition: transform 0.18s, box-shadow 0.18s; }
        .home-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important; }
        .mode-btn { transition: transform 0.15s, box-shadow 0.15s; }
        .mode-btn:hover { transform: translateY(-4px) scale(1.03); }
        .options button { border-radius:12px !important; padding:14px !important; font-size:15px !important; transition:all 0.15s !important; font-weight:600 !important; }
        .options button:not(:disabled):hover { border-color:#1565c0 !important; background:#e3f2fd !important; transform:translateY(-2px); }
        .options button.correct { background:linear-gradient(135deg,#2e7d32,#43a047) !important; color:white !important; border-color:transparent !important; }
        .options button.wrong { background:linear-gradient(135deg,#c62828,#e53935) !important; color:white !important; border-color:transparent !important; }
        button.next { background:linear-gradient(135deg,#1565c0,#1976d2) !important; color:white !important; border:none !important; border-radius:14px !important; padding:15px !important; font-size:17px !important; font-weight:bold !important; box-shadow:0 6px 18px rgba(21,101,192,0.3) !important; }
        .container { padding:16px; margin:0 auto; }
        html, body, #root { height: 100%; overflow: hidden; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        .home-layout { display: flex; height: 100vh; width: 100vw; overflow: hidden; }
        @media (min-width: 900px) {
          .home-sidebar { width: 240px; flex-shrink: 0; background: linear-gradient(180deg,#1a237e 0%,#283593 60%,#1565c0 100%); padding: 20px 16px; display:flex; flex-direction:column; height: 100vh; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; }
          .home-main { flex: 1; min-width: 0; padding: 20px 28px; display: flex; flex-direction: column; gap: 14px; height: 100vh; overflow: hidden; box-sizing: border-box; }
          .home-topbar { display: none !important; }
          .sidebar-only { display: flex !important; }
          .main-only-header { display: none !important; }
        }
        @media (max-width: 899px) {
          .home-layout { flex-direction: column; }
          .home-sidebar { display: none; }
          .home-main { flex: 1; min-width: 0; padding: 12px; display: flex; flex-direction: column; gap: 10px; height: 100vh; overflow: hidden; box-sizing: border-box; }
          .home-topbar { display: flex !important; }
          .sidebar-only { display: none !important; }
          .main-only-header { display: flex !important; }
        }
      `}</style>

      <div className="home-layout">

        {/* ===== SIDEBAR (desktop only) ===== */}
        <div className="home-sidebar">
          {/* Logo */}
          <div style={{ marginBottom: "28px", textAlign: "center" }}>
            <div style={{ fontSize: "34px", marginBottom: "6px" }}>🚀</div>
            <div style={{ color: "white", fontWeight: "900", fontSize: "22px", letterSpacing: "1px" }}>TOEIC Master</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginTop: "3px" }}>Luyện thi thông minh</div>
          </div>

          {/* Avatar + tên */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px", padding: "12px 14px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "14px", cursor: "pointer" }}
            onClick={() => { playSound("click"); setShowProfileMenu(!showProfileMenu); }}>
            {currentUser.photoURL
              ? <img src={currentUser.photoURL} alt="Avatar" style={{ width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.4)" }} />
              : <div style={{ width: "42px", height: "42px", borderRadius: "50%", backgroundColor: "#4facfe", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "bold", border: "2px solid rgba(255,255,255,0.4)", flexShrink: 0 }}>
                  {(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}
                </div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "white", fontWeight: "bold", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentUser.displayName || currentUser.email.split('@')[0]}
              </div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.email}</div>
            </div>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>▼</span>

            {/* Dropdown */}
            {showProfileMenu && (
              <>
                <div onClick={(e) => { e.stopPropagation(); setShowProfileMenu(false); }} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 998 }}/>
                <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "60px", left: "20px", right: "20px", backgroundColor: "white", borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.2)", overflow: "hidden", zIndex: 999, animation: "popIn 0.2s ease-out" }}>
                  <button onClick={() => { playSound("click"); setShowProfileMenu(false); setProfileNameInput(currentUser.displayName || ""); setProfileAvatarFile(null); setAvatarPreview(null); setShowProfileModal(true); }}
                    style={{ width: "100%", padding: "12px 16px", textAlign: "left", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: "#333", display: "flex", alignItems: "center", gap: "10px" }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor="#f5f5f5"} onMouseOut={e => e.currentTarget.style.backgroundColor="transparent"}>
                    ⚙️ Chỉnh sửa hồ sơ
                  </button>
                  <div style={{ height: "1px", backgroundColor: "#eee" }}/>
                  <button onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                    style={{ width: "100%", padding: "12px 16px", textAlign: "left", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: "#F44336", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor="#ffebee"} onMouseOut={e => e.currentTarget.style.backgroundColor="transparent"}>
                    🚪 Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Đồng hồ sidebar */}
          <div style={{ padding: "16px 14px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "14px", marginBottom: "20px" }}>
            <div style={{ color: "white", fontWeight: "900", fontSize: "28px", letterSpacing: "2px", lineHeight: 1 }}>{currentFormattedTime}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "12px", marginTop: "5px" }}>{currentFormattedDate}</div>
          </div>

          {/* Nhạc sidebar */}
          <div style={{ padding: "12px 14px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "14px", marginBottom: "20px" }}>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: "bold", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>🎵 Âm nhạc</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={toggleMusic} style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: isMusicPlaying ? "#FF9800" : "rgba(255,255,255,0.15)", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>
                {isMusicPlaying ? "🔊" : "🔇"}
              </button>
              <button onClick={playNextTrack} style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>⏭️</button>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} style={{ width: "70px", cursor: "pointer", accentColor: "#4facfe" }} />
            </div>
          </div>

          {/* Stats sidebar */}
          <div style={{ flex: 1 }}>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: "bold", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>📊 Tiến độ</div>
            {[
              { label: "Từ vựng", count: uniqueVocabCount, total: totalDbWords, pct: vocabPercentage, color: "#4CAF50" },
              { label: "Collocation", count: uniqueCollocCount, total: totalCollocDbWords, pct: collocPercentage, color: "#CE93D8" },
            ].map(s => (
              <div key={s.label} style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px" }}>{s.label}</span>
                  <span style={{ color: s.color, fontSize: "12px", fontWeight: "bold" }}>{s.pct}%</span>
                </div>
                <div style={{ height: "5px", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: "3px" }}>
                  <div style={{ width: `${s.pct}%`, height: "100%", backgroundColor: s.color, borderRadius: "3px", transition: "width 0.5s" }}/>
                </div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", marginTop: "2px" }}>{s.count} / {s.total || "..."}</div>
              </div>
            ))}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px", marginBottom: "4px" }}>Ngữ pháp AI</div>
              <div style={{ height: "5px", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg,#4facfe,#00f2fe,#4facfe)", backgroundSize: "200% 100%", animation: "gradientMove 2s infinite linear", borderRadius: "3px" }}/>
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", marginTop: "2px" }}>{uniqueGrammarCount} câu — Vô hạn đề</div>
            </div>
          </div>
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div className="home-main">

          {/* TOPBAR (mobile only) */}
          <div className="home-topbar" style={{ display: "none", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", padding: "10px 14px", background: "linear-gradient(135deg,#1a237e,#1565c0)", borderRadius: "16px" }}>
            <div>
              <div style={{ color: "white", fontWeight: "900", fontSize: "20px" }}>{currentFormattedTime}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px" }}>{currentFormattedDate}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={toggleMusic} style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: isMusicPlaying ? "#FF9800" : "rgba(255,255,255,0.2)", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>{isMusicPlaying ? "🔊" : "🔇"}</button>
              <button onClick={playNextTrack} style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.2)", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>⏭️</button>
              {/* Avatar mobile */}
              <div onClick={() => { playSound("click"); setShowProfileMenu(!showProfileMenu); }} style={{ position: "relative", cursor: "pointer" }}>
                {currentUser.photoURL
                  ? <img src={currentUser.photoURL} alt="av" style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.5)" }} />
                  : <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#4facfe", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px", border: "2px solid rgba(255,255,255,0.5)" }}>
                      {(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}
                    </div>
                }
                {showProfileMenu && (
                  <>
                    <div onClick={(e) => { e.stopPropagation(); setShowProfileMenu(false); }} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 998 }}/>
                    <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "40px", right: 0, backgroundColor: "white", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", width: "180px", overflow: "hidden", zIndex: 999, animation: "popIn 0.2s" }}>
                      <button onClick={() => { playSound("click"); setShowProfileMenu(false); setProfileNameInput(currentUser.displayName || ""); setProfileAvatarFile(null); setAvatarPreview(null); setShowProfileModal(true); }}
                        style={{ width: "100%", padding: "11px 14px", textAlign: "left", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "13px", color: "#333" }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor="#f5f5f5"} onMouseOut={e => e.currentTarget.style.backgroundColor="transparent"}>
                        ⚙️ Chỉnh sửa hồ sơ
                      </button>
                      <div style={{ height: "1px", backgroundColor: "#eee" }}/>
                      <button onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                        style={{ width: "100%", padding: "11px 14px", textAlign: "left", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "13px", color: "#F44336", fontWeight: "bold" }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor="#ffebee"} onMouseOut={e => e.currentTarget.style.backgroundColor="transparent"}>
                        🚪 Đăng xuất
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* GREETING */}
          <div style={{ animation: "fadeSlideUp 0.4s ease-out", flexShrink: 0 }}>
            <h1 style={{ margin: "0 0 4px 0", fontSize: "clamp(22px, 3vw, 30px)", fontWeight: "900", color: "#1a237e" }}>
              Xin chào, {currentUser.displayName?.split(' ').pop() || currentUser.email.split('@')[0]} 👋
            </h1>
            <p style={{ margin: 0, color: "#7f8c8d", fontSize: "14px" }}>Hôm nay học gì nào? Mỗi từ là một bước tiến.</p>
          </div>

          {/* KỶ LUẬT THÉP */}
          <div className="home-card" onClick={() => { playSound("click"); setShowPlanModal(true); }}
            style={{ background: "linear-gradient(135deg,#fff8f0,#fff3e0)", padding: "12px 18px", borderRadius: "16px", border: "2px solid #ffe0b2", cursor: "pointer", boxShadow: "0 4px 16px rgba(255,152,0,0.1)", animation: "fadeSlideUp 0.45s ease-out", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <div style={{ fontWeight: "800", color: "#e65100", fontSize: "16px" }}>🔥 Kỷ Luật Thép</div>
                <div style={{ fontSize: "12px", color: "#bf360c", marginTop: "2px" }}>Hôm nay: <strong>{todayMasteredCount}</strong> / {dailyTarget > 0 ? dailyTarget : "?"} từ</div>
              </div>
              <span style={{ fontSize: "13px", backgroundColor: countdownText ? "#ffcdd2" : "#ffe0b2", color: countdownText ? "#d32f2f" : "#e65100", padding: "5px 12px", borderRadius: "20px", fontWeight: "bold", animation: countdownText ? "heartbeat 1s infinite" : "none" }}>
                {dailyTarget > 0 ? (countdownText || "⏰ " + studyTime) : "Cài đặt →"}
              </span>
            </div>
            <div style={{ height: "10px", backgroundColor: "#ffe0b2", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ width: (dailyTarget > 0 ? Math.min((todayMasteredCount / dailyTarget) * 100, 100) : 0) + "%", height: "100%", background: todayMasteredCount >= dailyTarget && dailyTarget > 0 ? "linear-gradient(90deg,#43a047,#66bb6a)" : "linear-gradient(90deg,#FF9800,#ffb74d)", transition: "width 0.5s ease-out", borderRadius: "5px" }}/>
            </div>
          </div>

          {/* SHORTCUT SỔ TAY 3 Ô */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", animation: "fadeSlideUp 0.5s ease-out", flexShrink: 0 }}>
            {[
              { icon: "📚", label: "Từ Vựng", tab: "vocab", saved: (globalStats.vocab.savedWords||[]).length, wrong: (globalStats.vocab.wrongWords||[]).length, mastered: (globalStats.vocab.masteredWords||[]).length, color: "#2e7d32", bg: "linear-gradient(135deg,#e8f5e9,#f1f8f1)", border: "#c8e6c9", bar: "#4CAF50" },
              { icon: "🔗", label: "Colloc.", tab: "collocation", saved: (globalStats.collocation.savedWords||[]).length, wrong: (globalStats.collocation.wrongWords||[]).length, mastered: (globalStats.collocation.masteredWords||[]).length, color: "#6a1b9a", bg: "linear-gradient(135deg,#f3e5f5,#f9f2fb)", border: "#e1bee7", bar: "#9C27B0" },
              { icon: "🤖", label: "Ngữ Pháp", tab: "grammar", saved: (globalStats.grammar.savedWords||[]).length, wrong: (globalStats.grammar.wrongWords||[]).length, mastered: (globalStats.grammar.masteredWords||[]).length, color: "#1565c0", bg: "linear-gradient(135deg,#e3f2fd,#f0f7ff)", border: "#bbdefb", bar: "#2196F3" },
            ].map(c => (
              <div key={c.label} className="home-card" onClick={() => { playSound("click"); setNotebookTab(c.tab); setScreen("notebook"); }}
                style={{ background: c.bg, padding: "14px 12px", borderRadius: "16px", border: `1.5px solid ${c.border}`, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", textAlign: "left", cursor: "pointer" }}>
                <div style={{ fontSize: "20px", marginBottom: "5px" }}>{c.icon}</div>
                <div style={{ fontWeight: "800", color: c.color, fontSize: "12px", marginBottom: "8px" }}>{c.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "#FF9800" }}>⭐ Ghim</span>
                    <span style={{ fontWeight: "bold", color: "#555" }}>{c.saved}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "#f44336" }}>❌ Sai</span>
                    <span style={{ fontWeight: "bold", color: "#555" }}>{c.wrong}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "#4CAF50" }}>✅ Thuộc</span>
                    <span style={{ fontWeight: "bold", color: "#555" }}>{c.mastered}</span>
                  </div>
                </div>
                <div style={{ height: "3px", backgroundColor: c.border, borderRadius: "2px" }}>
                  <div style={{ width: `${c.pct}%`, height: "100%", backgroundColor: c.bar, borderRadius: "2px" }}/>
                </div>
                <div style={{ marginTop: "6px", fontSize: "10px", color: c.color, fontWeight: "bold", textAlign: "right" }}>Vào sổ tay →</div>
              </div>
            ))}
          </div>

          {/* MENU CHÍNH */}
          <div style={{ animation: "fadeSlideUp 0.55s ease-out", flex: 1, minHeight: 0 }}>
            <ModeSelectionScreen 
              onModeSelect={(targetScreen) => { playSound("click"); setScreen(targetScreen); }}
              onNotebookClick={() => { playSound("click"); setScreen("notebook"); }}
              globalStats={globalStats}
            />
          </div>

        </div>{/* end home-main */}
      </div>{/* end home-layout */}

      {/* Modals đặt ngoài layout để luôn hiện full screen */}

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