// src/pages/admin/AdminPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 컴포넌트 임포트 (RoleManagementTab 추가)
import Header from '../../components/common/Header';
import SubNav from '../../components/common/SubNav';
import MobileMenu from '../../components/common/MobileMenu'; 
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader'; 
import AdminSidebar from '../../components/admin/AdminSidebar'; 
import RoleManagementTab from '../../components/admin/RoleManagementTab'; // [⭐ 1. 추가]

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
  
  // [⭐ 2. 수정] 관리자 권한 상태 추가
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'subadmin' | null>(null);
  const [allowedMenus, setAllowedMenus] = useState<string[]>([]); // subadmin의 경우 DB에서 가져온 권한

  // [⭐ 3. 수정] 권한 확인 로직 (allowedMenus 설정 추가)
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
              // admin은 모든 메뉴에 접근 가능
              // (공통 파일에서 모든 키를 가져올 수 있으나, 
              //  AdminSidebar가 role='admin'일 때 알아서 처리하므로 빈 배열로 두어도 됨)
              // 혹은, 명시적으로 모든 권한을 넣어줄 수도 있습니다.
              setAllowedMenus([]); // (AdminSidebar가 admin role을 보고 처리)
            } else {
              // subadmin은 Firestore에 저장된 권한만
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

    // ... (handleResize 로직은 동일) ...
    const handleResize = () => { /* ... */ };
    window.addEventListener('resize', handleResize);
    
    return () => {
      unsubscribeAuth();
      window.removeEventListener('resize', handleResize);
    };
  }, [navigate]); 

  // --- 핸들러 함수 (수정 없음) ---
  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };
  
  // --- [⭐ 4. 수정] AdminSidebar 상태 관리 (activeAdminMenu 기본값 변경) ---
  // admin은 '권한관리'가, subadmin은 '회원관리'(혹은 허용된 첫 메뉴)가 보이도록 설정
  const [activeAdminMenu, setActiveAdminMenu] = useState('');

  // [⭐ 5. 추가] 권한 로드 완료 후, 활성화할 기본 메뉴 설정
  useEffect(() => {
    if (isLoading) return; // 아직 로딩 중이면 실행 안 함

    if (currentUserRole === 'admin') {
      setActiveAdminMenu('user-manage'); // admin은 '회원관리'를 기본값으로
    } else if (currentUserRole === 'subadmin') {
      // subadmin은 허용된 메뉴 목록의 첫 번째 항목을 기본값으로
      setActiveAdminMenu(allowedMenus[0] || ''); 
    }
  }, [isLoading, currentUserRole, allowedMenus]);


  const handleAdminMenuClick = (menuKey: string) => {
    setActiveAdminMenu(menuKey);
  };

  // [⭐ 6. 수정] 'role-manage' 케이스 추가
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
        // admin만 이 케이스에 접근 가능 (Sidebar에서 숨겨짐)
        return <RoleManagementTab />;
      default:
        // subadmin이 권한이 하나도 없을 때
        if (currentUserRole === 'subadmin' && allowedMenus.length === 0) {
          return <div><h2>접근 가능 메뉴 없음</h2><p>관리자에게 권한을 요청하세요.</p></div>;
        }
        return <div>메뉴를 선택하세요.</div>;
    }
  };


  if (isLoading) {
    // ... (로딩 중 뷰) ...
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
        {!isMobile && currentUserRole ? ( // [⭐ 7. 수정] currentUserRole이 확정된 후 렌더링
          <>
            <AdminSidebar 
              activeMenu={activeAdminMenu} 
              onMenuClick={handleAdminMenuClick} 
              userRole={currentUserRole} // [⭐ 8. props 전달]
              allowedMenus={allowedMenus} // [⭐ 8. props 전달]
            />
            <div className="admin-content-area">
              {renderAdminContent()}
            </div>
          </>
        ) : (
          // (모바일 뷰)
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