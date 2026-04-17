// src/utils/questionGenerator.js
import { shuffleArray, getMeaning, getRandomWrongOptions } from './helpers';

export const generateVocabQuestions = (selectedData, fullData, level) => {
  return selectedData.map((item) => {
    let qType = "en_to_vn"; 

    if (level === 0) qType = "flashcard";
    else if (level === 1) {
      if (Math.random() > 0.5) qType = "vn_to_en";
    }
    else if (level >= 2) {
      const types = ["en_to_vn", "vn_to_en", "typing", "listening"];
      if (!item.word.includes(' ')) types.push("scramble");
      if (item.usage && item.usage.toLowerCase().includes(item.word.toLowerCase())) {
        types.push("part5_vocab");
      }
      qType = types[Math.floor(Math.random() * types.length)];
    }

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
    } else if (qType === "typing" || qType === "scramble" || qType === "flashcard") {
      const cleanAnswer = item.word.replace(/\s*\(.*?\)\s*/g, '').trim();
      questionObj.answer = cleanAnswer;
    }

    return questionObj;
  });
};