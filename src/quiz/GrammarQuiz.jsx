// src/quiz/GrammarQuiz.jsx
import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { playSound } from "../utils/sound";
import { speakWord } from "../utils/helpers";

function GrammarQuiz({
  onBack,
  updateGlobal,
  onSaveWord,
  onMoveWord,
  settings,
  globalStats,
  customGrammarNotes = [],
  selectedNoteId = null,
  kpi
}) {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [timeLeft, setTimeLeft] = useState(settings?.timePerQuestion || 30);
  const [explanation, setExplanation] = useState("");

  const timerRef = useRef(null);
  const isCustomMode = settings?.grammarSource === "custom" && selectedNoteId;

  // Tạo câu hỏi (Default hoặc từ file custom)
  useEffect(() => {
    const generateQuestions = async () => {
      let generatedQuestions = [];

      if (isCustomMode) {
        // Lấy file custom
        const selectedNote = customGrammarNotes.find(n => n.id === selectedNoteId);
        if (selectedNote) {
          // TODO: Tích hợp AI để tạo câu hỏi từ nội dung file (sau này có thể gọi Gemini)
          // Hiện tại giả lập một số câu hỏi từ content
          generatedQuestions = [
            {
              question: "Chọn đáp án đúng cho câu sau:",
              sentence: "She _____ to the market yesterday.",
              options: ["go", "went", "gone", "going"],
              answer: "went",
              explanation: "Câu ở thì quá khứ đơn → dùng 'went'."
            },
            // Thêm nhiều câu hơn từ file...
          ];
        }
      } else {
        // Default mode - AI tạo câu hỏi ngẫu nhiên (bạn có thể gọi API Gemini ở đây)
        generatedQuestions = [
          {
            question: "Chọn thì đúng:",
            sentence: "By the time we arrive, the movie _____ .",
            options: ["will start", "will have started", "starts", "started"],
            answer: "will have started",
            explanation: "Dùng thì tương lai hoàn thành (Future Perfect) khi có 'by the time'."
          },
          {
            question: "Cấu trúc Passive Voice:",
            sentence: "This house _____ in 1995.",
            options: ["built", "was built", "is built", "has built"],
            answer: "was built",
            explanation: "Cấu trúc bị động thì quá khứ đơn: was/were + V3."
          }
        ];
      }

      setQuestions(generatedQuestions);
    };

    generateQuestions();
  }, [isCustomMode, selectedNoteId, customGrammarNotes]);

  // Timer
  useEffect(() => {
    if (isGameOver || showFeedback) return;

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
    setTimeout(nextQuestion, 1500);
  };

  const handleAnswer = (answer) => {
    if (showFeedback) return;

    const currentQ = questions[current];
    const isCorrect = answer === currentQ.answer;

    setSelectedAnswer(answer);
    setShowFeedback(true);
    setExplanation(currentQ.explanation || "");

    playSound(isCorrect ? "finish" : "wrong");

    if (isCorrect) {
      setScore(prev => prev + 1);
    } else {
      // Lưu câu hỏi sai vào sổ tay
      if (onSaveWord) onSaveWord("grammar", currentQ);
    }

    setTimeout(nextQuestion, 1800);
  };

  const nextQuestion = () => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    setExplanation("");
    setTimeLeft(settings?.timePerQuestion || 30);

    if (current + 1 < questions.length) {
      setCurrent(prev => prev + 1);
    } else {
      setIsGameOver(true);
      if (score >= questions.length * 0.7) {
        confetti({ particleCount: 100, spread: 70 });
      }
    }
  };

  if (questions.length === 0) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🤖</div>
        <h2>Đang tạo câu hỏi ngữ pháp...</h2>
      </div>
    );
  }

  const currentQ = questions[current];

  return (
    <div style={{ padding: "16px", maxWidth: "900px", margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column" }}>
      
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button onClick={onBack} style={{ padding: "8px 16px", borderRadius: "10px" }}>← Quay lại</button>
        <div>Câu {current + 1} / {questions.length}</div>
        <div>Điểm: {score}</div>
      </div>

      {/* Timer */}
      <div style={{ textAlign: "center", marginBottom: "10px", fontSize: "18px", fontWeight: "bold", color: timeLeft < 10 ? "#f44336" : "#FF9800" }}>
        ⏱️ {timeLeft}s
      </div>

      {/* Câu hỏi */}
      <div style={{
        background: "white",
        borderRadius: "16px",
        padding: "28px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        flex: 1,
        display: "flex",
        flexDirection: "column"
      }}>
        <h3 style={{ margin: "0 0 20px 0", color: "#1a237e" }}>{currentQ.question}</h3>
        
        <div style={{ fontSize: "18px", marginBottom: "30px", lineHeight: "1.6" }}>
          {currentQ.sentence}
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
          {currentQ.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(option)}
              disabled={showFeedback}
              style={{
                padding: "16px",
                fontSize: "16px",
                borderRadius: "12px",
                border: showFeedback 
                  ? (option === currentQ.answer ? "2px solid #4CAF50" : selectedAnswer === option ? "2px solid #f44336" : "1px solid #ddd")
                  : "1px solid #ddd",
                background: showFeedback 
                  ? (option === currentQ.answer ? "#e8f5e9" : selectedAnswer === option ? "#ffebee" : "white")
                  : "white",
                textAlign: "left",
                cursor: showFeedback ? "default" : "pointer",
                transition: "all 0.2s"
              }}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Giải thích */}
        {showFeedback && explanation && (
          <div style={{
            marginTop: "20px",
            padding: "16px",
            background: "#e3f2fd",
            borderRadius: "12px",
            borderLeft: "4px solid #1565c0",
            fontSize: "15px"
          }}>
            <strong>Giải thích:</strong> {explanation}
          </div>
        )}
      </div>

      {/* Kết thúc */}
      {isGameOver && (
        <div style={{ textAlign: "center", marginTop: "30px" }}>
          <h2>Hoàn thành bài luyện Ngữ Pháp! 🎉</h2>
          <p style={{ fontSize: "22px", margin: "10px 0" }}>
            Điểm số: <strong>{score} / {questions.length}</strong>
          </p>
          <button 
            onClick={onBack}
            style={{ 
              marginTop: "20px", padding: "14px 40px", fontSize: "17px", 
              background: "linear-gradient(135deg,#1565c0,#1976d2)", 
              color: "white", border: "none", borderRadius: "12px", fontWeight: "bold" 
            }}
          >
            Về Trang Chủ
          </button>
        </div>
      )}
    </div>
  );
}

export default GrammarQuiz;