// src/main.tsx (초기 진입점)

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // 👈 BrowserRouter 임포트 확인
import App from './App.tsx';
// import './index.css'; // 전역 스타일

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter> 
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);