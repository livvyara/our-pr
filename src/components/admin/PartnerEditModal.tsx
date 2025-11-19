// src/components/admin/PartnerEditModal.tsx

import React, { useState, useEffect } from 'react';
import { getFirestore, doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './PartnerManagementTab.css'; // 공통 스타일
import './PartnerEditModal.css'; // [⭐ 추가] 전용 스타일 임포트

interface PartnerEditModalProps {
  partnerUid: string;
  onClose: (refresh: boolean) => void;
}

// 새로운 역할(Role) 옵션 정의
const ROLE_OPTIONS = [
  { value: 'partner', label: '파트너 (정회원)' },
  { value: 'customer', label: '고객 (일반 회원)' },
  { value: 'seller', label: '판매자' },
  { value: 'contract', label: '계약자' },
];

const PartnerEditModal: React.FC<PartnerEditModalProps> = ({ partnerUid, onClose }) => {
  const db = getFirestore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    companyName: '',
    ceoName: '',
    businessNumber: '',
    contactPhone: '',
    email: '',
    role: '',
  });

  // 1. 파트너 정보 불러오기
  useEffect(() => {
    const fetchPartner = async () => {
      try {
        const docRef = doc(db, 'users', partnerUid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            companyName: data.partnerInfo?.companyName || data.companyName || '',
            ceoName: data.partnerInfo?.ceoName || data.name || '',
            businessNumber: data.partnerInfo?.businessNumber || '',
            contactPhone: data.partnerInfo?.contactPhone || data.phone || '',
            email: data.email || '',
            role: data.role || 'customer', 
          });
        } else {
          alert('사용자 정보를 찾을 수 없습니다.');
          onClose(false);
        }
      } catch (error) {
        console.error("로드 실패:", error);
        alert('데이터를 불러오는 중 오류가 발생했습니다.');
        onClose(false);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPartner();
  }, [partnerUid, db, onClose]);

  // 2. 입력 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 3. 저장 핸들러 (로그 기록 포함)
  const handleSave = async () => {
    if (!window.confirm('파트너 정보를 수정하시겠습니까?')) return;
    setIsSaving(true);

    try {
      const adminUser = auth.currentUser;
      
      const userRef = doc(db, 'users', partnerUid);
      await updateDoc(userRef, {
        role: formData.role,
        "partnerInfo.companyName": formData.companyName,
        "partnerInfo.ceoName": formData.ceoName,
        "partnerInfo.businessNumber": formData.businessNumber,
        "partnerInfo.contactPhone": formData.contactPhone,
        companyName: formData.companyName,
        phone: formData.contactPhone
      });

      const logMessage = `[관리자 수정] 관리자(${adminUser?.displayName || 'Admin'})가 파트너 [${formData.companyName}]의 정보 및 등급을 수정했습니다. (등급: ${formData.role})`;

      await addDoc(collection(db, 'adminActivityLogs'), {
        message: logMessage,
        adminUid: adminUser?.uid,
        adminNickname: adminUser?.displayName || '관리자',
        targetUid: partnerUid,
        timestamp: serverTimestamp(),
        type: '정보수정'
      });

      await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
        type: '정보수정',
        content: `관리자에 의해 정보 및 등급이 변경되었습니다.`,
        createdAt: serverTimestamp(),
        isRead: false
      });

      alert('수정되었습니다.');
      onClose(true);

    } catch (error) {
      console.error("수정 실패:", error);
      alert('수정 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return null;

  // --- JSX 렌더링 ---
  return (
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div className="sort-modal-content" style={{ width: '400px' }} onClick={(e) => e.stopPropagation()}>
        <h3>파트너 정보 수정</h3>
        
        {/* [⭐ 수정] FieldRow 제거 후 인라인 레이아웃 적용 */}
        <div className="modal-body-padding">
          
          {/* 이메일 (ID) */}
          <div className="form-row-align">
            <label className="form-label-fixed">이메일 (ID)</label>
            <div className="form-input-control">
              <input type="text" value={formData.email} disabled className="admin-input-style" />
            </div>
          </div>

          {/* 회원 등급 (Role) */}
          <div className="form-row-align">
            <label className="form-label-fixed" style={{ color:'#28a745' }}>회원 등급</label>
            <div className="form-input-control">
              <select 
                name="role" 
                value={formData.role} 
                onChange={handleChange}
                className="admin-input-style"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
                {!ROLE_OPTIONS.some(opt => opt.value === formData.role) && formData.role && (
                   <option value={formData.role} disabled>현재 등급: {formData.role}</option>
                )}
              </select>
            </div>
          </div>

          {/* 상호명 */}
          <div className="form-row-align">
            <label className="form-label-fixed">상호명</label>
            <div className="form-input-control">
              <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} className="admin-input-style" />
            </div>
          </div>

          {/* 대표자명 */}
          <div className="form-row-align">
            <label className="form-label-fixed">대표자명</label>
            <div className="form-input-control">
              <input type="text" name="ceoName" value={formData.ceoName} onChange={handleChange} className="admin-input-style" />
            </div>
          </div>

          {/* 사업자번호 */}
          <div className="form-row-align">
            <label className="form-label-fixed">사업자번호</label>
            <div className="form-input-control">
              <input type="text" name="businessNumber" value={formData.businessNumber} onChange={handleChange} className="admin-input-style" />
            </div>
          </div>

          {/* 연락처 */}
          <div className="form-row-align">
            <label className="form-label-fixed">연락처</label>
            <div className="form-input-control">
              <input type="text" name="contactPhone" value={formData.contactPhone} onChange={handleChange} className="admin-input-style" />
            </div>
          </div>
        </div>
        {/* [⭐ 수정 끝] */}

        <div className="modal-footer" style={{marginTop:'20px'}}>
          <button className="btn-close" onClick={() => onClose(false)}>취소</button>
          <button className="btn-save" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : '수정 저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PartnerEditModal;