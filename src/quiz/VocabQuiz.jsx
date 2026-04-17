// src/quiz/VocabQuiz.jsx
import WordQuiz from "./WordQuiz";

function VocabQuiz(props) {
  return <WordQuiz {...props} mode="vocab" />;
}

export default VocabQuiz;