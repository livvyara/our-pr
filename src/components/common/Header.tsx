import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CONTENT_MAX_WIDTH, K_BRAND_COLOR } from '../../constants';
import './Header.css';
import logoSrc from '../../assets/logo.png';
import { auth } from '../../firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useMenu } from '../../contexts/MenuContext'; 
import ChatWidget from './ChatWidget';
import { ChatIcons } from './ChatIcons'; // [NEW] 아이콘
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

interface HeaderProps {
  onMenuSelected: (key: string) => void;
  isMobile: boolean;
  onHamburgerPressed: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuSelected, isMobile, onHamburgerPressed }) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { isLoading: isLoadingMenus, mainMenus } = useMenu();
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // [NEW] 전체 안 읽은 메시지 상태
  const [totalUnread, setTotalUnread] = useState(0);
  const db = getFirestore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // [NEW] 안 읽은 메시지 리스너 (헤더 배지용)
  useEffect(() => {
      if (!currentUser) return;
      
      const q = query(
          collection(db, 'chats'), 
          where('participants', 'array-contains', currentUser.uid)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
          let count = 0;
          snapshot.forEach(doc => {
              const data = doc.data();
              const myReadTime = data.lastRead?.[currentUser.uid]?.toMillis() || 0;
              const updateTime = data.updatedAt?.toMillis() || 0;
              if (updateTime > myReadTime) {
                  count++; // 안 읽은 방 개수
              }
          });
          setTotalUnread(count);
      });

      return () => unsubscribe();
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsChatOpen(false);
      navigate('/');
    } catch (error) {
      console.error("로그아웃 중 오류 발생:", error);
    }
  };

  if (isMobile) {
    return (
      <header className="mobile-header">
        <button className="menu-icon" onClick={onHamburgerPressed}><ChatIcons.Menu /></button>
        <Link to="/" className="logo"><img src={logoSrc} alt="Logo" className="logo-image" /></Link>
        
        {currentUser ? (
             <button className="mobile-chat-icon" onClick={() => setIsChatOpen(!isChatOpen)} style={{position:'relative'}}>
                 <ChatIcons.Chat />
                 {totalUnread > 0 && <span className="header-badge-mobile">{totalUnread}</span>}
             </button>
        ) : <div style={{ width: '56px' }}></div>}
        
        {isChatOpen && currentUser && <ChatWidget onClose={() => setIsChatOpen(false)} />}
      </header>
    );
  }

  return (
    <header className="desktop-header">
      <div className="desktop-header-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        <Link to="/" className="logo"><img src={logoSrc} alt="Logo" className="logo-image" /></Link>
        <nav className="main-nav">
          {!isLoadingMenus && mainMenus.map((menu) => (
            <button key={menu.key} className="menu-button" onClick={() => onMenuSelected(menu.key)}>{menu.title}</button>
          ))}
          {isLoadingMenus && <div className="menu-button" style={{color: '#999'}}>로딩중...</div>}
        </nav>

        <div className="actions">
          <div className="search-container"><input type="text" placeholder="검색..." /></div>

          {currentUser && (
              <button className="chat-icon-button" onClick={() => setIsChatOpen(!isChatOpen)} title="채팅 상담">
                 <ChatIcons.Chat />
                 {totalUnread > 0 && <span className="header-badge">{totalUnread}</span>}
              </button>
          )}

          <button className="login-button" onClick={currentUser ? handleLogout : () => navigate('/login')}>
            {currentUser ? '로그아웃' : '로그인'}
          </button>

          <button className="signup-button" style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }} onClick={currentUser ? () => navigate('/mypage') : () => navigate('/signup')}>
            {currentUser ? '마이페이지' : '회원가입'}
          </button>

          {isChatOpen && currentUser && <ChatWidget onClose={() => setIsChatOpen(false)} />}
        </div>
      </div>
    </header>
  );
};

export default Header;