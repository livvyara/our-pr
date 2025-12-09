import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, getDocs 
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../../firebase-config'; 
import WorkLogModal from '../../components/partner/WorkLogModal'; 
import './WorkLogPage.css'; 

// --- [타입 정의] ---
type SiteStatus = '미팅중' | '계약대기' | '계약완료' | '공사전' | '공사중' | '공사완료' | '보류' | '취소' | 'deleted';

interface WorkLog {
  id: string;
  date: string;
  todayProcess: string;
  tomorrowProcess: string;
  siteIssues: string;
  clientMeeting: string;
  imageUrls: string[];
  authorName: string;
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

  useEffect(() => {
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
          if (siteDoc.exists()) {
            setSiteName(siteDoc.data().siteName);
          }

          const q = query(
            collection(db, 'users', partnerUid, 'sites', siteId, 'workLogs'),
            orderBy('date', 'desc'),
            orderBy('createdAt', 'desc')
          );

          const unsubscribe = onSnapshot(q, (snapshot) => {
            const logData = snapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                date: data.date,
                todayProcess: data.todayProcess || '',
                tomorrowProcess: data.tomorrowProcess || '',
                siteIssues: data.siteIssues || '',
                clientMeeting: data.clientMeeting || '',
                imageUrls: data.imageUrls || [],
                authorName: data.authorName || '작성자 미상',
                createdAt: data.createdAt
              };
            }) as WorkLog[];
            setLogs(logData);
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
      result = result.filter(site => 
        site.siteName.toLowerCase().includes(lower) || 
        (site.address && site.address.toLowerCase().includes(lower))
      );
    }
    result = result.filter(site => visibleStatuses.includes(site.status));
    result.sort((a, b) => {
      const isDeletedA = a.status === 'deleted';
      const isDeletedB = b.status === 'deleted';
      if (isDeletedA && !isDeletedB) return 1;
      if (!isDeletedA && isDeletedB) return -1;
      if (isDeletedA && isDeletedB) return 0;

      const indexA = currentOrder.indexOf(a.status);
      const indexB = currentOrder.indexOf(b.status);
      const safeIndexA = indexA === -1 ? 999 : indexA;
      const safeIndexB = indexB === -1 ? 999 : indexB;
      return safeIndexA - safeIndexB;
    });
    return result;
  }, [siteList, siteSearchTerm, currentOrder, visibleStatuses]);

  const filteredLogs = useMemo(() => {
    if (!logSearchTerm) return logs;
    const lower = logSearchTerm.toLowerCase();
    return logs.filter(log => 
      log.todayProcess.toLowerCase().includes(lower) ||
      log.authorName.toLowerCase().includes(lower) ||
      log.date.includes(lower)
    );
  }, [logs, logSearchTerm]);

  const openSortModal = () => { setTempOrder([...currentOrder]); setIsSortModalOpen(true); };
  const openVisibilityModal = () => { setTempVisible([...visibleStatuses]); setIsVisibilityModalOpen(true); };
  const saveSortOrder = () => { setCurrentOrder(tempOrder); setIsSortModalOpen(false); };
  const saveVisibility = () => { setVisibleStatuses(tempVisible); setIsVisibilityModalOpen(false); };
  const moveSortItem = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...tempOrder];
    if (direction === 'up') {
      if (index === 0) return;
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    } else {
      if (index === newOrder.length - 1) return;
      [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
    }
    setTempOrder(newOrder);
  };
  const toggleVisibility = (status: SiteStatus) => {
    setTempVisible(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };

  if (loading) return <div style={{ padding: '20px' }}>데이터를 불러오는 중...</div>;
  if (errorMsg) return <div style={{ padding: '20px', color: 'red' }}>{errorMsg}</div>;

  // [CASE A] 현장 선택 화면
  if (!siteId) {
    return (
      <div className="worklog-page-container">
        <div className="worklog-header-wrapper">
          <div className="worklog-title">
            <h2>작업일지 현장 선택</h2>
            <p>작업일지를 작성하거나 조회할 현장을 선택하세요.</p>
          </div>
          
          <div className="worklog-control-panel">
            <div className="worklog-filter-row">
                <input 
                    type="text" 
                    placeholder="현장명, 주소로 검색" 
                    className="worklog-search-input" 
                    value={siteSearchTerm} 
                    onChange={(e) => setSiteSearchTerm(e.target.value)} 
                />
            </div>
            <div className="worklog-action-group">
                <button className="worklog-btn-manual" onClick={openSortModal}>⚙️ 정렬 변경</button>
                <button className="worklog-btn-manual" onClick={openVisibilityModal}>👁️ 노출 변경</button>
            </div>
          </div>
        </div>
        
        <div className="worklog-result-section">
          <div className="worklog-table-wrapper">
            <table className="worklog-table">
              <colgroup>
                <col style={{ width: '120px' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '40%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>상태</th>
                  <th>현장명</th>
                  <th>주소</th>
                  <th>일지 보러가기</th>
                </tr>
              </thead>
              <tbody>
                {filteredSiteList.length === 0 ? (
                  <tr><td colSpan={4} className="worklog-no-data">검색된 현장이 없습니다.</td></tr>
                ) : (
                  filteredSiteList.map(site => (
                    <tr key={site.id} className="site-row" style={site.status === 'deleted' ? {backgroundColor:'#fff5f5', color:'#999'} : {}}>
                      <td data-label="현장명">
                        <button className="worklog-link-text" onClick={() => navigate(`/program/site-log/${site.id}`)}>
                          {site.siteName}
                        </button>
                      </td>
                      <td data-label="상태" style={{textAlign:'center'}}>
                        <span className={`worklog-status-badge ${site.status === 'deleted' ? 'deleted' : ''}`}>
                            {site.status === 'deleted' ? '삭제대기' : site.status}
                        </span>
                      </td>
                      <td data-label="주소">{site.address}</td>
                      <td data-label="바로가기" style={{ textAlign: 'center' }}>
                         <button 
                           className="worklog-btn-primary"
                           style={{padding:'4px 12px', fontSize:'12px', height:'30px', margin:'0 auto'}}
                           onClick={() => navigate(`/program/site-log/${site.id}`)}
                         >
                           선택
                         </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 모달들 (정렬/노출) */}
        {isSortModalOpen && (
          <div className="worklog-modal-backdrop" onClick={() => setIsSortModalOpen(false)}>
            <div className="worklog-modal-paper" onClick={e => e.stopPropagation()}>
              <h3 className="worklog-modal-title">상태값 정렬 순서</h3>
              <ul className="worklog-modal-list">
                {tempOrder.map((status, index) => (
                  <li key={status} className="worklog-modal-item">
                    <span>{index + 1}. {status}</span>
                    <div>
                      <button className="worklog-btn-manual" style={{padding:'2px 6px', height:'auto'}} onClick={() => moveSortItem(index, 'up')} disabled={index === 0}>▲</button>
                      <button className="worklog-btn-manual" style={{padding:'2px 6px', height:'auto', marginLeft:'5px'}} onClick={() => moveSortItem(index, 'down')} disabled={index === tempOrder.length - 1}>▼</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="worklog-modal-footer">
                <button className="worklog-btn-cancel" onClick={() => setIsSortModalOpen(false)}>취소</button>
                <button className="worklog-btn-save" onClick={saveSortOrder}>저장</button>
              </div>
            </div>
          </div>
        )}

        {isVisibilityModalOpen && (
          <div className="worklog-modal-backdrop" onClick={() => setIsVisibilityModalOpen(false)}>
            <div className="worklog-modal-paper" onClick={e => e.stopPropagation()}>
              <h3 className="worklog-modal-title">현장 노출 설정</h3>
              <ul className="worklog-modal-list">
                {ALL_STATUSES.map((status) => (
                  <li key={status} className="worklog-modal-item">
                    <label style={{display:'flex', alignItems:'center', width:'100%', cursor:'pointer'}}>
                      <input type="checkbox" checked={tempVisible.includes(status)} onChange={() => toggleVisibility(status)} style={{marginRight:'10px'}} />
                      {status === 'deleted' ? '삭제대기' : status}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="worklog-modal-footer">
                <button className="worklog-btn-cancel" onClick={() => setIsVisibilityModalOpen(false)}>취소</button>
                <button className="worklog-btn-save" onClick={saveVisibility}>저장</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // [CASE B] 작업일지 리스트 화면
  return (
    <div className="worklog-page-container">
      <div className="worklog-header-wrapper">
        <div className="worklog-title">
          <h2>
             <button className="worklog-btn-back" onClick={() => navigate('/program/site-log')}>← 목록</button>
             [{siteName}] 작업일지
          </h2>
          <p>해당 현장의 작업 진행 상황을 기록하고 공유합니다.</p>
        </div>

        <div className="worklog-control-panel">
            <div className="worklog-filter-row">
                <input 
                    type="text" 
                    placeholder="작업날짜, 작성자, 내용으로 검색" 
                    className="worklog-search-input" 
                    value={logSearchTerm} 
                    onChange={(e) => setLogSearchTerm(e.target.value)} 
                />
            </div>
            <div className="worklog-action-group">
                <button className="worklog-btn-primary" onClick={() => setIsRegModalOpen(true)}>
                    + 일지 작성
                </button>
            </div>
        </div>
      </div>

      <div className="worklog-result-section">
        <div className="worklog-table-wrapper">
            <table className="worklog-table">
              <colgroup>
                <col style={{ width: '100px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
                <col />
                <col />
                <col />
                <col />
                <col style={{ width: '60px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>작성 날짜</th>
                  <th>작업 날짜</th>
                  <th>작성자</th>
                  <th>금일 작업 공정</th>
                  <th>익일 작업 예정</th>
                  <th>현장 특이사항</th>
                  <th>고객 미팅 내용</th>
                  <th>첨부</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={8} className="worklog-no-data">등록된 작업일지가 없습니다.</td></tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="log-row">
                      <td data-label="작업 날짜">
                        <button className="worklog-link-text" onClick={() => setSelectedLog(log)}>{log.date}</button>
                      </td>
                      <td data-label="작성 날짜" style={{ color: '#666', fontSize: '12px' }}>{formatDate(log.createdAt)}</td>
                      <td data-label="작성자">{log.authorName}</td>
                      <td data-label="금일 공정" className="cell-content-truncate" title={log.todayProcess}>{log.todayProcess}</td>
                      <td data-label="익일 예정" className="cell-content-truncate" title={log.tomorrowProcess}>{log.tomorrowProcess}</td>
                      <td data-label="특이사항" className="cell-content-truncate" title={log.siteIssues}>{log.siteIssues || '-'}</td>
                      <td data-label="미팅내용" className="cell-content-truncate" title={log.clientMeeting}>{log.clientMeeting || '-'}</td>
                      <td data-label="사진" style={{ textAlign: 'center' }}>
                          {log.imageUrls.length > 0 ? <span style={{ color: '#666', fontSize: '12px' }}>📷 {log.imageUrls.length}</span> : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
        </div>
      </div>

      {isRegModalOpen && currentUser && siteId && partnerUid && (
        <WorkLogModal 
          siteId={siteId} 
          partnerUid={partnerUid} 
          onClose={() => setIsRegModalOpen(false)} 
        />
      )}
      
      {/* 상세 보기 모달 */}
      {selectedLog && (
        <div className="worklog-modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="worklog-detail-paper" onClick={(e) => e.stopPropagation()}>
            <div className="worklog-detail-header">
              <h2>{selectedLog.date} 작업일지 상세</h2>
              <button onClick={() => setSelectedLog(null)} style={{ border:'none', background:'none', fontSize:'24px', cursor:'pointer' }}>&times;</button>
            </div>
            <div className="worklog-detail-body">
              <div style={{ textAlign: 'right', marginBottom: '10px', color: '#666', fontSize: '13px' }}>
                작성일: {formatDate(selectedLog.createdAt)} <span style={{margin:'0 5px'}}>|</span> 작성자: {selectedLog.authorName}
              </div>
              <div className="worklog-detail-section"><span className="worklog-detail-label" style={{color:'#28a745'}}>금일 작업 공정</span><div className="worklog-detail-box">{selectedLog.todayProcess}</div></div>
              <div className="worklog-detail-section"><span className="worklog-detail-label" style={{color:'#007bff'}}>익일 작업 예정</span><div className="worklog-detail-box">{selectedLog.tomorrowProcess}</div></div>
              <div className="worklog-detail-section"><span className="worklog-detail-label" style={{color:'#dc3545'}}>현장 특이사항</span><div className="worklog-detail-box">{selectedLog.siteIssues || '없음'}</div></div>
              <div className="worklog-detail-section"><span className="worklog-detail-label" style={{color:'#6c757d'}}>고객 미팅 내용</span><div className="worklog-detail-box">{selectedLog.clientMeeting || '없음'}</div></div>
              {selectedLog.imageUrls.length > 0 && (
                <div className="worklog-detail-section">
                  <span className="worklog-detail-label">현장 사진</span>
                  <div className="worklog-photo-grid">
                    {selectedLog.imageUrls.map((url, idx) => (
                      <div key={idx} className="worklog-photo-item" onClick={() => setZoomedImage(url)}><img src={url} alt="현장사진" /></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {zoomedImage && (
        <div className="worklog-modal-backdrop" style={{zIndex: 3500, backgroundColor:'rgba(0,0,0,0.9)'}} onClick={() => setZoomedImage(null)}>
           <img src={zoomedImage} alt="확대" style={{maxWidth:'95%', maxHeight:'95%', objectFit:'contain'}} />
           <button style={{position:'absolute', top:'20px', right:'20px', color:'#fff', background:'none', border:'none', fontSize:'40px', cursor:'pointer'}} onClick={() => setZoomedImage(null)}>&times;</button>
        </div>
      )}
    </div>
  );
};

export default WorkLogPage;