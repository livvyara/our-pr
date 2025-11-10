// src/pages/admin/AdminPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 컴포넌트 임포트
import Header from '../../components/common/Header';
import SubNav from '../../components/common/SubNav';
import MobileMenu from '../../components/common/MobileMenu'; 
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader'; 
import AdminSidebar from '../../components/admin/AdminSidebar'; 
import RoleManagementTab from '../../components/admin/RoleManagementTab'; 

// Firebase 임포트
import { auth } from '../../firebase-config';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// CSS 임포트
import '../HomePage.css'; 
import './AdminPage.css'; 

const AdminPage: React.FC = () => {
  const navigate = useNavigate(); 
  
  // --- 상태 관리 ---
  const [selectedMenu, setSelectedMenu] = useState('menu1'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'subadmin' | null>(null);
  const [allowedMenus, setAllowedMenus] = useState<string[]>([]); 
  const [activeAdminMenu, setActiveAdminMenu] = useState('');

  // --- [⭐ 수정] 반응형 + 권한 확인 로직 ---
  useEffect(() => {
    const db = getFirestore();
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          const userRole = userData.role;

          if (userRole === 'admin' || userRole === 'subadmin') {
            setCurrentUserRole(userRole);
            
            if (userRole === 'admin') {
              setAllowedMenus([]); 
            } else {
              setAllowedMenus(userData.adminPermissions || []);
            }
            setIsLoading(false);
          } else {
            alert('접근 권한이 없습니다.');
            navigate('/');
          }
        } else {
          alert('접근 권한이 없습니다.');
          navigate('/');
        }
      } else {
        alert('로그인이 필요합니다.');
        navigate('/login');
      }
    });

    // [⭐ 3. 수정] setIsMobile을 사용하는 handleResize 로직
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile); // <--- 이 부분이 사용됩니다
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    
    // 클린업
    return () => {
      unsubscribeAuth();
      window.removeEventListener('resize', handleResize); // 리스너 제거
    };
  }, [navigate]); 

  // ... (이하 나머지 AdminPage.tsx 코드는 이전과 동일합니다) ...

  // [⭐ 90일 로직] 닉네임 변경 가능 여부 계산
  useEffect(() => {
    if (isLoading) return; 

    if (currentUserRole === 'admin') {
      setActiveAdminMenu('user-manage'); 
    } else if (currentUserRole === 'subadmin') {
      setActiveAdminMenu(allowedMenus[0] || ''); 
    }
  }, [isLoading, currentUserRole, allowedMenus]);


  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };
  const handleAdminMenuClick = (menuKey: string) => { 
    setActiveAdminMenu(menuKey);
  };

  const renderAdminContent = () => { 
    switch (activeAdminMenu) {
      case 'user-manage':
        return ( <div> <h2>회원관리</h2> <p>...</p> </div> );
      case 'partner-manage':
        return ( <div> <h2>파트너 관리</h2> <p>...</p> </div> );
      case 'seller-manage':
        return ( <div> <h2>셀러 관리</h2> <p>...</p> </div> );
      case 'supporter-manage':
        return ( <div> <h2>서포터 관리</h2> <p>...</p> </div> );
      case 'role-manage':
        return <RoleManagementTab />;
      default:
        if (currentUserRole === 'subadmin' && allowedMenus.length === 0) {
          return <div><h2>접근 가능 메뉴 없음</h2><p>관리자에게 권한을 요청하세요.</p></div>;
        }
        return <div>메뉴를 선택하세요.</div>;
    }
  };


  if (isLoading) {
    return (
      <div className="page-container">
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <h2>권한을 확인 중입니다...</h2>
        </main>
      </div>
    );
  }

  return (
    <div className="page-container">
      
      {!isMobile && <RoleHeader />}
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      <main 
        className="main-content admin-main-layout"
        style={{ padding: 0 }}
      >
        {!isMobile && currentUserRole ? ( 
          <>
            <AdminSidebar 
              activeMenu={activeAdminMenu} 
              onMenuClick={handleAdminMenuClick} 
              userRole={currentUserRole} 
              allowedMenus={allowedMenus} 
            />
            <div className="admin-content-area">
              {renderAdminContent()}
            </div>
          </>
        ) : (
          <div style={{ padding: '20px' }}>
            <h2>관리자 페이지 (모바일)</h2>
            <p>모바일 관리자 UI는 별도 기획이 필요합니다.</p>
          </div>
        )}
      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && (
        <MobileMenu onClose={handleMenuClose} />
      )}
    </div>
  );
};

export default AdminPage;