// src/quiz/WordQuiz.jsx
import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { playSound } from "../utils/sound";
import { shuffleArray, getMeaning, speakWord } from "../utils/helpers";
import { generateVocabQuestions } from "../utils/questionGenerator";

function WordQuiz({ 
  mode, 
  onBack, 
  updateGlobal, 
  onSaveWord, 
  onMoveWord, 
  settings, 
  stats, 
  kpi 
}) {
  const DIFFICULTY_LEVEL = settings.difficultyLevel;
  const QUIZ_LIMIT = DIFFICULTY_LEVEL >= 3 ? 999 : settings.quizLimit;
  const TIME_PER_QUESTION = settings.timePerQuestion;
  const REQUIRED_STREAK = settings.requiredStreak;

  const [questionsData, setQuestionsData] = useState([]);
  const [fullVocabData, setFullVocabData] = useState([]);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [lives, setLives] = useState(DIFFICULTY_LEVEL === 3 ? settings.survivalLives : null);
  const [globalTime, setGlobalTime] = useState(DIFFICULTY_LEVEL === 4 ? settings.timeAttackSeconds : null);
  const [streak, setStreak] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);

  const timerRef = useRef(null);
  const typingInputRef = useRef(null);
  const [typingValue, setTypingValue] = useState("");
  const [flashcardPhase, setFlashcardPhase] = useState("learn");
  const [isFlipped, setIsFlipped] = useState(false);
  const [scrambleSelected, setScrambleSelected] = useState([]);

  // Load dữ liệu
  useEffect(() => {
    const loadData = async () => {
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

        // Thêm từ cá nhân từ stats
        if (stats?.addedWordsObj?.length > 0) {
          fullData = [...fullData, ...stats.addedWordsObj];
        }

        setFullVocabData(fullData);

        let selectedData = fullData;

        // Nguồn Custom (Sổ tay)
        if (settings.dataSource === "custom") {
          const customSet = new Set([
            ...(stats.savedWords || []),
            ...(stats.wrongWords || []),
            ...(stats.masteredWords || [])
          ].map(w => w.toLowerCase().trim()));

          selectedData = fullData.filter(item => 
            item.word && customSet.has(item.word.toLowerCase().trim())
          );
        }

        // Shuffle và giới hạn số lượng
        const shuffled = shuffleArray(selectedData).slice(0, QUIZ_LIMIT);
        const questions = generateVocabQuestions(shuffled, fullData, DIFFICULTY_LEVEL);
        
        setQuestionsData(questions);
      } catch (e) {
        console.error("Lỗi load dữ liệu quiz:", e);
      }
    };

    loadData();
  }, [mode, settings.dataSource, stats, QUIZ_LIMIT, DIFFICULTY_LEVEL]);

  // Timer
  useEffect(() => {
    if (DIFFICULTY_LEVEL === 0 || isGameOver || showFeedback) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [current, showFeedback, isGameOver]);

  const handleTimeout = () => {
    playSound("timeout");
    setShowFeedback(true);
    setSelectedAnswer("timeout");

    setTimeout(() => nextQuestion(false), 1200);
  };

  const handleAnswer = (answer) => {
    if (showFeedback) return;

    const currentQuestion = questionsData[current];
    const isCorrect = answer === currentQuestion.answer;

    setSelectedAnswer(answer);
    setShowFeedback(true);
    playSound(isCorrect ? "finish" : "wrong");

    if (isCorrect) {
      setScore(prev => prev + 1);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
      // Lưu từ sai
      if (onSaveWord) onSaveWord(mode, currentQuestion);
    }

    setTimeout(() => nextQuestion(isCorrect), 1500);
  };

  const nextQuestion = (wasCorrect) => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    setTimeLeft(TIME_PER_QUESTION);
    setTypingValue("");
    setScrambleSelected([]);
    setIsFlipped(false);

    if (current + 1 < questionsData.length) {
      setCurrent(prev => prev + 1);
    } else {
      setIsGameOver(true);
      if (score + (wasCorrect ? 1 : 0) >= questionsData.length * 0.8) {
        confetti({ particleCount: 150, spread: 70 });
      }
    }
  };

  const handleTypingSubmit = () => {
    const currentQuestion = questionsData[current];
    const cleanInput = typingValue.trim().toLowerCase();
    const cleanAnswer = currentQuestion.answer.toLowerCase();

    const isCorrect = cleanInput === cleanAnswer;
    handleAnswer(isCorrect ? currentQuestion.answer : "wrong");
  };

  // Render câu hỏi theo type
  const renderQuestion = () => {
    const q = questionsData[current];
    if (!q) return null;

    switch (q.type) {
      case "flashcard":
        return (
          <div onClick={() => setIsFlipped(!isFlipped)} style={{ cursor: "pointer", padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold", marginBottom: "20px" }}>
              {isFlipped ? q.meaning : q.word}
            </div>
            <p style={{ color: "#666" }}>{isFlipped ? "Nhấn để xem từ" : "Nhấn để xem nghĩa"}</p>
          </div>
        );

      case "en_to_vn":
      case "vn_to_en":
        return (
          <div className="options" style={{ display: "grid", gap: "12px" }}>
            {q.options.map((opt, i) => (
              <button 
                key={i}
                onClick={() => handleAnswer(opt)}
                disabled={showFeedback}
                className={showFeedback ? (opt === q.answer ? "correct" : selectedAnswer === opt ? "wrong" : "") : ""}
                style={{ padding: "14px", fontSize: "15px", borderRadius: "12px", border: "2px solid #ddd", background: "white" }}
              >
                {opt}
              </button>
            ))}
          </div>
        );

      case "typing":
        return (
          <div style={{ textAlign: "center" }}>
            <input
              ref={typingInputRef}
              type="text"
              value={typingValue}
              onChange={(e) => setTypingValue(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleTypingSubmit()}
              placeholder="Gõ từ tiếng Anh..."
              style={{ width: "100%", padding: "16px", fontSize: "18px", borderRadius: "12px", border: "2px solid #1565c0", textAlign: "center" }}
            />
            <button onClick={handleTypingSubmit} style={{ marginTop: "12px", padding: "12px 30px" }}>
              Kiểm tra
            </button>
          </div>
        );

      // Các type khác (listening, scramble, part5_vocab...) bạn có thể mở rộng sau
      default:
        return <p>Đang phát triển loại câu hỏi này...</p>;
    }
  };

  if (questionsData.length === 0) {
    return <div style={{ textAlign: "center", padding: "80px" }}>Đang tải câu hỏi...</div>;
  }

  return (
    <div style={{ padding: "16px", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
        <button onClick={onBack} style={{ padding: "8px 16px" }}>← Quay lại</button>
        <div>Câu {current + 1} / {questionsData.length}</div>
        <div>Điểm: {score}</div>
      </div>

      <div style={{ background: "white", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
        {renderQuestion()}
      </div>

      {isGameOver && (
        <div style={{ marginTop: "30px", textAlign: "center" }}>
          <h2>Hoàn thành! 🎉</h2>
          <p>Điểm số: {score} / {questionsData.length}</p>
          <button onClick={onBack} style={{ marginTop: "20px", padding: "14px 32px", fontSize: "16px" }}>
            Về trang chủ
          </button>
        </div>
      )}
    </div>
  );
}

export default WordQuiz;