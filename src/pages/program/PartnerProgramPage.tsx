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
import PartnerActivityLogPage from './PartnerActivityLogPage';
import DashboardSiteListWidget from '../../components/partner/DashboardSiteListWidget';
import AccountingHometaxPage from './AccountingHometaxPage';
// [⭐ 추가] 세금계산서 통합 조회 페이지 임포트
import AccountingTaxInvoicePage from './AccountingTaxInvoicePage'; 
import AccountingCashReceiptPage from './AccountingCashReceiptPage'; 
import AccountingExpenseCategory from './AccountingExpenseCategoryPage'; 
import AccountingManualSalesPage from './AccountingManualSalesPage';
import AccountingManualPurchasePage from './AccountingManualPurchasePage';
import AccountingBankingExcelPage from './AccountingBankingExcelPage';
import SiteSettlementPage from './SiteSettlementPage';

import WorkLogPage from './WorkLogPage';
import SiteDeleteList from '../../components/partner/SiteDeleteList';
import WorkerManagementPage from './WorkerManagementPage';
import LaborCostManagementPage from './LaborCostManagementPage';

// Firebase
import { auth } from '../../firebase-config';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// CSS
import '../HomePage.css'; 
import './PartnerProgramPage.css'; 

const PartnerProgramPage: React.FC = () => {
  const navigate = useNavigate(); 
  const db = getFirestore();

  const [selectedMenu, setSelectedMenu] = useState('menu1'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentPartnerUid, setCurrentPartnerUid] = useState<string | null>(null);
  const [partnerPermissions, setPartnerPermissions] = useState<string[]>([]);
  const [partnerInfo, setPartnerInfo] = useState<any>(null); 

  const ProtectedContent = ({ requiredPerm, children }: { requiredPerm: string, children: React.ReactNode }) => {
    if (isLoading) return <></>;
    if (currentUserRole === 'admin' || currentUserRole === 'subadmin' || currentUserRole === 'partner') {
      return <>{children}</>;
    }
    if (currentUserRole === 'sub_partner') {
      if (partnerPermissions.includes(requiredPerm)) {
        return <>{children}</>;
      }
    }
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

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const loggedInUserUid = user.uid; 
        const docRef = doc(db, "users", loggedInUserUid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          const userRole = userData.role;
          
          if (userRole === 'partner' || userRole === 'admin' || userRole === 'subadmin' || userRole === 'sub_partner') {
            setCurrentUserRole(userRole);

            let uidToUseForData: string | null = null; 
            let permissionsToUse: string[] = [];
            let infoToUse: any = null;

            if (userRole === 'partner') {
              uidToUseForData = loggedInUserUid; 
              permissionsToUse = ['dashboard', 'sites', 'site-add', 'site-list', 'site-log', 'site-schedule', 'hr', 'hr-add-worker', 'hr-add-log', 'hr-export-excel', 'accounting', 'accounting-tax-invoice', 'accounting-sales', 'accounting-purchase', 'employees', 'emp-add', 'emp-list', 'emp-permission', 'profile', 'profile-edit', 'portfolio', 'portfolio-add', 'portfolio-list', 'activity-log'];
              infoToUse = userData.partnerInfo || {};
            } 
            else if (userRole === 'sub_partner') {
              permissionsToUse = userData.partnerPermissions || [];
              infoToUse = userData.partnerInfo || {};
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
              permissionsToUse = ['dashboard', 'sites', 'site-add', 'site-list', 'site-log', 'site-schedule', 'hr', 'hr-add-worker', 'hr-add-log', 'hr-export-excel', 'accounting', 'accounting-tax-invoice', 'accounting-sales', 'accounting-purchase', 'employees', 'emp-add', 'emp-list', 'emp-permission', 'profile', 'profile-edit', 'portfolio', 'portfolio-add', 'portfolio-list', 'activity-log'];
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

    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      unsubscribeAuth();
      window.removeEventListener('resize', handleResize);
    };
  }, [navigate, db]); 

  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };
  const handleSiteSelect = (siteId: string) => { navigate(`/program/site-detail/${siteId}`); };

  if (isLoading) {
    return (
      <div className="page-container">
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <h2>파트너 페이지 권한을 확인 중입니다...</h2>
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

      <main className="main-content program-main-layout" style={{ padding: 0 }}>
        {!isMobile ? ( 
          <>
            <PartnerSidebar userRole={currentUserRole as any} permissions={partnerPermissions} />
            
            <div className="program-content-area">
              {currentPartnerUid ? (
                <Routes>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  
                  <Route path="dashboard" element={
                    <ProtectedContent requiredPerm="dashboard">
                      <div className="dashboard-grid">
                        <div className="calendar-widget-area widget">
                          <DashboardCalendarWidget partnerUid={currentPartnerUid} onSiteSelect={handleSiteSelect} /> 
                        </div>
                        <div className="widget-top-right widget">
                          <h2>매입매출 집계</h2>
                          <p>(개발 예정)</p>
                        </div>
                        <div className="widget-bottom-right widget">
                          {currentPartnerUid && auth.currentUser?.uid ? (
                            <DashboardSiteListWidget partnerUid={currentPartnerUid} currentUserId={auth.currentUser.uid} />
                          ) : <p>사용자 정보 로딩 중...</p>}
                        </div>
                      </div>
                    </ProtectedContent>
                  } />
                  
                  <Route path="site-add" element={<ProtectedContent requiredPerm="site-add"><SiteAdd partnerUid={currentPartnerUid} /></ProtectedContent>} />
                  <Route path="site-list" element={<ProtectedContent requiredPerm="site-list"><SiteList onSiteSelect={handleSiteSelect} partnerUid={currentPartnerUid} /></ProtectedContent>} />
                  <Route path="site-delete" element={<ProtectedContent requiredPerm="site-delete"><SiteDeleteList partnerUid={currentPartnerUid} /></ProtectedContent>} />
                  <Route path="site-log" element={<ProtectedContent requiredPerm="site-log"><WorkLogPage partnerUid={currentPartnerUid} /></ProtectedContent>} />
                  <Route path="site-log/:siteId" element={<ProtectedContent requiredPerm="site-log"><WorkLogPage partnerUid={currentPartnerUid} /></ProtectedContent>} />
                  <Route path="site-schedule" element={<ProtectedContent requiredPerm="site-schedule"><h2>공사 일정</h2></ProtectedContent>} />
                  <Route path="site-settlement" element={<ProtectedContent requiredPerm="site-list"><SiteSettlementPage /></ProtectedContent>} />
                  <Route path="site-detail/:siteId" element={<ProtectedContent requiredPerm="site-list"><SiteDetailPage partnerUid={currentPartnerUid} /></ProtectedContent>} />

                  <Route path="hr-add-worker" element={<ProtectedContent requiredPerm="hr-add-worker"><h2>작업자 등록</h2></ProtectedContent>} />
                  <Route path="worker-management" element={<ProtectedContent requiredPerm="hr-add-worker"><WorkerManagementPage /></ProtectedContent>} />
                  <Route path="hr-labor-cost" element={<ProtectedContent requiredPerm="hr-add-log"><LaborCostManagementPage /></ProtectedContent>} />
                  <Route path="hr-export-excel" element={<ProtectedContent requiredPerm="hr-export-excel"><h2>엑셀다운로드(신고용)</h2></ProtectedContent>} />
                  AccountingBankingExcelPage
              
                  <Route path="accounting-hometax" element={<ProtectedContent requiredPerm="accounting"><AccountingHometaxPage partnerUid={currentPartnerUid} /></ProtectedContent>} />
                  <Route path="accounting-tax-invoice" element={<ProtectedContent requiredPerm="accounting"><AccountingTaxInvoicePage /></ProtectedContent>} />
                  <Route path="accounting-cash-receipt" element={<ProtectedContent requiredPerm="accounting"><AccountingCashReceiptPage /></ProtectedContent>} />
                  <Route path="accounting-expense-category" element={<ProtectedContent requiredPerm="accounting"><AccountingExpenseCategory /></ProtectedContent>} />
                  <Route path="accounting-banking-excel" element={<ProtectedContent requiredPerm="accounting"><AccountingBankingExcelPage/></ProtectedContent>} />
                  <Route path="accounting-sales-manual" element={<ProtectedContent requiredPerm="accounting-sales"><AccountingManualSalesPage /></ProtectedContent>} />
                  <Route path="accounting-purchase-manual" element={<ProtectedContent requiredPerm="accounting-purchase"><AccountingManualPurchasePage /></ProtectedContent>} />
                  <Route path="emp-add" element={<ProtectedContent requiredPerm="emp-add"><EmployeeAddTab /></ProtectedContent>} />
                  <Route path="emp-list" element={<ProtectedContent requiredPerm="emp-list"><EmployeeListTab partnerBusinessNumber={partnerInfo?.businessNumber || ''} /></ProtectedContent>} />
                  <Route path="emp-permission" element={<ProtectedContent requiredPerm="emp-permission"><PartnerPermissionTab partnerUid={currentPartnerUid} partnerBusinessNumber={partnerInfo?.businessNumber || ''} /></ProtectedContent>} />
                  
                  <Route path="portfolio-add" element={<ProtectedContent requiredPerm="portfolio-add"><h2>포트폴리오 등록</h2></ProtectedContent>} />
                  <Route path="portfolio-list" element={<ProtectedContent requiredPerm="portfolio-list"><h2>포트폴리오 목록</h2></ProtectedContent>} />
                  <Route path="activity-log" element={<ProtectedContent requiredPerm="activity-log"><PartnerActivityLogPage partnerUid={currentPartnerUid} /></ProtectedContent>} />

                  <Route path="*" element={<h2>페이지를 찾을 수 없습니다.</h2>} />
                </Routes>
              ) : (
                <h2>사용자 정보 로딩 중...</h2>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: '20px' }}>
            <h2>파트너 전산 (모바일)</h2>
            <p>파트너 전산 기능은 PC환경에서만 지원됩니다.</p>
          </div>
        )}
      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={handleMenuClose} />}
    </div>
  );
};

export default PartnerProgramPage;