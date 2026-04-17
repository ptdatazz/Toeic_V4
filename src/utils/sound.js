// src/utils/sound.js
export const playSound = (type) => {
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