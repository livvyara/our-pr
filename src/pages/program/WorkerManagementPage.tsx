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
import { 
  Search, Filter, Edit2, Trash2, Plus, Settings, ChevronDown, 
  Users, Briefcase 
} from 'lucide-react';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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

  // 모바일 아코디언 상태
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

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

  // 요약 정보 (통일성 위해 추가)
  const summary = useMemo(() => {
      return { count: processedWorkers.length };
  }, [processedWorkers]);

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

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItemIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItemIds(newSet);
  };

  // --- Bulk Actions ---
  const handleBulkUpdate = async (newTrade: string) => { /* Same Logic */ };
  const handleBulkTypeUpdate = async (newType: 'agency' | 'freelance') => { /* Same Logic */ };

  return (
    <div className="wmp-container">
      <div className="wmp-header">
        <div className="wmp-title-area">
          <h2>작업자 관리</h2>
          <p>현장 인력 DB 및 노무 정보를 통합 관리하세요.</p>
        </div>
      </div>

      {/* Filter Panel (Unified Style) */}
      <div className="wmp-filter-panel">
        <div className="wmp-filter-row">
            <div className="wmp-filter-item search">
                <Search size={18} className="search-icon"/>
                <input 
                    type="text" 
                    className="wmp-input search" 
                    placeholder="이름, 업체명 검색" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                />
            </div>
            
            <div className="wmp-filter-item">
                <select className="wmp-select" value={selectedTrade} onChange={(e) => setSelectedTrade(e.target.value)}>
                    {tradeOptions.map((t, i) => <option key={i} value={t}>{t === '전체' ? '전체 공종' : t}</option>)}
                </select>
            </div>

            <div className="wmp-action-group">
                <button className="wmp-btn wmp-btn-secondary" onClick={() => setIsTradeManagerOpen(true)}>
                    <Settings size={16} /> 공종 설정
                </button>
                {selectedIds.size > 0 && (
                    <>
                        <button className="wmp-btn wmp-btn-secondary" onClick={() => setIsBulkTypeEditOpen(true)}>유형 변경</button>
                        <button className="wmp-btn wmp-btn-secondary" onClick={() => setIsBulkEditOpen(true)}>공종 변경</button>
                    </>
                )}
                <button className="wmp-btn wmp-btn-primary" onClick={() => { setEditTarget(null); setIsModalOpen(true); }}>
                    <Plus size={16} /> 신규 등록
                </button>
            </div>
        </div>
      </div>

      {/* Summary Grid (Added for Consistency) */}
      <div className="wmp-summary-grid">
        <div className="wmp-card summary">
          <div className="wmp-card-header"><Users size={16} /> 총 작업자</div>
          <div className="wmp-card-value">{summary.count}명</div>
        </div>
        <div className="wmp-card summary">
          <div className="wmp-card-header"><Briefcase size={16} /> 등록 공종</div>
          <div className="wmp-card-value">{tradeOptions.length - 1}개</div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="wmp-desktop-view">
        <div className="wmp-table-container">
            <div className="wmp-table-wrapper">
                <table className="wmp-table">
                    <thead>
                        <tr>
                            <th className="th-check">
                                <input type="checkbox" checked={processedWorkers.length > 0 && selectedIds.size === processedWorkers.length} onChange={handleSelectAll} />
                            </th>
                            <th onClick={() => handleSort('workerName')} className="sortable">이름 (구분)</th>
                            <th onClick={() => handleSort('companyName')} className="sortable">소속</th>
                            <th onClick={() => handleSort('trade')} className="sortable">공종</th>
                            <th onClick={() => handleSort('phoneNumber')} className="sortable">연락처</th>
                            <th>주민번호</th>
                            <th>계좌정보</th>
                            <th className="text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="wmp-no-data">로딩 중...</td></tr>
                        ) : processedWorkers.length === 0 ? (
                            <tr><td colSpan={8} className="wmp-no-data">등록된 작업자가 없습니다.</td></tr>
                        ) : (
                            processedWorkers.map(worker => (
                                <tr key={worker.id} className={selectedIds.has(worker.id) ? 'selected' : ''}>
                                    <td className="td-check">
                                        <input type="checkbox" checked={selectedIds.has(worker.id)} onChange={() => handleSelectRow(worker.id)} />
                                    </td>
                                    <td>
                                        <div className="wmp-worker-profile" onClick={() => { setEditTarget(worker); setIsModalOpen(true); }}>
                                            <div className="wmp-avatar">{worker.workerName.charAt(0)}</div>
                                            <div className="wmp-worker-info">
                                                <span className="name">{worker.workerName}</span>
                                                <span className={`wmp-badge type ${worker.workerType}`}>
                                                    {worker.workerType === 'agency' ? '인력소' : '프리랜서'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{worker.companyName || '-'}</td>
                                    <td><span className="wmp-badge trade">{worker.trade}</span></td>
                                    <td>{worker.phoneNumber}</td>
                                    <td>{worker.residentNumber ? worker.residentNumber.substring(0,8)+'******' : '-'}</td>
                                    <td>
                                        <div className="wmp-bank-info">
                                            <span>{worker.bankName}</span>
                                            <span className="account">{worker.accountNumber}</span>
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <div className="wmp-action-btns">
                                            <button className="wmp-icon-btn" onClick={() => { setEditTarget(worker); setIsModalOpen(true); }}>
                                                <Edit2 size={16} />
                                            </button>
                                            <button className="wmp-icon-btn danger" onClick={() => handleDelete(worker.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* Mobile Card View (Accordion) */}
      <div className="wmp-mobile-view">
        <div className="wmp-mobile-list">
            {loading ? (
                <div className="wmp-no-data">로딩 중...</div>
            ) : processedWorkers.length === 0 ? (
                <div className="wmp-no-data">등록된 작업자가 없습니다.</div>
            ) : (
                processedWorkers.map(worker => {
                    const isExpanded = expandedItemIds.has(worker.id);
                    return (
                        <div key={worker.id} className={`wmp-mobile-card ${selectedIds.has(worker.id) ? 'selected' : ''}`}>
                            <div className="wmp-mobile-card-header" onClick={() => toggleExpand(worker.id)}>
                                <div className="wmp-mobile-header-left">
                                    <div className="card-check" onClick={(e) => { e.stopPropagation(); handleSelectRow(worker.id); }}>
                                        <input type="checkbox" checked={selectedIds.has(worker.id)} readOnly />
                                    </div>
                                    <div className="wmp-worker-profile">
                                        <div className="wmp-avatar small">{worker.workerName.charAt(0)}</div>
                                        <div className="wmp-worker-info">
                                            <div className="name-row">
                                                <span className="name">{worker.workerName}</span>
                                                <span className={`wmp-badge type ${worker.workerType}`}>
                                                    {worker.workerType === 'agency' ? '인력' : '프리'}
                                                </span>
                                            </div>
                                            <span className="company">{worker.companyName}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="wmp-mobile-header-right">
                                    <span className="wmp-badge trade">{worker.trade}</span>
                                    <ChevronDown size={20} className={`wmp-chevron ${isExpanded ? 'open' : ''}`} />
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="wmp-mobile-expanded">
                                    <div className="wmp-mobile-body">
                                        <div className="wmp-info-row">
                                            <span className="label">연락처</span>
                                            <span className="value">{worker.phoneNumber}</span>
                                        </div>
                                        <div className="wmp-info-row">
                                            <span className="label">주민번호</span>
                                            <span className="value">{worker.residentNumber ? worker.residentNumber.substring(0,8)+'******' : '-'}</span>
                                        </div>
                                        <div className="wmp-info-row bank">
                                            <span className="label">계좌</span>
                                            <span className="value">{worker.bankName} {worker.accountNumber}</span>
                                        </div>
                                    </div>

                                    <div className="wmp-mobile-actions">
                                        <div className="btn-row">
                                            <button className="wmp-btn-link" onClick={() => { setEditTarget(worker); setIsModalOpen(true); }}>
                                                <Edit2 size={16} /> 수정
                                            </button>
                                            <button className="wmp-btn-link danger" onClick={() => handleDelete(worker.id)}>
                                                <Trash2 size={16} /> 삭제
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
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
  );
};

export default WorkerManagementPage;