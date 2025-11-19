// src/pages/program/WorkLogPage.tsx

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
// 현장 상태값 타입
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
  status: SiteStatus; // [⭐ 추가] 상태값
}

interface WorkLogPageProps {
  partnerUid: string | null;
}

// 기본 정렬 순서
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

  // --- 상태 관리 ---
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [siteList, setSiteList] = useState<SiteData[]>([]);
  const [siteName, setSiteName] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [siteSearchTerm, setSiteSearchTerm] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  
  // [⭐ 추가] 정렬 및 노출 설정 상태
  const [currentOrder, setCurrentOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [visibleStatuses, setVisibleStatuses] = useState<SiteStatus[]>(ALL_STATUSES);
  
  // 모달 상태
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false); // 정렬 모달
  const [isVisibilityModalOpen, setIsVisibilityModalOpen] = useState(false); // 노출 모달
  
  // 임시 저장용 상태 (모달 내부용)
  const [tempOrder, setTempOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [tempVisible, setTempVisible] = useState<SiteStatus[]>(ALL_STATUSES);

  const [selectedLog, setSelectedLog] = useState<WorkLog | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. 로그인 감지
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

  // 2. 데이터 로딩
  useEffect(() => {
    if (!partnerUid) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        if (!siteId) {
          // [CASE A] 현장 목록 로딩
          const sitesRef = collection(db, 'users', partnerUid, 'sites');
          const sitesSnapshot = await getDocs(sitesRef);
          const sites = sitesSnapshot.docs.map(doc => ({
            id: doc.id,
            siteName: doc.data().siteName || '이름 없는 현장',
            address: doc.data().address,
            status: doc.data().status || '미팅중' // [⭐ 추가] 상태값 가져오기
          })) as SiteData[];
          setSiteList(sites);
          setLoading(false);
        } else {
          // [CASE B] 작업일지 목록 로딩
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

  // [⭐ 수정] 현장 목록 필터링 및 정렬 로직 적용
  const filteredSiteList = useMemo(() => {
    let result = [...siteList];

    // 1. 검색어 필터링
    if (siteSearchTerm) {
      const lower = siteSearchTerm.toLowerCase();
      result = result.filter(site => 
        site.siteName.toLowerCase().includes(lower) || 
        (site.address && site.address.toLowerCase().includes(lower))
      );
    }

    // 2. 노출 설정 필터링
    result = result.filter(site => visibleStatuses.includes(site.status));

    // 3. 사용자 지정 순서 정렬
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

  // 작업일지 검색 필터링
  const filteredLogs = useMemo(() => {
    if (!logSearchTerm) return logs;
    const lower = logSearchTerm.toLowerCase();
    return logs.filter(log => 
      log.todayProcess.toLowerCase().includes(lower) ||
      log.authorName.toLowerCase().includes(lower) ||
      log.date.includes(lower)
    );
  }, [logs, logSearchTerm]);

  // --- 모달 핸들러 ---
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

  // [CASE A] 현장 선택 화면 (필터링 및 정렬 적용됨)
  if (!siteId) {
    return (
      <div className="worklog-list-container">
        <div className="worklog-header-row">
          <h2>작업일지 현장 선택</h2>
          {/* [⭐ 추가] 헤더 버튼 그룹 */}
          <div className="header-actions">
            <button className="header-btn" onClick={openSortModal}>⚙️ 정렬 변경</button>
            <button className="header-btn" onClick={openVisibilityModal}>👁️ 노출 변경</button>
          </div>
        </div>
        
        <input type="text" placeholder="현장명, 주소로 검색" className="worklog-search-bar" value={siteSearchTerm} onChange={(e) => setSiteSearchTerm(e.target.value)} />
        
        <div className="worklog-table-wrapper">
          <table className="worklog-table">
            <colgroup>
              <col style={{ width: '120px' }} /> {/* 상태 */}
              <col style={{ width: '30%' }} />   {/* 현장명 */}
              <col style={{ width: '40%' }} />   {/* 주소 */}
              <col style={{ width: '20%' }} />   {/* 버튼 */}
            </colgroup>
            <thead>
              <tr>
                <th>상태</th> {/* [⭐ 추가] */}
                <th>현장명</th>
                <th>주소</th>
                <th>일지 보러가기</th>
              </tr>
            </thead>
            <tbody>
              {filteredSiteList.length === 0 ? (
                <tr><td colSpan={4} style={{textAlign:'center', padding:'30px', color:'#888'}}>검색된 현장이 없습니다.</td></tr>
              ) : (
                filteredSiteList.map(site => (
                  <tr key={site.id} style={site.status === 'deleted' ? {backgroundColor:'#fff5f5', color:'#999'} : {}}>
                    <td style={{textAlign:'center', fontWeight:'bold'}}>
                      {site.status === 'deleted' ? '삭제대기' : site.status}
                    </td>
                    <td>
                      <button className="worklog-link-button" onClick={() => navigate(`/program/site-log/${site.id}`)}>
                        {site.siteName}
                      </button>
                    </td>
                    <td>{site.address}</td>
                    <td style={{ textAlign: 'center' }}>
                       <button 
                         style={{background:'#28a745', color:'#fff', border:'none', padding:'5px 10px', borderRadius:'3px', cursor:'pointer', fontSize:'13px'}}
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

        {/* [모달 1] 정렬 순서 변경 */}
        {isSortModalOpen && (
          <div className="modal-backdrop">
            <div className="sort-modal-content">
              <h3>상태값 정렬 순서</h3>
              <ul className="modal-list">
                {tempOrder.map((status, index) => (
                  <li key={status} className="modal-item">
                    <span>{index + 1}. {status}</span>
                    <div className="sort-controls">
                      <button onClick={() => moveSortItem(index, 'up')} disabled={index === 0}>▲</button>
                      <button onClick={() => moveSortItem(index, 'down')} disabled={index === tempOrder.length - 1}>▼</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="modal-footer">
                <button className="btn-close" onClick={() => setIsSortModalOpen(false)}>취소</button>
                <button className="btn-save" onClick={saveSortOrder}>저장</button>
              </div>
            </div>
          </div>
        )}

        {/* [모달 2] 노출 변경 */}
        {isVisibilityModalOpen && (
          <div className="modal-backdrop">
            <div className="sort-modal-content">
              <h3>현장 노출 설정</h3>
              <ul className="modal-list">
                {ALL_STATUSES.map((status) => (
                  <li key={status} className="modal-item">
                    <label className="visibility-label">
                      <input 
                        type="checkbox" 
                        checked={tempVisible.includes(status)}
                        onChange={() => toggleVisibility(status)}
                      />
                      {status === 'deleted' ? '삭제대기' : status}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="modal-footer">
                <button className="btn-close" onClick={() => setIsVisibilityModalOpen(false)}>취소</button>
                <button className="btn-save" onClick={saveVisibility}>저장</button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // [CASE B] 작업일지 리스트 화면 (기존 유지)
  return (
    <div className="worklog-list-container">
      <div className="worklog-header-row">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button className="btn-back" onClick={() => navigate('/program/site-log')}>목록으로</button>
          <h2>[{siteName}] 작업일지</h2>
        </div>
      </div>

      <input type="text" placeholder="작업날짜, 작성자, 내용으로 검색" className="worklog-search-bar" value={logSearchTerm} onChange={(e) => setLogSearchTerm(e.target.value)} />

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
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>등록된 작업일지가 없습니다.</td></tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ color: '#666', fontSize: '13px' }}>{formatDate(log.createdAt)}</td>
                  <td><button className="worklog-link-button" onClick={() => setSelectedLog(log)}>{log.date}</button></td>
                  <td>{log.authorName}</td>
                  <td className="col-content" title={log.todayProcess}>{log.todayProcess}</td>
                  <td className="col-content" title={log.tomorrowProcess}>{log.tomorrowProcess}</td>
                  <td className="col-content" title={log.siteIssues}>{log.siteIssues || '-'}</td>
                  <td className="col-content" title={log.clientMeeting}>{log.clientMeeting || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{log.imageUrls.length > 0 ? <span style={{ color: '#666', fontSize: '12px' }}>📷 {log.imageUrls.length}</span> : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isRegModalOpen && currentUser && siteId && partnerUid && (
        <WorkLogModal 
          siteId={siteId} 
          partnerUid={partnerUid} 
          onClose={() => setIsRegModalOpen(false)} 
        />
      )}
      
      {selectedLog && (
        <div className="modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <h2 style={{ margin: 0 }}>{selectedLog.date} 작업일지 상세</h2>
              <button onClick={() => setSelectedLog(null)} style={{ border:'none', background:'none', fontSize:'24px', cursor:'pointer' }}>&times;</button>
            </div>
            <div className="detail-body">
              <div style={{ textAlign: 'right', marginBottom: '10px', color: '#666', fontSize: '14px' }}>
                작성일: {formatDate(selectedLog.createdAt)} <span style={{margin:'0 5px'}}>|</span> 작성자: {selectedLog.authorName}
              </div>
              <div className="detail-section"><span className="detail-label" style={{color:'#28a745'}}>금일 작업 공정</span><div className="detail-content-box">{selectedLog.todayProcess}</div></div>
              <div className="detail-section"><span className="detail-label" style={{color:'#007bff'}}>익일 작업 예정</span><div className="detail-content-box">{selectedLog.tomorrowProcess}</div></div>
              <div className="detail-section"><span className="detail-label" style={{color:'#dc3545'}}>현장 특이사항</span><div className="detail-content-box">{selectedLog.siteIssues || '없음'}</div></div>
              <div className="detail-section"><span className="detail-label" style={{color:'#6c757d'}}>고객 미팅 내용</span><div className="detail-content-box">{selectedLog.clientMeeting || '없음'}</div></div>
              {selectedLog.imageUrls.length > 0 && (
                <div className="detail-section">
                  <span className="detail-label">현장 사진</span>
                  <div className="photo-grid">
                    {selectedLog.imageUrls.map((url, idx) => (
                      <div key={idx} className="photo-item" onClick={() => setZoomedImage(url)}><img src={url} alt="현장사진" /></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {zoomedImage && (
        <div className="modal-backdrop" style={{zIndex: 3000, backgroundColor:'rgba(0,0,0,0.9)'}} onClick={() => setZoomedImage(null)}>
           <img src={zoomedImage} alt="확대" style={{maxWidth:'90%', maxHeight:'90%'}} />
           <button style={{position:'absolute', top:'20px', right:'20px', color:'#fff', background:'none', border:'none', fontSize:'40px', cursor:'pointer'}} onClick={() => setZoomedImage(null)}>&times;</button>
        </div>
      )}
    </div>
  );
};

export default WorkLogPage;