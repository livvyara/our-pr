import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, updateDoc, getDoc, deleteDoc,
  query, orderBy, serverTimestamp, addDoc
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import './AccountingOrderRequestPage.css'; 
import OrderPermissionModal from '../../components/partner/OrderPermissionModal';
import InvoiceSelectModal from '../../components/partner/InvoiceSelectModal';
import { X } from 'lucide-react'; // 팝업 닫기 아이콘용 (없으면 텍스트 X로 대체 가능)

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- [추가] 팝업용 인터페이스 (통합 관리 페이지와 동일 구조) ---
interface UnifiedItem {
    id: string;
    source: 'tax_invoice' | 'cash_receipt';
    inOut: '매출' | '매입';
    originalData: any;
    // 팝업 표시에 필수적인 필드만 포함하거나 전체 포함 가능
}

interface OrderRequest {
  id: string;
  siteId: string;
  siteName: string;
  requesterName: string;
  type: 'tax_invoice' | 'online';
  status: 'pending' | 'pending_payment' | 'approved' | 'rejected';
  category1: string;
  category2: string;
  createdAt: any;
  amount?: number;
  linkedInvoiceId?: string;
  rejectReason?: string;
  vendorName?: string;
  itemDetails?: string;
  bankName?: string;
  accountNumber?: string;
  accountOwner?: string;
  quantity?: number;
  memo?: string;
  link?: string;
}

const AccountingOrderRequestPage: React.FC = () => {
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [myUid, setMyUid] = useState('');
  const [myName, setMyName] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [authorizedUids, setAuthorizedUids] = useState<string[]>([]);
  
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [linkTargetRequest, setLinkTargetRequest] = useState<OrderRequest | null>(null);

  // --- [추가] 세금계산서 상세 팝업용 State ---
  const [selectedInvoiceItem, setSelectedInvoiceItem] = useState<UnifiedItem | null>(null);

  const canManage = useMemo(() => isOwner || authorizedUids.includes(myUid), [isOwner, authorizedUids, myUid]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setMyUid(user.uid);
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                let targetUid = user.uid;
                let isUserOwner = true;
                setMyName(d.nickname || d.name || '사용자');

                if (d.role === 'sub_partner' && d.partnerInfo?.ownerUid) {
                    targetUid = d.partnerInfo.ownerUid;
                    isUserOwner = false;
                }
                setCurrentUid(targetUid);
                setIsOwner(isUserOwner);
                fetchPermissions(targetUid);
                fetchRequests(targetUid);
            }
        } catch (e) { console.error(e); }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchPermissions = async (uid: string) => {
      try {
          const docSnap = await getDoc(doc(db, 'users', uid, 'settings', 'order_permissions'));
          if (docSnap.exists()) {
              setAuthorizedUids(docSnap.data().uids || []);
          } else {
              setAuthorizedUids([]);
          }
      } catch (e) { console.error(e); }
  };

  const fetchRequests = async (uid: string) => {
      setLoading(true);
      try {
          const q = query(collection(db, 'users', uid, 'ORDER_REQUESTS'), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as OrderRequest)));
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // --- [추가] 세금계산서 정보 조회 및 팝업 열기 ---
  const fetchAndShowInvoice = async (invoiceId: string) => {
      if (!currentUid || !invoiceId) return;
      try {
          // 발주 요청은 주로 '매입'이므로 TAX_PURCHASE에서 조회
          const docRef = doc(db, 'users', currentUid, 'TAX_PURCHASE', invoiceId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
              const data = docSnap.data();
              const item: UnifiedItem = {
                  id: docSnap.id,
                  source: 'tax_invoice',
                  inOut: '매입', // 발주 요청 건이므로 매입으로 고정
                  originalData: data
              };
              setSelectedInvoiceItem(item);
          } else {
              alert("연결된 세금계산서 정보를 찾을 수 없습니다.");
          }
      } catch (e) {
          console.error(e);
          alert("세금계산서 정보를 불러오는 중 오류가 발생했습니다.");
      }
  };

  const handleReject = async (req: OrderRequest) => {
      if (!canManage) return alert("권한이 없습니다.");
      const reason = prompt("부결 사유를 입력해주세요 (필수):");
      if (!reason) return;
      try {
          if (req.linkedInvoiceId) {
              const invoiceRef = doc(db, 'users', currentUid!, 'TAX_PURCHASE', req.linkedInvoiceId);
              await updateDoc(invoiceRef, {
                  siteId: null,
                  category1: null,
                  category2: null
              });
          }

          await updateDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id), {
              status: 'rejected', 
              rejectReason: reason,
              linkedInvoiceId: null 
          });
          alert("부결 처리되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { alert("오류 발생"); }
  };

  const handleReset = async (req: OrderRequest) => {
      if (!isOwner) return alert("대표자만 상태를 초기화할 수 있습니다.");
      if (!confirm("상태를 '승인대기'로 초기화하시겠습니까?")) return;
      try {
          if (req.linkedInvoiceId) {
              const invoiceRef = doc(db, 'users', currentUid!, 'TAX_PURCHASE', req.linkedInvoiceId);
              await updateDoc(invoiceRef, {
                  siteId: null,
                  category1: null,
                  category2: null
              });
          }

          await updateDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id), {
              status: 'pending', 
              rejectReason: null,
              linkedInvoiceId: null 
          });
          alert("초기화되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { alert("오류 발생"); }
  };

  const handleDelete = async (req: OrderRequest) => {
      if (!canManage) return alert("권한이 없습니다.");
      if (!confirm("삭제하시겠습니까?")) return;
      try {
          await deleteDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id));
          await addDoc(collection(db, 'users', currentUid!, 'activityLogs'), {
              text: `[발주삭제] ${myName}님이 ${req.siteName} 현장의 발주 건을 삭제했습니다.`,
              createdAt: serverTimestamp(),
              type: 'order_delete'
          });
          alert("삭제되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { alert("오류 발생"); }
  };

  const handleApprove = async (req: OrderRequest) => {
      if (!currentUid) return;
      if (req.status === 'pending') {
          if (!canManage) return alert("권한이 없습니다.");
          if (!confirm("1차 승인 하시겠습니까?")) return;
          try {
              await updateDoc(doc(db, 'users', currentUid, 'ORDER_REQUESTS', req.id), { status: 'pending_payment' });
              alert("1차 승인 완료.");
              fetchRequests(currentUid);
          } catch(e) { alert("오류 발생"); }
      } else if (req.status === 'pending_payment') {
          if (req.type === 'tax_invoice') {
              if (!req.linkedInvoiceId) return alert("세금계산서를 먼저 연결해주세요.");
              if (!confirm("최종 완료 처리 하시겠습니까?")) return;
              try {
                  await updateDoc(doc(db, 'users', currentUid, 'ORDER_REQUESTS', req.id), { status: 'approved' });
                  const invoiceRef = doc(db, 'users', currentUid, 'TAX_PURCHASE', req.linkedInvoiceId);
                  await updateDoc(invoiceRef, { siteId: req.siteId, category1: req.category1, category2: req.category2 });
                  alert("완료되었습니다.");
                  fetchRequests(currentUid);
              } catch(e) { alert("오류 발생"); }
          } else if (req.type === 'online') {
              const inputAmount = prompt("최종 구매 금액을 입력해주세요.", req.amount?.toString() || "0");
              if (inputAmount === null) return;
              const finalAmount = parseInt(inputAmount.replace(/,/g, ''), 10);
              if (isNaN(finalAmount)) return;
              if (!confirm("완료하시겠습니까?")) return;
              try {
                  await addDoc(collection(db, 'users', currentUid, 'expenses'), {
                      siteId: req.siteId, siteName: req.siteName, useDate: new Date().toISOString().split('T')[0],
                      category: req.category1, subCategory: req.category2, vendorName: req.vendorName || '인터넷구매',
                      amount: finalAmount, memo: `[발주요청] ${req.memo} (구매자: ${myName})`, cardName: '법인카드',
                      createdAt: serverTimestamp(), type: '지출'
                  });
                  await updateDoc(doc(db, 'users', currentUid, 'ORDER_REQUESTS', req.id), { status: 'approved', amount: finalAmount });
                  alert("완료되었습니다.");
                  fetchRequests(currentUid);
              } catch(e) { alert("오류 발생"); }
          }
      }
  };

  const handleLinkComplete = async (invoiceId: string) => {
      if (!linkTargetRequest || !currentUid) return;
      try {
          const invoiceRef = doc(db, 'users', currentUid, 'TAX_PURCHASE', invoiceId);
          const invoiceSnap = await getDoc(invoiceRef);
          if (invoiceSnap.exists() && (invoiceSnap.data().siteId || invoiceSnap.data().category1)) {
              alert("이미 연결된 세금계산서입니다.");
              return;
          }
          await updateDoc(doc(db, 'users', currentUid, 'ORDER_REQUESTS', linkTargetRequest.id), { linkedInvoiceId: invoiceId });
          await updateDoc(invoiceRef, { siteId: linkTargetRequest.siteId, category1: linkTargetRequest.category1, category2: linkTargetRequest.category2 });
          alert("연결되었습니다.");
          setLinkTargetRequest(null);
          fetchRequests(currentUid);
      } catch(e) { alert("연결 실패"); }
  };

  const renderSecretCell = (req: OrderRequest, content: React.ReactNode) => {
      if (canManage) return content;
      if (req.status === 'pending_payment' || req.status === 'approved') return content;
      return <span className="order-request-secret-mask">🔒 승인 대기 (비공개)</span>;
  };

  const getStatusText = (status: string) => {
      switch(status) {
          case 'pending': return '승인대기';
          case 'pending_payment': return '결제/구매대기';
          case 'approved': return '완료됨';
          case 'rejected': return '부결';
          default: return status;
      }
  };

  return (
    <div className="order-request-page-container">
        {/* 헤더 */}
        <div className="order-request-header-wrapper">
            <div className="order-request-title">
                <h2>현장별 발주 요청 관리</h2>
                <p>현장 자재/물품 발주 요청을 승인하고 세금계산서를 연결합니다.</p>
            </div>
            
            <div className="order-request-control-panel">
                 <div className="order-request-filter-row">
                    <span className="order-request-info-text">
                        ℹ️ 승인 프로세스: 승인대기 → 1차승인(구매진행) → 최종완료(지출등록)
                    </span>
                    
                    {isOwner && (
                        <button className="order-request-btn-manual" onClick={() => setIsPermissionModalOpen(true)}>
                            🔐 권한 설정
                        </button>
                    )}
                    
                    <button className="order-request-btn-primary" onClick={() => currentUid && fetchRequests(currentUid)}>
                        🔄 새로고침
                    </button>
                 </div>
            </div>
        </div>

        {/* 테이블 영역 */}
        <div className="order-request-result-section">
            <div className="order-request-table-wrapper">
                <table className="order-request-table">
                    <thead>
                        <tr>
                            <th style={{width:'90px'}}>상태</th>
                            <th style={{width:'100px'}}>요청일</th>
                            <th style={{width:'120px'}}>현장명</th>
                            <th style={{width:'80px'}}>요청자</th>
                            <th style={{width:'80px'}}>구분</th>
                            <th>내역 상세</th>
                            <th style={{width:'160px', textAlign:'right'}}>금액/수량</th>
                            <th style={{width:'180px', textAlign:'center'}}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? 
                            <tr><td colSpan={8} className="order-request-loading-td">로딩 중...</td></tr> : 
                          requests.length === 0 ? 
                            <tr><td colSpan={8} className="order-request-no-data">요청 내역이 없습니다.</td></tr> :
                          requests.map((req) => (
                             <tr key={req.id}>
                                 <td style={{textAlign:'center'}}>
                                     <span className={`order-request-badge ${req.status}`}>{getStatusText(req.status)}</span>
                                 </td>
                                 <td style={{textAlign:'center'}}>{req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString() : '-'}</td>
                                 <td style={{fontWeight:'bold'}}>{req.siteName}</td>
                                 <td style={{textAlign:'center'}}>{req.requesterName}</td>
                                 <td style={{textAlign:'center'}}>
                                     <span className={`order-request-type-tag ${req.type === 'tax_invoice' ? 'tax' : 'online'}`}>
                                         {req.type === 'tax_invoice' ? '세금계산서' : '인터넷구매'}
                                     </span>
                                 </td>
                                 <td>
                                     <div className="order-request-detail-box">
                                         <div className="order-request-category-path">{req.category1} &gt; {req.category2}</div>
                                         <div>
                                             {renderSecretCell(req, (
                                                 req.type === 'tax_invoice' ? (
                                                     <>
                                                         <div className="order-request-item-text">{req.vendorName}</div>
                                                         <div className="order-request-sub-text">{req.itemDetails}</div>
                                                     </>
                                                 ) : (
                                                     <>
                                                         <div className="order-request-item-text">{req.memo}</div>
                                                         {req.link && <a href={req.link} target="_blank" rel="noreferrer" className="order-request-link-text">🔗 상품 링크</a>}
                                                     </>
                                                 )
                                             ))}
                                         </div>
                                         {req.rejectReason && <div className="order-request-reject-reason">🚫 사유: {req.rejectReason}</div>}
                                     </div>
                                 </td>
                                 <td style={{textAlign:'right'}}>
                                     {renderSecretCell(req, (
                                         req.type === 'tax_invoice' ? (
                                             <>
                                                 <div className="order-request-amount">{req.amount?.toLocaleString()} 원</div>
                                                 <div className="order-request-sub-text">{req.bankName} {req.accountNumber}</div>
                                             </>
                                         ) : (
                                             <>
                                                 <div className="order-request-amount">{req.quantity} 개</div>
                                             </>
                                         )
                                     ))}
                                 </td>
                                 <td style={{textAlign:'center'}}>
                                     <div className="order-request-action-btns">
                                         {req.status === 'pending' && canManage && (
                                             <>
                                                 <button className="order-request-btn-mini reject" onClick={() => handleReject(req)}>부결</button>
                                                 <button className="order-request-btn-mini approve" onClick={() => handleApprove(req)}>1차 승인</button>
                                             </>
                                         )}
                                         {req.status === 'pending_payment' && (
                                             <>
                                                 {req.type === 'tax_invoice' && (
                                                     <>
                                                         {/* 연결된 세금계산서가 없고 연결되지 않은 경우 부결 버튼 표시 */}
                                                         {!req.linkedInvoiceId && (
                                                             <button className="order-request-btn-mini reject" onClick={() => handleReject(req)}>부결</button>
                                                         )}
                                                         
                                                         {/* [수정] 상세 버튼 추가: 연결된 세금계산서가 있는 경우 */}
                                                         {req.linkedInvoiceId && (
                                                             <button className="order-request-btn-mini detail" onClick={() => fetchAndShowInvoice(req.linkedInvoiceId!)}>
                                                                 상세
                                                             </button>
                                                         )}

                                                         <button className={`order-request-btn-mini link ${req.linkedInvoiceId ? 'active' : ''}`} onClick={() => setLinkTargetRequest(req)}>
                                                             {req.linkedInvoiceId ? '연결됨' : '연결'}
                                                         </button>
                                                     </>
                                                 )}
                                                 <button className="order-request-btn-mini complete" onClick={() => handleApprove(req)}>최종 완료</button>
                                             </>
                                         )}
                                         {(req.status === 'approved' || req.status === 'rejected') && isOwner && (
                                             <button className="order-request-btn-mini reset" onClick={() => handleReset(req)}>↺ 초기화</button>
                                         )}
                                         {canManage && (
                                             <button className="order-request-btn-icon-del" onClick={() => handleDelete(req)}>🗑️</button>
                                         )}
                                     </div>
                                 </td>
                             </tr>
                          ))
                        }
                    </tbody>
                </table>
            </div>
        </div>

        {linkTargetRequest && currentUid && (
            <InvoiceSelectModal 
                partnerUid={currentUid} 
                targetAmount={linkTargetRequest.amount || 0} 
                onClose={() => setLinkTargetRequest(null)} 
                onSelect={handleLinkComplete} 
            />
        )}
        
        {isPermissionModalOpen && currentUid && <OrderPermissionModal partnerUid={currentUid} onClose={() => setIsPermissionModalOpen(false)} />}
        
        {/* [추가] 세금계산서 상세 팝업 렌더링 */}
        {selectedInvoiceItem && (
            <TaxInvoiceDetailModal item={selectedInvoiceItem} onClose={() => setSelectedInvoiceItem(null)} />
        )}
    </div>
  );
};

// --- [추가] 세금계산서 상세 모달 컴포넌트 (통합 관리 페이지에서 복사) ---
const TaxInvoiceDetailModal: React.FC<{ item: UnifiedItem, onClose: () => void }> = ({ item, onClose }) => {
    const d = item.originalData;
    // 발주 요청은 주로 매입이므로 파란색 테마 기본 적용 (필요시 item.inOut 로직 사용 가능)
    const themeClass = 'aip-theme-blue'; 

    return (
        <div className="aip-modal-overlay" onClick={onClose}>
            <div className={`aip-modal-paper ${themeClass}`} onClick={e => e.stopPropagation()} style={{maxWidth:'720px'}}>
                <div className="aip-modal-header">
                    <h2 className="aip-modal-title">전자세금계산서 상세</h2>
                    <button onClick={onClose} style={{border:'none', background:'none', cursor:'pointer'}}><X size={24} /></button>
                </div>
                <div className="aip-modal-body">
                    <div style={{display:'flex', gap:'20px', flexDirection: 'column'}}>
                        <table className="aip-invoice-table">
                            <tbody>
                                <tr><th rowSpan={4} style={{width:'40px', textAlign:'center'}}>공급자</th><th>등록번호</th><td>{d.vendorRegNo}</td></tr>
                                <tr><th>상호</th><td>{d.vendorName}</td></tr>
                                <tr><th>성명</th><td>{d.vendorCeo}</td></tr>
                                <tr><th>주소</th><td>{d.vendorAddr}</td></tr>
                            </tbody>
                        </table>
                        <table className="aip-invoice-table">
                            <tbody>
                                <tr><th rowSpan={4} style={{width:'40px', textAlign:'center'}}>받는자</th><th>등록번호</th><td>{d.buyerRegNo}</td></tr>
                                <tr><th>상호</th><td>{d.buyerName}</td></tr>
                                <tr><th>성명</th><td>{d.buyerCeo}</td></tr>
                                <tr><th>주소</th><td>{d.buyerAddr}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <table className="aip-invoice-table" style={{marginTop:'20px'}}>
                        <thead><tr><th>작성일</th><th>품목</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th></tr></thead>
                        <tbody>
                            {d.items && d.items.length > 0 ? d.items.map((it: any, i: number) => (
                                <tr key={i}>
                                    <td className="aip-text-center">{it.date}</td>
                                    <td>{it.itemName}</td>
                                    <td className="aip-text-right">{it.qty}</td>
                                    <td className="aip-text-right">{Number(it.unitPrice).toLocaleString()}</td>
                                    <td className="aip-text-right">{Number(it.supplyAmount).toLocaleString()}</td>
                                    <td className="aip-text-right">{Number(it.taxAmount).toLocaleString()}</td>
                                </tr>
                            )) : <tr><td colSpan={6} className="aip-text-center">상세 품목 없음</td></tr>}
                        </tbody>
                        <tfoot>
                            <tr style={{background:'#f2f4f6', fontWeight:'bold'}}>
                                <td colSpan={4} className="aip-text-center">합계</td>
                                <td className="aip-text-right">{Number(d.supplyAmount).toLocaleString()}</td>
                                <td className="aip-text-right">{Number(d.taxAmount).toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style={{marginTop:'10px', fontSize:'14px', textAlign:'right'}}>
                        <strong>총 합계금액: </strong> <span style={{fontSize:'18px', color:'#333'}}>{Number(d.totalAmount).toLocaleString()}원</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountingOrderRequestPage;