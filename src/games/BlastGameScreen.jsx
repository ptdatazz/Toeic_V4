// src/games/BlastGameScreen.jsx
import { useState, useEffect } from "react";
import BlastGame from "./BlastGame";
import { shuffleArray } from "../utils/helpers";

function BlastGameScreen({ mode, onBack, settings, stats }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWords = async () => {
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

        // Thêm từ cá nhân hóa từ stats
        const personalDictionary = stats?.addedWordsObj || [];
        if (personalDictionary.length > 0) {
          const existingWords = new Set(fullData.map(item => item.word.toLowerCase()));
          const uniqueAiWords = personalDictionary.filter(item => !existingWords.has(item.word.toLowerCase()));
          fullData = [...fullData, ...uniqueAiWords];
        }

        let sourceData = fullData;

        // Nếu dùng nguồn Custom (Sổ tay)
        if (settings.dataSource === "custom") {
          const customWordSet = new Set([
            ...(stats?.savedWords || []), 
            ...(stats?.wrongWords || []), 
            ...(stats?.masteredWords || [])
          ].map(w => w.toLowerCase().trim()));

          sourceData = fullData.filter(item => item.word && customWordSet.has(item.word.toLowerCase().trim()));
        }

        const shuffled = shuffleArray(sourceData).slice(0, 30);
        setWords(shuffled.filter(item => item.word));
      } catch (e) {
        console.error("Lỗi load BlastGame:", e);
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [mode, settings.dataSource, stats]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "80px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔫</div>
        <h2 style={{ color: "#880e4f" }}>Đang tải đạn dược...</h2>
        <p style={{ color: "#aaa" }}>Chuẩn bị chiến trường bắn từ!</p>
      </div>
    );
  }

  if (words.length < 4) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "80px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>😅</div>
        <h2 style={{ color: "#e53935" }}>Không đủ từ để chơi!</h2>
        <p style={{ color: "#555" }}>Cần ít nhất 4 từ. Hãy thử nguồn "Default" hoặc thêm từ vào Sổ tay.</p>
        <button 
          onClick={onBack} 
          style={{ 
            marginTop: "20px", padding: "12px 24px", backgroundColor: "#E91E63", 
            color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" 
          }}
        >
          ← Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      <BlastGame 
        words={words} 
        onWin={() => {
          confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 });
          onBack();
        }} 
        onBack={onBack} 
        initialLives={settings.survivalLives || 3} 
      />
    </div>
  );
}

export default BlastGameScreen;