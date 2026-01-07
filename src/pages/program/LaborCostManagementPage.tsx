import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, deleteDoc, updateDoc, getDoc,
  query, where, orderBy, onSnapshot 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import LaborCostModal from '../../components/partner/LaborCostModal';
import './LaborCostManagementPage.css';
import { 
  Download, Plus, Trash2, Edit2, Filter, ChevronDown, ChevronUp, 
  Users, DollarSign, Calendar 
} from 'lucide-react';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const LaborCostManagementPage: React.FC = () => {
  const [laborList, setLaborList] = useState<any[]>([]);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
    
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7)); 
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid' | 'separate'>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 모바일 아코디언 상태
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

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
            }
        } catch (e) { console.error("Error", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (currentUid) {
          const unsubscribe = fetchLabors(currentUid, currentMonth);
          return () => unsubscribe && unsubscribe();
      }
  }, [currentUid, currentMonth]); 

  const fetchLabors = (uid: string, month: string) => {
    setLoading(true);
    const q = query(collection(db, 'users', uid, 'labor_costs'), where('paymentMonth', '==', month), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
        setLaborList(snap.docs.map(d => {
            const data = d.data();
            const status = data.paymentStatus || (data.isPaid ? 'paid' : 'unpaid');
            return { id: d.id, ...data, paymentStatus: status };
        }));
        setLoading(false);
    });
  };

  const filteredList = useMemo(() => {
      return laborList.filter((item) => {
          const status = item.paymentStatus;
          if (paymentFilter === 'all') return true;
          return status === paymentFilter;
      });
  }, [laborList, paymentFilter]);

  // 요약 정보 계산 (통일성을 위해 추가)
  const summary = useMemo(() => {
      const count = filteredList.length;
      const totalAmount = filteredList.reduce((acc, cur) => acc + (cur.finalAmount || 0), 0);
      return { count, totalAmount };
  }, [filteredList]);

  const handleDelete = async (id: string) => {
      if (!confirm("정말 삭제하시겠습니까? 복구할 수 없습니다.")) return;
      if (!currentUid) return;
      await deleteDoc(doc(db, 'users', currentUid, 'labor_costs', id));
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
      if (!currentUid) return;
      try {
          const isPaidBool = newStatus !== 'unpaid'; 
          await updateDoc(doc(db, 'users', currentUid, 'labor_costs', id), { 
              paymentStatus: newStatus,
              isPaid: isPaidBool 
          });
      } catch (e) { console.error(e); alert("오류가 발생했습니다."); }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItemIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItemIds(newSet);
  };

  const handleExcelDownload = async () => {
      const exportList = filteredList.filter(item => item.paymentStatus !== 'separate');

      if (exportList.length === 0) return alert("노무 신고 가능한 데이터가 없습니다. (별도지급 건 제외)");
      if (!currentUid) return;
      
      const workersSnap = await getDocs(collection(db, 'users', currentUid, 'workers'));
      const workerMap: {[key: string]: any} = {};
      workersSnap.forEach(doc => { workerMap[doc.id] = doc.data(); });

      const consolidatedMap: { [key: string]: any } = {};
      
      exportList.forEach(item => {
          const wId = item.workerId;
          if (consolidatedMap[wId]) {
              consolidatedMap[wId].preTaxAmount += (item.preTaxAmount || 0);
              const days = new Set([...consolidatedMap[wId].workedDays, ...(item.workedDays || [])]);
              consolidatedMap[wId].workedDays = Array.from(days).sort();
          } else {
              consolidatedMap[wId] = { ...item };
          }
      });

      const excelRows: any[] = [];
      const dayHeaders = Array.from({length: 31}, (_, i) => `${i + 1}일`);
      
      const headers = [
        '보험구분', '이름', '주민등록번호', '국적코드', '체류자격코드', 
        '전화(지역)', '전화(국번)', '전화(뒷번호)', '직종코드', 
        ...dayHeaders, 
        '근로일수', '일평균근로시간', '보수지급기초일수', '보수총액', '임금총액', 
        '이직사유코드', '보험료부과구분부호', '보험료부과구분사유', '국세청신고여부', '지급월', 
        '소득세', '지방소득세', '고용보험료', '3.3%공제', 
        '인력소지급액', '프리랜서지급액', '은행명', '계좌번호'
      ];
      excelRows.push(headers);
      
      Object.values(consolidatedMap).forEach((d: any) => {
          const wData = workerMap[d.workerId] || {};
          const residentNumber = wData.rrn || wData.residentNumber || d.rrn || '';

          const dayCells = Array(31).fill('');
          let totalDays = 0;
          if (Array.isArray(d.workedDays)) {
              totalDays = d.workedDays.length;
              d.workedDays.forEach((dayVal: any) => {
                  let dayNum = -1;
                  if (typeof dayVal === 'string' && dayVal.includes('-')) {
                      dayNum = parseInt(dayVal.split('-')[2], 10);
                  } else {
                      dayNum = Number(dayVal);
                  }
                  if (dayNum >= 1 && dayNum <= 31) {
                      dayCells[dayNum - 1] = '1';
                  }
              });
          }

          let incomeTax = 0;
          let localTax = 0;
          let empInsurance = 0;
          let freelancerTax = 0;
          let finalAgency = 0;
          let finalFreelancer = 0;

          if (d.workerType === 'agency') {
              const dailyWage = totalDays > 0 ? Math.floor(d.preTaxAmount / totalDays) : 0;
              const taxableDaily = Math.max(0, dailyWage - 150000);
              let dailyTax = Math.floor(taxableDaily * 0.027);
              if (dailyTax < 1000) dailyTax = 0;

              incomeTax = dailyTax * totalDays; 
              localTax = Math.floor(incomeTax * 0.1);
              empInsurance = Math.floor(d.preTaxAmount * 0.009);
              finalAgency = d.preTaxAmount - incomeTax - localTax - empInsurance;
          } else {
              freelancerTax = Math.floor(d.preTaxAmount * 0.033);
              finalFreelancer = d.preTaxAmount - freelancerTax;
              
              const dailyWage = totalDays > 0 ? Math.floor(d.preTaxAmount / totalDays) : 0;
              const taxableDaily = Math.max(0, dailyWage - 150000);
              let dailyTax = Math.floor(taxableDaily * 0.027);
              if (dailyTax < 1000) dailyTax = 0;
              incomeTax = dailyTax * totalDays;
              localTax = Math.floor(incomeTax * 0.1);
              empInsurance = Math.floor(d.preTaxAmount * 0.009);
          }

          const payMonthStr = currentMonth.replace('-', '');

          excelRows.push([
              '3', d.workerName, residentNumber, '', '', '', '', '', '706', 
              ...dayCells, 
              totalDays, '8', totalDays, d.preTaxAmount, d.preTaxAmount, 
              '1', '', '', 'Y', payMonthStr, 
              incomeTax > 0 ? incomeTax : '',
              localTax > 0 ? localTax : '',
              empInsurance > 0 ? empInsurance : '',
              d.workerType !== 'agency' ? freelancerTax : '',
              d.workerType === 'agency' ? finalAgency : '',
              d.workerType !== 'agency' ? finalFreelancer : '',
              d.bankName, d.accountNumber
          ]);
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelRows);
      
      ws['!cols'] = [
          {wch: 5}, {wch: 10}, {wch: 15}, {wch: 5}, {wch: 5}, 
          {wch: 5}, {wch: 5}, {wch: 5}, {wch: 8}, 
          ...Array(31).fill({wch: 3}), 
          {wch: 8}, {wch: 8}, {wch: 8}, {wch: 12}, {wch: 12}, 
          {wch: 5}, {wch: 5}, {wch: 5}, {wch: 5}, {wch: 10}, 
          {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, 
          {wch: 12}, {wch: 12}, {wch: 10}, {wch: 15}
      ];

      XLSX.utils.book_append_sheet(wb, ws, "노무비신고");
      const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' });
      saveAs(blob, `${currentMonth}_노무비신고용.xlsx`);
  };

  return (
    <div className="lcm-container">
      <div className="lcm-header">
        <div className="lcm-title-area">
          <h2>노무 관리</h2>
          <p>현장별 인건비 지급 현황을 한눈에 관리하고 엑셀로 다운로드하세요.</p>
        </div>
      </div>

      {/* Filter Panel (Unified Style) */}
      <div className="lcm-filter-panel">
        <div className="lcm-filter-row">
            <div className="lcm-filter-item">
                <input 
                    type="month" 
                    className="lcm-input" 
                    value={currentMonth} 
                    onChange={e => setCurrentMonth(e.target.value)} 
                />
            </div>
            
            <div className="lcm-filter-item">
                <select className="lcm-select" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)}>
                    <option value="all">전체 내역</option>
                    <option value="unpaid">미지급 건</option>
                    <option value="paid">지급완료 건</option>
                    <option value="separate">별도지급 건</option>
                </select>
            </div>

            <button className="lcm-btn lcm-btn-secondary" onClick={handleExcelDownload} style={{marginLeft: 'auto'}}>
                <Download size={16} /> 엑셀 다운로드
            </button>
            <button className="lcm-btn lcm-btn-primary" onClick={() => { setEditTarget(null); setIsModalOpen(true); }}>
                <Plus size={16} /> 노무 등록
            </button>
        </div>
      </div>

      {/* Summary Grid (Added for Consistency) */}
      <div className="lcm-summary-grid">
        <div className="lcm-card summary">
          <div className="lcm-card-header"><Users size={16} /> 총 인원</div>
          <div className="lcm-card-value">{summary.count}명</div>
        </div>
        <div className="lcm-card summary">
          <div className="lcm-card-header"><DollarSign size={16} /> 총 지급액</div>
          <div className="lcm-card-value">{summary.totalAmount.toLocaleString()}원</div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="lcm-desktop-view">
        <div className="lcm-table-container">
            <div className="lcm-table-wrapper">
                <table className="lcm-table">
                    <thead>
                        <tr>
                            <th className="col-name">성명 (구분)</th>
                            <th className="col-site">현장명</th>
                            <th className="col-days text-center">근무일수</th>
                            <th className="col-money text-right">세전금액</th>
                            <th className="col-money text-right">공제액</th>
                            <th className="col-money text-right">실지급액</th>
                            <th className="col-bank">계좌정보</th>
                            <th className="col-status text-center">상태</th>
                            <th className="col-action text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="lcm-no-data">로딩 중...</td></tr>
                        ) : filteredList.length === 0 ? (
                            <tr><td colSpan={9} className="lcm-no-data">조회된 내역이 없습니다.</td></tr>
                        ) : (
                            filteredList.map(item => (
                                <tr key={item.id} className={item.paymentStatus === 'paid' ? 'row-dimmed' : ''}>
                                    <td>
                                        <div className="lcm-worker-profile">
                                            <div className="lcm-avatar">{item.workerName.charAt(0)}</div>
                                            <div className="lcm-worker-info">
                                                <span className="name">{item.workerName}</span>
                                                <span className={`lcm-badge type ${item.workerType}`}>
                                                    {item.workerType === 'agency' ? '인력소' : '프리랜서'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{item.siteName}</td>
                                    <td className="text-center">{item.totalDays}일</td>
                                    <td className="text-right text-secondary">{item.preTaxAmount.toLocaleString()}</td>
                                    <td className="text-right text-danger">-{item.deductionAmount.toLocaleString()}</td>
                                    <td className="text-right font-bold text-primary">{item.finalAmount.toLocaleString()}</td>
                                    <td>
                                        <div className="lcm-bank-info">
                                            <span>{item.bankName}</span>
                                            <span className="account">{item.accountNumber}</span>
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <select 
                                            className={`lcm-status-select ${item.paymentStatus}`}
                                            value={item.paymentStatus}
                                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                        >
                                            <option value="unpaid">미지급</option>
                                            <option value="paid">완료</option>
                                            <option value="separate">별도</option>
                                        </select>
                                        {item.paymentCycle && <div className="lcm-pay-date">{item.paymentCycle.join(', ')}</div>}
                                    </td>
                                    <td className="text-center">
                                        <div className="lcm-action-btns">
                                            <button className="lcm-icon-btn" onClick={() => { setEditTarget(item); setIsModalOpen(true); }}>
                                                <Edit2 size={16} />
                                            </button>
                                            <button className="lcm-icon-btn danger" onClick={() => handleDelete(item.id)}>
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
      <div className="lcm-mobile-view">
        <div className="lcm-mobile-list">
            {loading ? (
                <div className="lcm-no-data">로딩 중...</div>
            ) : filteredList.length === 0 ? (
                <div className="lcm-no-data">조회된 내역이 없습니다.</div>
            ) : (
                filteredList.map(item => {
                    const isExpanded = expandedItemIds.has(item.id);
                    return (
                        <div key={item.id} className="lcm-mobile-card">
                            <div className="lcm-mobile-card-header" onClick={() => toggleExpand(item.id)}>
                                <div className="lcm-mobile-header-left">
                                    <div className="lcm-worker-profile">
                                        <div className="lcm-avatar small">{item.workerName.charAt(0)}</div>
                                        <div className="lcm-worker-info">
                                            <div className="name-row">
                                                <span className="name">{item.workerName}</span>
                                                <span className={`lcm-badge type ${item.workerType}`}>
                                                    {item.workerType === 'agency' ? '인력' : '프리'}
                                                </span>
                                            </div>
                                            <span className="site">{item.siteName}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="lcm-mobile-header-right">
                                    <span className={`lcm-badge status ${item.paymentStatus}`}>
                                        {item.paymentStatus === 'unpaid' ? '미지급' : item.paymentStatus === 'paid' ? '완료' : '별도'}
                                    </span>
                                    <ChevronDown size={20} className={`lcm-chevron ${isExpanded ? 'open' : ''}`} />
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="lcm-mobile-expanded">
                                    <div className="lcm-mobile-body">
                                        <div className="lcm-info-row">
                                            <span className="label">근무일수</span>
                                            <span className="value">{item.totalDays}일</span>
                                        </div>
                                        <div className="lcm-info-row">
                                            <span className="label">세전금액</span>
                                            <span className="value">{item.preTaxAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="lcm-info-row">
                                            <span className="label text-danger">공제액</span>
                                            <span className="value text-danger">-{item.deductionAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="lcm-info-row total">
                                            <span className="label">실지급액</span>
                                            <span className="value text-primary">{item.finalAmount.toLocaleString()}원</span>
                                        </div>
                                        <div className="lcm-info-row bank">
                                            <span className="label">계좌</span>
                                            <span className="value">{item.bankName} {item.accountNumber}</span>
                                        </div>
                                    </div>

                                    <div className="lcm-mobile-actions">
                                        <select 
                                            className="lcm-mobile-select"
                                            value={item.paymentStatus}
                                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                        >
                                            <option value="unpaid">미지급</option>
                                            <option value="paid">지급완료</option>
                                            <option value="separate">별도지급</option>
                                        </select>
                                        <div className="btn-row">
                                            <button className="lcm-btn-link" onClick={() => { setEditTarget(item); setIsModalOpen(true); }}>
                                                <Edit2 size={16} /> 수정
                                            </button>
                                            <button className="lcm-btn-link danger" onClick={() => handleDelete(item.id)}>
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

      {isModalOpen && currentUid && (
          <LaborCostModal 
              isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
              partnerUid={currentUid} targetLabor={editTarget} currentMonth={currentMonth}
              onRefresh={() => {}} userName={currentUserInfo.name} 
          />
      )}
    </div>
  );
};

export default LaborCostManagementPage;