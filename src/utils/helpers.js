// src/utils/helpers.js

export const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const getMeaning = (item) => {
  if (item.meaning && item.meaning.trim()) return item.meaning.trim();
  const parts = [
    item.noun_meaning && `(n) ${item.noun_meaning}`,
    item.verb_meaning && `(v) ${item.verb_meaning}`,
    item.adj_meaning && `(adj) ${item.adj_meaning}`,
  ].filter(Boolean);
  return parts.join(" / ") || "";
};

export const speakWord = (rawText, lang = 'en-US') => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); 
    const cleanText = rawText.replace(/\s*\(.*?\)\s*/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.85;    
    window.speechSynthesis.speak(utterance);
  } else {
    alert("Trình duyệt của bạn không hỗ trợ tính năng đọc âm thanh!");
  }
};

// ==================== THÊM HÀM NÀY VÀO ĐÂY ====================
export const getRandomWrongOptions = (fullData, currentItem, fieldToGet) => {
  const wrongOptions = [];
  let attempts = 0; 
  while (wrongOptions.length < 3 && attempts < 100) {
    const randomItem = fullData[Math.floor(Math.random() * fullData.length)];
    if (randomItem[fieldToGet] !== currentItem[fieldToGet] && 
        !wrongOptions.includes(randomItem[fieldToGet])) {
      wrongOptions.push(randomItem[fieldToGet]);
    }
    attempts++;
  }
  return wrongOptions;
};
// ============================================================