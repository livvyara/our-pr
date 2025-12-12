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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- [High-End Icons] ---
const Icons = {
  Bank: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="21" width="18" height="2"/><rect x="2" y="5" width="20" height="3"/><path d="M4 10l2-4 2 4 2-4 2 4 2-4 2 4 2-4 2 4"/><line x1="4" y1="21" x2="4" y2="10"/><line x1="20" y1="21" x2="20" y2="10"/></svg>,
  Card: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Upload: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Download: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
};

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
          alert("삭제되었습니다.");
          if (type === 'bank') setBankList(prev => prev.filter(i => i.id !== id));
          else setCardList(prev => prev.filter(i => i.id !== id));
      } catch (e) { console.error(e); alert("오류 발생"); }
  };

  return (
    <div className="bk-page">
      <div className="bk-container">
        
        {/* Header */}
        <div className="bk-header">
            <div className="bk-title-group">
                <h2>금융 거래내역 관리</h2>
                <p>은행 및 카드사 엑셀 데이터를 업로드하여 손쉽게 관리하세요.</p>
            </div>
            <div className="bk-controls">
                <div className="bk-tabs">
                    <button className={`bk-tab ${activeTab === 'bank' ? 'active' : ''}`} onClick={() => setActiveTab('bank')}>
                        <Icons.Bank /> 은행 내역
                    </button>
                    <button className={`bk-tab ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>
                        <Icons.Card /> 카드 내역
                    </button>
                </div>
            </div>
        </div>

        {/* Upload Card (Dropzone Style) */}
        <div className="bk-upload-card">
            <div className="bk-upload-info">
                <h4>엑셀 파일 업로드</h4>
                <p>다운로드 받은 엑셀 양식에 맞춰 데이터를 입력 후 업로드해주세요.</p>
                <button className="btn-text" onClick={() => downloadTemplate(activeTab)}>
                    <Icons.Download /> 양식 다운로드
                </button>
            </div>
            
            <div className="bk-dropzone" onClick={() => fileInputRef.current?.click()}>
                <input type="file" accept=".xlsx, .xls" ref={fileInputRef} hidden onChange={handleFileUpload} />
                <div className="dropzone-content">
                    <div className="icon-circle"><Icons.Upload /></div>
                    <span className="drop-title">{loading ? '업로드 처리 중...' : '파일 선택 또는 드래그'}</span>
                    <span className="drop-desc">.xlsx, .xls 파일만 가능합니다.</span>
                </div>
            </div>
        </div>

        {/* Data List */}
        <div className="bk-list-area">
            {activeTab === 'bank' ? (
                <div className="bk-table-wrapper">
                    <table className="bk-table">
                        <thead>
                            <tr>
                                <th>거래일시</th>
                                <th>적요/내용</th>
                                <th>의뢰인/수취인</th>
                                <th className="tar">입금액</th>
                                <th className="tar">출금액</th>
                                <th className="tar">잔액</th>
                                <th>메모</th>
                                <th className="tac">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bankList.length === 0 ? (
                                <tr><td colSpan={8} className="bk-empty">데이터가 없습니다.</td></tr>
                            ) : (
                                bankList.map((item) => (
                                    <tr key={item.id}>
                                        <td className="text-sub">{item.fullDateTime}</td>
                                        <td className="fw-bold">{item.content}</td>
                                        <td>{item.senderReceiver}</td>
                                        <td className="tar text-blue">{item.inAmount > 0 ? item.inAmount.toLocaleString() : '-'}</td>
                                        <td className="tar text-red">{item.outAmount > 0 ? item.outAmount.toLocaleString() : '-'}</td>
                                        <td className="tar fw-bold">{item.balance.toLocaleString()}</td>
                                        <td className="text-sub">{item.memo}</td>
                                        <td className="tac">
                                            <button className="btn-icon-del" onClick={() => handleDelete(item.id, 'bank')}><Icons.Trash /></button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    
                    {/* Mobile Card List (Bank) */}
                    <div className="bk-mobile-list">
                        {bankList.map((item) => (
                            <div key={item.id} className="bk-card">
                                <div className="card-top">
                                    <span className="card-date">{item.fullDateTime}</span>
                                    <button className="btn-icon-del" onClick={() => handleDelete(item.id, 'bank')}><Icons.Trash /></button>
                                </div>
                                <div className="card-main">
                                    <span className="card-title">{item.content}</span>
                                    <span className={`card-amount ${item.inAmount > 0 ? 'in' : 'out'}`}>
                                        {item.inAmount > 0 ? `+${item.inAmount.toLocaleString()}` : `-${item.outAmount.toLocaleString()}`}
                                    </span>
                                </div>
                                <div className="card-sub">
                                    <span>{item.senderReceiver}</span>
                                    <span>잔액: {item.balance.toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="bk-table-wrapper">
                    <table className="bk-table">
                        <thead>
                            <tr>
                                <th>승인일시</th>
                                <th>카드사</th>
                                <th>가맹점</th>
                                <th>승인번호</th>
                                <th className="tac">할부</th>
                                <th className="tar">승인금액</th>
                                <th className="tac">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cardList.length === 0 ? (
                                <tr><td colSpan={7} className="bk-empty">데이터가 없습니다.</td></tr>
                            ) : (
                                cardList.map((item) => (
                                    <tr key={item.id}>
                                        <td className="text-sub">{item.fullDateTime}</td>
                                        <td>{item.cardName}</td>
                                        <td className="fw-bold">{item.merchantName}</td>
                                        <td>{item.approvalNo}</td>
                                        <td className="tac">{item.installment}</td>
                                        <td className="tar fw-bold">{item.amount.toLocaleString()}</td>
                                        <td className="tac">
                                            <button className="btn-icon-del" onClick={() => handleDelete(item.id, 'card')}><Icons.Trash /></button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {/* Mobile Card List (Card) */}
                    <div className="bk-mobile-list">
                        {cardList.map((item) => (
                            <div key={item.id} className="bk-card">
                                <div className="card-top">
                                    <span className="card-date">{item.fullDateTime}</span>
                                    <button className="btn-icon-del" onClick={() => handleDelete(item.id, 'card')}><Icons.Trash /></button>
                                </div>
                                <div className="card-main">
                                    <span className="card-title">{item.merchantName}</span>
                                    <span className="card-amount out">{item.amount.toLocaleString()}</span>
                                </div>
                                <div className="card-sub">
                                    <span>{item.cardName} ({item.installment})</span>
                                    <span>승인: {item.approvalNo}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AccountingBankingExcelPage;