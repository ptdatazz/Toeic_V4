// src/App.jsx — ĐÃ KHÔI PHỤC ĐẦY ĐỦ TỪ CODE GỐC
import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import "./App.css";

import { auth, db } from "./firebase";
import { signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// --- COMPONENTS ĐÃ TÁCH ---
import AuthScreen from "./components/auth/AuthScreen";
import HomeScreen from "./components/home/HomeScreen";
import WelcomeTutorial from "./components/home/WelcomeTutorial";
import QuizSettings from "./components/settings/QuizSettings";
import BlastGameScreen from "./games/BlastGameScreen";
import VocabQuiz from "./quiz/VocabQuiz";
import CollocationQuiz from "./quiz/CollocationQuiz";
import GrammarQuiz from "./quiz/GrammarQuiz";
import NotebookScreen from "./components/notebook/NotebookScreen";

import { playSound } from "./utils/sound";

// --- HỆ THỐNG API KEY ---
const RAW_KEYS = import.meta.env.VITE_GEMINI_API_KEY || "";
const GLOBAL_API_KEYS = RAW_KEYS.split(',').map(k => k.trim()).filter(k => k);
let globalKeyIndex = 0;

export const getActiveKey = () => GLOBAL_API_KEYS[globalKeyIndex] || "";
export const rotateKey = () => {
  if (globalKeyIndex < GLOBAL_API_KEYS.length - 1) {
    globalKeyIndex++;
    console.log(`[HỆ THỐNG] 🔄 Đã chuyển sang API Key số ${globalKeyIndex + 1}`);
    return true;
  }
  globalKeyIndex = 0;
  console.log(`[HỆ THỐNG] 🔁 Reset về Key số 1`);
  return false;
};

// --- BỘ MÁY NHẠC NỀN ---
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

// --- APP CHÍNH ---
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [screen, setScreen] = useState("home");
  const [notebookTab, setNotebookTab] = useState("vocab");
  const [quizSettings, setQuizSettings] = useState(null);
  const [customGrammarNotes, setCustomGrammarNotes] = useState([]);

  // --- STATS ---
  const [globalStats, setGlobalStats] = useState({
    vocab:       { correct: 0, total: 0, learnedWords: [], savedWords: [], wrongWords: [], masteredWords: [], addedWordsObj: [] },
    collocation: { correct: 0, total: 0, learnedWords: [], savedWords: [], wrongWords: [], masteredWords: [], addedWordsObj: [] },
    grammar:     { correct: 0, total: 0, learnedWords: [], savedWords: [], wrongWords: [], masteredWords: [], customNotes: [] }
  });

  // --- TỔNG SỐ TỪ GOOGLE SHEET ---
  const [totalDbWords, setTotalDbWords] = useState(() => parseInt(localStorage.getItem("toeic_total_db_words")) || 0);
  const [totalCollocDbWords, setTotalCollocDbWords] = useState(() => parseInt(localStorage.getItem("toeic_total_colloc_db_words")) || 0);

  // --- KỶ LUẬT THÉP ---
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(() => parseInt(localStorage.getItem("toeic_daily_target")) || 0);
  const [studyTime, setStudyTime] = useState(() => localStorage.getItem("toeic_study_time") || "20:00");
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
  const [countdownText, setCountdownText] = useState(null);

  // --- PROFILE ---
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileAvatarFile, setProfileAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // --- ĐỔI TÊN ---
  const [showNameModal, setShowNameModal] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // --- TUTORIAL ---
  const [showTutorial, setShowTutorial] = useState(false);

  // --- NHẠC ---
  const [isMusicPlaying, setIsMusicPlaying] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(Math.floor(Math.random() * BGM_PLAYLIST.length));
  const [volume, setVolume] = useState(0.4);

  // ==============================================================
  // EFFECTS
  // ==============================================================

  // Lấy tổng số từ Google Sheet
  useEffect(() => {
    const fetchTotalWords = async () => {
      try {
        const SHEET_ID = "1nAdOxZBZ3-Bawh3Ks54KaIYLPgGZfTuchebwbCYW8dU";
        const fetchRows = async (sheetName) => {
          const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${sheetName}`;
          const res = await fetch(url);
          const text = await res.text();
          const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
          const result = JSON.parse(jsonString);
          return result.table.rows.length;
        };
        const vocabRows = await fetchRows("Vocab");
        setTotalDbWords(vocabRows);
        localStorage.setItem("toeic_total_db_words", vocabRows);
        const collocRows = await fetchRows("Collocation");
        setTotalCollocDbWords(collocRows);
        localStorage.setItem("toeic_total_colloc_db_words", collocRows);
      } catch (e) { console.error("Lỗi đếm tổng số từ:", e); }
    };
    fetchTotalWords();
  }, []);

  // Auth listener
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
          // Fallback cho user cũ
          if (!data.vocab) data.vocab = { correct: 0, total: 0, learnedWords: [] };
          if (!data.vocab.learnedWords) data.vocab.learnedWords = [];
          if (!data.collocation) data.collocation = { correct: 0, total: 0, learnedWords: [] };
          if (!data.collocation.learnedWords) data.collocation.learnedWords = [];
          if (!data.grammar) data.grammar = { correct: 0, total: 0, learnedWords: [] };
          if (!data.grammar.learnedWords) data.grammar.learnedWords = [];
          setGlobalStats(data);
          if (data.grammar?.customNotes) setCustomGrammarNotes(data.grammar.customNotes);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Tutorial
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

  // Volume
  useEffect(() => { globalBgm.volume = volume; }, [volume]);

  // Tạm dừng nhạc khi thu nhỏ tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        globalBgm.pause();
      } else if (isMusicPlaying && (screen === "home" || screen === "notebook") && !showTutorial && currentUser) {
        globalBgm.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isMusicPlaying, screen, showTutorial, currentUser]);

  // Chuyển bài tự động
  useEffect(() => {
    const handleEnded = () => setCurrentTrackIndex(prev => (prev + 1) % BGM_PLAYLIST.length);
    globalBgm.addEventListener("ended", handleEnded);
    return () => globalBgm.removeEventListener("ended", handleEnded);
  }, []);

  // Đổi track
  useEffect(() => {
    globalBgm.src = BGM_PLAYLIST[currentTrackIndex];
    if (isMusicPlaying && (screen === "home" || screen === "notebook") && !showTutorial) {
      globalBgm.play().catch(() => {});
    }
  }, [currentTrackIndex, isMusicPlaying, screen, showTutorial]);

  // Phát/dừng nhạc theo screen
  useEffect(() => {
    if ((screen === "home" || screen === "notebook") && isMusicPlaying && !showTutorial && currentUser) {
      globalBgm.play().catch(() => {});
    } else {
      globalBgm.pause();
    }
  }, [screen, isMusicPlaying, showTutorial, currentUser]);

  // Hệ thống báo thức
  useEffect(() => {
    if (dailyTarget === 0) { setCountdownText(null); return; }
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
    const timer = setInterval(() => {
      const now = new Date();
      const currentHourMin = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      const [targetHour, targetMin] = studyTime.split(':').map(Number);
      const targetDate = new Date();
      targetDate.setHours(targetHour, targetMin, 0, 0);
      const diffMs = targetDate.getTime() - now.getTime();
      if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
        const m = Math.floor(diffMs / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);
        setCountdownText(`⏳ Sắp tới giờ: ${m}:${s.toString().padStart(2,'0')}`);
      } else {
        setCountdownText(null);
      }
      if (currentHourMin === studyTime && now.getSeconds() === 0) {
        playSound("finish");
        if (Notification.permission === "granted") {
          new Notification("⏰ Đến giờ Tu Tiên rồi!", {
            body: `Mục tiêu hôm nay: ${dailyTarget} từ. Vào cày ngay kẻo rớt trình!`
          });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [dailyTarget, studyTime]);

  // ==============================================================
  // HELPERS NHẠC
  // ==============================================================
  const forcePlayMusic = () => {
    if (isMusicPlaying) {
      if (!globalBgm.src || !globalBgm.src.includes(BGM_PLAYLIST[currentTrackIndex])) {
        globalBgm.src = BGM_PLAYLIST[currentTrackIndex];
      }
      globalBgm.play().catch(() => {});
    }
  };

  const toggleMusic = () => {
    playSound("click");
    if (isMusicPlaying) { globalBgm.pause(); }
    else { globalBgm.play().catch(() => alert("Vui lòng click nhẹ vào màn hình rồi bật lại nhạc nhé!")); }
    setIsMusicPlaying(!isMusicPlaying);
  };

  const playNextTrack = () => {
    playSound("click");
    setCurrentTrackIndex(prev => (prev + 1) % BGM_PLAYLIST.length);
    if (!isMusicPlaying) setIsMusicPlaying(true);
  };

  // ==============================================================
  // NAVIGATE
  // ==============================================================
  const handleNavigate = (screenName, tabName = "vocab") => {
    if (screenName === "notebook") setNotebookTab(tabName);
    setScreen(screenName);
  };

  // ==============================================================
  // AUTH
  // ==============================================================
  const handleLogout = async () => {
    playSound("click");
    await signOut(auth);
    setCurrentUser(null);
    globalBgm.pause();
    setIsMusicPlaying(false);
  };

  // ==============================================================
  // KẾ HOẠCH HỌC
  // ==============================================================
  const saveStudyPlan = () => {
    playSound("click");
    localStorage.setItem("toeic_daily_target", dailyTarget.toString());
    localStorage.setItem("toeic_study_time", studyTime);
    setShowPlanModal(false);
    alert("✅ Đã thiết lập Kỷ Luật Thép! Hệ thống sẽ khóa nút thoát nếu chưa cày đủ chỉ tiêu.");
  };

  // ==============================================================
  // PROFILE UPDATE
  // ==============================================================
  const handleProfileUpdate = async () => {
    if (!currentUser) return;
    const trimmedName = profileNameInput.trim();
    const hasNameChange = trimmedName && trimmedName !== currentUser.displayName;
    const hasAvatarChange = !!profileAvatarFile;
    if (!hasNameChange && !hasAvatarChange) { setShowProfileModal(false); return; }
    setIsUpdatingProfile(true);
    setUploadProgress(10);
    try {
      const updateData = {};
      if (hasNameChange) updateData.displayName = trimmedName;
      if (hasAvatarChange) {
        setUploadProgress(40);
        const base64Image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(profileAvatarFile);
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = error => reject(error);
        });
        const formData = new FormData();
        formData.append("image", base64Image);
        const API_KEY = "d5f05cd567b23cdc4af244c9ef4c4d15";
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, { method: "POST", body: formData });
        const imgData = await res.json();
        setUploadProgress(80);
        if (imgData.success) { updateData.photoURL = imgData.data.url; }
        else throw new Error(imgData.error?.message || "Máy chủ ImgBB từ chối ảnh!");
      }
      await updateProfile(currentUser, updateData);
      setUploadProgress(100);
      setCurrentUser({ ...currentUser, displayName: updateData.displayName || currentUser.displayName, photoURL: updateData.photoURL || currentUser.photoURL });
      setShowProfileModal(false);
      setProfileAvatarFile(null);
      setAvatarPreview(null);
      playSound("finish");
    } catch (error) {
      console.error("Lỗi cập nhật profile:", error);
      alert(`Lỗi: ${error.message}`);
    }
    setIsUpdatingProfile(false);
    setUploadProgress(0);
  };

  const handleUpdateName = async () => {
    const trimmedName = newNameInput.trim();
    if (!trimmedName) return alert("Bác chưa nhập tên kìa!");
    setIsUpdatingName(true);
    try {
      await updateProfile(currentUser, { displayName: trimmedName });
      setCurrentUser({ ...currentUser, displayName: trimmedName });
      setShowNameModal(false);
      playSound("finish");
    } catch (error) {
      console.error("Lỗi đổi tên:", error);
      alert("Có lỗi xảy ra, không thể đổi tên lúc này!");
    }
    setIsUpdatingName(false);
  };

  // ==============================================================
  // STATS & WORDS
  // ==============================================================
  const updateGlobalStats = async (type, isCorrect, itemValue = null) => {
    if (!currentUser) return;
    const newCorrect = (globalStats[type]?.correct || 0) + (isCorrect ? 1 : 0);
    const newTotal = (globalStats[type]?.total || 0) + 1;
    const currentState = globalStats[type] || {};
    const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
    const updatePayload = {
      [`${type}.correct`]: newCorrect,
      [`${type}.total`]: newTotal
    };
    let newWrong = [...(currentState.wrongWords || [])];
    let shouldUpdateArrays = false;
    if (itemValue) {
      updatePayload[`${type}.learnedWords`] = arrayUnion(itemValue);
      if (!isCorrect && type !== "grammar") {
        const normStr = normalizeWord(itemValue);
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
        const currentWords = prev[type]?.learnedWords || [];
        if (!currentWords.includes(itemValue)) {
          newState[type].learnedWords = [...currentWords, itemValue];
        }
        if (shouldUpdateArrays) newState[type].wrongWords = newWrong;
      }
      return newState;
    });
  };

  const handleSaveDifficultWord = async (type, wordDataOrArray) => {
    if (!currentUser) return;
    playSound("click");
    const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
    const wordsToProcess = Array.isArray(wordDataOrArray) ? wordDataOrArray : [wordDataOrArray];
    try {
      const currentState = globalStats[type] || {};
      let cleanSaved = [...(currentState.savedWords || [])];
      let cleanWrong = [...(currentState.wrongWords || [])];
      let cleanMastered = [...(currentState.masteredWords || [])];
      let cleanObjs = [...(currentState.addedWordsObj || [])];
      for (let wordData of wordsToProcess) {
        const isFromAI = typeof wordData === "object";
        const wordStr = isFromAI ? wordData.word : wordData;
        const normStr = normalizeWord(wordStr);
        cleanSaved = cleanSaved.filter(w => normalizeWord(w) !== normStr);
        cleanWrong = cleanWrong.filter(w => normalizeWord(w) !== normStr);
        cleanMastered = cleanMastered.filter(w => normalizeWord(w) !== normStr);
        cleanSaved.push(wordStr);
        if (isFromAI) {
          cleanObjs = cleanObjs.filter(obj => normalizeWord(obj.word) !== normStr);
          cleanObjs.push(wordData);
        }
      }
      const updatePayload = {
        [`${type}.savedWords`]: cleanSaved,
        [`${type}.wrongWords`]: cleanWrong,
        [`${type}.masteredWords`]: cleanMastered,
        [`${type}.addedWordsObj`]: cleanObjs
      };
      await updateDoc(doc(db, "users", currentUser.uid), updatePayload);
      setGlobalStats(prev => {
        const newState = { ...prev };
        newState[type] = { ...newState[type], savedWords: cleanSaved, wrongWords: cleanWrong, masteredWords: cleanMastered, addedWordsObj: cleanObjs };
        return newState;
      });
    } catch(e) { console.error("Lỗi lưu từ:", e); }
  };

  const handleMoveWord = async (type, fromList, toList, wordToMove) => {
    if (!currentUser) return;
    playSound("click");
    const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
    const normStr = normalizeWord(wordToMove);
    try {
      const currentState = globalStats[type] || {};
      const cleanSaved = (currentState.savedWords || []).filter(w => normalizeWord(w) !== normStr);
      const cleanWrong = (currentState.wrongWords || []).filter(w => normalizeWord(w) !== normStr);
      const cleanMastered = (currentState.masteredWords || []).filter(w => normalizeWord(w) !== normStr);
      if (toList === "savedWords") cleanSaved.push(wordToMove);
      if (toList === "wrongWords") cleanWrong.push(wordToMove);
      if (toList === "masteredWords") {
        cleanMastered.push(wordToMove);
        const isAlreadyMastered = (currentState.masteredWords || []).some(w => normalizeWord(w) === normStr);
        if (!isAlreadyMastered) {
          setTodayMasteredCount(prev => {
            const newVal = prev + 1;
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
    } catch (error) { console.error("Lỗi di chuyển từ:", error); }
  };

  const handleRemoveWord = async (type, listType, wordToRemove) => {
    if (!currentUser) return;
    try {
      playSound("click");
      await updateDoc(doc(db, "users", currentUser.uid), {
        [`${type}.${listType}`]: arrayRemove(wordToRemove)
      });
      setGlobalStats(prev => {
        const newState = { ...prev };
        newState[type][listType] = (newState[type][listType] || []).filter(w => w !== wordToRemove);
        return newState;
      });
    } catch(e) { console.error("Lỗi xóa từ:", e); }
  };

  const handleMoveManyWords = async (type, fromList, toList, wordsArray) => {
    if (!currentUser || !wordsArray?.length) return;
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
    if (!currentUser || !wordsArray?.length) return;
    try {
      playSound("click");
      const normalizeWord = (w) => w ? w.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() : "";
      const normSet = new Set(wordsArray.map(w => normalizeWord(w)));
      const cleanList = (globalStats[type]?.[listType] || []).filter(w => !normSet.has(normalizeWord(w)));
      await updateDoc(doc(db, "users", currentUser.uid), { [`${type}.${listType}`]: cleanList });
      setGlobalStats(prev => {
        const newState = { ...prev };
        newState[type] = { ...newState[type], [listType]: cleanList };
        return newState;
      });
    } catch (error) { console.error("Lỗi xóa nhiều từ:", error); }
  };

  const handleUploadGrammarFile = async (file) => {
    if (!currentUser || !file) return;
    playSound("click");
    if (!file.name.toLowerCase().endsWith('.docx')) { alert("Chỉ hỗ trợ file .docx!"); return; }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer });
      const rawText = result.value.trim();
      if (!rawText) { alert("File rỗng hoặc không đọc được nội dung!"); return; }
      const newNote = {
        id: Date.now().toString(),
        filename: file.name,
        content: rawText,
        uploadedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, "users", currentUser.uid), { "grammar.customNotes": arrayUnion(newNote) });
      setCustomGrammarNotes(prev => [...prev, newNote]);
      alert(`✅ Đã thêm file "${file.name}" thành công!`);
    } catch (error) {
      console.error("Lỗi upload file Word:", error);
      alert("Có lỗi khi đọc file. Vui lòng thử file .docx khác.");
    }
  };

  // ==============================================================
  // TÍNH TOÁN STATS CHO HOME
  // ==============================================================
  const uniqueVocabCount  = globalStats.vocab?.learnedWords?.length || 0;
  const uniqueCollocCount = globalStats.collocation?.learnedWords?.length || 0;
  const vocabPercentage   = totalDbWords > 0 ? Math.round((uniqueVocabCount / totalDbWords) * 100) : 0;
  const collocPercentage  = totalCollocDbWords > 0 ? Math.round((uniqueCollocCount / totalCollocDbWords) * 100) : 0;

  // ==============================================================
  // LOADING
  // ==============================================================
  if (authChecking) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px" }}>
        <h2>Đang kết nối hệ thống... ⏳</h2>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div onClick={forcePlayMusic}>
        <AuthScreen />
      </div>
    );
  }

  // ==============================================================
  // ROUTING
  // ==============================================================
  if (screen === "vocab_settings") {
    return (
      <QuizSettings
        mode="vocab"
        onBack={() => setScreen("home")}
        onStart={(s) => { setQuizSettings(s); setScreen("vocab"); }}
        customWordsCount={(globalStats.vocab?.savedWords?.length || 0) + (globalStats.vocab?.wrongWords?.length || 0)}
      />
    );
  }

  if (screen === "collocation_settings") {
    return (
      <QuizSettings
        mode="collocation"
        onBack={() => setScreen("home")}
        onStart={(s) => { setQuizSettings(s); setScreen("collocation"); }}
        customWordsCount={(globalStats.collocation?.savedWords?.length || 0) + (globalStats.collocation?.wrongWords?.length || 0)}
      />
    );
  }

  if (screen === "grammar_settings") {
    return (
      <QuizSettings
        mode="grammar"
        onBack={() => setScreen("home")}
        onStart={(s) => { setQuizSettings(s); setScreen("grammar"); }}
        customGrammarNotes={customGrammarNotes}
      />
    );
  }

  if (screen === "vocab") {
    if (quizSettings?.difficultyLevel === 3 && quizSettings?.blastMode) {
      return <BlastGameScreen mode="vocab" onBack={() => { playSound("click"); setScreen("home"); }} settings={quizSettings} stats={globalStats.vocab} />;
    }
    return (
      <VocabQuiz
        onBack={() => { playSound("click"); setScreen("home"); }}
        updateGlobal={updateGlobalStats}
        onSaveWord={handleSaveDifficultWord}
        onMoveWord={handleMoveWord}
        settings={quizSettings}
        stats={globalStats.vocab}
        isMusicPlaying={isMusicPlaying}
        kpi={{ target: dailyTarget, current: todayMasteredCount }}
      />
    );
  }

  if (screen === "collocation") {
    if (quizSettings?.difficultyLevel === 3 && quizSettings?.blastMode) {
      return <BlastGameScreen mode="collocation" onBack={() => { playSound("click"); setScreen("home"); }} settings={quizSettings} stats={globalStats.collocation} />;
    }
    return (
      <CollocationQuiz
        onBack={() => { playSound("click"); setScreen("home"); }}
        updateGlobal={updateGlobalStats}
        onSaveWord={handleSaveDifficultWord}
        onMoveWord={handleMoveWord}
        settings={quizSettings}
        stats={globalStats.collocation}
        isMusicPlaying={isMusicPlaying}
        kpi={{ target: dailyTarget, current: todayMasteredCount }}
      />
    );
  }

  if (screen === "grammar") {
    return (
      <GrammarQuiz
        onBack={() => { playSound("click"); setScreen("home"); }}
        updateGlobal={updateGlobalStats}
        onSaveWord={handleSaveDifficultWord}
        onMoveWord={handleMoveWord}
        settings={quizSettings}
        learnedQuestions={globalStats.grammar?.learnedWords || []}
        globalStats={globalStats}
        kpi={{ target: dailyTarget, current: todayMasteredCount }}
        customGrammarNotes={customGrammarNotes}
        selectedNoteId={quizSettings?.selectedNoteId || null}
      />
    );
  }

  if (screen === "notebook") {
    return (
      <NotebookScreen
        globalStats={globalStats}
        onBack={() => { playSound("click"); setScreen("home"); }}
        onSaveWord={handleSaveDifficultWord}
        onRemoveWord={handleRemoveWord}
        onMoveWord={handleMoveWord}
        onMoveManyWords={handleMoveManyWords}
        onRemoveManyWords={handleRemoveManyWords}
        onUploadGrammarFile={handleUploadGrammarFile}
        customGrammarNotes={customGrammarNotes}
        defaultTab={notebookTab}
      />
    );
  }

  // ==============================================================
  // HOME SCREEN
  // ==============================================================
  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onClick={forcePlayMusic}
      style={{ height: "100vh", width: "100vw", overflow: "hidden", background: "linear-gradient(135deg, #f5f7fa 0%, #e8edf5 100%)", fontFamily: "inherit" }}
    >
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
        .home-layout { display: flex; height: 100vh; width: 100vw; overflow: hidden; }
        @media (min-width: 900px) {
          .home-sidebar { width: 240px; flex-shrink: 0; background: linear-gradient(180deg,#1a237e 0%,#283593 60%,#1565c0 100%); padding: 20px 16px; display:flex; flex-direction:column; height: 100vh; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; }
          .home-main { flex: 1; min-width: 0; padding: 20px 28px; display: flex; flex-direction: column; gap: 14px; height: 100vh; overflow: hidden; box-sizing: border-box; }
          .home-topbar { display: none !important; }
        }
        @media (max-width: 899px) {
          .home-layout { flex-direction: column; }
          .home-sidebar { display: none; }
          .home-main { flex: 1; min-width: 0; padding: 12px; display: flex; flex-direction: column; gap: 10px; height: 100vh; overflow: hidden; box-sizing: border-box; }
          .home-topbar { display: flex !important; }
        }
      `}</style>

      {showTutorial && (
        <WelcomeTutorial
          onDismiss={() => {
            localStorage.setItem("toeic_tutorial_seen", "true");
            setShowTutorial(false);
            forcePlayMusic();
          }}
        />
      )}

      <HomeScreen
        currentUser={currentUser}
        globalStats={{
          ...globalStats,
          vocab: {
            ...globalStats.vocab,
            learned: uniqueVocabCount,
            total: totalDbWords || 1743,
            pinned: globalStats.vocab?.savedWords?.length || 0,
            wrong: globalStats.vocab?.wrongWords?.length || 0,
            mastered: globalStats.vocab?.masteredWords?.length || 0,
          },
          collocation: {
            ...globalStats.collocation,
            learned: uniqueCollocCount,
            total: totalCollocDbWords || 15,
            pinned: globalStats.collocation?.savedWords?.length || 0,
            wrong: globalStats.collocation?.wrongWords?.length || 0,
            mastered: globalStats.collocation?.masteredWords?.length || 0,
          },
          grammar: {
            ...globalStats.grammar,
            done: globalStats.grammar?.learnedWords?.length || 0,
            pinned: globalStats.grammar?.savedWords?.length || 0,
            wrong: globalStats.grammar?.wrongWords?.length || 0,
            mastered: globalStats.grammar?.masteredWords?.length || 0,
          }
        }}
        dailyTarget={dailyTarget}
        studyTime={studyTime}
        todayMasteredCount={todayMasteredCount}
        showTutorial={false}
        onTutorialDismiss={() => setShowTutorial(false)}
        onLogout={handleLogout}
        onOpenProfile={() => {
          setProfileNameInput(currentUser.displayName || "");
          setProfileAvatarFile(null);
          setAvatarPreview(null);
          setShowProfileModal(true);
        }}
        onOpenPlan={() => setShowPlanModal(true)}
        onNavigate={handleNavigate}
        setShowNameModal={setShowNameModal}
        isMusicPlaying={isMusicPlaying}
        onToggleMusic={toggleMusic}
        onNextTrack={playNextTrack}
        volume={volume}
        onVolumeChange={setVolume}
        countdownText={countdownText}
      />

      {/* ===== MODAL ĐỔI TÊN ===== */}
      {showNameModal && (
        <div onClick={() => !isUpdatingName && setShowNameModal(false)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "350px", borderRadius: "16px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: "22px", color: "#2c3e50", margin: "0 0 15px 0" }}>✏️ Đổi Tên Của Bạn</h2>
            <input
              type="text" value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              maxLength={20} autoFocus
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

      {/* ===== MODAL PROFILE ===== */}
      {showProfileModal && (
        <div onClick={() => !isUpdatingProfile && setShowProfileModal(false)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "380px", borderRadius: "16px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", border: "1px solid #eee" }}>
            <h2 style={{ fontSize: "22px", color: "#2c3e50", margin: "0 0 20px 0" }}>⚙️ Cài Đặt Hồ Sơ</h2>
            <div style={{ position: "relative", width: "100px", height: "100px", margin: "0 auto 20px auto", cursor: "pointer" }} onClick={() => document.getElementById('avatarInput').click()}>
              {avatarPreview || currentUser.photoURL ? (
                <img src={avatarPreview || currentUser.photoURL} alt="Avatar" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "4px solid #fff", boxShadow: "0 3px 10px rgba(0,0,0,0.15)" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", backgroundColor: "#4facfe", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px", fontWeight: "bold", border: "4px solid #fff" }}>
                  {(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ position: "absolute", bottom: 0, right: 0, backgroundColor: "white", padding: "6px", borderRadius: "50%", boxShadow: "0 2px 5px rgba(0,0,0,0.2)" }}>✏️</div>
            </div>
            {isUpdatingProfile && uploadProgress > 0 && uploadProgress < 100 && (
              <div style={{ width: "100%", height: "5px", backgroundColor: "#e0e0e0", borderRadius: "5px", margin: "0 auto 15px auto", overflow: "hidden" }}>
                <div style={{ width: `${uploadProgress}%`, height: "100%", backgroundColor: "#4CAF50", transition: "width 0.1s" }}></div>
              </div>
            )}
            <input id="avatarInput" type="file" accept="image/*" onChange={(e) => { const file = e.target.files[0]; if (file) { if (file.size > 2*1024*1024) { return alert("Ảnh phải nhỏ hơn 2MB!"); } setProfileAvatarFile(file); setAvatarPreview(URL.createObjectURL(file)); } }} style={{ display: "none" }} />
            <div style={{ textAlign: "left", marginBottom: "25px" }}>
              <label style={{ fontSize: "14px", color: "#666", fontWeight: "bold" }}>Tên hiển thị (Tối đa 20 chữ)</label>
              <input type="text" value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} maxLength={20}
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px", marginTop: "5px", boxSizing: "border-box", fontWeight: "bold", outline: "none", backgroundColor: isUpdatingProfile ? "#f5f5f5" : "#fff" }}
                disabled={isUpdatingProfile} />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button disabled={isUpdatingProfile} onClick={handleProfileUpdate} style={{ flex: 1, padding: "12px", backgroundColor: isUpdatingProfile ? "#9e9e9e" : "#4CAF50", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: isUpdatingProfile ? "not-allowed" : "pointer" }}>
                {isUpdatingProfile ? `Đang lưu (${uploadProgress}%)...` : "Lưu thay đổi"}
              </button>
              <button disabled={isUpdatingProfile} onClick={() => setShowProfileModal(false)} style={{ flex: 1, padding: "12px", backgroundColor: "#e0e0e0", color: "#333", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL KỶ LUẬT THÉP ===== */}
      {showPlanModal && (
        <div onClick={() => setShowPlanModal(false)} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1200, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", width: "100%", maxWidth: "350px", borderRadius: "20px", padding: "25px", textAlign: "center", animation: "popIn 0.3s", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", border: "2px solid #FF9800" }}>
            <h2 style={{ fontSize: "24px", color: "#e65100", margin: "0 0 5px 0" }}>🔥 Kỷ Luật Thép</h2>
            <p style={{ color: "#666", fontSize: "13px", marginBottom: "20px" }}>Đã bật chế độ này, bạn sẽ <strong>BỊ KHÓA NÚT THOÁT</strong> cho đến khi học đủ số câu quy định.</p>
            <div style={{ textAlign: "left", marginBottom: "15px" }}>
              <label style={{ fontSize: "14px", color: "#333", fontWeight: "bold" }}>🎯 Mục tiêu số câu đúng/ngày:</label>
              <input type="number" min="0" max="500" value={dailyTarget}
                onChange={(e) => setDailyTarget(parseInt(e.target.value) || 0)}
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "18px", marginTop: "5px", boxSizing: "border-box", fontWeight: "bold", textAlign: "center", color: "#4CAF50" }} />
              <p style={{ fontSize: "11px", color: "#999", marginTop: "5px" }}>*Nhập số 0 để Tắt chế độ giam lỏng.</p>
            </div>
            <div style={{ textAlign: "left", marginBottom: "25px" }}>
              <label style={{ fontSize: "14px", color: "#333", fontWeight: "bold" }}>⏰ Giờ báo thức (Gửi thông báo):</label>
              <input type="time" value={studyTime} onChange={(e) => setStudyTime(e.target.value)}
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "18px", marginTop: "5px", boxSizing: "border-box", fontWeight: "bold", textAlign: "center", fontFamily: "inherit" }} />
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