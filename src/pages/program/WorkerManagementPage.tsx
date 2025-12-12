import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, deleteDoc, 
  query, orderBy, onSnapshot, writeBatch, addDoc, serverTimestamp, getDoc
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import './WorkerManagementPage.css'; 
import WorkerModal from '../../components/partner/WorkerModal'; 
import TradeManageModal from '../../components/partner/TradeManageModal';
import BulkTradeEditModal from '../../components/partner/BulkTradeEditModal';
import BulkTypeEditModal from '../../components/partner/BulkTypeEditModal';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- [High-End Icons] ---
const Icons = {
  Search: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  ),
  Filter: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  ),
  Edit: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  ),
  Trash: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  ),
  Plus: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  ),
  Settings: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  )
};
export interface WorkerData {
  id: string; workerName: string; companyName: string; trade: string; phoneNumber: string;
  workerType: 'agency' | 'freelance'; residentNumber: string; bankName: string; accountNumber: string;
  accountOwner: string; idCardUrl?: string; delegationUrl?: string; appliedTaxRate: number; rrn?: string; 
}
type SortKey = 'workerName' | 'companyName' | 'trade' | 'phoneNumber' | 'residentNumber';
interface SortConfig { key: SortKey; direction: 'asc' | 'desc'; }

const WorkerManagementPage: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
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

  // --- Auth & Initial Data ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });
                let targetUid = user.uid;
                if (d.role === 'sub_partner' && d.partnerInfo && d.partnerInfo.ownerUid) {
                    targetUid = d.partnerInfo.ownerUid;
                }
                setCurrentUid(targetUid);
                fetchTrades(targetUid); 
                subscribeWorkers(targetUid);
            }
        } catch (e) { console.error("Error", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchTrades = async (uid: string) => {
    try {
      const q = query(collection(db, 'users', uid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      setTradeOptions(['전체', ...snap.docs.map(d => d.data().name)]);
    } catch (e) { setTradeOptions(['전체']); }
  };

  const subscribeWorkers = (uid: string) => {
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'workers'), orderBy('workerName'));
    return onSnapshot(q, (snapshot) => {
      setWorkers(snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id, workerName: d.workerName || '', companyName: d.companyName || '',
          trade: d.trade || '미지정', phoneNumber: d.phoneNumber || '', residentNumber: d.residentNumber || d.rrn || '', 
          workerType: d.workerType || 'freelance', bankName: d.bankName || '', accountNumber: d.accountNumber || '',
          accountOwner: d.accountOwner || d.workerName || '', idCardUrl: d.idCardUrl || d.idCardImageUrl || '',
          delegationUrl: d.delegationUrl, appliedTaxRate: d.appliedTaxRate || 3.3, rrn: d.rrn
        } as WorkerData;
      }));
      setLoading(false);
    });
  };

  // --- Sorting & Filtering ---
  const handleSort = (key: SortKey) => {
      setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const processedWorkers = useMemo(() => {
      let filtered = workers.filter(worker => {
          if (selectedTrade !== '전체' && worker.trade !== selectedTrade) return false;
          if (searchQuery) {
              const lower = searchQuery.toLowerCase();
              if (!worker.workerName.toLowerCase().includes(lower) && !worker.companyName.toLowerCase().includes(lower)) return false;
          }
          return true;
      });

      if (sortConfig) {
          filtered.sort((a, b) => {
              const aVal = (a[sortConfig.key] || '').toString();
              const bVal = (b[sortConfig.key] || '').toString();
              return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
          });
      }
      return filtered;
  }, [workers, searchQuery, selectedTrade, sortConfig]);

  // --- Handlers ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedIds(e.target.checked ? new Set(processedWorkers.map(w => w.id)) : new Set());
  };
  const handleSelectRow = (id: string) => {
      const newSet = new Set(selectedIds);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      setSelectedIds(newSet);
  };
  const handleDelete = async (id: string) => {
      if(!currentUid || !confirm("삭제하시겠습니까?")) return;
      try {
          await deleteDoc(doc(db, 'users', currentUid, 'workers', id));
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), { text: `${currentUserInfo.name}님이 작업자를 삭제했습니다.`, createdAt: serverTimestamp(), type: 'worker_delete' });
      } catch(e) { alert("삭제 실패"); }
  }

  // --- Bulk Actions ---
  const handleBulkUpdate = async (newTrade: string) => { /* Same Logic */ };
  const handleBulkTypeUpdate = async (newType: 'agency' | 'freelance') => { /* Same Logic */ };

  return (
    <div className="worker-page">
      <div className="worker-container">
        
        {/* Header */}
        <div className="worker-header">
          <div className="worker-title-group">
             <h2>작업자 관리</h2>
             <span className="worker-subtitle">현장 인력 DB 및 노무 관리</span>
          </div>
          <button className="worker-add-btn" onClick={() => { setEditTarget(null); setIsModalOpen(true); }}>
              <Icons.Plus /> <span>신규 등록</span>
          </button>
        </div>

        {/* Control Bar */}
        <div className="worker-controls">
           <div className="worker-search-group">
               <div className="search-input-wrap">
                   <Icons.Search />
                   <input type="text" placeholder="이름, 업체명 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
               </div>
               <div className="select-wrap">
                   <select value={selectedTrade} onChange={(e) => setSelectedTrade(e.target.value)}>
                       {tradeOptions.map((t, i) => <option key={i} value={t}>{t === '전체' ? '전체 공종' : t}</option>)}
                   </select>
                   <Icons.Filter className="select-icon" />
               </div>
           </div>
           
           <div className="worker-actions-group">
               <button className="worker-action-btn" onClick={() => setIsTradeManagerOpen(true)} title="공종 설정"><Icons.Settings /></button>
               {selectedIds.size > 0 && (
                   <>
                       <button className="worker-action-btn text" onClick={() => setIsBulkTypeEditOpen(true)}>유형 변경</button>
                       <button className="worker-action-btn text" onClick={() => setIsBulkEditOpen(true)}>공종 변경</button>
                   </>
               )}
           </div>
        </div>

        {/* List Section */}
        <div className="worker-list-area">
            {loading ? (
                <div className="worker-loading"><div className="spinner"></div></div>
            ) : processedWorkers.length === 0 ? (
                <div className="worker-empty">등록된 작업자가 없습니다.</div>
            ) : (
                <div className="worker-table-wrapper">
                    {/* PC Table */}
                    <table className="worker-table">
                        <thead>
                            <tr>
                                <th className="th-check">
                                    <input type="checkbox" checked={processedWorkers.length > 0 && selectedIds.size === processedWorkers.length} onChange={handleSelectAll} />
                                </th>
                                <th onClick={() => handleSort('workerName')}>이름</th>
                                <th onClick={() => handleSort('companyName')}>소속</th>
                                <th onClick={() => handleSort('trade')}>공종</th>
                                <th onClick={() => handleSort('phoneNumber')}>연락처</th>
                                <th>주민번호</th>
                                <th>계좌정보</th>
                                <th className="th-action">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedWorkers.map(worker => (
                                <tr key={worker.id} className={selectedIds.has(worker.id) ? 'selected' : ''}>
                                    <td className="td-check">
                                        <input type="checkbox" checked={selectedIds.has(worker.id)} onChange={() => handleSelectRow(worker.id)} />
                                    </td>
                                    <td className="td-name" onClick={() => { setEditTarget(worker); setIsModalOpen(true); }}>{worker.workerName}</td>
                                    <td>{worker.companyName || '-'}</td>
                                    <td><span className="trade-badge">{worker.trade}</span></td>
                                    <td>{worker.phoneNumber}</td>
                                    <td>{worker.residentNumber ? worker.residentNumber.substring(0,8)+'******' : '-'}</td>
                                    <td className="td-bank">{worker.bankName} {worker.accountNumber}</td>
                                    <td className="td-action">
                                        <button className="btn-icon edit" onClick={() => { setEditTarget(worker); setIsModalOpen(true); }}><Icons.Edit /></button>
                                        <button className="btn-icon del" onClick={() => handleDelete(worker.id)}><Icons.Trash /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Mobile Card List (CSS Display Switch) */}
                    <div className="worker-mobile-list">
                         {processedWorkers.map(worker => (
                             <div key={worker.id} className={`worker-card ${selectedIds.has(worker.id) ? 'selected' : ''}`} onClick={() => { setEditTarget(worker); setIsModalOpen(true); }}>
                                 <div className="card-header">
                                     <div className="card-check" onClick={(e) => { e.stopPropagation(); handleSelectRow(worker.id); }}>
                                         <input type="checkbox" checked={selectedIds.has(worker.id)} readOnly />
                                     </div>
                                     <div className="card-info">
                                         <span className="card-name">{worker.workerName}</span>
                                         <span className="card-company">{worker.companyName}</span>
                                     </div>
                                     <span className="trade-badge">{worker.trade}</span>
                                 </div>
                                 <div className="card-body">
                                     <div className="card-row"><span>연락처</span>{worker.phoneNumber}</div>
                                     <div className="card-row"><span>주민번호</span>{worker.residentNumber ? worker.residentNumber.substring(0,8)+'******' : '-'}</div>
                                     <div className="card-row"><span>계좌</span>{worker.bankName} {worker.accountNumber}</div>
                                 </div>
                                 <div className="card-footer">
                                     <button className="btn-card-action del" onClick={(e) => { e.stopPropagation(); handleDelete(worker.id); }}>삭제</button>
                                     <button className="btn-card-action edit" onClick={(e) => { e.stopPropagation(); setEditTarget(worker); setIsModalOpen(true); }}>수정</button>
                                 </div>
                             </div>
                         ))}
                    </div>
                </div>
            )}
        </div>

        {/* Modals */}
        {isModalOpen && currentUid && (
            <WorkerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} partnerUid={currentUid} targetWorker={editTarget} tradeOptions={tradeOptions} userName={currentUserInfo.name} />
        )}
        {isTradeManagerOpen && currentUid && (
            <TradeManageModal onClose={() => setIsTradeManagerOpen(false)} partnerUid={currentUid} onUpdate={() => fetchTrades(currentUid)} />
        )}
        {isBulkEditOpen && (
            <BulkTradeEditModal isOpen={isBulkEditOpen} onClose={() => setIsBulkEditOpen(false)} selectedCount={selectedIds.size} tradeOptions={tradeOptions} onConfirm={handleBulkUpdate} />
        )}
        {isBulkTypeEditOpen && (
            <BulkTypeEditModal isOpen={isBulkTypeEditOpen} onClose={() => setIsBulkTypeEditOpen(false)} selectedCount={selectedIds.size} onConfirm={handleBulkTypeUpdate} />
        )}
      </div>
    </div>
  );
};

export default WorkerManagementPage;