import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, deleteDoc, 
  query, where, orderBy, onSnapshot, writeBatch, addDoc, serverTimestamp, getDoc
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import './WorkerManagementPage.css'; 
import WorkerModal from '../../components/partner/WorkerModal'; 
import TradeManageModal from '../../components/partner/TradeManageModal';
import BulkTradeEditModal from '../../components/partner/BulkTradeEditModal';
import BulkTypeEditModal from '../../components/partner/BulkTypeEditModal';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export interface WorkerData {
  id: string;
  workerName: string;
  companyName: string;
  trade: string;
  phoneNumber: string;
  workerType: 'agency' | 'freelance';
  residentNumber: string;
  bankName: string;
  accountNumber: string;
  accountOwner: string;
  idCardUrl?: string;
  delegationUrl?: string;
  appliedTaxRate: number;
  rrn?: string; 
}

type SortKey = 'workerName' | 'companyName' | 'trade' | 'phoneNumber' | 'residentNumber';
interface SortConfig {
    key: SortKey;
    direction: 'asc' | 'desc';
}

const WorkerManagementPage: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // [중요] 데이터 소유자의 UID (파트너 본인 또는 직원의 경우 대표 UID)
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  
  // 로그인한 사용자 정보 (로그 기록용)
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrade, setSelectedTrade] = useState('전체');
  const [tradeOptions, setTradeOptions] = useState<string[]>(['전체']); 

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTradeManagerOpen, setIsTradeManagerOpen] = useState(false); 
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isBulkTypeEditOpen, setIsBulkTypeEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkerData | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'workerName', direction: 'asc' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                
                // 1. 로그인한 사용자 정보 저장 (로그용)
                setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });

                // 2. [핵심 수정] 데이터 소유자(Target UID) 결정
                let targetUid = user.uid; // 기본은 본인
                
                // 직원이면 대표(owner)의 UID를 사용
                if (d.role === 'sub_partner' && d.partnerInfo && d.partnerInfo.ownerUid) {
                    targetUid = d.partnerInfo.ownerUid;
                }

                setCurrentUid(targetUid); // 상태 업데이트
                
                // 3. 데이터 로드 (Target UID 기준)
                fetchTrades(targetUid); 
                subscribeWorkers(targetUid);
            }
        } catch (e) {
            console.error("사용자 정보 로드 실패", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchTrades = async (uid: string) => {
    try {
      const q = query(collection(db, 'users', uid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => d.data().name);
      setTradeOptions(['전체', ...list]);
    } catch (e) {
      console.log("공종 로드 실패", e);
      setTradeOptions(['전체']);
    }
  };

  const subscribeWorkers = (uid: string) => {
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'workers'), orderBy('workerName'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: WorkerData[] = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        
        let finalRrn = d.residentNumber;
        if (!finalRrn) finalRrn = d.rrn;
        if (!finalRrn) finalRrn = d.residentNo;
        if (!finalRrn) finalRrn = '';

        list.push({
          id: doc.id,
          workerName: d.workerName || '',
          companyName: d.companyName || '',
          trade: d.trade || '미지정',
          phoneNumber: d.phoneNumber || '',
          residentNumber: finalRrn, 
          workerType: d.workerType || 'freelance',
          bankName: d.bankName || '',
          accountNumber: d.accountNumber || '',
          accountOwner: d.accountOwner || d.workerName || '',
          idCardUrl: d.idCardUrl || d.idCardImageUrl || '',
          delegationUrl: d.delegationUrl,
          appliedTaxRate: d.appliedTaxRate || 3.3,
          rrn: d.rrn
        });
      });
      setWorkers(list);
      setLoading(false);
    });
    return unsubscribe;
  };

  const handleSort = (key: SortKey) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const getBirthDateFromRrn = (rrn: string) => {
      const cleanRrn = rrn.replace(/-/g, '').trim();
      if (cleanRrn.length < 7) return 0;

      const yy = parseInt(cleanRrn.substring(0, 2), 10);
      const mmdd = cleanRrn.substring(2, 6);
      const gender = cleanRrn.charAt(6);

      let fullYear = yy;
      if (['1', '2', '5', '6'].includes(gender)) {
          fullYear += 1900;
      } else if (['3', '4', '7', '8'].includes(gender)) {
          fullYear += 2000;
      } else if (['9', '0'].includes(gender)) {
          fullYear += 1800;
      }

      return parseInt(`${fullYear}${mmdd}`, 10);
  };

  const processedWorkers = useMemo(() => {
      let filtered = workers.filter(worker => {
          if (selectedTrade !== '전체' && worker.trade !== selectedTrade) return false;
          if (searchQuery) {
              const lowerQuery = searchQuery.toLowerCase();
              const nameMatch = worker.workerName.toLowerCase().includes(lowerQuery);
              const companyMatch = worker.companyName.toLowerCase().includes(lowerQuery);
              const tradeMatch = worker.trade.toLowerCase().includes(lowerQuery);
              if (!nameMatch && !companyMatch && !tradeMatch) return false;
          }
          return true;
      });

      if (sortConfig) {
          filtered.sort((a, b) => {
              if (sortConfig.key === 'residentNumber') {
                  const dateA = getBirthDateFromRrn(a.residentNumber);
                  const dateB = getBirthDateFromRrn(b.residentNumber);
                  if (dateA < dateB) return sortConfig.direction === 'asc' ? -1 : 1;
                  if (dateA > dateB) return sortConfig.direction === 'asc' ? 1 : -1;
                  return 0;
              }
              const aValue = (a[sortConfig.key] || '').toString();
              const bValue = (b[sortConfig.key] || '').toString();
              
              if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
              if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }

      return filtered;
  }, [workers, searchQuery, selectedTrade, sortConfig]);

  const getSortIcon = (key: SortKey) => {
      if (sortConfig.key !== key) return <span className="sort-icon">⇵</span>;
      return sortConfig.direction === 'asc' ? <span className="sort-icon active">▲</span> : <span className="sort-icon active">▼</span>;
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          const allIds = new Set(processedWorkers.map(w => w.id));
          setSelectedIds(allIds);
      } else {
          setSelectedIds(new Set());
      }
  };

  const handleSelectRow = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleBulkUpdate = async (newTrade: string) => {
      if (!currentUid || selectedIds.size === 0) return;
      try {
          const batch = writeBatch(db);
          selectedIds.forEach(id => {
              const ref = doc(db, 'users', currentUid, 'workers', id);
              batch.update(ref, { trade: newTrade });
          });
          await batch.commit();

          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
              text: `${currentUserInfo.name}님이 작업자 ${selectedIds.size}명의 공종을 [${newTrade}]로 일괄 수정했습니다.`,
              createdAt: serverTimestamp(),
              type: 'worker_update_bulk'
          });

          alert("일괄 수정되었습니다.");
          setIsBulkEditOpen(false);
          setSelectedIds(new Set()); 
      } catch (e) { console.error(e); alert("오류 발생"); }
  };

  const handleBulkTypeUpdate = async (newType: 'agency' | 'freelance') => {
      if (!currentUid || selectedIds.size === 0) return;
      try {
          let taxRates = { agency: 10.0, freelance: 3.3 };
          try {
            const settingSnap = await getDoc(doc(db, 'users', currentUid, 'settings', 'taxRates'));
            if (settingSnap.exists()) taxRates = settingSnap.data() as any;
          } catch(e) {}

          const newRate = newType === 'agency' ? taxRates.agency : taxRates.freelance;
          const batch = writeBatch(db);
          selectedIds.forEach(id => {
              const ref = doc(db, 'users', currentUid, 'workers', id);
              batch.update(ref, { workerType: newType, appliedTaxRate: newRate });
          });
          await batch.commit();

          const typeName = newType === 'agency' ? '인력소' : '프리랜서';
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
              text: `${currentUserInfo.name}님이 작업자 ${selectedIds.size}명의 유형을 [${typeName}]로 일괄 수정했습니다.`,
              createdAt: serverTimestamp(),
              type: 'worker_update_bulk'
          });

          alert("일괄 수정되었습니다.");
          setIsBulkTypeEditOpen(false);
          setSelectedIds(new Set()); 
      } catch (e) { console.error(e); alert("오류 발생"); }
  };

  const openBulkEditModal = () => {
      if (selectedIds.size === 0) return alert("수정할 작업자를 선택해주세요.");
      setIsBulkEditOpen(true);
  };

  const openBulkTypeEditModal = () => {
      if (selectedIds.size === 0) return alert("수정할 작업자를 선택해주세요.");
      setIsBulkTypeEditOpen(true);
  };

  const handleDelete = async (id: string) => {
      if(!currentUid) return;
      if(!confirm("삭제하시겠습니까?")) return;
      try {
          await deleteDoc(doc(db, 'users', currentUid, 'workers', id));
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
                text: `${currentUserInfo.name}님이 작업자를 삭제했습니다.`,
                createdAt: serverTimestamp(), type: 'worker_delete'
          });
          alert("삭제되었습니다.");
      } catch(e) { alert("삭제 실패"); }
  }

  const handleOpenAdd = () => { setEditTarget(null); setIsModalOpen(true); };
  const handleOpenEdit = (worker: WorkerData) => { setEditTarget(worker); setIsModalOpen(true); };

  const handleTradeManagerClose = () => {
      setIsTradeManagerOpen(false);
      if (currentUid) fetchTrades(currentUid);
  };

  return (
    <div className="worker-page-container">
      <div className="worker-header">
        <h2>작업자 관리</h2>
        <p>등록된 작업자 정보를 조회하고 관리합니다.</p>
      </div>

      <div className="worker-control-panel">
        <div className="filter-row">
            <div className="search-box">
                <input type="text" placeholder="이름, 업체명, 공종 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <span className="icon">🔍</span>
            </div>
            <div className="filter-box">
                <select value={selectedTrade} onChange={(e) => setSelectedTrade(e.target.value)}>
                    {tradeOptions.map((trade, idx) => (
                        <option key={idx} value={trade}>{trade === '전체' ? '전체 공종' : trade}</option>
                    ))}
                </select>
            </div>
            
            <div style={{flex:1}}></div>

            <button className="btn-bulk-edit" onClick={openBulkTypeEditModal}>
                👥 유형 일괄 수정
            </button>

            <button className="btn-bulk-edit" onClick={openBulkEditModal}>
                ✏️ 공종 일괄 수정
            </button>

            <button className="btn-manage-trade" onClick={() => setIsTradeManagerOpen(true)}>
                ⚙️ 공종 관리
            </button>
            
            <button className="btn-add-worker" onClick={handleOpenAdd} style={{background: K_BRAND_COLOR}}>
                + 작업자 등록
            </button>
        </div>
      </div>

      <div className="worker-list-section">
        {loading ? (
            <div className="loading">데이터를 불러오는 중입니다...</div>
        ) : processedWorkers.length === 0 ? (
            <div className="no-data">검색된 작업자가 없습니다.</div>
        ) : (
            <div className="worker-table-wrapper">
                <table className="worker-table">
                    <thead>
                        <tr>
                            <th style={{width:'40px', textAlign:'center', paddingLeft:'10px'}}>
                                <input 
                                    type="checkbox" 
                                    checked={processedWorkers.length > 0 && selectedIds.size === processedWorkers.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('workerName')}>
                                이름 {getSortIcon('workerName')}
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('companyName')}>
                                소속(업체) {getSortIcon('companyName')}
                            </th>
                            <th className="sortable-th center-th" style={{width:'180px'}} onClick={() => handleSort('trade')}>
                                공종 {getSortIcon('trade')}
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('phoneNumber')}>
                                연락처 {getSortIcon('phoneNumber')}
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('residentNumber')}>
                                주민등록번호(생년월일) {getSortIcon('residentNumber')}
                            </th>
                            <th>계좌정보</th>
                            <th style={{width:'120px', textAlign:'center'}}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedWorkers.map(worker => (
                            <tr key={worker.id} className={selectedIds.has(worker.id) ? 'selected-row' : ''}>
                                <td style={{textAlign:'center', paddingLeft:'10px'}}>
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.has(worker.id)}
                                        onChange={() => handleSelectRow(worker.id)}
                                    />
                                </td>
                                <td style={{fontWeight:'bold', cursor:'pointer'}} onClick={() => handleOpenEdit(worker)}>{worker.workerName}</td>
                                <td>{worker.companyName || '-'}</td>
                                <td style={{textAlign:'center'}}>
                                    <span className="badge">{worker.trade}</span>
                                </td>
                                <td>{worker.phoneNumber || '-'}</td>
                                <td>
                                    {worker.residentNumber && worker.residentNumber.length >= 8 
                                        ? worker.residentNumber.substring(0,8)+'******' 
                                        : (worker.residentNumber || '-')}
                                </td>
                                <td style={{fontSize:'12px', color:'#666'}}>
                                    {worker.bankName} {worker.accountNumber}
                                </td>
                                <td style={{textAlign:'center'}}>
                                    <button className="btn-edit-mini" onClick={() => handleOpenEdit(worker)}>수정</button>
                                    <button className="btn-del-mini" onClick={() => handleDelete(worker.id)}>삭제</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {isModalOpen && currentUid && (
          <WorkerModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            partnerUid={currentUid}
            targetWorker={editTarget}
            tradeOptions={tradeOptions} 
            userName={currentUserInfo.name} 
          />
      )}

      {isTradeManagerOpen && currentUid && (
          <TradeManageModal 
            onClose={handleTradeManagerClose} 
            partnerUid={currentUid}
            onUpdate={() => fetchTrades(currentUid)} 
          />
      )}

      {isBulkEditOpen && (
          <BulkTradeEditModal
            isOpen={isBulkEditOpen}
            onClose={() => setIsBulkEditOpen(false)}
            selectedCount={selectedIds.size}
            tradeOptions={tradeOptions}
            onConfirm={handleBulkUpdate}
          />
      )}

      {isBulkTypeEditOpen && (
          <BulkTypeEditModal
            isOpen={isBulkTypeEditOpen}
            onClose={() => setIsBulkTypeEditOpen(false)}
            selectedCount={selectedIds.size}
            onConfirm={handleBulkTypeUpdate}
          />
      )}
    </div>
  );
};

export default WorkerManagementPage;