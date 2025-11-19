// src/components/admin/PartnerManagementTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { 
  getFirestore, collection, getDocs, query, where, Timestamp, orderBy, collectionGroup 
} from 'firebase/firestore';
import './PartnerManagementTab.css';
import ApplicationDetailModal from './ApplicationDetailModal';
import InfoChangeDetailModal from './InfoChangeDetailModal'; 
import PartnerEditModal from './PartnerEditModal'; // [⭐ 추가]

// ... (기존 인터페이스 정의 유지) ...
interface LogEntry { timestamp: Timestamp; log: string; }
interface ApplicationData { uid: string; userId: string; companyName: string; ceoName: string; businessNumber: string; city: string; district: string; addressDetail: string; contactName: string; contactPhone: string; file1Url: string; file2Url: string | null; status: 'pending' | 'approved' | 'rejected'; createdAt: Timestamp; changeHistory?: LogEntry[]; }
interface ChangeRequestData { uid: string; userId: string; currentInfo: any; requestedInfo: any; status: 'pending' | 'approved' | 'rejected'; newLicenseUrl?: string | null; newAttachmentUrls?: string[]; createdAt: Timestamp; processedByUid?: string; processedByName?: string; processedAt?: Timestamp; rejectionReason?: string; }
interface PartnerData { uid: string; email: string; companyName: string; ceoName: string; businessNumber: string; contactPhone: string; createdAt: Timestamp; partnerInfo?: any; }
type SiteStatus = '미팅중' | '계약대기' | '계약완료' | '공사전' | '공사중' | '공사완료' | '보류' | '취소' | 'deleted';
interface AllSiteData { uid: string; siteName: string; address: string; client1Name: string; budget: number; status: SiteStatus; createdAt: Timestamp; partnerUid: string; authorUid?: string; }

const timestampToDateString = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '-';
  return ts.toDate().toISOString().split('T')[0];
};
const formatNumber = (num: number) => num ? num.toLocaleString('ko-KR') : '0';
const getStatusLabel = (status: string) => {
  switch (status) { case 'pending': return '대기'; case 'approved': return '승인'; case 'rejected': return '부결'; default: return status; }
};
const DEFAULT_STATUS_ORDER: SiteStatus[] = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'];
const ALL_STATUSES: SiteStatus[] = [...DEFAULT_STATUS_ORDER, 'deleted'];

interface PartnerManagementTabProps {
  pendingCount: number;
  infoChangeCount: number; 
}

const PartnerManagementTab: React.FC<PartnerManagementTabProps> = ({ pendingCount, infoChangeCount }) => {
  const navigate = useNavigate();
  const db = getFirestore();

  // 탭 상태
  const [activeTab, setActiveTab] = useState('main'); 
  const [activeNewAppSubTab, setActiveNewAppSubTab] = useState('pending'); 
  const [activeInfoChangeSubTab, setActiveInfoChangeSubTab] = useState('pending'); 

  // 데이터 목록
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestData[]>([]); 
  const [allPartners, setAllPartners] = useState<PartnerData[]>([]);
  const [allSites, setAllSites] = useState<AllSiteData[]>([]);
  
  // 검색어
  const [partnerSearchTerm, setPartnerSearchTerm] = useState('');
  const [siteSearchTerm, setSiteSearchTerm] = useState('');

  // 현장 정렬/노출 설정
  const [siteOrder, setSiteOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [siteVisible, setSiteVisible] = useState<SiteStatus[]>(ALL_STATUSES);
  
  // 모달 상태
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [isVisModalOpen, setIsVisModalOpen] = useState(false);
  const [tempOrder, setTempOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [tempVisible, setTempVisible] = useState<SiteStatus[]>(ALL_STATUSES);

  const [isLoading, setIsLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<ApplicationData | null>(null);
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestData | null>(null); 
  
  // [⭐ 추가] 파트너 수정 모달 상태
  const [editingPartnerUid, setEditingPartnerUid] = useState<string | null>(null);


  // --- Data Fetching ---
  const fetchApplications = useCallback(async (status: string) => {
    setIsLoading(true);
    const q = query(collection(db, "partnerApplications"), where("status", "==", status), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list: ApplicationData[] = [];
    snap.forEach(d => list.push({ uid: d.id, ...d.data() } as ApplicationData));
    setApplications(list);
    setIsLoading(false);
  }, [db]); 

  const fetchChangeRequests = useCallback(async (status: string) => {
    setIsLoading(true);
    const q = query(collection(db, "partnerInfoChangeRequests"), where("status", "==", status), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list: ChangeRequestData[] = [];
    snap.forEach(d => list.push({ uid: d.id, ...d.data() } as ChangeRequestData));
    setChangeRequests(list);
    setIsLoading(false);
  }, [db]);

  const fetchAllPartners = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "users"), where("role", "==", "partner"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list: PartnerData[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          uid: d.id, email: data.email, companyName: data.partnerInfo?.companyName || '-', ceoName: data.partnerInfo?.ceoName || data.name || '-',
          businessNumber: data.partnerInfo?.businessNumber || '-', contactPhone: data.partnerInfo?.contactPhone || data.phone || '-', createdAt: data.createdAt
        });
      });
      setAllPartners(list);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  }, [db]);

  const fetchAllSites = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = query(collectionGroup(db, 'sites'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: AllSiteData[] = [];
      snap.forEach(d => {
        const data = d.data();
        let ownerUid = data.partnerUid;
        if (!ownerUid && d.ref.parent.parent) ownerUid = d.ref.parent.parent.id;

        list.push({
          uid: d.id, siteName: data.siteName, address: data.address, client1Name: data.client1Name,
          budget: data.budget, status: data.status as SiteStatus, createdAt: data.createdAt, partnerUid: ownerUid, authorUid: data.authorUid
        });
      });
      setAllSites(list);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    if (activeTab === 'newApplications') fetchApplications(activeNewAppSubTab);
    else if (activeTab === 'infoChange') fetchChangeRequests(activeInfoChangeSubTab);
    else if (activeTab === 'allPartners') fetchAllPartners();
    else if (activeTab === 'allSites') fetchAllSites();
    else setIsLoading(false);
  }, [activeTab, activeNewAppSubTab, activeInfoChangeSubTab, fetchApplications, fetchChangeRequests, fetchAllPartners, fetchAllSites]);


  // --- Handlers ---
  const handleViewDetails = (app: ApplicationData) => setSelectedApp(app);
  const handleCloseModal = (refresh: boolean) => { setSelectedApp(null); if(refresh) fetchApplications(activeNewAppSubTab); };
  const handleViewChangeDetails = (req: ChangeRequestData) => setSelectedChangeRequest(req);
  const handleCloseChangeModal = (refresh: boolean) => { setSelectedChangeRequest(null); if(refresh) fetchChangeRequests(activeInfoChangeSubTab); };

  const openSortModal = () => { setTempOrder([...siteOrder]); setIsSortModalOpen(true); };
  const openVisModal = () => { setTempVisible([...siteVisible]); setIsVisModalOpen(true); };
  const saveSortOrder = () => { setSiteOrder(tempOrder); setIsSortModalOpen(false); };
  const saveVisibility = () => { setSiteVisible(tempVisible); setIsVisModalOpen(false); };
  
  const moveSortItem = (idx: number, dir: 'up'|'down') => {
    const newOrder = [...tempOrder];
    if (dir === 'up') { if(idx===0) return; [newOrder[idx-1], newOrder[idx]] = [newOrder[idx], newOrder[idx-1]]; }
    else { if(idx===newOrder.length-1) return; [newOrder[idx+1], newOrder[idx]] = [newOrder[idx], newOrder[idx+1]]; }
    setTempOrder(newOrder);
  };
  
  const toggleVisibility = (st: SiteStatus) => {
    setTempVisible(prev => prev.includes(st) ? prev.filter(s => s!==st) : [...prev, st]);
  };

  // [⭐ 추가] 파트너 수정 모달 닫기
  const handleCloseEditModal = (refresh: boolean) => {
    setEditingPartnerUid(null);
    if (refresh) fetchAllPartners(); // 수정되었으면 목록 새로고침
  };


  // --- Render Functions ---

  const renderMainTab = () => (
    <div className="partner-tab-content">
      <h3>파트너 관리 (메인)</h3><p>기존 파트너들의 정보를 관리하는 서브메뉴입니다.</p>
      <ul className="unimplemented-submenu"><li>포트폴리오/리뷰/실적 관리 (미구현)</li></ul>
    </div>
  );

  const renderNewApplicationsTab = () => (
    <div className="partner-tab-content">
      <div className="partner-sub-tabs">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} className={`partner-sub-tab-button ${activeNewAppSubTab===s?'active':''}`} onClick={()=>setActiveNewAppSubTab(s)}>
             {s === 'pending' ? '대기 목록' : s === 'approved' ? '승인 내역' : '부결 내역'}
          </button>
        ))}
      </div>
      <h3>{activeNewAppSubTab === 'pending' ? '신규 파트너 신청 목록 (대기)' : activeNewAppSubTab === 'approved' ? '파트너 승인 내역' : '파트너 부결 내역'}</h3>
      {isLoading ? <p>로딩 중...</p> : (
        <div className="application-table-wrapper">
          <table className="application-table">
            <thead><tr><th>상호명</th><th>대표자명</th><th>담당자</th><th>연락처</th><th>신청일</th><th>상태</th><th>관리</th></tr></thead>
            <tbody>
              {applications.map(app => (
                <tr key={app.uid}>
                  <td>{app.companyName}</td><td>{app.ceoName}</td><td>{app.contactName}</td><td>{app.contactPhone}</td><td>{timestampToDateString(app.createdAt)}</td>
                  <td style={{fontWeight:'bold', color: app.status==='pending'?'#e67e22': app.status==='approved'?'#27ae60':'#c0392b'}}>{getStatusLabel(app.status)}</td>
                  <td><button className="detail-button" onClick={() => handleViewDetails(app)} style={app.status !== 'pending' ? {backgroundColor:'#6c757d'} : {}}>{app.status === 'pending' ? '상세/처리' : '내역 보기'}</button></td>
                </tr>
              ))}
              {applications.length === 0 && <tr><td colSpan={7} style={{textAlign:'center'}}>데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderInfoChangeTab = () => (
    <div className="partner-tab-content">
      <div className="partner-sub-tabs">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} className={`partner-sub-tab-button ${activeInfoChangeSubTab===s?'active':''}`} onClick={()=>setActiveInfoChangeSubTab(s)}>
            {s === 'pending' ? '대기 목록' : s === 'approved' ? '승인 내역' : '부결 내역'}
          </button>
        ))}
      </div>
      <h3>정보변경 {activeInfoChangeSubTab === 'pending' ? '대기 목록' : activeInfoChangeSubTab === 'approved' ? '승인 내역' : '부결 내역'}</h3>
      {isLoading ? <p>로딩 중...</p> : (
        <div className="application-table-wrapper">
          <table className="application-table">
            <thead><tr><th>상호명 (요청)</th><th>신청자 (UID)</th><th>요청일</th><th>상태</th><th>관리</th></tr></thead>
            <tbody>
              {changeRequests.map(req => (
                <tr key={req.uid}>
                  <td>{req.requestedInfo.companyName}</td><td>{req.userId}</td><td>{timestampToDateString(req.createdAt)}</td>
                  <td style={{fontWeight:'bold', color: req.status==='pending'?'#e67e22': req.status==='approved'?'#27ae60':'#c0392b'}}>{getStatusLabel(req.status)}</td>
                  <td><button className="detail-button" onClick={() => handleViewChangeDetails(req)} style={req.status !== 'pending' ? {backgroundColor:'#6c757d'} : {}}>{req.status === 'pending' ? '상세/처리' : '내역 보기'}</button></td>
                </tr>
              ))}
              {changeRequests.length === 0 && <tr><td colSpan={5} style={{textAlign:'center'}}>데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // [⭐ 수정] 전체 파트너 목록 탭
  const renderAllPartnersTab = () => {
    const filtered = allPartners.filter(p => p.companyName.includes(partnerSearchTerm) || p.ceoName.includes(partnerSearchTerm));
    return (
      <div className="partner-tab-content">
        <h3>전체 파트너 목록</h3>
        <div className="search-wrapper" style={{marginBottom:15}}><input type="text" placeholder="검색..." className="admin-search-bar" value={partnerSearchTerm} onChange={e=>setPartnerSearchTerm(e.target.value)} style={{width:300, padding:8}} /></div>
        {isLoading ? <p>로딩 중...</p> : (
          <div className="application-table-wrapper">
            <table className="application-table">
              <thead><tr><th>상호명</th><th>대표자</th><th>사업자번호</th><th>연락처</th><th>가입일</th><th>이메일</th></tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.uid}>
                    <td>
                      {/* [⭐ 핵심] 상호명 클릭 시 수정 모달 오픈 */}
                      <button 
                        className="text-link-btn" 
                        onClick={() => setEditingPartnerUid(p.uid)}
                        style={{color:'#007bff', fontWeight:'bold', textDecoration:'underline', background:'none', border:'none', cursor:'pointer'}}
                      >
                        {p.companyName}
                      </button>
                    </td>
                    <td>{p.ceoName}</td><td>{p.businessNumber}</td><td>{p.contactPhone}</td><td>{timestampToDateString(p.createdAt)}</td><td>{p.email}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} style={{textAlign:'center'}}>파트너가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderAllSitesTab = () => {
    const filteredSites = allSites.filter(s => 
      s.siteName.toLowerCase().includes(siteSearchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(siteSearchTerm.toLowerCase())
    ).filter(s => siteVisible.includes(s.status));

    const sortedSites = [...filteredSites].sort((a, b) => {
      const isDelA = a.status === 'deleted'; const isDelB = b.status === 'deleted';
      if (isDelA && !isDelB) return 1; if (!isDelA && isDelB) return -1; if (isDelA && isDelB) return 0;
      const idxA = siteOrder.indexOf(a.status); const idxB = siteOrder.indexOf(b.status);
      const safeA = idxA === -1 ? 999 : idxA; const safeB = idxB === -1 ? 999 : idxB;
      return safeA - safeB;
    });

    return (
      <div className="partner-tab-content">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3>전체 현장 목록</h3>
          <div className="header-actions">
            <button className="header-btn" onClick={openSortModal}>⚙️ 정렬 변경</button>
            <button className="header-btn" onClick={openVisModal}>👁️ 노출 변경</button>
          </div>
        </div>
        <div className="search-wrapper" style={{marginBottom:'15px'}}><input type="text" placeholder="현장명, 주소로 검색" className="admin-search-bar" value={siteSearchTerm} onChange={e=>setSiteSearchTerm(e.target.value)} style={{width:'300px', padding:'8px', border:'1px solid #ccc', borderRadius:'5px'}} /></div>
        {isLoading ? <p>로딩 중...</p> : (
          <div className="application-table-wrapper">
            <table className="application-table">
              <thead><tr><th>상태</th><th>현장명</th><th>주소</th><th>고객명</th><th>공사 예산</th><th>생성일</th></tr></thead>
              <tbody>
                {sortedSites.map(site => (
                  <tr key={site.uid} className={site.status === 'deleted' ? 'row-deleted' : ''} style={site.status==='deleted'?{backgroundColor:'#fff5f5'}:{}}>
                    <td style={{fontWeight:'bold'}}>{site.status === 'deleted' ? '삭제대기' : site.status}</td>
                    <td>
                      <button className="text-link-btn" style={{background:'none', border:'none', color:'#007bff', fontWeight:'bold', cursor:'pointer', textDecoration:'underline'}}
                        onClick={() => navigate(`/program/site-detail/${site.uid}`, { state: { viewAsAdmin: true, ownerUid: site.partnerUid } })}>
                        {site.siteName}
                      </button>
                    </td>
                    <td>{site.address}</td><td>{site.client1Name}</td><td>{formatNumber(site.budget)}</td><td>{timestampToDateString(site.createdAt)}</td>
                  </tr>
                ))}
                {sortedSites.length===0 && <tr><td colSpan={6} style={{textAlign:'center'}}>데이터가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {isSortModalOpen && (
          <div className="modal-backdrop"><div className="sort-modal-content"><h3>상태값 정렬 순서</h3><ul className="modal-list">{tempOrder.map((st, idx) => (<li key={st} className="modal-item"><span>{idx+1}. {st}</span><div className="sort-controls"><button onClick={()=>moveSortItem(idx,'up')} disabled={idx===0}>▲</button><button onClick={()=>moveSortItem(idx,'down')} disabled={idx===tempOrder.length-1}>▼</button></div></li>))}</ul><div className="modal-footer"><button className="btn-close" onClick={()=>setIsSortModalOpen(false)}>취소</button><button className="btn-save" onClick={saveSortOrder}>저장</button></div></div></div>
        )}
        {isVisModalOpen && (
          <div className="modal-backdrop"><div className="sort-modal-content"><h3>현장 노출 설정</h3><ul className="modal-list">{ALL_STATUSES.map(st => (<li key={st} className="modal-item"><label className="visibility-label"><input type="checkbox" checked={tempVisible.includes(st)} onChange={()=>toggleVisibility(st)} />{st==='deleted'?'삭제대기':st}</label></li>))}</ul><div className="modal-footer"><button className="btn-close" onClick={()=>setIsVisModalOpen(false)}>취소</button><button className="btn-save" onClick={saveVisibility}>저장</button></div></div></div>
        )}
      </div>
    );
  };


  return (
    <div>
      <h2>파트너 관리</h2>
      <div className="partner-main-tabs">
        <button className={`partner-tab-button ${activeTab==='main'?'active':''}`} onClick={()=>setActiveTab('main')}>파트너 관리</button>
        <button className={`partner-tab-button ${activeTab==='newApplications'?'active':''}`} onClick={()=>setActiveTab('newApplications')}><span>신규 파트너 신청</span>{pendingCount>0&&<span className="new-notification">N</span>}</button>
        <button className={`partner-tab-button ${activeTab==='infoChange'?'active':''}`} onClick={()=>setActiveTab('infoChange')}><span>정보변경 신청</span>{infoChangeCount>0&&<span className="new-notification">N</span>}</button>
        <button className={`partner-tab-button ${activeTab==='allPartners'?'active':''}`} onClick={()=>setActiveTab('allPartners')}>전체 파트너 목록</button>
        <button className={`partner-tab-button ${activeTab==='allSites'?'active':''}`} onClick={()=>setActiveTab('allSites')}>전체 현장 목록</button>
      </div>

      {activeTab==='main' && renderMainTab()}
      {activeTab==='newApplications' && renderNewApplicationsTab()}
      {activeTab==='infoChange' && renderInfoChangeTab()}
      {activeTab==='allPartners' && renderAllPartnersTab()}
      {activeTab==='allSites' && renderAllSitesTab()}

      {selectedApp && <ApplicationDetailModal application={selectedApp} onClose={handleCloseModal} />}
      {selectedChangeRequest && <InfoChangeDetailModal requestData={selectedChangeRequest} onClose={handleCloseChangeModal} />}
      
      {/* [⭐ 추가] 파트너 수정 모달 */}
      {editingPartnerUid && <PartnerEditModal partnerUid={editingPartnerUid} onClose={handleCloseEditModal} />}
    </div>
  );
};

export default PartnerManagementTab;