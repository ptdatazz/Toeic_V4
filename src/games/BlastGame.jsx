// src/games/BlastGame.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import confetti from "canvas-confetti";
import { playSound } from "../utils/sound";

function BlastGame({ words, onWin, onBack, initialLives = 3 }) {
  const questions = useMemo(() => [...words].sort(() => Math.random() - 0.5), [words]);
  
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

  // Tính góc nòng súng
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
    setMousePos({ 
      x: Math.min(Math.max(x, 0), 100), 
      y: Math.min(Math.max(y, 0), 100) 
    });
  };

  // Khởi tạo targets cho mỗi câu hỏi
  useEffect(() => {
    const q = questions[qIdx];
    if (!q) return;

    const others = words.filter(w => w.word !== q.word);
    const wrongs = [...others].sort(() => Math.random() - 0.5).slice(0, 3);
    const pool = [...wrongs, q].sort(() => Math.random() - 0.5);

    const usedX = [];
    const fresh = pool.map((opt, i) => {
      let x, tries = 0;
      do {
        x = 12 + Math.random() * 68;
        tries++;
      } while (usedX.some(px => Math.abs(px - x) < 26) && tries < 30);
      usedX.push(x);

      return { 
        ...opt, 
        _x: x, 
        _y: -(18 + i * 28), 
        _speed: 0.1 + Math.random() * 0.05, 
        _key: Math.random() 
      };
    });

    setTargets(fresh);
    setHitIdx(null);
    setMissIdx(null);
    setShooting(false);
    setBulletTrail(null);
    setShowResult(null);
  }, [qIdx, words]);

  // Animation rơi từ
  useEffect(() => {
    if (gameOver) return;

    let running = true;
    const tick = () => {
      if (!running) return;

      setTargets(prev => {
        const next = prev.map(t => ({ ...t, _y: t._y + t._speed }));
        
        const fallen = next.find(t => t._y > 96 && t.word === questions[qIdxRef.current]?.word);
        
        if (fallen && running) {
          running = false;
          setLives(l => {
            const nl = l - 1;
            if (nl <= 0) setGameOver(true);
            return nl;
          });
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

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [qIdx, gameOver, questions]);

  const handleShoot = (opt, idx) => {
    if (shooting || showResult || gameOver) return;

    const q = questions[qIdxRef.current];
    setShooting(true);
    setBulletTrail({ x1: 50, y1: 87, x2: opt._x, y2: Math.max(opt._y + 2, 5) });

    setTimeout(() => setBulletTrail(null), 320);

    setTimeout(() => {
      if (opt.word === q?.word) {
        setHitIdx(idx);
        setShowResult("hit");
        playSound("combo_1");

        scoreRef.current += 1;
        setScore(scoreRef.current);
        setBlastStreak(s => s + 1);

        if (scoreRef.current >= questions.length) {
          setTimeout(() => {
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 });
            playSound("combo_max");
            onWin();
          }, 700);
          return;
        }

        setTimeout(() => {
          const ni = qIdxRef.current + 1;
          qIdxRef.current = ni;
          setQIdx(ni % questions.length);
        }, 800);
      } else {
        setMissIdx(idx);
        setShowResult("miss");
        setBlastStreak(0);
        playSound("wrong");

        setLives(l => {
          const nl = l - 1;
          if (nl <= 0) setGameOver(true);
          return nl;
        });

        setTimeout(() => {
          setShowResult(null);
          setShooting(false);
          setMissIdx(null);
        }, 900);
      }
    }, 350);
  };

  const handleRestart = () => {
    cancelAnimationFrame(animFrameRef.current);
    scoreRef.current = 0;
    qIdxRef.current = 0;
    setQIdx(0);
    setScore(0);
    setLives(initialLives);
    setGameOver(false);
    setShowResult(null);
    setBlastStreak(0);
    setShooting(false);
    setBulletTrail(null);
  };

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <button onClick={onBack} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #ccc", backgroundColor: "#f5f5f5", cursor: "pointer", fontSize: "13px" }}>
          ← Đổi game
        </button>
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

      <div 
        ref={areaRef} 
        onMouseMove={handleMouseMove}
        style={{ 
          position: "relative", width: "100%", height: "340px", 
          background: "linear-gradient(180deg, #0d1b3e 0%, #1a237e 40%, #0a3d62 75%, #01579b 100%)", 
          borderRadius: "12px", overflow: "hidden", border: "2px solid #283593", cursor: "crosshair" 
        }}
      >
        {/* Grid background */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07, pointerEvents: "none" }} xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={`${i*10}%`} y1="0" x2={`${i*10}%`} y2="100%" stroke="#00bcd4" strokeWidth="1"/>)}
          {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="0" y1={`${i*12.5}%`} x2="100%" y2={`${i*12.5}%`} stroke="#00bcd4" strokeWidth="1"/>)}
        </svg>

        {/* Cannon + Bullet */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 18 }} xmlns="http://www.w3.org/2000/svg">
          <line x1={`${barrelTipX}%`} y1={`${barrelTipY}%`} x2={`${mousePos.x}%`} y2={`${mousePos.y}%`} stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" strokeDasharray="6 5"/>
          <circle cx={`${mousePos.x}%`} cy={`${mousePos.y}%`} r="10" stroke="#00e5ff" strokeWidth="1.5" fill="none" opacity="0.85"/>
          <circle cx={`${mousePos.x}%`} cy={`${mousePos.y}%`} r="2" fill="#00e5ff" opacity="0.9"/>
          {/* Crosshair */}
          <line x1={`${mousePos.x - 1.8}%`} y1={`${mousePos.y}%`} x2={`${mousePos.x + 1.8}%`} y2={`${mousePos.y}%`} stroke="#00e5ff" strokeWidth="1.5" opacity="0.9"/>
          <line x1={`${mousePos.x}%`} y1={`${mousePos.y - 3.5}%`} x2={`${mousePos.x}%`} y2={`${mousePos.y + 3.5}%`} stroke="#00e5ff" strokeWidth="1.5" opacity="0.9"/>
          
          {bulletTrail && (
            <>
              <line x1={`${bulletTrail.x1}%`} y1={`${bulletTrail.y1}%`} x2={`${bulletTrail.x2}%`} y2={`${bulletTrail.y2}%`} stroke="#00e5ff" strokeWidth="3" opacity="0.95" style={{ filter: "drop-shadow(0 0 5px #00e5ff)" }}/>
              <circle cx={`${bulletTrail.x2}%`} cy={`${bulletTrail.y2}%`} r="7" fill="#00e5ff" opacity="1" style={{ filter: "drop-shadow(0 0 10px #00e5ff)" }}/>
            </>
          )}
        </svg>

        {/* Targets */}
        {targets.map((opt, idx) => {
          const isHit = hitIdx === idx;
          const isMiss = missIdx === idx;
          return (
            <button
              key={opt._key || idx}
              onClick={() => handleShoot(opt, idx)}
              disabled={shooting || !!showResult || gameOver}
              style={{
                position: "absolute",
                left: `${opt._x}%`,
                top: `${Math.max(opt._y, -10)}%`,
                transform: "translateX(-50%)",
                padding: "7px 14px",
                borderRadius: "20px",
                fontWeight: "bold",
                fontSize: "13px",
                cursor: "crosshair",
                whiteSpace: "nowrap",
                maxWidth: "130px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                zIndex: 10,
                border: isHit ? "2px solid #4CAF50" : isMiss ? "2px solid #F44336" : "2px solid rgba(0,188,212,0.6)",
                backgroundColor: isHit ? "#4CAF50" : isMiss ? "#F44336" : "rgba(13,27,62,0.9)",
                color: isHit || isMiss ? "white" : "#00e5ff",
                boxShadow: isHit ? "0 0 18px #4CAF50" : isMiss ? "0 0 18px #F44336" : "0 0 8px rgba(0,188,212,0.3)",
                opacity: opt._y < -8 ? 0 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {opt.cleanWord || opt.word}
            </button>
          );
        })}

        {/* Cannon base */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "46px", background: "linear-gradient(180deg, rgba(1,87,155,0.5) 0%, rgba(1,87,155,0.95) 100%)", borderTop: "2px solid rgba(0,188,212,0.4)", zIndex: 12 }}/>

        <div style={{ position: "absolute", bottom: "6px", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 15 }}>
          <div style={{ width: "14px", height: "30px", backgroundColor: "#00bcd4", borderRadius: "7px 7px 3px 3px", transform: `rotate(${cannonDeg}deg)`, transformOrigin: "bottom center", boxShadow: "0 0 10px rgba(0,188,212,0.8)" }}/>
          <div style={{ width: "34px", height: "20px", backgroundColor: "#0288d1", borderRadius: "6px", marginTop: "-4px", boxShadow: "0 0 6px rgba(2,136,209,0.6)" }}/>
        </div>

        {showResult && (
          <div style={{ 
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", 
            backgroundColor: showResult === "hit" ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)", 
            zIndex: 30, pointerEvents: "none" 
          }}>
            <span style={{ fontSize: "56px" }}>{showResult === "hit" ? "✅" : "💥"}</span>
          </div>
        )}

        {gameOver && (
          <div style={{ 
            position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.82)", 
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", 
            zIndex: 40, borderRadius: "10px" 
          }}>
            <div style={{ fontSize: "52px" }}>💀</div>
            <h3 style={{ color: "white", margin: "8px 0 4px" }}>Game Over!</h3>
            <p style={{ color: "#aaa", marginBottom: "20px" }}>Đã bắn đúng {score}/{questions.length} từ</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={onBack} style={{ padding: "10px 20px", backgroundColor: "#555", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>← Đổi game</button>
              <button onClick={handleRestart} style={{ padding: "10px 20px", backgroundColor: "#E91E63", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>🔄 Chơi lại</button>
            </div>
          </div>
        )}
      </div>

      <p style={{ textAlign: "center", color: "#888", fontSize: "12px", marginTop: "8px" }}>
        🖱️ Di chuột để ngắm — Click từ để bắn!
      </p>
    </div>
  );
}

export default BlastGame;