import React, { useEffect, useState, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, deleteDoc, addDoc, serverTimestamp, 
  query, orderBy, getDoc 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import './AccountingBankingExcelPage.css';
import { 
  Landmark, CreditCard, Upload, Download, Trash2, 
  ChevronDown, ChevronUp, FileSpreadsheet, Search 
} from 'lucide-react';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- [Interfaces] ---
export interface BankTransaction {
  id: string; fullDateTime: string; date: string; time: string; 
  inAmount: number; outAmount: number; balance: number; 
  memo: string; content: string; senderReceiver: string; source: 'bank';
}
export interface CardTransaction {
  id: string; fullDateTime: string; date: string; time: string;
  cardName: string; approvalNo: string; amount: number; 
  merchantName: string; installment: string; source: 'card';
}

const BANK_HEADERS = ["거래일시", "입금액", "출금액", "잔액", "출금계좌메모", "적요", "의뢰인/수취인"];
const CARD_HEADERS = ["승인일시", "카드명", "승인번호", "가맹점명", "승인금액", "할부개월"];

const AccountingBankingExcelPage: React.FC = () => {
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
  
  const [activeTab, setActiveTab] = useState<'bank' | 'card'>('bank');
  const [bankList, setBankList] = useState<BankTransaction[]>([]);
  const [cardList, setCardList] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 모바일 아코디언 상태
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });
                let targetUid = user.uid;
                if (d.role === 'sub_partner' && d.partnerInfo?.ownerUid) targetUid = d.partnerInfo.ownerUid;
                setCurrentUid(targetUid);
                fetchTransactions(targetUid);
            }
        } catch (e) { console.error("Error", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchTransactions = async (uid: string) => {
      setLoading(true);
      try {
          const bankQ = query(collection(db, 'users', uid, 'BANK_TRANSACTIONS'), orderBy('fullDateTime', 'desc'));
          const bankSnap = await getDocs(bankQ);
          setBankList(bankSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankTransaction)));

          const cardQ = query(collection(db, 'users', uid, 'CARD_TRANSACTIONS'), orderBy('fullDateTime', 'desc'));
          const cardSnap = await getDocs(cardQ);
          setCardList(cardSnap.docs.map(d => ({ id: d.id, ...d.data() } as CardTransaction)));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
  };

  const addLog = async (message: string) => {
      if (!currentUid) return;
      try { await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), { text: message, createdAt: serverTimestamp(), type: 'accounting_upload' }); } catch (e) {}
  };

  const parseExcelDate = (excelDate: any): { date: string, time: string, full: string } => {
      let dt = new Date();
      if (typeof excelDate === 'number') dt = new Date((excelDate - (25567 + 2)) * 86400 * 1000); 
      else if (typeof excelDate === 'string') dt = new Date(excelDate.replace(/\./g, '-').replace(/\//g, '-'));
      
      if (isNaN(dt.getTime())) return { date: '', time: '', full: '' };
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      const ss = String(dt.getSeconds()).padStart(2, '0');
      return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}:${ss}`, full: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}` };
  };

  const downloadTemplate = (type: 'bank' | 'card') => {
      const headers = type === 'bank' ? [BANK_HEADERS] : [CARD_HEADERS];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(headers);
      
      if (type === 'bank') {
          XLSX.utils.sheet_add_aoa(ws, [["2025-01-01 10:00:00", 100000, 0, 500000, "이자", "예금이자", "은행"], ["2025-01-02 14:30:00", 0, 50000, 450000, "출금", "자재비", "홍길동"]], { origin: "A2" });
      } else {
          XLSX.utils.sheet_add_aoa(ws, [["2025-01-01 12:00:00", "국민카드", "12345678", "식당A", 15000, "일시불"]], { origin: "A2" });
      }
      ws['!cols'] = headers[0].map(() => ({ wch: 15 }));
      XLSX.utils.book_append_sheet(wb, ws, "Template");
      const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' });
      saveAs(blob, type === 'bank' ? '은행거래내역_등록양식.xlsx' : '카드거래내역_등록양식.xlsx');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentUid) return;
      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const wb = XLSX.read(evt.target?.result, { type: 'binary' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(1) as any[];
          if (activeTab === 'bank') await processBankUpload(rows);
          else await processCardUpload(rows);
          setLoading(false);
          if(fileInputRef.current) fileInputRef.current.value = ''; 
      };
      reader.readAsBinaryString(file);
  };

  const processBankUpload = async (rows: any[]) => {
      if (!currentUid) return;
      let successCount = 0;
      const collectionRef = collection(db, 'users', currentUid, 'BANK_TRANSACTIONS');
      for (const row of rows) {
          if (!row[0]) continue; 
          const { date, time, full } = parseExcelDate(row[0]);
          if (!date) continue; 
          await addDoc(collectionRef, {
              fullDateTime: full, date, time, inAmount: Number(row[1]) || 0, outAmount: Number(row[2]) || 0,
              balance: Number(row[3]) || 0, memo: row[4] || '', content: row[5] || '',
              senderReceiver: row[6] || '', source: 'bank', createdAt: serverTimestamp()
          });
          successCount++;
      }
      alert(`총 ${rows.length}건 중 ${successCount}건이 등록되었습니다.`);
      if (successCount > 0) {
          await addLog(`[${currentUserInfo.name}]이 은행 거래내역을 ${successCount}건 등록 하였습니다.`);
          fetchTransactions(currentUid);
      }
  };

  const processCardUpload = async (rows: any[]) => {
      if (!currentUid) return;
      let successCount = 0;
      const collectionRef = collection(db, 'users', currentUid, 'CARD_TRANSACTIONS');
      for (const row of rows) {
          if (!row[0]) continue;
          const { date, time, full } = parseExcelDate(row[0]);
          if (!date) continue;
          await addDoc(collectionRef, {
              fullDateTime: full, date, time, cardName: row[1] || '', approvalNo: row[2] ? String(row[2]) : '',
              merchantName: row[3] || '', amount: Number(row[4]) || 0, installment: row[5] || '일시불',
              source: 'card', createdAt: serverTimestamp()
          });
          successCount++;
      }
      alert(`총 ${rows.length}건 중 ${successCount}건이 등록되었습니다.`);
      if (successCount > 0) {
          await addLog(`[${currentUserInfo.name}]이 카드 거래내역을 ${successCount}건 등록 하였습니다.`);
          fetchTransactions(currentUid);
      }
  };

  const handleDelete = async (id: string, type: 'bank' | 'card') => {
      if (!currentUid || !confirm("정말 삭제하시겠습니까? (복구 불가)")) return;
      try {
          await deleteDoc(doc(db, 'users', currentUid, type === 'bank' ? 'BANK_TRANSACTIONS' : 'CARD_TRANSACTIONS', id));
          if (type === 'bank') setBankList(prev => prev.filter(i => i.id !== id));
          else setCardList(prev => prev.filter(i => i.id !== id));
      } catch (e) { console.error(e); alert("오류 발생"); }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItemIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItemIds(newSet);
  };

  return (
    <div className="abe-container">
      {/* Header */}
      <div className="abe-header">
          <div className="abe-title-area">
              <h2>금융 거래내역 관리</h2>
              <p>은행 및 카드사 엑셀 데이터를 업로드하여 손쉽게 관리하세요.</p>
          </div>
      </div>

      {/* Control Panel (Tabs & Upload) */}
      <div className="abe-control-panel">
          <div className="abe-panel-row">
              <div className="abe-mode-group">
                  <button className={`abe-mode-btn ${activeTab === 'bank' ? 'active' : ''}`} onClick={() => setActiveTab('bank')}>
                      <Landmark size={14} style={{marginRight:6}} /> 은행 내역
                  </button>
                  <button className={`abe-mode-btn ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>
                      <CreditCard size={14} style={{marginRight:6}} /> 카드 내역
                  </button>
              </div>
              <div className="abe-actions-group">
                  <button className="abe-btn-outline" onClick={() => downloadTemplate(activeTab)}>
                       <FileSpreadsheet size={14} /> 양식 다운로드
                  </button>
                  <button className="abe-btn-primary" onClick={() => fileInputRef.current?.click()}>
                       <Upload size={14} /> {loading ? '업로드 중...' : '엑셀 업로드'}
                  </button>
                  <input type="file" accept=".xlsx, .xls" ref={fileInputRef} hidden onChange={handleFileUpload} />
              </div>
          </div>
          <div className="abe-panel-info">
             <Search size={14}/> {activeTab === 'bank' ? '입출금 내역을 관리합니다.' : '신용/체크카드 승인 내역을 관리합니다.'}
             <span style={{marginLeft: 'auto', fontSize: '12px', color: '#888'}}>
                총 {activeTab === 'bank' ? bankList.length : cardList.length}건
             </span>
          </div>
      </div>

      {/* Table Area (Desktop) */}
      <div className="abe-desktop-view">
          <div className="abe-table-container">
              <div className="abe-table-wrapper">
                  <table className="abe-table">
                      <thead>
                          {activeTab === 'bank' ? (
                              <tr>
                                  <th style={{width:'160px'}}>거래일시</th>
                                  <th>적요/내용</th>
                                  <th>의뢰인/수취인</th>
                                  <th className="abe-text-right">입금액</th>
                                  <th className="abe-text-right">출금액</th>
                                  <th className="abe-text-right">잔액</th>
                                  <th>메모</th>
                                  <th style={{width:'60px', textAlign:'center'}}>관리</th>
                              </tr>
                          ) : (
                              <tr>
                                  <th style={{width:'160px'}}>승인일시</th>
                                  <th>카드사</th>
                                  <th>가맹점</th>
                                  <th>승인번호</th>
                                  <th className="abe-text-center">할부</th>
                                  <th className="abe-text-right">승인금액</th>
                                  <th style={{width:'60px', textAlign:'center'}}>관리</th>
                              </tr>
                          )}
                      </thead>
                      <tbody>
                          {(activeTab === 'bank' ? bankList : cardList).length === 0 ? (
                              <tr><td colSpan={8} className="abe-no-data">데이터가 없습니다.</td></tr>
                          ) : (
                              activeTab === 'bank' ? (
                                  bankList.map((item) => (
                                      <tr key={item.id}>
                                          <td className="abe-text-sub">{item.fullDateTime}</td>
                                          <td className="abe-font-bold">{item.content}</td>
                                          <td>{item.senderReceiver}</td>
                                          <td className="abe-text-right text-blue">{item.inAmount > 0 ? item.inAmount.toLocaleString() : '-'}</td>
                                          <td className="abe-text-right text-red">{item.outAmount > 0 ? item.outAmount.toLocaleString() : '-'}</td>
                                          <td className="abe-text-right abe-font-bold">{item.balance.toLocaleString()}</td>
                                          <td className="abe-text-sub">{item.memo}</td>
                                          <td className="abe-text-center">
                                              <button className="abe-btn-icon-del" onClick={() => handleDelete(item.id, 'bank')}><Trash2 size={14} /></button>
                                          </td>
                                      </tr>
                                  ))
                              ) : (
                                  cardList.map((item) => (
                                      <tr key={item.id}>
                                          <td className="abe-text-sub">{item.fullDateTime}</td>
                                          <td>{item.cardName}</td>
                                          <td className="abe-font-bold">{item.merchantName}</td>
                                          <td>{item.approvalNo}</td>
                                          <td className="abe-text-center">{item.installment}</td>
                                          <td className="abe-text-right abe-font-bold">{item.amount.toLocaleString()}</td>
                                          <td className="abe-text-center">
                                              <button className="abe-btn-icon-del" onClick={() => handleDelete(item.id, 'card')}><Trash2 size={14} /></button>
                                          </td>
                                      </tr>
                                  ))
                              )
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>

      {/* Mobile View (Accordion) */}
      <div className="abe-mobile-view">
          <div className="abe-mobile-list">
            {(activeTab === 'bank' ? bankList : cardList).length === 0 ? (
                <div className="abe-no-data">데이터가 없습니다.</div>
            ) : (
                activeTab === 'bank' ? (
                    bankList.map(item => {
                        const isExpanded = expandedItemIds.has(item.id);
                        return (
                            <div key={item.id} className="abe-mobile-card">
                                <div className="abe-mobile-header" onClick={() => toggleExpand(item.id)}>
                                    <div className="abe-mobile-header-left">
                                        <span className="abe-mobile-date">{item.fullDateTime}</span>
                                        <span className="abe-mobile-title">{item.content}</span>
                                    </div>
                                    <div className="abe-mobile-header-right">
                                        <span className={`abe-mobile-amount ${item.inAmount > 0 ? 'text-blue' : 'text-red'}`}>
                                            {item.inAmount > 0 ? `+${item.inAmount.toLocaleString()}` : `-${item.outAmount.toLocaleString()}`}
                                        </span>
                                        <ChevronDown size={20} className={`abe-mobile-chevron ${isExpanded ? 'open' : ''}`} />
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="abe-mobile-expanded">
                                        <div className="abe-mobile-row">
                                            <span className="label">의뢰인/수취인</span>
                                            <span className="value">{item.senderReceiver || '-'}</span>
                                        </div>
                                        <div className="abe-mobile-row">
                                            <span className="label">잔액</span>
                                            <span className="value">{item.balance.toLocaleString()}</span>
                                        </div>
                                        <div className="abe-mobile-row">
                                            <span className="label">메모</span>
                                            <span className="value">{item.memo || '-'}</span>
                                        </div>
                                        <button className="abe-btn-full-del" onClick={() => handleDelete(item.id, 'bank')}>
                                            <Trash2 size={14}/> 내역 삭제
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })
                ) : (
                    cardList.map(item => {
                        const isExpanded = expandedItemIds.has(item.id);
                        return (
                             <div key={item.id} className="abe-mobile-card">
                                <div className="abe-mobile-header" onClick={() => toggleExpand(item.id)}>
                                    <div className="abe-mobile-header-left">
                                        <span className="abe-mobile-date">{item.fullDateTime}</span>
                                        <span className="abe-mobile-title">{item.merchantName}</span>
                                    </div>
                                    <div className="abe-mobile-header-right">
                                        <span className="abe-mobile-amount text-red">
                                            {item.amount.toLocaleString()}
                                        </span>
                                        <ChevronDown size={20} className={`abe-mobile-chevron ${isExpanded ? 'open' : ''}`} />
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="abe-mobile-expanded">
                                        <div className="abe-mobile-row">
                                            <span className="label">카드사</span>
                                            <span className="value">{item.cardName}</span>
                                        </div>
                                        <div className="abe-mobile-row">
                                            <span className="label">할부</span>
                                            <span className="value">{item.installment}</span>
                                        </div>
                                        <div className="abe-mobile-row">
                                            <span className="label">승인번호</span>
                                            <span className="value">{item.approvalNo}</span>
                                        </div>
                                        <button className="abe-btn-full-del" onClick={() => handleDelete(item.id, 'card')}>
                                            <Trash2 size={14}/> 내역 삭제
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })
                )
            )}
          </div>
      </div>
    </div>
  );
};

export default AccountingBankingExcelPage;