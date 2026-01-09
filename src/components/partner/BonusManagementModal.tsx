import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import './BonusManagementModal.css';

// --- [Premium SVG Icons] ---
const Icons = {
  Gift: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,
  Edit: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Plus: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Search: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Calendar: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Check: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  Info: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
};

interface StaffData { uid: string; name: string; }
interface Props { partnerUid: string; staffList: StaffData[]; onClose: () => void; }
type PaymentMethod = 'salary_include' | 'separate_transfer' | 'cash';
interface BonusData { id: string; staffUid: string; staffName: string; amount: number; date: string; paymentMethod: PaymentMethod; description: string; createdAt: any; isPaid: boolean; } // isPaid 추가

const BonusManagementModal: React.FC<Props> = ({ partnerUid, staffList, onClose }) => {
  const db = getFirestore();
  
  // Form State
  const [targetStaffUid, setTargetStaffUid] = useState<string>('');
  const [amount, setAmount] = useState<number | string>(''); 
  const [bonusDate, setBonusDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('salary_include');
  const [description, setDescription] = useState<string>('');
  
  // Status State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); 

  // List & Search State
  const [bonusList, setBonusList] = useState<BonusData[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStartDate, setFilterStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0] 
  );
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetchBonuses(); }, [filterStartDate, filterEndDate]); 

  // --- [CRUD Logic] ---
  const fetchBonuses = async () => {
    try {
      const q = query(
        collection(db, 'users', partnerUid, 'bonuses'),
        where('date', '>=', filterStartDate),
        where('date', '<=', filterEndDate),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as BonusData[];
      setBonusList(list);
    } catch (e) { console.error("상여 내역 조회 실패", e); }
  };

  const handleSave = async () => {
    if (!targetStaffUid || !amount || Number(amount) <= 0) {
      alert("직원과 금액을 정확히 입력해주세요."); return;
    }
    if (!window.confirm(editingId ? "상여 내역을 수정하시겠습니까?" : "상여 내역을 등록하시겠습니까?")) return;

    setIsSubmitting(true);
    try {
      const selectedStaff = staffList.find(s => s.uid === targetStaffUid);
      const dataPayload = {
        staffUid: targetStaffUid,
        staffName: selectedStaff?.name || '알수없음',
        amount: Number(amount),
        date: bonusDate,
        paymentMethod: paymentMethod,
        description: description,
        isProcessed: paymentMethod === 'salary_include' ? false : true, 
        isPaid: editingId ? (bonusList.find(b => b.id === editingId)?.isPaid || false) : false, // 수정 시 기존 상태 유지, 신규 시 false
      };

      if (editingId) {
        await updateDoc(doc(db, 'users', partnerUid, 'bonuses', editingId), { ...dataPayload, updatedAt: Timestamp.now() });
        alert("수정되었습니다.");
      } else {
        await addDoc(collection(db, 'users', partnerUid, 'bonuses'), { ...dataPayload, createdAt: Timestamp.now(), });
        alert("등록되었습니다.");
      }
      resetForm();
      fetchBonuses();
    } catch (e) { console.error(e); alert("오류가 발생했습니다."); } finally { setIsSubmitting(false); }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (!window.confirm("정말 이 내역을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'users', partnerUid, 'bonuses', id));
      alert("삭제되었습니다.");
      if (editingId === id) resetForm(); 
      fetchBonuses();
    } catch (e) { console.error("삭제 실패", e); alert("삭제 중 오류가 발생했습니다."); }
  };

  const handleTogglePaid = async (id: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(currentStatus ? "지급 완료를 취소하시겠습니까?" : "지급 완료 상태로 변경하시겠습니까?")) return;
    try {
      await updateDoc(doc(db, 'users', partnerUid, 'bonuses', id), { isPaid: !currentStatus });
      if (editingId === id && !currentStatus) resetForm(); // 현재 수정 중인 건을 완료 처리하면 폼 초기화
      fetchBonuses();
    } catch (e) { console.error("업데이트 실패", e); }
  };

  const handleEditClick = (item: BonusData) => {
    if (item.isPaid) return; // 지급 완료 건은 수정 불가
    setEditingId(item.id);
    setTargetStaffUid(item.staffUid);
    setAmount(item.amount);
    setBonusDate(item.date);
    setPaymentMethod(item.paymentMethod);
    setDescription(item.description);
    const formEl = document.querySelector('.modal-body');
    if(formEl) formEl.scrollTop = 0;
  };

  const resetForm = () => {
    setEditingId(null);
    setTargetStaffUid('');
    setAmount('');
    setDescription('');
    setPaymentMethod('salary_include');
    setBonusDate(new Date().toISOString().split('T')[0]);
  };

  // --- [Filtering Logic] ---
  const filteredList = bonusList.filter(item => 
    item.staffName.includes(searchKeyword) || (item.description && item.description.includes(searchKeyword))
  );

  return (
    <div className="bm-overlay">
      <div className="bm-content">
        {/* Header */}
        <div className="bm-header">
          <div className="bm-title">
            <div className="icon-box"><Icons.Gift /></div>
            <h3>상여(인센티브) 관리</h3>
          </div>
          <button onClick={onClose} className="bm-close-btn">✕</button>
        </div>

        <div className="bm-body">
          
          {/* Left Column: Form */}
          <div className="bm-form-column">
            <div className={`bm-form-card ${editingId ? 'edit-mode' : ''}`}>
              <div className="form-header">
                <h4>{editingId ? <><Icons.Edit /> 내역 수정</> : <><Icons.Plus /> 새 상여 등록</>}</h4>
                {editingId && <button onClick={resetForm} className="btn-cancel">취소</button>}
              </div>

              <div className="bm-input-group">
                <label>대상 직원</label>
                <div className="input-wrapper">
                  <select value={targetStaffUid} onChange={(e) => setTargetStaffUid(e.target.value)}>
                    <option value="">직원을 선택하세요</option>
                    {staffList.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="bm-input-group">
                <label>상여 금액 (원)</label>
                <div className="input-wrapper">
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div className="bm-input-group">
                <label>지급 기준일</label>
                <div className="input-wrapper">
                  <input type="date" value={bonusDate} onChange={(e) => setBonusDate(e.target.value)} />
                </div>
              </div>

              <div className="bm-input-group">
                <label>지급 방식</label>
                <div className="bm-radio-group">
                  <label className={`bm-radio-card ${paymentMethod === 'salary_include' ? 'selected' : ''}`}>
                    <input type="radio" name="pm" value="salary_include" checked={paymentMethod === 'salary_include'} onChange={() => setPaymentMethod('salary_include')} />
                    <div className="radio-content">
                      <span className="radio-title">급여 포함(세전)</span>
                      {paymentMethod === 'salary_include' && <Icons.Check />}
                    </div>
                  </label>
                  <label className={`bm-radio-card ${paymentMethod === 'separate_transfer' ? 'selected' : ''}`}>
                    <input type="radio" name="pm" value="separate_transfer" checked={paymentMethod === 'separate_transfer'} onChange={() => setPaymentMethod('separate_transfer')} />
                    <div className="radio-content">
                      <span className="radio-title">별도 이체</span>
                      {paymentMethod === 'separate_transfer' && <Icons.Check />}
                    </div>
                  </label>
                  <label className={`bm-radio-card ${paymentMethod === 'cash' ? 'selected' : ''}`}>
                    <input type="radio" name="pm" value="cash" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
                    <div className="radio-content">
                      <span className="radio-title">현금</span>
                      {paymentMethod === 'cash' && <Icons.Check />}
                    </div>
                  </label>
                </div>
                {paymentMethod === 'salary_include' && (
                  <p className="bm-info-text"><Icons.Info /> 다음 급여 집행 시 내역에 자동 포함됩니다.</p>
                )}
              </div>

              <div className="bm-input-group">
                <label>메모</label>
                <div className="input-wrapper">
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="사유 입력 (예: 명절 상여)" />
                </div>
              </div>

              <button onClick={handleSave} disabled={isSubmitting} className={`bm-submit-btn ${editingId ? 'update' : ''}`}>
                {editingId ? '수정 내용 저장' : '상여 등록하기'}
              </button>
            </div>
          </div>

          {/* Right Column: List */}
          <div className="bm-list-column">
            <div className="bm-filter-bar">
                <div className="bm-date-range">
                    <div className="date-input-wrap">
                        <Icons.Calendar />
                        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                    </div>
                    <span className="separator">~</span>
                    <div className="date-input-wrap">
                        <Icons.Calendar />
                        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                    </div>
                </div>
                <div className="bm-search-input">
                    <Icons.Search />
                    <input type="text" placeholder="이름, 내용 검색" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} />
                </div>
            </div>

            <div className="bm-list-container">
                <div className="bm-list-header">
                    <span>일자 / 대상 / 상태</span>
                    <span>내용 / 금액 / 관리</span>
                </div>
                <div className="bm-list-content">
                    {filteredList.map((item) => (
                        <div 
                          key={item.id} 
                          className={`bm-list-item ${editingId === item.id ? 'active' : ''} ${item.isPaid ? 'is-paid' : ''}`} 
                          onClick={() => handleEditClick(item)}
                        >
                            <div className="item-left">
                                <span className="item-date">{item.date}</span>
                                <span className="item-name">{item.staffName}</span>
                                <span className={`item-badge ${item.paymentMethod}`}>
                                    {item.paymentMethod === 'salary_include' ? '급여포함' : 
                                     item.paymentMethod === 'separate_transfer' ? '별도이체' : '현금'}
                                </span>
                            </div>
                            <div className="item-right">
                                <span className="item-desc">{item.description || '-'}</span>
                                <span className="item-amount">{Number(item.amount).toLocaleString()}원</span>
                                <div className="item-action-group">
                                    <button 
                                      className={`item-paid-btn ${item.isPaid ? 'done' : ''}`} 
                                      onClick={(e) => handleTogglePaid(item.id, !!item.isPaid, e)}
                                      title={item.isPaid ? "지급 완료됨" : "지급 처리"}
                                    >
                                      {item.isPaid ? <><Icons.Check /> 지급완료</> : "지급하기"}
                                    </button>
                                    <button className="item-delete-btn" onClick={(e) => handleDelete(item.id, e)} title="삭제">
                                        <Icons.Trash />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredList.length === 0 && (
                        <div className="bm-empty-state">
                            <p>조회된 상여 내역이 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BonusManagementModal;