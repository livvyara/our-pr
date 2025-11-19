// src/pages/program/PartnerProgramPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, Navigate } from 'react-router-dom';

// 공통 컴포넌트
import Header from '../../components/common/Header';
import SubNav from '../../components/common/SubNav';
import MobileMenu from '../../components/common/MobileMenu'; 
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader'; 
import PartnerSidebar from '../../components/partner/PartnerSidebar'; 

// 탭 컴포넌트 임포트
import SiteAdd from '../../components/partner/SiteAdd';
import SiteList from '../../components/partner/SiteList'; 
import SiteDetailPage from '../../pages/program/SiteDetailPage';
import DashboardCalendarWidget from '../../components/partner/DashboardCalendarWidget'; 
import PartnerPermissionTab from '../../components/partner/PartnerPermissionTab'; 
import EmployeeAddTab from '../../components/partner/EmployeeAddTab';
import EmployeeListTab from '../../components/partner/EmployeeListTab';
import SiteLogPage from './SiteLogPage'; // (기존에 있던 파일인 것 같으나, WorkLogPage로 대체합니다)
import PartnerActivityLogPage from './PartnerActivityLogPage';
import DashboardSiteListWidget from '../../components/partner/DashboardSiteListWidget';

// [⭐ 핵심 추가] 방금 만든 작업일지 페이지 임포트
import WorkLogPage from './WorkLogPage';
import SiteDeleteList from '../../components/partner/SiteDeleteList';

// Firebase (권한 확인용)
import { auth } from '../../firebase-config';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// CSS
import '../HomePage.css'; 
import './PartnerProgramPage.css'; 

const PartnerProgramPage: React.FC = () => {
  const navigate = useNavigate(); 
  const db = getFirestore();

  // --- 1. 레이아웃 상태 ---
  const [selectedMenu, setSelectedMenu] = useState('menu1'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  // --- 2. 권한 확인 상태 ---
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  
  // [중요] 현재 보고 있는 데이터의 주인 (대표) UID
  const [currentPartnerUid, setCurrentPartnerUid] = useState<string | null>(null);
  
  // [중요] 현재 로그인한 사용자의 권한 목록 (직원일 경우 제한됨)
  const [partnerPermissions, setPartnerPermissions] = useState<string[]>([]);
  const [partnerInfo, setPartnerInfo] = useState<any>(null); 


  // --- [⭐ 3. 핵심 추가] 권한 체크용 래퍼 컴포넌트 (Route Guard) ---
  const ProtectedContent = ({ requiredPerm, children }: { requiredPerm: string, children: React.ReactNode }) => {
    // 1. 로딩 중이면 대기
    if (isLoading) return <></>;

    // 2. 관리자나 대표(partner)는 모든 메뉴 프리패스
    if (currentUserRole === 'admin' || currentUserRole === 'subadmin' || currentUserRole === 'partner') {
      return <>{children}</>;
    }

    // 3. 직원(sub_partner)인 경우 권한 목록 확인
    if (currentUserRole === 'sub_partner') {
      // 해당 메뉴 키가 권한 목록에 포함되어 있는지 확인
      if (partnerPermissions.includes(requiredPerm)) {
        return <>{children}</>;
      }
    }

    // 4. 권한 없음 -> 접근 거부 UI 표시
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center', color: '#666' }}>
        <h2 style={{ color: '#dc3545', marginBottom: '15px' }}>🚫 접근 권한이 없습니다.</h2>
        <p style={{ fontSize: '16px', lineHeight: '1.6' }}>
          이 메뉴에 접근할 권한이 부여되지 않았습니다.<br />
          관리자(대표)에게 문의하여 권한을 요청하세요.
        </p>
      </div>
    );
  };


  // --- 4. 권한 확인 및 반응형 로직 ---
  useEffect(() => {
    
    // 1. 권한 확인
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const loggedInUserUid = user.uid; 

        const docRef = doc(db, "users", loggedInUserUid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          const userRole = userData.role;
          
          // [보안] customer 등급은 접근 불가
          if (userRole === 'partner' || userRole === 'admin' || userRole === 'subadmin' || userRole === 'sub_partner') {
            setCurrentUserRole(userRole);

            let uidToUseForData: string | null = null; 
            let permissionsToUse: string[] = [];
            let infoToUse: any = null;

            if (userRole === 'partner') {
              // (대표) 본인 UID 사용, 모든 권한 부여
              uidToUseForData = loggedInUserUid; 
              permissionsToUse = ['dashboard', 'sites', 'site-add', 'site-list', 'site-log', 'site-schedule', 'hr', 'hr-add-worker', 'hr-add-log', 'hr-export-excel', 'accounting', 'accounting-sales', 'accounting-purchase', 'employees', 'emp-add', 'emp-list', 'emp-permission', 'profile', 'profile-edit', 'portfolio', 'portfolio-add', 'portfolio-list', 'activity-log'];
              infoToUse = userData.partnerInfo || {};
            } 
            else if (userRole === 'sub_partner') {
              // (직원) DB에 저장된 권한 사용
              permissionsToUse = userData.partnerPermissions || [];
              infoToUse = userData.partnerInfo || {};
              
              // (직원) 대표의 UID 사용
              if (userData.partnerInfo && userData.partnerInfo.ownerUid) {
                uidToUseForData = userData.partnerInfo.ownerUid; 
              } else {
                alert("귀하의 계정에 연결된 파트너 대표 정보를 찾을 수 없습니다.");
                navigate('/');
                return;
              }
            }
            else if (userRole === 'admin' || userRole === 'subadmin') {
              uidToUseForData = loggedInUserUid;
              permissionsToUse = ['dashboard', 'sites', 'site-add', 'site-list', 'site-log', 'site-schedule', 'hr', 'hr-add-worker', 'hr-add-log', 'hr-export-excel', 'accounting', 'accounting-sales', 'accounting-purchase', 'employees', 'emp-add', 'emp-list', 'emp-permission', 'profile', 'profile-edit', 'portfolio', 'portfolio-add', 'portfolio-list', 'activity-log'];
            }

            setCurrentPartnerUid(uidToUseForData); 
            setPartnerPermissions(permissionsToUse);
            setPartnerInfo(infoToUse); 

            setIsLoading(false); 
          } else {
            alert('접근 권한이 없습니다.');
            navigate('/');
          }
        } else {
          alert('사용자 정보를 찾을 수 없습니다.');
          navigate('/login');
        }
      } else {
        alert('로그인이 필요합니다.');
        navigate('/login');
        setCurrentPartnerUid(null); 
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

  // --- (핸들러 함수) ---
  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };
  
  const handleSiteSelect = (siteId: string) => {
    navigate(`/program/site-detail/${siteId}`); 
  };


  // --- 로딩 중 뷰 ---
  if (isLoading) {
    return (
      <div className="page-container">
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <h2>파트너 페이지 권한을 확인 중입니다...</h2>
        </main>
      </div>
    );
  }

  // --- 기본 뷰 ---
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
        className="main-content program-main-layout" 
        style={{ padding: 0 }}
      >
        {!isMobile ? ( 
          <>
            <PartnerSidebar 
              userRole={currentUserRole as any} 
              permissions={partnerPermissions} 
            />
            
            <div className="program-content-area">
            
              {currentPartnerUid ? (
                <Routes>
                  {/* /program 접속 시 /program/dashboard로 리디렉션 */}
                  <Route index element={<Navigate to="dashboard" replace />} />
                  
                  {/* 대시보드 */}
                  <Route path="dashboard" element={
  <ProtectedContent requiredPerm="dashboard">
    <div className="dashboard-grid">
      <div className="calendar-widget-area widget">
        <DashboardCalendarWidget 
                             partnerUid={currentPartnerUid} 
                             onSiteSelect={handleSiteSelect} 
                           /> 
      </div>
      <div className="widget-top-right widget">
        <h2>매입매출 집계</h2>
        <p>(개발 예정)</p>
      </div>
      
      {/* [⭐ 핵심 수정] 현장 목록 위젯 연결 */}
      <div className="widget-bottom-right widget">
        {/* currentPartnerUid는 데이터 로딩용, auth.currentUser?.uid는 설정 저장용 */}
        {currentPartnerUid && auth.currentUser?.uid ? (
          <DashboardSiteListWidget 
            partnerUid={currentPartnerUid} 
            currentUserId={auth.currentUser.uid} 
          />
        ) : (
          <p>사용자 정보 로딩 중...</p>
        )}
      </div>
    </div>
  </ProtectedContent>
} />
                  
                  
                  {/* 현장관리 */}
                  <Route path="site-add" element={
  <ProtectedContent requiredPerm="site-add">
    <SiteAdd partnerUid={currentPartnerUid} />
  </ProtectedContent>
} />
                  <Route path="site-list" element={<ProtectedContent requiredPerm="site-list"><SiteList onSiteSelect={handleSiteSelect} partnerUid={currentPartnerUid} /></ProtectedContent>} />
                  {/* [⭐ 추가됨] 현장 삭제 라우터 (partnerUid 전달 필수) */}
  <Route path="site-delete" element={
    <ProtectedContent requiredPerm="site-delete">
      <SiteDeleteList partnerUid={currentPartnerUid} />
    </ProtectedContent>
  } />
                  {/* [⭐ 수정됨] 작업 일지 경로 연결 */}
                  {/* 1. 현장 선택 화면 (ID 없음) */}
                  <Route path="site-log" element={
    <ProtectedContent requiredPerm="site-log">
      {/* currentPartnerUid를 넘겨줌으로써, 직원이 로그인해도 대표의 데이터를 보게 됨 */}
      <WorkLogPage partnerUid={currentPartnerUid} />
    </ProtectedContent>
  } />
  
  {/* 2. 특정 현장 일지 화면 */}
  <Route path="site-log/:siteId" element={
    <ProtectedContent requiredPerm="site-log">
      <WorkLogPage partnerUid={currentPartnerUid} />
    </ProtectedContent>
  } />

                  <Route path="site-schedule" element={<ProtectedContent requiredPerm="site-schedule"><h2>공사 일정</h2></ProtectedContent>} />
                  {/* 현장 상세는 목록 권한이 있으면 접근 가능하도록 설정 */}
                  <Route path="site-detail/:siteId" element={<ProtectedContent requiredPerm="site-list"><SiteDetailPage partnerUid={currentPartnerUid} /></ProtectedContent>} />

                  {/* 노무관리 */}
                  <Route path="hr-add-worker" element={<ProtectedContent requiredPerm="hr-add-worker"><h2>작업자 등록</h2></ProtectedContent>} />
                  <Route path="hr-add-log" element={<ProtectedContent requiredPerm="hr-add-log"><h2>노무 등록</h2></ProtectedContent>} />
                  <Route path="hr-export-excel" element={<ProtectedContent requiredPerm="hr-export-excel"><h2>엑셀다운로드(신고용)</h2></ProtectedContent>} />
                  
                  {/* 회계관리 */}
                  <Route path="accounting-sales" element={<ProtectedContent requiredPerm="accounting-sales"><h2>매출자료 등록(제공예정)</h2></ProtectedContent>} />
                  <Route path="accounting-purchase" element={<ProtectedContent requiredPerm="accounting-purchase"><h2>매입자료 등록(제공예정)</h2></ProtectedContent>} />
                  
                  {/* 직원관리 */}
                  <Route path="emp-add" element={<ProtectedContent requiredPerm="emp-add"><EmployeeAddTab /></ProtectedContent>} />
                  <Route path="emp-list" element={<ProtectedContent requiredPerm="emp-list"><EmployeeListTab partnerBusinessNumber={partnerInfo?.businessNumber || ''} /></ProtectedContent>} />
                  {/* 권한관리는 sub_partner는 절대 접근 불가 (ProtectedContent + 로직상 차단) */}
                  <Route path="emp-permission" element={
                    <ProtectedContent requiredPerm="emp-permission">
                      <PartnerPermissionTab 
                        partnerUid={currentPartnerUid} 
                        partnerBusinessNumber={partnerInfo?.businessNumber || ''} 
                      />
                    </ProtectedContent>
                  } />
                  
                  {/* 포트폴리오 관리 */}
                  <Route path="portfolio-add" element={<ProtectedContent requiredPerm="portfolio-add"><h2>포트폴리오 등록</h2></ProtectedContent>} />
                  <Route path="portfolio-list" element={<ProtectedContent requiredPerm="portfolio-list"><h2>포트폴리오 목록</h2></ProtectedContent>} />

                  {/* 활동로그 페이지 연결 */}
                  <Route path="activity-log" element={
                    <ProtectedContent requiredPerm="activity-log">
                      <PartnerActivityLogPage partnerUid={currentPartnerUid} />
                    </ProtectedContent>
                  } />

                  <Route path="*" element={<h2>페이지를 찾을 수 없습니다.</h2>} />
                </Routes>
              ) : (
                <h2>사용자 정보 로딩 중...</h2>
              )}
            </div>
          </>
        ) : (
          // 모바일 뷰 (임시)
          <div style={{ padding: '20px' }}>
            <h2>파트너 전산 (모바일)</h2>
            <p>파트너 전산 기능은 PC환경에서만 지원됩니다.</p>
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

export default PartnerProgramPage;