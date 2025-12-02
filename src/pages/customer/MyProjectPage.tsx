import React, { useState, useEffect } from 'react';
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

import ConstructionScheduleModal from '../../components/partner/ConstructionScheduleModal';
import SiteWorkLogListModal from '../../components/customer/SiteWorkLogListModal';
import CustomerSiteFilesModal from '../../components/customer/CustomerSiteFilesModal';
import ChangeOrderModal from '../../components/partner/ChangeOrderModal'; 

import './MyProjectPage.css'; 

const db = getFirestore();

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
  // [NEW] 추가/변경 공사비 합계
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

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

          // [NEW] 추가/변경 견적 합계 계산 (최종 승인된 것만)
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
            changeOrderTotal: changeTotal // 추가된 필드
          });
        }
      }
      setMySites(sites);
    } catch (e) { console.error(e); } finally { setLoadingData(false); }
  };

  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const toggleExpand = (id: string) => { setExpandedSiteId(prev => (prev === id ? null : id)); };
  
  const getStatusLabel = (status: string) => {
    switch (status) {
        case '미팅중': return { text: '미팅 진행중', color: '#ff9800', bg: '#fff3e0' };
        case '계약완료': return { text: '계약 완료', color: '#2196f3', bg: '#e3f2fd' };
        case '공사중': return { text: '공사 진행중', color: '#4caf50', bg: '#e8f5e9' };
        case '공사완료': return { text: '공사 완료', color: '#9c27b0', bg: '#f3e5f5' };
        default: return { text: status, color: '#555', bg: '#f5f5f5' };
    }
  };

  const handleButtonClick = (type: any, site: MySiteData) => {
      if (type === 'estimate' || type === 'contract' || type === 'insurance') {
          alert("준비 중인 기능입니다.");
          return;
      }
      setModalState({ type, siteId: site.siteId, partnerUid: site.partnerUid });
  };

  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && selectedMenu && <SubNav selectedMenuKey={selectedMenu} />}

      <main className="my-project-main">
        <div className="my-project-container">
            <div className="mp-header">
                <h2>마이 프로젝트</h2>
                <p>진행 중인 나의 현장 정보를 한눈에 확인하세요.</p>
            </div>

            {loadingData ? <div className="my-project-loading">로딩 중...</div> : (
                <div className="mp-list">
                    {mySites.length === 0 ? (
                    <div className="mp-empty">
                        <p>참여 중인 프로젝트가 없습니다.</p>
                        <span className="sub-text">업체로부터 초대장을 받으면 이곳에 현장이 표시됩니다.</span>
                    </div>
                    ) : (
                    mySites.map(site => {
                        const statusStyle = getStatusLabel(site.status);
                        const isExpanded = expandedSiteId === site.siteId;
                        const changeAmt = site.changeOrderTotal || 0;

                        return (
                        <div key={site.siteId} className={`mp-card ${isExpanded ? 'expanded' : ''}`}>
                            <div className="mp-card-header" onClick={() => toggleExpand(site.siteId)}>
                                <div className="mp-card-info">
                                    <div className="mp-site-name">
                                        {site.siteName}
                                        <span className="mp-status-badge" style={{color:statusStyle.color, backgroundColor:statusStyle.bg}}>
                                            {statusStyle.text}
                                        </span>
                                    </div>
                                    <div className="mp-site-addr">{site.address}</div>
                                </div>
                                <button className={`btn-toggle ${isExpanded ? 'open' : ''}`}><ChatIcons.Back /></button>
                            </div>

                            <div className="mp-card-body">
                                <div className="mp-detail-grid">
                                    <div className="mp-section">
                                        <h4>📋 공사 개요</h4>
                                        <div className="mp-row"><span>공사 유형</span> {site.siteType === 'commercial' ? '상업공간' : '주거공간'}</div>
                                        <div className="mp-row"><span>면적</span> {site.area || '-'}</div>
                                        <div className="mp-row"><span>공사 기간</span> {site.startDate} ~ {site.endDate || '미정'}</div>
                                        
                                        <div className="mp-divider-line"></div>
                                        {site.contractSupply !== undefined ? (
                                            <>
                                                <div className="mp-row"><span>공급가액</span> {site.contractSupply.toLocaleString()} 원</div>
                                                <div className="mp-row"><span>부가세</span> {(site.contractVat || 0).toLocaleString()} 원</div>
                                                <div className="mp-row total"><span>총 공사비</span> {(site.budget || 0).toLocaleString()} 원</div>
                                                
                                                {/* [NEW] 추가/변경 공사비 표시 */}
                                                {changeAmt !== 0 && (
                                                    <div className="mp-row" style={{marginTop:'5px'}}>
                                                        <span>추가/변경 공사비</span>
                                                        <span style={{
                                                            color: changeAmt > 0 ? '#1976d2' : '#d32f2f', 
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {changeAmt > 0 ? '+' : ''}{changeAmt.toLocaleString()} 원
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="mp-row total"><span>총 공사비</span> {(site.budget || 0).toLocaleString()} 원</div>
                                        )}
                                    </div>
                                    
                                    <div className="mp-section">
                                        <h4>🏢 담당 파트너</h4>
                                        <div className="mp-partner-box">
                                            <div className="mp-p-name">{site.partnerName}</div>
                                            <div className="mp-p-contact">📞 {site.partnerPhone}</div>
                                            <button className="btn-chat-partner" onClick={() => setIsChatOpen(true)}>
                                                <ChatIcons.Chat /> 1:1 문의하기
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mp-quick-links">
                                    <button className="mp-link-btn" onClick={() => handleButtonClick('schedule', site)}>📅 공사 일정</button>
                                    <button className="mp-link-btn" onClick={() => handleButtonClick('worklog', site)}>📝 작업 일지</button>
                                    <button className="mp-link-btn" onClick={() => handleButtonClick('files', site)}>📂 공사자료 열람</button>
                                    <button className="mp-link-btn" onClick={() => handleButtonClick('changeOrder', site)}>💰 추가/변경 견적</button>
                                    <button className="mp-link-btn" onClick={() => handleButtonClick('estimate', site)}>📑 견적서 확인</button>
                                    <button className="mp-link-btn" onClick={() => handleButtonClick('contract', site)}>📜 전자계약서</button>
                                    <button className="mp-link-btn" onClick={() => handleButtonClick('insurance', site)}>🛡️ 보험가입 요청</button>
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
      {modalState?.type === 'schedule' && <ConstructionScheduleModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} viewOnly={true} />}
      {modalState?.type === 'changeOrder' && <ChangeOrderModal siteId={modalState.siteId} siteName="" partnerUid={modalState.partnerUid} userRole="customer" onClose={() => setModalState(null)} />}
      {modalState?.type === 'worklog' && <SiteWorkLogListModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
      {modalState?.type === 'files' && <CustomerSiteFilesModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
    </div>
  );
};

export default MyProjectPage;