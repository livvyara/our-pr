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
import { ChatIcons } from './ChatIcons'; 
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

// 장바구니 아이콘 (SVG 최적화)
const CartIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"></circle>
    <circle cx="20" cy="21" r="1"></circle>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
  </svg>
);

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
  
  const [totalUnread, setTotalUnread] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  
  const db = getFirestore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (!currentUser) return;
      
      const chatQ = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
      const unsubChat = onSnapshot(chatQ, (snapshot) => {
          let count = 0;
          snapshot.forEach(doc => {
              const data = doc.data();
              const myReadTime = data.lastRead?.[currentUser.uid]?.toMillis() || 0;
              const updateTime = data.updatedAt?.toMillis() || 0;
              if (updateTime > myReadTime) count++;
          });
          setTotalUnread(count);
      });

      const cartQ = query(collection(db, 'users', currentUser.uid, 'cart'));
      const unsubCart = onSnapshot(cartQ, (snapshot) => {
          setCartCount(snapshot.size);
      });

      return () => {
          unsubChat();
          unsubCart();
      };
  }, [currentUser, db]); // db 의존성 추가

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsChatOpen(false);
      navigate('/');
    } catch (error) {
      console.error("로그아웃 오류:", error);
    }
  };

  // --- 모바일 헤더 ---
  if (isMobile) {
    return (
      <header className="mobile-header">
        <div className="mobile-header-inner">
            {/* 좌측: 햄버거 메뉴 */}
            <div className="mobile-left-group">
                <button className="menu-icon-btn" onClick={onHamburgerPressed} aria-label="메뉴 열기">
                    <ChatIcons.Menu />
                </button>
            </div>
            
            {/* 중앙: 로고 */}
            <Link to="/" className="mobile-logo-link">
                <img src={logoSrc} alt="로고" className="mobile-logo-img" />
            </Link>
            
            {/* 우측: 액션 버튼들 */}
            <div className="mobile-actions">
                {currentUser ? (
                    <>
                        {/* 장바구니 버튼 */}
                        <button className="mobile-icon-btn" onClick={() => navigate('/customer/cart')} aria-label="장바구니">
                            <CartIcon />
                            {cartCount > 0 && <span className="mobile-badge" style={{backgroundColor:'#333'}}>{cartCount}</span>}
                        </button>

                        {/* 채팅 버튼 */}
                        <button className="mobile-icon-btn" onClick={() => setIsChatOpen(!isChatOpen)} aria-label="채팅">
                            <ChatIcons.Chat />
                            {totalUnread > 0 && <span className="mobile-badge">{totalUnread}</span>}
                        </button>
                    </>
                ) : (
                    // 로그인 전: 공간 확보용 더미 (레이아웃 균형)
                    <div className="spacer-56"></div>
                )}
            </div>
        </div>
        {isChatOpen && currentUser && <ChatWidget onClose={() => setIsChatOpen(false)} />}
      </header>
    );
  }

  // --- 데스크톱 헤더 ---
  return (
    <header className="desktop-header">
      <div className="desktop-header-inner" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        
        {/* 로고 */}
        <Link to="/" className="desktop-logo-link">
            <img src={logoSrc} alt="로고" className="desktop-logo-img" />
        </Link>
        
        {/* 메뉴 네비게이션 */}
        <nav className="desktop-nav">
          {!isLoadingMenus ? mainMenus.map((menu) => (
            <button key={menu.key} className="nav-item-btn" onClick={() => onMenuSelected(menu.key)}>
                {menu.title}
            </button>
          )) : (
            <div className="nav-loading">로딩 중...</div>
          )}
        </nav>

        {/* 우측 액션 버튼 */}
        <div className="desktop-actions">
          
          <div className="search-bar-wrapper">
             <div className="search-icon-placeholder">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
             </div>
             <input type="text" placeholder="검색" />
          </div>

          {currentUser && (
              <>
                  <button className="icon-action-btn" onClick={() => navigate('/customer/cart')} title="장바구니">
                      <CartIcon />
                      {cartCount > 0 && <span className="desktop-badge" style={{backgroundColor:'#333'}}>{cartCount}</span>}
                  </button>

                  <button className="icon-action-btn" onClick={() => setIsChatOpen(!isChatOpen)} title="채팅 상담">
                      <ChatIcons.Chat />
                      {totalUnread > 0 && <span className="desktop-badge">{totalUnread}</span>}
                  </button>
              </>
          )}

          <div className="auth-btn-group">
              <button className="btn-text" onClick={currentUser ? handleLogout : () => navigate('/login')}>
                {currentUser ? '로그아웃' : '로그인'}
              </button>

              <button 
                className="btn-primary" 
                style={{ backgroundColor: K_BRAND_COLOR }} 
                onClick={currentUser ? () => navigate('/mypage') : () => navigate('/signup')}
              >
                {currentUser ? '마이페이지' : '회원가입'}
              </button>
          </div>

          {isChatOpen && currentUser && <ChatWidget onClose={() => setIsChatOpen(false)} />}
        </div>
      </div>
    </header>
  );
};

export default Header;