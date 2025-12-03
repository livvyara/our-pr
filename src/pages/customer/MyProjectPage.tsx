import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getFirestore, collection, query, where, getDocs, doc, getDoc, orderBy 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import { ChatIcons } from '../../components/common/ChatIcons';
import ChatWidget from '../../components/common/ChatWidget';

import Header from '../../components/common/Header';
import SubNav from '../../components/common/SubNav'; 
import MobileMenu from '../../components/common/MobileMenu'; 
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader';
import { useMenu } from '../../contexts/MenuContext';

/* [수정] 4개의 버튼 모두 고객 전용 모달로 연결 */
import CustomerConstructionScheduleModal from '../../components/customer/CustomerConstructionScheduleModal';
import SiteWorkLogListModal from '../../components/customer/SiteWorkLogListModal';
import CustomerSiteFilesModal from '../../components/customer/CustomerSiteFilesModal';
import CustomerChangeOrderModal from '../../components/customer/CustomerChangeOrderModal'; 

import './MyProjectPage.css'; 

const db = getFirestore();

// [Simple SVG Icons]
const ProjectIcons = {
  Schedule: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"><rect x="3" y="4" width="18" height="18"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
  ),
  Worklog: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
  ),
  Files: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
  ),
  Cost: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
  ),
  Estimate: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
  ),
  Contract: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"></path><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"></polygon></svg>
  ),
  Insurance: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
  ),
  ArrowDown: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter"><path d="M6 9l6 6 6-6"/></svg>
  )
};

interface MySiteData {
  inviteId: string;
  siteId: string;
  partnerUid: string;
  siteName: string;
  status: string;
  address: string;
  startDate: string;
  endDate?: string;
  partnerName?: string;
  partnerPhone?: string;
  partnerEmail?: string;
  budget?: number;
  area?: string;
  siteType?: string;
  contractSupply?: number;
  contractVat?: number;
  changeOrderTotal?: number;
}

const MyProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const { mainMenus, isLoading: isMenuLoading } = useMenu();
  const [selectedMenu, setSelectedMenu] = useState('lounge'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  const [mySites, setMySites] = useState<MySiteData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [modalState, setModalState] = useState<{
      type: 'schedule' | 'worklog' | 'files' | 'estimate' | 'contract' | 'insurance' | 'changeOrder' | null;
      siteId: string;
      partnerUid: string;
  } | null>(null);

  // 애니메이션 강제 실행을 위한 상태
  const [isPageLoaded, setIsPageLoaded] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    
    // 페이지 마운트 후 즉시 애니메이션 활성화 (옵저버 제거하고 강제 실행)
    const timer = setTimeout(() => {
        setIsPageLoaded(true);
    }, 100);

    return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
      if (!isMenuLoading && mainMenus.length > 0) {
          const hasLounge = mainMenus.find(m => m.key === 'lounge');
          if (hasLounge) setSelectedMenu('lounge');
      }
  }, [isMenuLoading, mainMenus]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await fetchMyProjects(user.uid);
      } else {
        setLoadingData(false);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const fetchMyProjects = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'siteInvitations'),
        where('redeemedBy', '==', uid),
        where('status', '==', 'redeemed'),
        orderBy('redeemedAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const sites: MySiteData[] = [];

      for (const d of snapshot.docs) {
        const inv = d.data();
        const siteId = inv.siteId;
        const partnerUid = inv.partnerUid;

        const siteSnap = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
        const partnerSnap = await getDoc(doc(db, 'users', partnerUid));

        if (siteSnap.exists()) {
          const sData = siteSnap.data();
          const pData = partnerSnap.exists() ? partnerSnap.data() : {};
          const pInfo = pData.partnerInfo || {};
          const contract = sData.contract || {};

          let changeTotal = 0;
          try {
              const coQuery = query(
                  collection(db, 'users', partnerUid, 'sites', siteId, 'changeOrders'),
                  where('status', '==', 'approved')
              );
              const coSnap = await getDocs(coQuery);
              coSnap.forEach(coDoc => {
                  const coData = coDoc.data();
                  changeTotal += Number(coData.totalAmount || 0);
              });
          } catch (e) { console.error("변경견적 조회 실패", e); }

          sites.push({
            inviteId: d.id, siteId, partnerUid,
            siteName: sData.siteName, status: sData.status || '진행중',
            address: sData.address || '', startDate: sData.startDate || '', endDate: sData.endDate || '',
            budget: sData.budget, area: sData.area, siteType: sData.siteType,
            partnerName: pInfo.companyName || pData.companyName || pData.name || '파트너사',
            partnerPhone: pInfo.contact || pData.phone || '-',
            partnerEmail: pData.email || '-',
            contractSupply: contract.supplyAmount,
            contractVat: contract.vatAmount,
            changeOrderTotal: changeTotal 
          });
        }
      }
      setMySites(sites);
    } catch (e) { console.error(e); } finally { setLoadingData(false); }
  };

  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const toggleExpand = (id: string) => { setExpandedSiteId(prev => (prev === id ? null : id)); };
  
  const getStatusLabel = (status: string) => status; 

  const handleButtonClick = (type: any, site: MySiteData) => {
      if (type === 'estimate' || type === 'contract' || type === 'insurance') {
          alert("준비 중인 기능입니다.");
          return;
      }
      setModalState({ type, siteId: site.siteId, partnerUid: site.partnerUid });
  };

  return (
    <div className="mp-page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && selectedMenu && (
        <SubNav 
          selectedMenuKey={selectedMenu} 
          onClose={() => setSelectedMenu('')} /* 빈 문자열로 설정하여 숨김 처리 */
        />
      )}

      <main className="mp-main-content">
        <div className="mp-inner-container">
            
            <div className="mp-header-section">
                <div className="mp-reveal-mask">
                    <h2 className={`mp-title mp-reveal-text ${isPageLoaded ? 'mp-active' : ''}`}>MY LOUNGE</h2>
                </div>
                <div className={`mp-divider-long mp-fade-up ${isPageLoaded ? 'mp-active' : ''}`}></div>
                <p className={`mp-subtitle mp-fade-up ${isPageLoaded ? 'mp-active' : ''}`}>진행 중인 프로젝트를 확인하세요</p>
            </div>

            {loadingData ? (
                <div className="mp-loading-state">Loading...</div>
            ) : (
                <div className="mp-project-list">
                    {mySites.length === 0 ? (
                    <div className={`mp-empty-state mp-fade-up ${isPageLoaded ? 'mp-active' : ''}`}>
                        <p>진행 중인 프로젝트가 없습니다.</p>
                        <span>초대장을 통해 프로젝트를 시작하세요.</span>
                    </div>
                    ) : (
                    mySites.map((site, index) => {
                        const statusText = getStatusLabel(site.status);
                        const isExpanded = expandedSiteId === site.siteId;
                        const changeAmt = site.changeOrderTotal || 0;

                        return (
                        <div 
                            key={site.siteId} 
                            className={`mp-project-card ${isExpanded ? 'active' : ''} mp-fade-up ${isPageLoaded ? 'mp-active' : ''}`}
                            style={{ transitionDelay: isPageLoaded ? '0s' : `${index * 0.1}s` }}
                        >
                            
                            {/* Card Header */}
                            <div className="mp-card-header" onClick={() => toggleExpand(site.siteId)}>
                                <div className="mp-header-content">
                                    <div className="mp-status-indicator">{statusText}</div>
                                    <h3 className="mp-site-name">{site.siteName}</h3>
                                    <p className="mp-site-addr">{site.address}</p>
                                </div>
                                <div className="mp-header-action">
                                    <span className="mp-expand-text">{isExpanded ? 'CLOSE' : 'OPEN'}</span>
                                    <button className={`mp-toggle-btn ${isExpanded ? 'open' : ''}`}>
                                        <ProjectIcons.ArrowDown />
                                    </button>
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="mp-card-body">
                                <div className="mp-body-inner">
                                    
                                    {/* 정보 그리드 */}
                                    <div className="mp-info-grid">
                                        <div className="mp-info-col">
                                            <span className="mp-label">INFO</span>
                                            <div className="mp-data-row">
                                                <span>공사유형</span>
                                                <strong>{site.siteType === 'commercial' ? '상업공간' : '주거공간'}</strong>
                                            </div>
                                            <div className="mp-data-row">
                                                <span>면적</span>
                                                <strong>{site.area || '-'}</strong>
                                            </div>
                                            <div className="mp-data-row">
                                                <span>기간</span>
                                                <strong>{site.startDate} ~ {site.endDate || '미정'}</strong>
                                            </div>
                                        </div>

                                        <div className="mp-info-col">
                                            <span className="mp-label">COST</span>
                                            <div className="mp-data-row">
                                                <span>최초계약</span>
                                                <strong>{(site.budget || 0).toLocaleString()} 원</strong>
                                            </div>
                                            {changeAmt !== 0 && (
                                                <div className="mp-data-row highlight">
                                                    <span>변경/추가</span>
                                                    <strong>{changeAmt > 0 ? '+' : ''}{changeAmt.toLocaleString()} 원</strong>
                                                </div>
                                            )}
                                            <div className="mp-total-row">
                                                <span>TOTAL</span>
                                                <strong>{((site.budget || 0) + changeAmt).toLocaleString()} 원</strong>
                                            </div>
                                        </div>

                                        <div className="mp-info-col partner">
                                            <span className="mp-label">PARTNER</span>
                                            <strong className="mp-p-name">{site.partnerName}</strong>
                                            <button className="mp-chat-btn" onClick={(e) => { e.stopPropagation(); setIsChatOpen(true); }}>
                                                1:1 문의하기
                                            </button>
                                        </div>
                                    </div>

                                    {/* 액션 버튼 그리드 */}
                                    <div className="mp-actions-section">
                                        <span className="mp-label">ACTIONS</span>
                                        <div className="mp-actions-grid">
                                            <button className="mp-menu-btn" onClick={() => handleButtonClick('schedule', site)}>
                                                <div className="icon-box"><ProjectIcons.Schedule /></div>
                                                <span className="btn-text">공사 일정</span>
                                            </button>
                                            <button className="mp-menu-btn" onClick={() => handleButtonClick('worklog', site)}>
                                                <div className="icon-box"><ProjectIcons.Worklog /></div>
                                                <span className="btn-text">작업 일지</span>
                                            </button>
                                            <button className="mp-menu-btn" onClick={() => handleButtonClick('files', site)}>
                                                <div className="icon-box"><ProjectIcons.Files /></div>
                                                <span className="btn-text">공사자료 열람</span>
                                            </button>
                                            <button className="mp-menu-btn" onClick={() => handleButtonClick('changeOrder', site)}>
                                                <div className="icon-box"><ProjectIcons.Cost /></div>
                                                <span className="btn-text">추가/변경 견적</span>
                                            </button>
                                            <button className="mp-menu-btn disabled" onClick={() => handleButtonClick('estimate', site)}>
                                                <div className="icon-box"><ProjectIcons.Estimate /></div>
                                                <span className="btn-text">견적서 확인</span>
                                            </button>
                                            <button className="mp-menu-btn disabled" onClick={() => handleButtonClick('contract', site)}>
                                                <div className="icon-box"><ProjectIcons.Contract /></div>
                                                <span className="btn-text">전자계약서</span>
                                            </button>
                                            <button className="mp-menu-btn disabled" onClick={() => handleButtonClick('insurance', site)}>
                                                <div className="icon-box"><ProjectIcons.Insurance /></div>
                                                <span className="btn-text">보험가입 요청</span>
                                            </button>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                        );
                    })
                    )}
                </div>
            )}
        </div>
      </main>
      
      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
      {isChatOpen && <ChatWidget onClose={() => setIsChatOpen(false)} />}
      
      {/* Modals: 모두 고객 전용 컴포넌트로 연결 */}
      {modalState?.type === 'schedule' && <CustomerConstructionScheduleModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
      {modalState?.type === 'changeOrder' && <CustomerChangeOrderModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
      {modalState?.type === 'worklog' && <SiteWorkLogListModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
      {modalState?.type === 'files' && <CustomerSiteFilesModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
    </div>
  );
};

export default MyProjectPage;