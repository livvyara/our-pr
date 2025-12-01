import React, { useState, useEffect } from 'react';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, query, where } from 'firebase/firestore';
import { K_BRAND_COLOR } from '../../constants';
import './OrderRequestPage.css';

interface Props {
  partnerUid: string;
  onClose: () => void;
}

const OrderPermissionModal: React.FC<Props> = ({ partnerUid, onClose }) => {
  const db = getFirestore();
  const [employees, setEmployees] = useState<any[]>([]);
  const [allowedUids, setAllowedUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
        try {
            // 1. 직원 목록 불러오기 (users 컬렉션에서 partnerInfo.ownerUid가 현재 파트너인 사람 검색)
            // (주의: 인덱스가 필요할 수 있음. 콘솔 확인)
             const q = query(collection(db, 'users'), where('partnerInfo.ownerUid', '==', partnerUid));
             const empSnap = await getDocs(q);
             
             const empList: any[] = [];
             empSnap.forEach(d => {
                 const data = d.data();
                 // 자기 자신(대표)은 제외
                 if (d.id !== partnerUid) {
                     empList.push({ id: d.id, name: data.name || data.nickname || d.id, email: data.email });
                 }
             });
             
             setEmployees(empList);

             // 2. 현재 권한 설정 불러오기
             const permSnap = await getDoc(doc(db, 'users', partnerUid, 'settings', 'order_permissions'));
             if (permSnap.exists()) {
                 setAllowedUids(new Set(permSnap.data().uids || []));
             }
        } catch (e) { 
            console.error(e); 
        } finally { setLoading(false); }
    };
    init();
  }, [partnerUid, db]);

  const togglePermission = (uid: string) => {
      const newSet = new Set(allowedUids);
      if (newSet.has(uid)) newSet.delete(uid);
      else newSet.add(uid);
      setAllowedUids(newSet);
  };

  const handleSave = async () => {
      try {
          await setDoc(doc(db, 'users', partnerUid, 'settings', 'order_permissions'), {
              uids: Array.from(allowedUids)
          });
          alert("권한이 저장되었습니다.");
          onClose();
      } catch (e) { alert("저장 실패"); }
  };

  return (
    <div className="ord-modal-overlay">
        <div className="ord-modal-content" style={{width:'400px'}}>
            <div className="ord-header">
                <h3>결제 승인 권한 설정</h3>
                <button className="ord-close-btn" onClick={onClose}>×</button>
            </div>
            <div className="ord-body">
                <p style={{fontSize:'13px', color:'#666', marginBottom:'15px'}}>
                    체크된 직원은 <strong>[승인 대기]</strong> 상태인 발주 건의<br/>
                    상세 정보를 열람하고 <strong>결제 승인</strong>을 할 수 있습니다.
                </p>
                <div className="perm-list">
                    {loading ? <p>로딩 중...</p> : employees.length === 0 ? <p style={{textAlign:'center', padding:'20px', color:'#999'}}>등록된 직원이 없습니다.</p> : 
                     employees.map(emp => (
                         <label key={emp.id} className="perm-item">
                             <input 
                                type="checkbox" 
                                checked={allowedUids.has(emp.id)} 
                                onChange={() => togglePermission(emp.id)}
                             />
                             <div style={{marginLeft:'10px'}}>
                                <div className="name">{emp.name}</div>
                                <div className="email">{emp.email}</div>
                             </div>
                         </label>
                     ))
                    }
                </div>
            </div>
            <div className="ord-footer">
                <button className="ord-btn-cancel" onClick={onClose}>취소</button>
                <button className="ord-btn-save" onClick={handleSave} style={{backgroundColor: K_BRAND_COLOR}}>저장</button>
            </div>
        </div>
    </div>
  );
};

export default OrderPermissionModal;