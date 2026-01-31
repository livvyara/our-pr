// src/pages/admin/AdminPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 컴포넌트 임포트 (레이아웃 관련 컴포넌트 제거됨)
import AdminSidebar from '../../components/admin/AdminSidebar'; 
import RoleManagementTab from '../../components/admin/RoleManagementTab'; 
import UserManagementTab from '../../components/admin/UserManagementTab';
import PartnerManagementTab from '../../components/admin/PartnerManagementTab'; 
import SellerManagementTab from '../../components/admin/SellerManagementTab'; 
import SupporterManagementTab from '../../components/admin/SupporterManagementTab'; 
import HomepageManagementTab from '../../components/admin/HomepageManagementTab';
import ActivityLogTab from '../../components/admin/ActivityLogTab';

// [NEW] 쇼핑몰 관리 탭 임포트
import ShoppingMallManagementTab from '../../components/admin/ShoppingMallManagementTab';

// Firebase 모듈
import { auth } from '../../firebase-config';
import { getFirestore, doc, getDoc, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// CSS 임포트
import './AdminPage.css'; 

const AdminPage: React.FC = () => {
  const navigate = useNavigate(); 
  const db = getFirestore();

  // --- 상태 관리 ---
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

  // --- 권한 확인 및 로직 ---
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

            // 카운트 조회
            try {
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
            } catch (error) {
                console.error("카운트 조회 중 오류:", error);
            }

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

    // 2. 반응형 로직 (AdminPage 내부 구조용)
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
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
      if (!activeAdminMenu) setActiveAdminMenu('user-manage'); 
    } else if (currentUserRole === 'subadmin') {
      if (!activeAdminMenu) setActiveAdminMenu(allowedMenus[0] || ''); 
    }
  }, [isLoading, currentUserRole, allowedMenus, activeAdminMenu]);


  // --- 핸들러 함수 ---
  const handleAdminMenuClick = (menuKey: string) => { 
    setActiveAdminMenu(menuKey);
  };

  // [수정] 어드민 콘텐츠 렌더링 함수
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
      case 'homepage-manage':
        return <HomepageManagementTab />;
      
      // [NEW] 쇼핑몰 관리 탭 연결
      case 'shopping-mall':
        return <ShoppingMallManagementTab />;

      case 'role-manage':
        return <RoleManagementTab />;
      case 'activity-log':
        return <ActivityLogTab />;
        
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
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <h2>권한을 확인 중입니다...</h2>
        </div>
    );
  }

  // 기본 뷰
  return (
    // MainLayout이 이미 Header/Footer를 감싸고 있으므로
    // 여기서는 사이드바와 컨텐츠만 렌더링합니다.
    <div className="admin-page-layout">
        {!isMobile && currentUserRole ? ( 
          <div className="admin-flex-container" style={{ display: 'flex', minHeight: '100%' }}>
            {/* 왼쪽: 사이드바 */}
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
            
            {/* 오른쪽: 콘텐츠 영역 */}
            <div className="admin-content-area" style={{ flex: 1, padding: '24px', backgroundColor: '#f9f9f9' }}>
              {renderAdminContent()}
            </div>
          </div>
        ) : (
          // 모바일 뷰 (임시)
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <h2>관리자 페이지 (모바일)</h2>
            <p>모바일 환경에서는 관리자 페이지 기능을 제한적으로 제공하거나<br/>PC 환경에서 접속해 주세요.</p>
          </div>
        )}
    </div>
  );
};

export default AdminPage;