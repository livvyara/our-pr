// src/components/admin/SupporterApplicationDetailModal.tsx

import React, { useState, useEffect, type ChangeEvent } from 'react';
import { getFirestore, doc, updateDoc, writeBatch, getDoc, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore'; 
import { auth, functions } from '../../firebase-config'; 
import { getStorage, ref, listAll, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import './SupporterApplicationDetailModal.css'; // [수정] .css 파일 임포트

// (서포터 신청서 데이터 타입 - 파트너/셀러와 동일하다고 가정)
interface LogEntry { timestamp: Timestamp; log: string; }
interface ApplicationData {
  uid: string; // 문서 ID
  userId: string; // 신청한 유저의 UID
  companyName: string;
  ceoName: string;
  businessNumber: string;
  city: string;
  district: string;
  addressDetail: string;
  contactName: string;
  contactPhone: string;
  file1Url: string; 
  file2Url: string | null;
  changeHistory?: LogEntry[]; 
}

// (편집 중인 데이터 타입 - 파트너/셀러와 동일하다고 가정)
interface EditData {
  companyName: string;
  ceoName: string;
  businessNumber: string;
  city: string;
  district: string;
  addressDetail: string;
  contactName: string;
  contactPhone: string;
}

// (필드 한글명 맵 - 파트너/셀러와 동일하다고 가정)
const FIELD_NAMES: Record<keyof EditData, string> = {
  companyName: "상호명",
  ceoName: "대표자명",
  businessNumber: "사업자 등록번호",
  city: "시/도",
  district: "시/군/구",
  addressDetail: "상세주소",
  contactName: "담당자명",
  contactPhone: "연락처",
};

// (로그 포맷 함수 - 동일)
const formatLogTimestamp = (ts: Timestamp): string => {
  const d = ts.toDate();
  const Y = d.getFullYear().toString().slice(-2);
  const M = (d.getMonth() + 1).toString().padStart(2, '0');
  const D = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
};

interface ModalProps {
  application: ApplicationData;
  onClose: (refresh: boolean) => void; 
}

const SupporterApplicationDetailModal: React.FC<ModalProps> = ({ application, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 
  const [rejectionReason, setRejectionReason] = useState('');
  const db = getFirestore();
  const storage = getStorage();

  // (편집 가능한 데이터 state - 동일)
  const [editData, setEditData] = useState<EditData>({
    companyName: application.companyName,
    ceoName: application.ceoName,
    businessNumber: application.businessNumber,
    city: application.city,
    district: application.district,
    addressDetail: application.addressDetail,
    contactName: application.contactName,
    contactPhone: application.contactPhone,
  });

  // (변경 로그 state - 동일)
  const [changeHistory, setChangeHistory] = useState<LogEntry[]>([]);
  useEffect(() => {
    const sortedHistory = (application.changeHistory || []).sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
    setChangeHistory(sortedHistory);
  }, [application.changeHistory]);

  // (폼 입력 핸들러 - 동일)
  const handleEditChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditData({
      ...editData,
      [e.target.name]: e.target.value,
    });
  };

  // ["변경 사항 저장" 로직 - 동일 (컬렉션 이름 변경)]
  const handleSaveChanges = async () => {
    const adminUser = auth.currentUser;
    if (!adminUser) { /* ... */ return; }
    setIsSaving(true);
    const newLogs: object[] = []; 
    const logStrings: string[] = []; 
    const timestamp = Timestamp.now(); 
    try {
      // (관리자 정보 가져오기)
      const adminDocRef = doc(db, 'users', adminUser.uid);
      const adminDocSnap = await getDoc(adminDocRef);
      const adminData = adminDocSnap.data();
      const logPrefix = `(${(adminData?.role || 'admin').toUpperCase()})${adminData?.name}(${adminData?.nickname})`;
      const formattedTimestamp = formatLogTimestamp(timestamp); 

      // (변경된 필드 비교)
      (Object.keys(FIELD_NAMES) as Array<keyof EditData>).forEach(key => {
        if (key in application && application[key as keyof ApplicationData] !== editData[key]) {
          const fieldName = FIELD_NAMES[key];
          const oldVal = application[key as keyof ApplicationData];
          const newVal = editData[key];
          const log = `${formattedTimestamp} ${logPrefix}이(가) ${fieldName}을(를) '${oldVal}'에서 '${newVal}'(으)로 변경했습니다.`;
          logStrings.push(log);
          newLogs.push({ log: log, adminUid: adminUser.uid, timestamp: timestamp });
        }
      });
      if (newLogs.length === 0) { /* ... (변경된 사항 없음) ... */ }

      // [⭐ 수정] 'supporterApplications' 컬렉션에 저장
      const appDocRef = doc(db, 'supporterApplications', application.uid);
      await updateDoc(appDocRef, {
        ...editData,
        changeHistory: arrayUnion(...newLogs),
      });

      alert(`변경 사항이 저장되었습니다.\n- ${logStrings.join("\n- ")}`);
      onClose(true); 

    } catch (error) {
      alert('변경 사항 저장 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };


  // [⭐ 2. 수정] '승인' 버튼 로직 (Cloud Function 이름, role, info 필드명 변경)
  const handleApprove = async () => {
    if (!window.confirm("정말로 이 신청을 '승인'하시겠습니까? 해당 회원의 등급이 'contract'로 변경됩니다.")) {
      return;
    }
    setIsLoading(true);
    try {
      // [수정] 'approveSupporterApplication' 호출 (다음 단계에서 생성)
      const approveFunction = httpsCallable(functions, 'approveSupporterApplication');
      
      // [수정] 'users' 문서에 저장할 contractInfo 데이터 준비
      const contractInfoData = {
          ...editData, 
          file1Url: application.file1Url,
          file2Url: application.file2Url,
      };

      // 3. Cloud Function에 데이터 전송
      await approveFunction({
        applicationId: application.uid,
        userId: application.userId,
        contactPhone: editData.contactPhone, 
        applicationData: contractInfoData, // [수정]
      });
      
      alert('승인 처리 및 문자 발송이 완료되었습니다.');
      onClose(true); 

    } catch (error: any) {
      alert(`승인 처리 중 오류가 발생했습니다: ${error.message}`);
      console.error(error);
      setIsLoading(false);
    }
  };

  // [⭐ 3. 수정] '부결' 버튼 로직 (Cloud Function 이름, Storage 경로 변경)
  const handleReject = async () => {
    if (!rejectionReason) { /* ... */ return; }
    if (!window.confirm("정말로 이 신청을 '부결'하시겠습니까? 신청자가 첨부한 파일이 모두 삭제됩니다.")) {
      return;
    }
    setIsLoading(true);
    try {
      // 1. Storage 파일 삭제 (서포터 경로)
      const folderRef = ref(storage, `supporter-applications/${application.userId}`);
      const fileList = await listAll(folderRef);
      const deletePromises = fileList.items.map(fileRef => deleteObject(fileRef));
      await Promise.all(deletePromises);
      
      // 2. Cloud Function('rejectSupporterApplication') 호출 (다음 단계에서 생성)
      const rejectFunction = httpsCallable(functions, 'rejectSupporterApplication');
      
      await rejectFunction({
        applicationId: application.uid,
        contactPhone: editData.contactPhone, 
        rejectionReason: rejectionReason, 
      });

      alert('부결 처리가 완료되었으며, 첨부파일 삭제 및 문자 발송이 완료되었습니다.');
      onClose(true); 

    } catch (error: any) {
      // ... (오류 처리)
    }
  };


  return (
    // [⭐ 4. 수정] JSX 렌더링 (동일한 UI 재사용)
    <div className="modal-overlay" onClick={() => onClose(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>서포터(협력사) 신청 상세 정보 (편집 가능)</h3>
        
        {/* [JSX 폼] */}
        <div className="application-details">
          <label htmlFor="companyName" className="detail-label">상호명</label>
          <input id="companyName" name="companyName" className="modal-input" value={editData.companyName} onChange={handleEditChange} />
          {/* ... (대표자명, 사업자번호 등 나머지 input 필드 동일) ... */}
          <label htmlFor="contactPhone" className="detail-label">연락처</label>
          <input id="contactPhone" name="contactPhone" className="modal-input" value={editData.contactPhone} onChange={handleEditChange} />

          <span className="detail-label">사업자 등록증 (필수)</span>
          <span className="detail-value">
            <a href={application.file1Url} target="_blank" rel="noopener noreferrer" className="detail-file-link">
              파일 보기/다운로드
            </a>
          </span>
          <span className="detail-label">포트폴리오 (가정)</span>
          <span className="detail-value">
            {application.file2Url ? (
              <a href={application.file2Url} target="_blank" rel="noopener noreferrer" className="detail-file-link">
                파일 보기/다운로드
              </a>
            ) : (
              <span className="detail-file-link optional">미첨부</span>
            )}
          </span>
        </div>

        {/* --- 처리 영역 --- */}
        <div className="processing-section">
          <label htmlFor="rejectionReason" style={{ fontWeight: 'bold' }}>
            부결 사유 (부결 시 필수 입력)
          </label>
          <textarea
            id="rejectionReason"
            className="rejection-reason"
            placeholder="부결 처리 시 사유를 입력하세요."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            disabled={isLoading || isSaving}
          />
          <div className="modal-actions">
            <button className="modal-button btn-cancel" onClick={() => onClose(false)} disabled={isLoading || isSaving}>
              취소
            </button>
            <button
              className="modal-button btn-save-changes"
              onClick={handleSaveChanges}
              disabled={isLoading || isSaving}
            >
              {isSaving ? '저장 중...' : '변경 사항 저장'}
            </button>
            <button 
              className="modal-button btn-reject" 
              onClick={handleReject}
              disabled={isLoading || isSaving || !rejectionReason} 
            >
              부결
            </button>
            <button 
              className="modal-button btn-approve" 
              onClick={handleApprove} 
              disabled={isLoading || isSaving}
            >
              승인
            </button>
          </div>
        </div>
        
        {/* [변경 로그 표시] */}
        {changeHistory.length > 0 && (
          <div className="log-section">
            <h4>신청서 변경 기록 (최신순)</h4>
            <ul className="log-list">
              {changeHistory.map((entry, index) => (
                <li key={index} className="log-entry">
                  {entry.log}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupporterApplicationDetailModal;