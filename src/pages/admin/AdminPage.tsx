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
import UserManagementTab from '../../components/admin/UserManagementTab';
import PartnerManagementTab from '../../components/admin/PartnerManagementTab'; 
import SellerManagementTab from '../../components/admin/SellerManagementTab'; 
import SupporterManagementTab from '../../components/admin/SupporterManagementTab'; 
import HomepageManagementTab from '../../components/admin/HomepageManagementTab'; // [⭐ 1. 추가]
import ActivityLogTab from '../../components/admin/ActivityLogTab';

// Firebase 모듈
import { auth } from '../../firebase-config';
import { getFirestore, doc, getDoc, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// CSS 임포트
import '../HomePage.css'; // 스티키 푸터용
import './AdminPage.css'; // 관리자 페이지 레이아웃

const AdminPage: React.FC = () => {
  const navigate = useNavigate(); 
  const db = getFirestore();

  // --- 상태 관리 ---
  const [selectedMenu, setSelectedMenu] = useState('menu1'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 
  const [isLoading, setIsLoading] = useState(true); 
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'subadmin' | null>(null);
  const [allowedMenus, setAllowedMenus] = useState<string[]>([]); 
  const [activeAdminMenu, setActiveAdminMenu] = useState(''); 

  // [알림 카운트 state]
  const [partnerPendingCount, setPartnerPendingCount] = useState(0); 
  const [partnerInfoChangeCount, setPartnerInfoChangeCount] = useState(0); 
  const [sellerPendingCount, setSellerPendingCount] = useState(0);
  const [sellerInfoChangeCount, setSellerInfoChangeCount] = useState(0);
  const [supporterPendingCount, setSupporterPendingCount] = useState(0); 
  const [supporterInfoChangeCount, setSupporterInfoChangeCount] = useState(0); 

  // --- 권한 확인 및 반응형 로직 ---
  useEffect(() => {
    
    // 1. 권한 확인
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

            // [⭐ 3. 카운트 조회 (6종)]
            // (파트너)
            const appCollectionRef = collection(db, "partnerApplications");
            const qApps = query(appCollectionRef, where("status", "==", "pending"));
            const countSnapshotApps = await getCountFromServer(qApps);
            setPartnerPendingCount(countSnapshotApps.data().count);
            
            const changeCollectionRef = collection(db, "partnerInfoChangeRequests");
            const qChanges = query(changeCollectionRef, where("status", "==", "pending"));
            const countSnapshotChanges = await getCountFromServer(qChanges);
            setPartnerInfoChangeCount(countSnapshotChanges.data().count);
            
            // (셀러)
            const sellerAppRef = collection(db, "sellerApplications");
            const qSellerApps = query(sellerAppRef, where("status", "==", "pending"));
            const countSellerApps = await getCountFromServer(qSellerApps);
            setSellerPendingCount(countSellerApps.data().count);

            const sellerChangeRef = collection(db, "sellerInfoChangeRequests");
            const qSellerChanges = query(sellerChangeRef, where("status", "==", "pending"));
            const countSellerChanges = await getCountFromServer(qSellerChanges);
            setSellerInfoChangeCount(countSellerChanges.data().count);

            // (서포터)
            const supporterAppRef = collection(db, "supporterApplications");
            const qSupporterApps = query(supporterAppRef, where("status", "==", "pending"));
            const countSupporterApps = await getCountFromServer(qSupporterApps);
            setSupporterPendingCount(countSupporterApps.data().count);

            const supporterChangeRef = collection(db, "supporterInfoChangeRequests");
            const qSupporterChanges = query(supporterChangeRef, where("status", "==", "pending"));
            const countSupporterChanges = await getCountFromServer(qSupporterChanges);
            setSupporterInfoChangeCount(countSupporterChanges.data().count);

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

    // 2. 반응형 로직
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    
    // 클린업
    return () => {
      unsubscribeAuth();
      window.removeEventListener('resize', handleResize);
    };
  }, [navigate, db]); 

  // --- 기본 활성 메뉴 설정 ---
  useEffect(() => {
    if (isLoading) return; 

    if (currentUserRole === 'admin') {
      setActiveAdminMenu('user-manage'); 
    } else if (currentUserRole === 'subadmin') {
      setActiveAdminMenu(allowedMenus[0] || ''); 
    }
  }, [isLoading, currentUserRole, allowedMenus]);


  // --- 핸들러 함수 ---
  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };
  const handleAdminMenuClick = (menuKey: string) => { 
    setActiveAdminMenu(menuKey);
  };

  // [⭐ 4. 수정] 어드민 콘텐츠 렌더링 함수 (홈페이지 관리 케이스 추가)
  const renderAdminContent = () => { 
    switch (activeAdminMenu) {
      case 'user-manage':
        return <UserManagementTab />;
      case 'partner-manage':
        return <PartnerManagementTab 
                  pendingCount={partnerPendingCount} 
                  infoChangeCount={partnerInfoChangeCount} 
                />;
      case 'seller-manage':
        return <SellerManagementTab
                  pendingCount={sellerPendingCount}
                  infoChangeCount={sellerInfoChangeCount}
                />;
      case 'supporter-manage':
        return <SupporterManagementTab
                  pendingCount={supporterPendingCount}
                  infoChangeCount={supporterInfoChangeCount}
                />;
      // [추가]
      case 'homepage-manage':
        return <HomepageManagementTab />;
      case 'role-manage':
        return <RoleManagementTab />;
        case 'activity-log':
        return <ActivityLogTab />; // [⭐ 3. RoleManagementTab -> ActivityLogTab]
      default:
        if (currentUserRole === 'subadmin' && allowedMenus.length === 0) {
          return <div><h2>접근 가능 메뉴 없음</h2><p>관리자에게 권한을 요청하세요.</p></div>;
        }
        return <div>메뉴를 선택하세요.</div>;
    }
  };

  // --- 로딩 중 뷰 ---
  if (isLoading) {
    return (
      <div className="page-container">
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <h2>권한을 확인 중입니다...</h2>
        </main>
      </div>
    );
  }

  // [⭐ 5. 수정] 기본 뷰 (모든 카운트 전달)
  return (
    <div className="page-container">
      
      {!isMobile && <RoleHeader />}
      
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />
      
      <SubNav 
  selectedMenuKey={selectedMenu} 
  onClose={() => setSelectedMenu('')} 
/>

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
              partnerPendingCount={partnerPendingCount}
              partnerInfoChangeCount={partnerInfoChangeCount} 
              sellerPendingCount={sellerPendingCount}
              sellerInfoChangeCount={sellerInfoChangeCount}
              supporterPendingCount={supporterPendingCount}
              supporterInfoChangeCount={supporterInfoChangeCount}
            />
            <div className="admin-content-area">
              {renderAdminContent()}
            </div>
          </>
        ) : (
          // 모바일 뷰 (임시)
          <div style={{ padding: '20px' }}>
            <h2>관리자 페이지 (모바일)</h2>
            <p>모바일 관리자 UI는 별도 기획이 필요합니다.</p>
          </div>
        )}
      </main>

      <Footer /> 
      
      {/* 모바일 메뉴 오버레이 */}
      {isMobileMenuOpen && isMobile && (
        <MobileMenu onClose={handleMenuClose} />
      )}
    </div>
  );
};

export default AdminPage;