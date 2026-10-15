import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./companion/screenadj.js"; // 屏幕位置微调：渲染前就把 --adj-top / --adj-bottom 写好
import "./lostnotice.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
