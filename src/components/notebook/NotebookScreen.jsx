// src/components/notebook/NotebookScreen.jsx
import { useState } from "react";
import { playSound } from "../../utils/sound";

function NotebookScreen({
  globalStats,
  onBack,
  onSaveWord,
  onRemoveWord,
  onMoveWord,
  onMoveManyWords,
  onRemoveManyWords,
  onUploadGrammarFile,
  customGrammarNotes = [],
  defaultTab = "vocab"
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedWords, setSelectedWords] = useState([]);

  const tabs = [
    { key: "vocab", label: "Từ Vựng", icon: "🚀" },
    { key: "collocation", label: "Collocation", icon: "🔗" },
    { key: "grammar", label: "Ngữ Pháp", icon: "🤖" },
  ];

  const currentData = globalStats[activeTab] || {};
  const savedWords = currentData.savedWords || [];
  const wrongWords = currentData.wrongWords || [];
  const masteredWords = currentData.masteredWords || [];

  const handleSelectWord = (word) => {
    if (selectedWords.includes(word)) {
      setSelectedWords(selectedWords.filter(w => w !== word));
    } else {
      setSelectedWords([...selectedWords, word]);
    }
  };

  const handleMoveSelected = (toList) => {
    if (selectedWords.length === 0) return;
    playSound("click");
    onMoveManyWords(activeTab, null, toList, selectedWords);
    setSelectedWords([]);
  };

  const handleRemoveSelected = () => {
    if (selectedWords.length === 0) return;
    playSound("click");
    onRemoveManyWords(activeTab, "savedWords", selectedWords); // hoặc wrongWords tùy theo tab
    setSelectedWords([]);
  };

  return (
    <div style={{ height: "100vh", background: "#f8f9fa", display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
      
      {/* Topbar */}
      <div style={{
        background: "linear-gradient(135deg, #1a237e, #1565c0)",
        color: "white",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
      }}>
        <button 
          onClick={() => { playSound("click"); onBack(); }}
          style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "8px 16px", borderRadius: "10px", cursor: "pointer" }}
        >
          ← Về Trang Chủ
        </button>
        <div style={{ fontSize: "18px", fontWeight: "bold" }}>📚 Sổ Tay Cá Nhân</div>
        <div></div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "white", borderBottom: "1px solid #eee" }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { playSound("click"); setActiveTab(tab.key); setSelectedWords([]); }}
            style={{
              flex: 1,
              padding: "16px",
              border: "none",
              background: activeTab === tab.key ? "#f0f7ff" : "transparent",
              color: activeTab === tab.key ? "#1565c0" : "#555",
              fontWeight: activeTab === tab.key ? "bold" : "normal",
              borderBottom: activeTab === tab.key ? "3px solid #1565c0" : "3px solid transparent"
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Nội dung theo tab */}
      <div style={{ flex: 1, padding: "20px", overflow: "auto" }}>
        
        {/* Từ đã Ghim */}
        <div style={{ marginBottom: "30px" }}>
          <h3 style={{ color: "#FF9800", marginBottom: "12px" }}>⭐ Từ đã Ghim ({savedWords.length})</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {savedWords.length > 0 ? (
              savedWords.map((word, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectWord(word)}
                  style={{
                    padding: "10px 16px",
                    background: selectedWords.includes(word) ? "#e3f2fd" : "white",
                    border: selectedWords.includes(word) ? "2px solid #1565c0" : "1px solid #ddd",
                    borderRadius: "12px",
                    cursor: "pointer",
                    fontWeight: "500"
                  }}
                >
                  {word}
                </div>
              ))
            ) : (
              <p style={{ color: "#999" }}>Chưa có từ nào được ghim</p>
            )}
          </div>
        </div>

        {/* Từ Sai */}
        <div style={{ marginBottom: "30px" }}>
          <h3 style={{ color: "#f44336", marginBottom: "12px" }}>❌ Từ làm sai ({wrongWords.length})</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {wrongWords.map((word, index) => (
              <div
                key={index}
                onClick={() => handleSelectWord(word)}
                style={{
                  padding: "10px 16px",
                  background: selectedWords.includes(word) ? "#ffebee" : "white",
                  border: selectedWords.includes(word) ? "2px solid #f44336" : "1px solid #ddd",
                  borderRadius: "12px",
                  cursor: "pointer"
                }}
              >
                {word}
              </div>
            ))}
          </div>
        </div>

        {/* Từ đã Thuộc */}
        <div>
          <h3 style={{ color: "#4CAF50", marginBottom: "12px" }}>✅ Từ đã Thuộc ({masteredWords.length})</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {masteredWords.map((word, index) => (
              <div
                key={index}
                style={{
                  padding: "10px 16px",
                  background: "white",
                  border: "1px solid #c8e6c9",
                  borderRadius: "12px",
                  color: "#2e7d32"
                }}
              >
                {word}
              </div>
            ))}
          </div>
        </div>

        {/* Grammar Custom Notes */}
        {activeTab === "grammar" && (
          <div style={{ marginTop: "40px" }}>
            <h3 style={{ color: "#1565c0", marginBottom: "12px" }}>📄 File Ngữ Pháp của tôi</h3>
            
            <input 
              type="file" 
              accept=".docx" 
              onChange={(e) => onUploadGrammarFile(e.target.files[0])}
              style={{ marginBottom: "16px" }}
            />

            {customGrammarNotes.length > 0 && (
              <div>
                {customGrammarNotes.map(note => (
                  <div key={note.id} style={{ padding: "12px", background: "white", borderRadius: "10px", marginBottom: "10px", border: "1px solid #bbdefb" }}>
                    <strong>{note.filename}</strong>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {new Date(note.uploadedAt).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Bar khi có từ được chọn */}
      {selectedWords.length > 0 && (
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "white",
          padding: "12px 20px",
          boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
          display: "flex",
          gap: "10px",
          zIndex: 100
        }}>
          <button onClick={() => handleMoveSelected("masteredWords")} style={{ flex: 1, padding: "12px", background: "#4CAF50", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold" }}>
            ✅ Chuyển sang Đã Thuộc
          </button>
          <button onClick={() => handleMoveSelected("savedWords")} style={{ flex: 1, padding: "12px", background: "#FF9800", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold" }}>
            ⭐ Ghim lại
          </button>
          <button onClick={handleRemoveSelected} style={{ flex: 1, padding: "12px", background: "#f44336", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold" }}>
            🗑️ Xóa
          </button>
        </div>
      )}
    </div>
  );
}

export default NotebookScreen;