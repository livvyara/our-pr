import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../../firebase-config'; 
import WorkLogModal from '../../components/partner/WorkLogModal'; 
import './WorkLogPage.css'; 
import { 
  Search, Plus, ChevronLeft, ChevronDown, 
  Calendar, User as UserIcon, FileText, MapPin, AlertCircle, Camera 
} from 'lucide-react';

// --- [타입 정의] 모달의 데이터 구조와 일치시킴 ---
type SiteStatus = '미팅중' | '계약대기' | '계약완료' | '공사전' | '공사중' | '공사완료' | '보류' | '취소' | 'deleted';

interface WorkLog {
  id: string;
  workDate: string;      // Modal: workDate
  todayWork: string;     // Modal: todayWork
  nextWork: string;      // Modal: nextWork
  issues: string;        // Modal: issues
  meetingLog: string;    // Modal: meetingLog
  images: string[];      // Modal: images
  author: string;        // Modal: author
  createdAt: any;
}

interface SiteData {
  id: string;
  siteName: string;
  address?: string;
  status: SiteStatus; 
}

interface WorkLogPageProps {
  partnerUid: string | null;
}

const DEFAULT_STATUS_ORDER: SiteStatus[] = [
  '미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'
];
const ALL_STATUSES: SiteStatus[] = [...DEFAULT_STATUS_ORDER, 'deleted'];

const formatDate = (timestamp: any) => {
  if (!timestamp) return '-';
  if (timestamp.toDate) return timestamp.toDate().toISOString().split('T')[0];
  return new Date(timestamp).toISOString().split('T')[0];
};

const WorkLogPage: React.FC<WorkLogPageProps> = ({ partnerUid }) => {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const db = getFirestore();

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [siteList, setSiteList] = useState<SiteData[]>([]);
  const [siteName, setSiteName] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [siteSearchTerm, setSiteSearchTerm] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  
  const [currentOrder, setCurrentOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [visibleStatuses, setVisibleStatuses] = useState<SiteStatus[]>(ALL_STATUSES);
  
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [isVisibilityModalOpen, setIsVisibilityModalOpen] = useState(false);
  
  const [tempOrder, setTempOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [tempVisible, setTempVisible] = useState<SiteStatus[]>(ALL_STATUSES);

  const [selectedLog, setSelectedLog] = useState<WorkLog | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

useEffect(() => {
  // onSnapshot 대신 onAuthStateChanged를 사용해야 합니다.
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      setCurrentUser(user);
    } else {
      setLoading(false);
      setErrorMsg('로그인이 필요한 서비스입니다.');
    }
  });
  return () => unsubscribe();
}, []);

  useEffect(() => {
    if (!partnerUid) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        if (!siteId) {
          const sitesRef = collection(db, 'users', partnerUid, 'sites');
          const sitesSnapshot = await getDocs(sitesRef);
          const sites = sitesSnapshot.docs.map(doc => ({
            id: doc.id,
            siteName: doc.data().siteName || '이름 없는 현장',
            address: doc.data().address,
            status: doc.data().status || '미팅중'
          })) as SiteData[];
          setSiteList(sites);
          setLoading(false);
        } else {
          const siteDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
          if (siteDoc.exists()) setSiteName(siteDoc.data().siteName);

          // [주의] orderBy가 2개 이상일 경우 Firestore 콘솔에서 '복합 색인'을 생성해야 데이터가 보입니다.
          // 색인이 생성되기 전까지는 orderBy('workDate', 'desc') 하나만 사용하세요.
          const q = query(
            collection(db, 'users', partnerUid, 'sites', siteId, 'workLogs'),
            orderBy('workDate', 'desc') 
          );

          const unsubscribe = onSnapshot(q, (snapshot) => {
            const logData = snapshot.docs.map(doc => {
              const data = doc.data();
              // [필드명 매핑 수정] Modal에서 저장하는 필드명과 일치하도록 수정
              return {
                id: doc.id,
                workDate: data.workDate || data.date || '-',
                todayWork: data.todayWork || data.todayProcess || '-',
                nextWork: data.nextWork || data.tomorrowProcess || '-',
                issues: data.issues || data.siteIssues || '',
                meetingLog: data.meetingLog || data.clientMeeting || '',
                images: data.images || data.imageUrls || [],
                author: data.author || data.authorName || '작성자 미상',
                createdAt: data.createdAt
              };
            }) as WorkLog[];
            setLogs(logData);
            setLoading(false);
          }, (err) => {
            console.error("Firestore Error:", err);
            setErrorMsg("데이터를 불러오는 중 오류가 발생했습니다.");
            setLoading(false);
          });
          return unsubscribe;
        }
      } catch (err) { 
        console.error(err); 
        setErrorMsg('데이터를 불러오는 중 오류가 발생했습니다.'); 
        setLoading(false); 
      }
    };
    fetchData();
  }, [partnerUid, siteId, db]);

  const filteredSiteList = useMemo(() => {
    let result = [...siteList];
    if (siteSearchTerm) {
      const lower = siteSearchTerm.toLowerCase();
      result = result.filter(site => site.siteName.toLowerCase().includes(lower) || (site.address && site.address.toLowerCase().includes(lower)));
    }
    result = result.filter(site => visibleStatuses.includes(site.status));
    result.sort((a, b) => {
      const isDeletedA = a.status === 'deleted', isDeletedB = b.status === 'deleted';
      if (isDeletedA && !isDeletedB) return 1; if (!isDeletedA && isDeletedB) return -1; if (isDeletedA && isDeletedB) return 0;
      const indexA = currentOrder.indexOf(a.status), indexB = currentOrder.indexOf(b.status);
      const safeIndexA = indexA === -1 ? 999 : indexA, safeIndexB = indexB === -1 ? 999 : indexB;
      return safeIndexA - safeIndexB;
    });
    return result;
  }, [siteList, siteSearchTerm, currentOrder, visibleStatuses]);

  const filteredLogs = useMemo(() => {
    if (!logSearchTerm) return logs;
    const lower = logSearchTerm.toLowerCase();
    return logs.filter(log => 
        log.todayWork.toLowerCase().includes(lower) || 
        log.author.toLowerCase().includes(lower) || 
        log.workDate.includes(lower)
    );
  }, [logs, logSearchTerm]);

  const openSortModal = () => { setTempOrder([...currentOrder]); setIsSortModalOpen(true); };
  const openVisibilityModal = () => { setTempVisible([...visibleStatuses]); setIsVisibilityModalOpen(true); };
  const saveSortOrder = () => { setCurrentOrder(tempOrder); setIsSortModalOpen(false); };
  const saveVisibility = () => { setVisibleStatuses(tempVisible); setIsVisibilityModalOpen(false); };
  const moveSortItem = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...tempOrder];
    if (direction === 'up') { if (index === 0) return; [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]; } 
    else { if (index === newOrder.length - 1) return; [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]]; }
    setTempOrder(newOrder);
  };
  const toggleVisibility = (status: SiteStatus) => { setTempVisible(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]); };
  const toggleExpand = (id: string) => { const newSet = new Set(expandedItemIds); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setExpandedItemIds(newSet); };

  if (loading) return <div className="wlp-loading"><div className="spinner"></div><p>데이터를 불러오는 중...</p></div>;
  if (errorMsg) return <div className="wlp-error">{errorMsg}</div>;

  // [CASE A] 현장 선택 화면
  if (!siteId) {
    return (
      <div className="wlp-container">
        <div className="wlp-header">
          <div className="wlp-title-area">
            <h2>작업일지 현장 선택</h2>
            <p>작업일지를 작성하거나 조회할 현장을 선택하세요.</p>
          </div>
        </div>
        <div className="wlp-filter-panel">
          <div className="wlp-filter-row">
              <div className="wlp-filter-item search">
                  <Search size={18} className="search-icon"/>
                  <input type="text" className="wlp-input search" placeholder="현장명, 주소로 검색" value={siteSearchTerm} onChange={(e) => setSiteSearchTerm(e.target.value)} />
              </div>
              <div className="wlp-action-group">
                  <button className="wlp-btn wlp-btn-secondary" onClick={openSortModal}>⚙️ 정렬 변경</button>
                  <button className="wlp-btn wlp-btn-secondary" onClick={openVisibilityModal}>👁️ 노출 변경</button>
              </div>
          </div>
        </div>
        <div className="wlp-desktop-view">
            <div className="wlp-table-container">
                <div className="wlp-table-wrapper">
                    <table className="wlp-table">
                        <colgroup>
                            <col style={{ width: '120px' }} />
                            <col style={{ width: '30%' }} />
                            <col style={{ width: '40%' }} />
                            <col style={{ width: '20%' }} />
                        </colgroup>
                        <thead><tr><th>상태</th><th>현장명</th><th>주소</th><th className="text-center">일지 보러가기</th></tr></thead>
                        <tbody>
                            {filteredSiteList.length === 0 ? (
                                <tr><td colSpan={4} className="wlp-no-data">검색된 현장이 없습니다.</td></tr>
                            ) : (
                                filteredSiteList.map(site => (
                                    <tr key={site.id} style={site.status === 'deleted' ? {backgroundColor:'#fff5f5', color:'#999'} : {}}>
                                        <td className="text-center"><span className={`wlp-badge status ${site.status}`}>{site.status === 'deleted' ? '삭제대기' : site.status}</span></td>
                                        <td><button className="wlp-link-text" onClick={() => navigate(`/program/site-log/${site.id}`)}>{site.siteName}</button></td>
                                        <td>{site.address}</td>
                                        <td className="text-center"><button className="wlp-btn-mini primary" onClick={() => navigate(`/program/site-log/${site.id}`)}>선택</button></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        {/* Mobile View 생략 */}
      </div>
    );
  }

  // [CASE B] 작업일지 리스트 화면
  return (
    <div className="wlp-container">
      <div className="wlp-header">
        <div className="wlp-title-area with-back">
          <button className="wlp-btn-back" onClick={() => navigate('/program/site-log')}><ChevronLeft size={20} /></button>
          <div><h2>[{siteName}] 작업일지</h2><p>해당 현장의 작업 진행 상황을 기록하고 공유합니다.</p></div>
        </div>
      </div>
      <div className="wlp-filter-panel">
        <div className="wlp-filter-row">
            <div className="wlp-filter-item search">
                <Search size={18} className="search-icon"/>
                <input type="text" className="wlp-input search" placeholder="작업날짜, 작성자, 내용으로 검색" value={logSearchTerm} onChange={(e) => setLogSearchTerm(e.target.value)} />
            </div>
            <div className="wlp-action-group">
                <button className="wlp-btn wlp-btn-primary" onClick={() => setIsRegModalOpen(true)}><Plus size={16} /> 일지 작성</button>
            </div>
        </div>
      </div>
      <div className="wlp-desktop-view">
        <div className="wlp-table-container">
            <div className="wlp-table-wrapper">
                <table className="wlp-table">
                    <colgroup>
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '100px' }} />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col style={{ width: '80px' }} />
                    </colgroup>
                    <thead>
                        <tr><th>작업 날짜</th><th>작성 날짜</th><th>작성자</th><th>금일 공정</th><th>익일 예정</th><th>특이사항</th><th>고객 미팅</th><th className="text-center">첨부</th></tr>
                    </thead>
                    <tbody>
                        {filteredLogs.length === 0 ? (
                            <tr><td colSpan={8} className="wlp-no-data">등록된 작업일지가 없습니다.</td></tr>
                        ) : (
                            filteredLogs.map((log) => (
                                <tr key={log.id} onClick={() => setSelectedLog(log)} className="clickable-row">
                                    <td className="font-bold text-primary">{log.workDate}</td>
                                    <td className="text-secondary" style={{fontSize:'12px'}}>{formatDate(log.createdAt)}</td>
                                    <td>{log.author}</td>
                                    <td className="cell-truncate">{log.todayWork}</td>
                                    <td className="cell-truncate">{log.nextWork}</td>
                                    <td className="cell-truncate">{log.issues || '-'}</td>
                                    <td className="cell-truncate">{log.meetingLog || '-'}</td>
                                    <td className="text-center">
                                        {log.images && log.images.length > 0 ? (<span className="wlp-badge photo"><Camera size={12} style={{marginRight:'2px'}}/> {log.images.length}</span>) : '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* 상세 보기 모달 */}
      {selectedLog && (
        <div className="wlp-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="wlp-detail-paper" onClick={(e) => e.stopPropagation()}>
            <div className="wlp-detail-header">
              <h2>{selectedLog.workDate} 작업일지 상세</h2>
              <button onClick={() => setSelectedLog(null)} className="btn-close">&times;</button>
            </div>
            <div className="wlp-detail-body">
              <div className="meta-info">작성일: {formatDate(selectedLog.createdAt)} <span className="sep">|</span> 작성자: {selectedLog.author}</div>
              <div className="detail-section"><span className="label text-success"><FileText size={14}/> 금일 작업 공정</span><div className="content-box">{selectedLog.todayWork}</div></div>
              <div className="detail-section"><span className="label text-primary"><Calendar size={14}/> 익일 작업 예정</span><div className="content-box">{selectedLog.nextWork}</div></div>
              <div className="detail-section"><span className="label text-danger"><AlertCircle size={14}/> 현장 특이사항</span><div className="content-box">{selectedLog.issues || '없음'}</div></div>
              <div className="detail-section"><span className="label text-secondary"><UserIcon size={14}/> 고객 미팅 내용</span><div className="content-box">{selectedLog.meetingLog || '없음'}</div></div>
              {selectedLog.images && selectedLog.images.length > 0 && (
                <div className="detail-section"><span className="label"><Camera size={14}/> 현장 사진 ({selectedLog.images.length})</span>
                  <div className="photo-grid">{selectedLog.images.map((url, idx) => (<div key={idx} className="photo-item" onClick={() => setZoomedImage(url)}><img src={url} alt="현장사진" /></div>))}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {zoomedImage && <div className="wlp-modal-overlay dark" onClick={() => setZoomedImage(null)}><img src={zoomedImage} alt="확대" className="zoomed-image" /><button className="btn-close-zoom" onClick={() => setZoomedImage(null)}>&times;</button></div>}
      {isRegModalOpen && siteId && partnerUid && <WorkLogModal siteId={siteId} partnerUid={partnerUid} siteName={siteName} onClose={() => setIsRegModalOpen(false)} onSuccess={() => setIsRegModalOpen(false)} />}
    </div>
  );
};

export default WorkLogPage;